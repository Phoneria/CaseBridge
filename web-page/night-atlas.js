import {COPY,DOCUMENTS,BRANCHES,BUREAUS,initialState,localized,transition,officeView} from './night-atlas-model.mjs?v=0.51';
import {createCaseMap} from './night-atlas-map.js?v=0.51';
let state=initialState(),map;
const $=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)],text=(id,value)=>$(id).textContent=value;
const copy=()=>COPY[state.lang],loc=pair=>localized(pair,state.lang);
function paragraph(value,mark){const p=document.createElement('p'),at=value.indexOf(mark);if(at<0){p.textContent=value;return p;}p.append(document.createTextNode(value.slice(0,at)));const m=document.createElement('mark');m.textContent=mark;p.append(m,document.createTextNode(value.slice(at+mark.length)));return p;}
function render(){
 const c=copy(),branch=BRANCHES[state.branch],doc=DOCUMENTS[state.document];
 document.documentElement.lang=state.lang;$('#case-map').setAttribute('aria-label',state.lang==='tr'?'Kurgu dosyanın ilişki haritası':'Fictional case relationship map');$('.skip-link').textContent=state.lang==='tr'?'İçeriğe geç':'Skip to content';$('#main-nav').setAttribute('aria-label',state.lang==='tr'?'Ana menü':'Main navigation');$('.journey-nav').setAttribute('aria-label',state.lang==='tr'?'Kurgu dosyanın yolculuğu':'Fictional case journey');
 all('[data-i18n]').forEach(el=>{const value=c[el.dataset.i18n];if(value)el.textContent=value;});
 $('#locale').lang=state.lang==='tr'?'en':'tr';$('#locale').textContent=state.lang==='tr'?'EN':'TR';$('#locale').setAttribute('aria-label',state.lang==='tr'?'Switch to English':'Türkçeye geç');document.title=state.lang==='tr'?'CaseBridge — Hukuk büroları için dava hazırlığı':'CaseBridge — Case preparation for law firms';
 const journeySub=state.lang==='tr'?['Belge · karar · ders','Varsayım · iki yol','Soru · yanıt · geri bildirim','Portföy · görev · takvim']:['Documents · decisions · lessons','Assumptions · two paths','Question · answer · feedback','Portfolio · tasks · calendar'];all('.journey-nav small').forEach((el,i)=>el.textContent=journeySub[i]);
 const timelineNotes=state.lang==='tr'?['İşlemin başlangıcı','Dosyadaki kritik boşluk','Doğrulanacak ilişki','İki hazırlık sorusu']:['The transaction begins','The critical gap','A match to verify','Two preparation questions'];
 all('#timeline [data-doc]').forEach((el,i)=>{const d=DOCUMENTS[el.dataset.doc];el.setAttribute('aria-pressed',String(el.dataset.doc===state.document));el.querySelector('time').textContent=loc(d.date);el.querySelector('b').textContent=loc(d.short);el.querySelector('span').textContent=timelineNotes[i];});
 text('#document-title',loc(doc.title));text('#document-ref',doc.ref);$('#document-body').replaceChildren(...doc.paragraphs.map(p=>paragraph(loc(p),loc(doc.mark))));text('#finding-text',loc(doc.finding));
 for(const id of ['contract','delivery'])$(`[data-map-node="${id}"]`).textContent=loc(DOCUMENTS[id].short);
 $('[data-map-node="payment"]').textContent=state.lang==='tr'?'Kısmi ödeme':'Partial payment';$('[data-map-node="dispute"]').textContent=state.lang==='tr'?'Teslime itiraz':'Delivery dispute';
 all('.branch-choice').forEach(el=>{const b=BRANCHES[el.dataset.branch],selected=el.dataset.branch===state.branch;el.setAttribute('aria-pressed',String(selected));el.querySelector('.branch-label').textContent=loc(b.title);el.querySelector('.branch-condition').textContent=loc(b.condition);el.querySelector('.branch-state').textContent=selected?c.selected:(state.lang==='tr'?'Bu dalı seç':'Choose this path');});
 text('#branch-outcome',loc(branch.outcome));text('#trial-branch',loc(branch.title));text('#trial-question',loc(branch.question));
 all('[data-answer]').forEach(el=>{el.textContent=loc(branch.options[Number(el.dataset.answer)]);el.setAttribute('aria-pressed',String(state.answer===Number(el.dataset.answer)));});
 const feedback=$('#answer-feedback');feedback.hidden=state.answer===null;if(state.answer!==null){const correct=state.answer===branch.correct;feedback.dataset.correct=String(correct);const title=document.createElement('strong'),body=document.createElement('p');title.textContent=correct?c.good:c.wrong;body.textContent=loc(correct?branch.feedback:branch.retry);feedback.replaceChildren(title,body);}
 const bureau=$('#bureau');[...bureau.options].forEach(o=>o.textContent=loc(BUREAUS[o.value].name));bureau.value=state.bureau;
 const lawyers=BUREAUS[state.bureau].lawyers,select=$('#lawyer');select.replaceChildren(new Option(c.all,'all'),...lawyers.map(l=>new Option(l.name,l.id)));select.value=state.lawyer;
 const view=officeView(state);text('#portfolio-count',view.cases);text('#task-count',view.tasks);
 $('#lawyer-loads').replaceChildren(...view.lawyers.map(l=>{const row=document.createElement('div');row.className='load-row';row.dataset.selected=String(state.lawyer==='all'||state.lawyer===l.id);const name=document.createElement('b'),count=document.createElement('span'),track=document.createElement('div'),bar=document.createElement('span');name.textContent=l.name;count.textContent=`${l.cases} ${c.caseUnit} · ${l.tasks} ${c.taskUnit}`;track.className='load-track';bar.style.width=`${Math.min(l.tasks/8*100,100)}%`;track.append(bar);row.append(name,count,track);return row;}));
 $('#agenda-list').replaceChildren(...view.agenda.map(t=>{const li=document.createElement('li'),date=document.createElement('div'),day=document.createElement('b'),month=document.createElement('span'),info=document.createElement('div'),title=document.createElement('strong'),meta=document.createElement('p');date.className='agenda-date';day.textContent=t.day;month.textContent=state.lang==='tr'?'Kasım 2026':'Nov 2026';date.append(day,month);title.textContent=loc(t.title);meta.textContent=`${t.time} · ${lawyers.find(l=>l.id===t.who).name}`;info.append(title,meta);li.dataset.scenario=String(!!t.scenario);li.append(date,info);return li;}));
 text('#scenario-task-title',loc(branch.task));text('#plan-status',state.planned?c.planned:c.notPlanned);$('#plan-task').disabled=state.planned;
 $('#plan-task').textContent=state.planned?(state.lang==='tr'?'Kurgu görevi planlandı':'Fictional task planned'):c.plan;
 map?.setSelection(state.branch);map?.refresh();
}
function dispatch(action){state=transition(state,action);render();if(action.type==='branch')text('#journey-status',copy().branchChanged);}
all('[data-interactive]').forEach(el=>el.disabled=false);
all('[data-doc]').forEach(el=>el.addEventListener('click',()=>dispatch({type:'document',value:el.dataset.doc})));
all('[data-branch]').forEach(el=>el.addEventListener('click',()=>dispatch({type:'branch',value:el.dataset.branch})));
all('[data-answer]').forEach(el=>el.addEventListener('click',()=>dispatch({type:'answer',value:Number(el.dataset.answer)})));
$('#bureau').addEventListener('change',e=>dispatch({type:'bureau',value:e.target.value}));$('#lawyer').addEventListener('change',e=>dispatch({type:'lawyer',value:e.target.value}));$('#plan-task').addEventListener('click',()=>dispatch({type:'plan'}));$('#locale').addEventListener('click',()=>dispatch({type:'lang',value:state.lang==='tr'?'en':'tr'}));
const header=$('.site-header'),toggle=$('.menu-toggle');
function closeMenu(){header.dataset.open='false';toggle.setAttribute('aria-expanded','false');}
toggle.addEventListener('click',()=>{const open=header.dataset.open!=='true';header.dataset.open=String(open);toggle.setAttribute('aria-expanded',String(open));});
all('#main-nav a').forEach(a=>a.addEventListener('click',closeMenu));document.addEventListener('keydown',e=>{if(e.key==='Escape'&&header.dataset.open==='true'){closeMenu();toggle.focus();}});
matchMedia('(min-width:1024px)').addEventListener('change',e=>{if(e.matches)closeMenu();});
render();map=createCaseMap($('#case-map'),{copy});
document.documentElement.dataset.ready='1';
window.addEventListener('pagehide',event=>{if(!event.persisted)map?.destroy();});
