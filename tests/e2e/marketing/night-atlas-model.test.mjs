import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,transition,officeView,BRANCHES,DOCUMENTS,COPY,BOOKING_URL,localized} from '../../../web-page/night-atlas-model.mjs';

test('both branches produce distinct rehearsal and preparation, and clear stale answers',()=>{
 let state=initialState();const first=BRANCHES[state.branch];
 state=transition(state,{type:'answer',value:first.correct});assert.equal(state.answer,first.correct);
 state=transition(state,{type:'plan'});assert.equal(officeView(state).tasks,9);
 state=transition(state,{type:'branch',value:'delivery'});
 assert.equal(state.answer,null);assert.equal(state.planned,false);
 assert.notEqual(localized(BRANCHES[state.branch].question,'tr'),localized(first.question,'tr'));
 assert.notEqual(BRANCHES[state.branch].correct,first.correct);
 assert.notEqual(localized(BRANCHES[state.branch].task,'tr'),localized(first.task,'tr'));
 for(const branch of Object.values(BRANCHES)){
  assert.ok(branch.options[branch.correct]);assert.notEqual(branch.feedback[0],branch.retry[0]);
  assert.ok(!branch.outcome[0].includes('%'));assert.ok(DOCUMENTS[branch.document]);
 }
});
test('bureau and lawyer selection change counts and agenda without duplicate planning',()=>{
 let state=initialState();assert.equal(officeView(state).cases,20);assert.equal(officeView(state).tasks,8);
 state=transition(state,{type:'lawyer',value:'ece'});assert.equal(officeView(state).cases,12);assert.equal(officeView(state).agenda.length,2);
 state=transition(state,{type:'plan'});state=transition(state,{type:'plan'});assert.equal(officeView(state).tasks,6);assert.equal(officeView(state).agenda.filter(t=>t.scenario).length,1);
 state=transition(state,{type:'bureau',value:'shore'});const view=officeView(state);assert.equal(state.lawyer,'all');assert.equal(state.planned,false);assert.equal(view.cases,22);assert.equal(view.tasks,8);assert.ok(view.agenda.every(t=>['selin','mert'].includes(t.who)));
 state=transition(state,{type:'lawyer',value:'mert'});assert.equal(officeView(state).cases,15);assert.equal(officeView(state).tasks,6);assert.equal(officeView(state).agenda.length,1);
});
test('locale keeps the same fictional case and choices; invalid selections preserve state',()=>{
 let state=initialState();state=transition(state,{type:'document',value:'payment'});state=transition(state,{type:'branch',value:'delivery'});state=transition(state,{type:'lang',value:'en'});
 assert.equal(state.branch,'delivery');assert.equal(state.document,'payment');assert.match(localized(DOCUMENTS[state.document].paragraphs[0],state.lang),/45,000/);
 for(const action of [{type:'bureau',value:'bad'},{type:'lawyer',value:'bad'},{type:'branch',value:'bad'},{type:'answer',value:100},{type:'lang',value:'bad'}])assert.deepEqual(transition(state,action),state);
 assert.equal(BOOKING_URL,'https://calendar.app.google/RL4CxQFEZAuVF2xP9');
 assert.match(COPY.tr.fiction,/kurgusal/);assert.match(COPY.en.fiction,/fictional/);assert.match(COPY.tr.unknown,/hesaplanmadı/);
});
