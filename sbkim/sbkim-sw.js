/*
 * SBKIM — Service-Worker für statisch gehostete Endknoten
 *
 * Variante A · Page-Hosted via MessageChannel.
 *
 * Fängt eingehende POST /sbkim/anastomosis (Modul 05), POST
 * /sbkim/legacy (Modul 07) und POST /sbkim/heterokaryosis (Modul 06)
 * ab und leitet den Body via postMessage an die aktive Page weiter.
 * Die Page hält die Krypto und den State (window.SbkimAnastomose,
 * window.SbkimApoptose, window.SbkimHeterokaryose); der SW bleibt
 * dünn und blind. Alle drei Pfade nutzen denselben fetch-Listener
 * (gemeinsamer Einstieg, leichter erweiterbar für Modul 11).
 *
 * Vertrag (siehe INTERFACES.md §3, docs/components/05_anastomose.md
 * § "Service-Worker-Hinweis", docs/components/07_apoptose.md und
 * docs/components/06_heterokaryose.md):
 *
 *   - POST /sbkim/anastomosis     → SBKIM_ANASTOMOSIS_REQUEST
 *   - POST /sbkim/legacy          → SBKIM_LEGACY_REQUEST
 *   - POST /sbkim/heterokaryosis  → SBKIM_HETEROKARYOSIS_REQUEST
 *   - Content-Type: application/json
 *   - Body ≤ 64 KiB
 *   - andere Methode → 405
 *   - falscher Content-Type → 415
 *   - Body zu groß → 413
 *   - keine Page-Instanz aktiv → 503
 *   - Page antwortet nicht binnen QUERY_TIMEOUT_MS → 503
 *
 * Diese Datei ist KEIN ES-Modul — sie wird auf zwei Wegen geladen
 * (siehe Karte 09 § Andock-Schritt-Pfad Schritt 3):
 *
 *   Variante 3a (PWA ohne eigenen SW, Default):
 *     navigator.serviceWorker.register("sbkim-sw.js")
 *     → sbkim-sw.js läuft alleinstehend, übernimmt offene Tabs sofort
 *       (`skipWaiting`/`clients.claim` aktiv).
 *
 *   Variante 3b (PWA mit eigenem App-SW):
 *     In app-sw.js, ganz oben:
 *       self.SBKIM_SW_STANDALONE = false;
 *       importScripts('./sbkim-sw.js');
 *     → sbkim-sw.js hängt sich nur als zusätzlicher fetch-Listener
 *       in den bestehenden App-SW-Kontext ein. `skipWaiting`/
 *       `clients.claim` bleiben dem App-SW überlassen (App-Offline-
 *       Cache + Push-Pfade unangetastet).
 *
 * Der Einbau-Schritt in eine Endknoten-PWA gehört in Modul 09.
 *
 * Bewusst weggelassen (für eine Folge-Pflege-Sitzung):
 *   - Caching/Offline-Strategien: der SW dient hier ausschließlich der
 *     SBKIM-Brücke, nicht der App-Performance.
 *   - Wake-Lock / Auto-Tab-Öffnen: "Wer nicht da ist, schweigt" ist
 *     Teil der Spec.
 *   - Replay-Cache (nonce-Wiederholungserkennung) — Modul 11.
 */
"use strict";

const ANASTOMOSIS_PATH = "/sbkim/anastomosis";
const LEGACY_PATH = "/sbkim/legacy";
const HETEROKARYOSIS_PATH = "/sbkim/heterokaryosis";
const MAX_BODY_BYTES = 64 * 1024;
const PAGE_TIMEOUT_MS = 4000;
const ANASTOMOSIS_REQUEST_TYPE = "SBKIM_ANASTOMOSIS_REQUEST";
const LEGACY_REQUEST_TYPE = "SBKIM_LEGACY_REQUEST";
const HETEROKARYOSIS_REQUEST_TYPE = "SBKIM_HETEROKARYOSIS_REQUEST";

// Sub-(e)-Hook (Bau-Sitzung 15.SW, 2026-05-24) — Fremdzugriff-Detektor
// für endpoint-probes. Der SW bewertet eingehende Fetches auf SBKIM-
// Endpunkte fail-soft als "fremd" oder "same-origin" und postet
// fremde Versuche via BroadcastChannel an die Page-Membran-Schicht
// (Modul 15, subscribeBroadcastChannel-Closure). Der Hook ist BEOBACHTEND
// — kein respondWith, kein Eingriff in den Response-Pfad. Bedient wird
// der Request weiterhin von den drei bestehenden Bridge-Branches
// (ANASTOMOSIS / LEGACY / HETEROKARYOSIS) bzw. fällt durch ins Netz.
// /sbkim/query bewusst nicht aufgeführt — Endpunkt existiert serverseitig
// noch nicht (Modul 04.C Search-API ausstehend), der Detektor würde sonst
// sinnlos feuern.
const MEMBRANE_PROBE_CHANNEL = "sbkim-membrane";
const MEMBRANE_PROBE_MESSAGE_TYPE = "SBKIM_MEMBRANE_PROBE";
const SBKIM_ENDPOINT_PATHS = [
  "/sbkim/spore.json",
  ANASTOMOSIS_PATH,
  LEGACY_PATH,
  HETEROKARYOSIS_PATH,
];

// Lebenszyklus-Schalter (App-SW-Koexistenz, Karte 09 § Service-Worker-
// Hinweis). Default `true` → Variante 3a (alleinstehend): SBKIM-SW wird
// per `register('sbkim-sw.js')` registriert und übernimmt aktive Tabs
// sofort. Variante 3b (Endknoten hat schon einen App-SW) setzt
// `self.SBKIM_SW_STANDALONE = false` vor `importScripts('./sbkim-sw.js')`,
// damit der App-SW seinen Lebenszyklus behält; sbkim-sw.js hängt sich
// dann nur als zusätzlicher fetch-Listener für `/sbkim/*`-Pfade in den
// bestehenden SW-Kontext ein.
const SBKIM_SW_STANDALONE = (typeof self.SBKIM_SW_STANDALONE !== "undefined")
  ? self.SBKIM_SW_STANDALONE
  : true;

self.addEventListener("install", (event) => {
  if (SBKIM_SW_STANDALONE) {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener("activate", (event) => {
  if (SBKIM_SW_STANDALONE) {
    event.waitUntil(self.clients.claim());
  }
});

// Ein gemeinsamer fetch-Listener für alle SBKIM-Endpunkte. Neue Pfade
// (z.B. /sbkim/* für künftige Module wie 11) reihen sich hier ein, statt
// einen eigenen Listener anzulegen.
//
// fetch-Konvention für Variante 3b (App-SW-Koexistenz): wir rufen
// `event.respondWith()` AUSSCHLIESSLICH für die SBKIM-Pfade auf. Andere
// Requests werden NICHT angefasst — Browser ruft die `fetch`-Listener in
// Registrier-Reihenfolge auf, und `importScripts('./sbkim-sw.js')` läuft
// im App-SW VOR den App-SW-Listenern. Erster Listener, der respondWith
// aufruft, gewinnt; ohne respondWith fällt das Event an den nächsten
// Listener (App-SW-Cache-/Routing-Code) durch.
self.addEventListener("fetch", (event) => {
  // Sub-(e)-Hook ZUERST: beobachtet jeden Request auf einen SBKIM-
  // Endpunkt synchron + fail-soft (kein await, kein respondWith). Die
  // drei Bridge-Branches unten bleiben unberührt.
  maybeRecordMembraneProbe(event.request);

  const url = new URL(event.request.url);
  if (isOwnEndpoint(url.pathname, ANASTOMOSIS_PATH)) {
    event.respondWith(handleBridge(event.request, event.clientId, ANASTOMOSIS_REQUEST_TYPE));
    return;
  }
  if (isOwnEndpoint(url.pathname, LEGACY_PATH)) {
    event.respondWith(handleBridge(event.request, event.clientId, LEGACY_REQUEST_TYPE));
    return;
  }
  if (isOwnEndpoint(url.pathname, HETEROKARYOSIS_PATH)) {
    event.respondWith(handleBridge(event.request, event.clientId, HETEROKARYOSIS_REQUEST_TYPE));
    return;
  }
  // sonst: nicht unsere Sache — kein respondWith, Event fällt an den
  // App-SW-Listener (Variante 3b) bzw. an den Default-Network-Pfad
  // (Variante 3a) durch.
});

// Scope-Hygiene (Fund 2026-05-17, A/B-Test-Sitzung):
//
// Subresource-Fetches von einem controlled client gehen durch DESSEN
// kontrollierenden SW — NICHT durch den SW, dessen Scope die URL trifft.
// Wenn Tab A (controlled von SW A, Scope /A/) `fetch('/B/sbkim/anastomosis')`
// macht, feuert das fetch-Event in SW A — nicht in SW B. SW A muss diesen
// Cross-Scope-Pfad durchfallen lassen, damit die Anfrage ans Netzwerk geht
// (wo sie i.d.R. mit 404 endet — same-origin cross-PWA Handshake via
// SW-Bridge ist konzeptuell nicht möglich, das ist Spec, kein Bug).
//
// Die vorherige Variante (`pathname.endsWith(endpointPath)`) war zu
// permissiv und fing Cross-Scope-Pfade ab; dadurch antwortete der falsche
// SW mit "toNodeId stimmt nicht zum Empfänger" und maskierte das echte
// Problem. Wir prüfen jetzt streng: der URL-Pfad muss exakt im eigenen
// Scope des SW liegen.
//
// Hinweis Variante 3c (`/<repo>/sbkim/`-Scope): wird durch diese Funktion
// NICHT abgedeckt — dort wäre der erwartete Pfad scope + tail-of-endpoint
// statt scope + endpoint. 3c ist in Karte 09 als nachrangige
// Übergangslösung markiert und produktiv nicht im Einsatz; ein eventueller
// Support gehört in eine eigene Spec-Sitzung, nicht in diese Pflege.
function isOwnEndpoint(pathname, endpointPath) {
  const scopePath = new URL(self.registration.scope).pathname;
  const expected = (scopePath === "/")
    ? endpointPath
    : scopePath.replace(/\/$/, "") + endpointPath;
  return pathname === expected;
}

async function handleBridge(request, originatingClientId, messageType) {
  if (request.method !== "POST") {
    return jsonError(405, "Method Not Allowed", { Allow: "POST" });
  }

  const ct = (request.headers.get("content-type") || "").toLowerCase();
  if (!ct.startsWith("application/json")) {
    return jsonError(415, "Unsupported Media Type — application/json erwartet.");
  }

  let raw;
  try {
    raw = await request.text();
  } catch (err) {
    return jsonError(400, "Bad Request: Body nicht lesbar.");
  }

  // Body-Längen-Schutz. Wir messen nach UTF-8-Byte-Länge, weil 64 KiB
  // sich auf Bytes auf der Leitung bezieht.
  const bodyBytes = new TextEncoder().encode(raw).length;
  if (bodyBytes > MAX_BODY_BYTES) {
    return jsonError(413, "Payload Too Large — Body > " + MAX_BODY_BYTES + " Bytes.");
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return jsonError(400, "Bad Request: kein gültiges JSON.");
  }

  // Aktive Clients suchen. Wir wollen NUR Pages, die diesen SW als
  // Controller haben (`includeUncontrolled: false`) — sonst tauchen
  // Phantom-Pages aus anderen Pfaden derselben Origin auf (z.B. das
  // Sage-Protokol-Test-Panel oder die andere Endknoten-PWA), die mit
  // ALTEN Modul-02-Identitäten antworten und „toNodeId stimmt nicht
  // zum Empfänger" werfen, obwohl der tatsächlich angesprochene Tab
  // sauber wäre. Bevorzugt der Tab, der den Request ausgelöst hat;
  // wenn das (typisch Cross-Tab-POST) nicht klappt, irgendein offener
  // CONTROLLED Tab. Bei mehreren CONTROLLED Tabs versuchen wir alle
  // der Reihe nach, bis einer NICHT `rejected: toNodeId stimmt nicht`
  // antwortet — der wahre Empfänger ist dann gefunden.
  const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: false });
  if (clientList.length === 0) {
    return jsonError(503, "Service Unavailable — keine aktive controlled Page-Instanz (Tab evtl. nicht vom SW kontrolliert).");
  }
  // Reihenfolge: erst originating-Client (falls in der Liste), dann der Rest.
  const ordered = [];
  const origin = clientList.find((c) => c.id === originatingClientId);
  if (origin) ordered.push(origin);
  for (const c of clientList) {
    if (c !== origin) ordered.push(c);
  }

  let pageResponse;
  let lastError = null;
  for (const target of ordered) {
    try {
      pageResponse = await askPage(target, parsed, messageType);
    } catch (err) {
      lastError = err;
      continue; // nächster Client probieren
    }
    // Wenn der Empfänger sagt „toNodeId stimmt nicht zum Empfänger", ist
    // er nicht der wahre Adressat — nächsten Client versuchen. Andere
    // outcomes (established / rejected mit anderem Grund / accepted etc.)
    // sind valide Antworten, die wir behalten.
    if (
      pageResponse &&
      pageResponse.outcome === "rejected" &&
      typeof pageResponse.reason === "string" &&
      pageResponse.reason.indexOf("toNodeId") !== -1
    ) {
      lastError = null;
      continue;
    }
    return new Response(JSON.stringify(pageResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  // Alle Clients abgelehnt — letzte Page-Antwort (oder Fehler) zurückgeben.
  if (pageResponse) {
    return new Response(JSON.stringify(pageResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return jsonError(503, "Service Unavailable — Page hat nicht geantwortet (" + (lastError && lastError.message ? lastError.message : "unbekannt") + ").");
}

function askPage(client, sbkimRequest, messageType) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeoutId = setTimeout(() => {
      try { channel.port1.close(); } catch (e) { /* schon zu */ }
      reject(new Error("page-timeout"));
    }, PAGE_TIMEOUT_MS);

    channel.port1.onmessage = (event) => {
      clearTimeout(timeoutId);
      try { channel.port1.close(); } catch (e) { /* nb */ }
      resolve(event.data);
    };

    try {
      client.postMessage(
        { type: messageType, request: sbkimRequest },
        [channel.port2],
      );
    } catch (err) {
      clearTimeout(timeoutId);
      reject(err);
    }
  });
}

function jsonError(status, reason, extraHeaders) {
  const headers = Object.assign(
    { "Content-Type": "application/json" },
    extraHeaders || {},
  );
  const body = JSON.stringify({ outcome: "rejected", reason: reason });
  return new Response(body, { status: status, headers: headers });
}

// ---- Sub-(e)-Hilfsfunktionen (Bau 15.SW) ----
//
// Bewertet einen eingehenden Request fail-soft als endpoint-probe und
// postet bei Fremd-Diagnose einen Eintrag via BroadcastChannel an die
// Page-Membran-Schicht. Wird synchron aus dem fetch-Listener gerufen;
// jeder Pfad ist try/catch-gekapselt — der Hook darf den Response-Pfad
// nie brechen.
function maybeRecordMembraneProbe(request) {
  try {
    const url = new URL(request.url);
    if (!pathMatchesSbkimEndpoint(url.pathname)) return;

    const secFetchSite = request.headers.get("Sec-Fetch-Site");
    const referer = request.headers.get("Referer");
    const verdict = classifyOrigin(url, secFetchSite, referer);
    if (verdict.foreign !== true) return;

    const entry = {
      at: new Date().toISOString(),
      kind: "endpoint-probe",
      origin: verdict.origin,
      // SW hat keinen zuverlässigen navigator.userAgent zur Hand
      // (Sub-Resource-Fetches tragen häufig keinen UA-Header weiter);
      // die Page-Schicht setzt agentHint NICHT nach (Schema-konform).
      agentHint: null,
      endpoint: url.pathname,
      // SW erkennt nur, bedient nicht — die Bridge-Branches (Modul
      // 05/06/07) entscheiden später, was sie tun. "accepted" heißt
      // hier: aus Sicht der Membran wurde der Versuch wahrgenommen
      // und an die Page durchgelassen (kein Sub-(e)-eigenes Filtern).
      decision: "accepted",
      details: {
        method: request.method,
        secFetchSite: secFetchSite || null,
      },
    };

    postProbeViaBroadcastChannel(entry);
  } catch (err) {
    try { console.warn("[sbkim-sw] Membran-Probe-Hook hat geworfen — fail-soft.", err); }
    catch (_e) { /* nb */ }
  }
}

function pathMatchesSbkimEndpoint(pathname) {
  for (let i = 0; i < SBKIM_ENDPOINT_PATHS.length; i += 1) {
    if (isOwnEndpoint(pathname, SBKIM_ENDPOINT_PATHS[i])) return true;
  }
  return false;
}

// Verbindliche „Fremd"-Bewertungs-Reihenfolge aus Karte 15
// § Fremd-Definition (endpoint-probe):
//   1. request.url-Origin ≠ self.location.origin              → Fremd
//   2. Sec-Fetch-Site ∈ {"cross-site", "same-site"}           → Fremd
//   3. Sec-Fetch-Site === "same-origin" oder fehlend          → same-origin
//   4. Fallback: Referer-Origin parsen, ≠ self.location.origin → Fremd
function classifyOrigin(url, secFetchSite, referer) {
  let ownOrigin = null;
  try { ownOrigin = self.location && self.location.origin ? self.location.origin : null; }
  catch (_e) { ownOrigin = null; }

  if (ownOrigin && url.origin !== ownOrigin) {
    return { foreign: true, origin: url.origin };
  }

  if (secFetchSite === "cross-site" || secFetchSite === "same-site") {
    const refOrigin = parseRefererOrigin(referer);
    return { foreign: true, origin: refOrigin };
  }

  if (secFetchSite === "same-origin" || secFetchSite === "none" || !secFetchSite) {
    // Fallback nur, wenn Sec-Fetch-Site fehlt: Referer kann trotzdem
    // auf eine fremde Origin zeigen (alte Browser, Cross-Origin-Iframes
    // ohne Sec-Fetch-Site-Header).
    if (!secFetchSite) {
      const refOrigin = parseRefererOrigin(referer);
      if (refOrigin && ownOrigin && refOrigin !== ownOrigin) {
        return { foreign: true, origin: refOrigin };
      }
    }
    return { foreign: false, origin: null };
  }

  // Unbekannter Sec-Fetch-Site-Wert — defensiv als same-origin werten.
  return { foreign: false, origin: null };
}

function parseRefererOrigin(referer) {
  if (!referer || typeof referer !== "string") return null;
  try {
    return new URL(referer).origin;
  } catch (_e) {
    return null;
  }
}

// Eine BroadcastChannel-Instanz pro Aufruf: open → post → close. Long-
// lived Channel im SW bräuchte eigene Lebenszyklus-Logik (idle-Tear-Down,
// Reactivation nach Suspension) — Per-Probe-Channel ist die einfache,
// thread-sichere Variante. BroadcastChannel ist billig. Folge-Pflege
// kann auf long-lived umstellen, falls Probe-Volumen je zum Bottleneck
// wird (vermutlich nie).
function postProbeViaBroadcastChannel(entry) {
  if (typeof self.BroadcastChannel !== "function") return;
  let ch = null;
  try {
    ch = new self.BroadcastChannel(MEMBRANE_PROBE_CHANNEL);
    ch.postMessage({ type: MEMBRANE_PROBE_MESSAGE_TYPE, entry: entry });
  } catch (err) {
    try { console.warn("[sbkim-sw] Membran-Probe BroadcastChannel-Post fehlgeschlagen — fail-soft.", err); }
    catch (_e) { /* nb */ }
  } finally {
    if (ch) {
      try { ch.close(); } catch (_e) { /* nb */ }
    }
  }
}
