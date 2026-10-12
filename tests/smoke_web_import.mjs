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

// Ein ECHTES PNG mit Rauschen — eine einfarbige Fläche wäre unter 500 Bytes
// und fiele durch den Riegel gegen leere Antworten, ohne dass etwas gemessen wäre.
import { deflateSync } from 'node:zlib';
function png(b, hh) {
  const roh = Buffer.alloc((b * 3 + 1) * hh);
  for (let i = 0; i < roh.length; i++) roh[i] = (i % (b * 3 + 1)) === 0 ? 0 : (i * 2654435761 >>> 24) & 255;
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = 0xffffffff; for (const x of buf) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const block = (typ, daten) => { const l = Buffer.alloc(4); l.writeUInt32BE(daten.length);
    const td = Buffer.concat([Buffer.from(typ), daten]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(b, 0); ihdr.writeUInt32BE(hh, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), block('IHDR', ihdr), block('IDAT', deflateSync(roh)), block('IEND', Buffer.alloc(0))]);
}
const PNG = png(64, 48);
const BILD_URL = 'https://img.chefkoch-cdn.de/rezepte/1476331252838756/bilder/zwetschgen.jpg';
const mitBild = (image, kopf = '') => `<!doctype html><html><head>${kopf}<script type="application/ld+json">${JSON.stringify({
  '@context':'https://schema.org','@type':'Recipe',name:'Zwetschgendatschi mit Butterstreuseln', ...(image === undefined ? {} : { image }),
  recipeIngredient:['1 kg Zwetschgen'], recipeInstructions:[{'@type':'HowToStep',text:'Backen.'}]
})}</script></head><body>${'Füllung '.repeat(100)}</body></html>`;

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
    // ── das Rezeptbild: direkt oder über einen Dienst ──
    if (decodeURIComponent(u).includes('img.chefkoch-cdn.de')) {
      const weg = u.startsWith('https://img.chefkoch-cdn.de') ? 'direkt' : /wsrv\.nl/.test(u) ? 'wsrv'
        : /allorigins\.win\/raw/.test(u) ? 'allorigins-raw' : /codetabs/.test(u) ? 'codetabs' : /corsproxy/.test(u) ? 'corsproxy' : 'anders';
      angefragt.push('bild:' + weg);
      const b = lage.bild || {};
      // ⚠ Ein von Playwright GESTELLTER Körper umgeht die CORS-Prüfung — ein
      // fehlender CORS-Kopf sperrt hier also nichts (beim ersten Lauf gemessen).
      // Für fetch ist ein Abbruch dasselbe wie eine CORS-Sperre: ein TypeError.
      // Ein <img> (resourceType image) ist etwas anderes als ein fetch: viele
      // Bild-Server liefern das eine und sperren das andere.
      if (weg === 'direkt' && route.request().resourceType() === 'image')
        return b.imgTag ? route.fulfill({ status: 200, body: PNG, headers: { 'content-type': 'image/png' } }) : route.abort();
      if (weg === 'direkt' && !b.direkt) return route.abort();
      if (weg === 'direkt' || b.dienst === weg)
        return route.fulfill({ status: 200, body: PNG, headers: { 'content-type': 'image/png', 'access-control-allow-origin': '*' } });
      return route.fulfill({ status: 503, body: '', headers: { 'access-control-allow-origin': '*' } });
    }
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
    ergebnis: document.getElementById('webResult').innerText,
    vorschau: !!document.querySelector('#webResult img.web-prev-img'),
    bild: (typeof _webRec !== 'undefined' && _webRec) ? _webRec.img : null,
    portionen: (typeof _webRec !== 'undefined' && _webRec) ? _webRec.servings : null,
    ergibt: (typeof _webRec !== 'undefined' && _webRec) ? _webRec.yieldText : null,
    keinBild: !!document.querySelector('#webResult .web-kein-bild'),
    katWahl: document.getElementById('webKatSel')?.value ?? null,
    katOffen: !!document.querySelector('#webResult .web-kat.offen') }));
  if (lage.katAnnehmen) st.katGespeichert = await seite.evaluate(() => {
    const vorher = R.length; acceptWebImport(); const blockiert = R.length === vorher;
    const s = document.getElementById('webKatSel'); if (s) { s.value = 'kuchen'; }
    acceptWebImport();
    return { blockiert, cat: (R.find(r => r.name === 'Omas Sonntagsfreude') || {}).cat };
  });
  // „Zwetschgendatschi" ist ein Kuchen, den die Regeln nicht kennen — ohne Wahl
  // trägt die App seit 2026-10-12 nichts ein. Die Probe wählt also, wie ein Mensch.
  if (lage.annehmen) st.gespeichert = await seite.evaluate(() => { const s = document.getElementById('webKatSel'); if (s && !s.value) s.value = 'kuchen'; acceptWebImport();
    // nicht R[0]: eine leere Vorlage derselben Kategorie wird BEFÜLLT, nicht vorangestellt
    return (R.find(r => r.name === 'Zwetschgendatschi mit Butterstreuseln') || {}).img; });
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

  // ── DAS REZEPTBILD (Klaus 2026-10-12: „er erkennt die Bilder nicht") ──
  const istDaten = x => typeof x === 'string' && /^data:image\//.test(x);
  // Liste aus Bild-OBJEKTEN — die alte Zeile nahm das erste Feld, also ein Objekt
  const d = await lauf({ codetabs: { status: 200, body: mitBild([{ '@type': 'ImageObject', url: BILD_URL, width: 960 }]) },
                         bild: { direkt: true }, annehmen: true });
  ok('Bild als Liste von ImageObjects wird erkannt und heruntergeladen', istDaten(d.bild), String(d.bild).slice(0, 80));
  ok('… die Vorschau zeigt das Bild', d.vorschau);
  ok('… und es landet im gespeicherten Rezept', istDaten(d.gespeichert), String(d.gespeichert).slice(0, 80));
  // Einzelnes Objekt mit contentUrl
  const e2 = await lauf({ codetabs: { status: 200, body: mitBild({ '@type': 'ImageObject', contentUrl: BILD_URL }) }, bild: { direkt: true } });
  ok('Bild als ImageObject mit contentUrl wird erkannt', istDaten(e2.bild), String(e2.bild).slice(0, 80));
  // Relative Adresse
  const e3 = await lauf({ codetabs: { status: 200, body: mitBild('//img.chefkoch-cdn.de/rezepte/1/b.jpg') }, bild: { direkt: true } });
  ok('eine relative Bild-Adresse wird gegen die Seite aufgelöst', istDaten(e3.bild), String(e3.bild).slice(0, 80));
  // Kein Bild in den Rezeptdaten → og:image
  const f = await lauf({ codetabs: { status: 200, body: mitBild(undefined, `<meta property="og:image" content="${BILD_URL}">`) }, bild: { direkt: true } });
  ok('ohne Bild in den Rezeptdaten hilft die Seiten-Vorschau (og:image)', istDaten(f.bild), String(f.bild).slice(0, 80));
  // Direkt gesperrt (kein CORS) → über einen Dienst
  const g = await lauf({ codetabs: { status: 200, body: mitBild(BILD_URL) }, bild: { direkt: false, dienst: 'codetabs' } });
  ok('sperrt der Bild-Server direktes Laden, holt es ein Dienst', istDaten(g.bild), g.angefragt.join(','));
  // Der Bild-Dienst wsrv.nl liefert — er steht vorn
  const w = await lauf({ codetabs: { status: 200, body: mitBild(BILD_URL) }, bild: { direkt: false, dienst: 'wsrv' } });
  ok('der Bild-Dienst (wsrv) holt das Bild als erster', istDaten(w.bild) && w.angefragt.indexOf('bild:wsrv') === w.angefragt.findIndex(a => a.startsWith('bild:')), w.angefragt.join(','));
  // Download gesperrt, aber als <img> lädt es → die Adresse bleibt
  const k = await lauf({ codetabs: { status: 200, body: mitBild(BILD_URL) }, bild: { direkt: false, imgTag: true } });
  ok('lädt es nur als <img>, bleibt die Bild-Adresse stehen', k.bild === BILD_URL, String(k.bild).slice(0,40) + ' · ' + k.angefragt.join(','));
  // Klaus' Lage: GAR NICHTS lädt → kein kaputter Rahmen, sondern ein Hinweis
  const n = await lauf({ codetabs: { status: 200, body: mitBild(BILD_URL) }, bild: { direkt: false } });
  ok('lädt gar nichts, wird KEINE tote Adresse gespeichert (kein leerer Rahmen)', n.bild === '', String(n.bild).slice(0,40));
  ok('… und das Ergebnis sagt, dass kein Bild kam', n.keinBild);
  // Und ein Rezept ohne jedes Bild erfindet keins
  const l = await lauf({ codetabs: { status: 200, body: mitBild(undefined) } });
  ok('eine Seite ohne Bild bekommt kein erfundenes', l.bild === '' && !l.vorschau, JSON.stringify(l.bild));

  // ── ERGIEBIGKEIT (Klaus 2026-10-12: „ein Blechkuchen sind ungefähr 20 Portionen") ──
  const mitErtrag = y => `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify({
    '@context':'https://schema.org','@type':'Recipe',name:'Blechkuchen', recipeYield: y,
    recipeIngredient:['1 kg Zwetschgen'], recipeInstructions:[{'@type':'HowToStep',text:'Backen.'}]
  })}</script></head><body>${'Füllung '.repeat(100)}</body></html>`;
  const y1 = await lauf({ codetabs: { status: 200, body: mitErtrag(['1', '1 Blech']) } });
  ok('„1 Blech" wird zu 20 Portionen', y1.portionen === 20, String(y1.portionen));
  ok('… und der Text dazu bleibt erhalten', /1 Blech/.test(y1.ergibt || '') && /20 Stück/.test(y1.ergibt || ''), String(y1.ergibt));
  const y2 = await lauf({ codetabs: { status: 200, body: mitErtrag('20 Stücke') } });
  ok('„20 Stücke" bleibt 20', y2.portionen === 20 && y2.ergibt === '20 Stücke', JSON.stringify([y2.portionen, y2.ergibt]));
  const y3 = await lauf({ codetabs: { status: 200, body: mitErtrag('4') } });
  ok('eine nackte Zahl bleibt, wie sie ist', y3.portionen === 4 && !y3.ergibt, JSON.stringify([y3.portionen, y3.ergibt]));

  // ── KATEGORIE (Klaus 2026-10-12: „Pflaumenkuchen bei Fleisch einsortiert") ──
  const mitKat = (name, extra = {}) => `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify({
    '@context':'https://schema.org','@type':'Recipe',name, ...extra,
    recipeIngredient:['1 kg Zwetschgen'], recipeInstructions:[{'@type':'HowToStep',text:'Backen.'}]
  })}</script></head><body>${'Füllung '.repeat(100)}</body></html>`;
  const k1 = await lauf({ codetabs: { status: 200, body: mitKat('Pflaumenkuchen vom Blech') } });
  ok('„Pflaumenkuchen" wird als Kuchen erkannt, nicht als Fleisch', k1.katWahl === 'kuchen' && !k1.katOffen, String(k1.katWahl));
  const k2 = await lauf({ codetabs: { status: 200, body: mitKat('Omas Bestes', { recipeCategory: 'Suppe' }) } });
  ok('recipeCategory der Seite geht vor („Suppe")', k2.katWahl === 'suppe', String(k2.katWahl));
  const k3 = await lauf({ codetabs: { status: 200, body: mitKat('Pflaumenkuchen vom Blech'.replace('kuchen vom Blech', 'traum')) }, katAnnehmen: false });
  ok('nicht eindeutig: KEINE Vorauswahl, die Wahl ist rot markiert', k3.katWahl === '' && k3.katOffen, JSON.stringify([k3.katWahl, k3.katOffen]));
  // ⚠ Der Fall braucht ein Rezept, das WIRKLICH nicht erkannt wird — sonst misst er nichts.
  const k4 = await lauf({ codetabs: { status: 200, body: mitKat('Omas Sonntagsfreude') }, katAnnehmen: true });
  ok('(Vorbedingung: dieses Rezept wird nicht erkannt)', k4.katWahl === '', String(k4.katWahl));
  ok('… und ohne Wahl wird NICHTS eingetragen', k4.katGespeichert.blockiert, JSON.stringify(k4.katGespeichert));
  ok('mit Wahl landet das Rezept in der gewählten Kategorie', k4.katGespeichert.cat === 'kuchen', JSON.stringify(k4.katGespeichert));
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
