// Waechter fuer die umgezogene Wortkarte (Umzug 2026-09-16).
//   node tests/smoke_wortkarte.mjs
//
// WARUM ES DIESE PROBE GIBT. Bis zum 2026-09-16 stand `MR_QUERY_SYNONYMS` mitten in
// `sbkim/15_membran.js` — einer byte-1:1-Kopie aus dem Sage-Kanon. Das war
// echte, nuetzliche Funktion an der falschen Stelle: „kopieren, nicht klonen"
// verbietet, die Kopie zu aendern, und das naechste Nachziehen des Kanons
// haette die Karte LAUTLOS geloescht. Genau das ist an diesem Tag beinahe
// passiert und nur aufgefallen, weil der sha der Kopie NICHT in Sages
// Historie stand.
//
// Seit dem 2026-08-14 traegt der Kanon die Mechanik selbst (`queryInclusion`,
// aus BookLedgerPro hochgezogen) mit der Auflage: die MECHANIK in den Kanon,
// die FACHWORTE zu der App, die sie kennt. Die Karte liegt deshalb jetzt in
// `sbkim/sbkim-init.js` und wird an `init()` uebergeben.
//
// ⚠ OHNE DIESE PROBE WAERE DER UMZUG EINE BEHAUPTUNG. Nimmt jemand die
// `queryInclusion`-Zeile aus dem Glue, faellt die App still auf den reinen
// Cosinus-Pfad zurueck — kein Fehler, keine rote Zeile, nur schlechtere
// Treffer. Ein Riegel, den keine Probe von seinem Fehlen unterscheiden kann,
// ist eine Behauptung.
//
// ⚠ GEMESSEN WIRD DIE UEBEREINSTIMMUNG, NICHT EINE ZAHL. Ein genagelter Wert
// („12 Eintraege") waere beim ersten neuen Synonym rot, ohne dass eine
// Zusicherung gefallen waere. Verglichen wird, was im Glue steht, mit dem,
// was das laufende Modul herausgibt.
import { readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, extname } from "node:path";

const hier = dirname(fileURLToPath(import.meta.url));
const wurzel = resolve(hier, "..");
let pass = 0, fail = 0;
const ok = (b, m, d = "") => { if (b) { pass++; console.log("  ✓", m); } else { fail++; console.log("  ✗", m, d ? "— " + d : ""); } };

const KOPIE = join(wurzel, "sbkim/15_membran.js");
const GLUE  = join(wurzel, "sbkim/sbkim-init.js");
const kopie = readFileSync(KOPIE, "utf8");
const glue  = readFileSync(GLUE, "utf8");

// 1 — Die Karte darf NICHT in der byte-1:1-Kopie stehen. Das ist der Kern des
//     Umzugs: dort loescht sie das naechste Nachziehen des Kanons.
ok(!/MR_QUERY_SYNONYMS/.test(kopie),
   "die Wortkarte steht NICHT in der byte-1:1-Modul-Kopie");

// 2 — Sie steht im app-eigenen Glue UND wird uebergeben. Zwei Haelften: eine
//     Karte, die dasteht und niemandem gereicht wird, wirkt nicht.
ok(/MR_QUERY_SYNONYMS\s*=\s*\{/.test(glue), "die Wortkarte steht im app-eigenen Glue");
ok(/queryInclusion\s*:\s*\{\s*synonyms\s*:\s*MR_QUERY_SYNONYMS\s*\}/.test(glue),
   "…und wird an SbkimMembrane.init() uebergeben");

const imGlue = (glue.match(/MR_QUERY_SYNONYMS\s*=\s*\{([\s\S]*?)\n\s*\};/) || [])[1] || "";
const anzahlGlue = (imGlue.match(/"[^"]+"\s*:/g) || []).length;
ok(anzahlGlue > 0, "die Karte im Glue hat ueberhaupt Eintraege", String(anzahlGlue));

// 3 — Und sie kommt im LAUFENDEN Modul an. Ein Waechter, der die Datei LIEST,
//     misst nicht, ob sie LAEUFT: `node --check` prueft Syntax, nicht ob ein
//     Name existiert.
let chromium = null;
try { ({ chromium } = await import("playwright-core")); }
catch { /* unten als „nicht lauffaehig" gemeldet, NICHT als gruen */ }

if (!chromium) {
  console.log("  ⊘ der Browser-Teil ist NICHT LAUFFAEHIG (playwright-core fehlt) — ungeprueft, nicht gruen");
  console.log(`\nErgebnis: ${pass} gruen, ${fail} rot, 1 nicht lauffaehig`);
  process.exit(fail ? 1 : 0);
}

const TYP = { ".html":"text/html", ".js":"text/javascript", ".json":"application/json",
              ".css":"text/css", ".svg":"image/svg+xml", ".png":"image/png", ".webmanifest":"application/manifest+json" };
const srv = createServer((q, a) => {
  let p = join(wurzel, decodeURIComponent(q.url.split("?")[0]));
  if (p.endsWith("/")) p = join(p, "index.html");
  if (!existsSync(p)) { a.writeHead(404); return a.end(); }
  try { a.writeHead(200, { "content-type": TYP[extname(p)] || "text/plain" }); a.end(readFileSync(p)); }
  catch { a.writeHead(500); a.end(); }
});
await new Promise((r) => srv.listen(0, r));
const port = srv.address().port;

const start = { args: ["--no-sandbox"] };
if (process.env.PW_CHROME) start.executablePath = process.env.PW_CHROME;
const br = await chromium.launch(start);
const pg = await br.newPage();
await pg.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });

// Auf die BEDINGUNG warten, nicht auf die Uhr. Die Nachlade-Kette braucht ihre
// Zeit; eine feste Frist ist ein Rennen, das irgendwann verloren geht — und
// verloren heisst hier nicht „falsch", sondern „stumm".
let gesetzt = null, anzahlLauf = -1;
try {
  await pg.waitForFunction(() => window.SbkimMembrane && window.SbkimMembrane._meta, { timeout: 30000 });
  await pg.waitForFunction(() => window.SbkimMembrane._meta.queryInclusionConfigured === true, { timeout: 30000 });
} catch { /* faellt als Befund durch */ }
try {
  gesetzt    = await pg.evaluate(() => window.SbkimMembrane?._meta?.queryInclusionConfigured ?? null);
  anzahlLauf = await pg.evaluate(() => window.SbkimMembrane?._meta?.queryInclusionSynonymCount ?? -1);
} catch { /* dito */ }
await br.close(); srv.close();

ok(gesetzt === true, "das laufende Modul hat die Inklusions-Konfig wirklich bekommen", `war ${gesetzt}`);
ok(anzahlLauf === anzahlGlue,
   "…und es sind GENAU die Eintraege aus dem Glue",
   `Glue ${anzahlGlue}, laufend ${anzahlLauf}`);

console.log(`\nErgebnis: ${pass} gruen, ${fail} rot`);
process.exit(fail ? 1 : 0);
