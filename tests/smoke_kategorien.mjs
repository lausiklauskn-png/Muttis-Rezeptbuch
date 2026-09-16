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
  /* ⚠ ZWEI HEIMATLOSE: der erste hat GAR KEINE Kategorie, der zweite zeigt
     auf einen Ordner, den es nicht gibt. Beide waren bisher nur ueber die
     Suche zu finden — genau Klaus' Sushi-Befund vom 2026-09-16. */
  { id:4, name:"Heimatlos-Ohne", cat:"", shut:true, ings:[], steps:[] },
  { id:5, name:"Heimatlos-Ordner", cat:"fld_999", shut:true, ings:[], steps:[] },
  { id:6, name:"Mitgebracht-Bekannt", cat:"afckt", shut:true, ings:[], steps:[] },
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

/* ⚠ „bietet eine Auswahl an (mindestens 40)" WAR ZU LOSE. Die Gegenprobe hat
   es gefangen: sechs Getraenke-Symbole zu entfernen faellt unter 40 nicht auf.
   Eine Untergrenze, die weit unter dem Bestand liegt, misst den Bestand nicht.
   Gemessen wird jetzt die Zusicherung: es SIND Getraenke-Symbole dabei. */
ok("die Auswahl traegt eigene Getraenke-Symbole (Klaus 2026-09-16)", await seite.evaluate(()=>
   ["🍶","🍼","🚰","🫧"].every(e=>KAT_EMOJIS.indexOf(e)>=0)
   && KAT_EMOJIS.length>=130
   && new Set(KAT_EMOJIS).size===KAT_EMOJIS.length));

console.log("\n── 11 · Klartext statt Kennung ──");
const reiterN = await seite.evaluate(()=>{ CATS_EIGEN={}; svCatsEigen(); renderCatNav();
  return [...document.querySelectorAll("#catNav .cpill")].map(e=>e.textContent.trim()); });
/* ⚠ GEMESSEN WIRD DER NAME, NICHT DIE ANWESENHEIT. Eine rohe Kennung im
   Reiter war der halbe Weg: sichtbar ja, verstaendlich nein. Klaus am
   2026-09-15 vor der Ordner-Liste: „AFCKT, was ist das?" */
ok("eine bekannte fremde Kennung steht im KLARTEXT da", await seite.evaluate(()=>{
   const c=catsFremd().find(x=>x.id==="afckt");
   return !!c && c.de==="Alkfr. Cocktails" && c.ico==="🍸" && !c.unbekannt; }));
/* ⚠ UND DIE GEGENRICHTUNG: eine unbekannte Kennung wird NICHT erfunden.
   Ohne diesen Waechter waere auch ein Woerterbuch gruen, das raet. */
ok("… eine UNBEKANNTE Kennung bekommt keinen erfundenen Namen", await seite.evaluate(()=>{
   const c=catsFremd().find(x=>x.id==="sushi"); return !!c && c.unbekannt===true && c.de===c.id && c.ico==="📦"; }));
ok("das Woerterbuch deckt beide Schwester-Apps ab", await seite.evaluate(()=>
   KAT_FAMILIE.length===18 && ["afckt","mock","bowle","smooth","vorsp","fleisch","drk"]
     .every(k=>KAT_FAMILIE.some(x=>x.id===k))));

console.log("\n── 12 · Rezepte ohne Zuhause werden als eigene Kategorie gefuehrt ──");
ok("ein Reiter sammelt sie ein", reiterN.some(t=>/Ohne Kategorie/.test(t)));
ok("… und er zaehlt BEIDE (ohne Kategorie + toter Ordner)", await seite.evaluate(()=>{
   const p=[...document.querySelectorAll("#catNav .cpill")].find(e=>/Ohne Kategorie/.test(e.textContent));
   return !!p && /(^|\D)2(\D|$)/.test(p.textContent); }));
const alleN = await seite.evaluate(()=>{ CAT="all"; render(); return document.getElementById("rcont").textContent; });
ok("„Alle“ zeichnet das Rezept ohne Kategorie", /Heimatlos-Ohne/.test(alleN));
ok("„Alle“ zeichnet das Rezept mit totem Ordner", /Heimatlos-Ordner/.test(alleN));
/* ⚠ EIN REITER, DER SICH OEFFNEN LAESST UND NICHTS ZEIGT, IST EIN TOTER
   KNOPF MIT BESCHRIFTUNG — die schlimmere Sorte. */
const ohneAnsicht = await seite.evaluate(()=>{ CAT=KAT_OHNE; render(); return document.getElementById("rcont").textContent; });
ok("der Reiter selbst zeigt sie auch",
   /Heimatlos-Ohne/.test(ohneAnsicht) && /Heimatlos-Ordner/.test(ohneAnsicht));
ok("und OHNE Heimatlose gibt es den Reiter nicht", await seite.evaluate(()=>{
   const sich=R.slice(); R=R.filter(r=>!/^Heimatlos/.test(r.name||""));
   const weg=catsAlle().some(c=>c.id===KAT_OHNE); R=sich; return !weg; }));

console.log("\n── 13 · Ordner-Ansicht und Kategorie-Leiste zaehlen DIESELBE Zahl ──");
/* ⚠ Klaus 2026-09-16: „Sushi steht in den Ordnern mit null Rezepten, obwohl
   mindestens sechs drin sind. Oben in der Kategorie-Leiste steht Sushi mit
   sechs." Zwei Stellen zaehlten dieselbe Sache verschieden — die Leiste ueber
   `katVonRezept`, der Ordner-Baum ueber das ROHE Feld `r.cat`.
   ⚠ GEMESSEN WIRD DIE UEBEREINSTIMMUNG, NICHT EINE ZAHL. Ein Waechter auf
   „der Ordner zeigt 6" waere blind, sobald sich die Leiste bewegt — und
   genau diese Sorte Fehler (zwei Stellen, eine Wahrheit) ist hier schon
   dreimal zugeschnappt. */
const paare = await seite.evaluate(()=>{
  CAT="all"; renderCatNav(); renderFolders();
  const leiste={};
  document.querySelectorAll("#catNav .cpill").forEach(e=>{
    const m=/setCAT\('([^']+)'\)/.exec(e.getAttribute("onclick")||"");
    const s=e.querySelector("span");
    if(m&&s)leiste[m[1]]=Number(s.textContent.trim());
  });
  const out=[];
  document.querySelectorAll("#fldTree .fld-grp").forEach(g=>{
    const gid=g.dataset.gid||"";
    const c=g.querySelector(".fld-cnt");
    if(!c)return;
    const id=gid.startsWith("cat_")?gid.slice(4):(gid.startsWith("cfd_")?"fld_"+gid.slice(4):null);
    if(!id)return;
    /* Wie viele dieser Kategorie liegen in einem Ordner? Genau diese Zahl ist
       der Unterschied zwischen den beiden Ansichten — und sie wird gemessen,
       nicht geschaetzt. */
    const imOrdner=gid.startsWith("cat_")
      ? R.filter(r=>r.folder&&katVonRezept(r)===id&&r.name&&!r.blank).length : 0;
    out.push({id:id, ordner:parseInt(c.textContent,10)||0, leiste:leiste[id]||0, imOrdner:imOrdner});
  });
  return out;
});
/* ⚠ TAFEL-EVOLUTIONS-KLAUSEL, AUSDRUECKLICH BENANNT. Hier stand bis zum
   2026-09-16 die Zusicherung „jede Gruppe zeigt in BEIDEN Ansichten dieselbe
   Zahl". Sie war richtig, solange ein Ordner die Kategorie auffrass: ein
   Rezept hatte entweder das eine oder das andere.
   Seit Ordner und Kategorie getrennt sind, hat ein Gericht BEIDES — und die
   zwei Ansichten beantworten zwei verschiedene Fragen:
     · die Kategorie-Leiste: „wie viele Rezepte haben diese Kategorie?"
       (die in Ordnern zaehlen mit — sie haben sie ja)
     · der Ordner-Baum: „was liegt hier?" (jedes Rezept steht GENAU EINMAL,
       im Ordner ODER unter seiner Kategorie)
   Ersetzt, nicht stillschweigend gelockert: gemessen wird weiter die
   Uebereinstimmung, nur mit dem Unterschied ausgerechnet statt weggelassen. */
const uneins = paare.filter(p=>p.ordner+p.imOrdner!==p.leiste);
ok("Leiste = Baum + die, die in einem Ordner liegen",
   paare.length>0 && uneins.length===0);
if(uneins.length)console.log("     uneins: "+uneins.map(p=>`${p.id} ${p.ordner}+${p.imOrdner}≠${p.leiste}`).join(", "));
/* ⚠ UND DIE GEGENRICHTUNG: ohne eine fremde Kategorie MIT Inhalt misst der
   Waechter oben nichts — alle Zahlen waeren 0 und stimmten trivial ueberein. */
ok("… und eine mitgebrachte Kategorie ist wirklich dabei",
   paare.some(p=>p.id==="sushi" && p.ordner>0));
/* ⚠ EIN ORDNER, DEN ES NOCH GIBT, ZAEHLT IN BEIDEN ANSICHTEN GLEICH.
   Die Leiste zaehlt `r.folder ODER r.cat==='fld_…'`, der Baum zaehlte nur
   `r.folder` — dieselbe Sorte Abweichung, nur eine Zeile tiefer. */
ok("ein Rezept, das nur ueber r.cat im Ordner liegt, faellt nirgends heraus",
   await seite.evaluate(()=>{
     const sich=JSON.parse(JSON.stringify(R)), sichF=JSON.parse(JSON.stringify(FD));
     FD.push({id:"9911",name:"Probe-Ordner",ico:"📁"});
     R.push({id:99110,name:"Nur-ueber-cat",cat:"fld_9911",folder:"",blank:false});
     renderCatNav(); renderFolders();
     const p=[...document.querySelectorAll("#catNav .cpill")]
       .find(e=>/setCAT\('fld_9911'\)/.test(e.getAttribute("onclick")||""));
     const g=document.querySelector('#fldTree .fld-grp[data-gid="cfd_9911"] .fld-cnt');
     const a=p?Number(p.querySelector("span").textContent.trim()):-1;
     const b=g?parseInt(g.textContent,10):-2;
     R=sich; FD=sichF; renderCatNav(); renderFolders();
     return a===1 && b===1;
   }));

console.log("\n── 14 · Ordner und Kategorie sind zwei Sachen ──");
/* ⚠ Klaus 2026-09-16 an Mein Rezeptbuch, drei Befunde aus EINEM Bild: „das
   Sushi taucht zweimal auf" · „wenn ich es aufklappe, hat das Sushi Ordner als
   Emojis" · „wenn ich jetzt das Hauptemoji fuer die Kategorie aendere, aendern
   sich die unteren Emojis fuer die einzelnen Gerichte nicht".
   Alle drei hatten EINE Ursache: ein Ordner-Umzug schrieb `fld_<id>` in
   `r.cat` und nahm dem Gericht damit seine Kategorie. Dieselbe Stelle stand
   hier wortgleich. */
const KAT_PROBE = "sushi";
const trennung = await seite.evaluate((KAT)=>{
  const sichR=JSON.parse(JSON.stringify(R)), sichF=JSON.parse(JSON.stringify(FD));
  const sichE=JSON.parse(JSON.stringify(CATS_EIGEN));
  const ev={preventDefault(){},stopPropagation(){}};
  FD.push({id:"7701",name:"Probe-Ordner",ico:"📁"});
  R.push({id:77010,name:"Wander-Rezept",cat:KAT,folder:"",blank:false});
  R.push({id:77011,name:"Altbestand-Rezept",cat:"fld_9999",folder:"",blank:false});

  // 1 · Umzug in den Ordner
  _dd={type:"card",rid:77010,overRow:null,overPos:null};
  fldGrpDrop(ev,"cfd_7701");
  const a=R.find(r=>r.id===77010);
  const katBleibt=(a.cat===KAT), ordnerGesetzt=(String(a.folder)==="7701");

  // 2 · Die Zeile im Ordner traegt das Symbol ihrer KATEGORIE
  renderFolders();
  const zeile=()=>{
    const g=document.querySelector('#fldTree .fld-grp[data-gid="cfd_7701"]');
    const z=g&&[...g.querySelectorAll(".fld-rrow")].find(x=>x.dataset.rid==="77010");
    return z?z.firstElementChild.textContent.trim():"";
  };
  /* ⚠ GEMESSEN WIRD DIE ZUSICHERUNG, NICHT DAS ZEICHEN. Ein fest genageltes
     Emoji waere hier rot geworden, sobald ein frueherer Abschnitt der Probe
     der Kategorie ein eigenes Symbol gibt — rot, ohne dass eine Zusicherung
     gefallen waere. */
  const symVorher=zeile();
  const symKat=katSymbol(catsAlle().find(c=>c.id===KAT));
  const symOrdner=FD.find(f=>String(f.id)==="7701").ico;

  // 3 · Ein Wechsel des Kategorie-Symbols erreicht das Gericht im Ordner
  const e2={}; e2[KAT]={ico:"🧪",name:""};
  CATS_EIGEN=Object.assign({},CATS_EIGEN,e2);
  renderFolders();
  const symNachher=zeile();

  // 4 · Kein Rezept steht im Baum zweimal
  const rids=[...document.querySelectorAll("#fldTree .fld-rrow")].map(e=>e.dataset.rid);
  const doppelt=rids.filter((v,i)=>rids.indexOf(v)!==i);

  // 5 · Eine Altbestands-Kennung wird beim Umzug nicht mitgeschleppt
  _dd={type:"card",rid:77011,overRow:null,overPos:null};
  fldGrpDrop(ev,"cfd_7701");
  const b=R.find(r=>r.id===77011);
  const altGeleert=(b.cat===""&&String(b.folder)==="7701");

  // 6 · Ein geloeschter Ordner erfindet keine Kategorie
  const cf=window.confirm; window.confirm=()=>true;
  deleteFolder("7701","Probe-Ordner");
  window.confirm=cf;
  const c1=R.find(r=>r.id===77010), c2=R.find(r=>r.id===77011);
  const nachLoeschen={kat:c1.cat, ordner:String(c1.folder||""), altKat:c2.cat};

  R=sichR; FD=sichF; CATS_EIGEN=sichE; renderCatNav(); renderFolders();
  return {katBleibt,ordnerGesetzt,symVorher,symNachher,symKat,symOrdner,doppelt,altGeleert,nachLoeschen};
}, KAT_PROBE);
ok("ein Umzug in einen Ordner laesst die Kategorie stehen", trennung.katBleibt);
/* ⚠ GEGENRICHTUNG: ohne diese Zeile waere „die Kategorie bleibt" auch dann
   gruen, wenn der Umzug ueberhaupt nichts tut. */
ok("… und setzt den Ordner wirklich", trennung.ordnerGesetzt);
ok("das Gericht im Ordner traegt das Symbol seiner Kategorie, nicht das des Ordners",
   trennung.symVorher===trennung.symKat && trennung.symVorher!==trennung.symOrdner);
if(trennung.symVorher!==trennung.symKat)
  console.log(`     Zeile ${trennung.symVorher} · Kategorie ${trennung.symKat} · Ordner ${trennung.symOrdner}`);
ok("ein Wechsel des Kategorie-Symbols erreicht es (Klaus' dritter Befund)",
   trennung.symNachher==="🧪" && trennung.symVorher!==trennung.symNachher);
ok("kein Rezept steht im Ordner-Baum zweimal", trennung.doppelt.length===0);
if(trennung.doppelt.length)console.log("     doppelt: "+trennung.doppelt.join(", "));
ok("eine Altbestands-Kennung fld_ wird beim Umzug nicht mitgeschleppt",
   trennung.altGeleert);
/* ⚠ Bis 2026-09-16 setzte deleteFolder eine geratene Kategorie fuer JEDES
   Rezept des Ordners, auch fuer die mit eigener. */
ok("ein geloeschter Ordner erfindet keine Kategorie",
   trennung.nachLoeschen.kat===KAT_PROBE && trennung.nachLoeschen.ordner==="" &&
   trennung.nachLoeschen.altKat==="");
/* ⚠ UND DAS ABZEICHEN AM REITER ZAEHLT DIESELBEN GRUPPEN. Es rechnet seine
   Zahl selbst aus `R`, nicht aus dem gezeichneten Baum — zwei Stellen, eine
   Wahrheit, und genau diese Sorte ist hier schon dreimal auseinandergelaufen. */
ok("das Abzeichen zaehlt genau die Gruppen mit Inhalt",
   await seite.evaluate((KAT)=>{
     const sichR=JSON.parse(JSON.stringify(R)), sichF=JSON.parse(JSON.stringify(FD));
     FD.push({id:"7704",name:"Probe-Ordner",ico:"📁"});
     R.push({id:77040,name:"Im-Ordner",cat:KAT,folder:"7704",blank:false});
     /* ⚠ ALLE dieser Kategorie in den Ordner. Bliebe auch nur eines draussen,
        zaehlte das Abzeichen die Kategorie ohnehin mit, und der Waechter waere
        blind — genau das hat die Gegenprobe in Mein Rezeptbuch gemeldet. */
     R.forEach(r=>{if(r.name&&!r.blank&&katVonRezept(r)===KAT)r.folder="7704";});
     renderFolders(); badge();
     const voll=[...document.querySelectorAll("#fldTree .fld-grp .fld-cnt")]
       .filter(e=>(parseInt(e.textContent,10)||0)>0).length;
     const b=parseInt(document.getElementById("fldBadge").textContent,10)||0;
     R=sichR; FD=sichF; renderCatNav(); renderFolders(); badge();
     return voll>0 && b===voll;
   }, KAT_PROBE));
/* ⚠ EIN ORDNER, DEN ES NICHT MEHR GIBT, IST KEIN SYMBOL. `catIco('fld_9999')`
   gibt ein nacktes 📁 zurueck — ein Ordner-Zeichen fuer einen Ordner, der nicht
   existiert. Gedeutet steht dort das Zeichen von „Ohne Kategorie". */
ok("ein Rezept mit toter Ordner-Kennung zeigt Ohne-Kategorie statt 📁",
   await seite.evaluate(()=>{
     const sichR=JSON.parse(JSON.stringify(R)), sichF=JSON.parse(JSON.stringify(FD));
     FD.push({id:"7703",name:"Probe-Ordner",ico:"📁"});
     R.push({id:77030,name:"Tote-Kennung",cat:"fld_9999",folder:"7703",blank:false});
     renderFolders();
     const g=document.querySelector('#fldTree .fld-grp[data-gid="cfd_7703"]');
     const z=g&&[...g.querySelectorAll(".fld-rrow")].find(x=>x.dataset.rid==="77030");
     const sym=z?z.firstElementChild.textContent.trim():"";
     const soll=catIco(KAT_OHNE);
     R=sichR; FD=sichF; renderCatNav(); renderFolders();
     return sym===soll && sym!=="📁";
   }));
/* ⚠ Und die Anlage-Maske hat ZWEI Felder: der Ordner darf die Kategorie nicht
   mehr ueberstimmen. */
ok("ein im Ordner angelegtes Rezept bekommt trotzdem seine Kategorie",
   await seite.evaluate((KAT)=>{
     const sichR=JSON.parse(JSON.stringify(R)), sichF=JSON.parse(JSON.stringify(FD));
     FD.push({id:"7702",name:"Probe-Ordner",ico:"📁"}); renderCatNav();
     document.getElementById("newName").value="Frisch-im-Ordner";
     document.getElementById("newCat").value=KAT;
     document.getElementById("newFolder").value="7702";
     document.getElementById("newFlavor").value="";
     createRecipe();
     const n=R.find(r=>r.name==="Frisch-im-Ordner");
     const gut=!!n && n.cat===KAT && String(n.folder)==="7702";
     R=sichR; FD=sichF; renderCatNav(); renderFolders();
     return gut;
   }, KAT_PROBE));

await browser.close(); server.close();
console.log(`\n${gruen} grün · ${rot} ROT`);
process.exit(rot?1:0);
