// Synthetic auth; every API request is intercepted. Only privacy endpoints go
// to the dedicated local test backend. No production customer API is forwarded.
const {chromium}=require('playwright');
const path=require('node:path');
const assert=require('node:assert/strict');
const [base='http://127.0.0.1:3194',backend='http://127.0.0.1:8194',fixtures='/tmp/cb-files-fixtures']=process.argv.slice(2);
(async()=>{
 const browser=await chromium.launch({headless:true});const results=[];
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000},permissions:['clipboard-read','clipboard-write']});
  await context.addInitScript(()=>{localStorage.setItem('casebridge_token','synthetic-session');localStorage.setItem('casebridge-theme','light');});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(url=>url.pathname.startsWith('/api/')||url.hostname==='localhost'&&url.port==='8000',async route=>{
   const p=new URL(route.request().url()).pathname.replace(/^\/api/,'');
   if(p.startsWith('/privacy/')){const response=await route.fetch({url:backend+p});return route.fulfill({response});}
   let body={};
   if(p==='/users/me')body={id:'synthetic',email:'synthetic@example.test',full_name:'Sentetik Yönetici',role:'admin',law_firm_id:'synthetic',is_active:true,is_platform_admin:false,workspace_position:null};
   if(p.includes('notifications'))body={items:[],unread_count:0};
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(base+'/ai/anonimlestirme');await page.getByRole('heading',{name:'Anonimleştirme',exact:true}).waitFor();
  for(const file of ['sample.pdf','sample.txt','sample.docx','other.xyz']){
   await page.getByLabel('Dosya yükle',{exact:true}).setInputFiles(path.join(fixtures,file));
   await page.getByText(/Dosyadan metin çıkarıldı/).waitFor();
   assert.match(await page.getByLabel('Kaynak metin',{exact:true}).inputValue(),/sentetik@example.test/);
   assert.equal(await page.getByLabel('Maskelenmiş metin',{exact:true}).inputValue(),'');
   await page.getByRole('button',{name:'Metni maskele',exact:true}).click();
   await page.getByText(/E-POSTA: .*geçiş/).waitFor();
   const masked=await page.getByLabel('Maskelenmiş metin',{exact:true}).inputValue();
   assert.match(masked,/\[E-POSTA-/);assert.ok(!masked.includes('sentetik@example.test'));
   if(file.endsWith('docx'))assert.ok(!masked.includes('tablo@example.test')&&!masked.includes('ustbilgi@example.test'));
  }
  await page.getByRole('button',{name:'Sonucu kopyala'}).click();await page.getByText('Maskelenmiş metin kopyalandı.').waitFor();
  for(const file of ['scanned.pdf','binary.bin']){
   await page.getByLabel('Dosya yükle',{exact:true}).setInputFiles(path.join(fixtures,file));
   await page.getByText(file==='scanned.pdf'?/Belgede okunabilir metin bulunamadı/:/Dosya okunabilir düz metin değil/).waitFor();
   assert.equal(await page.getByLabel('Kaynak metin',{exact:true}).inputValue(),'');
   assert.equal(await page.getByLabel('Maskelenmiş metin',{exact:true}).inputValue(),'');
   assert.equal(await page.getByRole('button',{name:'Sonucu kopyala'}).isDisabled(),true);
  }
  await page.getByLabel('Dosya yükle',{exact:true}).setInputFiles(path.join(fixtures,'sample.docx'));await page.getByText(/Dosyadan metin çıkarıldı/).waitFor();
  await page.getByRole('button',{name:'Metni maskele',exact:true}).click();await page.getByText(/E-POSTA: .*geçiş/).waitFor();
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('horizontal overflow');
  await page.screenshot({path:`/tmp/cb-files-${base.startsWith('https')?'public':'local'}-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Temizle',exact:true}).click();
  assert.equal(await page.getByLabel('Dosya yükle',{exact:true}).inputValue(),'');
  assert.equal(await page.getByLabel('Kaynak metin',{exact:true}).inputValue(),'');
  assert.deepEqual(errors,[]);
  const storage=await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}));
  assert.ok(!storage.includes('sentetik@example.test')&&!storage.includes('0532'));
  results.push({width,pdf:true,txt:true,docxWithTableAndHeader:true,otherExtension:true,scannedAndBinaryErrors:true,copy:true,reset:true,errors});await context.close();
 }
 console.log(JSON.stringify(results));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
