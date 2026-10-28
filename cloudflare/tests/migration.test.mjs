import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {ApiError,UpstreamSession,MAX_UPLOAD,isAllowedRead,readPath,ownAttendance,taskRoutes,ownTimetable,mergeCookies,cookieHeader,seal,unseal} from '../src/core.mjs';
import worker,{LmsSessionObject,LoginLimiter} from '../src/worker.mjs';

const key='12'.repeat(32),base='https://aztu.example';
const sessionData=()=>({token:'unit-test-token',userId:'test-id',userAgent:'TestBrowser/1.0',cookies:[],expires:Date.now()+7200000});
const reply=(data,status=200,headers={})=>new Response(status===204?null:JSON.stringify(data),{status,headers:{'Content-Type':'application/json',...headers}});
const request=(path,options={})=>new Request(base+path,options);
class Storage{
 constructor(){this.values=new Map();this.alarm=null;}
 async get(k){return structuredClone(this.values.get(k));}
 async put(k,v){this.values.set(k,structuredClone(v));}
 async deleteAll(){this.values.clear();}
 async setAlarm(value){this.alarm=value;}
 async deleteAlarm(){this.alarm=null;}
 async transaction(callback){return callback(this);}
}
const context=(storage=new Storage(),name='object-one')=>({storage,id:{toString:()=>name},blockConcurrencyWhile:callback=>callback()});

test('only known read routes and query parameters are forwarded',()=>{
 for(const path of ['lectures','profile','lectures/4287/syllabus','lectures/4287/syllabus/plan?method=3','scores/20261','/teacher-evaluation/teachers'])assert(isAllowedRead(path));
 for(const path of ['admin','https://other.example','lectures/4287/tasks/2/assign-scores','lectures/4287/syllabus/plan?method=4','search?q=a&role=admin'])assert(!isAllowedRead(path));
 assert.equal(readPath(new URL(base+'/api/lectures/4287/syllabus/plan')),'lectures/4287/syllabus/plan?method=1');
 for(const path of ['/api/lectures?group=other','/api/search?q=abc&role=admin','/api/lectures/4287/syllabus/plan?method=1&method=3'])assert.throws(()=>readPath(new URL(base+path)),ApiError);
});
test('login uses verified POST and never returns upstream token',async()=>{
 let sent;
 const data={userAgent:'TestBrowser/1.0',cookies:[]},s=new UpstreamSession(data,{fetcher:async(url,options)=>{sent={url,options};return reply({status:'success',token:'unit-test-token',user_id:'test-id'});}});
 assert.deepEqual(await s.login({user_id:'test-id',password:'test-password'}),{status:'success',userId:'test-id'});
 assert.equal(sent.url,'https://api-lms.aztu.edu.az/api/api-login');assert.equal(sent.options.method,'POST');assert.equal(sent.options.redirect,'manual');
 assert.equal(sent.options.headers.get('Origin'),'https://lms.aztu.edu.az');assert(sent.options.headers.has('X-Client-Time'));assert.equal(data.token,'unit-test-token');
 const bad=new UpstreamSession({userAgent:'TestBrowser/1.0',cookies:[]},{fetcher:async()=>reply({status:'success',token:'fake'})});await assert.rejects(bad.login({}),{status:401});
});
test('upstream cookies stay scoped and session cookies do not leak to browser',async()=>{
 const cookies=[],headers=new Headers();headers.append('Set-Cookie','laravel_session=abc; Path=/; Domain=api-lms.aztu.edu.az; HttpOnly');headers.append('Set-Cookie','foreign=bad; Domain=elsewhere.example; Path=/');
 assert(mergeCookies(cookies,headers,'https://api-lms.aztu.edu.az/api/api-login'));assert.equal(cookies.length,1);
 assert.equal(cookieHeader(cookies,'https://api-lms.aztu.edu.az/api/lectures'),'laravel_session=abc');assert.equal(cookieHeader(cookies,'https://other.example/api/lectures'),'');
 const expire=new Headers({'Set-Cookie':'laravel_session=; Max-Age=0; Path=/; Domain=api-lms.aztu.edu.az'});mergeCookies(cookies,expire,'https://api-lms.aztu.edu.az/api/login');assert.equal(cookies.length,0);
});
test('own attendance and course scores exclude every other student',async()=>{
 const input={attendance_groups:[{dates:[{id:1}],students:[{student_id:'test-id',attendance:[1]},{student_id:'other-id'}]}],student_scores:[{student_id:'test-id'},{student_id:'other-id'}],students:[{student_id:'other-id'}]};
 const filtered=ownAttendance(input,'test-id');assert.equal(filtered.attendance_groups[0].students.length,1);assert.equal(filtered.attendance_groups[0].dates.length,1);assert.equal(filtered.student_scores.length,1);assert.equal(filtered.students.length,0);
 const s=new UpstreamSession(sessionData(),{fetcher:async()=>reply({students:[{student_id:'test-id'},{student_id:'other-id'}]})});assert.equal((await s.get('lectures/4287/scores')).students.length,1);
});
test('timetables contain exactly the authenticated group, including DD codes',async()=>{
 const catalog=JSON.parse(await readFile(new URL('../../AzTuLms.Api/Data/timetable.json',import.meta.url)));
 const own=ownTimetable(catalog,[{lecture_name:'6223a1_if-40134y_course'}]);assert.deepEqual(Object.keys(own.groups),['6223a1']);assert(!JSON.stringify(own).includes('6223a2'));
 assert.equal(ownTimetable(catalog,[{lecture_name:'6223a1_x'},{lecture_name:'6223a2_x'}]),null);assert.equal(ownTimetable(catalog,[]),null);
 assert.deepEqual(Object.keys(ownTimetable(catalog,{data:[{subject_group:'6526dd_course'}]}).groups),['6526dd']);
});
test('task upload resolves server group, preserves bytes and performs one write',async()=>{
 const routes=taskRoutes({tasks:[{id:70,subject_group_id:4293}]});assert.equal(routes.tasks[0].local_submit_path,'/api/lectures/4293/tasks/70/submit');
 const calls=[],s=new UpstreamSession(sessionData(),{fetcher:async(url,options)=>{calls.push({url,options});return options.method==='GET'?reply({can_upload:true,student_files:[]}):reply({status:'success'});}});
 const file=new File(['lab bytes'],'lab.pdf',{type:'application/pdf'});await s.submit(4293,70,file);
 assert.equal(calls.length,2);assert.equal(calls.filter(x=>x.options.method==='POST').length,1);assert.equal(calls[1].url,'https://api-lms.aztu.edu.az/api/lectures/4293/tasks/70/submit');
 assert.equal(calls[1].options.headers.get('Authorization'),'Bearer unit-test-token');assert.equal(await calls[1].options.body.get('file1').text(),'lab bytes');assert(!calls[1].options.body.has('file'));
 await assert.rejects(s.submit(4293,70,{name:'huge.pdf',size:MAX_UPLOAD+1}),{status:400});await assert.rejects(s.submit(4293,70,new File(['bad'],'bad.exe')),{status:400});assert.equal(calls.length,2);
});
test('closed and existing submissions never receive POST; uncertain writes never retry',async()=>{
 for(const task of [{can_upload:false},{can_upload:true,student_files:[{filename:'existing.pdf'}]}]){
  let calls=0;const s=new UpstreamSession(sessionData(),{fetcher:async()=>{calls++;return reply(task);}});await assert.rejects(s.submit(1,2,new File(['pdf'],'lab.pdf')));assert.equal(calls,1);
 }
 let writes=0;const s=new UpstreamSession(sessionData(),{fetcher:async(_,options)=>{if(options.method==='GET')return reply({can_upload:true});writes++;throw new Error('Connection lost');}});await assert.rejects(s.submit(1,2,new File(['pdf'],'lab.pdf')),{status:502});assert.equal(writes,1);
});
test('deletion can only target a filename verified in own submission',async()=>{
 let mutation;const s=new UpstreamSession(sessionData(),{fetcher:async(url,options)=>{if(options.method==='GET')return reply({teacher_files:[{order:2,filename:'teacher.pdf'}],student_files:[{order:1,filename:'own.pdf'}]});mutation={url,options};return reply(null,204);}});
 await assert.rejects(s.delete(1,2,2),{status:404});assert.equal(mutation,undefined);await s.delete(1,2,1);assert.equal(JSON.parse(mutation.options.body).fileName,'own.pdf');assert.equal(mutation.options.method,'DELETE');
});
test('download traversal and over-limit files are rejected, valid files streamed',async()=>{
 let calls=0;const s=new UpstreamSession(sessionData(),{fetcher:async()=>{calls++;return new Response('file bytes', {headers:{'Content-Type':'application/pdf'}});}});
 await assert.rejects(s.download('tasks','../secret'),{status:400});await assert.rejects(s.download('admin','secret.pdf'),{status:400});assert.equal(calls,0);
 const response=await s.download('materials','material.pdf');assert.equal(await response.text(),'file bytes');assert(response.headers.get('content-disposition').startsWith('attachment;'));
 const huge=new UpstreamSession(sessionData(),{fetcher:async()=>new Response('',{headers:{'Content-Length':String(51*1024*1024)}})});await assert.rejects(huge.download('tasks','x.pdf'),{status:413});
});
test('session storage is encrypted, object-bound and survives eviction',async()=>{
 const data=sessionData(),encrypted=await seal(data,key,'object-one');assert(!JSON.stringify(encrypted).includes(data.token));assert.deepEqual(await unseal(encrypted,key,'object-one'),data);await assert.rejects(unseal(encrypted,key,'different-object'));
 const ctx=context();await ctx.storage.put('session',encrypted);
 const first=new LmsSessionObject(ctx,{SESSION_KEY:key});assert.equal((await (await first.fetch(request('/auth/status'))).json()).authenticated,true);
 const restored=new LmsSessionObject(ctx,{SESSION_KEY:key});assert.equal((await (await restored.fetch(request('/auth/status'))).json()).userId,'test-id');
 await restored.fetch(request('/auth/logout',{method:'POST'}));assert.equal(await ctx.storage.get('session'),undefined);assert.equal(ctx.storage.alarm,null);
 const afterLogout=new LmsSessionObject(ctx,{SESSION_KEY:key});assert.equal((await (await afterLogout.fetch(request('/auth/status'))).json()).authenticated,false);
});
test('expired or corrupted sessions expose no account data',async()=>{
 const ctx=context();await ctx.storage.put('session',await seal({...sessionData(),expires:Date.now()-1},key,'object-one'));
 const expired=new LmsSessionObject(ctx,{SESSION_KEY:key});assert.equal((await expired.fetch(request('/api/lectures'))).status,401);assert.equal(await ctx.storage.get('session'),undefined);
 await ctx.storage.put('session',{iv:[],cipher:[]});const corrupt=new LmsSessionObject(ctx,{SESSION_KEY:key});assert.equal((await (await corrupt.fetch(request('/auth/status'))).json()).authenticated,false);
});
test('changing group, invalid upload requests and writes are blocked in authenticated object',async()=>{
 const ctx=context();await ctx.storage.put('session',await seal(sessionData(),key,'object-one'));const object=new LmsSessionObject(ctx,{SESSION_KEY:key});
 assert.equal((await object.fetch(request('/api/timetable?group=6223a2'))).status,400);
 assert.equal((await object.fetch(request('/api/lectures/1/tasks/2/submit',{method:'POST'}))).status,403);
 assert.equal((await object.fetch(request('/api/admin',{method:'POST'}))).status,405);
 assert.equal((await object.fetch(request('/api/lectures?role=admin'))).status,400);
});
test('worker enforces same-origin, opaque cookie, safe response headers and static separation',async()=>{
 let objectCalls=0,assetCalls=0;
 const env={SESSION_KEY:key,ASSETS:{fetch:async()=>{assetCalls++;return new Response('asset');}},SESSIONS:{idFromName:x=>x,get:()=>({fetch:async()=>{objectCalls++;return reply({ok:true});}})}};
 const guest=await worker.fetch(request('/auth/status'),env);assert.deepEqual(await guest.json(),{authenticated:false,userId:null});assert.equal(objectCalls,0);
 assert.equal((await worker.fetch(request('/api/lectures',{headers:{Origin:'https://evil.example'}}),env)).status,403);
 const unauth=await worker.fetch(request('/api/lectures'),env);assert.equal(unauth.status,401);assert.equal(unauth.headers.get('cache-control'),'no-store');assert.match(unauth.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
 await worker.fetch(request('/style.css'),env);assert.equal(assetCalls,1);assert.equal(objectCalls,0);
 const config=JSON.parse((await readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8')));assert.deepEqual(config.assets.run_worker_first,['/api/*','/auth/*','/health']);assert(config.migrations[0].new_sqlite_classes.includes('LmsSessionObject'));
 const publicFiles=await readdir(new URL('../public/',import.meta.url));assert(publicFiles.includes('app.mjs'));assert(!publicFiles.some(x=>x.endsWith('.json')||x.endsWith('.pdf')));
});
test('login attempts have a persistent per-IP limit and reset at window end',async()=>{
 const ctx=context(),limiter=new LoginLimiter(ctx);for(let i=0;i<30;i++)assert.equal((await limiter.fetch()).status,204);assert.equal((await limiter.fetch()).status,429);
 const restored=new LoginLimiter(ctx);assert.equal((await restored.fetch()).status,429);await restored.alarm();assert.equal((await restored.fetch()).status,204);
});
