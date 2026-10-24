export function lessonKind(group={}, date={}) {
  if (group.is_lab === true || group.is_lab === 1 || group.is_lab === '1') return 'L';
  const raw = date.method ?? date.teaching_method ?? group.method ?? group.teaching_method;
  const value = String(raw ?? '').toLocaleLowerCase('az');
  if (['1','m','lecture','mühazirə','muhazire'].includes(value)) return 'M';
  if (['2','s','seminar','training','məşğələ','mesgele'].includes(value)) return 'S';
  if (['3','l','lab','laboratory','laboratoriya'].includes(value)) return 'L';
  const title = String(group.title ?? '').toLocaleLowerCase('az');
  if (/labor|lab\b/.test(title)) return 'L';
  if (/seminar|məşğələ|mesgele/.test(title)) return 'S';
  if (/mühazirə|muhazire/.test(title)) return 'M';
  return '?';
}
export const kindNames={M:'Mühazirə',S:'Seminar',L:'Laboratoriya','?':'Növ göstərilməyib'};
export function parseJournalDate(value, year=new Date().getFullYear()) {
  const text=String(value??'').trim();
  let match=text.match(/^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{4}))?$/);
  if(match){const d=new Date(Number(match[3]||year),Number(match[2])-1,Number(match[1]));return d.getDate()===Number(match[1])&&d.getMonth()===Number(match[2])-1?d:null;}
  if(/^\d{4}-\d{2}-\d{2}/.test(text)){const d=new Date(text.slice(0,10)+'T12:00:00');return Number.isNaN(d.getTime())?null:d;}
  return null;
}
export function statusOf(value) { return String(value)==='1'?'present':String(value)==='2'?'absent':'pending'; }
export function attendanceRows(detail={}, userId) {
  const result=[];
  for (const group of detail.attendance_groups ?? []) {
    const student=(group.students ?? []).find(s=>String(s.student_id)===String(userId));
    const records=new Map((student?.attendance ?? []).map(a=>[String(a.id),a]));
    for (const date of group.dates ?? []) {
      if(date.id===null||date.id===undefined||!date.date)continue;
      const mark=records.get(String(date.id));
      result.push({id:`${group.subject_group_id}-${date.id}`,kind:lessonKind(group,date),
        status:statusOf(mark?.status),date:date.date??'',week:Number(date.week_num)||0,
        group:String(group.subject_group_id??''),title:group.title??'',raw:date});
    }
  }
  return result.sort((a,b)=>(parseJournalDate(a.date)?.getTime()??0)-(parseJournalDate(b.date)?.getTime()??0)||a.kind.localeCompare(b.kind));
}
export function percentage(value) { const n=parseFloat(String(value??'').replace('%',''));return Number.isFinite(n)?Math.max(0,Math.min(100,n)):null; }
