/* Snapshot of application v.0.44, CB-SONUC-2025/142-1. */
(() => {
const scenarios = [
  {
    "kind": "Analiz senaryosu",
    "title": "Belgeler doğrulandığında talebin daha güçlü desteklenmesi",
    "reach": 32.68,
    "children": [
      {
        "kind": "Koşullu gelişme",
        "title": "Koşullar doğrulanırsa",
        "reach": 10.09,
        "children": [
          {
            "kind": "Koşullu gelişme",
            "title": "Bütün koşulların sağlandığı kabul edilirse",
            "reach": 4.48,
            "children": [
              {
                "kind": "Olası karar",
                "title": "Dosyadaki talep kabul edilir",
                "reach": 4.48,
                "children": []
              }
            ]
          },
          {
            "kind": "Koşullu gelişme",
            "title": "İstemin zorunlu bir koşulunun gerçekleşmediği belirlenirse",
            "reach": 3.14,
            "children": [
              {
                "kind": "Olası karar",
                "title": "Dosyadaki talep koşulları oluşmadığından reddedilir",
                "reach": 3.14,
                "children": []
              }
            ]
          },
          {
            "kind": "Koşullu gelişme",
            "title": "Araştırma sonunda ispat eksikliği giderilemezse",
            "reach": 2.47,
            "children": [
              {
                "kind": "Olası karar",
                "title": "Dosyadaki talep ispatlanamadığı için reddedilir",
                "reach": 2.47,
                "children": []
              }
            ]
          }
        ]
      },
      {
        "kind": "Koşullu gelişme",
        "title": "Yeni veya çelişkili bulgu çıkarsa",
        "reach": 22.59,
        "children": [
          {
            "kind": "Koşullu gelişme",
            "title": "Bütün koşulların sağlandığı kabul edilirse",
            "reach": 9.82,
            "children": [
              {
                "kind": "Olası karar",
                "title": "Dosyadaki talep kabul edilir",
                "reach": 9.82,
                "children": []
              }
            ]
          },
          {
            "kind": "Koşullu gelişme",
            "title": "İstemin zorunlu bir koşulunun gerçekleşmediği belirlenirse",
            "reach": 8.67,
            "children": [
              {
                "kind": "Olası karar",
                "title": "Dosyadaki talep koşulları oluşmadığından reddedilir",
                "reach": 8.67,
                "children": []
              }
            ]
          },
          {
            "kind": "Koşullu gelişme",
            "title": "Araştırma sonunda ispat eksikliği giderilemezse",
            "reach": 4.09,
            "children": [
              {
                "kind": "Olası karar",
                "title": "Dosyadaki talep ispatlanamadığı için reddedilir",
                "reach": 4.09,
                "children": []
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "kind": "Analiz senaryosu",
    "title": "Eksik kayıtların sonucu değiştirmesi veya ek inceleme gerekmesi",
    "reach": 21.57,
    "children": [
      {
        "kind": "Koşullu gelişme",
        "title": "Koşullar doğrulanırsa",
        "reach": 7.43,
        "children": [
          {
            "kind": "Koşullu gelişme",
            "title": "Bütün koşulların sağlandığı kabul edilirse",
            "reach": 1.23,
            "children": [
              {
                "kind": "Olası karar",
                "title": "Dosyadaki talep kabul edilir",
                "reach": 1.23,
                "children": []
              }
            ]
          },
          {
            "kind": "Koşullu gelişme",
            "title": "İstemin zorunlu bir koşulunun gerçekleşmediği belirlenirse",
            "reach": 2.82,
            "children": [
              {
                "kind": "Olası karar",
                "title": "Dosyadaki talep koşulları oluşmadığından reddedilir",
                "reach": 2.82,
                "children": []
              }
            ]
          },
          {
            "kind": "Koşullu gelişme",
            "title": "Araştırma sonunda ispat eksikliği giderilemezse",
            "reach": 3.38,
            "children": [
              {
                "kind": "Olası karar",
                "title": "Dosyadaki talep ispatlanamadığı için reddedilir",
                "reach": 3.38,
                "children": []
              }
            ]
          }
        ]
      },
      {
        "kind": "Koşullu gelişme",
        "title": "Yeni veya çelişkili bulgu çıkarsa",
        "reach": 14.14,
        "children": [
          {
            "kind": "Koşullu gelişme",
            "title": "Bütün koşulların sağlandığı kabul edilirse",
            "reach": 4.93,
            "children": [
              {
                "kind": "Olası karar",
                "title": "Dosyadaki talep kabul edilir",
                "reach": 4.93,
                "children": []
              }
            ]
          },
          {
            "kind": "Koşullu gelişme",
            "title": "İstemin zorunlu bir koşulunun gerçekleşmediği belirlenirse",
            "reach": 6.93,
            "children": [
              {
                "kind": "Olası karar",
                "title": "Dosyadaki talep koşulları oluşmadığından reddedilir",
                "reach": 6.93,
                "children": []
              }
            ]
          },
          {
            "kind": "Koşullu gelişme",
            "title": "Araştırma sonunda ispat eksikliği giderilemezse",
            "reach": 2.28,
            "children": [
              {
                "kind": "Olası karar",
                "title": "Dosyadaki talep ispatlanamadığı için reddedilir",
                "reach": 2.28,
                "children": []
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "kind": "Analiz senaryosu",
    "title": "Tarafların maliyet ve süreyi değerlendirerek uzlaşması",
    "reach": 45.75,
    "children": [
      {
        "kind": "Koşullu gelişme",
        "title": "Taraflar anlaşmayı doğrularsa",
        "reach": 15.25,
        "children": [
          {
            "kind": "Koşullu gelişme",
            "title": "Sulh şartları ve bu yöndeki ortak istem doğrulanırsa",
            "reach": 5.3,
            "children": [
              {
                "kind": "Olası karar",
                "title": "Sulh sözleşmesindeki koşullara göre karar verilir",
                "reach": 5.3,
                "children": []
              }
            ]
          },
          {
            "kind": "Koşullu gelişme",
            "title": "Sulh bütün uyuşmazlığı kapsar ve şartlara göre hüküm istenmezse",
            "reach": 9.95,
            "children": [
              {
                "kind": "Olası karar",
                "title": "Sulh nedeniyle esas hakkında karar verilmesine yer olmadığına karar verilir",
                "reach": 9.95,
                "children": []
              }
            ]
          }
        ]
      },
      {
        "kind": "Koşullu gelişme",
        "title": "Görüşmeler anlaşmayla sonuçlanmazsa",
        "reach": 30.5,
        "children": [
          {
            "kind": "Koşullu gelişme",
            "title": "Bütün koşulların sağlandığı kabul edilirse",
            "reach": 13.68,
            "children": [
              {
                "kind": "Olası karar",
                "title": "Dosyadaki talep kabul edilir",
                "reach": 13.68,
                "children": []
              }
            ]
          },
          {
            "kind": "Koşullu gelişme",
            "title": "İstemin zorunlu bir koşulunun gerçekleşmediği belirlenirse",
            "reach": 10.09,
            "children": [
              {
                "kind": "Olası karar",
                "title": "Dosyadaki talep koşulları oluşmadığından reddedilir",
                "reach": 10.09,
                "children": []
              }
            ]
          },
          {
            "kind": "Koşullu gelişme",
            "title": "Araştırma sonunda ispat eksikliği giderilemezse",
            "reach": 6.73,
            "children": [
              {
                "kind": "Olası karar",
                "title": "Dosyadaki talep ispatlanamadığı için reddedilir",
                "reach": 6.73,
                "children": []
              }
            ]
          }
        ]
      }
    ]
  }
];
const get = name => document.getElementById('lease-' + name);
const percent = value => '%' + value.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
const recorded = {
  kind: 'Gerçekleşen yol', title: 'Demo dava kaydı açıldı', recorded: true,
  children: [{kind:'Kayıtlı karar', title:'Müvekkilin talebi reddedildi', recorded:true, children:[]}]
};
const root = {kind:'Dosya', title:'Kira bedeli uyuşmazlığı', reach:100, recorded:true, children:[recorded,...scenarios]};
const graph = get('plane');
const viewport = get('view');
const expanded = new Set([root, recorded]);
const assumptions = [1,1,-1];
const totals = new Map();
const all = [];
function index(node, parent, branch) {
  node.parent = parent;
  node.branch = branch;
  node.id = all.length;
  all.push(node);
  if (node.kind === 'Olası karar') totals.set(node.title, (totals.get(node.title) || 0) + node.reach);
  node.children.forEach(child => index(child, node, node===root ? scenarios.indexOf(child) : branch));
}
index(root,null,-1);
for (const [title,amount] of totals) {
  const row=document.createElement('p');
  row.textContent=title+' · '+percent(amount);
  get('outcomes').append(row);
}
let selected=root;
const levels=[0.25,0.5,0.75,1,1.25,1.5,2];
let zoom=viewport.clientWidth < 520 ? 1 : viewport.clientWidth < 720 ? 2 : 3;
const column=242, row=111, cardWidth=202, cardHeight=96;
let dimensions;
function draw() {
  let nextRow=0, lastColumn=0;
  const visible=[];
  function layout(node,depth) {
    const children=expanded.has(node) ? node.children : [];
    children.forEach(child => layout(child,depth+1));
    node.x=16+depth*column;
    node.y=children.length ? (children[0].y+children.at(-1).y)/2 : 14+nextRow++*row;
    lastColumn=Math.max(lastColumn,depth);
    visible.push(node);
  }
  layout(root,0);
  dimensions={width:cardWidth+32+lastColumn*column,height:nextRow*row+20};
  graph.replaceChildren();
  const ns='http://www.w3.org/2000/svg';
  const lines=document.createElementNS(ns,'svg');
  lines.setAttribute('width',dimensions.width);lines.setAttribute('height',dimensions.height);
  lines.setAttribute('aria-hidden','true');graph.append(lines);
  visible.sort((a,b)=>a.id-b.id);
  for(const node of visible){
    if(node.parent){
      const edge=document.createElementNS(ns,'path');
      const x=node.parent.x+cardWidth,y=node.parent.y+cardHeight/2;
      const endY=node.y+cardHeight/2, mid=(x+node.x)/2;
      edge.setAttribute('d', 'M '+x+' '+y+' C '+mid+' '+y+' '+mid+' '+endY+' '+node.x+' '+endY);
      edge.setAttribute('class',node.recorded?'recorded':'alternative');lines.append(edge);
    }
    const button=document.createElement('button');
    button.type='button'; button.className='lease-node'+(node.recorded?' recorded':'');
    button.dataset.node=node.id;button.style.left=node.x+'px';button.style.top=node.y+'px';
    button.setAttribute('aria-pressed',String(node===selected));
    if(node.children.length) button.setAttribute('aria-expanded',String(expanded.has(node)));
    const kind=document.createElement('small'),title=document.createElement('strong'),weight=document.createElement('span');
    kind.textContent=node.kind;title.textContent=node.title;
    weight.textContent=node.reach===undefined?'Dosyada kayıtlı':'Başlangıçtan ulaşma '+percent(node.reach);
    button.append(kind,title,weight);button.title=node.title;
    button.onclick=()=>choose(node);graph.append(button);
  }
  scale();
}
function scale() {
  const ratio=levels[zoom];
  graph.style.width=dimensions.width+'px';graph.style.height=dimensions.height+'px';
  graph.style.transform='scale('+ratio+')';
  get('sizer').style.width=dimensions.width*ratio+'px';
  get('sizer').style.height=dimensions.height*ratio+'px';
  get('scale').textContent=percent(ratio*100);
  get('minus').disabled=zoom===0; get('plus').disabled=zoom===levels.length-1;
}
function zoomBy(step, x=viewport.clientWidth/2, y=viewport.clientHeight/2) {
  const previous=levels[zoom];zoom=Math.max(0,Math.min(levels.length-1,zoom+step));scale();
  const factor=levels[zoom]/previous;
  viewport.scrollTo((viewport.scrollLeft+x)*factor-x,(viewport.scrollTop+y)*factor-y);
}
get('plus').onclick=()=>zoomBy(1);get('minus').onclick=()=>zoomBy(-1);
viewport.addEventListener('wheel',event=>{
  if(!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  const rect=viewport.getBoundingClientRect();
  zoomBy(event.deltaY<0?1:-1,event.clientX-rect.left,event.clientY-rect.top);
},{passive:false});
function updatePanel(){
  get('title').textContent=selected.title;
  get('path').textContent=selected.reach===undefined?'Dosyada kayıtlı':'Başlangıçtan ulaşma '+percent(selected.reach);
  get('info').textContent=selected===root?'Dosyada kayıtlı sonuç: Müvekkilin talebi reddedildi.':
    selected.recorded?'Dosyaya kaydedilen gerçekleşmiş yol.':
    'Senaryo: '+scenarios[selected.branch].title+'.';
  get('assumption').hidden=selected.branch<0;
  if(selected.branch>=0){
    const value=assumptions[selected.branch];
    get('choice').value=value;
    get('score').textContent='Destek puanı '+(50+12*value)+'/100 · Nötr başlangıç 50, doğrudan bağlı kayıt 1.';
  }
}
function choose(node){
  selected=node;
  if(node.children.length && node!==root){
    if(expanded.has(node)) expanded.delete(node);
    else expanded.add(node);
  }
  draw();updatePanel();
  const button=graph.querySelector('[data-node="'+node.id+'"]');
  button.focus({preventScroll:true});
  const ratio=levels[zoom];
  const top=node.y*ratio;
  if(top<viewport.scrollTop||top+cardHeight*ratio>viewport.scrollTop+viewport.clientHeight)
    viewport.scrollTop=top-viewport.clientHeight/2+cardHeight*ratio/2;
  updateExpand();
}
get('choice').onchange=event=>{assumptions[selected.branch]=Number(event.target.value);updatePanel();};
const parents=all.filter(node=>node.children.length);
function updateExpand(){
  get('expand').textContent=parents.every(n=>expanded.has(n))?'Dalları toparla':'Tüm dalları aç';
}
get('expand').onclick=()=>{
  const collapse=parents.every(n=>expanded.has(n));
  expanded.clear();(collapse?[root,recorded]:parents).forEach(n=>expanded.add(n));
  selected=root;draw();updatePanel();updateExpand();
  if(collapse)viewport.scrollTo(0,0);
};
draw();updatePanel();
})();
