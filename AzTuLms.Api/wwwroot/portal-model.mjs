export const days=['Bazar ertəsi','Çərşənbə axşamı','Çərşənbə','Cümə axşamı','Cümə','Şənbə','Bazar'];
export const asList=(value,key)=>Array.isArray(value)?value:Array.isArray(value?.[key])?value[key]:Array.isArray(value?.data)?value.data:[];
export function weekType(date,anchor){
  if(!anchor)return null;
  const monday=value=>{const d=new Date(String(value).slice(0,10)+'T12:00:00');if(Number.isNaN(d.getTime()))return null;d.setDate(d.getDate()-((d.getDay()+6)%7));return Date.UTC(d.getFullYear(),d.getMonth(),d.getDate());};
  const a=monday(anchor),b=monday(date);if(a===null||b===null)return null;
  return ((Math.round((b-a)/604800000)%2)+2)%2===0?'upper':'lower';
}
export function scheduledLessons(entries,date,anchor){
  const d=new Date(String(date).slice(0,10)+'T12:00:00'),day=(d.getDay()+6)%7+1,type=weekType(date,anchor);
  return (entries||[]).filter(x=>Number(x.day)===day&&(!type||x.week==='all'||x.week===type)).sort((a,b)=>String(a.start).localeCompare(String(b.start)));
}
export function normalizedFiles(value){
  const items=Array.isArray(value)?value:Object.values(value||{});
  return items.filter(f=>f&&typeof f==='object'&&(f.filename||f.name||f.url)).map(f=>{
    let stored=f.stored_file_name||'';
    try{if(!stored&&f.url)stored=decodeURIComponent(new URL(f.url,'http://localhost').pathname.split('/').pop());}catch{}
    const name=f.filename||f.name||stored;
    return {...f,name,stored:stored||name,order:Number(f.order)||null};
  });
}
export function successRows(data={}){
  const s=data.students?.[0]?.scores||{},max=data.score_set||{};
  return [
    ['Sərbəst iş',s.independent_work?.score,max.independent_work_score],
    ['Məşğələ',s.training?.score,max.training_score],
    ['Laboratoriya',s.laboratory?.score,max.laboratory_score],
    ['Davamiyyət',s.attendance?.attendance_score,max.attendance_score],
    ['Ümumi bal',s.total_score,max.avarage_score]
  ].filter(([,value,limit])=>value!==undefined||limit!==undefined);
}
