/* Probe: Kategorien umbenennen + Emoji-Auswahl + fremde Kategorien sichtbar.
   Uebertragen aus Mein Mixarium ueber Mein Rezeptbuch (2026-09-15). Gemessen wird im ECHTEN
   Browser an der GEBAUTEN index.html — eine Probe, die nur den Quelltext
   liest, misst nicht, ob die Seite laeuft. */
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";

const WURZEL = process.cwd();
const TYP = { ".html":"text/html; charset=utf-8", ".js":"text/javascript", ".json":"application/json",
              ".css":"text/css", ".svg":"image/svg+xml", ".png":"image/png", ".jpg":"image/jpeg" };
let gruen = 0, rot = 0;
const ok = (t,b)=>{ if(b){gruen++;console.log("  ✓ "+t);} else {rot++;console.log("  ✗ ROT — "+t);} };

const server = createServer((q,a)=>{
  const pfad = join(WURZEL, decodeURIComponent(q.url.split("?")[0]).replace(/^\/+/,"") || "index.html");
  if(!existsSync(pfad)||!pfad.startsWith(WURZEL)){a.writeHead(404);a.end();return;}
  a.writeHead(200,{"content-type":TYP[extname(pfad)]||"application/octet-stream"});
  a.end(readFileSync(pfad));
});
await new Promise(r=>server.listen(0,r));
const port = server.address().port;

/* „sushi" und „salat" kennt dieses Buch NICHT — genau der Fall, der bisher
   still verschwand. „fleisch" ist eine echte eigene Kategorie. */
const BESTAND = [
  { id:1, name:"Gulasch",       cat:"fleisch", shut:true, ings:[], steps:[] },
  { id:2, name:"Maki-Rolle",    cat:"sushi",   shut:true, ings:[], steps:[] },
  { id:3, name:"Gurkensalat",   cat:"salat",   shut:true, ings:[], steps:[] },
];

const browser = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
const seite = await browser.newPage();
let seitenfehler = [];
seite.on("pageerror", e => seitenfehler.push(String(e)));
await seite.addInitScript(b=>{ localStorage.setItem("mrz9", JSON.stringify(b)); localStorage.setItem("mlang9","de"); }, BESTAND);
await seite.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil:"domcontentloaded" });
await seite.waitForFunction(()=>typeof catsAlle==="function" && typeof R!=="undefined" && Array.isArray(R), null, {timeout:25000});
await seite.waitForFunction(()=>document.querySelectorAll("#catNav .cpill").length>0, null, {timeout:25000});

console.log("\n── 0 · Die Seite läuft ohne Fehler ──");
ok("kein Seitenfehler beim Laden" + (seitenfehler.length?" — "+seitenfehler[0].slice(0,90):""), seitenfehler.length===0);

console.log("\n── 1 · Fremde Kategorien bekommen einen Reiter ──");
const reiter = await seite.evaluate(()=>[...document.querySelectorAll("#catNav .cpill")].map(e=>e.textContent.trim()));
ok("ein Reiter trägt „sushi“", reiter.some(t=>/sushi/i.test(t)));
ok("ein Reiter trägt „salat“", reiter.some(t=>/salat/i.test(t)));

console.log("\n── 2 · Sie werden auch gezeichnet ──");
const alle = await seite.evaluate(()=>{ CAT="all"; render(); return document.getElementById("rcont").textContent; });
ok("„Alle“ zeigt die Maki-Rolle", /Maki-Rolle/.test(alle));
ok("„Alle“ zeigt den Gurkensalat", /Gurkensalat/.test(alle));
ok("„Alle“ zeigt weiterhin das Gulasch", /Gulasch/.test(alle));

console.log("\n── 3 · Umbenennen wirkt, die Kennung bleibt ──");
await seite.evaluate(()=>{ CATS_EIGEN={ sushi:{name:"Japanisch",ico:"🍣"} }; svCatsEigen(); renderCatNav(); });
const nach = await seite.evaluate(()=>[...document.querySelectorAll("#catNav .cpill")].map(e=>e.textContent.trim()));
ok("der Reiter heisst „Japanisch“", nach.some(t=>/Japanisch/.test(t)));
ok("das eigene Symbol steht davor", nach.some(t=>t.includes("🍣")));
ok("r.cat bleibt 'sushi'", await seite.evaluate(()=>R.find(r=>r.name==="Maki-Rolle").cat==="sushi"));
ok("das Rezept steht im umbenannten Reiter", await seite.evaluate(()=>{
   CAT="sushi"; render(); return document.getElementById("rcont").textContent.includes("Maki-Rolle"); }));

console.log("\n── 4 · Der Dialog ──");
await seite.evaluate(()=>{ CATS_EIGEN={}; svCatsEigen(); openKatUmbenennen(); });
ok("er steht da", await seite.locator("#katRenameOv").count()===1);
ok("er listet jede Kategorie, auch die mitgebrachten",
   await seite.locator("#katRenameOv .kat-row").count() === await seite.evaluate(()=>catsAlle().length));
ok("die mitgebrachten sind gekennzeichnet", await seite.locator("#katRenameOv .kat-fremd").count()>=2);

console.log("\n── 5 · Emoji-Auswahl ──");
ok("das Raster ist zu, solange niemand tippt",
   await seite.evaluate(()=>document.getElementById("katEmojiRaster").hidden===true));
await seite.click('#katRenameOv .kat-row[data-kid="sushi"] .kat-ico');
console.log("    [messung] " + await seite.evaluate(()=>JSON.stringify({
  raster: document.querySelectorAll("#katEmojiRaster").length,
  overlays: document.querySelectorAll("#katRenameOv").length,
  hidden: document.getElementById("katEmojiRaster")?.hidden,
  ziel: typeof _katZiel === "undefined" ? "undef" : (_katZiel ? _katZiel.parentElement.dataset.kid : null)
})));
ok("ein Tipp aufs Symbol-Feld öffnet es",
   await seite.evaluate(()=>document.getElementById("katEmojiRaster").hidden===false));
/* ⚠ HIER STAND „… und es steht direkt unter der bearbeiteten Zeile".
   DIESE ZUSICHERUNG GILT NICHT MEHR, und sie ist nicht still getauscht:
   Klaus hat am 2026-09-15 gemeldet, die Auswahl sei „nicht vollkommen
   aufgeklappt". Gemessen im Browser war sie **12 px hoch** statt 598 px
   Inhalt — `.kat-list` ist ein Flex-Container, und ein Kind mit
   `overflow-y:auto` bekommt dort die Mindesthoehe 0. Der alte Waechter war
   dabei GRUEN: er fragte, WO das Raster haengt, nie WIE HOCH es ist.
   Ein Waechter auf die Lage misst nicht die Sichtbarkeit. */
ok("… und es steht AUSSERHALB der scrollenden Liste", await seite.evaluate(()=>{
   const r=document.getElementById("katEmojiRaster");
   return !r.closest(".kat-list") && !!r.closest(".kat-box"); }));
ok("… und es ist wirklich aufgeklappt (mehrere ganze Reihen hoch)", await seite.evaluate(()=>{
   const r=document.getElementById("katEmojiRaster").getBoundingClientRect();
   const k=document.querySelector("#katEmojiRaster .kat-emoji").getBoundingClientRect();
   /* ⚠ OHNE `k.height > 0` IST DIESER WAECHTER BLIND. Legt man das Gitter
      auf `display:none`, hat auch der Knopf keine Box — und `hoehe >= 3*0`
      ist IMMER wahr. Gefangen hat das die Gegenprobe, nicht das Nachdenken. */
   if(!(k.height > 0)) return false;
   /* Gemessen gegen die KNOPFHOEHE, nicht gegen eine genagelte Zahl: die
      Hoehe haengt am Schirm, eine feste Zahl waere auf dem naechsten Geraet
      falsch. Drei Reihen sind die Untergrenze. */
   return r.height >= 3 * k.height; }));
/* ⚠ DER WAECHTER AUF DIE URSACHE. Zweimal ist an derselben Stelle dasselbe
   passiert: `scrollIntoView` und das Schrumpfen der Liste haben beide die
   angetippte Zeile unter dem Finger wegbewegt — der danach folgende `click`
   landete woanders, und die Auswahl schloss sich sofort wieder. Ein
   Verhaltens-Waechter allein faengt das nur manchmal. */
ok("… und beim Oeffnen bewegt sich die angetippte Zeile NICHT", await seite.evaluate(()=>{
   katEmojiSchliessen();
   const feld=document.querySelector('#katRenameOv .kat-row[data-kid="sushi"] .kat-ico');
   const vorher=feld.getBoundingClientRect();
   katEmojiOeffnen(feld);
   const nachher=feld.getBoundingClientRect();
   return Math.abs(vorher.top-nachher.top) < 1 && Math.abs(vorher.left-nachher.left) < 1; }));
ok("… und der ganze Dialog passt dabei noch auf den Schirm", await seite.evaluate(()=>{
   const b=document.querySelector("#katRenameOv .kat-box").getBoundingClientRect();
   const r=document.getElementById("katEmojiRaster").getBoundingClientRect();
   return b.top >= 0 && b.bottom <= innerHeight && r.bottom <= innerHeight; }));
/* ⚠ EIN WAECHTER AUF „passt auf den Schirm" REICHT NICHT: ein Raster, das
   den ganzen Dialog verdeckt, passt auch auf den Schirm. Gemessen wird die
   UEBERLAPPUNG mit dem Speichern-Knopf — ein Knopf, den man sieht und der
   nichts tut, ist die schlimmere Sorte toter Knopf. */
ok("… und es verdeckt den Speichern-Knopf nicht", await seite.evaluate(()=>{
   const r=document.getElementById("katEmojiRaster").getBoundingClientRect();
   const b=document.querySelector("#katRenameOv .share-btn-p").getBoundingClientRect();
   return r.bottom <= b.top + 1 || r.top >= b.bottom - 1
       || r.right <= b.left + 1 || r.left >= b.right - 1; }));
ok("… die bearbeitete Zeile ist markiert", await seite.evaluate(()=>{
   const m=document.querySelectorAll("#katRenameOv .kat-row-aktiv");
   return m.length === 1 && m[0].dataset.kid === "sushi"; }));
ok("… und die Kopfzeile nennt sie beim Namen", await seite.evaluate(()=>{
   const kopf=document.getElementById("katEmojiKopf").textContent||"";
   const z=document.querySelector('#katRenameOv .kat-row[data-kid="sushi"] .kat-name');
   return kopf.length > 0 && kopf.includes(z.value||z.placeholder); }));
ok("es bietet eine Auswahl an", await seite.locator("#katEmojiRaster .kat-emoji").count()>=40);
await seite.evaluate(()=>[...document.querySelectorAll("#katEmojiRaster .kat-emoji")].find(b=>b.textContent==="🍣").click());
ok("ein Tipp aufs Emoji schreibt es ins Feld",
   await seite.inputValue('#katRenameOv .kat-row[data-kid="sushi"] .kat-ico')==="🍣");
ok("… und schliesst das Raster", await seite.evaluate(()=>document.getElementById("katEmojiRaster").hidden===true));
ok("… und gibt der Liste ihren Platz zurueck", await seite.evaluate(()=>
   !document.querySelector("#katRenameOv .kat-box").classList.contains("emoji-auf")
   && document.querySelectorAll("#katRenameOv .kat-row-aktiv").length === 0));

/* ⚠ EIN WAECHTER AUF DIE URSACHE, nicht nur aufs Verhalten. Der Wächter
   darüber („öffnet es") war FLATTERHAFT: `scrollIntoView` verschob die Liste
   zwischen focus und click, der Klick landete woanders, und der
   „Tipp-daneben"-Riegel schloss sofort. Gemessen: drei Läufe derselben
   Datei, zweimal offen, einmal zu. Ein Verhaltens-Wächter allein hätte das
   in zwei von drei Läufen durchgelassen. */
ok("das Öffnen verschiebt die Liste nicht (kein scrollIntoView)", await (async ()=>{
  const { readFileSync } = await import("node:fs");
  const q = readFileSync("QC_MR_08_04_26.html","utf8");
  const i = q.indexOf("function katEmojiOeffnen"); const j = q.indexOf("function katEmojiSchliessen", i);
  /* ⚠ OHNE DIE KOMMENTARE. Der Erklaerblock an genau dieser Stelle NENNT
     `scrollIntoView` — ein Waechter, der frei im Text sucht, wird davon rot,
     obwohl der Code sauber ist. Dieselbe Falle wie ein Waechter, der im
     Kommentar fuendig wird, nur in die andere Richtung. */
  const code = q.slice(i,j).replace(/\/\*[\s\S]*?\*\//g,"").replace(/^\s*\/\/.*$/gm,"");
  return i>=0 && j>i && !/scrollIntoView/.test(code);
})());
/* ⚠ UND EIN WAECHTER AUF DIE ZWEITE URSACHE: das Raster gehoert NICHT in
   `.kat-list` — dort drueckt der Flex-Container es platt. */
ok("das Raster wird nicht in die scrollende Liste gebaut", await (async ()=>{
  const { readFileSync } = await import("node:fs");
  const q = readFileSync("QC_MR_08_04_26.html","utf8").replace(/\/\*[\s\S]*?\*\//g,"");
  return !/<div class="kat-list">\$\{zeilen\}\$\{katEmojiRaster\(\)\}/.test(q)
      && /<div class="kat-list">\$\{zeilen\}<\/div>/.test(q);
})());

console.log("\n── 6 · Speichern und Neuladen ──");
await seite.fill('#katRenameOv .kat-row[data-kid="sushi"] .kat-name', "Japanisch");
await seite.evaluate(()=>katSpeichern());
ok("der Dialog ist zu", await seite.locator("#katRenameOv").count()===0);
const fertig = await seite.evaluate(()=>[...document.querySelectorAll("#catNav .cpill")].map(e=>e.textContent.trim()));
ok("der Reiter trägt Namen und Symbol", fertig.some(t=>/Japanisch/.test(t)&&t.includes("🍣")));
/* ⚠ DIESE ZEILE GEHÖRT HIERHIN, NICHT NACH OBEN. Abschnitt 3 setzt
   CATS_EIGEN von Hand — eine Sabotage IM Speicher-Weg kommt dort nie vorbei.
   Die Gegenprobe hat den Fall prompt „aus falschem Grund" gemeldet. */
ok("auch über den echten Speicher-Weg bleibt r.cat = 'sushi'",
   await seite.evaluate(()=>R.find(r=>r.name==="Maki-Rolle").cat==="sushi"));
ok("es überlebt ein Neuladen", await seite.evaluate(()=>{
   const g=JSON.parse(localStorage.getItem("mrzcats9")||"{}");
   return g.sushi?.name==="Japanisch" && g.sushi?.ico==="🍣"; }));
ok("und es liegt NICHT unter dem Schlüssel von Mein Rezeptbuch (geteilte Adresse!)",
   await seite.evaluate(()=>localStorage.getItem("mrzcats9m")===null));

console.log("\n── 7 · Der Inhalts-Vektor kann überhaupt rechnen ──");
/* ⚠ OHNE `window.R` WAR DIE STUFE VOM 2026-09-15 HIER TOT. `sbkim-init.js`
   liest window.R, die App legte R aber nie dort ab — `sampleContent()` gab
   eine leere Liste, der Vektor fiel auf die Beschreibung zurück, und die
   Zeile „Dein Vektor kommt aus deinen eigenen Inhalten" konnte im Siegel gar
   nicht erscheinen. Gemessen wird der WERT, nicht die Anwesenheit der Zeile. */
ok("window.R ist da und liefert die echten Rezepte",
   await seite.evaluate(()=>Array.isArray(window.R) && window.R.some(r=>r.name==="Gulasch")));
await seite.waitForFunction(()=>typeof window.SBKIM_SAMPLE_CONTENT==="function"
  || (window.SBKIM_SIEGEL_WIZ && typeof window.SBKIM_SIEGEL_WIZ.sampleContent==="function"),
  null, {timeout:25000}).catch(()=>{});
const proben = await seite.evaluate(()=>{
  const f = (window.SBKIM_SIEGEL_WIZ && window.SBKIM_SIEGEL_WIZ.sampleContent) || window.SBKIM_SAMPLE_CONTENT;
  return typeof f === "function" ? f() : null;
});
ok("sampleContent() erreicht die Rezepte (" + (proben ? proben.length : "nicht erreichbar") + ")",
   Array.isArray(proben) && proben.length >= 3);
ok("… und liefert Kategorie + Name, kein PII",
   Array.isArray(proben) && proben.some(t=>/Gulasch/.test(t)));

await browser.close(); server.close();
console.log(`\n${gruen} grün · ${rot} ROT`);
process.exit(rot?1:0);
