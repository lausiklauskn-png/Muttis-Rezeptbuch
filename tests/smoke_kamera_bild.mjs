// Probe: ein Kamerafoto wird HERUNTERGERECHNET, nicht abgewiesen.
//
// Anlass (Klaus 2026-09-18): „die Kamera hat höhere Auflösung gefahren, also
// nicht heruntergerechnet beim Fotografieren, sodass die 5 Megabyte nicht
// überschritten werden." Gemessen im Code war es umgekehrt: `loadScanFile`
// WIES jede Datei über 5 MB AB — der Riegel stand VOR dem Verkleinern, und
// `resizeImage` lief danach, kam also nie dran.
//
// ⚠ GEMESSEN WIRD, WAS HINAUSGEHT. Ein Wächter auf den Quelltext („steht da
// ein resizeImage-Aufruf?") wäre auch dann grün, wenn davor ein Riegel
// abbricht — genau die Lage, die diesen Befund erzeugt hat. Die Probe baut
// deshalb ein echtes, mehrere Megabyte großes Hochformat-Foto im Browser und
// rechnet die Nutzlast nach.
//
//   npm install --no-save playwright-core     (einmalig je Behälter)
//   node tests/smoke_kamera_bild.mjs
//
// Fehlt playwright-core oder Chromium, ist die Probe NICHT LAUFFÄHIG — nicht rot.

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
const seite = await browser.newPage();

// ⚠ NICHT „kein Aufruf geht hinaus" — dieser Wächter verbot beim ersten
// Lauf das Richtige: die App liest bei Sitzungsstart den SBKIM-Briefkasten
// (`Sage-Protokol/…/SIGNAL.json`), und das ist ihre Aufgabe, kein Befund.
// Gemessen wird, was diese Probe angeht: dass KEIN BILD an eine KI geht.
// Ein Wächter, der das Richtige verbietet, ist kein Riegel.
const fremd = [];
const kiZiele = [];
await seite.route('**/*', route => {
  const u = route.request().url();
  if (u.startsWith(`http://127.0.0.1:${PORT}/`) || u.startsWith('data:') || u.startsWith('blob:'))
    return route.continue();
  fremd.push(u);
  if (/anthropic|openai|mistral|googleapis/i.test(u)) kiZiele.push(u);
  return route.abort();
});
// Ein Syntaxfehler in der Seite fällt HIER auf — nicht in einem Regex-Auszug.
const seitenFehler = [];
seite.on('pageerror', e => seitenFehler.push(String(e).slice(0, 200)));

try {
  await seite.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await seite.waitForFunction(() => typeof window.loadScanFile === 'function', null, { timeout: 20000 });

  ok('die Seite lädt ohne Seitenfehler', seitenFehler.length === 0, seitenFehler[0]);
  ok('kein Bild geht an eine KI hinaus', kiZiele.length === 0, kiZiele[0]);

  // ── Die Deckel stehen, und sie stehen unter der Grenze der Schnittstelle ──
  // ⚠ `const` auf oberster Ebene hängt NICHT am window-Objekt — gelesen wird
  // der globale Lexikal-Bereich, nicht `window.X`.
  const deckel = await seite.evaluate(() => ({
    b64:  typeof BILD_NETZ_B64_MAX !== 'undefined' ? BILD_NETZ_B64_MAX : null,
    roh:  typeof BILD_ROH_MAX      !== 'undefined' ? BILD_ROH_MAX      : null,
    stufen: typeof BILD_NETZ_STUFEN !== 'undefined' ? BILD_NETZ_STUFEN : null
  }));
  // ⚠ GEMESSEN WIRD DER BASE64-TEIL, NICHT DIE GANZE DATA-URL. Der Vorsatz
  // steht im Kommentar am Code; ohne diesen Wächter könnte ihn niemand von
  // seinem Gegenteil unterscheiden.
  const b64mass = await seite.evaluate(() => ({
    mitKopf: _b64Bytes('data:image/jpeg;base64,AAAA'),
    ohneKopf: _b64Bytes('AAAA')
  }));
  ok('_b64Bytes zählt den base64-Teil, nicht den data-URL-Kopf',
     b64mass.mitKopf === 4 && b64mass.ohneKopf === 4, JSON.stringify(b64mass));
  ok('der Nutzlast-Deckel steht', deckel.b64 > 0, String(deckel.b64));
  // 10 MB base64 je Bild nimmt die Claude-API (Doku, geprüft 2026-09-18).
  ok('… und liegt unter der Grenze der Schnittstelle (10 MB base64)',
     deckel.b64 < 10 * 1024 * 1024, String(deckel.b64));
  ok('der Speicher-Riegel liegt WEIT über 5 MB — nicht darunter',
     deckel.roh > 5 * 1024 * 1024 * 2, String(deckel.roh));
  ok('die Kanten-Stufen gehen nach unten, nicht nach oben',
     Array.isArray(deckel.stufen) && deckel.stufen.length > 1 &&
     deckel.stufen.every((k, i) => i === 0 || k < deckel.stufen[i - 1]),
     JSON.stringify(deckel.stufen));

  // ── resizeImage deckelt die LANGE Kante, nicht die Breite ────────────────
  // Der alte Fehler: `maxW/img.width`. Ein 400×1600-Bild blieb damit
  // 400 breit (1 ≥ 200/400 ⇒ Faktor 0,5) und 800 hoch — die lange Kante lag
  // beim Vierfachen des Deckels.
  const kante = await seite.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 400; c.height = 1600;
    const g = c.getContext('2d');
    g.fillStyle = '#c33'; g.fillRect(0, 0, 400, 1600);
    const aus = await resizeImage(c.toDataURL('image/png'), 200, 0.9);
    const bild = new Image();
    const geladen = await new Promise(r => {
      bild.onload = () => r(true); bild.onerror = () => r(false);
      setTimeout(() => r(false), 5000);
      bild.src = aus;
    });
    return { w: geladen ? bild.naturalWidth : 0, h: geladen ? bild.naturalHeight : 0 };
  });
  ok('resizeImage deckelt die LANGE Kante auf den vorgegebenen Wert',
     Math.max(kante.w, kante.h) <= 200, `${kante.w}×${kante.h}`);
  ok('… und behält dabei das Seitenverhältnis',
     Math.abs((kante.w / kante.h) - (400 / 1600)) < 0.02, `${kante.w}×${kante.h}`);

  // ── Ein echtes Kamerafoto: über 5 MB, Hochformat, verrauscht ─────────────
  // ⚠ RAUSCHEN IST PFLICHT. Eine einfarbige Fläche komprimiert auf wenige KB;
  // die Probe würde dann den Fall „über 5 MB" nie erreichen und wäre still
  // grün, ohne etwas gemessen zu haben.
  const foto = await seite.evaluate(async () => {
    const W = 3000, H = 4000;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const bd = g.createImageData(W, 200);
    for (let i = 0; i < bd.data.length; i += 4) {
      bd.data[i] = Math.random() * 255; bd.data[i + 1] = Math.random() * 255;
      bd.data[i + 2] = Math.random() * 255; bd.data[i + 3] = 255;
    }
    for (let y = 0; y < H; y += 200) g.putImageData(bd, 0, y);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.98));
    window.__kameraFoto = new File([blob], 'kamera.jpg', { type: 'image/jpeg' });
    return { bytes: blob.size, w: W, h: H };
  });
  // Selbst-Riegel: ohne diese zwei Zeilen misst alles darunter nichts.
  ok('SELBST-RIEGEL: das gestellte Foto ist wirklich über 5 MB groß',
     foto.bytes > 5 * 1024 * 1024, `${(foto.bytes / 1048576).toFixed(1)} MB`);
  ok('SELBST-RIEGEL: und es ist wirklich Hochformat', foto.h > foto.w, `${foto.w}×${foto.h}`);

  const auf = await seite.evaluate(async () => {
    const b = await scanBildAufbereiten(window.__kameraFoto);
    if (!b) return { leer: true };
    // ⚠ EIN LEERES BILD DARF NICHT HÄNGEN, SONDERN MELDEN. `new Image().src=''`
    // feuert kein `onload` — ohne `onerror` und ohne Frist stirbt die Probe an
    // „promise was garbage collected", und die rote Zeile trägt den Namen des
    // Absturzes statt den der Zusicherung. Genau so ist am 2026-09-18 der
    // Gegenprobe-Fall „das Rezeptbild fällt weg" als „rot aus falschem Grund"
    // gemeldet worden.
    const mass = async d => {
      if (!d) return { w: 0, h: 0, b64: 0 };
      const i = new Image();
      const geladen = await new Promise(r => {
        i.onload = () => r(true); i.onerror = () => r(false);
        setTimeout(() => r(false), 5000);
        i.src = d;
      });
      return { w: geladen ? i.naturalWidth : 0, h: geladen ? i.naturalHeight : 0, b64: _b64Bytes(d) };
    };
    return { netz: await mass(b.netz), store: await mass(b.store) };
  });
  ok('das Foto wird aufbereitet, nicht abgewiesen', !auf.leer);
  ok('die lange Kante der Netz-Fassung liegt bei höchstens 1200 px',
     !auf.leer && Math.max(auf.netz.w, auf.netz.h) <= 1200,
     auf.leer ? 'nichts' : `${auf.netz.w}×${auf.netz.h}`);
  ok('die Nutzlast liegt unter dem Deckel',
     !auf.leer && auf.netz.b64 <= deckel.b64,
     auf.leer ? 'nichts' : `${(auf.netz.b64 / 1048576).toFixed(2)} MB von ${(deckel.b64 / 1048576).toFixed(0)} MB`);
  // Die Gegenrichtung: sie ist nicht trivial klein, weil das Bild verschwunden ist.
  ok('… und sie ist nicht leer (das Bild ist wirklich drin)',
     !auf.leer && auf.netz.b64 > 20000, auf.leer ? 'nichts' : String(auf.netz.b64));
  // ⚠ „KLEINER" ALLEIN IST BEI NULL WAHR. Ein fehlendes Rezeptbild wäre
  // damit die beste Note — deshalb wird beides verlangt: es ist da UND es ist
  // kleiner.
  ok('das Rezeptbild entsteht mit und ist kleiner als die Netz-Fassung',
     !auf.leer && auf.store.b64 > 2000 && auf.store.w > 0 && auf.store.b64 < auf.netz.b64,
     auf.leer ? 'nichts' : `${auf.store.b64} (${auf.store.w}×${auf.store.h}) vs ${auf.netz.b64}`);

  // ── Die Nachrechnung selbst — einzeln gefragt, Deckel aus der Messung ───
  // ⚠ BEI 1200 px SPRINGT SIE NIE AN (ein Zehntel des Deckels). Eine Probe am
  // Normalfall könnte die Nachrechnung nicht von ihrem Fehlen unterscheiden —
  // deshalb wird sie mit einem engen Deckel gefragt.
  //
  // ⚠ UND DER DECKEL WIRD GEMESSEN, NICHT GENAGELT. Erster Anlauf: 60 000
  // Bytes, fest hingeschrieben. Das gestellte Foto ist reines Rauschen — der
  // schlimmste Fall für JPEG — und kommt selbst auf der kleinsten Stufe nicht
  // unter 60 KB. Die Probe war ROT, obwohl die Nachrechnung tadellos lief:
  // *eine Zahl in einer Prüfung ist kein Vertrag.* Der Deckel liegt jetzt
  // zwischen dem, was die erste Stufe wiegt, und dem, was die kleinste wiegt.
  const nachgerechnet = await seite.evaluate(async () => {
    const bild = await _bildDekodieren(window.__kameraFoto);
    const ersteStufe   = _b64Bytes(_aufKante(bild, BILD_NETZ_STUFEN[0], 0.90));
    const kleinsteStufe = _b64Bytes(_aufKante(bild, BILD_NETZ_STUFEN[BILD_NETZ_STUFEN.length - 1], 0.82));
    const eng = Math.round((ersteStufe + kleinsteStufe) / 2);
    const mit    = _b64Bytes(_bildAufDeckel(bild, BILD_NETZ_STUFEN[0], 0.90, eng));
    // Die fail-soft-Richtung: ein Deckel, den NICHTS einhalten kann, darf kein
    // leeres Bild und keinen Absturz ergeben.
    let unmoeglich = null, gestolpert = null;
    try { unmoeglich = _b64Bytes(_bildAufDeckel(bild, BILD_NETZ_STUFEN[0], 0.90, 500)); }
    catch (e) { gestolpert = String(e).slice(0, 120); }
    if (bild && bild.close) bild.close();
    return { ersteStufe, kleinsteStufe, eng, mit, unmoeglich, gestolpert };
  });
  ok('SELBST-RIEGEL: die kleinste Stufe wiegt wirklich weniger als die erste',
     nachgerechnet.kleinsteStufe < nachgerechnet.ersteStufe,
     `${nachgerechnet.kleinsteStufe} vs ${nachgerechnet.ersteStufe}`);
  ok('SELBST-RIEGEL: und die erste Stufe überschreitet den engen Deckel',
     nachgerechnet.ersteStufe > nachgerechnet.eng,
     `${nachgerechnet.ersteStufe} vs ${nachgerechnet.eng}`);
  ok('der Deckel wird NACHGERECHNET: eine Stufe tiefer, bis es passt',
     nachgerechnet.mit <= nachgerechnet.eng,
     `${nachgerechnet.mit} von ${nachgerechnet.eng}`);
  ok('… und ein unmöglicher Deckel ergibt fail-soft ein Bild, keinen Absturz',
     nachgerechnet.gestolpert === null && nachgerechnet.unmoeglich > 2000,
     nachgerechnet.gestolpert || String(nachgerechnet.unmoeglich));

  // ── Und der ganze Weg, den der Kamera-Knopf nimmt ────────────────────────
  // ⚠ `scanData` IST EIN TOP-LEVEL `let` UND HÄNGT NICHT AM WINDOW-OBJEKT.
  // Der erste Anlauf setzte `window.scanData = null` und las es danach wieder
  // aus — das ist eine ANDERE Variable als die, die `loadScanFile` schreibt.
  // Die Probe meldete „verarbeitet ein Foto über 5 MB nicht", während der Code
  // tadellos war. Dieselbe Falle wie `window.R` in Muttis Rezeptbuch und
  // `window.LANGS` in der Sprach-Probe, nur am nächsten Namen.
  const durch = await seite.evaluate(async () => {
    scanData = null;
    const meldungen = [];
    const echterToast = window.toast;
    window.toast = m => { meldungen.push(String(m)); };
    try { await loadScanFile(window.__kameraFoto); }
    finally { window.toast = echterToast; }
    return { gesetzt: !!scanData, b64: scanData ? _b64Bytes(scanData) : 0, meldungen };
  });
  ok('loadScanFile verarbeitet ein Foto über 5 MB statt es abzuweisen',
     durch.gesetzt, JSON.stringify(durch.meldungen));
  ok('… und meldet dabei keine Abweisung',
     durch.meldungen.length === 0, JSON.stringify(durch.meldungen));
  ok('… und die gesetzte Nutzlast liegt unter dem Deckel',
     durch.b64 > 0 && durch.b64 <= deckel.b64, String(durch.b64));

  // Der Riegel, den es NICHT mehr geben darf — gemessen an der Funktion
  // selbst, nicht an einem Regex über die Datei.
  const quelle = await seite.evaluate(() => ({
    scan: String(window.loadScanFile),
    stapel: typeof window.runBatchScan === 'function' ? String(window.runBatchScan) : ''
  }));
  ok('loadScanFile trägt keinen 5-MB-Riegel mehr',
     !/5\s*\*\s*1024\s*\*\s*1024/.test(quelle.scan));
  ok('loadScanFile geht durch scanBildAufbereiten',
     quelle.scan.includes('scanBildAufbereiten'));
  // ⚠ GEZÄHLT WIRD, NICHT NUR GESUCHT. Im Stapel gehen ZWEI Anbieter
  // hinaus (Anthropic und Mistral-OCR); ein bloßes „enthält bildFuersNetz"
  // wäre noch grün, wenn einer der beiden wieder am Verkleinern vorbeigeht.
  // Genau das war der Zustand bis 2026-09-18: der Einzel-Weg schickte
  // verkleinert, der Stapel-Weg das Original.
  const stapelTueren = (quelle.stapel.match(/bildFuersNetz/g) || []).length;
  ok('im Stapel gehen BEIDE Anbieter durch dieselbe Tür (bildFuersNetz)',
     quelle.stapel === '' || stapelTueren >= 2,
     quelle.stapel === '' ? 'runBatchScan nicht erreichbar' : `nur ${stapelTueren} Stelle(n)`);

  // Das Kamera-Feld führt wirklich auf diesen Weg.
  const feld = await seite.evaluate(() => {
    const el = document.getElementById('scanCameraIn');
    if (!el) return null;
    return { typ: el.type, capture: el.getAttribute('capture'),
             accept: el.accept, onchange: el.getAttribute('onchange') || '' };
  });
  ok('das Kamera-Feld ist da und nimmt Bilder auf',
     feld && feld.typ === 'file' && /image/.test(feld.accept || ''));
  ok('… und führt auf handleScanFile',
     feld && /handleScanFile/.test(feld.onchange), feld ? feld.onchange : 'kein Feld');
  // ⚠ BENANNTE GRENZE: `capture` steuert NUR, welche Quelle sich öffnet — die
  // AUFLÖSUNG der Kamera lässt sich damit nicht vorgeben. Deshalb ist das
  // Verkleinern danach die einzige Stelle, an der die Grenze zu halten ist.
  ok('… und öffnet die Kamera (capture)', feld && feld.capture === 'environment',
     feld ? String(feld.capture) : 'kein Feld');

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
