const fs=require("fs"),path=require("path");

const liveDistricts=[["Приморский","ORG-ALMAZOV"],["Адмиралтейский","ORG-MARIINSKY"],["Василеостровский","ORG-GB40"],["Выборгский","ORG-GKDC1"],["Калининский","ORG-GKDC1"],["Кировский","ORG-MARIINSKY"],["Колпинский","ORG-GVV"],["Красногвардейский","ORG-KGV-GP120"],["Красносельский","ORG-GB40"],["Кронштадтский","ORG-GB40"],["Курортный","ORG-GB40"],["Московский","ORG-GVV"],["Невский","ORG-GVV"],["Петроградский","ORG-GB40"],["Петродворцовый","ORG-GB40"],["Пушкинский","ORG-GB40"],["Фрунзенский","ORG-GVV"],["Центральный","ORG-MARIINSKY"]];
const liveInrLabels={"ORG-GKDC1":["Городской консультативно-диагностический центр №1","ул. Сикейроса"],"ORG-KGV-GP120":["Городская поликлиника №120","ул. Ленская"],"ORG-MARIINSKY":["Мариинская больница","Литейный"],"ORG-GB40":["Городская больница №40","ул. Борисова"],"ORG-ALMAZOV":["Алмазова","ул. Аккуратова"],"ORG-GVV":["Госпиталь для ветеранов войн","Народная"]};
const liveS06Gk=new Set(["Выборгский","Калининский","Красногвардейский","Кронштадтский","Курортный","Невский","Петроградский","Приморский","Центральный"]);
const EXPECTED_SOURCE="7e9725a443afa4c1e6e4c603d65d7faa0ccf1e91";
const EXPECTED_TREE="b3ceb3822c484569896620e566fc168685a449b0";
const EXPECTED_TAGOBJ="5381ac562e15061cf3842b6837c07ae0b8c4820c";
const EXPECTED_PREVIEW="2d53caa63f5495c37b66929fb002bc65747ba3cf";
const checkHttp=async(url)=>{let r=await fetch(url,{cache:"no-store"});return {status:r.status,contentType:r.headers.get("content-type"),text:await r.text(),url:r.url}};
async function publicProvenance(){
 const meta=await checkHttp(root+"preview-meta.json");
 const proof=await checkHttp(root+"checkout-proof.json");
 const html=await checkHttp(root);
 add("live HTTP home 200",html.status===200,html.status);
 add("live HTTP preview-meta 200 JSON",meta.status===200&&/json/.test(meta.contentType||""),meta.status);
 add("live HTTP checkout-proof 200 JSON",proof.status===200&&/json/.test(proof.contentType||""),proof.status);
 let mm={},pp={};
 try{mm=JSON.parse(meta.text);pp=JSON.parse(proof.text);}catch(e){exceptions.push("provenance JSON "+e)}
 add("live provenance exact SHA/tree/tag",mm.sourceSha===EXPECTED_SOURCE&&mm.sourceTreeSha===EXPECTED_TREE&&mm.tagObject===EXPECTED_TAGOBJ&&mm.checkpoint==="baseline-s01-s07-t079-remediation-2026-10-12");
 add("live preview true production false",mm.preview===true&&mm.production===false&&mm.basePath==="/navigator-patient-spb-preview/");
 add("live checkout proof exact SHA/tree",pp.requestedSha===EXPECTED_SOURCE&&pp.githubResolvedCommitSha===EXPECTED_SOURCE&&pp.localHeadSha===EXPECTED_SOURCE&&pp.localTreeSha===EXPECTED_TREE&&pp.localTreeMatchesRequestedCommit===true&&pp.tagObject===EXPECTED_TAGOBJ);
 const js=html.text.match(/src="(\/navigator-patient-spb-preview\/assets\/index-[^"]+\.js)"/)?.[1];
 const css=html.text.match(/href="(\/navigator-patient-spb-preview\/assets\/index-[^"]+\.css)"/)?.[1];
 add("public compiled hashed asset references",!!js&&!!css);
 for(const [name,url] of [["JS",js],["CSS",css]]){if(url){const r=await fetch("https://dr-snai1.github.io"+url,{cache:"no-store"});add("live hashed "+name+" HTTP 200",r.status===200,r.status);}}
}
async function liveCitywide(page,kind){
 // Tests actual rendered choices against independent SRC023 mapping rather than deriving expected from the live app.
 const scenarios=kind==="desktop"?["S02","S03","S05","S06"]:["S05","S06"];
 const offsets={S02:[1,2,3],S03:[2,3,4],S05:[4,0,1],S06:[5,0,1]};
 for(const scenario of scenarios){
  for(const [district,org] of liveDistricts){
   const idx=offsets[scenario][0],answer=offsets[scenario][1],attachment=offsets[scenario][2];
   try {
    await start(page,idx);
    await select(page,answer,scenario==="S06"?"Да, направление оформлено":"Да");
    await attached(page,attachment,district);
    const result=await getResult(page);
    const [label,address]=scenario==="S06"
       ?(liveS06Gk.has(district)?["Городской консультативно-диагностический центр №1","ул. Сикейроса"]:["Консультативно-диагностический центр №85","пр. Ветеранов"])
       :liveInrLabels[org];
    const inrCount=await page.locator("article").filter({hasText:"Контроль МНО — медицинская организация"}).count();
    const mapCount=await page.getByRole("button",{name:"Открыть на карте"}).count();
    const ok=result.includes(label)&&result.includes(address)&&result.includes("Адрес медицинской организации")&&mapCount===0&&(scenario==="S06"||inrCount===1);
    add(kind+" public "+scenario+" "+district+" matched confirmed organization/one card/no map",ok,JSON.stringify({district,org,label,address,inrCount,mapCount,foundLabel:result.includes(label),foundAddress:result.includes(address)}));
    add(kind+" no overflow "+scenario+" "+district,await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
   }catch(e){add(kind+" public "+scenario+" "+district+" runtime",false,String(e).slice(0,350))}
  }
 }
}

const {chromium}=require("playwright");
const root="https://dr-snai1.github.io/navigator-patient-spb-preview/";
const folder="t095-evidence";fs.mkdirSync(folder,{recursive:true});
const tests=[],exceptions=[];
const add=(name,pass,details="")=>{tests.push({name,pass:!!pass,details});if(!pass)console.error("FAIL",name,details)};
const ready=async()=>{for(let i=0;i<60;i++){try{const r=await fetch(root);if(r.ok)return true;}catch{}await new Promise(r=>setTimeout(r,1000));}return false;};
async function select(page,idx,exactLabel){await page.locator('button[role="combobox"]').nth(idx).click();await page.getByRole("option",{name:exactLabel,exact:true}).click();}
async function attached(page,idx,region){await page.locator('button[role="combobox"]').nth(idx).click();await page.getByRole("option").filter({hasText:region+" — "}).first().click();}
async function start(page,i){await page.goto(root);await page.getByRole("button",{name:"Построить маршрут"}).nth(i).click();}
async function getResult(page){await page.getByRole("button",{name:"Показать маршрут"}).click();return await page.locator("main").innerText();}
const ss=(page,name)=>page.screenshot({path:path.join(folder,name+".png"),fullPage:true});
(async()=>{
const edge=null;

let browser;
try{
if(!await ready())throw Error("PUBLIC beta preview not available");
await publicProvenance();
browser=await chromium.launch({headless:true});
for(const [kind,size] of Object.entries({desktop:{width:1440,height:1000},mobile:{width:390,height:844}})){
 const page=await browser.newPage({viewport:size});page.setDefaultTimeout(18000);const browserErrors=[];
 page.on("pageerror",e=>browserErrors.push(String(e)));
 try{
  await page.goto(root);add(kind+" seven scenario entrypoints",await page.getByRole("button",{name:"Построить маршрут"}).count()===7);
  add(kind+" beta preview literal",(await page.locator("main").innerText()).toLowerCase().includes("github pages preview"));
  await start(page,0);let t=await getResult(page);
  add(kind+" S01 source caveat",/178-ФЗ/.test(t)&&/не применяется/.test(t)&&/иных льготных оснований/.test(t));
  add(kind+" S01 baseline handoff",t.includes("Информация должна перейти в вашу поликлинику"));
  await start(page,3);t=await getResult(page);
  add(kind+" S04 caveat",t.includes("178-ФЗ")&&t.includes("иных льготных оснований"));
  await start(page,2);await select(page,1,"Уже выполнена");await select(page,2,"1–12 месяцев назад");
  t=await getResult(page);add(kind+" S03 postablation drug caveat",t.includes("178-ФЗ")&&t.includes("не применяется"));
  await start(page,1);await select(page,1,"Только рекомендовали обратиться, направление не оформлено");
  t=await getResult(page);add(kind+" S02 recommendation-only no choice",!t.includes("организаций в нормативном перечне"));
  await start(page,1);await select(page,1,"Да, направление оформлено");
  t=await getResult(page);add(kind+" S02 issued alone does not unlock choices",!t.includes("организаций в нормативном перечне"));
  await start(page,1);await select(page,2,"Да");await attached(page,3,"Выборгский");
  t=await getResult(page);add(kind+" S02 Vybg citywide INR",t.includes("Городской консультативно-диагностический центр №1")&&t.includes("Адрес медицинской организации"));
  add(kind+" S02 no extra INR cards",await page.locator("article").filter({hasText:"Контроль МНО — медицинская организация"}).count()===1);
  add(kind+" S02 no exact point/map",!t.includes("Конкретная точка")&&await page.getByRole("button",{name:"Открыть на карте"}).count()===0);
  await ss(page,kind+"-s02-vyborg-inr");
  await start(page,2);await select(page,2,"Только рекомендовали обратиться, направление не оформлено");
  t=await getResult(page);add(kind+" S03 recommendation-only no choice",!t.includes("организаций в нормативном перечне"));
  await start(page,2);await select(page,2,"Да, направление оформлено");
  t=await getResult(page);add(kind+" S03 issued opens 8 choice",(t.match(/8 организаций в нормативном перечне/g)||[]).length===1);
  await page.getByRole("button",{name:"Подробнее"}).last().click();
  const li=page.locator(".choice-does-not-exist"); // use semantic root UL
  add(kind+" S03 visual choice unranked",await page.locator("main ol").count()===0 && await page.locator("main ul li").count()===8);
  const choiceNames=await page.locator("main ul li").allInnerTexts();
  add(kind+" S03 choice first/last normative order",choiceNames[0]?.includes("Городская больница №26")&&choiceNames[7]?.includes("Мечникова"));
  await ss(page,kind+"-s03-choices");
  await start(page,2);await select(page,3,"Да");await attached(page,4,"Колпинский");
  t=await getResult(page);add(kind+" S03 Kolp INR",t.includes("Госпиталь для ветеранов войн")&&t.includes("Адрес медицинской организации"));
  await start(page,4);await select(page,0,"Да");
  t=await getResult(page);add(kind+" S05 unknown attached unresolved",!t.includes("Адрес медицинской организации"));
  await start(page,4);await select(page,0,"Нет");t=await getResult(page);
  add(kind+" S05 no physician assignment no INR",!t.includes("Адрес медицинской организации"));
  await start(page,4);await select(page,0,"Да");await attached(page,1,"Приморский");t=await getResult(page);
  add(kind+" S05 Prim INR once",t.includes("Алмазова")&&await page.locator("article").filter({hasText:"Контроль МНО — медицинская организация"}).count()===1);
  await start(page,5);await select(page,0,"Да, направление оформлено");await attached(page,1,"Колпинский");
  t=await getResult(page);add(kind+" S06 district organization",t.includes("Консультативно-диагностический центр №85")&&t.includes("Адрес медицинской организации"));
  add(kind+" S06 no map CTA",await page.getByRole("button",{name:"Открыть на карте"}).count()===0);
  await start(page,6);t=await getResult(page);
  add(kind+" S07 no CPI destination",!t.includes("ЦПИ №1")&&!t.includes("ЦПИ №2"));
  await page.goto(root);add(kind+" S07 no diagnostic Q701",!(await page.locator("main").innerText()).includes("Подтвердите диагноз инсульта"));
  for(const route of ["privacy","limitations","contacts"]){
   await page.goto(root+route);await page.reload();
   const main=await page.locator("main").innerText();
   add(kind+" "+route+" direct/reload status",/beta|preview|S01–S07/i.test(main));
   if(route==="privacy")add(kind+" privacy no documents/ids",main.includes("СНИЛС")&&main.includes("не сохраняются")&&main.includes("медицинских документов"));
   if(route==="limitations")add(kind+" limitations CPI excluded",main.includes("ЦПИ")&&main.includes("вне этого продукта"));
   if(route==="contacts")add(kind+" contacts disabled",main.includes("пока отключена"));
  }
  add(kind+" privacy no file input",await page.locator('input[type="file"]').count()===0);
  add(kind+" no local/session questionnaire storage",await page.evaluate(()=>window.localStorage.length===0&&window.sessionStorage.length===0));
  await liveCitywide(page,kind);
  add(kind+" no horizontal overflow",await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
  add(kind+" zero pageerrors",browserErrors.length===0,JSON.stringify(browserErrors));
 }catch(e){exceptions.push(kind+": "+(e.stack||e));}
 await page.close();
}
}finally{if(browser)await browser.close();}
const report={liveUrl:root,publishedPreviewSha:EXPECTED_PREVIEW,checkedCandidate:"7e9725a443afa4c1e6e4c603d65d7faa0ccf1e91",harnessBranch:process.env.GITHUB_SHA,browser:"Linux Chromium",tests,passed:tests.filter(x=>x.pass).length,total:tests.length,exceptions};
fs.writeFileSync(path.join(folder,"independent-report.json"),JSON.stringify(report,null,2));
console.log("T095 independent PUBLIC LIVE QA",JSON.stringify({passed:report.passed,total:report.total,exceptions}));
if(report.passed!==report.total||exceptions.length)process.exitCode=1;
})().catch(e=>{exceptions.push(String(e.stack||e));fs.writeFileSync(path.join(folder,"independent-report.json"),JSON.stringify({tests,exceptions},null,2));console.error(e);process.exitCode=1;});
