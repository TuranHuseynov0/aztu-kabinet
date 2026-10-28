import {asList,normalizedFiles,successRows} from './portal-model.mjs';
import {createTimetable} from './timetable.mjs';
import {absenceLimit} from './student-model.mjs';

export function createPortal(ctx){
  const {state,api,esc,icon,number,courseName,head,saveProfile}=ctx;
  const pages={surveys:'Sorğular siyahısı',announcements:'Elanlar',profile:'Profil',transcript:'Transkript',schedule:'Dərs cədvəli',courses:'Fənnlər',tasks:'Tapşırıqlar',attendance:'Davamiyyət',oral:'Şifahi imtahanlar',exams:'Yazılı imtahanlar',course:'Fənn'};
  const navItems=[['attendance','journal'],['tasks','file'],['schedule','calendar'],['courses','book'],['oral','exam'],['exams','exam'],['profile','user']];
  const tabs=[['about','Dərs haqqında'],['materials','Dərs materialları'],['grading','Qiymətləndirmə'],['attendance','Davamiyyət'],['success','Cari müvəffəqiyyət'],['exams','İmtahan nəticəsi']];
  let courseNavOpen=true,courseId=null,courseTab='about',semester=null,scores=[];
  const timetable=createTimetable({...ctx,ensureCourses});
  function routePage(path){if(path.startsWith('course/')){const m=path.match(/^course\/([1-9][0-9]*)\/(about|materials|grading|attendance|success|exams)$/);if(m){courseId=m[1];courseTab=m[2];return 'course';}return 'courses';}return Object.hasOwn(pages,path)?path:'attendance';}
  function courseLinks(){return state.courses.map(c=>`<a href="#course/${esc(c.id)}/about" class="${state.page==='course'&&String(c.id)===String(courseId)?'active':''}">${esc(courseName(c))}</a>`).join('');}
  function nav(){return navItems.map(([page,i])=>`${page==='courses'?'<div class="nav-course-group">':''}<div class="nav-row"><a href="#${page}" class="${state.page===page||(page==='courses'&&state.page==='course')?'active':''}" ${state.page===page?'aria-current="page"':''} title="${pages[page]}">${icon(i)}<span class="nav-label">${pages[page]}</span></a>${page==='courses'?`<button class="nav-expand" data-action="courses-toggle" aria-label="Fənn siyahısını aç və ya bağla" aria-expanded="${courseNavOpen}">${icon('arrow')}</button>`:''}</div>${page==='courses'?`<div class="course-subnav" ${courseNavOpen?'':'hidden'}>${courseLinks()}</div></div>`:''}`).join('');}
  function updateNav(){const el=document.querySelector('.course-subnav');if(el)el.innerHTML=courseLinks();}
  async function ensureCourses(){if(!state.courses.length){state.courses=asList(await api('/api/lectures'));updateNav();}return state.courses;}
  function path(suffix){return `/api/lectures/${courseId}/${suffix}`;}
  const empty=text=>`<p class="empty-state">${esc(text)}</p>`;
  const table=(headers,rows)=>`<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  const cell=v=>`<td>${number(v)}</td>`;
  function filesHTML(value,category,deletable=false,featured=false){
    const files=normalizedFiles(value);
    if(!files.length)return empty('Fayl əlavə edilməyib.');
    return `<ul class="attachment-list${featured?' teacher-file-list':''}">${files.map(f=>{
      const ext=String(f.name).split('.').pop().toUpperCase(),format=/^[A-Z0-9]{1,8}$/.test(ext)?ext:'FAYL';
      return `<li><a href="/api/secure-download/${category}/${encodeURIComponent(f.stored)}" download>${featured?`<span class="file-format" aria-hidden="true">${esc(format)}</span><span class="attachment-copy"><strong>${esc(f.name)}</strong><small>Müəllim materialı · ${esc(format)}</small></span><span class="download-label">${icon('download')}Endir</span>`:`${icon('file')}<span>${esc(f.name)}</span>${icon('download')}`}</a>${deletable&&f.order?`<button class="icon-btn danger-text" data-action="delete-file" data-order="${f.order}" aria-label="${esc(f.name)} faylını sil">${icon('trash')}</button>`:''}</li>`;
    }).join('')}</ul>`;
  }
  async function render(current){
    document.querySelector('#main').innerHTML=head(pages[state.page]||'Fənn','Məlumatlar yüklənir…')+'<p class="message" role="status">Universitet məlumatları alınır…</p>';
    if(state.page==='schedule'){await timetable.render(current);return;}
    if(state.page==='courses'){const courses=await ensureCourses();if(!state.summary.length)state.summary=asList(await api('/api/attendance'));await Promise.allSettled(courses.map(c=>ctx.syllabusFor(c.id)));if(!current())return;document.querySelector('#main').innerHTML=head('Fənnlər',`${courses.length} fənn. Material, qiymət və davamiyyət üçün fənni aç.`)+table(['Fənn','Saat','Qayıb','Q/b limiti',''],courses.map(c=>{const a=state.summary.find(x=>String(x.subject_group_id)===String(c.id))||{},limit=absenceLimit(state.syllabuses.get(String(c.id))?.hours,a.absent_weeks);return `<tr><td><a class="subject-link" href="#course/${esc(c.id)}/about">${esc(courseName(c))}</a></td>${cell(limit.hours)}${cell(limit.count)}${cell(limit.limit)}<td><a class="text-action" href="#course/${esc(c.id)}/about">Fənni aç ${icon('arrow')}</a></td></tr>`;}));return;}
    if(state.page==='course'){await renderCourse(current);return;}
    if(state.page==='transcript'){const data=await api('/api/scores');if(!current())return;scores=asList(data,'results');semester=null;document.querySelector('#main').innerHTML=head('Transkript','Semestrlər, kreditlər və yekun nəticələr.')+`<section class="transcript-average" aria-label="Ümumi ortalama"><span>Ümumi ortalama</span><strong>${number(data.summary?.t_avg_total)}</strong><span class="small">Universitetin yekun orta balı</span></section>`+(scores.length?table(['Semestr','Fənn','Dinlənmiş','Kredit','Alınmış kredit','Orta bal',''],scores.map((s,i)=>`<tr><td>${esc(s.semester_name)}</td>${cell(s.attend_cnt)}${cell(s.require_cnt)}${cell(s.total_score)}${cell(s.require_score)}${cell(s.avg_total2)}<td><button class="text-action" data-action="semester" data-index="${i}">Ətraflı ${icon('arrow')}</button></td></tr>`)):empty('Transkript məlumatı yoxdur.'))+'<section id="semester-detail" class="detail-section"></section>';return;}
    const routes={announcements:'/api/announcements',oral:'/api/oral-exams',exams:'/api/exam-results-all',surveys:'/api/teacher-evaluation/teachers'};
    const page=state.page;let data;try{data=await api(routes[page]);}catch(error){if(!current())return;document.querySelector('#main').innerHTML=head(pages[page],'Hesabına açıq universitet məlumatları.')+empty(error.message);return;}
    if(!current())return;
    const records=page==='oral'?[...asList(data.normalExams),...asList(data.resitExams)]:asList(data,page==='exams'?'exams':'data');
    document.querySelector('#main').innerHTML=head(pages[page],`${records.length} qeyd.`)+(records.length?`<div class="plain-feed">${records.map((r,i)=>`<article><h2>${esc(r.title||r.name||r.lecture_name||r.subject_name||'Qeyd')}</h2><p class="muted">${esc(r.created_at||r.date||r.exam_date||'')}</p>${r.content?`<p>${esc(String(r.content).replace(/<[^>]*>/g,' '))}</p>`:''}${page==='announcements'&&r.id?`<button class="text-action" data-action="announcement" data-id="${esc(r.id)}">Ətraflı</button>`:''}${page==='exams'?`<dl class="inline-facts"><div><dt>İmtahan balı</dt><dd>${number(r.score??r.exam_score??r.last_score)}</dd></div><div><dt>Nəticə</dt><dd>${number(r.grade??r.result)}</dd></div></dl>`:''}</article>`).join('')}</div>`:empty('Göstəriləcək məlumat yoxdur.'));
  }
  async function renderCourse(current){
    await ensureCourses();if(!current())return;const course=state.courses.find(c=>String(c.id)===String(courseId));
    if(!course){document.querySelector('#main').innerHTML=empty('Bu fənn öz dərs siyahında yoxdur.');return;}
    document.querySelector('#main').innerHTML=`<header class="page-head course-header"><div><a href="#courses" class="back-link">Fənnlər</a><h1>${esc(courseName(course))}</h1></div><button class="secondary row" data-action="course-tasks">${icon('file')}Tapşırıqlar</button></header><nav class="course-tabs" aria-label="Fənn bölmələri">${tabs.map(([key,title])=>`<a href="#course/${courseId}/${key}" ${courseTab===key?'aria-current="page"':''} class="${courseTab===key?'active':''}">${title}</a>`).join('')}</nav><div id="course-body"><p class="message" role="status">Bölmə yüklənir…</p></div>`;
    const body=document.querySelector('#course-body');
    if(courseTab==='attendance'){if(!state.summary.length)state.summary=asList(await api('/api/attendance'));if(!current())return;state.selected=courseId;state.kind='all';body.innerHTML='<section class="journal course-journal" id="journal"></section>';await ctx.loadJournal();return;}
    if(courseTab==='about'){
      const result=await ctx.syllabusFor(courseId);if(!current())return;const s=asList(result)[0]||result||{},p=s.professor||{},lab=(p.laboratory_professors||[]).map(r=>r.name).filter(Boolean).join(', '),g=s.grading_form||{};
      body.innerHTML=`<section class="compact-section"><h2>Fənn haqqında</h2><dl class="key-values"><div><dt>Semestr</dt><dd>${number(s.semester)}</dd></div><div><dt>Kredit</dt><dd>${number(s.score)}</dd></div><div><dt>Ümumi saat</dt><dd>${number(s.hours)}</dd></div><div><dt>Mühazirə / seminar / lab</dt><dd>${number(s.lecture_hours)} / ${number(s.seminar_hours)} / ${number(s.lab_hours)}</dd></div><div><dt>Mühazirə müəllimi</dt><dd>${number(p.lecture_professor_name)}</dd></div><div><dt>Seminar müəllimi</dt><dd>${number(p.training_professor_name)}</dd></div><div><dt>Laboratoriya müəllimi</dt><dd>${esc(lab||'—')}</dd></div></dl>${s.content?`<h3>Açıqlama</h3><p class="body-copy">${esc(String(s.content).replace(/<[^>]*>/g,' '))}</p>`:''}</section><section class="compact-section"><h2>Qiymətləndirmə bölgüsü</h2>${table(['Məşğələ','Laboratoriya','Sərbəst iş','Cəmi'],[`<tr>${cell(g.seminar)}${cell(g.laboratory)}${cell(g.independent_work)}${cell(g.total)}</tr>`])}</section><section class="compact-section"><div class="row between"><h2>Sillabus və mövzular</h2><label class="sr-only" for="plan-method">Dərs növü</label><select id="plan-method" class="compact-select"><option value="1">Mühazirə</option><option value="2">Seminar</option><option value="3">Laboratoriya</option></select></div><div id="plan-list"></div></section>`;await loadPlan('1',current);return;
    }
    if(courseTab==='materials'){
      const records=asList(await api(path('materials')));if(!current())return;
      body.innerHTML=records.length?table(['Mövzu','Müəllif','Tarix',''],records.map(m=>`<tr><td>${esc(m.title||m.name)}</td><td>${esc(m.creator||'—')}</td><td class="nowrap">${esc(m.created_at||'—')}</td><td><button class="text-action" data-action="material" data-id="${esc(m.id)}">Aç ${icon('arrow')}</button></td></tr>`)):empty('Müəllim bu fənnə material əlavə etməyib.');return;
    }
    if(courseTab==='grading'){await ctx.renderCourseTasks(courseId);return;}
    if(courseTab==='success'){
      const data=await api(path('scores'));if(!current())return;const rows=successRows(data),s=data.students?.[0]?.scores||{},a=s.attendance||{};
      body.innerHTML=`<section class="compact-section"><div class="row between"><h2>Cari müvəffəqiyyət</h2>${s.avg_grade!==undefined?`<span class="grade-label">Orta qiymət <b>${esc(s.avg_grade)}</b></span>`:''}</div>${rows.length?table(['Bölmə','Toplanan bal','Maksimum bal'],rows.map(([label,value,max])=>`<tr${label==='Ümumi bal'?' class="total-row"':''}><td>${label}</td>${cell(value)}${cell(max)}</tr>`)):empty('Qiymət məlumatı yoxdur.')}</section>${Object.keys(a).length?`<section class="compact-section"><h2>Davamiyyət göstəriciləri</h2><dl class="inline-facts"><div><dt>İştirak</dt><dd>${number(a.attended_weeks)}</dd></div><div><dt>Qayıb</dt><dd>${number(a.absent_weeks)}</dd></div><div><dt>Cəmi dərs</dt><dd>${number(a.total_weeks)}</dd></div><div><dt>Faiz</dt><dd>${number(a.attendance_percent)}</dd></div></dl></section>`:''}${s.training?'<p class="quiet-note">Məşğələ nəticəsinə LMS-in minimum qiymət sayı və normallaşdırma qaydaları tətbiq olunur. Göstəricilər universitetdən olduğu kimi alınır.</p>':''}`;return;
    }
    const data=await api('/api/exam-results-all');if(!current())return;const records=asList(data,'exams').filter(e=>String(e.subject_group_id??e.lecture_id)===String(courseId));body.innerHTML=records.length?table(['İmtahan','Tarix','Bal','Nəticə'],records.map(e=>`<tr><td>${esc(e.name||e.lecture_name||'İmtahan')}</td><td>${esc(e.date||e.exam_date||'—')}</td>${cell(e.score??e.exam_score)}${cell(e.grade??e.result)}</tr>`)):empty('Bu fənn üzrə imtahan nəticəsi yoxdur.');
  }
  async function loadPlan(method,current=()=>state.page==='course'&&courseTab==='about'){
    const id=courseId,host=document.querySelector('#plan-list');if(!host)return;host.innerHTML='<p class="message">Mövzular yüklənir…</p>';
    const rows=asList(await api(`/api/lectures/${id}/syllabus/plan?method=${method}`));if(!current()||id!==courseId||!document.querySelector('#plan-list'))return;
    document.querySelector('#plan-list').innerHTML=rows.length?table(['Mövzu','Fayl'],rows.map(r=>`<tr><td>${esc(r.object||r.title||r.name||'Mövzu')}</td><td>${r.file_exists?`<button class="text-action" data-action="topic-file" data-id="${esc(r.id)}">Endir ${icon('download')}</button>`:'—'}</td></tr>`)):empty('Bu dərs növü üzrə mövzu əlavə edilməyib.');
  }
  async function renderSemester(index){const s=scores[index];if(!s)return;semester=s.sem_code;const host=document.querySelector('#semester-detail');host.innerHTML='<p class="message">Semestr açılır…</p>';const data=await api('/api/scores/'+encodeURIComponent(s.sem_code));if(state.page!=='transcript'||semester!==s.sem_code)return;const rows=asList(data,'results');host.innerHTML=`<h2>${esc(s.semester_name)}</h2>`+(rows.length?table(['Fənn','Kredit','İmtahan qabağı','İmtahan','Yekun','Qiymət'],rows.map(r=>`<tr><td>${esc(r.lecture_name)}</td>${cell(r.score)}${cell(r.total_score_new)}${cell(r.last_score)}${cell(r.total_score)}${cell(r.grade)}</tr>`)):empty('Bu semestr üzrə detal yoxdur.'));}
  async function handleAction(action,button){
    if(timetable.handleAction(action,button))return true;
    if(action==='sidebar-collapse'){const collapsed=document.querySelector('.shell').classList.toggle('sidebar-collapsed');saveProfile({...state.profile,sidebarCollapsed:collapsed});return true;}
    if(action==='courses-toggle'){courseNavOpen=!courseNavOpen;document.querySelector('.course-subnav').hidden=!courseNavOpen;button.setAttribute('aria-expanded',String(courseNavOpen));return true;}
    if(action==='course-tasks'){location.hash=`course/${courseId}/grading`;return true;}
    if(action==='semester'){await renderSemester(Number(button.dataset.index));return true;}
    if(action==='material'){
      const data=await api(path('materials/'+encodeURIComponent(button.dataset.id))),d=document.querySelector('#dialog');d.className='material-dialog';d.innerHTML=`<h2>${esc(data.title||'Dərs materialı')}</h2><h3 class="section-label">Açıqlama</h3><p class="body-copy">${esc(String(data.content||data.description||'Açıqlama əlavə edilməyib.').replace(/<[^>]*>/g,' '))}</p><h3 class="section-label">Fayllar</h3>${filesHTML(data.files||data.teacher_files,'materials')}<div class="row"><button class="secondary" data-action="cancel-dialog">Bağla</button></div>`;d.showModal();return true;
    }
    if(action==='topic-file'){const result=await api(path('syllabus/topic-file/'+encodeURIComponent(button.dataset.id)));const match=String(result.file||'').match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/);if(!match)throw new Error('Mövzu faylı alınmadı.');const bytes=Uint8Array.from(atob(match[2]),x=>x.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'})),a=document.createElement('a');a.href=url;a.download='movzu-'+button.dataset.id;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);return true;}
    if(action==='announcement'){const data=await api('/api/announcements/'+encodeURIComponent(button.dataset.id)),d=document.querySelector('#dialog');d.className='material-dialog';d.innerHTML=`<h2>${esc(data.title||data.name||'Elan')}</h2><p class="body-copy">${esc(String(data.content||data.description||'').replace(/<[^>]*>/g,' '))}</p>${filesHTML(data.files,'announcements')}<div class="row"><button class="secondary" data-action="cancel-dialog">Bağla</button></div>`;d.showModal();return true;}
    return false;
  }
  async function handleChange(input){if(timetable.handleChange(input))return true;if(input.id==='plan-method'){await loadPlan(input.value);return true;}return false;}
  function handleSubmit(){return false;}
  return {routePage,nav,updateNav,filesHTML,render,handleAction,handleChange,handleSubmit,pageTitle:()=>pages[state.page]||'Fənn',hasPage:()=>!['attendance','tasks','profile'].includes(state.page)};
}
