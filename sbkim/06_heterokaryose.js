/*
 * SBKIM — Modul 06 — Heterokaryose
 *
 * Composes Modul 01 (Storage) and Modul 02 (Spore) into the third
 * protocol composition (after Modul 05 and 07): Pull-based domain-anchor
 * exchange between already-anastomosed siblings. Modul 06 itself never
 * computes a cosine, never embeds, never calls SbkimAnastomose.handshake
 * — it orchestrates the explicit Heterokaryose-Pull against the legacy
 * POST endpoint /sbkim/heterokaryosis.
 *
 * Public surface (registered on window.SbkimHeterokaryose):
 *   init() -> Promise<void>
 *   requestHeterokaryosis(peerNodeId) -> Promise<HeterokaryoseResult>
 *   receiveHeterokaryosis(incomingRequest) -> Promise<HeterokaryosisResponse>   // wirft NIEMALS
 *   listHeterokaryosis() -> Promise<Array<{ peerNodeId, ts, anchorCount, receivedAt }>>
 *   forgetHeterokaryosis(peerNodeId, ts) -> Promise<void>                       // idempotent
 *
 * Inoffiziell (Unterstrich-Präfix, nur für tests/manual_check.html):
 *   _invokeReceiveHeterokaryosisDirect(request)  -> alias auf receiveHeterokaryosis
 *   _buildSignedHeterokaryosisRequest(toNodeId)  -> Build + Sign ohne Versand
 *   _verifyResponseSignature(resp, jwk)          -> Test-Brücke für Sender-Verify
 *   _addPseudoSibling({nodeId,domain,endpoint,
 *                       pubKey,since,heterokaryosisOptIn})
 *                                                -> schreibt direkt in
 *                                                   sbkim_siblings; akzeptiert
 *                                                   das additive Opt-In-Flag
 *                                                   (Spec-Sitzung 06).
 *                                                   Per Convention nur Tests.
 *   _clearPseudoSiblings()                       -> löscht alle pseudo-Einträge
 *                                                   aus sbkim_siblings.
 *   _setReceiverHttpStatus(status|null)          -> Override für den nächsten
 *                                                   ausgehenden POST: simuliert
 *                                                   eine HTTP-Antwort mit dem
 *                                                   übergebenen Status, ohne
 *                                                   das Netz zu berühren.
 *                                                   Erlaubt Test 12 (404 →
 *                                                   endpoint_unsupported)
 *                                                   headless.
 *   _canonicalize / _base64urlEncode / _base64urlDecode
 *   _signEnvelope / _verifyEnvelope              -> Krypto-Helfer (Panel)
 *
 * Self-check: emits a console.info line on script load (synchronous,
 * before any call). See INTERFACES.md §1 Modul 06, §2 Heterokaryose (Pull),
 * §3 (heterokaryosis: /sbkim/heterokaryosis) und
 * docs/components/06_heterokaryose.md für den verbindlichen Vertrag.
 *
 * Krypto-Pfad (canonicalize, base64url, sign, verify) ist bewusst aus
 * Modul 02 / 05 / 07 dupliziert — Single-File-PWA-Stil, keine geteilte
 * Library, kein Eingriff in 02/05/07. Wer das zusammenführen will,
 * hebt eine Pflege-Sitzung.
 *
 * Anker-Quelle (Pflege Bau 06.1, 2026-05-15): zuerst der durch Modul 08
 * gepflegte sbkim_hetero_outbox-Store (Spec-Sitzung 08). Modul 06 liest
 * fail-soft alle Einträge, sortiert absteigend nach addedAt (neueste
 * zuerst) und nimmt bis zu HETERO_MAX_ANCHORS Einträge in der Anker-Form
 * {label, vector}. Wenn der Store leer ist, fehlt oder das Lesen wirft
 * (z.B. UnknownStoreError auf einer Klaus-PWA mit alter DB-Version),
 * fällt Modul 06 auf den Spore-Single-Anker-Fallback zurück (Label
 * "(domain)", Vektor = senderSpore.domainVector, oder leeres Array,
 * wenn auch das fehlt — Degraded-Modus).
 *
 * Bau 06.Y transparenter Slot-Pfad (2026-05-20): Modul 06 schreibt
 * identitäts-spezifisch in `sbkim_hetero_inbox_<key>` und
 * `sbkim_anastomosis_log_<key>`; liest aus `sbkim_hetero_outbox_<key>`
 * (Schreiber Modul 08 nach Bau 08.Y) und `sbkim_siblings_<key>`
 * (Schreiber Modul 05 nach Bau 05.Y). Receiver-Pfad nutzt eine
 * `nodeId → key`-Map (im `init()` einmal aus `listIdentities()` ×
 * `getOrCreateIdentity(slot)` aufgebaut) zur Persona-Auflösung;
 * Sender-Pfad nutzt den aktiven Slot (Cache in `init()` via
 * `getActiveIdentityKey()`). Spec-Quelle: Brief 04 (PR #99,
 * INTERFACES § 1 Modul 06 + § 9.2 + § 9.4) + Bau 02.Y (PR #104,
 * Multi-Identitäts-API).
 */
(function (global) {
  "use strict";

  // ---- Konstanten (gespiegelt aus INTERFACES.md §0 / §3) ----

  var PROTOCOL_VERSION = "0.1";
  var QUERY_TIMEOUT_MS = 4000;
  var HETERO_MAX_ANCHORS = 5;
  var ENDPOINT_HETEROKARYOSIS = "/sbkim/heterokaryosis";
  var NONCE_BYTES = 16;

  // Bau 06.Y: identitäts-spezifische Stores via Slot-Suffix.
  // Die Basis-Konstanten + Slot-Helper (siblingsStoreName etc.) bauen
  // den vollen Store-Namen. Reine Lese-Stores (sbkim_siblings_<key> +
  // sbkim_hetero_outbox_<key>) gehören Modul 05 bzw. Modul 08 als
  // Schreiber; Modul 06 ist Schreiber für sbkim_hetero_inbox_<key>
  // und sbkim_anastomosis_log_<key>.
  var SIBLINGS_STORE_BASE = "sbkim_siblings";
  var LOG_STORE_BASE = "sbkim_anastomosis_log";
  var INBOX_STORE_BASE = "sbkim_hetero_inbox";
  var OUTBOX_STORE_BASE = "sbkim_hetero_outbox";
  var KEYS_STORE = "sbkim_keys";
  var DEFAULT_IDENTITY_KEY = "main";

  var REQUEST_REQUIRED_FIELDS = [
    "fromNodeId",
    "nonce",
    "protocolVersion",
    "senderSpore",
    "signature",
    "timestamp",
    "toNodeId",
  ];

  // ---- Fehler-Erzeugung ----

  function makeError(name, message, cause) {
    var e = new Error(message);
    e.name = name;
    if (cause !== undefined) e.cause = cause;
    return e;
  }

  // ---- Dependency-Probes ----

  function getSubtle() {
    var c = global.crypto || (typeof crypto !== "undefined" ? crypto : null);
    if (!c || !c.subtle) {
      throw makeError(
        "HeterokaryoseDependenciesError",
        "WebCrypto (crypto.subtle) ist nicht verfügbar. Modul 06 braucht moderne Browser " +
          "(Chrome ≥ 113, Firefox ≥ 130, Safari ≥ 17). Kein Polyfill.",
      );
    }
    return c.subtle;
  }

  function probeDependencies() {
    var missing = [];
    if (!global.SbkimStorage) missing.push("SbkimStorage (Modul 01)");
    if (!global.SbkimSpore) missing.push("SbkimSpore (Modul 02)");
    if (missing.length > 0) {
      throw makeError(
        "HeterokaryoseDependenciesError",
        "Fehlende Modul-Abhängigkeiten: " + missing.join(", ") + ". " +
          "Lade 01_storage.js und 02_spore.js vor 06_heterokaryose.js.",
      );
    }
  }

  function getStorage() { return global.SbkimStorage; }
  function getSpore() { return global.SbkimSpore; }

  // ---- Bau 06.Y: Slot-Helfer ----
  //
  // Modul 06 lebt nach Bau 06.Y in identitäts-spezifischen Stores. Die
  // Closure-Helper bauen den vollen Namen aus Basis + Slot.
  // `ensureSlotStores` legt die zwei Modul-06-Schreib-Stores
  // (sbkim_hetero_inbox_<slot>, sbkim_anastomosis_log_<slot>) defensiv
  // via Bau-01.Y `ensureStore` an (idempotent — wer schon da war, bleibt
  // da). Outbox + Siblings sind Lese-Stores (Schreiber Modul 08 bzw.
  // Modul 05); deren ensure-Pflicht liegt beim Schreiber.

  function siblingsStoreName(slotKey) {
    return SIBLINGS_STORE_BASE + "_" + slotKey;
  }

  function anastomosisLogStoreName(slotKey) {
    return LOG_STORE_BASE + "_" + slotKey;
  }

  function heteroInboxStoreName(slotKey) {
    return INBOX_STORE_BASE + "_" + slotKey;
  }

  function heteroOutboxStoreName(slotKey) {
    return OUTBOX_STORE_BASE + "_" + slotKey;
  }

  async function ensureSlotStores(slotKey) {
    var storage = getStorage();
    await storage.ensureStore(heteroInboxStoreName(slotKey));
    await storage.ensureStore(anastomosisLogStoreName(slotKey));
  }

  // ---- base64url ohne Padding (RFC 4648 §5, dupliziert aus Modul 02/05/07) ----

  function base64urlEncode(bytes) {
    var bin = "";
    var view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (var i = 0; i < view.length; i++) bin += String.fromCharCode(view[i]);
    var b64 = (global.btoa || btoa)(bin);
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function base64urlDecode(str) {
    var pad = str.length % 4 === 0 ? "" : "====".slice(str.length % 4);
    var b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
    var bin = (global.atob || atob)(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function utf8Encode(str) {
    return new TextEncoder().encode(str);
  }

  // Recursive lexicographic key sort. Returns a new object, never mutates.
  function canonicalize(value) {
    if (value === null) return null;
    if (Array.isArray(value)) return value.map(canonicalize);
    if (typeof value === "object") {
      var keys = Object.keys(value).sort();
      var out = {};
      for (var i = 0; i < keys.length; i++) out[keys[i]] = canonicalize(value[keys[i]]);
      return out;
    }
    return value;
  }

  function canonicalJsonBytesWithoutSignature(envelopeLike) {
    var unsigned = {};
    var keys = Object.keys(envelopeLike);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] === "signature") continue;
      unsigned[keys[i]] = envelopeLike[keys[i]];
    }
    return utf8Encode(JSON.stringify(canonicalize(unsigned)));
  }

  // ---- Sign / Verify auf Envelope-Ebene ----

  async function signEnvelope(unsigned, privateKey) {
    var bytes = utf8Encode(JSON.stringify(canonicalize(unsigned)));
    var sigBuf = await getSubtle().sign({ name: "Ed25519" }, privateKey, bytes);
    return base64urlEncode(sigBuf);
  }

  async function verifyEnvelope(envelope, publicKeyJwk) {
    if (!envelope || typeof envelope.signature !== "string") return false;
    var subtle = getSubtle();
    var pub;
    try {
      pub = await subtle.importKey("jwk", publicKeyJwk, { name: "Ed25519" }, true, ["verify"]);
    } catch (err) {
      return false;
    }
    var sigBytes;
    try {
      sigBytes = base64urlDecode(envelope.signature);
    } catch (err) {
      return false;
    }
    var bytes = canonicalJsonBytesWithoutSignature(envelope);
    try {
      return await subtle.verify({ name: "Ed25519" }, pub, sigBytes, bytes);
    } catch (err) {
      return false;
    }
  }

  // ---- Helfer ----

  function randomBytesB64(n) {
    var c = global.crypto || (typeof crypto !== "undefined" ? crypto : null);
    if (!c || !c.getRandomValues) {
      throw makeError("HeterokaryoseDependenciesError", "crypto.getRandomValues fehlt — Modul 06 braucht WebCrypto.");
    }
    var buf = new Uint8Array(n);
    c.getRandomValues(buf);
    return base64urlEncode(buf);
  }

  function majorVersion(v) {
    if (typeof v !== "string") return null;
    var dot = v.indexOf(".");
    return dot === -1 ? v : v.slice(0, dot);
  }

  function nowIso() { return new Date().toISOString(); }

  // Re-entry-friendly log key: ein Counter pro Millisekunde, damit zwei
  // schnell aufeinanderfolgende Log-Zeilen einander nicht überschreiben
  // (dieselbe Konvention wie Modul 05).
  var lastLogTs = "";
  var logSubCounter = 0;
  function nextLogKey() {
    var ts = nowIso();
    var key;
    if (ts === lastLogTs) {
      logSubCounter += 1;
      key = ts + "+" + logSubCounter;
    } else {
      lastLogTs = ts;
      logSubCounter = 0;
      key = ts;
    }
    return { key: key, ts: ts };
  }

  async function logEntry(peerId, outcome, slotKey) {
    // Bau 06.Y: schreibt slot-spezifisch in sbkim_anastomosis_log_<slot>.
    var sk = slotKey || activeSlotKey || DEFAULT_IDENTITY_KEY;
    try {
      var k = nextLogKey();
      await getStorage().put(anastomosisLogStoreName(sk), k.key, {
        ts: k.ts,
        peerId: peerId,
        outcome: outcome,
      });
    } catch (err) {
      // Log-Fehler dürfen den Pfad nicht abbrechen — Apoptose/Anastomose
      // protokollieren, aber stoßen den Hauptpfad nicht um.
      if (typeof console !== "undefined" && console.error) {
        console.error("MODUL 06 HETEROKARYOSE: Log-Schreibfehler (" + outcome + ", slot=" + sk + "):", err);
      }
    }
  }

  // ---- Modul-Zustand ----

  var ready = false;
  var bridgeRegistered = false;
  // Bau 06.Y: pro Slot ein cached CryptoKey (statt einem globalen).
  var ownPrivateKeyCacheBySlot = new Map();
  var receiverHttpStatusOverride = null;   // Test-Bridge für 404-Pfad
  // Bau 06.Y: aktiver Slot wird im init() einmal aus
  // `getActiveIdentityKey()` gecached. Operations cachen ihn nochmal
  // lokal (analog Bau 05.Y, Modul 05) — gegen Mid-Operation-Wechsel.
  var activeSlotKey = null;
  // Bau 06.Y: Receiver-Map nodeId → slotKey, im init() einmal aus
  // `listIdentities()` × `getOrCreateIdentity(slot)` aufgebaut.
  // Re-Init via Tab-Reload (Karte 06 § Receiver-Map-Schlank-Konvention).
  var receiverMap = new Map();

  // ---- init() ----

  async function init() {
    probeDependencies();
    getSubtle();
    await getStorage().init();
    await getSpore().init();
    // Bau 06.Y: aktive Identität sicherstellen — sonst kann Modul 06
    // später nicht signieren. Modul 02 ist beim ersten Aufruf lazy.
    await getSpore().getOrCreateIdentity();

    // Bau 06.Y: aktiven Slot cachen + slot-spezifische Stores anlegen.
    var spore = getSpore();
    activeSlotKey = await spore.getActiveIdentityKey();
    await ensureSlotStores(activeSlotKey);

    // Bau 06.Y: Receiver-Map nodeId → slotKey einmal aus
    // listIdentities × getOrCreateIdentity(slot) bauen. Re-Init via
    // Tab-Reload (Karte 06 § Receiver-Map-Schlank-Konvention).
    receiverMap = new Map();
    var slots = await spore.listIdentities();
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      var ident = await spore.getOrCreateIdentity(slot);
      receiverMap.set(ident.nodeId, slot);
    }

    setupServiceWorkerBridge();
    ready = true;
    // Spec: kein Selbst-Sweep, keine Pulsation, kein Auto-Pull beim
    // Skript-Laden. init() registriert nur den Listener und prüft
    // Abhängigkeiten.
  }

  async function ensureReady() {
    if (!ready) await init();
  }

  async function loadOwnPrivateKey(slotKey) {
    // Bau 06.Y: pro Slot ein cached CryptoKey. Sender ruft mit dem
    // aktiven Slot, Receiver mit dem aus der receiverMap getroffenen.
    var sk = slotKey || activeSlotKey || DEFAULT_IDENTITY_KEY;
    if (ownPrivateKeyCacheBySlot.has(sk)) return ownPrivateKeyCacheBySlot.get(sk);
    var storage = getStorage();
    var stored = await storage.get(KEYS_STORE, sk);
    if (!stored || !stored.privateKey) {
      throw makeError(
        "NoIdentityError",
        "Keine Identität in sbkim_keys[\"" + sk + "\"] — getOrCreateIdentity('" + sk +
          "') wurde nicht ausgeführt.",
      );
    }
    var subtle = getSubtle();
    var priv;
    try {
      priv = await subtle.importKey("jwk", stored.privateKey, { name: "Ed25519" }, true, ["sign"]);
    } catch (err) {
      throw makeError(
        "HeterokaryoseDependenciesError",
        "Privatschlüssel nicht importierbar (slot=" + sk + "): " +
          (err && err.message ? err.message : err),
        err,
      );
    }
    ownPrivateKeyCacheBySlot.set(sk, priv);
    return priv;
  }

  // ---- Service-Worker-Brücke (Variante A: Page-Hosted via MessageChannel) ----

  function setupServiceWorkerBridge() {
    if (bridgeRegistered) return;
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
    try {
      navigator.serviceWorker.addEventListener("message", async function (event) {
        if (!event || !event.data || event.data.type !== "SBKIM_HETEROKARYOSIS_REQUEST") return;
        if (!event.ports || event.ports.length === 0) return;
        var port = event.ports[0];
        var response;
        try {
          response = await receiveHeterokaryosis(event.data.request);
        } catch (err) {
          // receiveHeterokaryosis wirft per Spec niemals. Verteidigt sicherheitshalber.
          response = { outcome: "rejected", reason: "Interner Fehler: " + (err && err.message ? err.message : err) };
        }
        try { port.postMessage(response); } catch (e2) { /* port already closed */ }
      });
      bridgeRegistered = true;
    } catch (err) {
      bridgeRegistered = false;
    }
  }

  // ---- fetch-Wrapper mit Test-Bridge-Hook ----

  async function doFetch(url, options) {
    if (receiverHttpStatusOverride !== null) {
      var statusOverride = receiverHttpStatusOverride;
      receiverHttpStatusOverride = null;
      return {
        ok: statusOverride >= 200 && statusOverride < 300,
        status: statusOverride,
        statusText: "Override Test-Status",
        async json() { return {}; },
      };
    }
    return await fetch(url, options);
  }

  // ---- Anker-Quelle (Outbox-Lese-Pfad, fail-soft auf Spore-Single-Anker) ----
  //
  // Pflege Bau 06.1: zuerst sbkim_hetero_outbox (Schreiber Modul 08,
  // Spec-Sitzung 08) lesen. Wenn der Store Einträge hat, absteigend nach
  // addedAt sortieren und bis zu HETERO_MAX_ANCHORS auf {label, vector}
  // mappen (addedAt ist outbox-intern und gehört nicht in die Anker-Form).
  // Wenn der Store leer ist, fehlt oder das Lesen wirft (z.B. ältere
  // PWA-DB-Version ohne v=3), fällt Modul 06 fail-soft auf den Spore-
  // Single-Anker-Fallback zurück.

  async function readOutboxAnchors(slotKey) {
    // Bau 06.Y: liest aus sbkim_hetero_outbox_<slot> (Schreiber Modul 08
    // nach Bau 08.Y). Fail-soft auf Spore-Single-Anker, wenn der Store
    // leer ist, fehlt oder das Lesen wirft (z.B. UnknownStoreError auf
    // einer alten PWA-DB-Version, oder ein noch-nicht-via-Bau-08.Y-
    // angelegter Slot).
    var sk = slotKey || activeSlotKey || DEFAULT_IDENTITY_KEY;
    var rows;
    try {
      rows = await getStorage().all(heteroOutboxStoreName(sk));
    } catch (err) {
      if (typeof console !== "undefined" && console.info) {
        console.info(
          "MODUL 06 HETEROKARYOSE: Outbox-Lese-Pfad fail-soft (slot=" + sk + ", " +
            (err && err.name ? err.name : "?") + ") — Fallback auf Spore-Single-Anker.",
        );
      }
      return null;
    }
    if (!Array.isArray(rows) || rows.length === 0) return null;
    var entries = [];
    for (var i = 0; i < rows.length; i++) {
      var v = rows[i] && rows[i].value;
      if (!v || typeof v.label !== "string" || !Array.isArray(v.vector)) continue;
      entries.push(v);
    }
    if (entries.length === 0) return null;
    entries.sort(function (a, b) {
      var ta = typeof a.addedAt === "string" ? a.addedAt : "";
      var tb = typeof b.addedAt === "string" ? b.addedAt : "";
      if (ta < tb) return 1;
      if (ta > tb) return -1;
      return 0;
    });
    var take = entries.length > HETERO_MAX_ANCHORS ? HETERO_MAX_ANCHORS : entries.length;
    var anchors = new Array(take);
    for (var j = 0; j < take; j++) {
      anchors[j] = { label: entries[j].label, vector: entries[j].vector.slice() };
    }
    return anchors;
  }

  async function readSporeFallbackAnchors(slotKey) {
    // Bau 06.Y: nutzt die Spore des aktiven/getroffenen Slots.
    var ownSpore = await getSpore().getOwnSpore(slotKey);
    if (!ownSpore) return [];
    if (!Array.isArray(ownSpore.domainVector) || ownSpore.domainVector.length === 0) {
      return [];
    }
    return [{ label: "(domain)", vector: ownSpore.domainVector.slice() }];
  }

  async function readOwnAnchors(slotKey) {
    var outbox = await readOutboxAnchors(slotKey);
    if (outbox !== null) return outbox;
    return await readSporeFallbackAnchors(slotKey);
  }

  // ---- requestHeterokaryosis() ----

  async function requestHeterokaryosis(peerNodeId) {
    await ensureReady();
    var storage = getStorage();
    var spore = getSpore();

    if (typeof peerNodeId !== "string" || peerNodeId.length === 0) {
      throw makeError(
        "UnknownSiblingError",
        "peerNodeId fehlt oder ist leer — bitte die nodeId eines bekannten Geschwisters angeben.",
      );
    }

    // Bau 06.Y: Operations-Slot zur Sender-Zeit cachen (gegen Mid-
    // Operation-Wechsel — Karte 02 § Risiken). Defensiv ensureStore.
    var opSlot = activeSlotKey || await spore.getActiveIdentityKey();
    await ensureSlotStores(opSlot);

    // 1. Sibling-Lookup (slot-spezifisch nach Bau 05.Y / 06.Y)
    var sibling = await storage.get(siblingsStoreName(opSlot), peerNodeId);
    if (!sibling) {
      throw makeError(
        "UnknownSiblingError",
        "Unbekannter Geschwister-Knoten: " + peerNodeId + ". Vorher anastomosieren (Modul 05).",
      );
    }

    // 2. Lokale Opt-In-Vorprüfung (fail-soft: Feld fehlt → false)
    if (sibling.heterokaryosisOptIn !== true) {
      await logEntry(peerNodeId, "hetero-opt-out-local", opSlot);
      return { outcome: "opt-out-local" };
    }

    // 3. Eigene Identität + Spore laden (Bau 06.Y: für den aktiven Slot)
    var ownSpore = await spore.getOwnSpore(opSlot);
    if (!ownSpore) {
      throw makeError(
        "HeterokaryoseDependenciesError",
        "Eigene Spore fehlt (slot=" + opSlot + ") — SbkimSpore.generateOwnSpore(meta) zuerst.",
      );
    }
    var privKey = await loadOwnPrivateKey(opSlot);
    var ident = await spore.getOrCreateIdentity(opSlot);
    var ownNodeId = ident.nodeId;

    // 4. HeterokaryosisRequest bauen + signieren
    var unsigned = {
      fromNodeId: ownNodeId,
      nonce: randomBytesB64(NONCE_BYTES),
      protocolVersion: PROTOCOL_VERSION,
      senderSpore: ownSpore,
      timestamp: nowIso(),
      toNodeId: peerNodeId,
    };
    var sig = await signEnvelope(unsigned, privKey);
    var request = canonicalize(Object.assign({}, unsigned, { signature: sig }));

    // 5. POST mit Abort-Timeout (oder Test-Bridge-Override)
    if (typeof sibling.endpoint !== "string" || sibling.endpoint.length === 0) {
      throw makeError(
        "HeterokaryoseNetworkError",
        "Geschwister-Eintrag hat kein endpoint-Feld — kann nicht pullen.",
      );
    }
    var url = String(sibling.endpoint).replace(/\/$/, "") + ENDPOINT_HETEROKARYOSIS;
    var controller = new AbortController();
    var timeoutId = setTimeout(function () { controller.abort(); }, QUERY_TIMEOUT_MS);
    var response;
    try {
      response = await doFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err && err.name === "AbortError") {
        await logEntry(peerNodeId, "hetero-timeout", opSlot);
        throw makeError(
          "HeterokaryoseTimeoutError",
          "Heterokaryose-POST > " + QUERY_TIMEOUT_MS + " ms abgebrochen: " + url,
          err,
        );
      }
      throw makeError(
        "HeterokaryoseNetworkError",
        "Netz-Fehler bei " + url + ": " + (err && err.message ? err.message : err),
        err,
      );
    }
    clearTimeout(timeoutId);

    // 5a. HTTP 404 → endpoint_unsupported (KEIN Throw)
    if (response.status === 404) {
      await logEntry(peerNodeId, "hetero-endpoint-unsupported", opSlot);
      return { outcome: "endpoint_unsupported" };
    }

    if (!response.ok) {
      throw makeError(
        "HeterokaryoseNetworkError",
        "HTTP " + response.status + " " + response.statusText + " bei " + url + ".",
      );
    }

    var responseJson;
    try {
      responseJson = await response.json();
    } catch (err) {
      throw makeError(
        "HeterokaryoseNetworkError",
        "Antwort kein gültiges JSON: " + (err && err.message ? err.message : err),
        err,
      );
    }

    return await consumeResponse(peerNodeId, responseJson, opSlot);
  }

  async function consumeResponse(peerNodeId, responseJson, opSlot) {
    if (!responseJson || typeof responseJson !== "object") {
      throw makeError("HeterokaryoseNetworkError", "Antwort ist kein Objekt.");
    }
    if (typeof responseJson.outcome !== "string") {
      throw makeError("HeterokaryoseNetworkError", "Antwort ohne outcome-Feld.");
    }

    var spore = getSpore();
    var verifyReceiver = await spore.verifyForeignSpore(responseJson.receiverSpore);
    if (!verifyReceiver.valid) {
      await logEntry(peerNodeId, "hetero-rejected", opSlot);
      throw makeError(
        "HeterokaryoseSignatureInvalidError",
        "receiverSpore ungültig: " + (verifyReceiver.reason || "?"),
      );
    }

    var sigOk = await verifyEnvelope(responseJson, responseJson.receiverSpore.publicKey);
    if (!sigOk) {
      await logEntry(peerNodeId, "hetero-rejected", opSlot);
      throw makeError(
        "HeterokaryoseSignatureInvalidError",
        "Response-Signatur gegen receiverSpore.publicKey ungültig.",
      );
    }

    if (responseJson.outcome === "shared") {
      var anchors = Array.isArray(responseJson.anchors) ? responseJson.anchors : [];
      var ts = typeof responseJson.timestamp === "string" ? responseJson.timestamp : nowIso();
      var receivedAt = nowIso();
      try {
        await getStorage().put(heteroInboxStoreName(opSlot), peerNodeId + "|" + ts, {
          peerNodeId: peerNodeId,
          ts: ts,
          anchors: anchors,
          signature: responseJson.signature,
          receivedAt: receivedAt,
        });
      } catch (storageErr) {
        if (typeof console !== "undefined" && console.error) {
          console.error("MODUL 06 HETEROKARYOSE: Inbox-Schreibfehler (slot=" + opSlot + "):", storageErr);
        }
        throw makeError(
          "HeterokaryoseNetworkError",
          "Inbox-Schreibfehler: " + (storageErr && storageErr.message ? storageErr.message : storageErr),
          storageErr,
        );
      }
      await logEntry(peerNodeId, "hetero-pulled", opSlot);
      return {
        outcome: "shared",
        anchorCount: anchors.length,
        peerNodeId: peerNodeId,
        ts: ts,
      };
    }

    if (responseJson.outcome === "opt-out") {
      await logEntry(peerNodeId, "hetero-opt-out", opSlot);
      return { outcome: "opt-out" };
    }

    // outcome:"rejected" oder unbekannt → als rejected behandeln
    await logEntry(peerNodeId, "hetero-rejected", opSlot);
    return {
      outcome: "rejected",
      reason: typeof responseJson.reason === "string" ? responseJson.reason : "(kein Grund mitgeschickt)",
    };
  }

  // ---- receiveHeterokaryosis() — wirft NIEMALS ----

  async function receiveHeterokaryosis(incomingRequest) {
    try {
      await ensureReady();
      var spore = getSpore();
      var storage = getStorage();

      // 1. Form-Check
      var missing = checkRequestFields(incomingRequest);
      if (missing) {
        return await buildResponse({ outcome: "rejected", reason: "Form ungültig: " + missing }, incomingRequest);
      }

      // 2. Sender-Spore
      var verifySender = await spore.verifyForeignSpore(incomingRequest.senderSpore);
      if (!verifySender.valid) {
        return await buildResponse(
          { outcome: "rejected", reason: verifySender.reason || "senderSpore ungültig" },
          incomingRequest,
        );
      }

      // 3. Hauptversion
      if (majorVersion(incomingRequest.protocolVersion) !== majorVersion(PROTOCOL_VERSION)) {
        return await buildResponse(
          { outcome: "rejected", reason: "Inkompatible Hauptversion: " + incomingRequest.protocolVersion },
          incomingRequest,
        );
      }

      // 4. Request-Signatur
      var sigOk = await verifyEnvelope(incomingRequest, incomingRequest.senderSpore.publicKey);
      if (!sigOk) {
        return await buildResponse(
          { outcome: "rejected", reason: "Request-Signatur ungültig" },
          incomingRequest,
        );
      }

      // 5. Bau 06.Y: Receiver-Map-Lookup für toNodeId.
      //    HeterokaryosisRequest verlangt toNodeId (REQUEST_REQUIRED_FIELDS).
      //    - toNodeId in der Map → targetSlot ist die getroffene Persona.
      //    - toNodeId nicht in der Map → rejected, KEIN Storage-Eingriff.
      var targetSlot = receiverMap.get(incomingRequest.toNodeId);
      if (targetSlot === undefined) {
        return await buildResponse(
          { outcome: "rejected", reason: "toNodeId stimmt nicht zum Empfänger" },
          incomingRequest,
        );
      }

      // Bau 06.Y: ab hier alles im Kontext des targetSlot.
      await ensureSlotStores(targetSlot);

      // 6. Sibling-Filter (Sender muss in unserer sbkim_siblings_<targetSlot>
      //    stehen — Bau 05.Y + 06.Y: slot-spezifischer Sibling-Lookup).
      var senderId = incomingRequest.senderSpore.id;
      var siblingEntry;
      try {
        siblingEntry = await storage.get(siblingsStoreName(targetSlot), senderId);
      } catch (storageErr) {
        if (typeof console !== "undefined" && console.error) {
          console.error("MODUL 06 HETEROKARYOSE: Sibling-Lookup-Fehler (slot=" + targetSlot + "):", storageErr);
        }
        return await buildResponse(
          { outcome: "rejected", reason: "interner Speicherfehler" },
          incomingRequest,
          targetSlot,
        );
      }
      if (!siblingEntry) {
        return await buildResponse(
          { outcome: "rejected", reason: "Sender ist kein Geschwister" },
          incomingRequest,
          targetSlot,
        );
      }

      // 7. Opt-In-Filter (fail-soft, fehlend → false)
      if (siblingEntry.heterokaryosisOptIn !== true) {
        await logEntry(senderId, "hetero-opt-out", targetSlot);
        return await buildResponse({ outcome: "opt-out" }, incomingRequest, targetSlot);
      }

      // 8. Anker-Quelle lesen (slot-spezifisch nach Bau 06.Y + 08.Y),
      //    max. HETERO_MAX_ANCHORS, Response bauen mit getroffener Persona.
      var anchors;
      try {
        anchors = await readOwnAnchors(targetSlot);
      } catch (err) {
        if (typeof console !== "undefined" && console.error) {
          console.error("MODUL 06 HETEROKARYOSE: Anker-Quelle-Fehler (slot=" + targetSlot + "):", err);
        }
        anchors = [];
      }
      if (anchors.length > HETERO_MAX_ANCHORS) {
        anchors = anchors.slice(0, HETERO_MAX_ANCHORS);
      }
      await logEntry(senderId, "hetero-served", targetSlot);
      return await buildResponse(
        { outcome: "shared", anchors: anchors },
        incomingRequest,
        targetSlot,
      );
    } catch (err) {
      // Spec: receiveHeterokaryosis wirft niemals. Wenn doch (z.B. Build-
      // Response scheitert), schicken wir eine unsignierte Notbremse —
      // der Sender wird die unsignierte Variante über verifyEnvelope
      // ablehnen, was richtig ist (bei totalem Empfänger-Ausfall darf
      // nichts „valide" antworten).
      try {
        return await buildResponse(
          { outcome: "rejected", reason: "Interner Fehler: " + (err && err.message ? err.message : err) },
          incomingRequest || {},
        );
      } catch (err2) {
        return {
          fromNodeId: "",
          nonceEcho: (incomingRequest && typeof incomingRequest.nonce === "string") ? incomingRequest.nonce : "",
          outcome: "rejected",
          protocolVersion: PROTOCOL_VERSION,
          reason: "Interner Fehler ohne Signatur: " + (err2 && err2.message ? err2.message : err2),
          timestamp: nowIso(),
          toNodeId: (incomingRequest && typeof incomingRequest.fromNodeId === "string") ? incomingRequest.fromNodeId : "",
        };
      }
    }
  }

  function checkRequestFields(req) {
    if (!req || typeof req !== "object") return "Request ist kein Objekt";
    for (var i = 0; i < REQUEST_REQUIRED_FIELDS.length; i++) {
      var f = REQUEST_REQUIRED_FIELDS[i];
      if (req[f] === undefined || req[f] === null) return "Pflichtfeld fehlt: " + f;
    }
    if (typeof req.senderSpore !== "object") return "senderSpore kein Objekt";
    return null;
  }

  async function buildResponse(extra, incomingRequest, slotKey) {
    var spore = getSpore();
    // Bau 06.Y: ohne slot-Argument fällt buildResponse auf den aktiven
    // Slot zurück (Pre-Receiver-Map-Pfad, z.B. malformede Requests).
    // Mit Argument signiert die Antwort mit der GETROFFENEN Persona —
    // Brief 04 § 9.4.
    var sk = slotKey || activeSlotKey || DEFAULT_IDENTITY_KEY;
    var ownSpore = await spore.getOwnSpore(sk);
    if (!ownSpore) {
      throw makeError(
        "HeterokaryoseDependenciesError",
        "Eigene Spore fehlt (slot=" + sk + ") — HeterokaryosisResponse kann nicht signiert werden.",
      );
    }
    var privKey = await loadOwnPrivateKey(sk);
    var ident = await spore.getOrCreateIdentity(sk);
    var ownNodeId = ident.nodeId;

    var unsigned = {
      fromNodeId: ownNodeId,
      nonceEcho: (incomingRequest && typeof incomingRequest.nonce === "string") ? incomingRequest.nonce : "",
      outcome: extra.outcome,
      protocolVersion: PROTOCOL_VERSION,
      receiverSpore: ownSpore,
      timestamp: nowIso(),
      toNodeId: (incomingRequest && typeof incomingRequest.fromNodeId === "string") ? incomingRequest.fromNodeId : "",
    };
    if (extra.reason !== undefined) unsigned.reason = extra.reason;
    if (extra.anchors !== undefined) unsigned.anchors = extra.anchors;

    var sig = await signEnvelope(unsigned, privKey);
    return canonicalize(Object.assign({}, unsigned, { signature: sig }));
  }

  // ---- listHeterokaryosis() ----

  async function listHeterokaryosis() {
    // Bau 06.Y: liest aus dem Inbox-Slot der AKTIVEN Identität.
    // Persona-übergreifende Sicht ist Aufrufer-Pflicht.
    await ensureReady();
    var rows = await getStorage().all(heteroInboxStoreName(activeSlotKey));
    return rows.map(function (r) {
      return {
        peerNodeId: r.value.peerNodeId,
        ts: r.value.ts,
        anchorCount: Array.isArray(r.value.anchors) ? r.value.anchors.length : 0,
        receivedAt: r.value.receivedAt,
      };
    });
  }

  // ---- forgetHeterokaryosis(peerNodeId, ts) ----

  async function forgetHeterokaryosis(peerNodeId, ts) {
    if (typeof peerNodeId !== "string" || peerNodeId.length === 0) {
      throw makeError(
        "HeterokaryoseDependenciesError",
        "forgetHeterokaryosis: peerNodeId fehlt oder ist leer.",
      );
    }
    if (typeof ts !== "string" || ts.length === 0) {
      throw makeError(
        "HeterokaryoseDependenciesError",
        "forgetHeterokaryosis: ts fehlt oder ist leer.",
      );
    }
    // Bau 06.Y: löscht aus dem Inbox-Slot der AKTIVEN Identität.
    await ensureReady();
    // Idempotent: del wirft nicht, wenn der Schlüssel fehlt (Modul 01-Vertrag).
    await getStorage().del(heteroInboxStoreName(activeSlotKey), peerNodeId + "|" + ts);
  }

  // ---- Test-Brücken (Unterstrich-Präfix, inoffiziell) ----

  // Baut einen signierten HeterokaryosisRequest mit der lokalen Identität.
  // toNodeId muss extern übergeben werden (in Panel 06 typischerweise die
  // eigene nodeId, weil Singleton ≈ Selbst-Sender).
  async function _buildSignedHeterokaryosisRequest(toNodeId) {
    await ensureReady();
    if (typeof toNodeId !== "string" || toNodeId.length === 0) {
      throw makeError("HeterokaryoseDependenciesError", "toNodeId fehlt.");
    }
    // Bau 06.Y: Test-Brücke signiert mit der aktiven Identität.
    var spore = getSpore();
    var opSlot = activeSlotKey || await spore.getActiveIdentityKey();
    var ownSpore = await spore.getOwnSpore(opSlot);
    if (!ownSpore) {
      throw makeError("HeterokaryoseDependenciesError",
        "Eigene Spore fehlt (slot=" + opSlot + ") — generateOwnSpore(meta) zuerst.");
    }
    var ident = await spore.getOrCreateIdentity(opSlot);
    var ownNodeId = ident.nodeId;
    var privKey = await loadOwnPrivateKey(opSlot);
    var unsigned = {
      fromNodeId: ownNodeId,
      nonce: randomBytesB64(NONCE_BYTES),
      protocolVersion: PROTOCOL_VERSION,
      senderSpore: ownSpore,
      timestamp: nowIso(),
      toNodeId: toNodeId,
    };
    var sig = await signEnvelope(unsigned, privKey);
    return canonicalize(Object.assign({}, unsigned, { signature: sig }));
  }

  async function _verifyResponseSignature(response, receiverPublicKeyJwk) {
    return await verifyEnvelope(response, receiverPublicKeyJwk);
  }

  // Pseudo-Sibling-Pattern für Panel 06: schreibt direkt in sbkim_siblings,
  // damit Storage-basierte Lookups in request/receive den Eintrag finden.
  // Anders als Modul 07's _addPseudoSibling (in-memory-Versand-Override),
  // weil Modul 06 ausschließlich Storage liest.
  var pseudoSiblingIds = [];

  async function _addPseudoSibling(sib) {
    if (!sib || typeof sib.nodeId !== "string" || typeof sib.endpoint !== "string") {
      throw makeError(
        "HeterokaryoseDependenciesError",
        "_addPseudoSibling erwartet {nodeId, domain, endpoint, pubKey, since, heterokaryosisOptIn}.",
      );
    }
    await ensureReady();
    var entry = {
      nodeId: sib.nodeId,
      domain: sib.domain || "",
      endpoint: sib.endpoint,
      pubKey: sib.pubKey || null,
      since: sib.since || nowIso(),
    };
    if (sib.heterokaryosisOptIn === true) {
      entry.heterokaryosisOptIn = true;
    } else if (sib.heterokaryosisOptIn === false) {
      entry.heterokaryosisOptIn = false;
    }
    // Bau 06.Y: Pseudo-Sibling landet im sbkim_siblings_<activeSlot>-
    // Store (Modul 05 alleiniger Schreiber nach Bau 05.Y; hier nutzen
    // wir denselben Store-Namen über ensureStore defensiv).
    var sk = activeSlotKey || DEFAULT_IDENTITY_KEY;
    await getStorage().ensureStore(siblingsStoreName(sk));
    await getStorage().put(siblingsStoreName(sk), sib.nodeId, entry);
    if (pseudoSiblingIds.indexOf(sib.nodeId) === -1) {
      pseudoSiblingIds.push(sib.nodeId);
    }
  }

  async function _clearPseudoSiblings() {
    await ensureReady();
    var storage = getStorage();
    var sk = activeSlotKey || DEFAULT_IDENTITY_KEY;
    for (var i = 0; i < pseudoSiblingIds.length; i++) {
      try { await storage.del(siblingsStoreName(sk), pseudoSiblingIds[i]); } catch (e) { /* nb */ }
    }
    pseudoSiblingIds = [];
  }

  function _setReceiverHttpStatus(status) {
    if (status === null || status === undefined) {
      receiverHttpStatusOverride = null;
      return;
    }
    if (typeof status !== "number" || !isFinite(status)) {
      throw makeError(
        "HeterokaryoseDependenciesError",
        "_setReceiverHttpStatus erwartet eine Zahl oder null.",
      );
    }
    receiverHttpStatusOverride = status;
  }

  // ---- public surface ----

  var SbkimHeterokaryose = {
    init: init,
    requestHeterokaryosis: requestHeterokaryosis,
    receiveHeterokaryosis: receiveHeterokaryosis,
    listHeterokaryosis: listHeterokaryosis,
    forgetHeterokaryosis: forgetHeterokaryosis,

    // Test-Brücken
    _invokeReceiveHeterokaryosisDirect: receiveHeterokaryosis,
    _buildSignedHeterokaryosisRequest: _buildSignedHeterokaryosisRequest,
    _verifyResponseSignature: _verifyResponseSignature,
    _addPseudoSibling: _addPseudoSibling,
    _clearPseudoSiblings: _clearPseudoSiblings,
    _setReceiverHttpStatus: _setReceiverHttpStatus,
    _canonicalize: canonicalize,
    _base64urlEncode: base64urlEncode,
    _base64urlDecode: base64urlDecode,
    _signEnvelope: signEnvelope,
    _verifyEnvelope: verifyEnvelope,

    _meta: {
      protocolVersion: PROTOCOL_VERSION,
      queryTimeoutMs: QUERY_TIMEOUT_MS,
      heteroMaxAnchors: HETERO_MAX_ANCHORS,
      endpointHeterokaryosis: ENDPOINT_HETEROKARYOSIS,
      // Bau 06.Y: Stores leben slot-suffixed. Die Basis-Namen
      // bleiben als Read-Anker, der Live-Zustand kommt aus den
      // Gettern unten.
      inboxStoreBase: INBOX_STORE_BASE,
      outboxStoreBase: OUTBOX_STORE_BASE,
      siblingsStoreBase: SIBLINGS_STORE_BASE,
      logStoreBase: LOG_STORE_BASE,
      get activeSlotKey() { return activeSlotKey; },
      get receiverMapSize() { return receiverMap ? receiverMap.size : 0; },
      requestRequiredFields: REQUEST_REQUIRED_FIELDS.slice(),
    },
  };

  global.SbkimHeterokaryose = SbkimHeterokaryose;

  // Self-check: synchronous on script load. Format uniform across SBKIM —
  // see INTERFACES.md §1 Modul 06.
  if (typeof console !== "undefined" && console.info) {
    console.info(
      "MODUL 06 HETEROKARYOSE bereit, Funktionen: " +
        "init/requestHeterokaryosis/receiveHeterokaryosis/listHeterokaryosis/forgetHeterokaryosis",
    );
  }
})(typeof window !== "undefined" ? window : globalThis);
