// Execute the maintained native route tour against PUBLIC frontend assets only.
// The only login is a fresh disposable synthetic backend; never a production session.
const fs=require('fs'),path=require('path');
const observed=JSON.parse(fs.readFileSync('.gallery-observed.json'));
const app='https://app.casebridge.com.tr';
const batch=path.resolve(process.env.GALLERY_BATCH || '/tmp/casebridge-gallery-batch');
fs.mkdirSync(batch,{recursive:true});
process.env.CAPTURE_SYNTHETIC_CONFIRM='yes';process.env.CAPTURE_REPORT_PATH=path.join(batch,'audit.json');
let source=fs.readFileSync('scripts/capture-product.cjs','utf8');
function replaceOnce(from,to){if(!source.includes(from))throw Error('Native capture contract changed');source=source.replace(from,to);}
replaceOnce("const headers={Authorization:'Bearer '+token};",`const headers={Authorization:'Bearer '+token};
const identify=async()=>{const value=await(await c.request.get('${app}/release.json')).json();return {version:value.version,commit:value.commit};};
const before=await identify();if(JSON.stringify(before)!==JSON.stringify(${JSON.stringify(observed.app)}))throw Error('Public application identity changed');
const productionApiRequests=[],proxyLog=[];
await c.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());
 if(u.pathname==='/api'||u.pathname.startsWith('/api/')) {
   if(u.origin!=='${app}') {productionApiRequests.push(u.origin+u.pathname);await route.abort();throw Error('Unexpected API origin');}
   try {const response=await c.request.fetch('http://127.0.0.1:8044'+u.pathname.slice(4)+u.search,{method:req.method(),headers:{Authorization:'Bearer '+token,...(req.headers()['content-type']?{'Content-Type':req.headers()['content-type']}:{})},data:req.postDataBuffer()||undefined});
    proxyLog.push({method:req.method(),path:u.pathname,status:response.status()});
    await route.fulfill({status:response.status(),headers:response.headers(),body:await response.body()});
   }catch(error){await route.abort();throw error;}return;
 }
 if(u.origin!=='${app}') {await route.abort();return;}
 if(['xhr','fetch'].includes(req.resourceType()) && req.headers()['rsc']!=='1' && !u.pathname.startsWith('/_next/') && u.pathname!=='/release.json') {productionApiRequests.push(u.pathname);await route.abort();return;}
 await route.continue();
});`);
replaceOnce("reducedMotion:'reduce'","reducedMotion:'reduce',serviceWorkers:'block'");
replaceOnce("const root='web-page/assets/feature-screens/tr-current'",`const root=${JSON.stringify(batch)}`);
replaceOnce("await p.goto('http://127.0.0.1:3044'+path",`await p.goto('${app}'+path`);
replaceOnce("JSON.parse(fs.readFileSync('frontend/app-version.json')).version",JSON.stringify(observed.app.version));
replaceOnce("fs.writeFileSync(process.env.CAPTURE_REPORT_PATH",`const after=await identify();if(JSON.stringify(after)!==JSON.stringify(before))throw Error('Public source changed during capture');
fs.writeFileSync(process.env.CAPTURE_REPORT_PATH`);
replaceOnce('JSON.stringify({audit,errors,sourceHash:',"JSON.stringify({audit,errors,before,after,productionApiRequests,proxyLog,sourceHash:");
// Execute exactly the tracked route tour, preserving native screenshots without edits.
new Function('require',source)(require);
