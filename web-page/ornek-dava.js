/* All records and probabilities in this example are fictional. */
const outcomeNames = ['Tam kabul', 'Kısmi kabul', 'Ret'];
const branchNames = ['Doğrulanır', 'Doğrulanamaz'];
const branches = [
  {title:'Teslim kaydı doğrulanırsa', note:'Fişteki imzanın yetkili alıcıya ait olduğunu varsayın. Teslim miktarı yine tartışılabilir.', doc:'teslim'},
  {title:'Teslim kaydı doğrulanamazsa', note:'Teslim alanın kimliği açık kalıyor. Alıcının yazışması, sekiz masa hakkında ayrı bir dayanak sunuyor.', doc:'itiraz'}
];
const outcomes = [
  {note:'Bu yolda talebin tamamının kabul edildiği varsayılır. Örnekte talep edilen bedel 120.000 TL.', doc:'siparis'},
  {note:'Bu yolda talebin yalnız bir bölümü kabul edilir. Örnekte sekiz masanın teslimi ayrıca tartışılıyor.', doc:'itiraz'},
  {note:'Bu yolda talebin reddedildiği varsayılır. Dosyada teslimi ve miktarı destekleyen kayıtları inceleyin.', doc:'teslim'}
];
const initial = () => ({chance:60, weights:[[70,20,10],[10,40,50]], branch:0, leaf:null, yaw:0});
let state = initial();
const $ = id => document.getElementById(id);
const tree = $('tree');
const format = n => '%' + n.toLocaleString('tr-TR',{maximumFractionDigits:2});
const scene = [];
const edges = [];
const svg = (tag, parent, attrs={}) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg',tag);
  for (const [key,value] of Object.entries(attrs)) el.setAttribute(key,value);
  parent.append(el);
  return el;
};
function select(level,index) {
  if (level === 0) { state.leaf = -1; }
  if (level === 1) { state.branch = index; state.leaf = null; }
  if (level === 2) { state.leaf = index; }
  render();
}
for(let i=0;i<5;i++) edges.push(svg('path',tree,{class:'edge'}));
for (const [level,names] of [['Alacak davası'],branchNames,outcomeNames].entries()) {
  names.forEach((name,index) => {
    const g = svg('g',tree,{role:'button',tabindex:'0'});
    const side = svg('rect',g,{class:'node-depth',rx:10,y:-21,height:52});
    const box = svg('rect',g,{class:'node-box',rx:10,y:-26,height:52});
    const label = svg('text',g,{'text-anchor':'middle',y:-3});
    const value = svg('text',g,{'text-anchor':'middle',y:18,class:'percent'});
    label.textContent = name;
    g.addEventListener('click',()=>select(level,index));
    g.addEventListener('keydown',event=>{
      if (event.key==='Enter'||event.key===' ') {event.preventDefault();select(level,index);}
    });
    scene.push({g,box,side,value,level,index,name});
  });
}
const results = outcomeNames.map(name=>{
  const row=document.createElement('div');
  row.className='result';
  const label=document.createElement('span'),track=document.createElement('span');
  const bar=document.createElement('i'),value=document.createElement('b');
  label.textContent=name; track.className='track';track.append(bar);row.append(label,track,value);$('totals').append(row);
  return {bar,value};
});
function draw() {
  const width = Math.max(290, tree.clientWidth);
  tree.setAttribute('viewBox','0 0 '+width+' 360');
  const spread=width*0.305, split=width*0.225;
  const positions=[[0,-126,0],[-split,-12,26],[split,-12,-26],[-spread,121,6],[0,121,30],[spread,121,-8]];
  const projected=positions.map(([x,y,z])=>{
    const depth=z*Math.cos(state.yaw)-x*Math.sin(state.yaw);
    const scale=780/(780-depth);
    return [width/2+(x*Math.cos(state.yaw)+z*Math.sin(state.yaw))*scale,176+(y-depth*0.09)*scale];
  });
  for (const [i,node] of scene.entries()){
    const [x,y]=projected[i];
    const boxWidth=node.level===2?Math.min(120,width*0.28):Math.min(148,width*0.39);
    node.g.setAttribute('transform','translate('+x+' '+y+')');
    node.side.setAttribute('x',-boxWidth/2 + 3 + Math.sin(state.yaw)*12);
    node.side.setAttribute('width',boxWidth);
    node.box.setAttribute('x',-boxWidth/2);node.box.setAttribute('width',boxWidth);
    const active=node.level===0?state.leaf===-1:node.level===1?node.index===state.branch:node.index===state.leaf;
    node.g.setAttribute('class',active?'active':'');
    node.g.setAttribute('aria-pressed',String(active));
    const amount=node.level===0?'120.000 TL':format(node.level===1?(node.index===0?state.chance:100-state.chance):state.weights[state.branch][node.index]);
    node.value.textContent=amount;
    node.g.setAttribute('aria-label',node.name+' '+amount+(node.level===2?' · '+branches[state.branch].title:''));
  }
  edges.forEach((edge,i)=>{
    const [x,y]=projected[i<2?0:1+state.branch], [u,v]=projected[i+1];
    const mid=(y+v)/2;
    edge.setAttribute('d','M '+x+' '+y+' C '+x+' '+mid+' '+u+' '+mid+' '+u+' '+v);
    edge.setAttribute('class','edge'+(i===state.branch||i>=2?' current':''));
  });
}
function render(){
  const branch=branches[state.branch], weights=state.weights[state.branch];
  const detail=state.leaf===-1?{title:'Alacak davası',note:'Siparişteki on iki masa için bedel talep ediliyor. İlk ayrım teslim fişinin doğrulanmasına dayanıyor.',doc:'siparis'}:
    state.leaf===null?branch:{...outcomes[state.leaf],title:branch.title+' · '+outcomeNames[state.leaf]};
  $('detail-title').textContent=detail.title;$('detail-text').textContent=detail.note;
  $('doc-link').href='#'+detail.doc;
  $('doc-link').textContent=$(detail.doc).querySelector('summary').firstChild.textContent.trim()+' belgesini incele ↓';
  $('branch-label').textContent=branch.title+' · koşullu sonuçlar';
  $('chance').value=state.chance;$('chance-out').textContent=format(state.chance);
  $('full').value=weights[0];$('full-out').textContent=format(weights[0]);
  $('partial').max=100-weights[0];$('partial').value=weights[1];$('partial-out').textContent=format(weights[1]);
  results.forEach(({bar,value},i)=>{
    const percent=(state.chance*state.weights[0][i]+(100-state.chance)*state.weights[1][i])/100;
    bar.style.width=percent+'%';value.textContent=format(percent);
  });draw();
}
$('chance').oninput=e=>{state.chance=Number(e.target.value);render();};
function updateWeights(){
  const full=Number($('full').value),partial=Math.min(Number($('partial').value),100-full);
  state.weights[state.branch]=[full,partial,100-full-partial];render();
}
$('full').oninput=updateWeights;$('partial').oninput=updateWeights;
$('doc-link').onclick=()=>{const doc=document.querySelector($('doc-link').hash);doc.open=true;doc.querySelector('summary').focus();};
$('reset').onclick=()=>{state=initial();render();};
$('rotate').onclick=()=>{state.yaw=state.yaw>0.2?-0.25:state.yaw<0?0:0.25;draw();};
let drag;
tree.onpointerdown=e=>{if(!e.target.closest('g'))drag={x:e.clientX,yaw:state.yaw};};
tree.onpointermove=e=>{if(drag){state.yaw=Math.max(-0.32,Math.min(0.32,drag.yaw+(e.clientX-drag.x)/320));draw();}};
window.addEventListener('pointerup',()=>drag=null);tree.onpointercancel=()=>drag=null;
new ResizeObserver(draw).observe(tree);
render();
