// Gegenprobe zu tests/smoke_zugangscode_erklaerung.mjs.
//
// Baut je einen Fehler ein und besteht darauf, dass die Probe umfällt — an der
// ROTEN ZEILE, die zu diesem Fehler gehört. Ein Fall, der die Probe an einer
// FREMDEN Zusicherung umwirft, sieht wie ein Treffer aus und beweist nichts.
//
//   node tests/gegenprobe_zugangscode_erklaerung.mjs
//
// Sabotiert wird eine WEGWERF-KOPIE, nie der Arbeitsbaum.
// ⚠ Sabotiert wird die QUELLDATEI; index.html ist erzeugt, nicht gepflegt.
//   Ohne den Bau-Schritt danach misst die Probe die alte Fassung.
//
// ⚠ BENANNTE GRENZE: drei Fälle verstecken einen Kasten, in dem weitere
//   Elemente liegen — dann fallen mehrere Zusicherungen auf einmal. Gemessen
//   wird trotzdem an der EIGENEN roten Zeile des Falls, nicht an „irgendwas
//   ist rot".

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, symlinkSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..');
const QC = readdirSync(WURZEL).filter(n => /^QC_.*\.html$/.test(n)).sort().pop();
const BAUT = existsSync(join(WURZEL, 'build.py'));

const FAELLE = [
  { name: 'das nachgebaute Browser-Bild kommt zurück',
    alt: `          <div class="key-how-step">
            <span class="key-how-n">2</span>`,
    neu: `          <div class="mock-browser"><div class="mock-bar"><div class="mock-url">console.anthropic.com</div></div></div>
          <div class="key-how-step">
            <span class="key-how-n">2</span>`,
    trifft: /kein nachgebautes Browser-Bild mehr/ },

  { name: 'eine Schritt-Karte kommt zurück',
    alt: `        <div class="key-how">`,
    neu: `        <div class="stp-card"><div class="stp-head"><div class="stp-title">Schritt</div></div></div>
        <div class="key-how">`,
    trifft: /keine drei Schritt-Karten mehr/ },

  { name: 'ein Bild wandert in die Erklärung',
    alt: `            <span class="key-how-n">1</span>`,
    neu: `            <span class="key-how-n">1</span><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt=""/>`,
    trifft: /kein Bild in der Erklärung/ },

  { name: 'ein zweiter Erklär-Kasten kommt dazu',
    alt: `        <div class="key-how">
          <div class="key-how-step">
            <span class="key-how-n">1</span>
            <div class="key-how-txt">
              <b id="sc1T">`,
    neu: `        <div class="key-how"></div>
        <div class="key-how">
          <div class="key-how-step">
            <span class="key-how-n">1</span>
            <div class="key-how-txt">
              <b id="sc1T">`,
    trifft: /genau EIN Erklär-Kasten/ },

  { name: 'ein dritter Schritt kommt dazu',
    alt: `              <b id="sc2T">`,
    neu: `              <b>noch einer</b></div></div>
          <div class="key-how-step"><span class="key-how-n">3</span><div class="key-how-txt">
              <b id="sc2T">`,
    trifft: /genau ZWEI Schritte darin/ },

  { name: 'der Website-Knopf wird versteckt',
    alt: `          <a class="btn-website" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" onclick="markStep1()">
            <span class="bw-ico">🌐</span>
            <span class="bw-text">
              <span class="bw-lbl" id="scanOpenLink">`,
    neu: `          <a class="btn-website" style="display:none" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" onclick="markStep1()">
            <span class="bw-ico">🌐</span>
            <span class="bw-text">
              <span class="bw-lbl" id="scanOpenLink">`,
    trifft: /der Website-Knopf ist sichtbar/ },

  { name: 'das Eingabefeld wird unsichtbar gemacht',
    alt: `                <input class="scan-key-in" id="apiKeyIn" type="password"`,
    neu: `                <input class="scan-key-in" style="visibility:hidden" id="apiKeyIn" type="password"`,
    trifft: /das Eingabefeld ist sichtbar/ },

  // DER FEHLER, DEN DIESE ARBEIT GEFUNDEN HAT: die id sass auf dem <a>, und
  // applyLang setzt textContent — Globus und Adresse flogen bei jedem
  // Sprach-Anwenden aus dem Knopf. Sichtbar war es nicht, also fiel es nie auf.
  { name: 'die Sprach-Marke wandert zurück auf den ganzen Knopf',
    alt: `          <a class="btn-website" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" onclick="markStep1()">
            <span class="bw-ico">🌐</span>
            <span class="bw-text">
              <span class="bw-lbl" id="scanOpenLink">`,
    neu: `          <a class="btn-website" id="scanOpenLink" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" onclick="markStep1()">
            <span class="bw-ico">🌐</span>
            <span class="bw-text">
              <span class="bw-lbl">`,
    trifft: /Globus steht noch da nach applyLang/ },

  { name: 'Schritt 2 verliert seine Sprach-Marke',
    alt: `              <span id="sc2D">`,
    neu: `              <span>`,
    trifft: /alle sechs Texte gefüllt/ },

  { name: 'Englisch verliert den Text zu Schritt 2',
    alt: `sc3T:'Paste code here — done!'`,
    neu: `sc2D:undefined,sc3T:'Paste code here — done!'`,
    trifft: /Deutsch und Englisch sind wirklich verschieden/ },

  { name: 'der Zwilling für Schritt 2 fällt weg',
    alt: `const _zwill={txtSc2D:'sc2D',`,
    neu: `const _zwill={`,
    trifft: /Schritt 2 im Text-Tab ist auf Englisch wirklich englisch/ },

  { name: 'die Zwillinge überschreiben eine vorhandene Übersetzung',
    alt: `    if(L[id]!==undefined)continue;`,
    neu: ``,
    trifft: /^.*ru: der Text-Tab zeigt genau das/ },

  { name: 'Portugiesisch bekommt keinen Ersatz mehr',
    alt: `txtSc1T:'sc1T',txtSc1D:'sc1D',txtSc2T:'sc2T',txtWebLbl:'scanOpenLink'`,
    neu: `txtSc1TAus:'sc1T'`,
    trifft: /^.*pt: der Text-Tab zeigt genau das/ },

  { name: 'der Text-Tab bekommt seine Karten zurück',
    alt: `<div id="txtSetup">`,
    neu: `<div id="txtSetup"><div class="stp-card"></div>`,
    trifft: /ein Kasten, zwei Schritte, keine Karte/ },

  { name: 'der Haken an Schritt 1 verschwindet',
    alt: `            <span class="key-how-ok" id="stepDone1"></span>`,
    neu: ``,
    trifft: /Schritt 1 bekommt seinen Haken/ },

  { name: 'der Haken am Eingabefeld verschwindet',
    alt: ` <span class="key-how-ok" id="stepDone3"></span>`,
    neu: ``,
    trifft: /ein gültiger Code setzt den Haken am Eingabefeld/ },

  { name: 'der Speichern-Knopf bleibt gesperrt',
    alt: `  if(btn)btn.disabled=v.trim().length<10;`,
    neu: `  if(btn)btn.disabled=true;`,
    trifft: /der Speichern-Knopf wird dadurch bedienbar/ },

  { name: 'die Hilfe steht von Anfang an offen',
    alt: `          <div class="scan-faq-body" id="scanFaqBody">`,
    neu: `          <div class="scan-faq-body" style="display:block;max-height:none" id="scanFaqBody">`,
    trifft: /die Antworten sind zugeklappt/ },

  { name: 'der Hilfe-Knopf verschwindet',
    alt: `id="scanFaqBtn"`,
    neu: `id="scanFaqBtnAbgeschaltet"`,
    trifft: /der Hilfe-Knopf steht da/ },
];

function laufProbe(wurzel) {
  const r = spawnSync('node', [join(wurzel, 'tests', 'smoke_zugangscode_erklaerung.mjs')],
                      { encoding: 'utf-8', cwd: wurzel });
  return { code: r.status, aus: (r.stdout || '') + (r.stderr || '') };
}

function frischeKopie() {
  const d = mkdtempSync(join(tmpdir(), 'zugangscode-gegenprobe-'));
  execFileSync('sh', ['-c',
    `tar -c --exclude=./.git --exclude=./node_modules -C '${WURZEL}' . | tar -x -C '${d}'`]);
  if (existsSync(join(WURZEL, 'node_modules'))) symlinkSync(join(WURZEL, 'node_modules'), join(d, 'node_modules'));
  return d;
}

// Ein Lauf auf rote Ausgangslage misst nichts — er meldet nur die Altlast.
console.log('Ausgangslage prüfen …');
{
  const d = frischeKopie();
  const r = laufProbe(d);
  rmSync(d, { recursive: true, force: true });
  if (r.aus.includes('NICHT LAUFFÄHIG')) { console.log('⊘ NICHT LAUFFÄHIG: die Probe selbst läuft hier nicht.'); process.exit(0); }
  if (r.code !== 0) {
    console.log('❌ ABBRUCH: die Probe ist schon OHNE Eingriff rot — es gäbe nichts zu messen.\n');
    console.log(r.aus.split('\n').filter(l => l.includes('ROT')).join('\n'));
    process.exit(2);
  }
  console.log('  ✓ grün\n');
}

let gefangen = 0; const durchgerutscht = [], falscheZeile = [], toteAnker = [];

for (const f of FAELLE) {
  const d = frischeKopie();
  const p = join(d, QC);
  const vorher = readFileSync(p, 'utf-8');
  if (!vorher.includes(f.alt)) {
    toteAnker.push(f.name);
    console.log('  ⚠ TOTER ANKER: ' + f.name);
    rmSync(d, { recursive: true, force: true });
    continue;
  }
  writeFileSync(p, vorher.split(f.alt).join(f.neu));
  if (BAUT) {
    const bau = spawnSync('python3', [join(d, 'build.py')], { cwd: d, encoding: 'utf-8' });
    if (bau.status !== 0) console.log('  ⚠ build.py scheiterte: ' + f.name + ' — ' + (bau.stderr || '').slice(0, 120));
  } else {
    // Mixarium hat keinen Bau-Schritt: index.html ist das Spiegelbild.
    writeFileSync(join(d, 'index.html'), readFileSync(p));
  }
  const r = laufProbe(d);
  rmSync(d, { recursive: true, force: true });

  const roteZeilen = r.aus.split('\n').filter(l => l.includes('✗ ROT:'));
  if (r.code === 0) {
    durchgerutscht.push(f.name);
    console.log('  ✗ NICHT GEFANGEN: ' + f.name);
  } else if (!roteZeilen.some(l => f.trifft.test(l))) {
    falscheZeile.push(f.name + '  → rot war: ' + (roteZeilen[0] || 'Absturz').trim());
    console.log('  ✗ AUS DEM FALSCHEN GRUND: ' + f.name);
    console.log('      rot war: ' + (roteZeilen[0] || '(Absturz, keine rote Zeile)').trim());
  } else {
    gefangen++;
    console.log('  ✓ gefangen: ' + f.name);
  }
}

console.log(`\n${gefangen} gefangen · ${durchgerutscht.length} durchgerutscht · ` +
            `${falscheZeile.length} aus dem falschen Grund · ${toteAnker.length} tote Anker`);
if (durchgerutscht.length || falscheZeile.length || toteAnker.length) process.exit(1);
