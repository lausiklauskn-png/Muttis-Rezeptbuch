// Probe: keine Funktion ist zweimal deklariert.
//
// Anlass (Klaus 2026-10-12): das KI-Bild wurde bezahlt-versucht und kam nie an.
// Ursache: #425 legte für den Web-Import ein neues `_bildHolen(u)` an — den
// Namen trug schon die OpenAI-Bestellung `_bildHolen(prompt,size)`. Funktions-
// Deklarationen werden hochgezogen, die SPÄTERE gewinnt; die KI-Bild-Erzeugung
// rief seitdem den Web-Downloader. Dieselbe Falle wie `catIco` in Mixarium.
//
// ⚠ Gelesen wird die QUELLDATEI, Zeile für Zeile — ohne Browser, in Sekunden.
// ⚠ BENANNTE AUSNAHME: `parseAmt` steht seit langem doppelt (zwei Fassungen,
// die spätere gewinnt seit jeher). Sie ist hier namentlich zugelassen, nicht
// übersehen; eine NEUE Dopplung macht die Probe rot.
//
//   node tests/smoke_doppelte_namen.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..');
const BEKANNT = new Set(['parseAmt']);
const qc = readdirSync(WURZEL).filter(n => /^QC_.*\.html$/.test(n)).sort().pop();
const text = readFileSync(join(WURZEL, qc), 'utf8');
const zaehl = new Map();
for (const m of text.matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm))
  zaehl.set(m[1], (zaehl.get(m[1]) || 0) + 1);
const doppelt = [...zaehl].filter(([n, k]) => k > 1).map(([n]) => n);
const neu = doppelt.filter(n => !BEKANNT.has(n));
let gruen = 0; const rot = [];
const ok = (name, bed, z = '') => { if (bed) { gruen++; console.log('  ✓ ' + name); } else { rot.push(name); console.log('  ✗ ROT: ' + name + (z ? ' — ' + z : '')); } };
ok(`die Quelldatei hat überhaupt Funktionen (${zaehl.size}) — sonst misst die Probe nichts`, zaehl.size > 200, qc);
ok('keine Funktion ist zweimal deklariert (außer der benannten Ausnahme)', neu.length === 0, neu.join(', '));
ok('`_bildHolen` (OpenAI) und `_webBildHolen` (Web) sind zwei verschiedene Namen', zaehl.get('_bildHolen') === 1 && zaehl.get('_webBildHolen') === 1, JSON.stringify([zaehl.get('_bildHolen'), zaehl.get('_webBildHolen')]));
console.log(`\n${gruen} grün · ${rot.length} ROT`);
process.exitCode = rot.length ? 1 : 0;
