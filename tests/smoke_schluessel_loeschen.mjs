// Probe: jeder gespeicherte API-Schlüssel lässt sich LÖSCHEN — überall, wo er steht.
//
// Anlass (Klaus 2026-10-12): „beim Bilder mit KI generieren kann ich den
// API-Key nicht rückgängig machen, wenn der nicht funktioniert. Ich kann ihn
// nicht löschen." „ändern" bei KI-Bild öffnete das Feld, ließ den alten
// Schlüssel aber gespeichert — beim nächsten Öffnen war er wieder aktiv.
//
// ⚠ Gemessen wird der SPEICHER, nicht nur die Anzeige: ein Knopf, der das
// Feld leert und den Schlüssel liegen lässt, wäre genau der alte Fehler.
//
//   node tests/smoke_schluessel_loeschen.mjs

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
const SK = { claude: 'sk-ant-test-0123456789abcdefWXYZ', openai: 'sk-proj-test-0123456789abcdQRST', mistral: 'mistral-test-0123456789abcdMNOP' };

async function frischeSeite(dialogAntwort = true) {
  const seite = await browser.newPage();
  const fehler = [];
  seite.on('pageerror', e => fehler.push(String(e).slice(0, 200)));
  seite.on('dialog', d => dialogAntwort ? d.accept() : d.dismiss());
  await seite.route('**/*', r => r.request().url().startsWith(`http://127.0.0.1:${PORT}/`) ? r.continue() : r.abort());
  await seite.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await seite.evaluate(k => { localStorage.setItem('claudeKey9', k.claude); localStorage.setItem('openaiImgKey9', k.openai);
    localStorage.setItem('openaiKey9m', 'MEIN-REZEPTBUCH'); localStorage.setItem('claudeKey9m', 'MEIN-REZEPTBUCH'); localStorage.setItem('mistralKey9', k.mistral); }, SK);
  await seite.reload({ waitUntil: 'domcontentloaded' });
  await seite.waitForFunction(() => typeof schluesselLoeschen === 'function' && typeof openImport === 'function', null, { timeout: 20000 });
  return { seite, fehler };
}
const speicher = s => s.evaluate(() => ({ claude: localStorage.getItem('claudeKey9'), openai: localStorage.getItem('openaiImgKey9'),
  meinOpenai: localStorage.getItem('openaiKey9m'), meinClaude: localStorage.getItem('claudeKey9m'), mistral: localStorage.getItem('mistralKey9') }));
const sichtbar = (s, sel) => s.evaluate(sel => { const e = document.querySelector(sel); return !!e && e.offsetParent !== null; }, sel);
const tick = s => s.evaluate(() => new Promise(r => setTimeout(r, 50)));

try {
  // ── 1 · KI-Bild: Klaus' Befund ──
  {
    const { seite, fehler } = await frischeSeite();
    ok('die Seite lädt ohne Seitenfehler', fehler.length === 0, fehler[0]);
    await seite.evaluate(() => { openImport(); switchFovTab('importOv', 'imggen', document.getElementById('impTabImgGen')); });
    await tick(seite);
    ok('KI-Bild: mit Schlüssel steht der Löschen-Knopf da', await sichtbar(seite, '#imggenMain [data-key-del="openai"]'));
    // „ändern“ allein ließ den Schlüssel liegen — jetzt steht im Eingabefeld der alte mit Löschen
    await seite.click('#imggenChangeLbl'); await tick(seite);
    ok('KI-Bild nach „ändern“: der alte Schlüssel steht maskiert da, mit Löschen',
       await sichtbar(seite, '#imggenSetup [data-key-alt="openai"] .key-del-btn'));
    const text = await seite.evaluate(() => document.querySelector('#imggenSetup [data-key-alt="openai"]').innerText);
    ok('… und zeigt den Schlüssel NICHT im Klartext', !text.includes(SK.openai) && text.includes('QRST'), text);
    await seite.click('#imggenSetup [data-key-alt="openai"] .key-del-btn'); await tick(seite);
    const sp = await speicher(seite);
    ok('KI-Bild: Löschen entfernt den Schlüssel aus dem Speicher', !sp.openai, JSON.stringify(sp));
    ok('… und fasst die Ablage von MEIN REZEPTBUCH nicht an (geteilte Adresse)', sp.meinOpenai === 'MEIN-REZEPTBUCH', JSON.stringify(sp));
    ok('… und lässt die ANDEREN Schlüssel stehen', sp.claude === SK.claude && sp.mistral === SK.mistral, JSON.stringify(sp));
    ok('… die Löschen-Zeile verschwindet', !(await sichtbar(seite, '#imggenSetup [data-key-alt="openai"]')));
    // Wiederöffnen: Klaus' Falle war, dass der alte wieder aktiv war
    await seite.evaluate(() => initImgGenPane()); await tick(seite);
    ok('beim Wiederöffnen steht das Eingabefeld da, nicht der alte Schlüssel',
       await sichtbar(seite, '#imggenKeyIn') && !(await sichtbar(seite, '#imggenMain')));
    await seite.close();
  }
  // ── 2 · Abbrechen löscht NICHTS ──
  {
    const { seite } = await frischeSeite(false);
    await seite.evaluate(() => schluesselLoeschen('openai'));
    ok('wer die Rückfrage abbricht, behält seinen Schlüssel', (await speicher(seite)).openai === SK.openai);
    await seite.close();
  }
  // ── 3 · KI-Scan und Text (Claude) ──
  {
    const { seite } = await frischeSeite();
    await seite.evaluate(() => { openImport(); switchFovTab('importOv', 'scan', document.getElementById('impTabScan')); });
    await tick(seite);
    ok('KI-Scan: mit Schlüssel steht der Löschen-Knopf da', await sichtbar(seite, '#scanMain [data-key-del="claude"]'));
    await seite.click('#scanMain [data-key-del="claude"]'); await tick(seite);
    { const sp = await speicher(seite);
      ok('KI-Scan: Löschen entfernt den Claude-Schlüssel', !sp.claude);
      ok('… und lässt den Claude-Schlüssel von MEIN REZEPTBUCH stehen', sp.meinClaude === 'MEIN-REZEPTBUCH', JSON.stringify(sp)); }
    ok('… das Eingabefeld steht wieder da', await sichtbar(seite, '#apiKeyIn'));
    ok('… und der Text-Reiter weiß es auch (kein „aktiv“ mehr)',
       await seite.evaluate(() => document.getElementById('txtMain').style.display === 'none'));
    await seite.close();
  }
  // ── 4 · Einstellungen ──
  {
    const { seite } = await frischeSeite();
    await seite.evaluate(() => showSc('settings')); await tick(seite);
    for (const art of ['claude', 'openai'])
      ok(`Einstellungen: ${art} zeigt Schlüssel + Löschen`, await sichtbar(seite, `#sc-settings [data-key-alt="${art}"] .key-del-btn`));
    // der Klick auf Löschen darf NICHT die Zeile auslösen (die öffnet den Import)
    await seite.click('#sc-settings [data-key-alt="openai"] .key-del-btn'); await tick(seite);
    ok('Einstellungen: OpenAI gelöscht', !(await speicher(seite)).openai);
    ok('… ohne nebenbei den Import zu öffnen',
       await seite.evaluate(() => { const o = document.getElementById('importOv'); return !o || getComputedStyle(o).display === 'none'; }));
    ok('… und die Zeile verschwindet', !(await sichtbar(seite, '#sc-settings [data-key-alt="openai"]')));
    await seite.evaluate(() => toggleMistralKeyField()); await tick(seite);
    ok('Mistral: das Feld zeigt Schlüssel + Löschen', await sichtbar(seite, '#mistralKeyPanel [data-key-alt="mistral"] .key-del-btn'));
    await seite.click('#mistralKeyPanel [data-key-alt="mistral"] .key-del-btn'); await tick(seite);
    ok('Mistral: gelöscht, und das Feld ist leer',
       !(await speicher(seite)).mistral && (await seite.evaluate(() => document.getElementById('mistralKeyIn').value)) === '');
    await seite.close();
  }
  // ── 5 · Ohne Schlüssel kein Löschen-Knopf ──
  {
    const seite = await browser.newPage();
    await seite.route('**/*', r => r.request().url().startsWith(`http://127.0.0.1:${PORT}/`) ? r.continue() : r.abort());
    await seite.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await seite.waitForFunction(() => typeof keyAltZeilen === 'function', null, { timeout: 20000 });
    await seite.evaluate(() => { localStorage.clear(); showSc('settings'); });
    ok('ohne gespeicherten Schlüssel steht nirgends ein Löschen-Knopf',
       await seite.evaluate(() => [...document.querySelectorAll('[data-key-alt]')].every(e => e.style.display === 'none')));
    await seite.close();
  }
  // ── 6 · in allen 8 Sprachen ──
  const fehlt = await (async () => { const s = await browser.newPage();
    await s.route('**/*', r => r.request().url().startsWith(`http://127.0.0.1:${PORT}/`) ? r.continue() : r.abort());
    await s.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await s.waitForFunction(() => typeof LANGS !== 'undefined', null, { timeout: 20000 });
    const f = await s.evaluate(() => ['de','en','ru','zh','es','fr','it','pt'].flatMap(l =>
      ['keyDel','keyDelAsk','keyDelDone','keyAlt'].filter(k => !LANGS[l] || !LANGS[l][k]).map(k => l + '.' + k)));
    await s.close(); return f; })();
  ok('die vier neuen Texte stehen in allen 8 Sprachen', fehlt.length === 0, fehlt.join(','));
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
