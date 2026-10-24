import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {weekKind,bakuNow,detectGroup,forDay,forTemplate,nextPeriod,addDays,validDate,displayDate} from '../AzTuLms.Api/wwwroot/timetable-model.mjs';

const data=JSON.parse(readFileSync(new URL('../AzTuLms.Api/Data/timetable.json',import.meta.url),'utf8'));
const groups=Object.keys(data.groups),rows=Object.values(data.groups).flatMap(x=>x.lessons),own=data.groups['6223a1'].lessons;
assert.equal(groups.length,111);
assert.equal(new Set(Object.values(data.groups).map(g=>g.page)).size,111);
assert.equal(rows.length,1738);
assert.equal(data.upperWeekMonday,'2026-10-26');
assert.equal(displayDate('2026-10-26'),'26 oktyabr 2026');
for(const [group,record] of Object.entries(data.groups)){
 assert.match(group,/^\d{4}[a-z]{1,3}\d*$/);
 assert(record.lessons.length>0);
 assert(record.page>=1&&record.page<=111);
 for(const row of record.lessons){
  assert.equal(row.sourcePage,record.page);
  assert(row.day>=1&&row.day<=5);
  assert.match(row.start,/^\d{2}:\d{2}$/);assert.match(row.end,/^\d{2}:\d{2}$/);assert(row.start<row.end);
  assert(['upper','lower','all'].includes(row.week));assert(['M','S','L',''].includes(row.kind));
  assert(row.title.trim());assert(!/[?\uFFFD]/.test(JSON.stringify(row)));
  if(row.parallel)assert.equal(row.week,'all');
 }
}
for(const date of ['2026-10-19','2026-10-25','2026-11-02','2026-09-21'])assert.equal(weekKind(date),'lower');
for(const date of ['2026-10-26','2026-11-01','2026-10-12','2026-09-28'])assert.equal(weekKind(date),'upper');
assert.equal(weekKind('2027-01-04'),'upper');
assert.equal(addDays('2026-12-31',1),'2027-01-01');assert(!validDate('2026-02-30'));
assert.deepEqual(bakuNow(new Date('2026-10-25T20:05:10Z')),{date:'2026-10-26',time:'00:05:10',minute:5});
assert.equal(detectGroup([{lecture_name:'6223a1_if-40134y_İT layihələri'}],{},groups),'6223a1');
assert.equal(detectGroup([{lecture_name:'6223a2_if-40134y_İT layihələri'}],{},groups),'6223a2');
assert.equal(detectGroup([{subject_group:'6526dd_Test'}],{},groups),'6526dd');
assert.equal(detectGroup([{lecture_name:'6223a1_Test'},{lecture_name:'6223a2_Test'}],{},groups),null);
assert.equal(detectGroup([{lecture_name:'9999x_Test'}],{},groups),null);
const lower=forDay(own,'2026-10-20'),upper=forDay(own,'2026-10-27');
assert.equal(lower.length,2);assert.equal(upper.length,2);
assert.deepEqual([lower[0].kind,lower[0].room],['S','1-520']);
assert.deepEqual([upper[0].kind,upper[0].room],['L','1-507']);
assert.equal(forDay(own,'2026-10-24').length,0);
const monday=forDay(own,'2026-10-26')[0];
assert.deepEqual([monday.start,monday.end,monday.teacher,monday.room],['13:35','14:55','Abbaslı Cavid','6-507']);
assert.equal(forTemplate(own,2,'all').length,3);assert.equal(forTemplate(own,2,'lower').length,2);assert.equal(forTemplate(own,2,'upper').length,2);
let next=nextPeriod(own,{date:'2026-10-24',minute:1100});
assert.equal(next.date,'2026-10-26');assert.equal(next.lessons[0],monday);
assert.equal(nextPeriod(own,{date:'2026-10-26',minute:815}).status,'active');
assert.equal(nextPeriod(own,{date:'2026-10-26',minute:895}).lessons[0].start,'15:05');
const parallel=rows.filter(x=>x.parallel);assert(parallel.length>100);
const nameSet=new Set(rows.map(r=>r.teacher)),titleSet=new Set(rows.map(r=>r.title));
assert(nameSet.has('Əhmədova Leyla'));assert(nameSet.has('Hacıyeva Ellada'));assert(nameSet.has('İsmayılov Anar'));
assert(titleSet.has('Proqramlaşdırmanın əsasları'));assert(titleSet.has('Şəbəkə mühəndisliyinin əsasları'));
console.log(`PASS: ${groups.length} groups, ${rows.length} lessons; Azerbaijani text, group detection, Baku time, alternating weeks, dates and lesson filtering.`);
