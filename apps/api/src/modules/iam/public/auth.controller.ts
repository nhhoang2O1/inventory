import { BadRequestException,Body,Controller,Headers,HttpCode,HttpStatus,Post,Req,Res } from '@nestjs/common';
import { AuthService } from './auth.service.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function id(value:string|undefined,name:string){if(!value||!uuid.test(value))throw new BadRequestException(`${name} must be UUID`);return value;}
function cookieToken(value:string|undefined){return value?.split(';').map((part)=>part.trim()).find((part)=>part.startsWith('wms_session='))?.slice('wms_session='.length);}

@Controller('iam/auth')
export class AuthController{
  constructor(private readonly service:AuthService){}

  @Post('register')
  register(@Headers('x-actor-id')actor:string|undefined,@Req()request:{correlationId?:string},
    @Body()body:{username:string;displayName:string;email?:string|null;roleCode:string;password:string}){
    return this.service.register(id(actor,'actorId'),body,id(request.correlationId,'correlationId'));
  }

  @Post('login') @HttpCode(HttpStatus.OK)
  async login(@Req()request:{correlationId?:string},@Res({passthrough:true})response:{cookie(name:string,value:string,options:Record<string,unknown>):void},
    @Body()body:{username?:string;password?:string}){
    const result=await this.service.login(body.username??'',body.password??'',id(request.correlationId,'correlationId'));
    const configuredDuration=Number(process.env.AUTH_SESSION_MINUTES??15);
    const duration=Number.isFinite(configuredDuration)?Math.min(Math.max(configuredDuration,5),480):15;
    response.cookie('wms_session',result.sessionToken,{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',
      maxAge:duration*60_000,path:'/'});
    const {sessionToken:_,...safe}=result;return safe;
  }

  @Post('logout') @HttpCode(HttpStatus.OK)
  async logout(@Headers('x-actor-id')actor:string|undefined,@Headers('authorization')authorization:string|undefined,
    @Headers('cookie')cookie:string|undefined,@Req()request:{correlationId?:string},
    @Res({passthrough:true})response:{clearCookie(name:string,options:Record<string,unknown>):void}){
    const token=authorization?.replace(/^Bearer\s+/i,'')||cookieToken(cookie);
    if(!token)throw new BadRequestException('Active session is required');
    const result=await this.service.logout(token,id(actor,'actorId'),id(request.correlationId,'correlationId'));
    response.clearCookie('wms_session',{path:'/'});return result;
  }
}
