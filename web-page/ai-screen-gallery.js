/* Screenshots captured from the existing CaseBridge application. */
(() => {
  const gallery=document.querySelector('[data-ai-gallery]');
  if(!gallery)return;
  Object.assign(window.casebridgeTranslations,{
    'AI application screens':'Yapay zekâ uygulama ekranları',
    'Rehearse the conversation.':'Konuşmanın provasını yap.',
    'Your argument, the AI opponent’s reply and the judge’s questions.':'Senin argümanın, yapay zekâ karşı tarafın yanıtı ve hâkimin soruları.',
    'Challenge the evidence.':'Delilleri karşılıklı tartış.',
    'Follow the claim, the objection and the response in one transcript.':'İddiayı, itirazı ve cevabı aynı tutanakta takip et.',
    'Learn from the rehearsal.':'Her provadan bir şey öğren.',
    'Review evidence use, rebuttals and the next preparation steps.':'Delil kullanımını, karşı cevapları ve sonraki hazırlık adımlarını değerlendir.',
    'Enlarge the hearing conversation screenshot':'Duruşma konuşması görüntüsünü büyüt',
    'Enlarge the evidence discussion screenshot':'Delil tartışması görüntüsünü büyüt',
    'Enlarge the training evaluation screenshot':'Eğitim değerlendirmesi görüntüsünü büyüt',
    'Close screenshot':'Görseli kapat',
    'Actual CaseBridge interface showing the lawyer, simulated opposing counsel and judge discussing the fictional 300,000 TL debt case':'Gerçek CaseBridge arayüzünde avukat, simüle edilen karşı avukat ve hâkimin kurgusal 300.000 TL borç davasını tartışması',
    'Actual CaseBridge hearing transcript: the lawyer presents a payment record, opposing counsel presents a business plan and the judge questions the evidence':'Gerçek CaseBridge duruşma tutanağında avukat ödeme kaydını, karşı avukat iş planını sunuyor; hâkim delilleri sorguluyor',
    'Actual CaseBridge training evaluation for the same fictional hearing, showing a 73 out of 100 practice score, evidence feedback and improvement areas':'Gerçek CaseBridge arayüzünde aynı kurgusal duruşmanın 73/100 eğitim puanı, delil geri bildirimi ve gelişim alanları'
  });
  Object.assign(window.casebridgeTranslations, {"Actual CaseBridge hearing conversation with fictional demo data": "Kurgusal demo verileriyle gerçek CaseBridge duruşma konuşması", "Actual CaseBridge hearing transcript showing bank transfer evidence and the judge's questions": "Gerçek CaseBridge duruşma tutanağında banka dekontu delili ve hâkimin soruları", "Actual CaseBridge training evaluation with feedback and practice scores for a fictional hearing": "Gerçek CaseBridge arayüzünde kurgusal bir duruşmanın eğitim puanları ve geri bildirimleri"});
  const tabs=[...gallery.querySelectorAll('[data-ai-shot]')];
  const dialog=document.getElementById('actual-ai-dialog');
  let trigger=null;
  function syncLanguage(){
    const language=document.documentElement.lang==='tr'?'tr':'en';
    gallery.querySelectorAll('img[data-ai-screen-en]').forEach(image=>{
      const source=image.getAttribute('data-ai-screen-'+language);
      if(image.getAttribute('src')!==source)image.setAttribute('src',source);
    });
    if(dialog.open){
      const tab=tabs.find(button=>button.getAttribute('aria-selected')==='true');
      const current=document.getElementById(tab.getAttribute('aria-controls')).querySelector('img');
      const expanded=dialog.querySelector('img');
      expanded.src=current.getAttribute('src');expanded.alt=current.alt;
      document.getElementById('actual-ai-dialog-title').textContent=tab.querySelector('strong').textContent;
    }
  }
  syncLanguage();
  window.addEventListener('casebridge:languagechange',syncLanguage);
  function activate(tab){
    tabs.forEach(button=>{const active=tab===button;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;document.getElementById(button.getAttribute('aria-controls')).hidden=!active;});
  }
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>activate(tab));
    tab.addEventListener('keydown',e=>{
      let next;
      if(e.key==='ArrowDown')next=(index+1)%tabs.length;
      if(e.key==='ArrowUp')next=(index+tabs.length-1)%tabs.length;
      if(e.key==='Home')next=0;if(e.key==='End')next=tabs.length-1;
      if(next!==undefined){e.preventDefault();activate(tabs[next]);tabs[next].focus({preventScroll:true});}
    });
  });
  gallery.addEventListener('click',e=>{
    const button=e.target.closest('[data-ai-enlarge]');
    if(!button)return;
    trigger=button;
    const image=button.querySelector('img'),expanded=dialog.querySelector('img');
    expanded.src=image.getAttribute('src');expanded.alt=image.alt;
    document.getElementById('actual-ai-dialog-title').textContent=tabs.find(tab=>tab.getAttribute('aria-selected')==='true').querySelector('strong').textContent;
    dialog.showModal();document.body.classList.add('actual-ai-scroll-locked');dialog.querySelector('[data-ai-close]').focus({preventScroll:true});
  });
  dialog.querySelector('[data-ai-close]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>{document.body.classList.remove('actual-ai-scroll-locked');trigger?.focus({preventScroll:true});});
})();
