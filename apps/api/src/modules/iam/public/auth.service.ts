import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, UnauthorizedException
} from '@nestjs/common';
import { IamDatabaseService } from './iam-database.service.js';

interface LoginUser {
  id:string; username:string; display_name:string; password_hash:string|null; status:string;
  role_code:string; role_name:string;
}

const sessionHash=(token:string)=>createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  constructor(private readonly db:IamDatabaseService){}

  hashPassword(password:string):string {
    const salt=randomBytes(16).toString('hex');
    return `${salt}:${pbkdf2Sync(password,salt,100_000,64,'sha512').toString('hex')}`;
  }

  verifyPassword(password:string,storedHash:string):boolean {
    const [salt,expectedHex]=storedHash.split(':');
    if(!salt||!expectedHex||!/^[0-9a-f]{128}$/i.test(expectedHex))return false;
    const expected=Buffer.from(expectedHex,'hex');
    const actual=pbkdf2Sync(password,salt,100_000,64,'sha512');
    return expected.length===actual.length&&timingSafeEqual(expected,actual);
  }

  async register(actorId:string,input:{username:string;displayName:string;email?:string|null;roleCode:string;password:string},correlationId:string){
    const username=input.username?.trim().toLowerCase(),displayName=input.displayName?.trim(),email=input.email?.trim().toLowerCase()||null;
    if(!username||!/^[a-z0-9._-]{3,64}$/.test(username))throw new BadRequestException('Username must contain 3-64 safe characters');
    if(!displayName)throw new BadRequestException('Display name is required');
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new BadRequestException('Invalid email');
    if(!input.password||input.password.length<12||!/[A-Za-z]/.test(input.password)||!/\d/.test(input.password)) {
      throw new BadRequestException('Password must contain at least 12 characters, a letter and a number');
    }
    return this.db.transaction(async(client)=>{
      if(!await this.db.hasPermission(actorId,'IAM.USER_MANAGE',client))throw new ForbiddenException('IAM.USER_MANAGE is required');
      const role=await client.query<{id:string}>(`SELECT id FROM iam.role WHERE code=$1 AND status='ACTIVE'`,[input.roleCode.trim().toUpperCase()]);
      if(!role.rows[0])throw new BadRequestException('Active role not found');
      try{
        const inserted=await client.query<{id:string}>(`INSERT INTO iam.app_user
          (username,display_name,email,role_id,password_hash,status) VALUES($1,$2,$3,$4,$5,'ACTIVE') RETURNING id`,
        [username,displayName,email,role.rows[0].id,this.hashPassword(input.password)]);
        const userId=inserted.rows[0]?.id;if(!userId)throw new Error('Failed to create user');
        await client.query(`INSERT INTO audit.audit_event
          (actor_id,action,resource_type,resource_id,correlation_id,after_data)
          VALUES($1,'CREATE','IAM_USER',$2,$3,$4::jsonb)`,
        [actorId,userId,correlationId,JSON.stringify({username,roleCode:input.roleCode.trim().toUpperCase()})]);
        return{userId,username,displayName,roleCode:input.roleCode.trim().toUpperCase()};
      }catch(error){if(error instanceof Error&&error.message.includes('unique constraint'))throw new BadRequestException('Username or email already exists');throw error;}
    });
  }

  async login(usernameInput:string,password:string,correlationId:string){
    const username=usernameInput?.trim().toLowerCase();
    if(!username||!password)throw new UnauthorizedException('Invalid username or password');
    const recent=await this.db.query<{count:string}>(`SELECT count(*)::text count FROM iam.auth_login_attempt
      WHERE username=$1 AND outcome IN('FAILED','THROTTLED') AND occurred_at>now()-interval '15 minutes'`,[username]);
    if(Number(recent[0]?.count??0)>=5){
      await this.db.query(`INSERT INTO iam.auth_login_attempt(username,outcome,correlation_id) VALUES($1,'THROTTLED',$2)`,[username,correlationId]);
      throw new HttpException('Too many failed login attempts; retry after 15 minutes',HttpStatus.TOO_MANY_REQUESTS);
    }
    const users=await this.db.query<LoginUser>(`SELECT user_account.id,user_account.username,user_account.display_name,
      user_account.password_hash,user_account.status,role.code role_code,role.name role_name
      FROM iam.app_user user_account JOIN iam.role role ON role.id=user_account.role_id
      WHERE user_account.username=$1`,[username]);
    const user=users[0];
    if(!user||user.status!=='ACTIVE'||!user.password_hash||!this.verifyPassword(password,user.password_hash)){
      await this.db.transaction(async(client)=>{
        await client.query(`INSERT INTO iam.auth_login_attempt(username,user_id,outcome,correlation_id)
          VALUES($1,$2,'FAILED',$3)`,[username,user?.id??null,correlationId]);
        await client.query(`INSERT INTO audit.audit_event(actor_id,action,resource_type,resource_id,correlation_id,after_data)
          VALUES($1,'LOGIN_FAILED','AUTHENTICATION',$2,$3,$4::jsonb)`,
        [user?.id??null,user?.id??username,correlationId,JSON.stringify({outcome:'FAILED'})]);
      });
      throw new UnauthorizedException('Invalid username or password');
    }
    return this.db.transaction(async(client)=>{
      const token=randomBytes(32).toString('base64url');
      const configuredDuration=Number(process.env.AUTH_SESSION_MINUTES??15);
      const duration=Number.isFinite(configuredDuration)?Math.min(Math.max(configuredDuration,5),480):15;
      const session=await client.query<{expires_at:string}>(`INSERT INTO iam.auth_session
        (user_id,token_hash,correlation_id,expires_at) VALUES($1,$2,$3,now()+($4||' minutes')::interval) RETURNING expires_at`,
      [user.id,sessionHash(token),correlationId,String(duration)]);
      await client.query(`INSERT INTO iam.auth_login_attempt(username,user_id,outcome,correlation_id)
        VALUES($1,$2,'SUCCEEDED',$3)`,[username,user.id,correlationId]);
      await client.query(`INSERT INTO audit.audit_event(actor_id,action,resource_type,resource_id,correlation_id,after_data)
        VALUES($1::uuid,'LOGIN','AUTHENTICATION',$1::text,$2,$3::jsonb)`,
      [user.id,correlationId,JSON.stringify({outcome:'SUCCEEDED',sessionMinutes:duration})]);
      const scopes=await client.query<{warehouse_id:string;warehouse_name:string;warehouse_code:string}>(`
        SELECT warehouse.id warehouse_id,warehouse.name warehouse_name,warehouse.code warehouse_code
        FROM iam.user_warehouse_scope scope JOIN warehouse.warehouse warehouse ON warehouse.id=scope.warehouse_id
        WHERE scope.user_id=$1 AND scope.revoked_at IS NULL AND scope.valid_from<=now()
          AND(scope.valid_until IS NULL OR scope.valid_until>now()) AND warehouse.status='ACTIVE'
        ORDER BY warehouse.code`,[user.id]);
      const roleMap:Record<string,string>={MANAGER:'Manager',ACCOUNTANT:'Accountant',SALES:'Sales'};
      return{sessionToken:token,expiresAt:session.rows[0]?.expires_at,userId:user.id,username:user.username,
        displayName:user.display_name,userRole:roleMap[user.role_code]??'Warehouse Staff',
        warehouses:scopes.rows.map((scope)=>({id:scope.warehouse_id,name:scope.warehouse_name,code:scope.warehouse_code}))};
    });
  }

  async validateSession(token:string){
    if(!token||token.length<32)return null;
    const rows=await this.db.query<{user_id:string}>(`SELECT session.user_id FROM iam.auth_session session
      JOIN iam.app_user user_account ON user_account.id=session.user_id AND user_account.status='ACTIVE'
      WHERE session.token_hash=$1 AND session.revoked_at IS NULL AND session.expires_at>now()`,[sessionHash(token)]);
    return rows[0]??null;
  }

  async currentSession(token:string){
    const session=await this.validateSession(token);
    if(!session)throw new UnauthorizedException('Session is invalid or expired');
    const rows=await this.db.query<LoginUser>(`SELECT user_account.id,user_account.username,user_account.display_name,
      user_account.password_hash,user_account.status,role.code role_code,role.name role_name
      FROM iam.app_user user_account JOIN iam.role role ON role.id=user_account.role_id
      WHERE user_account.id=$1 AND user_account.status='ACTIVE'`,[session.user_id]);
    const user=rows[0];
    if(!user)throw new UnauthorizedException('Session user is inactive');
    const scopes=await this.db.query<{warehouse_id:string;warehouse_name:string;warehouse_code:string}>(`
      SELECT warehouse.id warehouse_id,warehouse.name warehouse_name,warehouse.code warehouse_code
      FROM iam.user_warehouse_scope scope JOIN warehouse.warehouse warehouse ON warehouse.id=scope.warehouse_id
      WHERE scope.user_id=$1 AND scope.revoked_at IS NULL AND scope.valid_from<=now()
        AND(scope.valid_until IS NULL OR scope.valid_until>now()) AND warehouse.status='ACTIVE'
      ORDER BY warehouse.code`,[user.id]);
    const roleMap:Record<string,string>={MANAGER:'Manager',ACCOUNTANT:'Accountant',SALES:'Sales'};
    return {
      userId:user.id,
      username:user.username,
      displayName:user.display_name,
      userRole:roleMap[user.role_code]??'Warehouse Staff',
      warehouses:scopes.map((scope)=>({id:scope.warehouse_id,name:scope.warehouse_name,code:scope.warehouse_code}))
    };
  }

  async logout(token:string,actorId:string,correlationId:string){
    await this.db.transaction(async(client)=>{
      await client.query(`UPDATE iam.auth_session SET revoked_at=now()
        WHERE token_hash=$1 AND user_id=$2 AND revoked_at IS NULL`,[sessionHash(token),actorId]);
      await client.query(`INSERT INTO audit.audit_event(actor_id,action,resource_type,resource_id,correlation_id,after_data)
        VALUES($1::uuid,'LOGOUT','AUTHENTICATION',$1::text,$2,'{"outcome":"SUCCEEDED"}'::jsonb)`,[actorId,correlationId]);
    });
    return{loggedOut:true};
  }
}
