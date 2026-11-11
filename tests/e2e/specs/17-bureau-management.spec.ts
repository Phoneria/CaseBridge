import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import path from "path";
import { BACKEND_URL, DEMO_ADMIN, DEMO_LAWYER, DEMO_PLATFORM, login, newestPasswordLink } from "./helpers";

test.setTimeout(120_000);
const stamp = Date.now();

async function api(request: APIRequestContext, credentials = DEMO_ADMIN) {
  const login = await request.post(`${BACKEND_URL}/auth/login`, {data: credentials});
  expect(login.ok()).toBeTruthy();
  const {access_token} = await login.json();
  return {Authorization: `Bearer ${access_token}`};
}

async function openEditor(page: Page, tab: string, title: string) {
  await page.goto(`/buro?tab=${tab}`);
  await page.getByRole("button", {name:"Yeni kayıt",exact:true}).click();
  const dialog=page.getByRole("dialog");
  await dialog.getByLabel("Başlık *", {exact:true}).fill(title);
  return dialog;
}

test("bureau finance, deadlines, review, scoped portal and mobile navigation", async ({page,browser,request}) => {
  const headers=await api(request);
  const users=await (await request.get(`${BACKEND_URL}/admin/users`,{headers})).json();
  const cases=await (await request.get(`${BACKEND_URL}/cases`,{headers})).json();
  const lawyer=users.find((u:any)=>u.email===DEMO_LAWYER.email);
  const selected=cases.find((c:any)=>c.assigned_lawyer_id===lawyer.id&&!c.is_archived);
  expect(selected).toBeTruthy();
  const me=await (await request.get(`${BACKEND_URL}/users/me`,{headers})).json();

  await login(page);
  await page.getByRole("link",{name:"Büro Yönetimi",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Büro Yönetimi",exact:true})).toBeVisible();
  await expect(page.getByText("Dikkat gerektiren işler",{exact:true})).toBeVisible();

  let dialog=await openEditor(page,"finance",`Ücret ${stamp}`);
  await dialog.getByLabel("Dava *",{exact:true}).selectOption(selected.id);
  await dialog.getByLabel("Tutar *").fill("1250.50");
  await dialog.getByRole("button",{name:"Kaydet",exact:true}).click();
  await expect(page.getByRole("heading",{name:`Ücret ${stamp}`,exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading",{name:`Ücret ${stamp}`,exact:true})).toBeVisible();
  await expect(page.getByRole("table")).toContainText("1.250,50");

  dialog=await openEditor(page,"deadline",`Kritik süre ${stamp}`);
  await dialog.getByLabel("Dava *",{exact:true}).selectOption(selected.id);
  await dialog.getByLabel("Sorumlu *",{exact:true}).selectOption(lawyer.id);
  await dialog.getByLabel("Yedek sorumlu *",{exact:true}).selectOption(me.id);
  const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);
  await dialog.getByLabel("Son tarih *",{exact:true}).fill(tomorrow);
  await dialog.getByLabel("Sürenin dayanağı *").fill("Sentetik süre dayanağı");
  await dialog.getByRole("checkbox",{name:/Süre dayanağını/}).check();
  await dialog.getByRole("button",{name:"Kaydet",exact:true}).click();
  await expect(page.getByRole("heading",{name:`Kritik süre ${stamp}`,exact:true})).toBeVisible();

  dialog=await openEditor(page,"approval",`İnceleme ${stamp}`);
  await dialog.getByLabel("Dava *",{exact:true}).selectOption(selected.id);
  await dialog.getByLabel("Sorumlu *",{exact:true}).selectOption(lawyer.id);
  await dialog.getByLabel("İncelenecek taslak / açıklama").fill("Sentetik inceleme metni");
  await dialog.getByRole("button",{name:"Kaydet",exact:true}).click();
  const article=page.getByRole("article").filter({has:page.getByRole("heading",{name:`İnceleme ${stamp}`,exact:true})});
  await article.getByRole("button",{name:"İncele / düzenle"}).click();
  dialog=page.getByRole("dialog");
  await dialog.getByLabel("Durum",{exact:true}).selectOption("review");
  await dialog.getByRole("button",{name:"Kaydet",exact:true}).click();
  await expect(article).toContainText("İnceleme bekliyor");

  const lawyerContext=await browser.newContext();
  const lawyerPage=await lawyerContext.newPage();
  await login(lawyerPage,DEMO_LAWYER);
  await lawyerPage.goto("/calisma-alanim");
  const review=lawyerPage.getByRole("article").filter({has:lawyerPage.getByRole("heading",{name:`İnceleme ${stamp}`,exact:true})});
  await review.getByRole("button",{name:"Onayla",exact:true}).click();
  await lawyerPage.getByRole("dialog").getByLabel("İnceleme notu *").fill("Sentetik inceleme tamamlandı");
  await lawyerPage.getByRole("button",{name:"Kararı kaydet"}).click();
  await expect(review).toContainText("Onaylandı");
  await lawyerContext.close();

  await page.goto("/buro?tab=access");
  await page.getByRole("button",{name:"Kısıtlı hesap davet et"}).click();
  dialog=page.getByRole("dialog");
  const email=`portal.${stamp}@e2e.casebridge.dev`;
  await dialog.getByLabel("Ad soyad *").fill("Sentetik Müvekkil");
  await dialog.getByLabel("E-posta *").fill(email);
  await dialog.getByRole("checkbox",{name:new RegExp(selected.case_number)}).check();
  await dialog.getByLabel("Yetkilendirme gerekçesi *").fill("Sentetik portal doğrulaması");
  await dialog.getByRole("button",{name:"Hesap oluştur ve davet et"}).click();
  await expect(dialog.getByRole("status")).toContainText("davet gönderildi");
  await dialog.getByRole("button",{name:"Kapat",exact:true}).click();

  const clientContext=await browser.newContext();const clientPage=await clientContext.newPage();
  await clientPage.goto(await newestPasswordLink(email));
  await clientPage.getByLabel("Yeni şifre",{exact:true}).fill("Sentetik-Portal-2026");
  await clientPage.getByLabel("Yeni şifre (tekrar)").fill("Sentetik-Portal-2026");
  await clientPage.getByRole("button",{name:"Şifreyi belirle"}).click();
  await expect(clientPage).toHaveURL(/calisma-alanim/);
  await expect(clientPage.getByRole("heading",{name:"Müvekkil Portalı"})).toBeVisible();
  await expect(clientPage.getByRole("link",{name:"Davalar",exact:true})).toHaveCount(0);
  await expect(clientPage.getByText("Büronuz henüz bir dosya paylaşımı yayımlamadı.")).toBeVisible();

  dialog=await openEditor(page,"publication",`Müvekkil güncellemesi ${stamp}`);
  await dialog.getByLabel("Dava *",{exact:true}).selectOption(selected.id);
  await dialog.getByRole("checkbox",{name:"Sentetik Müvekkil",exact:true}).check();
  await dialog.getByLabel("Müvekkile durum mesajı").fill("Dosyanız için hazırlık sürüyor.");
  await dialog.getByLabel("Durum",{exact:true}).selectOption("published");
  await dialog.getByRole("button",{name:"Kaydet ve yayımla"}).click();
  await expect(page.getByRole("heading",{name:`Müvekkil güncellemesi ${stamp}`,exact:true})).toBeVisible();
  await clientPage.reload();
  await expect(clientPage.getByText("Dosyanız için hazırlık sürüyor.")).toBeVisible();
  await expect(clientPage.getByText("Sentetik inceleme metni")).toHaveCount(0);
  await clientPage.screenshot({path:"/tmp/casebridge-management-qa/portal-desktop.png",fullPage:true});
  await clientContext.close();

  await page.goto("/buro");
  await expect(page.getByRole("heading",{name:"Büro Yönetimi",exact:true})).toBeVisible();
  await page.screenshot({path:"/tmp/casebridge-management-qa/bureau-desktop.png",fullPage:true});
  await page.setViewportSize({width:390,height:844});
  for(const tab of ["overview","team","finance","approval","lead","checklist","leave","publication","access","ai","audit","trash"]){
    await page.goto(`/buro?tab=${tab}`);
    await expect(page.getByRole("heading",{name:"Büro Yönetimi",exact:true})).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  }
  await page.goto("/buro");
  await expect(page.getByRole("heading",{name:"Büro Yönetimi",exact:true})).toBeVisible();
  await expect(page.getByText("Dikkat gerektiren işler",{exact:true})).toBeVisible();
  await page.screenshot({path:"/tmp/casebridge-management-qa/bureau-mobile.png",fullPage:true});
  await page.getByRole("button",{name:"Ana menüyü aç"}).click();
  await expect(page.getByRole("dialog",{name:"Uygulama menüsü"})).toBeVisible();
});

test("platform filters, profile, subscription and support persist",async({page,request})=>{
  await login(page,DEMO_PLATFORM);
  await page.getByLabel("Büro veya yönetici ara").fill("eşleşmeyen-sentetik-büro");
  await expect(page.getByText("Aramaya uygun büro bulunamadı.")).toBeVisible();
  await page.getByLabel("Büro veya yönetici ara").fill("");
  await page.screenshot({path:"/tmp/casebridge-platform-v011-desktop.png",fullPage:true});
  await page.getByRole("button", {name:/davet bekleyen/}).click();
  await expect(page.getByLabel("Büro durumu")).toHaveValue("pending");
  await page.getByLabel("Büro durumu").selectOption("");
  const firstName=await page.locator("tbody th a").first().innerText();
  await page.getByLabel("Büro veya yönetici ara").fill(firstName);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByLabel("Büro veya yönetici ara").fill("");
  await page.getByLabel(`${firstName} işlemleri`).click();
  await expect(page.getByRole("button",{name:"Yöneticiler ve davetler"})).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:"/tmp/casebridge-platform-v011-mobile.png",fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.locator("tbody th a").first().click();
  await expect(page.getByRole("heading",{name:"Kurulum adımları"})).toBeVisible();
  await page.getByRole("button",{name:"İletişim ve fatura",exact:true}).click();
  await page.getByLabel("İrtibat kişisi",{exact:true}).fill("Sentetik irtibat");
  await page.getByLabel("Değişiklik gerekçesi *").fill("Sentetik profil kontrolü");
  await page.getByRole("button",{name:"Değişiklikleri kaydet"}).click();
  await expect(page.getByRole("status")).toHaveText("Büro profili kaydedildi.");
  await page.reload();
  await page.getByRole("button",{name:"İletişim ve fatura",exact:true}).click();
  await expect(page.getByLabel("İrtibat kişisi",{exact:true})).toHaveValue("Sentetik irtibat");
  await page.getByRole("button",{name:"Destek talepleri",exact:true}).click();
  await page.getByRole("button",{name:"Yeni kayıt",exact:true}).click();
  const dialog=page.getByRole("dialog");
  await dialog.getByLabel("Başlık *").fill(`Destek ${stamp}`);
  await dialog.getByLabel("Not",{exact:true}).fill("Sentetik destek takibi");
  await dialog.getByRole("button",{name:"Kaydet",exact:true}).click();
  await expect(page.getByRole("heading",{name:`Destek ${stamp}`,exact:true})).toBeVisible();
  await page.getByRole("button",{name:"İşlem geçmişi",exact:true}).click();
  await expect(page.getByText("Büro profili güncellendi",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Genel görünüm",exact:true}).click();
  await page.screenshot({path:"/tmp/casebridge-management-qa/platform-desktop.png",fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:"/tmp/casebridge-management-qa/platform-mobile.png",fullPage:true});
});
