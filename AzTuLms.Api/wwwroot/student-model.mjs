export const ABSENCE_LIMITS=new Map([[30,3],[45,5],[60,7],[75,9],[90,11],[105,13]]);
const present=value=>value!==undefined&&value!==null&&String(value).trim()!=='';
export function studentProfile(value={}){
 const root=Array.isArray(value)?value[0]||{}:value?.data&&typeof value.data==='object'?value.data:value||{};
 return {basic:root.basicInfo||root.basic_info||root,academic:root.academicInfo||root.academic_info||{}};
}
export function studentName(value){
 const {basic}=studentProfile(value),first=basic.name??basic.first_name,last=basic.surname??basic.last_name;
 return [first,last].filter(present).join(' ').trim()||String(basic.fullName||basic.full_name||basic.student_name||'').trim();
}
export function absenceLimit(hours,absences){
 const h=Number(hours),limit=present(hours)?ABSENCE_LIMITS.get(h)??null:null;
 const value=present(absences)?Number(absences):NaN,count=Number.isFinite(value)&&value>=0?value:null;
 return {hours:Number.isFinite(h)&&h>0?h:null,limit,count,remaining:limit!==null&&count!==null?Math.max(0,limit-count):null,over:limit!==null&&count!==null?Math.max(0,count-limit):null};
}
