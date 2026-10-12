// Probe: der Bildausschnitt-Dialog lässt sich SPEICHERN — auch hineingezoomt.
//
// Anlass (Klaus 2026-10-12, Bild vom Tablet): „Die eingefügten Bilder lassen
// sich in der Auswahlansicht verändern … aber nicht speichern. Da gibt es auch
// keinen Speicherknopf, und es wird der erste Stand gespeichert." Der Knopf
// gab es — er lag außerhalb des Sichtbaren: die Seite war hineingezoomt, und
// `position:fixed; inset:0` hing am Seitenrahmen statt am sichtbaren Teil.
//
// ⚠ Gemessen wird gegen den SICHTBAREN Ausschnitt (visualViewport), nicht
// gegen innerHeight — der alte Wächter-Gedanke „liegt im Fenster" war auch
// in Klaus' Lage wahr.
//
//   node tests/smoke_bildausschnitt.mjs

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..');

let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { console.log('⊘ NICHT LAUFFÄHIG: playwright-core fehlt'); process.exit(0); }

function chromiumPfad() {
  const basis = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(basis)) return null;
  for (const d of readdirSync(basis).filter(n => n.startsWith('chromium')).sort().reverse())
    for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
      const p = join(basis, d, rel);
      if (existsSync(p)) return p;
    }
  return null;
}
const exe = chromiumPfad();
if (!exe) { console.log('⊘ NICHT LAUFFÄHIG: kein Chromium gefunden'); process.exit(0); }

let gruen = 0; const rot = [];
const ok = (name, bed, zusatz = '') => {
  if (bed) { gruen++; console.log('  ✓ ' + name); }
  else { rot.push(name); console.log('  ✗ ROT: ' + name + (zusatz ? ' — ' + zusatz : '')); }
};

// Eigener Server auf einem FREIEN Port — eine feste Nummer trifft irgendwann
// einen Server aus einem abgebrochenen Lauf, der ein anderes Verzeichnis
// ausliefert.
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
               '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
               '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const pfad = normalize(join(WURZEL, decodeURIComponent(req.url.split('?')[0])));
  if (!pfad.startsWith(WURZEL)) { res.writeHead(403).end(); return; }
  try {
    const buf = await readFile(pfad);
    res.writeHead(200, { 'Content-Type': MIME[pfad.slice(pfad.lastIndexOf('.'))] || 'application/octet-stream' }).end(buf);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

const browser = await chromium.launch({ executablePath: exe });
const BILD = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#c33"/></svg>');

async function lauf(zoom, breite, hoehe) {
  const seite = await browser.newPage({ viewport: { width: breite, height: hoehe } });
  const fehler = [];
  seite.on('pageerror', e => fehler.push(String(e).slice(0, 200)));
  await seite.route('**/*', r => r.request().url().startsWith(`http://127.0.0.1:${PORT}/`) ? r.continue() : r.abort());
  await seite.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await seite.waitForFunction(() => typeof openCrop === 'function' && typeof R !== 'undefined', null, { timeout: 20000 });
  const rid = await seite.evaluate(b => { const r = { id: 987654, name: 'Zwetschgendatschi', cat: 'kuchen', img: b, imgCrop: { x: 50, y: 50, scale: 1, h: 1 }, ings: [], steps: [], rating: { stars: 0, comment: '', imps: [] } }; R.unshift(r); return r.id; }, BILD);
  if (zoom !== 1) {
    const cdp = await seite.context().newCDPSession(seite);
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: zoom });
    await seite.evaluate(() => new Promise(r => setTimeout(r, 150)));
  }
  await seite.evaluate(id => openCrop(id), rid);
  await seite.evaluate(() => new Promise(r => setTimeout(r, 100)));
  const m = await seite.evaluate(() => {
    const vv = visualViewport;
    const sicht = el => { const b = el.getBoundingClientRect();
      return b.width > 0 && b.left >= vv.offsetLeft - 1 && b.top >= vv.offsetTop - 1 &&
             b.right <= vv.offsetLeft + vv.width + 1 && b.bottom <= vv.offsetTop + vv.height + 1; };
    return { scale: vv.scale, kopf: sicht(document.getElementById('cropHdrSaveBtn')),
             fuss: sicht(document.getElementById('cropSaveBtn')),
             regler: sicht(document.getElementById('cropZoomVal')) };
  });
  return { seite, m, fehler, rid };
}

try {
  for (const [zoom, b, h] of [[1, 1000, 560], [1.135, 1000, 560], [1.6, 1000, 625], [1.4, 400, 800]]) {
    const { seite, m, fehler, rid } = await lauf(zoom, b, h);
    const lage = `${b}×${h}, Zoom ${zoom}`;
    ok(`[${lage}] keine Seitenfehler`, fehler.length === 0, fehler[0]);
    if (zoom !== 1) ok(`[${lage}] der Zoom greift wirklich (sonst misst der Fall nichts)`, Math.abs(m.scale - zoom) < 0.01, String(m.scale));
    ok(`[${lage}] „✓ Speichern“ oben im Kopf ist zu sehen`, m.kopf);
    ok(`[${lage}] „✓ Speichern“ unten ist zu sehen`, m.fuss);
    ok(`[${lage}] die Regler laufen nicht aus dem Schirm`, m.regler);
    // Den GEWÄHLTEN Stand speichern, nicht den ersten
    // ⚠ BENANNTE ABWEICHUNG zu Mein Rezeptbuch: hier gibt es KEINEN Höhen-Regler
    // (cropHeight) — gemessen wird nur der Zoom. Ein Wächter auf ein Element,
    // das es nicht gibt, wäre ein Absturz statt einer Aussage.
    ok(`[${lage}] (Muttis hat keinen Höhen-Regler — die Probe weiss es)`, await seite.evaluate(() => !document.getElementById('cropHeight')));
    await seite.evaluate(() => { const z = document.getElementById('cropZoom'); z.value = 220; z.oninput(); });
    await seite.click('#cropHdrSaveBtn');
    const cr = await seite.evaluate(id => R.find(r => r.id === id).imgCrop, rid);
    ok(`[${lage}] gespeichert wird der gewählte Stand (2,2×)`, cr.scale === 2.2, JSON.stringify(cr));
    const zu = await seite.evaluate(() => { const o = document.getElementById('cropOv'); return o.style.display === 'none' && !o.style.width; });
    ok(`[${lage}] der Dialog schließt und räumt seine Maße wieder auf`, zu);
    await seite.close();
  }
  // ── DIE FORM DES RAHMENS = DIE FORM DER KARTE (Klaus 2026-10-12) ──
  // Gemessen wird das Seitenverhältnis des Rahmens im Dialog gegen das der
  // fertigen Karte NACH dem Speichern — nicht gegen eine Zahl.
  for (const [b, hh, cat, hoehe, name] of [[1000, 625, 'kuchen', 0, 'Kuchen'], [400, 800, 'kuchen', 0, 'Handy'],
                                           [833, 470, 'kuchen', 0, 'Klaus\' Tablet quer'], [833, 470, 'drk', 0, 'Getränk (3:4), Tablet quer']]) {
    const seite = await browser.newPage({ viewport: { width: b, height: hh } });
    await seite.route('**/*', r => r.request().url().startsWith(`http://127.0.0.1:${PORT}/`) ? r.continue() : r.abort());
    await seite.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await seite.waitForFunction(() => typeof openCrop === 'function' && typeof R !== 'undefined', null, { timeout: 20000 });
    const m = await seite.evaluate(async ([bild, cat, hoehe]) => {
      const r = { id: 987001, name: 'Formprobe', cat, img: bild, imgCrop: { x: 50, y: 50, scale: 1, h: 1 }, ings: [], steps: [], rating: { stars: 0, comment: '', imps: [] } };
      R.unshift(r); CAT = 'all'; showSc('recipes'); render();
      await new Promise(z => setTimeout(z, 100));
      openCrop(r.id);
      // ⚠ Benannte Abweichung: Muttis hat keinen Höhen-Regler — die Karte ist 160 px bzw. 3:4.
      await new Promise(z => setTimeout(z, 100));
      const f = document.getElementById('cropFrame').getBoundingClientRect();
      const vv = visualViewport;
      const drin = f.width > 0 && f.right <= vv.offsetLeft + vv.width + 1 && f.bottom <= vv.offsetTop + vv.height + 1;
      saveCrop();
      await new Promise(z => setTimeout(z, 150));
      const k = document.querySelector('#c' + r.id + ' .rcard-img-wrap').getBoundingClientRect();
      return { rahmen: f.width / f.height, karte: k.width / k.height, fw: f.width, kw: k.width, drin };
    }, [BILD, cat, hoehe]);
    const abw = Math.abs(m.rahmen - m.karte) / m.karte;
    ok(`[${name}] der Rahmen hat die Form der Karte (${m.rahmen.toFixed(2)} gegen ${m.karte.toFixed(2)})`, abw < 0.03, JSON.stringify(m));
    ok(`[${name}] … und passt in den Dialog`, m.drin, JSON.stringify(m));
    await seite.close();
  }
} catch (e) {
  rot.push('ABSTURZ: ' + String(e).slice(0, 300));
  console.log('  ✗ ROT: ABSTURZ — ' + String(e).slice(0, 300));
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${gruen} grün · ${rot.length} ROT`);
if (rot.length) { console.log('Rote Zeilen:'); rot.forEach(r => console.log('  - ' + r)); }
process.exitCode = rot.length ? 1 : 0;
