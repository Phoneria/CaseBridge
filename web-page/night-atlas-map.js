// Original 3D geometry and shaders. No library, model download or wheel capture.
const NODES=[
 ['case',0,0,.3],['contract',-2.3,2.1,-.5],['delivery',-2.3,-1.85,.4],['payment',1.8,2.2,-.6],['dispute',2.9,.15,-.3],['trial',2.2,-1.8,.9],['office',-.1,-3.6,-.2],['finding',-.6,3,.5]
];
const EDGES=[[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[1,7],[2,7],[3,5],[4,5],[5,6],[1,2]];
const teal=[.30,.82,.76],amber=[.93,.70,.34];
export function createCaseMap(stage,{copy,onMotionChange=()=>{}}={}){
 const canvas=stage.querySelector('canvas'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const gl=canvas.getContext('webgl',{alpha:true,antialias:true,powerPreference:'low-power',preserveDrawingBuffer:true});
 let yaw=-.06,pitch=0,animated=!reduced.matches,visible=true,raf=0,last=0,phase=0,selected='payment',destroyed=false;
 const buttons=[...document.querySelectorAll('[data-map-control]')];
 const ns='http://www.w3.org/2000/svg',leaders=document.createElementNS(ns,'svg');leaders.classList.add('map-leaders');leaders.setAttribute('aria-hidden','true');stage.append(leaders);const leaderLines=NODES.map(()=>{const line=document.createElementNS(ns,'line');leaders.append(line);return line;});
 const labels=NODES.map(n=>stage.querySelector(`[data-map-node="${n[0]}"]`));
 const updatePause=()=>{const b=buttons.find(b=>b.dataset.mapControl==='pause');if(b){b.textContent=copy()[animated?'pause':'play'];b.setAttribute('aria-pressed',String(!animated));}onMotionChange(animated);};
 const fallback=()=>{stage.classList.remove('has-webgl');stage.dataset.renderer='static';document.querySelector('#map-fallback-status').hidden=false;buttons.forEach(b=>b.disabled=true);cancelAnimationFrame(raf);};
 if(!gl){fallback();return {setSelection(){},refresh:updatePause,destroy(){}};}
 const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('shader');return s;};
 let program;
 try{
  program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,`precision mediump float;attribute vec3 aPosition;attribute vec3 aColor;uniform vec2 uAngle;uniform float uAspect;uniform float uFocal;uniform float uPoint;uniform float uPixel;varying vec3 vColor;void main(){float cy=cos(uAngle.x),sy=sin(uAngle.x),cx=cos(uAngle.y),sx=sin(uAngle.y);vec3 p=vec3(aPosition.x*cy+aPosition.z*sy,aPosition.y,-aPosition.x*sy+aPosition.z*cy);p=vec3(p.x,p.y*cx-p.z*sx,p.y*sx+p.z*cx);float depth=7.0-p.z;gl_Position=vec4(p.x*uFocal/uAspect,p.y*uFocal,depth*1.01005-.201005,depth);gl_PointSize=uPoint*uPixel*(7.0/depth);vColor=aColor;}`));
  gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`precision mediump float;uniform float uPoint;uniform float uAlpha;varying vec3 vColor;void main(){float a=uAlpha;if(uPoint>0.0){float d=length(gl_PointCoord-.5)*2.0;if(d>1.0)discard;a*=1.0-smoothstep(.08,1.0,d);}gl_FragColor=vec4(vColor,a);}`));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('program');
 }catch{fallback();return {setSelection(){},refresh:updatePause,destroy(){}};}
 const loc={position:gl.getAttribLocation(program,'aPosition'),color:gl.getAttribLocation(program,'aColor')};
 for(const key of ['uAngle','uAspect','uFocal','uPoint','uPixel','uAlpha'])loc[key]=gl.getUniformLocation(program,key);
 const lines=gl.createBuffer(),points=gl.createBuffer(),stars=gl.createBuffer();
 const pointData=[];NODES.forEach((n,i)=>pointData.push(...n.slice(1),...(i===2||i===7?amber:teal)));
 gl.bindBuffer(gl.ARRAY_BUFFER,points);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(pointData),gl.STATIC_DRAW);
 const starData=[];for(let i=0;i<170;i++){const a=i*2.399963,z=-3+(i%13)*.43,r=2.2+(i%19)*.12;starData.push(Math.cos(a)*r,Math.sin(a)*r,z,.25,.43,.49);}gl.bindBuffer(gl.ARRAY_BUFFER,stars);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(starData),gl.STATIC_DRAW);
 let lineCount=0;
 function updateLines(){const data=[];for(const [a,b] of EDGES){const from=NODES[a].slice(1),to=NODES[b].slice(1),active=(selected==='payment'&&(b===3||a===3))||(selected==='delivery'&&(b===4||a===4)),color=active?teal:(b===7?amber:[.14,.39,.43]);for(let i=0;i<20;i++){for(const t of [i/20,(i+1)/20]){const bend=Math.sin(t*Math.PI)*.6;data.push(from[0]+(to[0]-from[0])*t,from[1]+(to[1]-from[1])*t,from[2]+(to[2]-from[2])*t+bend,...color);}}}for(let ring=0;ring<3;ring++){for(let i=0;i<100;i++){for(const j of [i,i+1]){const a=j/100*Math.PI*2,x=3.7*Math.cos(a),y=3.3*Math.sin(a),t=(ring-1)*.55;data.push(x*Math.cos(t)-y*Math.sin(t),x*Math.sin(t)+y*Math.cos(t),Math.sin(a+ring)*1.25,.09,.27,.31);}}}lineCount=data.length/6;gl.bindBuffer(gl.ARRAY_BUFFER,lines);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);}
 updateLines();
 const bind=(buffer)=>{gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.vertexAttribPointer(loc.position,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(loc.color,3,gl.FLOAT,false,24,12);};
 function render(time=0){
  if(destroyed)return;raf=0;
  const rect=stage.getBoundingClientRect(),w=rect.width,h=rect.height;if(w<1||h<1)return;
  const dpr=Math.min(devicePixelRatio||1,1.5),width=Math.round(w*dpr),height=Math.round(h*dpr);if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  const focal=w<500?1.45:1.7,angle=yaw+(animated?Math.sin(phase)*.055:0),tilt=pitch+(animated?Math.cos(phase*.7)*.018:0);
  gl.viewport(0,0,width,height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.useProgram(program);gl.enableVertexAttribArray(loc.position);gl.enableVertexAttribArray(loc.color);gl.uniform2f(loc.uAngle,angle,tilt);gl.uniform1f(loc.uAspect,w/h);gl.uniform1f(loc.uFocal,focal);gl.uniform1f(loc.uPixel,dpr);
  bind(stars);gl.uniform1f(loc.uPoint,2.2);gl.uniform1f(loc.uAlpha,.7);gl.drawArrays(gl.POINTS,0,starData.length/6);
  bind(lines);gl.uniform1f(loc.uPoint,0);gl.uniform1f(loc.uAlpha,.95);gl.drawArrays(gl.LINES,0,lineCount);
  bind(points);gl.uniform1f(loc.uPoint,14);gl.uniform1f(loc.uAlpha,1);gl.drawArrays(gl.POINTS,0,NODES.length);
  const cy=Math.cos(angle),sy=Math.sin(angle),cx=Math.cos(tilt),sx=Math.sin(tilt);
  // Measure together, then solve label collisions without interleaving layout
  // reads and writes. The WebGL geometry stays at its true 3D position; thin
  // screen-space leaders retain the association when a label needs space.
  const poses=NODES.map((n,i)=>{const x=n[1]*cy+n[3]*sy,z=-n[1]*sy+n[3]*cy,y=n[2]*cx-z*sx,depth=7-(n[2]*sx+z*cx),px=(x*focal/(w/h)/depth+1)*w/2,py=(1-y*focal/depth)*h/2;return {x:px,y:py,ox:px,oy:py,w:labels[i].offsetWidth,h:labels[i].offsetHeight,depth};});
  const clamp=p=>{p.x=Math.max(p.w/2+3,Math.min(w-p.w/2-3,p.x));p.y=Math.max(p.h/2+3,Math.min(h-p.h/2-3,p.y));return p;};
  const overlap=(a,b)=>Math.max(0,(a.w+b.w)/2+7-Math.abs(a.x-b.x))*Math.max(0,(a.h+b.h)/2+7-Math.abs(a.y-b.y));
  poses.forEach(clamp);
  for(let round=0;round<8;round++){let changed=false;for(let i=0;i<poses.length;i++)for(let j=i+1;j<poses.length;j++){
   if(!overlap(poses[i],poses[j]))continue;const a=poses[i],p=poses[j],dx=(a.w+p.w)/2+9,dy=(a.h+p.h)/2+9;
   const candidates=[{...p,x:a.x-dx},{...p,x:a.x+dx},{...p,y:a.y-dy},{...p,y:a.y+dy}].map(clamp);
   const score=q=>poses.reduce((sum,other,k)=>sum+(k===j?0:overlap(q,other)*1000),0)+(q.x-p.ox)**2+(q.y-p.oy)**2;
   const best=candidates.sort((x,y)=>score(x)-score(y))[0];if(score(best)<score(p)){poses[j]=best;changed=true;}
  }if(!changed)break;}
  if(w<330){const slots=[[.5,h/2],[.25,92],[.25,h-94],[.75,92],[.75,h-30],[.75,h-94],[.25,h-30],[.5,28]];poses.forEach((p,i)=>{p.x=w*slots[i][0];p.y=slots[i][1];clamp(p);});}
  leaders.setAttribute('viewBox',`0 0 ${w} ${h}`);
  poses.forEach((p,i)=>{const label=labels[i];label.style.left=p.x+'px';label.style.top=p.y+'px';label.style.zIndex=String(Math.round(20-p.depth));const line=leaderLines[i];line.setAttribute('x1',p.ox);line.setAttribute('y1',p.oy);line.setAttribute('x2',p.x);line.setAttribute('y2',p.y);line.style.opacity=Math.hypot(p.x-p.ox,p.y-p.oy)>4?'1':'0';});
  stage.dataset.frames=String(Number(stage.dataset.frames||0)+1);
  if(animated&&visible&&!document.hidden){if(time&&last)phase+=Math.min(time-last,80)*.00025;last=time;raf=requestAnimationFrame(tick);}
 }
 function tick(time){if(time-last<33){raf=requestAnimationFrame(tick);return;}render(time);}
 const requestRender=()=>{if(!raf&&!destroyed)raf=requestAnimationFrame(render);};
 const resize=new ResizeObserver(requestRender);resize.observe(stage);
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){last=0;requestRender();}else{cancelAnimationFrame(raf);raf=0;}},{threshold:.05});observer.observe(stage);
 const visibility=()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;}else if(visible){last=0;requestRender();}};document.addEventListener('visibilitychange',visibility);
 const motion=()=>{if(reduced.matches){animated=false;cancelAnimationFrame(raf);raf=0;}updatePause();requestRender();};reduced.addEventListener('change',motion);
 let pointer=null;
 stage.addEventListener('pointerdown',e=>{if(e.target.closest('a,button')||e.button!==0)return;pointer={x:e.clientX,y:e.clientY,yaw,pitch,id:e.pointerId};});
 stage.addEventListener('pointermove',e=>{if(!pointer||e.pointerId!==pointer.id)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;if(Math.abs(dy)>Math.abs(dx)*1.2&&e.pointerType==='touch'){pointer=null;return;}if(Math.abs(dx)<5)return;animated=false;updatePause();yaw=Math.max(-.45,Math.min(.45,pointer.yaw+dx*.003));pitch=Math.max(-.12,Math.min(.12,pointer.pitch+dy*.001));requestRender();});
 const end=()=>{pointer=null;};stage.addEventListener('pointerup',end);stage.addEventListener('pointercancel',end);stage.addEventListener('pointerleave',end);
 buttons.forEach(button=>button.addEventListener('click',()=>{switch(button.dataset.mapControl){case'left':yaw=Math.max(-.45,yaw-.15);break;case'right':yaw=Math.min(.45,yaw+.15);break;case'pause':animated=!animated;break;case'reset':yaw=-.06;pitch=0;phase=0;break;}updatePause();requestRender();}));
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();fallback();});
 stage.classList.add('has-webgl');stage.dataset.renderer='webgl';updatePause();render();
 return {setSelection(value){selected=value;updateLines();requestRender();},refresh:updatePause,destroy(){destroyed=true;cancelAnimationFrame(raf);observer.disconnect();resize.disconnect();document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',motion);gl.deleteBuffer(lines);gl.deleteBuffer(points);gl.deleteBuffer(stars);gl.deleteProgram(program);}};
}
