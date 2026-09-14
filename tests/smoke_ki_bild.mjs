// Probe: die Bild-Erzeugung (DALL·E) im echten Browser.
//
// Die Bildgenerierung kam am 2026-09-14 aus Mein-Rezeptbuch herüber. Diese
// Probe misst, dass sie hier wirklich läuft — und hält den response_format-
// Fall fest, an dem sie drüben monatelang still gescheitert ist.
//
//   npm install --no-save playwright-core     (einmalig je Behälter)
//   node tests/smoke_ki_bild.mjs
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
  else { rot.push(name + (zusatz ? ' — ' + zusatz : '')); console.log('  ✗ ROT: ' + name + (zusatz ? ' — ' + zusatz : '')); }
};

// Eigener Server auf einem FREIEN Port — eine feste Nummer trifft irgendwann
// einen Server aus einem abgebrochenen Lauf, der ein anderes Verzeichnis
// ausliefert (in Mein Mixarium am 2026-09-11 genau so passiert: zwölf
// Gegenprobe-Fälle maßen das unberührte Original).
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

// Kein Aufruf darf hinausgehen. Was es dennoch versucht, ist ein Befund.
const fremd = [];
await seite.route('**/*', route => {
  const u = route.request().url();
  if (!u.startsWith(`http://127.0.0.1:${PORT}/`) && !u.startsWith('data:') && !u.startsWith('blob:')) {
    fremd.push(u); return route.abort();
  }
  return route.continue();
});
// Ein Syntaxfehler in der Seite fällt HIER auf — nicht in einem Regex-Auszug.
const seitenFehler = [];
seite.on('pageerror', e => seitenFehler.push(String(e).slice(0, 200)));

try {
  await seite.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await seite.waitForFunction(() => typeof window._bildHolen === 'function', null, { timeout: 20000 });

  ok('die Seite lädt ohne Skript-Fehler', seitenFehler.length === 0, seitenFehler.join(' | '));

  // ── Der Befund: response_format darf nicht mehr mitgehen ──────────────────
  const echt = await seite.evaluate(async () => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const alt = window.fetch;
    const gesendet = [];
    // Verhält sich wie OpenAI heute: mit response_format ein 400, ohne ein Bild.
    window.fetch = async (u, o) => {
      const body = JSON.parse(o.body);
      gesendet.push(body);
      if ('response_format' in body)
        return { ok: false, status: 400, json: async () => ({ error: { message: "Unknown parameter: 'response_format'." } }) };
      return { ok: true, json: async () => ({ data: [{ b64_json: png }] }) };
    };
    localStorage.setItem('openaiImgKey9', 'sk-proj-PROBE0123456789abcdef');
    let bild = null, fehler = null;
    try { bild = await window._bildHolen('ein Testgericht', '1024x1024'); }
    catch (e) { fehler = String(e && e.message || e); }
    window.fetch = alt;
    return { gesendet, bild: (bild || '').slice(0, 22), fehler };
  });
  ok('response_format geht NICHT mehr mit hinaus',
    echt.gesendet.length > 0 && echt.gesendet.every(b => !('response_format' in b)),
    JSON.stringify(echt.gesendet[0] || {}).slice(0, 110));
  ok('erst wird dall-e-3 gefragt', echt.gesendet[0]?.model === 'dall-e-3', String(echt.gesendet[0]?.model));
  ok('…und es kommt wirklich ein Bild heraus', echt.bild.startsWith('data:image/'), echt.bild || echt.fehler);

  // ── Die Rezeptbilder nehmen die gemeinsame Naht ───────────────────────────
  // BENANNTE GRENZE: die Food-Zine gibt es in Muttis nicht — die Prüfung
  // darauf wäre hier blind und ist deshalb weggelassen, nicht vergessen.
  ok('die Rezeptbilder nehmen die gemeinsame Naht',
    await seite.evaluate(() => String(window._dalleGenImg).includes('_bildHolen')));
  ok('der eigene Schlüssel liegt unter openaiImgKey9, nicht unter dem von Mein-Rezeptbuch',
    await seite.evaluate(() => {
      localStorage.removeItem('openaiImgKey9m');
      localStorage.setItem('openaiImgKey9', 'sk-proj-MUTTIS0123456789abcd');
      return getOpenAiImgKey() === 'sk-proj-MUTTIS0123456789abcd'
          && !String(saveOpenAiImgKey).includes('openaiKey9m');
    }));
  // ⚠ BENANNTE GRENZE: der Kamera-Knopf entsteht NUR an einer Karte mit Namen.
  // Beim Start zeigt die App 70 LEERE Karten — gemessen am 2026-09-14: dort
  // gibt es keinen einzigen .ra-cam, und ein Wächter darauf hätte nichts
  // gemessen. `R` hängt hier auch nicht am window (anders als im Mixarium),
  // ein Rezept lässt sich also nicht von außen einspeisen. Gemessen wird
  // deshalb die Zusicherung selbst — was der Knopf AUSLÖST — plus die Stelle,
  // an der er im Karten-Markup entsteht.
  const sichtbar = (sel) => seite.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return false;
    if (el.getClientRects().length === 0) return false;
    return el.checkVisibility ? el.checkVisibility() : true;
  }, sel);

  const einzel = await seite.evaluate(() => {
    openImgGenForRecipe(999999);              // was der Knopf tut
    return {
      paneOffen: document.getElementById('imp-imggen').classList.contains('on'),
      einzelBlock: document.getElementById('imggenSingleWrap').style.display === 'block',
      sammelWeg: document.getElementById('igGenBtn').style.display === 'none',
    };
  });
  ok('der Knopf öffnet das KI-Bild-Feld', einzel.paneOffen);
  ok('…im Einzel-Modus', einzel.einzelBlock);
  ok('…und der Sammel-Knopf tritt dabei zurück', einzel.sammelWeg);

  const nachSchliessen = await seite.evaluate(() => {
    closeImport();
    return { sammelZurueck: document.getElementById('igGenBtn').style.display !== 'none',
             einzelWeg: document.getElementById('imggenSingleWrap').style.display === 'none' };
  });
  ok('nach dem Schließen ist der Sammel-Weg wieder da', nachSchliessen.sammelZurueck);
  ok('…und der Einzel-Block weg', nachSchliessen.einzelWeg);

  // Die Karte baut rndCard(), nicht render() — nachgesehen, nicht angenommen.
  ok('der Knopf steht im Karten-Markup, mit der richtigen Klasse',
    await seite.evaluate(() => /class="ra ra-cam"[^>]*openImgGenForRecipe/.test(String(rndCard))));

  await seite.evaluate(() => openImport());
  ok('der KI-Bild-Tab steht sichtbar in der Leiste', await sichtbar('#impTabImgGen'));
  ok('…und zwar IN der Tab-Leiste, nicht daneben',
    await seite.evaluate(() => !!document.querySelector('.fov-tabs > #impTabImgGen')));

 // ── Kommt nur eine Adresse, wird das Bild geholt ──────────────────────────
  const perAdresse = await seite.evaluate(async () => {
    const alt = window.fetch;
    const geholt = [];
    window.fetch = async (u, o) => {
      if (o && o.method === 'POST') return { ok: true, json: async () => ({ data: [{ url: 'https://example.invalid/b.png' }] }) };
      geholt.push(String(u));
      return { ok: true, blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }) };
    };
    const img = await window._bildHolen('x', '1024x1024').catch(e => 'FEHLER: ' + e.message);
    window.fetch = alt;
    return { geholt, alsDatenUrl: String(img).startsWith('data:'), fremd: String(img).startsWith('http') };
  });
  ok('eine zurückgegebene Adresse wird wirklich abgerufen',
    perAdresse.geholt.some(u => u.includes('b.png')), perAdresse.geholt.join(', '));
  ok('…und landet als data:-URL im Rezept', perAdresse.alsDatenUrl);
  ok('…nie als fremde Adresse (die verfällt und ist offline tot)', !perAdresse.fremd);

  // ── Der zweite Versuch und seine Grenze ───────────────────────────────────
  const grenze = await seite.evaluate(async () => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const alt = window.fetch;
    const lauf = async (antwort) => {
      const modelle = [];
      window.fetch = async (u, o) => { const b = JSON.parse(o.body); modelle.push(b.model); return antwort(b.model, png); };
      const erg = await window._bildHolen('x', '1024x1024').catch(e => 'FEHLER');
      return { modelle, bild: String(erg).startsWith('data:') };
    };
    const a = await lauf((m, png) => m === 'dall-e-3'
      ? { ok: false, status: 400, json: async () => ({ error: { message: "Unknown parameter: 'foo'." } }) }
      : { ok: true, json: async () => ({ data: [{ b64_json: png }] }) });
    const b = await lauf(() => ({ ok: false, status: 401, json: async () => ({ error: { message: 'Incorrect API key provided' } }) }));
    const c = await lauf(() => ({ ok: false, status: 429, json: async () => ({ error: { message: 'You exceeded your current quota' } }) }));
    window.fetch = alt;
    return { a, b, c };
  });
  ok('passt der Aufruf nicht zum Modell, rettet der zweite Versuch den Lauf',
    grenze.a.modelle.join('→') === 'dall-e-3→gpt-image-1' && grenze.a.bild, grenze.a.modelle.join('→'));
  ok('ein abgelehnter Schlüssel löst KEINEN zweiten Versuch aus',
    grenze.b.modelle.length === 1, grenze.b.modelle.join('→'));
  ok('fehlendes Guthaben ebenso wenig (das wäre eine zweite Rechnung)',
    grenze.c.modelle.length === 1, grenze.c.modelle.join('→'));

  // ── Ein Fehlschlag nennt seinen Grund, in verständlichen Worten ───────────
  const texte = await seite.evaluate(() => ({
    netz: window._imgFehlerText(new TypeError('Failed to fetch')),
    key: window._imgFehlerText(new Error('Incorrect API key provided')),
    geld: window._imgFehlerText(new Error('You exceeded your current quota, check billing')),
    param: window._imgFehlerText(new Error("Unknown parameter: 'response_format'.")),
  }));
  ok('„Failed to fetch" wird übersetzt, nicht durchgereicht',
    /konnte OpenAI gar nicht erst fragen/.test(texte.netz) && !/Failed to fetch/.test(texte.netz), texte.netz.slice(0, 70));
  ok('ein abgelehnter Schlüssel wird benannt', /Schlüssel abgelehnt/.test(texte.key), texte.key.slice(0, 70));
  ok('fehlendes Guthaben wird benannt', /kein Guthaben/.test(texte.geld), texte.geld.slice(0, 70));
  ok('und der Parameter-Fehler steht im Klartext dabei',
    /abgelehnt/.test(texte.param) && /response_format/.test(texte.param), texte.param.slice(0, 90));

  // ── Der Kasten dafür ist in der Seite ─────────────────────────────────────
  ok('der Fehlerkasten steht im Importieren-Fenster',
    await seite.evaluate(() => !!document.getElementById('igFehlerBox')));

  // Die Zusicherung ist NICHT „die App greift nie ins Netz" — sie holt beim
  // Start die SBKIM-Briefkästen, das ist netzweit vereinbart (INTERFACES
  // §11.6). Die Zusicherung ist: DIESE Probe hat keinen bezahlten Bild-Aufruf
  // ausgelöst. Eine pauschale Lockerung wäre ein Scheunentor, deshalb steht
  // daneben eine NAMENTLICHE Liste dessen, was hinaus darf.
  const ERLAUBT = [/^https:\/\/raw\.githubusercontent\.com\/lausiklauskn-png\//];
  ok('kein BEZAHLTER Aufruf ging hinaus (images/generations)',
    !fremd.some(u => u.includes('images/generations')), fremd.filter(u => u.includes('generations')).join(', '));
  ok('und was sonst hinaus wollte, steht auf der benannten Liste',
    fremd.every(u => ERLAUBT.some(re => re.test(u))),
    fremd.filter(u => !ERLAUBT.some(re => re.test(u))).join(', '));
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${gruen} grün · ${rot.length} ROT`);
if (rot.length) { rot.forEach(r => console.log('  ✗ ' + r)); process.exit(1); }
