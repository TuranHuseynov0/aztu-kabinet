import {DAY_NAMES,displayDate,bakuNow,weekKind,weekMonday,addDays,dayOf,validDate,forDay,forTemplate,nextPeriod,minutes} from './timetable-model.mjs';

export function createTimetable(ctx){
 const {state,api,esc,icon,head}=ctx;
 let dataset=null,account=null,group=null,view='day',selected=bakuNow().date,followToday=true,timer=null,lastMinute='';
 const views=[['day','Gün'],['week','Həftə'],['all','Ümumi'],['upper','Üst həftə'],['lower','Alt həftə']];
 const kindNames={M:'Mühazirə',S:'Seminar',L:'Laboratoriya'};
 const weekName=week=>({upper:'Üst həftə',lower:'Alt həftə',all:'Hər həftə'}[week]);
 const empty=text=>`<p class="empty-state">${esc(text)}</p>`;
 async function render(current){
  const requestedAccount=state.id;
  if(account!==requestedAccount){account=requestedAccount;dataset=null;group=null;view='day';selected=bakuNow().date;followToday=true;}
  const data=await api('/api/timetable');if(!current()||state.id!==requestedAccount)return;
  dataset=data;group=Object.keys(data.groups)[0]||null;paint();
 }
 function row(item,date,next,now){
  const actual=date===now.date,active=actual&&minutes(item.start)<=now.minute&&now.minute<minutes(item.end),upcoming=actual&&next?.date===date&&next.lessons.some(x=>x===item)&&!active;
  const status=active?'<span class="tt-live-state">İndi</span>':upcoming?'<span class="tt-next-state">Növbəti</span>':'';
  return `<li class="tt-lesson${active?' tt-current-lesson':''}"><div class="tt-lesson-time"><time>${esc(item.start)}</time><span>${esc(item.end)}-dək</span>${status}</div><div class="tt-lesson-body"><div class="tt-lesson-tags"><span class="tt-kind-tag">${esc(item.kind||'—')}<span>${esc(kindNames[item.kind]||'Növ göstərilməyib')}</span></span><span class="tt-week-label">${weekName(item.week)}</span></div><h3>${esc(item.title)}</h3><p class="tt-teacher">${esc(item.teacher||'Müəllim göstərilməyib')}</p>${item.parallel?'<span class="tt-parallel">Paralel dil qrupu</span>':''}${item.note?`<p class="tt-lesson-note">${esc(item.note)}</p>`:''}</div><div class="tt-lesson-room"><span>Otaq</span><strong>${esc(item.room||'—')}</strong></div></li>`;
 }
 function section(day,date,items,next,now){
  return `<section class="tt-day${date===now.date?' tt-today':''}"><div class="tt-day-heading"><h2>${DAY_NAMES[day-1]}</h2>${date?`<span>${displayDate(date)}</span><span class="tt-day-week">${weekName(weekKind(date,dataset.upperWeekMonday))}</span>`:''}${date===now.date?'<span class="tt-today-label">Bu gün</span>':''}</div>${items.length?`<ol class="tt-lessons" aria-label="${DAY_NAMES[day-1]} dərsləri">${items.map(x=>row(x,date,next,now)).join('')}</ol>`:empty('Bu gün üçün dərs yoxdur.')}</section>`;
 }
 function paint(){
  if(state.page!=='schedule'||!dataset)return;
  const now=bakuNow(),entries=dataset.groups[group]?.lessons||[],next=group?nextPeriod(entries,now,dataset.upperWeekMonday):null,dated=view==='day'||view==='week';
  let content='';
  if(!group)content=empty('Hesabının qrupu üçün cədvəl müəyyən edilmədi.');
  else if(view==='day')content=section(dayOf(selected),selected,forDay(entries,selected,dataset.upperWeekMonday),next,now);
  else if(view==='week')content=Array.from({length:7},(_,i)=>addDays(weekMonday(selected),i)).map(date=>section(dayOf(date),date,forDay(entries,date,dataset.upperWeekMonday),next,now)).join('');
  else content=Array.from({length:5},(_,i)=>section(i+1,null,forTemplate(entries,i+1,view),null,now)).join('');
  const nextLine=next&&(view==='day'&&selected===now.date)?`<aside class="tt-next-lesson"><span class="tt-next-caption">${next.status==='active'?'Hazırkı dərs':'Növbəti dərs'} · ${DAY_NAMES[dayOf(next.date)-1]} · ${displayDate(next.date)}</span><strong>${esc(next.lessons[0].start)}–${esc(next.lessons[0].end)} <span aria-hidden="true">/</span> ${next.lessons.length>1?`${next.lessons.length} paralel dərs`:esc(next.lessons[0].title)}</strong><span>${next.lessons.length>1?'Müəllim və otaq variantlarını aşağıdakı cədvəldə yoxla.':`${esc(next.lessons[0].teacher||'')} · Otaq ${esc(next.lessons[0].room||'—')}`}</span></aside>`:'';
  document.querySelector('#main').innerHTML=head('Dərs cədvəli','2026–2027 · Payız semestri')+`<div class="tt-clockbar"><time id="tt-clock" datetime="${new Date().toISOString()}">${displayDate(now.date)} · ${now.time} · Bakı vaxtı</time><span id="tt-current-week" class="week-indicator lit">${weekName(weekKind(now.date,dataset.upperWeekMonday))}</span></div><div class="tt-toolbar"><div class="tt-own-group"><span>Sənin qrupun</span><strong>${esc(group||'—')}</strong></div><div class="tt-views" role="group" aria-label="Cədvəl görünüşü">${views.map(([v,label])=>`<button data-action="tt-view" data-view="${v}" aria-pressed="${view===v}" class="${view===v?'selected':''}">${label}</button>`).join('')}</div></div>${dated?`<div class="tt-date-nav"><button class="secondary" data-action="tt-prev" aria-label="Əvvəlki ${view==='week'?'həftə':'gün'}">‹</button><label class="sr-only" for="tt-date">Cədvəl tarixi</label><input type="date" id="tt-date" value="${selected}"><button class="secondary" data-action="tt-next" aria-label="Sonrakı ${view==='week'?'həftə':'gün'}">›</button><button class="ghost" data-action="tt-today">Bu gün</button><span class="small">${weekName(weekKind(selected,dataset.upperWeekMonday))}</span></div>`:`<p class="tt-template-caption">${view==='all'?'Bütün həftəlik dərslər; növbələşən dərslər ayrıca işarələnir.':weekName(view)+' üçün həftəlik cədvəl.'}</p>`}${nextLine}<div class="tt-content">${content}</div><footer class="tt-source"><span>Cədvəl: 16.10.2026 · Üst həftə başlanğıcı: 26.10.2026</span>${entries.some(x=>x.parallel)?'<p>Paralel dil qrupları PDF-dəki müəllim və otaq variantları ilə birlikdə göstərilir.</p>':''}</footer>`;
  startClock();
 }
 function startClock(){
  clearInterval(timer);lastMinute=bakuNow().time.slice(0,5);
  timer=setInterval(()=>{
   const el=document.querySelector('#tt-clock');if(state.page!=='schedule'||!el){clearInterval(timer);return;}
   const now=bakuNow();el.textContent=`${displayDate(now.date)} · ${now.time} · Bakı vaxtı`;el.dateTime=new Date().toISOString();
   document.querySelector('#tt-current-week').textContent=weekName(weekKind(now.date,dataset.upperWeekMonday));
   const changedDay=followToday&&selected!==now.date;if(changedDay)selected=now.date;
   if((changedDay||lastMinute!==now.time.slice(0,5))&&!document.activeElement?.closest('.tt-toolbar,.tt-date-nav'))paint();
  },1000);
 }
 function handleAction(action,button){
  if(!action.startsWith('tt-'))return false;
  if(action==='tt-view')view=button.dataset.view;
  if(action==='tt-today'){selected=bakuNow().date;followToday=true;view='day';}
  if(action==='tt-prev'||action==='tt-next'){selected=addDays(selected,(action==='tt-prev'?-1:1)*(view==='week'?7:1));followToday=false;}
  paint();return true;
 }
 function handleChange(input){
  if(input.id==='tt-date'){if(validDate(input.value)){selected=input.value;followToday=selected===bakuNow().date;paint();}return true;}return false;
 }
 return {render,handleAction,handleChange};
}
