import { CanActivate,ExecutionContext,Injectable,UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';

function cookieToken(value:string|undefined){return value?.split(';').map((part)=>part.trim()).find((part)=>part.startsWith('wms_session='))?.slice('wms_session='.length);}

@Injectable()
export class AuthSessionGuard implements CanActivate{
  constructor(private readonly auth:AuthService){}
  async canActivate(context:ExecutionContext){
    const request=context.switchToHttp().getRequest<{method:string;url:string;headers:Record<string,string|undefined>}>();
    if(request.method==='OPTIONS'||request.url.endsWith('/health')||request.url.endsWith('/health/ready')||request.url.endsWith('/iam/auth/login'))return true;
    const required=process.env.NODE_ENV==='production'||process.env.REQUIRE_SESSION_AUTH==='true';
    const authorization=request.headers.authorization;
    const token=authorization?.replace(/^Bearer\s+/i,'')||cookieToken(request.headers.cookie);
    if(token){
      const session=await this.auth.validateSession(token);
      if(!session)throw new UnauthorizedException('Session is invalid or expired');
      request.headers['x-actor-id']=session.user_id;return true;
    }
    if(!required&&request.headers['x-actor-id'])return true;
    throw new UnauthorizedException('Authenticated session is required');
  }
}
