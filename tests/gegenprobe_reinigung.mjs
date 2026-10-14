// Gegenprobe zu tests/smoke_reinigung.mjs (Reinigung vor der KI, Klaus 2026-10-14). Steht IDENTISCH in beiden
// Rezeptbüchern. Baut in einer WEGWERF-KOPIE je einen Fehler in die GEBAUTE index.html ein (die Probe misst die
// Seite, die ausgeliefert wird). Jeder Fall muss die Probe umwerfen — mit einer roten Zeile, die zu ihm passt
// („trifft"). Nur fremde rote Zeilen = „aus falschem Grund"; ein Absturz ohne Schlusszeile = „STOLPERT"; ein Anker,
// der nicht genau einmal vorkommt = „toter Anker".
// ⚠ Benannte Grenze: kein Fall gegen das Herausnehmen der Bild-Metadaten — ein Seitenbild aus der Leinwand trägt
//   keine, eine Sabotage daran wäre hier nicht zu unterscheiden (in Workflow PDF und den WorkFlohs gemessen).
// Aufruf: WFPDF_KLON=<Workflow-PDF-Klon> node tests/gegenprobe_reinigung.mjs   ·   NUR_ANKER=1 · NUR_FALL=<Wortteil>
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const I = 'index.html';
const FAELLE = [
  { name: 'der Halt fragt nie', anker: "if(!st.gefragt){st.gefragt=true;st.ok=await kiHaltDialog(name,liste);}", ersatz: "if(false){st.gefragt=true;st.ok=await kiHaltDialog(name,liste);}", trifft: /Halt kommt/ },
  { name: '„Abbrechen" sendet trotzdem', anker: "ov.querySelector('[data-ki-nein]').onclick=()=>{ov.remove();res(false);};});}\n// Der Vermerk", ersatz: "ov.querySelector('[data-ki-nein]').onclick=()=>{ov.remove();res(true);};});}\n// Der Vermerk", trifft: /Abbrechen/ },
  { name: 'der blasse Text wird nicht zugedeckt', anker: "liste.push({seite:i,text:t.str,grund:g});RE.zudecken(img,st,vp.scale);zu++;", ersatz: "liste.push({seite:i,text:t.str,grund:g});zu++;", trifft: /zugedeckt/ },
  { name: 'der Vermerk kommt nicht ans Rezept', anker: "kiVermerken(nr,window._scanKiEntfernt,'scan');", ersatz: "0;", trifft: /Vermerk am Rezept/ },
  { name: 'die Rezeptkarte zeigt den Vermerk nicht', anker: "      ${kiEntferntHtml(r)}\n", ersatz: "\n", trifft: /Rezeptkarte/ },
  { name: 'Claude bekommt das PDF wieder roh', anker: "contentBlock=_seitenBloecke(sp.bilder);window._scanKiEntfernt=sp.liste;", ersatz: "contentBlock={type:'document',source:{type:'base64',media_type:'application/pdf',data:b64}};window._scanKiEntfernt=sp.liste;", trifft: /KEIN PDF|document/ },
  { name: 'Mistral bekommt das PDF wieder roh', anker: "if(isPdf){   // 🧽 ein PDF geht als gereinigte Seitenbilder hinaus, nie roh", ersatz: "if(false){", trifft: /Mistral/ },
  { name: 'der Stapel hält je Datei an', anker: "files[i].name,rein);if(!sp)throw new Error(KT('abgebr'));\n", ersatz: "files[i].name,kiReiniger());if(!sp)throw new Error(KT('abgebr'));\n", trifft: /EINMAL je Stapel|Vermerk, das saubere/ },
  { name: 'PDF-Text auslesen schickt das PDF roh', anker: "          ..._seitenBloecke(sp.bilder),\n", ersatz: "          {type:'document', source:{type:'base64', media_type:'application/pdf', data:'eA=='}},\n", trifft: /PDF-Text|document/ },
  { name: 'ein kaputtes Foto geht als Original hinaus', anker: "  catch(e){ return ''; }", ersatz: "  catch(e){ return typeof quelle==='string'?quelle:''; }", trifft: /Original/ },
  { name: 'die Prüfung läuft von selbst', anker: "scanOrigDatei=file;   // 🛡", ersatz: "scanOrigDatei=file;setTimeout(scanDateiPruefen,0);   // 🛡", trifft: /erst auf Knopfdruck/ },
  { name: 'der Prüf-Knopf erscheint nicht', anker: "if(pb){pb.textContent=KT('pruefBtn');pb.style.display='';}", ersatz: "if(pb){pb.style.display='none';}", trifft: /Datei prüfen/ },
  // nur wo es den Text-Import über Mistral gibt (Mein-Rezeptbuch, Mixarium); sonst entfällt der Fall
  { name: 'der Text-Import schickt die Datei roh an Mistral', nurWenn: 'handleOcrTxtFile', anker: "var sp = await pdfSicherSenden(dataUrl, file.name, kiReiniger());\n      if (!sp) { if (typeof setTxtSt === 'function') setTxtSt(KT('abgebr'), 'err'); return; }\n      r = { available: true, text: await ocrSeiten(sp.bilder, window.__mistralOcrKey), model: '' };", ersatz: "r = await window.SbkimOcr.recognize(dataUrl, { provider: 'mistral', apiKey: window.__mistralOcrKey, mimeType: file.type });", trifft: /Text-Import|Mistral die Datei|nicht die PDF-Datei/ },
  { name: 'der Bildauftrag hält nicht an', anker: "if(!(await bildAuftragFreigabe(prompt)))throw", ersatz: "if(false)throw", trifft: /Bildauftrag hält an/ }
];
{ const html = fs.readFileSync(path.join(WURZEL, I), 'utf8'); for (let i = FAELLE.length - 1; i >= 0; i--) if (FAELLE[i].nurWenn && !html.includes(FAELLE[i].nurWenn)) { console.log('  ⊘ entfällt hier: ' + FAELLE[i].name); FAELLE.splice(i, 1); } }
if (process.env.NUR_FALL) { const n = process.env.NUR_FALL.toLowerCase(); for (let i = FAELLE.length - 1; i >= 0; i--) if (!FAELLE[i].name.toLowerCase().includes(n)) FAELLE.splice(i, 1); console.log('nur ' + FAELLE.length + ' Fall/Fälle'); }
let gefangen = 0, durch = 0, falsch = 0, tot = 0;
for (const f of FAELLE) { const n = fs.readFileSync(path.join(WURZEL, I), 'utf8').split(f.anker).length - 1; if (n !== 1) { tot++; console.log('  ☠ TOTER ANKER (' + n + '×): ' + f.name); } }
if (process.env.NUR_ANKER) { console.log(`\n${FAELLE.length - tot} Anker leben · ${tot} tot`); process.exit(tot ? 1 : 0); }
if (tot) { console.log('\nTote Anker — erst nachziehen, dann messen.'); process.exit(1); }
const kopie = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-gp-'));
const kopieren = () => {
  fs.rmSync(kopie, { recursive: true, force: true }); fs.mkdirSync(kopie);
  for (const e of fs.readdirSync(WURZEL)) if (!['node_modules', '.git'].includes(e)) fs.cpSync(path.join(WURZEL, e), path.join(kopie, e), { recursive: true });
  if (fs.existsSync(path.join(WURZEL, 'node_modules'))) fs.symlinkSync(path.join(WURZEL, 'node_modules'), path.join(kopie, 'node_modules'));
};
const tausche = (anker, ersatz) => { const f = path.join(kopie, I), s = fs.readFileSync(f, 'utf8'); if (s.split(anker).length !== 2) return false; fs.writeFileSync(f, s.replace(anker, () => ersatz)); return true; };
const lauf = () => spawnSync('node', [path.join(kopie, 'tests', 'smoke_reinigung.mjs')], { env: { WFPDF_KLON: path.resolve(WURZEL, '..', 'Workflow-PDF'), ...process.env, WURZEL: kopie }, encoding: 'utf8', timeout: 600000 });
kopieren();
const basis = lauf();
if (basis.status !== 0) { console.log('Ausgangslage ist schon rot (oder nicht lauffähig) — Gegenprobe misst nichts.\n' + (basis.stdout || '').slice(-1500)); process.exit(2); }
for (const f of FAELLE) {
  kopieren();
  if (!tausche(f.anker, f.ersatz)) { tot++; console.log('  ☠ TOTER ANKER: ' + f.name); continue; }
  const r = lauf(); const rote = (r.stdout || '').split('\n').filter(l => l.includes('✗ ROT'));
  if (!rote.length && !/\d+ grün · \d+ ROT/.test(r.stdout || '')) { falsch++; console.log('  ⚠ STOLPERT (rc=' + r.status + '): ' + f.name + '\n      ' + ((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-3).join('\n      ')); }
  else if (!rote.length) { durch++; console.log('  ✗ DURCHGERUTSCHT: ' + f.name); }
  else if (!rote.some(l => f.trifft.test(l))) { falsch++; console.log('  ⚠ AUS FALSCHEM GRUND: ' + f.name + '\n      ' + rote.join('\n      ')); }
  else { gefangen++; console.log('  ✓ gefangen: ' + f.name + '  (' + rote.length + ' rot)\n      ' + rote.slice(0, 3).map(l => l.slice(0, 160)).join('\n      ')); }
}
fs.rmSync(kopie, { recursive: true, force: true });
console.log(`\n${gefangen} gefangen · ${durch} durchgerutscht · ${falsch} aus falschem Grund oder gestolpert · ${tot} tote Anker`);
process.exit(durch || falsch || tot ? 1 : 0);
