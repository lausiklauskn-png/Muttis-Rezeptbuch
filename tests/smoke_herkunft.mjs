/* Probe: Herkunft am Rezept · stabile Kennung · was der Import unsichtbar mitbringt.
   Klaus 2026-09-16: „das Rezept Export, dass es die Spore traegt … wenn ich es
   wieder einfuege, soll die Spur mit drin bleiben."

   Gemessen im ECHTEN Browser an der GEBAUTEN index.html. Der Export wird ueber
   die App-eigene `exportData()` gefahren; nur `dlBlob` ist umgehaengt, damit die
   Datei statt auf die Platte in die Probe faellt — gemessen wird also genau das,
   was die App hinausgeben WUERDE, nicht ein nachgebauter zweiter Weg.

   ⚠ EINE PROBE, DIE WIRFT, IST ROT — NICHT EIN TOTER LAUF. Ohne den Fang unten
   stirbt sie ohne Schlusszeile, und die Gegenprobe kann dann nur „rot aus
   falschem Grund" sagen. Kein `process.exit()` (verwirft den stdout-Puffer). */
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

/* Nur BEKANNTE Kategorien — dann meldet sich der Zuordnungs-Dialog nicht und
   der Import laeuft durch. „fld_999" ist mit Absicht ein Ordner, den es nicht
   gibt: das ist Klaus' „unsichtbarer Ordner". */
const BESTAND = [
  { id:1, name:"Gulasch",  cat:"fleisch", shut:true, ings:[], steps:[] },
  { id:2, name:"Suppe",    cat:"suppe",   shut:true, ings:[], steps:[] },
  { id:3, name:"Ohne-Zuhause", cat:"",    shut:true, ings:[], steps:[] },
  { id:4, name:"Toter-Ordner",  cat:"fld_999", shut:true, ings:[], steps:[] },
];

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
await seite.addInitScript(b=>{ localStorage.setItem("mrz9", JSON.stringify(b)); localStorage.setItem("mlang9","de"); }, BESTAND);
await seite.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil:"domcontentloaded" });
await seite.waitForFunction(()=>typeof R!=="undefined"&&Array.isArray(R)&&typeof exportData==="function"&&typeof _knotenKennung==="function", null, {timeout:25000});
/* dlBlob umhaengen: die Datei faellt in die Probe statt auf die Platte. */
await seite.evaluate(()=>{ window.__gefangen=null; window.__dlAlt=window.dlBlob;
  window.dlBlob=function(blob){ return blob.text().then(t=>{window.__gefangen=t;}); }; });

console.log("\n── 0 · Die Seite läuft ──");
ok("kein Seitenfehler beim Laden"+(seitenfehler.length?" — "+seitenfehler[0].slice(0,90):""), seitenfehler.length===0);

async function exportiere(){
  await seite.evaluate(async()=>{ window.__gefangen=null; exportData(); });
  await seite.waitForFunction(()=>window.__gefangen!==null, null, {timeout:15000});
  return JSON.parse(await seite.evaluate(()=>window.__gefangen));
}

console.log("\n── 1 · Der Export trägt Kennung und Herkunft ──");
const d1 = await exportiere();
ok("die Datei nennt den Knoten, von dem sie kommt", typeof d1.knoten==="string" && d1.knoten.length>3);
ok("die Fassung ist auf 10 gehoben (v9 kannte nichts davon)", d1.version===10);
const rez1 = d1.recipes.filter(r=>r.name);
ok("jedes Rezept hat eine stabile Kennung (uid)", rez1.length>0 && rez1.every(r=>typeof r.uid==="string" && r.uid.length>8));
ok("die Kennungen sind untereinander verschieden", new Set(rez1.map(r=>r.uid)).size===rez1.length);
ok("jedes Rezept trägt GENAU EINE Station", rez1.every(r=>Array.isArray(r.herkunft)&&r.herkunft.length===1));
ok("die Station ist dieser Knoten, mit Datum", rez1.every(r=>r.herkunft[0].k===d1.knoten && /^\d{4}-\d{2}-\d{2}$/.test(r.herkunft[0].d)));

console.log("\n── 2 · ⚠ NUR DIE KENNUNG, NIE EIN NAME ──");
/* Ein Gerätename wäre ein Hinweis auf eine PERSON und wandert mit jedem
   Rezept zu Fremden. Gemessen wird die FORM der Station, nicht ein Wort. */
const felder = new Set(); rez1.forEach(r=>r.herkunft.forEach(st=>Object.keys(st).forEach(k=>felder.add(k))));
ok("eine Station hat genau zwei Felder: k und d", felder.size===2 && felder.has("k") && felder.has("d"));
const alsText = JSON.stringify(rez1.map(r=>r.herkunft));
ok("in der Kette steht kein Gerätename", !/geraet|device|handy|tablet|name/i.test(alsText));

console.log("\n── 3 · Zweimal exportieren hängt KEINE zweite Station an ──");
const d2 = await exportiere();
ok("dieselbe Station kommt nicht doppelt", d2.recipes.filter(r=>r.name).every(r=>r.herkunft.length===1));
ok("die Kennung bleibt über den zweiten Export gleich",
   d2.recipes.find(r=>r.name==="Gulasch").uid === rez1.find(r=>r.name==="Gulasch").uid);

console.log("\n── 4 · Ein anderes Gerät hängt seine Station an ──");
await seite.evaluate(()=>{ window.__MRZ_NODEID="knoten-zweites-geraet"; });
const d3 = await exportiere();
const g3 = d3.recipes.find(r=>r.name==="Gulasch");
ok("jetzt sind es zwei Stationen", g3.herkunft.length===2);
ok("die zweite ist das andere Gerät", g3.herkunft[1].k==="knoten-zweites-geraet");
ok("die erste steht unverändert davor", g3.herkunft[0].k===d1.knoten);

console.log("\n── 5 · Die Kette ist gedeckelt, und das Kürzen steht dran ──");
await seite.evaluate(()=>{
  const r=R.find(x=>x.name==="Gulasch");
  r.herkunft=[1,2,3,4,5].map(i=>({k:"fremd-"+i,d:"2026-01-0"+i}));
  window.__MRZ_NODEID="knoten-sechste-station";
});
const d4 = await exportiere();
const g4 = d4.recipes.find(r=>r.name==="Gulasch");
ok("die Kette bleibt bei 5 Stationen stehen", g4.herkunft.length===5);
ok("die ÄLTESTE fällt heraus, die neueste steht hinten",
   g4.herkunft[0].k==="fremd-2" && g4.herkunft[4].k==="knoten-sechste-station");
ok("und dass gekürzt wurde, steht dabei", g4.herkGekuerzt===true);

console.log("\n── 6 · Wiedereinfügen: dasselbe Rezept kommt NICHT doppelt ──");
async function fuegeHinzu(datei){
  await seite.evaluate(async(txt)=>{
    const f=new File([txt],"probe.json",{type:"application/json"});
    importData({target:{files:[f],value:""}});
  }, JSON.stringify(datei));
  await seite.waitForSelector("#_impMerge",{timeout:15000});
  await seite.click("#_impMerge");
  await seite.waitForTimeout(400);
  return await seite.evaluate(()=>R.filter(r=>r.name).map(r=>({n:r.name,u:r.uid,c:r.cat,f:r.folder})));
}
const vorher = await seite.evaluate(()=>R.filter(r=>r.name).length);
const nachGleich = await fuegeHinzu(d4);
ok("die Zahl der Rezepte bleibt gleich", nachGleich.length===vorher);
ok("Gulasch gibt es genau einmal", nachGleich.filter(r=>r.n==="Gulasch").length===1);

console.log("\n── 7 · ⚠ DER EIGENTLICHE FUND: umbenannt ist trotzdem dasselbe ──");
/* Bisher wurde am NAMEN verglichen — ein umbenanntes Rezept kam als zweites
   dazu. Mit der Kennung nicht mehr. */
const umbenannt = JSON.parse(JSON.stringify(d4));
umbenannt.recipes.forEach(r=>{ if(r.name==="Gulasch") r.name="Gulasch nach Omas Art"; });
const nachUmbenannt = await fuegeHinzu(umbenannt);
ok("das umbenannte Rezept kommt NICHT als zweites dazu", nachUmbenannt.length===vorher);
ok("es gibt weiterhin genau ein Rezept mit dieser Kennung",
   nachUmbenannt.filter(r=>r.u===nachGleich.find(x=>x.n==="Gulasch").u).length===1);

console.log("\n── 8 · Zwei WIRKLICH verschiedene Rezepte mit gleichem Namen ──");
/* Die Gegenrichtung: bisher verschwand das zweite still. */
const fremd = JSON.parse(JSON.stringify(d4));
fremd.recipes = [{ id:77, name:"Gulasch", uid:"fremder-knoten-abc-12345", cat:"fleisch", shut:true, ings:[], steps:[],
                   herkunft:[{k:"fremder-knoten",d:"2026-09-16"}] }];
const nachFremd = await fuegeHinzu(fremd);
ok("das fremde Gulasch landet DAZU, statt still zu verschwinden", nachFremd.length===vorher+1);
ok("beide tragen ihre eigene Kennung",
   nachFremd.filter(r=>r.n==="Gulasch"||r.n==="Gulasch nach Omas Art").length===2);
/* ⚠ UND DIE FREMDE KENNUNG BLEIBT WORTGLEICH ERHALTEN. Ohne das waere der
   ganze Weg umsonst: schriebe der Import eine NEUE Kennung darueber, erkennt
   der Absender sein eigenes Rezept beim Zurueckkommen nicht wieder — und
   genau dann faengt das Doppeln wieder an. Der Gegenprobe-Fall „die
   mitgebrachte Kennung wird wieder weggeworfen" rutschte durch, weil diese
   Zeile fehlte; gefunden hat es die Gegenprobe, nicht das Nachdenken. */
ok("die fremde Kennung bleibt Zeichen für Zeichen erhalten",
   nachFremd.some(r=>r.u==="fremder-knoten-abc-12345"));

console.log("\n── 9 · Eine alte Datei ohne Kennung geht den alten Weg ──");
const alteDatei = { version:9, recipes:[
  { id:1, name:"Gulasch", cat:"fleisch", shut:true, ings:[], steps:[] },      // Name schon da → fällt weg
  { id:2, name:"Ganz-Neues-Gericht", cat:"fleisch", shut:true, ings:[], steps:[] } ] };
const vor9 = (await seite.evaluate(()=>R.filter(r=>r.name).length));
const nach9 = await fuegeHinzu(alteDatei);
ok("ohne Kennung entscheidet weiter der Name — das Bekannte fällt weg", nach9.length===vor9+1);
ok("das wirklich Neue ist da", nach9.some(r=>r.n==="Ganz-Neues-Gericht"));
ok("und es hat beim Hereinkommen eine Kennung bekommen",
   (nach9.find(r=>r.n==="Ganz-Neues-Gericht")||{}).u);

console.log("\n── 10 · ⚠ Die Ordner kommen beim Hinzufügen MIT ──");
/* Klaus' „unsichtbarer Ordner": bis zum 2026-09-16 fasste der Merge-Weg FD
   nicht an, und ein Rezept zeigte danach auf einen Ordner, den es hier nicht
   gibt. Vorhandene Ordner dürfen dabei NICHT überschrieben werden. */
await seite.evaluate(()=>{ FD=[{id:"5",name:"Meiner",ico:"📁"}]; svFD(); });
const mitOrdner = { version:10, knoten:"fremd", folders:[{id:"5",name:"FREMD-DARF-NICHT-GEWINNEN",ico:"❌"},{id:"42",name:"Mutti-Ordner",ico:"📂"}],
  recipes:[{ id:9, name:"Aus-Muttis-Ordner", uid:"mutti-xyz-99", cat:"fleisch", folder:"42", shut:true, ings:[], steps:[] }] };
await fuegeHinzu(mitOrdner);
const ordner = await seite.evaluate(()=>FD.map(f=>({id:String(f.id),n:f.name})));
ok("der fehlende Ordner ist jetzt da", ordner.some(f=>f.id==="42"&&f.n==="Mutti-Ordner"));
/* ⚠ DIESER WAECHTER WAR BLIND. Er las `find(id==="5").name` — und `concat`
   legt den fremden Ordner NEBEN den eigenen, statt ihn zu ersetzen: `find`
   trifft den ersten, also meinen, und alles sah gut aus. Gemessen wird jetzt
   BEIDES: der Name stimmt UND es gibt die Kennung nur einmal. */
ok("der EIGENE Ordner wurde nicht überschrieben", ordner.find(f=>f.id==="5").n==="Meiner");
ok("und keine Ordner-Kennung kommt doppelt vor",
   new Set(ordner.map(f=>f.id)).size===ordner.length);
ok("das Rezept findet seinen Ordner wirklich",
   await seite.evaluate(()=>{ const r=R.find(x=>x.name==="Aus-Muttis-Ordner"); return !!(r&&ordnerVonRezept(r)); }));

console.log("\n── 11 · Der Import sagt, was unsichtbar mitkommt ──");
await seite.evaluate(()=>{
  const f=new File([JSON.stringify({version:10,recipes:[
    {id:1,name:"Sichtbar",cat:"fleisch",uid:"a-1"},
    {id:2,name:"Heimatlos-1",cat:"",uid:"a-2"},
    {id:3,name:"Heimatlos-2",cat:"fld_12345",uid:"a-3"}],folders:[]})],"p.json",{type:"application/json"});
  importData({target:{files:[f],value:""}});
});
await seite.waitForSelector("#importChoiceOv",{timeout:15000});
const hinweis = await seite.evaluate(()=>{ const e=document.querySelector(".imp-ohnekat"); return e?e.textContent.trim():""; });
ok("der Dialog nennt die Zahl ohne Zuhause", /\b2\b/.test(hinweis));
ok("und sagt, wo sie erscheinen", /Ohne Kategorie/i.test(hinweis));
await seite.evaluate(()=>{ const o=document.querySelector("#importChoiceOv"); if(o)o.remove(); });

console.log("\n── 12 · ⚠ Das Zusammenführen steht an EINER Stelle ──");
/* Beim ersten Bau habe ich nur EINEN der zwei Import-Wege gefunden: die Datei
   nennt ihre Liste `imported`, der Tresor `recs`. Gemergt war damit eine HALBE
   Reparatur. Dieser Wächter misst die URSACHE, nicht den Einzelfall — ein
   dritter Weg, der morgen dazukommt und sich seinen eigenen Dubletten-Riegel
   baut, wird hier rot. */
const quelle = readFileSync(join(WURZEL,"index.html"),"utf8");
const ohneKommentare = quelle.replace(/\/\*[\s\S]*?\*\//g,"");
ok("der Dubletten-Riegel steht genau einmal im Code",
   (ohneKommentare.match(/const existingNames=new Set/g)||[]).length===1);
ok("und die gemeinsame Funktion wird von MEHREREN Wegen gerufen",
   (ohneKommentare.match(/_zusammenfuehren\(/g)||[]).length>=3);
ok("beide bekannten Import-Wege gehen durch sie hindurch",
   /_zusammenfuehren\(\s*imported/.test(ohneKommentare) && /_zusammenfuehren\(\s*recs/.test(ohneKommentare));

ok("kein Seitenfehler über den ganzen Lauf"+(seitenfehler.length?" — "+seitenfehler[0].slice(0,110):""), seitenfehler.length===0);
await browser.close(); server.close();
console.log(`\n${gruen} grün · ${rot} ROT`);
process.exitCode = rot?1:0;
