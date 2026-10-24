export const UPPER_MONDAY='2026-10-26';
export const DAY_NAMES=['Bazar ertəsi','Çərşənbə axşamı','Çərşənbə','Cümə axşamı','Cümə','Şənbə','Bazar'];
export const MONTH_NAMES=['yanvar','fevral','mart','aprel','may','iyun','iyul','avqust','sentyabr','oktyabr','noyabr','dekabr'];
export function displayDate(date){const [year,month,day]=date.split('-').map(Number);return `${day} ${MONTH_NAMES[month-1]} ${year}`;}
const DAY=86400000;
export function validDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}
export function addDays(date,count){if(!validDate(date))throw new Error('Tarix düzgün deyil.');return new Date(Date.parse(date+'T00:00:00Z')+count*DAY).toISOString().slice(0,10);}
export function dayOf(date){return (new Date(date+'T00:00:00Z').getUTCDay()+6)%7+1;}
export function weekMonday(date){return addDays(date,1-dayOf(date));}
export function weekKind(date,anchor=UPPER_MONDAY){const weeks=Math.round((Date.parse(weekMonday(date)+'T00:00Z')-Date.parse(weekMonday(anchor)+'T00:00Z'))/(7*DAY));return ((weeks%2)+2)%2===0?'upper':'lower';}
export function bakuNow(instant=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Baku',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(instant);
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}:${p.second}`,minute:Number(p.hour)*60+Number(p.minute)};
}
export const minutes=time=>Number(time.slice(0,2))*60+Number(time.slice(3,5));
export function forDay(entries,date,anchor=UPPER_MONDAY){const week=weekKind(date,anchor);return entries.filter(x=>x.day===dayOf(date)&&(x.week==='all'||x.week===week)).sort((a,b)=>a.start.localeCompare(b.start)||a.title.localeCompare(b.title));}
export function forTemplate(entries,day,filter){return entries.filter(x=>x.day===day&&(filter==='all'||x.week==='all'||x.week===filter)).sort((a,b)=>a.start.localeCompare(b.start)||a.week.localeCompare(b.week)||a.title.localeCompare(b.title));}
export function detectGroup(courses,remote,available){
 const known=new Set(available),counts=new Map();
 const values=(courses||[]).flatMap(c=>[c.lecture_name,c.subject_group,c.group_name]);
 for(const p of (Array.isArray(remote)?remote:[remote||{}]))values.push(p.academic_group,p.group_name,p.student_group,p.group);
 for(const value of values){if(typeof value!=='string')continue;const matches=value.toLowerCase().normalize('NFKC').matchAll(/(?:^|[^a-z0-9])(\d{4}[a-z]{1,3}\d*)(?=$|[^a-z0-9])/g);for(const m of matches)if(known.has(m[1]))counts.set(m[1],(counts.get(m[1])||0)+1);}
 const ranked=[...counts].sort((a,b)=>b[1]-a[1]);return ranked.length&&(ranked.length===1||ranked[0][1]>ranked[1][1])?ranked[0][0]:null;
}
export function nextPeriod(entries,now,anchor=UPPER_MONDAY){
 for(let offset=0;offset<15;offset++){const date=addDays(now.date,offset),rows=forDay(entries,date,anchor).filter(x=>offset>0||minutes(x.end)>now.minute);if(!rows.length)continue;const start=rows[0].start;const lessons=rows.filter(x=>x.start===start);return {date,lessons,status:offset===0&&minutes(start)<=now.minute?'active':'next'};}return null;
}
