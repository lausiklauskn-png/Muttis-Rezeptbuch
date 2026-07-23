/*
 * SBKIM — Modul 08 — UI-Demo
 *
 * Endknoten-Andocker-UI für die zwei Stellen, die Modul 06 (Heterokaryose)
 * braucht, aber selbst nicht füllt: `sbkim_hetero_outbox_<activeSlotKey>`
 * (Anker-Vorrat, Schreiber Modul 08, Leser Modul 06) und
 * `sbkim_siblings_<activeSlotKey>[peerNodeId].heterokaryosisOptIn`
 * (Co-Schreiber neben Modul 05 — Modul 08 darf nur das eine additive
 * Feld setzen).
 *
 * Modul 08 ist NICHT protokoll-aktiv: kein Netz, kein Embedding, keine
 * Signatur, keine Spore-Erzeugung, kein Heterokaryose-Pull. Vektor-
 * Erzeugung ist Aufrufer-Pflicht (typisch SbkimEmbedding.embedPassage
 * im Endknoten-Code, bevor addOutboxAnchor gerufen wird).
 *
 * Public surface (registered on window.SbkimUiDemo):
 *   init(options?)                                     -> Promise<void>
 *   listOutbox()                                       -> Promise<Array<{label, addedAt}>>
 *   addOutboxAnchor(label, vector)                     -> Promise<void>
 *   removeOutboxAnchor(label)                          -> Promise<void>
 *   setSiblingHeteroOptIn(peerNodeId, optIn)           -> Promise<void>
 *
 * Inoffiziell (Unterstrich-Präfix, nur für tests/manual_check.html):
 *   _clearOutbox()              -> leert sbkim_hetero_outbox_<activeSlotKey>
 *                                  via SbkimStorage.clear, idempotent
 *   _addPseudoSibling(sib)      -> direkter SbkimStorage.put auf
 *                                  sbkim_siblings_<activeSlotKey>
 *                                  (Vorbereitung für setSiblingHeteroOptIn-Tests).
 *                                  Schreibt KEIN heterokaryosisOptIn — das Feld
 *                                  setzt Modul 08 selbst.
 *   _clearPseudoSiblings()      -> leert sbkim_siblings_<activeSlotKey> via
 *                                  SbkimStorage.clear, idempotent.
 *
 * Self-check: emits a console.info line on script load (synchronous,
 * before any call). See INTERFACES.md §1 Modul 08 und
 * docs/components/08_ui_demo.md für den verbindlichen Vertrag.
 *
 * Sechs benannte Error-Klassen (exportiert auf window.SbkimUiDemo.*):
 *   UiDemoDependenciesError, InvalidAnchorLabelError,
 *   InvalidAnchorVectorError, OutboxFullError, UnknownSiblingError,
 *   InvalidOptInArgError
 *
 * `UnknownSiblingError` trägt denselben Namen wie in Modul 06 — Spec-
 * Wille; Bedeutung identisch (peerNodeId nicht in sbkim_siblings_<key>).
 * Modul-Zugehörigkeit über window.SbkimUiDemo vs.
 * window.SbkimHeterokaryose erkennbar.
 *
 * Bau 08.Y slot-spezifische Outbox (2026-05-20): Modul 08 schreibt
 * jetzt in `sbkim_hetero_outbox_<activeSlotKey>` und liest/schreibt
 * `sbkim_siblings_<activeSlotKey>`. `activeSlotKey` wird im `init()`
 * via `SbkimSpore.getActiveIdentityKey()` gecached (Default „main" als
 * Rückwärts-Kompat zum Singleton-Vertrag). Vor jedem ersten Schreib-
 * vorgang ruft Modul 08 `SbkimStorage.ensureStore` für die zwei slot-
 * suffixed Stores (idempotent via Bau 01.Y). Modul 08 ist storage-only
 * und braucht KEIN Receiver-Map — kein Netz-Empfang, kein
 * `_per_identity_op`-Pattern. Persona-übergreifende Pflege (OptIn-Flag
 * setzen für Sibling aus anderer Persona) ist Aufrufer-Pflicht via
 * `SbkimSpore.setActiveIdentity` + Re-Init (Tab-Reload).
 */
(function (global) {
  "use strict";

  // ---- Konstanten (gespiegelt aus INTERFACES.md §0 + Karte 08 § Konfigurationswerte) ----

  var EMBEDDING_DIM = 384;
  var HETERO_OUTBOX_MAX_ENTRIES = 5;
  var OUTBOX_LABEL_MAX_LEN = 64;

  var OUTBOX_STORE_BASE = "sbkim_hetero_outbox";
  var SIBLINGS_STORE_BASE = "sbkim_siblings";
  var DEFAULT_IDENTITY_KEY = "main";

  // ---- Fehler-Erzeugung ----
  //
  // Sechs benannte Error-Klassen (factory-Stil wie Modul 00). Jede ist
  // eine Funktion, die ein Error-Objekt mit gesetztem `.name` liefert —
  // damit reicht ein einfaches `throw UiDemoDependenciesError("msg")`
  // oder die Brücke `makeError(name, msg)` für interne Pfade. Exportiert
  // auf window.SbkimUiDemo.<Error> (Karte 08 § Fehlertabelle).

  function makeError(name, message, cause) {
    var e = new Error(message);
    e.name = name;
    if (cause !== undefined) e.cause = cause;
    return e;
  }

  function UiDemoDependenciesError(message) { return makeError("UiDemoDependenciesError", message); }
  function InvalidAnchorLabelError(message) { return makeError("InvalidAnchorLabelError", message); }
  function InvalidAnchorVectorError(message) { return makeError("InvalidAnchorVectorError", message); }
  function OutboxFullError(message) { return makeError("OutboxFullError", message); }
  function UnknownSiblingError(message) { return makeError("UnknownSiblingError", message); }
  function InvalidOptInArgError(message) { return makeError("InvalidOptInArgError", message); }

  // ---- Dependency-Probes ----

  function probeDependencies() {
    var missing = [];
    if (!global.SbkimStorage) missing.push("SbkimStorage (Modul 01)");
    if (!global.SbkimSpore) missing.push("SbkimSpore (Modul 02)");
    if (missing.length > 0) {
      throw makeError(
        "UiDemoDependenciesError",
        "Fehlende Modul-Abhängigkeiten: " + missing.join(", ") + ". " +
          "Lade 01_storage.js und 02_spore.js vor 08_ui_demo.js (Bau 08.Y " +
          "slot-spezifische Outbox braucht SbkimSpore.getActiveIdentityKey).",
      );
    }
  }

  function getStorage() { return global.SbkimStorage; }
  function getSpore() { return global.SbkimSpore; }

  function nowIso() { return new Date().toISOString(); }

  // ---- Bau 08.Y: slot-spezifische Store-Namen ----
  //
  // Pre-Brief-04-Aufrufer treffen unverändert auf `_main`-Slots
  // (DEFAULT_IDENTITY_KEY = "main", verankert via
  // SbkimSpore.getActiveIdentityKey-Default). Mehrfach-Personae nutzen
  // ihren eigenen activeSlotKey.

  function heteroOutboxStoreName(slot) {
    return OUTBOX_STORE_BASE + "_" + slot;
  }

  function siblingsStoreName(slot) {
    return SIBLINGS_STORE_BASE + "_" + slot;
  }

  // ensureSlotStores: ruft SbkimStorage.ensureStore für die zwei
  // slot-spezifischen Stores, die Modul 08 berührt. Idempotent dank
  // Bau 01.Y's ensureStore-Garantie. Wird vor jedem ersten
  // Schreibvorgang in einen Slot gerufen — Modul 02's
  // ensureIdentityStores deckt den Pfad bei getOrCreateIdentity bereits
  // ab; Modul 08's eigener Aufruf ist defensiv und idempotent, um
  // Sichttest-Pfade abzusichern (Backup-Re-Import, Tab-Race etc.).
  async function ensureSlotStores(slot) {
    var storage = getStorage();
    if (typeof storage.ensureStore !== "function") {
      throw makeError(
        "UiDemoDependenciesError",
        "SbkimStorage.ensureStore fehlt — Bau 01.Y nicht eingespielt. " +
          "Modul 08 (Bau 08.Y slot-spezifische Outbox) braucht den dynamischen " +
          "Store-Pfad aus Modul 01.",
      );
    }
    await storage.ensureStore(heteroOutboxStoreName(slot));
    await storage.ensureStore(siblingsStoreName(slot));
  }

  // ---- Modul-Zustand ----

  var ready = false;
  var activeSlotKey = null;  // gecached vom init() via SbkimSpore.getActiveIdentityKey(); null vor init.
  var configuredOptions = {
    labelMaxLen: OUTBOX_LABEL_MAX_LEN,
    embeddingDim: EMBEDDING_DIM,
    maxEntries: HETERO_OUTBOX_MAX_ENTRIES,
  };

  // ---- init() ----

  async function init(options) {
    probeDependencies();
    if (options && typeof options === "object") {
      // Bau 08.Y: options.storeName ist obsolet (Slot-Pfad ist intern
      // via SbkimSpore.getActiveIdentityKey gesetzt) — wird stillschweigend
      // ignoriert, damit pre-Brief-04-Aufrufer nicht brechen.
      if (typeof options.labelMaxLen === "number" && options.labelMaxLen > 0) {
        configuredOptions.labelMaxLen = options.labelMaxLen;
      }
      if (typeof options.embeddingDim === "number" && options.embeddingDim > 0) {
        configuredOptions.embeddingDim = options.embeddingDim;
      }
      if (typeof options.maxEntries === "number" && options.maxEntries > 0) {
        configuredOptions.maxEntries = options.maxEntries;
      }
    }
    if (ready) return;
    await getStorage().init();
    await getSpore().init();
    activeSlotKey = await getSpore().getActiveIdentityKey();
    if (typeof activeSlotKey !== "string" || activeSlotKey.length === 0) {
      activeSlotKey = DEFAULT_IDENTITY_KEY;
    }
    await ensureSlotStores(activeSlotKey);
    ready = true;
    // Spec: kein DOM-Mount, keine Listener-Registrierung — Modul 08 ist
    // eine reine API-Schicht. DOM-Pflege liegt beim Endknoten.
  }

  async function ensureReady() {
    if (!ready) await init();
  }

  // ---- listOutbox() ----

  async function listOutbox() {
    await ensureReady();
    var rows = await getStorage().all(heteroOutboxStoreName(activeSlotKey));
    if (!Array.isArray(rows) || rows.length === 0) return [];
    var entries = [];
    for (var i = 0; i < rows.length; i++) {
      var v = rows[i] && rows[i].value;
      if (!v || typeof v.label !== "string") continue;
      entries.push({ label: v.label, addedAt: typeof v.addedAt === "string" ? v.addedAt : "" });
    }
    // Absteigend nach addedAt (neueste zuerst) — konsistent mit Modul 06's
    // Outbox-Lese-Pfad (Pflege Bau 06.1).
    entries.sort(function (a, b) {
      if (a.addedAt < b.addedAt) return 1;
      if (a.addedAt > b.addedAt) return -1;
      return 0;
    });
    return entries;
  }

  // ---- addOutboxAnchor(label, vector) ----

  function validateLabel(label) {
    if (typeof label !== "string" || label.length === 0) {
      throw makeError(
        "InvalidAnchorLabelError",
        "label muss ein nicht-leerer String sein.",
      );
    }
    if (label.length > configuredOptions.labelMaxLen) {
      throw makeError(
        "InvalidAnchorLabelError",
        "label überschreitet OUTBOX_LABEL_MAX_LEN = " + configuredOptions.labelMaxLen +
          " Zeichen (label.length=" + label.length + ").",
      );
    }
  }

  function validateVector(vector) {
    if (!Array.isArray(vector)) {
      throw makeError(
        "InvalidAnchorVectorError",
        "vector muss ein Array sein.",
      );
    }
    if (vector.length !== configuredOptions.embeddingDim) {
      throw makeError(
        "InvalidAnchorVectorError",
        "vector.length muss EMBEDDING_DIM = " + configuredOptions.embeddingDim +
          " sein (erhalten: " + vector.length + ").",
      );
    }
    for (var i = 0; i < vector.length; i++) {
      if (!Number.isFinite(vector[i])) {
        throw makeError(
          "InvalidAnchorVectorError",
          "vector[" + i + "] ist nicht endlich (NaN / ±∞ / nicht-Zahl).",
        );
      }
    }
  }

  async function addOutboxAnchor(label, vector) {
    // Reihenfolge (Karte 08 § Manueller Test + Bauzustand Pflicht-
    // Entscheidung 1): sync-Checks zuerst (Label, Vektor), dann erst
    // der async-Voll-Check gegen den Store. So fliegt der Wurf vor
    // dem Schreib-Versuch.
    validateLabel(label);
    validateVector(vector);
    await ensureReady();
    // Bau 08.Y: defensiv ensureStore vor jedem ersten Schreibvorgang
    // (idempotent, Bau 01.Y) — schützt gegen Tab-Race oder Backup-
    // Re-Import-Pfade, in denen ensureSlotStores im init() noch nicht
    // den Soll-Stand erreicht hat.
    await ensureSlotStores(activeSlotKey);
    var storage = getStorage();
    var storeName = heteroOutboxStoreName(activeSlotKey);
    var existing = await storage.get(storeName, label);
    if (existing === undefined) {
      var rows = await storage.all(storeName);
      var count = Array.isArray(rows) ? rows.length : 0;
      if (count >= configuredOptions.maxEntries) {
        throw makeError(
          "OutboxFullError",
          storeName + " am Limit (" + configuredOptions.maxEntries +
            " Einträge pro Slot). Vor dem Anlegen eines NEUEN Labels einen alten Anker " +
            "mit removeOutboxAnchor(label) entfernen.",
        );
      }
    }
    var entry = {
      label: label,
      vector: vector.slice(),
      addedAt: nowIso(),
    };
    await storage.put(storeName, label, entry);
  }

  // ---- removeOutboxAnchor(label) — idempotent ----

  async function removeOutboxAnchor(label) {
    validateLabel(label);
    await ensureReady();
    // SbkimStorage.del ist idempotent (Modul 01-Vertrag) — kein Fehler,
    // wenn der Schlüssel fehlt.
    await getStorage().del(heteroOutboxStoreName(activeSlotKey), label);
  }

  // ---- setSiblingHeteroOptIn(peerNodeId, optIn) — Co-Schreiber ----

  async function setSiblingHeteroOptIn(peerNodeId, optIn) {
    if (typeof peerNodeId !== "string" || peerNodeId.length === 0) {
      throw makeError(
        "UnknownSiblingError",
        "peerNodeId muss ein nicht-leerer String sein.",
      );
    }
    if (optIn !== true && optIn !== false) {
      throw makeError(
        "InvalidOptInArgError",
        "optIn muss strikt boolean sein (true oder false — kein truthy/falsy-Cast).",
      );
    }
    await ensureReady();
    // Bau 08.Y: defensiv ensureStore (idempotent) — gleiche Begründung
    // wie in addOutboxAnchor.
    await ensureSlotStores(activeSlotKey);
    var storage = getStorage();
    var storeName = siblingsStoreName(activeSlotKey);
    var sibling = await storage.get(storeName, peerNodeId);
    if (!sibling) {
      throw makeError(
        "UnknownSiblingError",
        "Unbekanntes Geschwister: " + peerNodeId + " (Slot " + activeSlotKey + "). " +
          "Modul 08 legt KEINEN Sibling-Eintrag an — vorher anastomosieren (Modul 05).",
      );
    }
    // Co-Schreiber-Disziplin: alle bestehenden Felder bleiben unverändert,
    // nur heterokaryosisOptIn wird gesetzt (Karte 01 § Schema-Hinweise +
    // INTERFACES.md §1 Modul 08 Storage-Block).
    var updated = Object.assign({}, sibling, { heterokaryosisOptIn: optIn });
    await storage.put(storeName, peerNodeId, updated);
  }

  // ---- Test-Brücken (Unterstrich-Präfix, inoffiziell) ----

  // Bau 08.Y: leert sbkim_hetero_outbox_<activeSlotKey> via
  // SbkimStorage.clear. Idempotent — falls der Store schon leer ist,
  // passiert nichts.
  async function _clearOutbox() {
    await ensureReady();
    await getStorage().clear(heteroOutboxStoreName(activeSlotKey));
  }

  // Pseudo-Sibling-Tracking analog Modul 06: schreibt direkt in
  // sbkim_siblings_<activeSlotKey>, damit setSiblingHeteroOptIn einen
  // Eintrag findet. Schreibt KEIN heterokaryosisOptIn-Flag — das Feld
  // setzt Modul 08 selbst (Co-Schreiber-Konvention).
  async function _addPseudoSibling(sib) {
    if (!sib || typeof sib.nodeId !== "string") {
      throw makeError(
        "UiDemoDependenciesError",
        "_addPseudoSibling erwartet {nodeId, domain, endpoint, pubKey, since}.",
      );
    }
    await ensureReady();
    var entry = {
      nodeId: sib.nodeId,
      domain: typeof sib.domain === "string" ? sib.domain : "",
      endpoint: typeof sib.endpoint === "string" ? sib.endpoint : "",
      pubKey: sib.pubKey === undefined ? null : sib.pubKey,
      since: typeof sib.since === "string" ? sib.since : nowIso(),
    };
    await getStorage().put(siblingsStoreName(activeSlotKey), sib.nodeId, entry);
  }

  async function _clearPseudoSiblings() {
    await ensureReady();
    await getStorage().clear(siblingsStoreName(activeSlotKey));
  }

  // ---- public surface ----

  var SbkimUiDemo = {
    init: init,
    listOutbox: listOutbox,
    addOutboxAnchor: addOutboxAnchor,
    removeOutboxAnchor: removeOutboxAnchor,
    setSiblingHeteroOptIn: setSiblingHeteroOptIn,

    // Sechs benannte Error-Klassen (factory-Stil wie Modul 00) —
    // exportiert auf SbkimUiDemo.<Error> für err.name-Vergleiche.
    UiDemoDependenciesError: UiDemoDependenciesError,
    InvalidAnchorLabelError: InvalidAnchorLabelError,
    InvalidAnchorVectorError: InvalidAnchorVectorError,
    OutboxFullError: OutboxFullError,
    UnknownSiblingError: UnknownSiblingError,
    InvalidOptInArgError: InvalidOptInArgError,

    // Test-Brücken
    _clearOutbox: _clearOutbox,
    _addPseudoSibling: _addPseudoSibling,
    _clearPseudoSiblings: _clearPseudoSiblings,

    _meta: {
      embeddingDim: EMBEDDING_DIM,
      heteroOutboxMaxEntries: HETERO_OUTBOX_MAX_ENTRIES,
      outboxLabelMaxLen: OUTBOX_LABEL_MAX_LEN,
      outboxStoreBase: OUTBOX_STORE_BASE,
      siblingsStoreBase: SIBLINGS_STORE_BASE,
      // Bau 08.Y: Read-Anker für Tests (slot-suffixed Store-Namen sind
      // intern, der aktive Slot-Key wird gecached und über _meta lesbar
      // gemacht — null vor init, string danach).
      get activeSlotKey() { return activeSlotKey; },
    },
  };

  global.SbkimUiDemo = SbkimUiDemo;

  // Self-check: synchronous on script load. Format uniform across SBKIM —
  // see INTERFACES.md §1 Modul 08.
  if (typeof console !== "undefined" && console.info) {
    console.info(
      "MODUL 08 UI-DEMO bereit, Funktionen: " +
        "init/listOutbox/addOutboxAnchor/removeOutboxAnchor/setSiblingHeteroOptIn",
    );
  }
})(typeof window !== "undefined" ? window : globalThis);
