const UPSTREAM='https://api-lms.aztu.edu.az/api/';
export const MAX_UPLOAD=20*1024*1024,MAX_DOWNLOAD=50*1024*1024,SESSION_MS=2*60*60*1000;
export class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
export const json=(value,status=200)=>Response.json(value,{status});
export function failure(status,login=false){
 const messages={401:login?'ID və ya şifrə yanlışdır, yaxud giriş əlavə sessiya tələb edir.':'Universitet sessiyası bitib.',422:'Universitet məlumatları qəbul etmədi.',403:'Universitet serveri girişi rədd etdi. Brauzer yoxlaması və ya əlavə giriş şərti tələb oluna bilər.',429:'Çox sorğu göndərilib. Bir az gözlə və yenidən yoxla.',404:'Universitet API-sində məlumat tapılmadı.',410:'Universitet bu API yolunu deaktiv edib.'};
 return new ApiError(status>=400&&status<500?status:502,messages[status]||'Universitet API-si gözlənilən cavabı qaytarmadı.');
}
export function isAllowedRead(path){
 return /^(?:lectures|profile|user-info|attendance|tasks|scores|schedule|announcements|notifications|oral-exams|exam-results-all|exam-password)$/.test(path)
 || /^(?:lectures\/[1-9][0-9]*\/(?:syllabus(?:\/plan\?method=[123]|\/topic-file\/[1-9][0-9]*)?|attendance|attendance-detail|scores|exam-results|tasks(?:\/[1-9][0-9]*)?|materials(?:\/[1-9][0-9]*)?)|(?:announcements|notifications)\/[1-9][0-9]*(?:\/data)?|scores\/[A-Za-z0-9_-]{1,40}|exam-results\/[1-9][0-9]*\/questions|employees\/[A-Za-z0-9_-]{1,80}|(?:search|search-all)\?q=(?:[A-Za-z0-9_.~-]|%[A-Fa-f0-9]{2}){1,1200}|\/teacher-evaluation\/(?:teachers|questions|my))$/.test(path);
}
export function ownAttendance(data,userId){
 if(!data||typeof data!=='object'||Array.isArray(data))throw new ApiError(502,'Davamiyyət cavabı qəbul edilmir.');
 const own=entries=>entries.filter(x=>x&&String(x.student_id)===String(userId));
 for(const group of data.attendance_groups||[])if(Array.isArray(group.students))group.students=own(group.students);
 if(Array.isArray(data.student_scores))data.student_scores=own(data.student_scores);
 if(Array.isArray(data.students))data.students=own(data.students);
 return data;
}
export function taskRoutes(data){
 if(!data||typeof data!=='object'||Array.isArray(data))throw new ApiError(502,'Tapşırıq cavabı qəbul edilmir.');
 for(const task of data.tasks||[])if(/^[1-9]\d*$/.test(String(task.subject_group_id))&&/^[1-9]\d*$/.test(String(task.id))){
  task.local_detail_path=`/api/lectures/${task.subject_group_id}/tasks/${task.id}`;task.local_submit_path=task.local_detail_path+'/submit';
 }
 return data;
}
export function ownTimetable(catalog,lectures){
 const records=Array.isArray(lectures)?lectures:lectures?.data||lectures?.results;
 if(!Array.isArray(records))return null;
 const counts=new Map();
 for(const row of records)for(const field of ['lecture_name','subject_group','group_name'])if(typeof row?.[field]==='string'){
  for(const match of row[field].toLowerCase().matchAll(/(?:^|[^a-z0-9])(\d{4}[a-z]{1,3}\d*)(?=$|[^a-z0-9])/g))if(Object.hasOwn(catalog.groups,match[1]))counts.set(match[1],(counts.get(match[1])||0)+1);
 }
 const ranked=[...counts].sort((a,b)=>b[1]-a[1]);if(!ranked.length||(ranked[1]&&ranked[0][1]===ranked[1][1]))return null;
 const group=ranked[0][0],{groups,...metadata}=catalog;return {...metadata,groups:{[group]:groups[group]}};
}
export function readPath(url){
 let path=url.pathname.slice(5);
 if(path.startsWith('teacher-evaluation/'))path='/'+path;
 if(path.endsWith('/syllabus/plan')){
  if([...url.searchParams.keys()].some(k=>k!=='method')||url.searchParams.getAll('method').length>1)throw new ApiError(400,'Sorğu parametri qəbul edilmir.');
  path+='?method='+(url.searchParams.get('method')||'1');
 }else if(path==='search'||path==='search-all'){
  const q=(url.searchParams.get('q')||'').trim();
  if(q.length<2||q.length>100||[...url.searchParams.keys()].some(k=>k!=='q')||url.searchParams.getAll('q').length!==1)throw new ApiError(400,'Axtarış parametri qəbul edilmir.');
  path+='?q='+encodeURIComponent(q);
 }else if(url.search)throw new ApiError(400,'Bu yolda sorğu parametri qəbul edilmir.');
 if(!isAllowedRead(path))throw new ApiError(404,'Bu API yolu dəstəklənmir.');return path;
}
export function mergeCookies(cookies,headers,url,now=Date.now()){
 const host=new URL(url).hostname,pathname=new URL(url).pathname;
 const setCookies=typeof headers.getSetCookie==='function'?headers.getSetCookie():typeof headers.getAll==='function'?headers.getAll('Set-Cookie'):[];
 let changed=false;
 for(const text of setCookies){
  const parts=text.split(';').map(x=>x.trim()),pair=parts.shift(),eq=pair.indexOf('=');if(eq<1)continue;
  const name=pair.slice(0,eq),value=pair.slice(eq+1);if(!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)||value.length>8192)continue;
  let domain=host,path=pathname.slice(0,pathname.lastIndexOf('/')+1)||'/',expires=null,maxAge=null,hostOnly=true;
  for(const part of parts){const i=part.indexOf('='),key=(i<0?part:part.slice(0,i)).toLowerCase(),v=i<0?'':part.slice(i+1);
   if(key==='domain'){domain=v.toLowerCase().replace(/^\./,'');hostOnly=false;}
   if(key==='path'&&v.startsWith('/'))path=v;
   if(key==='expires'){const parsed=Date.parse(v);if(Number.isFinite(parsed))expires=parsed;}
   if(key==='max-age'&&/^-?\d+$/.test(v))maxAge=Number(v);
  }
  if(host!==domain&&!host.endsWith('.'+domain))continue;
  if(domain!=='aztu.edu.az'&&!domain.endsWith('.aztu.edu.az'))continue;
  if(maxAge!==null)expires=now+maxAge*1000;
  const index=cookies.findIndex(c=>c.name===name&&c.domain===domain&&c.path===path);
  if(index>=0)cookies.splice(index,1);
  if(expires===null||expires>now)cookies.push({name,value,domain,path,expires,hostOnly});
  changed=true;
 }
 while(cookies.length>60)cookies.shift();return changed;
}
export function cookieHeader(cookies,url,now=Date.now()){
 const target=new URL(url);return cookies.filter(c=>(c.expires===null||c.expires>now)&&(target.hostname===c.domain||!c.hostOnly&&target.hostname.endsWith('.'+c.domain))&&(target.pathname===c.path||target.pathname.startsWith(c.path.endsWith('/')?c.path:c.path+'/'))).sort((a,b)=>b.path.length-a.path.length).map(c=>c.name+'='+c.value).join('; ');
}
export class UpstreamSession{
 constructor(data,{fetcher=(...args)=>globalThis.fetch(...args),now=()=>Date.now()}={}){this.data=data;this.fetcher=fetcher;this.now=now;this.changed=false;}
 async raw(path,{method='GET',body,contentType,login=false}={}){
  if(!login&&!this.data.token)throw new ApiError(401,'Əvvəl daxil ol.');
  const url=new URL(path,UPSTREAM).href,headers=new Headers({'Accept':'application/json','User-Agent':this.data.userAgent,'Origin':'https://lms.aztu.edu.az','Referer':'https://lms.aztu.edu.az/'});
  const cookie=cookieHeader(this.data.cookies,url,this.now());if(cookie)headers.set('Cookie',cookie);
  if(!login)headers.set('Authorization','Bearer '+this.data.token);
  if(contentType)headers.set('Content-Type',contentType);
  if(method!=='GET')headers.set('X-Client-Time',String(this.now()));
  let response;
  try{response=await this.fetcher(url,{method,body,headers,redirect:'manual',signal:AbortSignal.timeout(25000)});}catch(error){throw new ApiError(error.name==='TimeoutError'||error.name==='AbortError'?504:502,'Universitet API-si ilə əlaqə qurulmadı. Bir az sonra yenidən yoxla.');}
  this.changed=mergeCookies(this.data.cookies,response.headers,url,this.now())||this.changed;
  if(!response.ok){await response.body?.cancel();throw failure(response.status,login);}
  return response;
 }
 async parse(response){
  const type=response.headers.get('content-type')?.split(';')[0].trim();if(type!=='application/json'&&!type?.endsWith('+json')){await response.body?.cancel();throw failure(502);}
  try{return await response.json();}catch{throw failure(502);}
 }
 async login(credentials){
  const response=await this.raw('api-login',{method:'POST',body:JSON.stringify(credentials),contentType:'application/json',login:true});
  const data=await this.parse(response);
  if(data.status!=='success'||typeof data.token!=='string'||!data.token.trim()||data.token.length>16384||/\s/.test(data.token)||!['string','number'].includes(typeof data.user_id)||!String(data.user_id).trim())throw failure(401,true);
  this.data.token=data.token;this.data.userId=String(data.user_id);this.changed=true;
  return {status:'success',userId:this.data.userId};
 }
 async get(path){
  if(!isAllowedRead(path))throw new ApiError(400,'Bu API yolu dəstəklənmir.');
  const data=await this.parse(await this.raw(path));
  if(path.endsWith('/attendance-detail')||path.startsWith('lectures/')&&path.endsWith('/scores'))return ownAttendance(data,this.data.userId);
  if(path.endsWith('/tasks'))return taskRoutes(data);return data;
 }
 async download(category,name){
  if(!['materials','tasks','student-tasks','announcements','notifications'].includes(category)||!name||name.length>240||name==='.'||name==='..'||/[\x00-\x1f\x7f/\\:]/.test(name))throw new ApiError(400,'Fayl kateqoriyası və adı qəbul edilmir.');
  const upstream=await this.raw(`secure-download/${category}/${encodeURIComponent(name)}`);
  if(Number(upstream.headers.get('content-length'))>MAX_DOWNLOAD){await upstream.body?.cancel();throw new ApiError(413,'Endirmə limiti 50 MB-dır.');}
  let count=0;const limiter=new TransformStream({transform(chunk,controller){count+=chunk.byteLength;if(count>MAX_DOWNLOAD)throw new Error('Download limit exceeded');controller.enqueue(chunk);}});
  return new Response(upstream.body?.pipeThrough(limiter),{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="file"; filename*=UTF-8''${encodeURIComponent(name)}`}});
 }
 async submit(lectureId,taskId,file){
  if(!file||typeof file.name!=='string'||!file.size||file.size>MAX_UPLOAD)throw new ApiError(400,'Fayl boş olmamalı və 20 MB-dan böyük olmamalıdır.');
  const name=file.name.replaceAll('\\','/').split('/').pop();if(!name||name.length>200||/[\x00-\x1f\x7f]/.test(name))throw new ApiError(400,'Fayl adı qəbul edilmir.');
  const mime={pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'}[name.split('.').pop().toLowerCase()];
  if(!mime)throw new ApiError(400,'PDF, DOC, DOCX, PPT və PPTX formatları dəstəklənir.');
  const path=`lectures/${lectureId}/tasks/${taskId}`,task=await this.get(path);
  if(![true,1,'1'].includes(task.can_upload))throw new ApiError(403,'Universitet bu tapşırığa fayl yükləməyə icazə vermir.');
  if(Array.isArray(task.student_files)&&task.student_files.some(x=>typeof x?.filename==='string'&&x.filename.trim()))throw new ApiError(409,'Bu tapşırıqda artıq fayl var. Mövcud faylı silib yenidən yüklə.');
  const form=new FormData();form.append('file1',file.slice(0,file.size,mime),name);
  // A write is sent once only; an uncertain response is never retried.
  const response=await this.raw(path+'/submit',{method:'POST',body:form});return await this.parse(response);
 }
 async delete(lectureId,taskId,order){
  if(!/^[1-9]\d*$/.test(String(order)))throw new ApiError(400,'Fayl nömrəsi qəbul edilmir.');
  const path=`lectures/${lectureId}/tasks/${taskId}`,task=await this.get(path);
  const own=Array.isArray(task.student_files)?task.student_files.find(x=>String(x.order)===String(order)):null;
  if(!own||typeof own.filename!=='string'||!own.filename.trim())throw new ApiError(404,'Öz göndərişində bu fayl tapılmadı.');
  const response=await this.raw(path+`/submit?file=${order}`,{method:'DELETE',contentType:'application/json',body:JSON.stringify({fileName:own.filename})});
  return response.status===204?{message:'Fayl silindi.'}:await this.parse(response);
 }
}
export const randomId=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
const encoder=new TextEncoder();
const keys=new Map();
async function sessionKey(secret){
 if(typeof secret!=='string'||!/^[0-9a-f]{64}$/.test(secret))throw new Error('SESSION_KEY is required');
 if(!keys.has(secret))keys.set(secret,crypto.subtle.importKey('raw',Uint8Array.from(secret.match(/../g),n=>parseInt(n,16)),'AES-GCM',false,['encrypt','decrypt']));return keys.get(secret);
}
export async function seal(data,secret,context){
 const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(context)},await sessionKey(secret),encoder.encode(JSON.stringify(data)));
 return {iv:Array.from(iv),cipher:Array.from(new Uint8Array(cipher))};
}
export async function unseal(record,secret,context){
 const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:Uint8Array.from(record.iv),additionalData:encoder.encode(context)},await sessionKey(secret),Uint8Array.from(record.cipher));return JSON.parse(new TextDecoder().decode(bytes));
}
