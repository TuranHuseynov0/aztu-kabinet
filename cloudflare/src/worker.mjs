import timetable from '../../AzTuLms.Api/Data/timetable.json' with {type:'json'};
import {ApiError,UpstreamSession,SESSION_MS,MAX_UPLOAD,json,readPath,ownTimetable,randomId,seal,unseal} from './core.mjs';

const COOKIE='__Host-aztu_session';
const cookie=(id,age=7200)=>`${COOKIE}=${id}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
const sessionId=request=>request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
const validId=id=>/^[a-f0-9]{64}$/.test(id);
function secured(response){
 const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');headers.set('X-Frame-Options','DENY');headers.set('Strict-Transport-Security','max-age=31536000');
 return new Response(response.body,{status:response.status,headers});
}
function withCookie(response,id,age){const result=secured(response);result.headers.append('Set-Cookie',cookie(id,age));return result;}
function errorResponse(error){return json({message:error instanceof ApiError?error.message:'Sorğu yerinə yetirilmədi. Yenidən yoxla.'},error instanceof ApiError?error.status:500);}
function stub(env,id){return env.SESSIONS.get(env.SESSIONS.idFromName(id));}
export default {
 async fetch(request,env){
  try{
   const url=new URL(request.url),path=url.pathname,origin=request.headers.get('Origin');
   if(origin&&origin!==url.origin)return secured(json({message:'Bu mənbədən sorğu qəbul edilmir.'},403));
   if(path==='/health'&&['GET','HEAD'].includes(request.method))return secured(json({status:'ok',platform:'cloudflare'}));
   if(!path.startsWith('/auth/')&&!path.startsWith('/api/'))return env.ASSETS.fetch(request);
   if(!/^[a-f0-9]{64}$/.test(env.SESSION_KEY||''))return secured(json({message:'Server sessiya sazlaması tamamlanmayıb.'},503));
   const oldId=sessionId(request);
   if(path==='/auth/login'&&request.method==='POST'){
    if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))return secured(json({message:'JSON giriş məlumatı tələb olunur.'},415));
    if(Number(request.headers.get('content-length'))>12000)return secured(json({message:'Giriş məlumatı həddən böyükdür.'},413));
    const ip=request.headers.get('CF-Connecting-IP')||'local';
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip))),n=>n.toString(16).padStart(2,'0')).join('');
    const limiter=env.LOGIN_LIMITER.get(env.LOGIN_LIMITER.idFromName(digest));
    if(!(await limiter.fetch(new Request('https://internal/limit',{method:'POST'}))).ok)return secured(json({message:'Çox giriş cəhdi olub. Bir dəqiqə sonra yenidən yoxla.'},429));
    const id=randomId(),response=await stub(env,id).fetch(request);
    if(!response.ok)return secured(response);
    if(validId(oldId))await stub(env,oldId).fetch(new Request('https://internal/auth/logout',{method:'POST'})).catch(()=>{});
    return withCookie(response,id,7200);
   }
   if(path==='/auth/status'&&request.method==='GET'&&!validId(oldId))return secured(json({authenticated:false,userId:null}));
   if(path==='/auth/logout'&&request.method==='POST'&&!validId(oldId))return withCookie(json({status:'success'}),'',0);
   if(!validId(oldId))return withCookie(json({message:'Əvvəl daxil ol.'},401),'',0);
   const response=await stub(env,oldId).fetch(request);
   if(path==='/auth/logout'||response.status===401)return withCookie(response,'',0);
   return secured(response);
  }catch(error){return secured(errorResponse(error));}
 }
};

export class LmsSessionObject{
 constructor(ctx,env){
  this.ctx=ctx;this.env=env;this.data=null;this.queue=Promise.resolve();
  this.ready=ctx.blockConcurrencyWhile(async()=>{
   const record=await ctx.storage.get('session');
   if(record){try{this.data=await unseal(record,env.SESSION_KEY,ctx.id.toString());}catch{this.data=null;}}
   if(this.data&&this.data.expires<=Date.now())await this.clear();
  });
 }
 async clear(){this.data=null;await this.ctx.storage.deleteAll();await this.ctx.storage.deleteAlarm();}
 async save(){if(this.data){await this.ctx.storage.put('session',await seal(this.data,this.env.SESSION_KEY,this.ctx.id.toString()));await this.ctx.storage.setAlarm(this.data.expires);}}
 async alarm(){await this.clear();}
 async fetch(request){await this.ready;const result=this.queue.then(()=>this.dispatch(request));this.queue=result.catch(()=>{});return result;}
 async dispatch(request){
  const url=new URL(request.url),path=url.pathname;
  let session;
  try{
   if(path==='/auth/login'&&request.method==='POST'){
    // Bound a streaming request as well as trusting Content-Length.
    let size=0;const chunks=[];const reader=request.body?.getReader();if(!reader)throw new ApiError(400,'Giriş məlumatı tələb olunur.');
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>12000){await reader.cancel();throw new ApiError(413,'Giriş məlumatı həddən böyükdür.');}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
    let credentials;try{credentials=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ApiError(400,'Giriş məlumatı qəbul edilmir.');}
    const id=credentials.user_id,password=credentials.password,agent=request.headers.get('user-agent')||'';
    if(typeof id!=='string'||!id.trim()||id.length>256||typeof password!=='string'||!password.trim()||password.length>4096||!agent.trim()||agent.length>1024)throw new ApiError(400,'İstifadəçi ID, şifrə və brauzer məlumatı tələb olunur.');
    const data={userAgent:agent,cookies:[],expires:Date.now()+SESSION_MS};
    const login=new UpstreamSession(data);const result=await login.login({user_id:id.trim(),password});
    this.data=data;await this.save();return json(result);
   }
   if(this.data&&this.data.expires<=Date.now())await this.clear();
   if(path==='/auth/status'&&request.method==='GET')return json({authenticated:!!this.data,userId:this.data?.userId||null});
   if(path==='/auth/logout'&&request.method==='POST'){await this.clear();return json({status:'success'});}
   if(!this.data)throw new ApiError(401,'Sessiya bitib. Yenidən giriş et.');
   session=new UpstreamSession(this.data);
   if(path==='/api/timetable'&&request.method==='GET'){
    if(url.search)throw new ApiError(400,'Cədvəl yalnız öz hesabının qrupuna uyğun göstərilir.');
    const data=ownTimetable(timetable,await session.get('lectures'));
    if(!data)throw new ApiError(404,'Hesabının qrupu üçün cədvəl müəyyən edilmədi.');return json(data);
   }
   const download=path.match(/^\/api\/secure-download\/([^/]+)\/([^/]+)$/);
   if(download&&request.method==='GET'){
    if(url.search)throw new ApiError(400,'Fayl sorğusu qəbul edilmir.');
    let name;try{name=decodeURIComponent(download[2]);}catch{throw new ApiError(400,'Fayl adı qəbul edilmir.');}
    return await session.download(download[1],name);
   }
   const upload=path.match(/^\/api\/lectures\/([1-9]\d*)\/tasks\/([1-9]\d*)\/submit$/);
   if(upload&&['POST','DELETE'].includes(request.method)){
    if(request.headers.get('X-AzTU-Local-Request')!=='1')throw new ApiError(403,'Göndəriş başlığı tələb olunur.');
    if(request.method==='DELETE'){
     if([...url.searchParams.keys()].some(k=>k!=='file')||url.searchParams.getAll('file').length!==1)throw new ApiError(400,'Fayl nömrəsi tələb olunur.');
     return json(await session.delete(upload[1],upload[2],url.searchParams.get('file')));
    }
    if(url.search||!/^multipart\/form-data;/i.test(request.headers.get('content-type')||''))throw new ApiError(400,'Multipart fayl göndərişi tələb olunur.');
    if(Number(request.headers.get('content-length'))>MAX_UPLOAD+1048576)throw new ApiError(413,'Fayl ölçüsü həddən böyükdür.');
    let size=0;const bounded=request.body.pipeThrough(new TransformStream({transform(chunk,controller){size+=chunk.length;if(size>MAX_UPLOAD+1048576)throw new ApiError(413,'Fayl ölçüsü həddən böyükdür.');controller.enqueue(chunk);}}));
    let form;try{form=await new Response(bounded,{headers:{'Content-Type':request.headers.get('content-type')}}).formData();}catch{throw new ApiError(400,'Fayl forması qəbul edilmir və ya ölçüsü həddən böyükdür.');}
    const files=[...form.values()].filter(x=>typeof x!=='string');if(files.length!==1||form.getAll('file').length!==1)throw new ApiError(400,'file sahəsində yalnız bir fayl seç.');
    return json(await session.submit(upload[1],upload[2],form.get('file')));
   }
   if(request.method!=='GET')throw new ApiError(405,'Bu əməliyyata icazə verilmir.');
   const overview=path==='/api/student-overview'?null:path.match(/^\/api\/lectures\/([1-9]\d*)\/overview$/)?.[1];
   if(overview!==undefined){
    if(url.search)throw new ApiError(400,'Sorğu parametri qəbul edilmir.');
    const routes=overview?{syllabus:`lectures/${overview}/syllabus`,lecture_plan:`lectures/${overview}/syllabus/plan?method=1`,seminar_plan:`lectures/${overview}/syllabus/plan?method=2`,lab_plan:`lectures/${overview}/syllabus/plan?method=3`,materials:`lectures/${overview}/materials`,tasks:`lectures/${overview}/tasks`,scores:`lectures/${overview}/scores`,attendance:`lectures/${overview}/attendance-detail`}:{profile:'user-info',lectures:'lectures',attendance:'attendance',scores:'scores',tasks:'tasks',exam_results:'exam-results-all',oral_exams:'oral-exams',announcements:'announcements',notifications:'notifications'};
    const result={fetched_at:new Date().toISOString(),data:{},errors:{}};
    // Sequential requests keep within the Free plan's simultaneous connection cap.
    for(const [key,route] of Object.entries(routes)){try{result.data[key]=await session.get(route);}catch(error){if(error.status===401)throw error;result.errors[key]={status:error.status||502,message:error.message};}}
    return json(result);
   }
   return json(await session.get(readPath(url)));
  }catch(error){if(error.status===401&&this.data)await this.clear();return errorResponse(error);}
  finally{if(session?.changed&&this.data)await this.save();}
 }
}

export class LoginLimiter{
 constructor(ctx){this.ctx=ctx;}
 async fetch(){
  const allowed=await this.ctx.storage.transaction(async storage=>{
   const now=Date.now(),previous=await storage.get('window'),record=previous&&previous.until>now?previous:{until:now+60000,count:0};
   if(record.count>=30)return false;record.count++;await storage.put('window',record);await storage.setAlarm(record.until);return true;
  });return new Response(null,{status:allowed?204:429});
 }
 async alarm(){await this.ctx.storage.deleteAll();}
}
