/* Probe: JEDE Beschriftung im Einstellungs-Bildschirm ist uebersetzbar — und wird uebersetzt.

   Klaus 2026-09-16, mit Bild aus der englischen Oberflaeche: „Mit dem Netzwerk
   verbinden in Einstellungen ist nicht uebersetzt worden und genauso Mistral-
   Schluessel" · „Und Werkzeuge und Pinnwand. Die beschreibenden Texte sind auch
   nicht uebersetzt."

   ⚠ DER WAECHTER MISST DIE FAMILIE, NICHT DIE VIER ZEILEN AUS DEM BILD.
   Uebersetzt wird nur, was eine `id` traegt UND in der Namensliste des Setzers
   steht. Eine Beschriftung ohne id ist STILL deutsch — kein Fehler, keine rote
   Zeile, nur ein deutscher Satz in einer englischen Oberflaeche. Ein Waechter
   auf „Mistral heisst jetzt Mistral key" waere morgen an der naechsten Zeile
   blind. Gemessen wird deshalb: sammle ALLE Beschriftungen des Bildschirms und
   bestehe darauf, dass jede entweder einen Schluessel hat oder namentlich als
   Ausnahme dasteht.

   ⚠ UND IN BEIDE RICHTUNGEN. „Auf Englisch steht nichts Deutsches mehr" waere
   auch dann gruen, wenn die Beschriftungen leer waeren. Deshalb wird auf
   Deutsch ZUERST gemessen, dass dort wirklich der deutsche Satz steht.

   ⚠ EINE PROBE, DIE WIRFT, IST ROT — NICHT EIN TOTER LAUF. Kein process.exit(). */
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";

const WURZEL = process.cwd();
const TYP = { ".html":"text/html; charset=utf-8", ".js":"text/javascript", ".json":"application/json",
              ".css":"text/css", ".svg":"image/svg+xml", ".png":"image/png", ".jpg":"image/jpeg" };
let gruen = 0, rot = 0;
const ok = (t,b)=>{ if(b){gruen++;console.log("  ✓ "+t);} else {rot++;console.log("  ✗ ROT — "+t);} };

/* ── app-eigen: was diese App speichert und wie sie heisst ────────────── */
const LANG_KEY  = "mlang9";
const APP_NAME  = "Muttis Rezeptbuch";
/* Die neuen Schluessel dieser App. Muttis Rezeptbuch hat die Abschnitte Netz
   und Werkzeuge NICHT — dort steht eine kuerzere Liste. Drei Apps dieselbe
   Zusicherung behaupten zu lassen waere in einer davon eine Luege. */
const NEUE = ["sMistralLbl","sMistralSub","sOfflineCap"];

/* ── benannte Ausnahmen: was mit Absicht NICHT uebersetzt wird ─────────── */
/* Nach KENNUNG, nicht nach Text: der Zaehler setzt sich zur Laufzeit aus einer
   ZAHL und einem uebersetzten Wort zusammen (`${n} ${T('bnRec')}`). In Mein
   Mixarium heisst dieses Wort in beiden Sprachen „Drinks" — die Zeile bleibt
   also mit Recht stehen, und ein Wächter auf ihren Wortlaut misst nichts. */
const AUSNAHMEN_ID = { sRCount: "Zähler: Zahl + übersetztes Wort" };
const AUSNAHMEN = [
  { muster: new RegExp("^" + APP_NAME.replace(/[.*+?^${}()|[\]\\]/g,"\\$&") + "$"), grund: "Eigenname der App" },
  { muster: /^©\s*\d{4}\s+by\s+/,        grund: "Name des Urhebers" },
  { muster: /^Version:?\s*[\d.]+\s*·?$/, grund: "Versionsnummer — das Wort daneben (sOfflineCap) IST uebersetzt" },
  { muster: /^[\w.+-]+@[\w.-]+$/,        grund: "E-Mail-Adresse" },
  { muster: /^[–—\-]$/,                  grund: "Platzhalter, wird zur Laufzeit mit einer Zahl gefuellt" },
];

const server = createServer((q,a)=>{
  const pfad = join(WURZEL, decodeURIComponent(q.url.split("?")[0]).replace(/^\/+/,"") || "index.html");
  if(!existsSync(pfad)||!pfad.startsWith(WURZEL)){a.writeHead(404);a.end();return;}
  a.writeHead(200,{"content-type":TYP[extname(pfad)]||"application/octet-stream"});
  a.end(readFileSync(pfad));
});
await new Promise(r=>server.listen(0,r));
const port = server.address().port;

const browser = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
let _abgestuerzt=false;
async function _schlussNachAbsturz(e){
  if(_abgestuerzt)return; _abgestuerzt=true; rot++;
  console.log("  ✗ ROT — die Probe ist abgestuerzt: "+String((e&&e.message)||e).split("\n")[0]);
  try{ await browser.close(); }catch(_){}
  try{ server.close(); }catch(_){}
  console.log(`\n${gruen} grün · ${rot} ROT`);
  process.exitCode=1;
}
process.on("unhandledRejection",_schlussNachAbsturz);
process.on("uncaughtException",_schlussNachAbsturz);

const seite = await browser.newPage();
let seitenfehler = [];
seite.on("pageerror", e => seitenfehler.push(String(e)));
await seite.addInitScript(k=>{ localStorage.setItem(k,"de"); }, LANG_KEY);
await seite.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil:"domcontentloaded" });
await seite.waitForFunction(()=>typeof LANGS!=="undefined" && document.getElementById("bn-settings"));

/* Der ECHTE Weg: auf den Knopf in der Navi tippen, nicht den Bildschirm von
   Hand sichtbar machen — eine Probe, die sich ihre Ausgangslage erfindet,
   misst die Erfindung. */
/* ⚠ WARTEN AUF DIE BEDINGUNG, NICHT AUF DIE UHR. Mein Mixarium legt beim
   Start eine Animation über den ganzen Schirm (#boot-splash, #mxAniOv, 5,5 s)
   — der Knopf ist da, hat Größe und ist trotzdem nicht zu treffen. Gemessen
   wird deshalb, was der Finger erlebt: liegt der Knopf wirklich obenauf?
   In den Rezeptbüchern trifft das sofort zu; eine feste Wartezeit wäre dort
   verschenkte Zeit und hier ein Rennen, das irgendwann verloren geht. */
/* Mein Mixarium klappt seine Navi-Leiste nach kurzer Zeit ZUSAMMEN — sie
   steht dann bis auf 16 px unter der Kante und faehrt beim Ueberfahren wieder
   heraus. Das ist Absicht, kein Fehler: ohne diesen Griff misst die Probe eine
   App, die es so nicht gibt. In den Rezeptbuechern tut die Zeile nichts. */
if (await seite.$("#bnav")) { try { await seite.hover("#bnav"); } catch(_e) {} }
await seite.waitForFunction(()=>{
  const e=document.getElementById("bn-settings"); if(!e) return false;
  const b=e.getBoundingClientRect(); if(!b.width||!b.height) return false;
  const oben=document.elementFromPoint(b.left+b.width/2, b.top+b.height/2);
  return !!oben && (oben===e || e.contains(oben));
}, null, { timeout:30000 });
await seite.click("#bn-settings");
await seite.waitForFunction(()=>document.getElementById("sc-settings")?.classList.contains("on"));

/* Sammelt jede Beschriftung samt ihrem EIGENEN Text: was in Kindern mit
   eigener id steht, gehoert denen, nicht dieser Zeile. */
const sammeln = () => seite.evaluate(()=>{
  const raus = [];
  document.querySelectorAll("#sc-settings .sett-head, #sc-settings .sett-lbl, #sc-settings .sett-sub").forEach(el=>{
    const kopie = el.cloneNode(true);
    kopie.querySelectorAll("[id]").forEach(k=>k.remove());
    raus.push({ id: el.id || "", eigen: kopie.textContent.replace(/\s+/g," ").trim(),
                sicht: (el.textContent||"").replace(/\s+/g," ").trim() });
  });
  return raus;
});

const langs = await seite.evaluate(()=>JSON.parse(JSON.stringify(LANGS)));
const deutsch = await sammeln();

/* Jetzt derselbe Bildschirm auf Englisch — über den ECHTEN Weg, die
   Sprach-Auswahl in den Einstellungen. */
await seite.click('#langGrid .lang-chip[onclick*="\'en\'"]');
await seite.waitForFunction(()=>CL==="en");
const englisch = await sammeln();

console.log("\n── 0 · die Ausgangslage trägt überhaupt etwas ──");
ok(`der Einstellungs-Bildschirm zeigt genug Beschriftungen (${deutsch.length})`, deutsch.length >= 25);
ok("LANGS trägt alle acht Sprachen", ["de","en","ru","zh","es","fr","it","pt"].every(l=>langs[l]));
ok("beide Messungen sehen dieselben Zeilen", deutsch.length === englisch.length);
const ausWb = deutsch.filter(b=>b.sicht && Object.values(langs.de).some(v=>String(v).replace(/\s+/g," ").trim()===b.sicht));
ok(`das Wörterbuch treibt den Bildschirm wirklich (${ausWb.length} Zeilen stehen darin)`, ausWb.length >= 20);

/* ⚠ GEMESSEN WIRD DIE WIRKUNG, NICHT DER NAME.
   Mein erster Anlauf fragte „trägt die Zeile eine id, die ein LANGS-Schlüssel
   ist?" — und meldete prompt drei Zeilen als stumm, die sehr wohl übersetzt
   werden: sie hängen an einem Schlüssel mit ANDEREM Namen (sApiKeyLbl ←
   T('apiKeyLbl'), sA11yHead ← T('a11yHead')). Ein Wächter auf den Namen misst
   nicht, was ein Nutzer erlebt — und er meldet in die FALSCHE Richtung. */
console.log("\n── 1 · jede Beschriftung ändert sich beim Sprachwechsel — oder hat einen Grund ──");
const stehen = deutsch.map((d,i)=>({...d, en: englisch[i]?.sicht ?? ""}))
                      .filter(b=>b.sicht && b.sicht === b.en);
const ohneGrund = stehen.filter(b=>{
  // gedeckt: der Satz steht im Wörterbuch UND ist auf Englisch derselbe
  const gedeckt = Object.keys(langs.de).some(k =>
      String(langs.de[k]).replace(/\s+/g," ").trim() === b.sicht &&
      String(langs.en[k] ?? "").replace(/\s+/g," ").trim() === b.sicht);
  if (gedeckt) return false;
  if (AUSNAHMEN_ID[b.id]) return false;
  return !AUSNAHMEN.some(a=>a.muster.test(b.sicht));
});
ok("keine Beschriftung bleibt ohne Grund deutsch stehen"
   + (ohneGrund.length ? " — steht still: " + ohneGrund.map(b=>`„${b.sicht}“`).join(" · ") : ""),
   ohneGrund.length === 0);

console.log("\n── 2 · die neuen Schlüssel stehen in ALLEN acht Sprachen ──");
for(const k of NEUE){
  const fehlt = ["de","en","ru","zh","es","fr","it","pt"].filter(l=>langs[l][k]===undefined);
  ok(`${k}: acht Sprachen` + (fehlt.length ? " — fehlt in " + fehlt.join(",") : ""), fehlt.length===0);
}
const gleich = NEUE.filter(k=>langs.en[k]!==undefined && langs.en[k]===langs.de[k]);
ok("keine englische Fassung ist wortgleich mit der deutschen"
   + (gleich.length ? " — wortgleich: " + gleich.join(", ") : ""), gleich.length===0);

/* Klaus' Befund NAMENTLICH, damit die rote Zeile seinen Satz trägt und nicht
   nur eine Zahl. Gefragt wird nach der id — sOfflineCap ist ein <span> IN
   einer Zeile, steht also nicht in der Sammlung oben. */
console.log("\n── 3 · Klaus' Befund, Zeile für Zeile (auf Englisch) ──");
for(const k of NEUE){
  const gezeigt = await seite.evaluate(id=>{
    const el=document.getElementById(id); return el ? (el.textContent||"").replace(/\s+/g," ").trim() : null;
  }, k);
  if(gezeigt===null){ ok(`${k}: steht im Einstellungs-Bildschirm`, false); continue; }
  ok(`${k}: zeigt „${langs.en[k]}“`, gezeigt === String(langs.en[k]).replace(/\s+/g," ").trim());
}

/* Gegenrichtung: auf Deutsch steht wirklich der deutsche Satz. Ohne das wäre
   Abschnitt 3 auch mit LEEREN Beschriftungen zufrieden. */
console.log("\n── 4 · und auf Deutsch steht der deutsche Satz ──");
await seite.click('#langGrid .lang-chip[onclick*="\'de\'"]');
await seite.waitForFunction(()=>CL==="de");
for(const k of NEUE){
  const gezeigt = await seite.evaluate(id=>{
    const el=document.getElementById(id); return el ? (el.textContent||"").replace(/\s+/g," ").trim() : null;
  }, k);
  ok(`${k}: zurück auf „${langs.de[k]}“`, gezeigt === String(langs.de[k]).replace(/\s+/g," ").trim());
}

console.log("\n── 6 · und der andere Speicher-Schlüssel bleibt unberührt ──");
const fremd = await seite.evaluate(()=>[...Array(localStorage.length).keys()]
  .map(i=>localStorage.key(i)).filter(k=>/^(mlang9m|mxlang9m)$/.test(k)));
ok("der Sprach-Schlüssel der Schwester-Apps bleibt leer" + (fremd.length?" — belegt: "+fremd.join(","):""),
   fremd.length===0);

ok("kein Seitenfehler über den ganzen Lauf" + (seitenfehler.length?": "+seitenfehler[0]:""), seitenfehler.length===0);

await browser.close();
server.close();
console.log(`\n${gruen} grün · ${rot} ROT`);
process.exitCode = rot ? 1 : 0;
