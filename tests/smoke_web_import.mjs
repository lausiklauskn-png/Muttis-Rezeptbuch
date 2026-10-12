// Probe: der Web-Import überlebt den Ausfall EINES Abruf-Dienstes.
//
// Anlass (Klaus 2026-10-12): Chefkoch-Import meldete „Seite nicht erreichbar
// (HTTP 401)", obwohl er kurz vorher ging. Der Code war seit der ersten
// Fassung unverändert — geändert hatte sich corsproxy.io (bedient fremde
// Webseiten nur noch mit Schlüssel), und allorigins fiel davor still aus.
// Zwei Dienste, beide weg, und die Meldung nannte nur den letzten.
//
// ⚠ Die echten Dienste sind aus der Prüf-Umgebung nicht erreichbar und
// ändern sich ohnehin. Gestellt wird deshalb Klaus' LAGE: die ersten Dienste
// fallen aus, einer weiter hinten liefert eine Chefkoch-Seite mit JSON-LD.
//
//   node tests/smoke_web_import.mjs

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

const REZEPT = `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify({
  '@context':'https://schema.org','@type':'Recipe',name:'Zwetschgendatschi mit Butterstreuseln',
  recipeYield:'12',recipeIngredient:['1 kg Zwetschgen','250 g Mehl','125 g Butter'],
  recipeInstructions:[{'@type':'HowToStep',text:'Teig kneten.'},{'@type':'HowToStep',text:'Backen.'}]
})}</script></head><body>${'Füllung '.repeat(100)}</body></html>`;

async function lauf(lage) {
  const seite = await browser.newPage();
  const angefragt = [];
  const seitenFehler = [];
  seite.on('pageerror', e => seitenFehler.push(String(e).slice(0, 200)));
  await seite.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(`http://127.0.0.1:${PORT}/`) || u.startsWith('data:') || u.startsWith('blob:'))
      return route.continue();
    const dienst = /allorigins\.win\/get/.test(u) ? 'allorigins' : /allorigins\.win\/raw/.test(u) ? 'allorigins-raw'
      : /codetabs/.test(u) ? 'codetabs' : /r\.jina\.ai/.test(u) ? 'jina' : /corsproxy\.io/.test(u) ? 'corsproxy' : null;
    if (!dienst) return route.abort();
    angefragt.push(dienst);
    const a = lage[dienst] || { status: 503 };
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    return route.fulfill({ status: a.status, body: a.body || '', headers: { 'access-control-allow-origin': '*',
      'content-type': a.json ? 'application/json' : 'text/html' } });
  });
  await seite.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await seite.waitForFunction(() => typeof fetchWebRecipe === 'function' && document.getElementById('webUrlIn'), null, { timeout: 20000 });
  await seite.evaluate(async () => {
    document.getElementById('webUrlIn').value = 'https://www.chefkoch.de/rezepte/1476331252838756/Zwetschgendatschi-mit-Butterstreuseln.html';
    await fetchWebRecipe();
  });
  const st = await seite.evaluate(() => ({ status: document.getElementById('webStatus').innerHTML,
    ergebnis: document.getElementById('webResult').innerText }));
  await seite.close();
  return { ...st, angefragt, seitenFehler };
}

try {
  // ── Klaus' Lage: allorigins schweigt, corsproxy will einen Schlüssel ──
  // Ein Dienst dazwischen liefert. Vorher: ❌ HTTP 401.
  const a = await lauf({ allorigins: { status: 500 }, 'allorigins-raw': { status: 522 },
                         codetabs: { status: 200, body: REZEPT }, corsproxy: { status: 401 } });
  ok('die Seite lädt ohne Seitenfehler', a.seitenFehler.length === 0, a.seitenFehler[0]);
  ok('fallen die ersten Dienste aus, holt ein späterer das Rezept', /Zwetschgendatschi/.test(a.ergebnis), a.status);
  ok('… erkannt über die strukturierten Daten', /strukturierte Daten/.test(a.status), a.status);
  ok('… und die Kette bricht beim ersten Treffer ab', !a.angefragt.includes('corsproxy'), a.angefragt.join(','));

  // ── Ein Dienst, der 200 mit LEEREM Inhalt antwortet, ist kein Treffer ──
  const b = await lauf({ allorigins: { status: 200, json: true, body: '{"contents":""}' },
                         'allorigins-raw': { status: 200, body: 'x' },
                         codetabs: { status: 429 }, jina: { status: 200, body: REZEPT } });
  ok('eine leere Antwort lässt die Kette weiterlaufen', /Zwetschgendatschi/.test(b.ergebnis), b.angefragt.join(','));

  // ── Alles fällt aus: die Meldung nennt JEDEN Dienst mit seinem Grund ──
  const c = await lauf({ corsproxy: { status: 401 } });
  ok('alle aus: es wird eine Fehlermeldung gezeigt', /nicht erreichbar/.test(c.status), c.status);
  ok('… die jeden Dienst beim Namen nennt',
     ['allorigins', 'codetabs', 'jina', 'corsproxy'].every(n => c.status.includes(n)), c.status);
  ok('… mit seinem Grund (corsproxy: HTTP 401)', /corsproxy: HTTP 401/.test(c.status), c.status);
  ok('… und jeder Dienst wurde wirklich gefragt', c.angefragt.length >= 5, c.angefragt.join(','));
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
