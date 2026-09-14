// Probe: die vereinfachte Zugangscode-Erklärung im Import-Overlay.
//
// Klaus am 2026-09-14: „Die Meisten kommen besser mit einer nicht so Bild-
// und Container-überladenen Erklärung zurecht." Aus drei Karten mit
// Farbverlauf-Kopf plus einem nachgebauten Browser-Bild wurde EIN ruhiger
// Kasten mit zwei Schritten.
//
// Diese Probe hält beide Hälften fest: dass das Überladene WEG ist, und
// dass die Erklärung dabei nicht verloren ging — in allen acht Sprachen.
//
//   npm install --no-save playwright-core     (einmalig je Behälter)
//   node tests/smoke_zugangscode_erklaerung.mjs
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
// ausliefert. In Mein Mixarium hat das am 2026-09-11 zwölf Gegenprobe-Fälle
// blind gemacht: sie maßen das unberührte Original.
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
// Handy-Breite — dort ist der Platz knapp, und dort hat Klaus gemessen.
const seite = await browser.newPage({ viewport: { width: 412, height: 915 } });

await seite.route('**/*', route => {
  const u = route.request().url();
  if (!u.startsWith(`http://127.0.0.1:${PORT}/`) && !u.startsWith('data:') && !u.startsWith('blob:')) return route.abort();
  return route.continue();
});
const seitenFehler = [];
seite.on('pageerror', e => seitenFehler.push(String(e).slice(0, 200)));

// Gemessen wird, was man SIEHT. getClientRects allein fängt display:none,
// checkVisibility zusätzlich content-visibility, visibility und opacity:0 —
// keins ersetzt das andere (Kimhub, 2026-09-08).
// ⚠ checkVisibility() prüft von sich aus WEDER visibility:hidden NOCH
// opacity:0 — beides muss man ausdrücklich verlangen. Ohne die drei Schalter
// war dieser Wächter blind: die Gegenprobe hat ein Feld mit
// visibility:hidden versteckt, und die Probe blieb grün (2026-09-14).
const SICHTBAR = `(el => !!el && el.getClientRects().length > 0 &&
  (!el.checkVisibility || el.checkVisibility({visibilityProperty:true, opacityProperty:true, contentVisibilityAuto:true})))`;

try {
  await seite.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await seite.waitForFunction(() => typeof window.applyLang === 'function', null, { timeout: 20000 });
  await seite.waitForTimeout(400);

  console.log('\n── Die Seite trägt sich selbst ──');
  ok('die Seite lädt ohne Skript-Fehler', seitenFehler.length === 0, seitenFehler.join(' | '));

  // ── Import öffnen, KI-Scan-Tab ───────────────────────────────────
  await seite.evaluate(() => { openImport(); switchFovTab('importOv', 'scan', document.getElementById('impTabScan')); });
  await seite.waitForTimeout(300);

  console.log('\n── Das Überladene ist weg ──');
  const weg = await seite.evaluate(() => ({
    mock: document.querySelectorAll('[class*="mock-"]').length,
    karten: document.querySelectorAll('.stp-card, .stp-head, .stp-title, .stp-body').length,
    bilder: document.querySelectorAll('#scanSetup img, #txtSetup img').length,
  }));
  ok('kein nachgebautes Browser-Bild mehr', weg.mock === 0, weg.mock + ' mock-Elemente');
  ok('keine drei Schritt-Karten mehr', weg.karten === 0, weg.karten + ' Karten-Elemente');
  ok('kein Bild in der Erklärung', weg.bilder === 0, weg.bilder + ' Bilder');

  console.log('\n── Ein Kasten, zwei Schritte, alles sichtbar ──');
  const bau = await seite.evaluate(([S]) => {
    const sicht = eval(S);
    const setup = document.getElementById('scanSetup');
    return {
      kaesten: setup.querySelectorAll('.key-how').length,
      schritte: setup.querySelectorAll('.key-how-step').length,
      kastenSichtbar: sicht(setup.querySelector('.key-how')),
      knopfSichtbar: sicht(setup.querySelector('.btn-website')),
      feldSichtbar: sicht(document.getElementById('apiKeyIn')),
      speichernSichtbar: sicht(document.getElementById('scanSaveBtn')),
      einfuegenSichtbar: sicht(document.getElementById('pasteBtnLbl')),
      hoehe: Math.round(setup.getBoundingClientRect().height),
      erklaerHoehe: Math.round(setup.querySelector('.key-how').getBoundingClientRect().height),
    };
  }, [SICHTBAR]);
  ok('genau EIN Erklär-Kasten', bau.kaesten === 1, bau.kaesten + ' Kästen');
  ok('genau ZWEI Schritte darin', bau.schritte === 2, bau.schritte + ' Schritte');
  ok('der Kasten ist sichtbar', bau.kastenSichtbar);
  ok('der Website-Knopf ist sichtbar', bau.knopfSichtbar);
  ok('das Eingabefeld ist sichtbar', bau.feldSichtbar);
  ok('der Speichern-Knopf ist sichtbar', bau.speichernSichtbar);
  ok('der Einfügen-Knopf ist sichtbar', bau.einfuegenSichtbar);
  console.log('     (gemessen bei 412 px Breite: Erklärung ' + bau.erklaerHoehe
              + ' px, Einrichtung gesamt ' + bau.hoehe + ' px)');

  console.log('\n── Der blaue Knopf behält Globus und Adresse ──');
  // Vor dem 2026-09-14 trug der <a> selbst die id scanOpenLink, und applyLang
  // setzt textContent — es warf bei JEDEM Sprach-Anwenden Globus und
  // Unterzeile aus dem Knopf. Sichtbar war das nicht, deshalb fiel es nie auf.
  await seite.evaluate(() => applyLang('de'));
  const knopf = await seite.evaluate(([S]) => {
    const sicht = eval(S);
    const a = document.querySelector('#scanSetup .btn-website');
    return { ico: sicht(a.querySelector('.bw-ico')), sub: sicht(a.querySelector('.bw-sub')),
             subText: (a.querySelector('.bw-sub') || {}).textContent || '',
             lbl: (a.querySelector('.bw-lbl') || {}).textContent || '' };
  }, [SICHTBAR]);
  ok('Globus steht noch da nach applyLang', knopf.ico);
  ok('die Adresse steht noch da nach applyLang', knopf.sub && /console\.anthropic\.com/.test(knopf.subText), knopf.subText);
  ok('die Beschriftung ist gefüllt', knopf.lbl.trim().length > 3, knopf.lbl);

  console.log('\n── Die Erklärung überlebt in allen acht Sprachen ──');
  const SPR = ['de', 'en', 'ru', 'zh', 'es', 'fr', 'it', 'pt'];
  const texte = {};
  for (const sp of SPR) {
    await seite.evaluate(s => applyLang(s), sp);
    await seite.waitForTimeout(60);
    texte[sp] = await seite.evaluate(() => {
      const t = id => (document.getElementById(id) || {}).textContent || '';
      return { sc1T: t('sc1T'), sc1D: t('sc1D'), sc2T: t('sc2T'), sc2D: t('sc2D'),
               apiKeyLbl: t('apiKeyLbl'), knopf: t('scanOpenLink') };
    });
  }
  for (const sp of SPR) {
    const leer = Object.entries(texte[sp]).filter(([, v]) => v.trim().length < 3).map(([k]) => k);
    ok(sp + ': alle sechs Texte gefüllt', leer.length === 0, 'leer: ' + leer.join(', '));
  }
  ok('Deutsch und Englisch sind wirklich verschieden',
     texte.de.sc1T !== texte.en.sc1T && texte.de.sc2D !== texte.en.sc2D);
  ok('kein Text zeigt den Schlüsselnamen statt der Übersetzung',
     !SPR.some(sp => Object.entries(texte[sp]).some(([k, v]) => v.trim() === k)));

  console.log('\n── Der Text-Tab ist genauso gebaut ──');
  await seite.evaluate(() => { applyLang('en'); switchFovTab('importOv', 'txt', document.getElementById('impTabTxt')); });
  await seite.waitForTimeout(250);
  const txt = await seite.evaluate(([S]) => {
    const sicht = eval(S);
    const setup = document.getElementById('txtSetup');
    const t = id => (document.getElementById(id) || {}).textContent || '';
    return { kaesten: setup.querySelectorAll('.key-how').length,
             schritte: setup.querySelectorAll('.key-how-step').length,
             karten: setup.querySelectorAll('.stp-card').length,
             sicht: sicht(setup.querySelector('.key-how')),
             feld: sicht(document.getElementById('txtApiKeyIn')),
             sc2D: t('txtSc2D'), sc1T: t('txtSc1T') };
  }, [SICHTBAR]);
  ok('ein Kasten, zwei Schritte, keine Karte', txt.kaesten === 1 && txt.schritte === 2 && txt.karten === 0);
  ok('der Kasten im Text-Tab ist sichtbar', txt.sicht);
  ok('das Eingabefeld im Text-Tab ist sichtbar', txt.feld);
  // Vor dem 2026-09-14 stand Schritt 2 hier in JEDER Sprache auf Deutsch —
  // er hatte gar keinen Sprach-Schlüssel. Jetzt leiht er sich sc2D.
  ok('Schritt 2 im Text-Tab ist auf Englisch wirklich englisch',
     /Create Key/.test(txt.sc2D) && !/klicken|eingeben/.test(txt.sc2D), txt.sc2D.slice(0, 70));
  ok('Schritt 1 im Text-Tab ist übersetzt', /account|website/i.test(txt.sc1T), txt.sc1T);

  // ── Die Zwillinge, exakt gemessen ────────────────────────────────
  // Die Erklärung im Text-Tab hat eigene Sprach-Schlüssel — nur kennt sie
  // nicht jede Sprache: txtSc2D kennt GAR KEINE, Portugiesisch kennt die
  // übrigen vier nicht. Dort leiht sie sich den Zwilling aus dem KI-Scan.
  //
  // ⚠ Gemessen wird gegen LANGS, nicht gegen einen Wortlaut und nicht gegen
  //   „steht da noch Deutsch". Ein Text kann von einem VORIGEN applyLang
  //   stehengeblieben sein — dann sieht ein Deutsch-Test grün aus, obwohl
  //   gar nichts gesetzt wurde. Genau daran war die erste Fassung blind.
  const ZWILLING = { txtSc1T: 'sc1T', txtSc1D: 'sc1D', txtSc2T: 'sc2T',
                     txtWebLbl: 'scanOpenLink', txtSc2D: 'sc2D' };
  for (const sp of ['de', 'en', 'ru', 'pt']) {
    const abw = await seite.evaluate(([sprache, zw]) => {
      applyLang(sprache);
      const L = LANGS[sprache] || {};
      const schlecht = [];
      for (const [id, twin] of Object.entries(zw)) {
        const el = document.getElementById(id);
        if (!el) { schlecht.push(id + ' (fehlt)'); continue; }
        const soll = L[id] !== undefined ? L[id] : L[twin];
        if (soll === undefined) { schlecht.push(id + ' (keine Sprache)'); continue; }
        if ((el.textContent || '').trim() !== String(soll).trim()) schlecht.push(id);
      }
      return schlecht;
    }, [sp, ZWILLING]);
    ok(sp + ': der Text-Tab zeigt genau das, was diese Sprache sagt',
       abw.length === 0, 'weicht ab: ' + abw.join(', '));
  }

  console.log('\n── Die Haken arbeiten weiter ──');
  await seite.evaluate(() => { applyLang('de'); switchFovTab('importOv', 'scan', document.getElementById('impTabScan')); });
  await seite.waitForTimeout(200);
  const haken = await seite.evaluate(() => {
    const vor = (document.getElementById('stepDone1') || {}).textContent;
    markStep1();
    const nach = (document.getElementById('stepDone1') || {}).textContent;
    const inp = document.getElementById('apiKeyIn');
    inp.value = 'sk-ant-api03-' + 'x'.repeat(40);
    onApiKeyInput(inp.value);
    return { vor, nach, drei: (document.getElementById('stepDone3') || {}).textContent,
             speichernFrei: !document.getElementById('scanSaveBtn').disabled };
  });
  ok('Schritt 1 bekommt seinen Haken', !haken.vor && haken.nach === '✅');
  ok('ein gültiger Code setzt den Haken am Eingabefeld', haken.drei === '✅');
  ok('der Speichern-Knopf wird dadurch bedienbar', haken.speichernFrei);
  ok('dabei wirft die Seite keinen Fehler', seitenFehler.length === 0, seitenFehler.join(' | '));

  console.log('\n── Die Hilfe bleibt, zugeklappt ──');
  const faq = await seite.evaluate(([S]) => {
    const sicht = eval(S);
    return { knopf: sicht(document.getElementById('scanFaqBtn')),
             offen: sicht(document.getElementById('scanFaqBody')) };
  }, [SICHTBAR]);
  ok('der Hilfe-Knopf steht da', faq.knopf);
  ok('die Antworten sind zugeklappt', !faq.offen);

} catch (e) {
  rot.push('Probe abgebrochen: ' + e.message);
  console.log('  ✗ ROT: Probe abgebrochen — ' + e.message);
} finally {
  await browser.close();
  server.close();
}

console.log('\n' + '─'.repeat(58));
console.log(gruen + ' grün · ' + rot.length + ' ROT');
if (rot.length) { rot.forEach(r => console.log('  ROT: ' + r)); process.exit(1); }
