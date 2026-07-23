/*
 * SBKIM — Modul 00 — Doku-Fenster
 *
 * Versteckte 5-Klick-Geste am Such-Symbol einer Endknoten-PWA enthüllt
 * ein modales Statusfenster mit dem Lauf-Zustand des Knotens. Reines
 * Lese-/Trigger-Modul: einziger Schreiber von sbkim_doku_meta; Leser
 * von SbkimSpore, SbkimAnastomose, SbkimApoptose, navigator.storage.
 * Keine Netz-Aufrufe (navigator.storage.estimate ist Browser-API).
 *
 * Public surface (registered on window.SbkimDoku):
 *   init(options)                              -> Promise<void>
 *   open()                                     -> Promise<void>
 *   close()                                    -> void
 *   isOpen()                                   -> boolean
 *   getStatusSnapshot()                        -> Promise<DokuStatus>
 *   recordSighttest(moduleId, result)          -> Promise<void>
 *
 * Inoffiziell (Unterstrich-Präfix, nur für tests/manual_check.html):
 *   _dispatchClick()                -> synthetisiert einen Such-Symbol-Klick
 *   _resetClickCounter()
 *   _advanceRevealClock(ms)         -> Test-Brücke für Reveal-Timer-Ablauf
 *   _setQuotaForTest({usage,quota}) -> überschreibt navigator.storage.estimate
 *   _clearQuotaForTest()
 *
 * Bau-Sitzung 00 (2026-05-14) — drei Bau-Pflichtfragen entschieden:
 *   Frage 1 Render-Stil:     (a) Modal mit halb-transparentem Backdrop,
 *                                Klassenpräfix "sbkim-doku-*".
 *   Frage 2 DOM-Mount-Strat: (a) MutationObserver auf document.body mit
 *                                Auto-Disconnect, 10s-Safety-Timeout.
 *   Frage 3 Panel-00-Test:   (a) Eigenes <button id="panel-00-fake-search">
 *                                im Panel-Markup, _dispatchClick simuliert
 *                                automatisch.
 *
 * Pflege Persistenz-Strategie verbinden (2026-05-16) — Stufe (3) der drei-
 * stufigen Identitäts-Persistenz-Architektur:
 *   - getStatusSnapshot() liest SbkimStorage._meta.storagePersisted fail-soft
 *     und spiegelt den Live-Zustand als snapshot.storagePersisted
 *     (true | false | null).
 *   - Modal-Render-Pfad zeigt zusätzlich eine Backup-Tipp-Zeile, wenn
 *     snapshot.storagePersisted === false ODER snapshot.quota.warningLevel
 *     !== "none". Wortlaut steht in DOKU_BACKUP_TIP_TEXT (modul-lokal).
 *     Hinweis-only, kein Direkt-Aufruf von Modul 02 (Aufrufer-Pflicht-
 *     Trennung — Karte 00 § Verantwortlichkeiten).
 *
 * Self-check: emits a console.info line on script load (synchronous,
 * before any call). See INTERFACES.md §0 / §1 Modul 00 und
 * docs/components/00_doku_fenster.md für den verbindlichen Vertrag.
 */
(function (global) {
  "use strict";

  // ---- Konstanten (gespiegelt aus INTERFACES.md §0; modul-lokal aus Karte 00) ----

  var DOKU_REVEAL_CLICKS = 5;
  var DOKU_REVEAL_WINDOW_MS = 3000;
  var DOKU_QUOTA_WARN_RATIO = 0.80;
  var DOKU_QUOTA_WARN_BYTES = 50 * 1024 * 1024; // 52428800
  var SIBLING_MAX_AGE_MS = 2592000000;          // 30 Tage

  var WINDOW_TITLE_DEFAULT = "SBKIM-Knotenstand";
  var NODE_ID_SHORT_LEN = 12;

  var DOKU_META_STORE = "sbkim_doku_meta";
  var META_KEY = "meta";
  var META_SCHEMA_VERSION = 1;

  var MOUNT_OBSERVER_TIMEOUT_MS = 10000;        // Safety-Timeout für späte DOM-Mounts

  // Pflege Persistenz-Strategie verbinden (2026-05-16) — Stufe (3) der drei-
  // stufigen Identitäts-Persistenz. Textliche Brücke zu Stufe (2) Backup-Export
  // (Modul 02): Wortlaut steht modul-lokal an einer Stelle, damit ein späterer
  // Pflege-Zyklus den Text zentral nachpolieren kann.
  var DOKU_BACKUP_TIP_TEXT =
    "Tipp: Speicher-Schutz für diesen Knoten ist nicht bestätigt. Lege ein " +
    "Backup an (Panel 02, „Backup exportieren“ — " +
    "passwort-verschlüsselte .json-Datei), damit die Identität einen " +
    "Browser-Wechsel oder ein Aufräumen des Browserspeichers überlebt.";

  // ---- Fehler-Erzeugung ----

  function makeError(name, message, cause) {
    var e = new Error(message);
    e.name = name;
    if (cause !== undefined) e.cause = cause;
    return e;
  }

  // ---- Helfer ----

  function nowIso() { return new Date().toISOString(); }
  function nowMs() { return Date.now(); }

  function shortenNodeId(nodeId) {
    if (typeof nodeId !== "string" || nodeId.length === 0) return null;
    if (nodeId.length <= NODE_ID_SHORT_LEN) return nodeId;
    return nodeId.slice(0, NODE_ID_SHORT_LEN) + "…";
  }

  function getStorage() { return global.SbkimStorage; }
  function getSpore() { return global.SbkimSpore; }
  function getAnastomose() { return global.SbkimAnastomose; }
  function getApoptose() { return global.SbkimApoptose; }

  // ---- Modul-Zustand (Closure, nicht im Storage) ----

  var initialized = false;
  var options = null;          // Default-aufgefülltes options-Objekt
  var searchEl = null;         // DOM-Element des Such-Symbols (oder null bis Mount)
  var clickListener = null;    // bound function für click auf searchEl
  var escListener = null;      // bound function für keydown
  var mountObserver = null;    // MutationObserver oder null
  var mountTimeoutId = null;   // setTimeout-Handle für 10s-Safety
  var windowEl = null;         // Backdrop+Window-Wurzel im DOM (oder null)

  var clickCount = 0;
  var revealTimerId = null;
  var revealStartedAt = 0;     // ms; Zeitpunkt von Klick 1

  var quotaOverride = null;    // {usage, quota} oder null

  // ---- Error-Klassen (auf SbkimDoku exportiert) ----
  //
  // Drei sind eigene class-extends-Error-Definitionen, StorageQuotaError ist
  // eine Sammel-Klasse mit .cause analog Modul 07's LegacyTimeoutError.

  function InvalidDokuOptionsError(message) {
    var e = new Error(message);
    e.name = "InvalidDokuOptionsError";
    return e;
  }
  function DokuDependenciesError(message) {
    var e = new Error(message);
    e.name = "DokuDependenciesError";
    return e;
  }
  function InvalidSighttestResultError(message) {
    var e = new Error(message);
    e.name = "InvalidSighttestResultError";
    return e;
  }
  function StorageQuotaError(message, cause) {
    var e = new Error(message);
    e.name = "StorageQuotaError";
    if (cause !== undefined) e.cause = cause;
    return e;
  }

  // ---- init() ----

  async function init(opts) {
    if (initialized) return; // idempotent

    if (!opts || typeof opts !== "object") {
      throw InvalidDokuOptionsError(
        "options fehlt — bitte { searchIconSelector: \"#...\" } übergeben.",
      );
    }
    if (typeof opts.searchIconSelector !== "string" || opts.searchIconSelector.length === 0) {
      throw InvalidDokuOptionsError(
        "options.searchIconSelector ist Pflicht (nicht-leerer CSS-Selektor).",
      );
    }
    if (!global.SbkimStorage) {
      throw DokuDependenciesError(
        "SbkimStorage (Modul 01) fehlt auf window. Lade 01_storage.js vor 00_doku_fenster.js.",
      );
    }

    options = {
      searchIconSelector: opts.searchIconSelector,
      revealClicks: typeof opts.revealClicks === "number" && opts.revealClicks > 0
        ? opts.revealClicks : DOKU_REVEAL_CLICKS,
      revealWindowMs: typeof opts.revealWindowMs === "number" && opts.revealWindowMs > 0
        ? opts.revealWindowMs : DOKU_REVEAL_WINDOW_MS,
      windowTitle: typeof opts.windowTitle === "string" && opts.windowTitle.length > 0
        ? opts.windowTitle : WINDOW_TITLE_DEFAULT,
      mountTarget: opts.mountTarget instanceof Element ? opts.mountTarget : null,
    };

    await getStorage().init();

    // Meta-Eintrag einmalig anlegen (Idempotenz).
    var meta;
    try {
      meta = await getStorage().get(DOKU_META_STORE, META_KEY);
    } catch (err) {
      throw err;
    }
    if (meta === undefined) {
      await getStorage().put(DOKU_META_STORE, META_KEY, {
        moduleId: "meta",
        schemaVersion: META_SCHEMA_VERSION,
        lastOpenedAt: null,
      });
    }

    // Esc-Listener global registrieren — feuert nur, wenn das Fenster offen ist.
    if (typeof document !== "undefined" && !escListener) {
      escListener = function (ev) {
        if (windowEl && (ev.key === "Escape" || ev.keyCode === 27)) {
          close();
        }
      };
      document.addEventListener("keydown", escListener);
    }

    // Such-Symbol mounten — sofort, oder per MutationObserver wenn DOM noch nicht da.
    tryMountSearchEl();

    initialized = true;
  }

  function tryMountSearchEl() {
    if (typeof document === "undefined") return;
    var el = document.querySelector(options.searchIconSelector);
    if (el) {
      attachClickListener(el);
      return;
    }
    if (typeof console !== "undefined" && console.warn) {
      console.warn(
        "MODUL 00 DOKU-FENSTER: searchIconSelector \"" + options.searchIconSelector +
        "\" matcht aktuell kein Element — warte auf späten DOM-Mount via MutationObserver.",
      );
    }
    setupMountObserver();
  }

  function setupMountObserver() {
    if (mountObserver) return; // bereits aktiv
    if (typeof MutationObserver === "undefined" || typeof document === "undefined") return;
    if (!document.body) {
      // body selbst noch nicht da — auf DOMContentLoaded warten.
      var onReady = function () {
        document.removeEventListener("DOMContentLoaded", onReady);
        tryMountSearchEl();
      };
      document.addEventListener("DOMContentLoaded", onReady);
      return;
    }
    mountObserver = new MutationObserver(function () {
      var el = document.querySelector(options.searchIconSelector);
      if (el) {
        disconnectMountObserver();
        attachClickListener(el);
      }
    });
    mountObserver.observe(document.body, { childList: true, subtree: true });
    mountTimeoutId = setTimeout(function () {
      if (mountObserver) {
        disconnectMountObserver();
        if (typeof console !== "undefined" && console.warn) {
          console.warn(
            "MODUL 00 DOKU-FENSTER: searchIconSelector \"" + options.searchIconSelector +
            "\" auch nach " + MOUNT_OBSERVER_TIMEOUT_MS + " ms nicht gefunden — Beobachter beendet.",
          );
        }
      }
    }, MOUNT_OBSERVER_TIMEOUT_MS);
  }

  function disconnectMountObserver() {
    if (mountObserver) {
      mountObserver.disconnect();
      mountObserver = null;
    }
    if (mountTimeoutId !== null) {
      clearTimeout(mountTimeoutId);
      mountTimeoutId = null;
    }
  }

  function attachClickListener(el) {
    searchEl = el;
    if (clickListener) return; // idempotent
    clickListener = function () { onSearchClick(); };
    el.addEventListener("click", clickListener);
  }

  // ---- 5-Klick-Mechanik ----

  function onSearchClick() {
    if (!options) return; // init noch nicht durch — defensive
    if (windowEl) return; // Fenster offen → ignoriere weitere Klicks
    if (clickCount === 0) {
      revealStartedAt = nowMs();
      revealTimerId = setTimeout(resetClicks, options.revealWindowMs);
    }
    clickCount++;
    if (clickCount >= options.revealClicks) {
      cancelRevealTimer();
      clickCount = 0;
      // open() ist async — wir warten nicht hier; Fehler landen in der Konsole.
      open().catch(function (err) {
        if (typeof console !== "undefined" && console.error) {
          console.error("MODUL 00 DOKU-FENSTER: open() nach 5-Klick-Geste warf:", err);
        }
      });
    }
  }

  function resetClicks() {
    clickCount = 0;
    revealStartedAt = 0;
    revealTimerId = null;
  }

  function cancelRevealTimer() {
    if (revealTimerId !== null) {
      clearTimeout(revealTimerId);
      revealTimerId = null;
    }
  }

  // ---- open() ----

  async function open() {
    if (windowEl) return; // idempotent
    if (!initialized) {
      throw DokuDependenciesError("SbkimDoku.init(options) wurde noch nicht aufgerufen.");
    }

    var snapshot = await getStatusSnapshot();

    // lastOpenedAt aktualisieren. Storage-Fehler werden als StorageQuotaError
    // hochgereicht — das Fenster öffnet sich dann nicht.
    var openedAtIso = nowIso();
    try {
      var meta = await getStorage().get(DOKU_META_STORE, META_KEY);
      if (meta === undefined) {
        meta = { moduleId: "meta", schemaVersion: META_SCHEMA_VERSION, lastOpenedAt: null };
      }
      meta.lastOpenedAt = openedAtIso;
      await getStorage().put(DOKU_META_STORE, META_KEY, meta);
    } catch (err) {
      throw StorageQuotaError(
        "Konnte sbkim_doku_meta[\"meta\"].lastOpenedAt nicht schreiben: " +
          (err && err.message ? err.message : err),
        err,
      );
    }
    snapshot.openedAt = openedAtIso;

    renderWindow(snapshot);
  }

  // ---- close() ----

  function close() {
    if (windowEl && windowEl.parentNode) {
      windowEl.parentNode.removeChild(windowEl);
    }
    windowEl = null;
    cancelRevealTimer();
    resetClicks();
  }

  // ---- isOpen() ----

  function isOpen() {
    return windowEl !== null;
  }

  // ---- getStatusSnapshot() ----

  async function getStatusSnapshot() {
    if (!initialized) {
      // Vor init(): nur ein Minimal-Snapshot, da SbkimStorage nicht garantiert ist.
      throw DokuDependenciesError("SbkimDoku.init(options) wurde noch nicht aufgerufen.");
    }
    var errors = [];

    // ---- Spore-Quelle (optional) ----
    var nodeId = null;
    var nodeIdShort = null;
    var ownSporePresent = false;
    var domain = null;
    var nodeType = null;
    var protocolVersion = null;

    var spore = getSpore();
    if (spore) {
      try {
        if (typeof spore.getNodeId === "function") {
          nodeId = await spore.getNodeId();
          nodeIdShort = shortenNodeId(nodeId);
        }
      } catch (err) {
        errors.push({
          source: "SbkimSpore.getNodeId",
          reason: err && err.message ? err.message : String(err),
        });
      }
      try {
        if (typeof spore.getOwnSpore === "function") {
          var own = await spore.getOwnSpore();
          if (own) {
            ownSporePresent = true;
            domain = typeof own.domain === "string" ? own.domain : null;
            nodeType = typeof own.nodeType === "string" ? own.nodeType : null;
            protocolVersion = typeof own.protocolVersion === "string" ? own.protocolVersion : null;
          }
        }
      } catch (err) {
        errors.push({
          source: "SbkimSpore.getOwnSpore",
          reason: err && err.message ? err.message : String(err),
        });
      }
    } else {
      errors.push({ source: "SbkimSpore", reason: "Modul nicht geladen" });
    }

    // ---- Anastomose-Quelle (optional) ----
    var siblings = [];
    var anast = getAnastomose();
    if (anast && typeof anast.listSiblings === "function") {
      try {
        var rawSiblings = await anast.listSiblings();
        for (var i = 0; i < rawSiblings.length; i++) {
          var s = rawSiblings[i];
          siblings.push({
            nodeId: s.nodeId,
            nodeIdShort: shortenNodeId(s.nodeId),
            domain: typeof s.domain === "string" ? s.domain : null,
            since: typeof s.since === "string" ? s.since : null,
          });
        }
      } catch (err) {
        errors.push({
          source: "SbkimAnastomose.listSiblings",
          reason: err && err.message ? err.message : String(err),
        });
      }
    } else {
      errors.push({ source: "SbkimAnastomose.listSiblings", reason: "Modul nicht geladen" });
    }

    // ---- Apoptose-Quelle (optional) ----
    var legacy = [];
    var apop = getApoptose();
    if (apop && typeof apop.listLegacy === "function") {
      try {
        var rawLegacy = await apop.listLegacy();
        for (var j = 0; j < rawLegacy.length; j++) {
          var l = rawLegacy[j];
          legacy.push({
            fromNodeId: l.fromNodeId,
            fromNodeIdShort: shortenNodeId(l.fromNodeId),
            reason: typeof l.reason === "string" ? l.reason : null,
            receivedAt: typeof l.receivedAt === "string" ? l.receivedAt : null,
          });
        }
      } catch (err) {
        errors.push({
          source: "SbkimApoptose.listLegacy",
          reason: err && err.message ? err.message : String(err),
        });
      }
    } else {
      errors.push({ source: "SbkimApoptose.listLegacy", reason: "Modul nicht geladen" });
    }

    // ---- Modulstand (Sichttest-Map) aus sbkim_doku_meta ----
    var modules = {};
    var lastOpenedAt = null;
    try {
      var rows = await getStorage().all(DOKU_META_STORE);
      for (var k = 0; k < rows.length; k++) {
        var key = rows[k].key;
        var val = rows[k].value;
        if (key === META_KEY) {
          lastOpenedAt = (val && typeof val.lastOpenedAt === "string") ? val.lastOpenedAt : null;
        } else if (val && typeof val.moduleId === "string") {
          modules[val.moduleId] = {
            moduleId: val.moduleId,
            lastSighttest: typeof val.lastSighttest === "string" ? val.lastSighttest : null,
            status: val.status === "ok" || val.status === "fail" ? val.status : null,
          };
        }
      }
    } catch (err) {
      // sbkim_doku_meta ist Pflicht-Quelle — Fehler durchreichen (Spec).
      throw err;
    }

    // ---- Quota (optional, Override hat Vorrang) ----
    var quota = await readQuota();
    if (quota === null) {
      errors.push({ source: "navigator.storage.estimate", reason: "API nicht verfügbar" });
    }

    // ---- Persist-Status (Stufe 1 der Identitäts-Persistenz, fail-soft) ----
    // Modul 01 setzt _meta.storagePersisted nach erfolgreichem DB-Open auf
    // true / false / null. Wir lesen rein lesend, behandeln `null` und `true`
    // gleich (kein Warn-Trigger). Nur explizites `false` triggert die
    // Backup-Tipp-Zeile im Modal-Render-Pfad.
    var storagePersisted = null;
    try {
      var stor = getStorage();
      if (stor && stor._meta &&
          typeof stor._meta.storagePersisted !== "undefined") {
        storagePersisted = stor._meta.storagePersisted;
      }
    } catch (err) {
      storagePersisted = null;
    }

    return {
      nodeId: nodeId,
      nodeIdShort: nodeIdShort,
      ownSporePresent: ownSporePresent,
      domain: domain,
      nodeType: nodeType,
      protocolVersion: protocolVersion,
      siblings: siblings,
      siblingCount: siblings.length,
      legacy: legacy,
      legacyCount: legacy.length,
      modules: modules,
      quota: quota,
      storagePersisted: storagePersisted,
      openedAt: null,         // wird in open() überschrieben
      lastOpenedAt: lastOpenedAt,
      errors: errors,
    };
  }

  async function readQuota() {
    var usage, quota;
    if (quotaOverride !== null) {
      usage = quotaOverride.usage;
      quota = quotaOverride.quota;
    } else if (typeof navigator !== "undefined" &&
               navigator.storage &&
               typeof navigator.storage.estimate === "function") {
      try {
        var est = await navigator.storage.estimate();
        usage = typeof est.usage === "number" ? est.usage : null;
        quota = typeof est.quota === "number" ? est.quota : null;
      } catch (err) {
        return null;
      }
    } else {
      return null;
    }
    if (typeof usage !== "number" || typeof quota !== "number" || quota <= 0) {
      return null;
    }
    var ratio = usage / quota;
    var freeBytes = quota - usage;
    var warnRatio = ratio > DOKU_QUOTA_WARN_RATIO;
    var warnBytes = freeBytes < DOKU_QUOTA_WARN_BYTES;
    var warningLevel = "none";
    if (warnRatio && warnBytes) warningLevel = "both";
    else if (warnRatio) warningLevel = "ratio";
    else if (warnBytes) warningLevel = "bytes";
    return {
      usage: usage,
      quota: quota,
      ratio: ratio,
      freeBytes: freeBytes,
      warnRatio: warnRatio,
      warnBytes: warnBytes,
      warningLevel: warningLevel,
    };
  }

  // ---- recordSighttest() ----

  async function recordSighttest(moduleId, result) {
    if (result !== "ok" && result !== "fail") {
      throw InvalidSighttestResultError(
        "recordSighttest erwartet result ∈ {\"ok\",\"fail\"}. Bekommen: " + JSON.stringify(result),
      );
    }
    if (typeof moduleId !== "string" || moduleId.length === 0) {
      throw InvalidSighttestResultError(
        "recordSighttest erwartet einen nicht-leeren moduleId-String.",
      );
    }
    if (!initialized) await init(options || { searchIconSelector: "body" });
    await getStorage().put(DOKU_META_STORE, moduleId, {
      moduleId: moduleId,
      lastSighttest: nowIso(),
      status: result,
    });
  }

  // ---- DOM-Render (Modal mit Backdrop, Frage 1 Variante a) ----

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === "class") node.className = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else if (k === "html") node.innerHTML = attrs[k];
        else node.setAttribute(k, attrs[k]);
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        var c = children[i];
        if (c === null || c === undefined) continue;
        if (typeof c === "string") node.appendChild(document.createTextNode(c));
        else node.appendChild(c);
      }
    }
    return node;
  }

  function formatBytes(n) {
    if (typeof n !== "number" || !isFinite(n)) return "—";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KiB";
    if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + " MiB";
    return (n / (1024 * 1024 * 1024)).toFixed(2) + " GiB";
  }

  function renderWindow(snapshot) {
    var backdrop = el("div", {
      "class": "sbkim-doku-backdrop",
      "role": "presentation",
      "style":
        "position:fixed;inset:0;background:rgba(0,0,0,0.55);" +
        "z-index:2147483646;display:flex;align-items:center;justify-content:center;" +
        "font-family:ui-sans-serif,system-ui,sans-serif;",
    });
    backdrop.addEventListener("click", function (ev) {
      if (ev.target === backdrop) close();
    });

    var box = el("div", {
      "class": "sbkim-doku-window",
      "role": "dialog",
      "aria-modal": "true",
      "aria-label": options.windowTitle,
      "style":
        "background:#fff;color:#222;max-width:640px;width:92%;max-height:84vh;" +
        "overflow:auto;border-radius:8px;padding:1rem 1.2rem;" +
        "box-shadow:0 12px 40px rgba(0,0,0,0.35);",
    });

    box.appendChild(renderHeader(snapshot));
    box.appendChild(renderIdentitySection(snapshot));
    if (snapshot.quota && snapshot.quota.warningLevel !== "none") {
      box.appendChild(renderQuotaWarning(snapshot.quota));
    }
    if (isBackupTipActive(snapshot)) {
      box.appendChild(renderBackupTip());
    }
    box.appendChild(renderModuleSection(snapshot));
    box.appendChild(renderSiblingSection(snapshot));
    box.appendChild(renderLegacySection(snapshot));
    box.appendChild(renderQuotaSection(snapshot));
    box.appendChild(renderActionRow(snapshot));
    box.appendChild(renderErrorBlock(snapshot));
    box.appendChild(renderFooter(snapshot));

    backdrop.appendChild(box);
    var target = (options && options.mountTarget) || document.body;
    target.appendChild(backdrop);
    windowEl = backdrop;
  }

  function renderHeader(snapshot) {
    var head = el("div", {
      "class": "sbkim-doku-head",
      "style": "display:flex;align-items:center;justify-content:space-between;margin-bottom:0.6rem;",
    });
    head.appendChild(el("h2", {
      "class": "sbkim-doku-title",
      "style": "font-size:1.1rem;margin:0;",
      "text": options.windowTitle,
    }));
    var closeBtn = el("button", {
      "class": "sbkim-doku-close",
      "type": "button",
      "aria-label": "Schließen",
      "text": "✕",
      "style":
        "background:#eee;border:none;border-radius:4px;padding:0.2rem 0.6rem;" +
        "cursor:pointer;font-size:1rem;",
    });
    closeBtn.addEventListener("click", function () { close(); });
    head.appendChild(closeBtn);
    return head;
  }

  function renderIdentitySection(snapshot) {
    var sec = el("section", {
      "class": "sbkim-doku-identity",
      "style": "border-top:1px solid #eee;padding-top:0.4rem;margin-bottom:0.6rem;font-size:0.9rem;",
    });
    sec.appendChild(el("h3", {
      "style": "font-size:0.85rem;color:#666;margin:0 0 0.2rem 0;text-transform:uppercase;letter-spacing:0.05em;",
      "text": "Knoten",
    }));
    var dl = el("dl", {
      "style": "margin:0;display:grid;grid-template-columns:max-content 1fr;gap:0.1rem 0.6rem;",
    });
    addRow(dl, "Knoten-ID", snapshot.nodeIdShort || "(nicht geladen)");
    addRow(dl, "Domäne", snapshot.domain || "(nicht gesetzt)");
    addRow(dl, "Knotentyp", snapshot.nodeType || "(nicht gesetzt)");
    addRow(dl, "Protokoll", snapshot.protocolVersion || "(unbekannt)");
    sec.appendChild(dl);
    return sec;
  }

  function addRow(dl, label, value) {
    dl.appendChild(el("dt", {
      "style": "color:#666;",
      "text": label,
    }));
    dl.appendChild(el("dd", {
      "style": "margin:0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:0.85rem;word-break:break-all;",
      "text": String(value),
    }));
  }

  function renderQuotaWarning(quota) {
    var note;
    if (quota.warningLevel === "ratio") {
      note = "Speicher knapp · 80%-Schwelle (" + (quota.ratio * 100).toFixed(1) + "% belegt)";
    } else if (quota.warningLevel === "bytes") {
      note = "Speicher knapp · weniger als 50 MiB frei (" + formatBytes(quota.freeBytes) + ")";
    } else {
      note = "Speicher knapp · " + (quota.ratio * 100).toFixed(1) +
             "% belegt, nur " + formatBytes(quota.freeBytes) + " frei";
    }
    return el("div", {
      "class": "sbkim-doku-warn",
      "style":
        "background:#fff3cd;color:#6b5500;border:1px solid #f0c36d;" +
        "border-radius:4px;padding:0.4rem 0.6rem;margin-bottom:0.6rem;font-size:0.9rem;",
      "text": "⚠ " + note,
    });
  }

  // Pflege Persistenz-Strategie verbinden (2026-05-16): Tipp-Zeile erscheint,
  // wenn Stufe (1) Persist explizit verweigert wurde ODER Stufe (3) Quota-
  // Frühwarnung greift. `null` / `true` triggern nicht (kein Trigger bei
  // API-Verweigerung — fail-soft-Konvention aus Modul 01).
  function isBackupTipActive(snapshot) {
    if (!snapshot) return false;
    var persistFalse = snapshot.storagePersisted === false;
    var quotaWarn = !!(snapshot.quota && snapshot.quota.warningLevel !== "none");
    return persistFalse || quotaWarn;
  }

  function renderBackupTip() {
    return el("div", {
      "class": "sbkim-doku-backup-tip",
      "style":
        "background:#e0f2fe;color:#075985;border:1px solid #7dd3fc;" +
        "border-radius:4px;padding:0.4rem 0.6rem;margin-bottom:0.6rem;font-size:0.9rem;",
      "text": DOKU_BACKUP_TIP_TEXT,
    });
  }

  function renderModuleSection(snapshot) {
    var sec = el("section", {
      "class": "sbkim-doku-modules",
      "style": "border-top:1px solid #eee;padding-top:0.4rem;margin-bottom:0.6rem;font-size:0.9rem;",
    });
    sec.appendChild(el("h3", {
      "style": "font-size:0.85rem;color:#666;margin:0 0 0.2rem 0;text-transform:uppercase;letter-spacing:0.05em;",
      "text": "Sichttest pro Modul",
    }));
    var ids = Object.keys(snapshot.modules).sort();
    if (ids.length === 0) {
      sec.appendChild(el("p", {
        "style": "margin:0;color:#888;",
        "text": "Noch keine Sichttest-Einträge.",
      }));
      return sec;
    }
    var ul = el("ul", { "style": "list-style:none;padding:0;margin:0;" });
    for (var i = 0; i < ids.length; i++) {
      var m = snapshot.modules[ids[i]];
      var color = m.status === "ok" ? "#1a5e1a" : (m.status === "fail" ? "#842029" : "#666");
      var li = el("li", {
        "style": "padding:0.1rem 0;color:" + color + ";",
        "text": m.moduleId + " · " + (m.status || "—") +
                (m.lastSighttest ? " · " + m.lastSighttest : ""),
      });
      ul.appendChild(li);
    }
    sec.appendChild(ul);
    return sec;
  }

  function renderSiblingSection(snapshot) {
    var sec = el("section", {
      "class": "sbkim-doku-siblings",
      "style": "border-top:1px solid #eee;padding-top:0.4rem;margin-bottom:0.6rem;font-size:0.9rem;",
    });
    sec.appendChild(el("h3", {
      "style": "font-size:0.85rem;color:#666;margin:0 0 0.2rem 0;text-transform:uppercase;letter-spacing:0.05em;",
      "text": "Geschwister · " + snapshot.siblingCount,
    }));
    if (snapshot.siblingCount === 0) {
      sec.appendChild(el("p", {
        "style": "margin:0;color:#888;",
        "text": "Keine Geschwister.",
      }));
      return sec;
    }
    var ul = el("ul", { "style": "list-style:none;padding:0;margin:0;" });
    for (var i = 0; i < snapshot.siblings.length; i++) {
      var s = snapshot.siblings[i];
      ul.appendChild(el("li", {
        "style": "padding:0.1rem 0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:0.8rem;",
        "text": s.nodeIdShort + " · " + (s.domain || "—") + " · seit " + (s.since || "—"),
      }));
    }
    sec.appendChild(ul);
    return sec;
  }

  function renderLegacySection(snapshot) {
    var sec = el("section", {
      "class": "sbkim-doku-legacy",
      "style": "border-top:1px solid #eee;padding-top:0.4rem;margin-bottom:0.6rem;font-size:0.9rem;",
    });
    sec.appendChild(el("h3", {
      "style": "font-size:0.85rem;color:#666;margin:0 0 0.2rem 0;text-transform:uppercase;letter-spacing:0.05em;",
      "text": "Vermächtnis-Inbox · " + snapshot.legacyCount,
    }));
    if (snapshot.legacyCount === 0) {
      sec.appendChild(el("p", {
        "style": "margin:0;color:#888;",
        "text": "Keine Vermächtnisse empfangen.",
      }));
      return sec;
    }
    var ul = el("ul", { "style": "list-style:none;padding:0;margin:0;" });
    for (var i = 0; i < snapshot.legacy.length; i++) {
      var lg = snapshot.legacy[i];
      ul.appendChild(el("li", {
        "style": "padding:0.1rem 0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:0.8rem;",
        "text": lg.fromNodeIdShort + " · " + (lg.reason || "—") + " · " + (lg.receivedAt || "—"),
      }));
    }
    sec.appendChild(ul);
    return sec;
  }

  function renderQuotaSection(snapshot) {
    var sec = el("section", {
      "class": "sbkim-doku-quota",
      "style": "border-top:1px solid #eee;padding-top:0.4rem;margin-bottom:0.6rem;font-size:0.9rem;",
    });
    sec.appendChild(el("h3", {
      "style": "font-size:0.85rem;color:#666;margin:0 0 0.2rem 0;text-transform:uppercase;letter-spacing:0.05em;",
      "text": "Speicher",
    }));
    if (!snapshot.quota) {
      sec.appendChild(el("p", { "style": "margin:0;color:#888;", "text": "Quota: nicht verfügbar." }));
      return sec;
    }
    var q = snapshot.quota;
    sec.appendChild(el("p", {
      "style": "margin:0;",
      "text":
        formatBytes(q.usage) + " von " + formatBytes(q.quota) +
        " belegt (" + (q.ratio * 100).toFixed(1) + "%) · " +
        formatBytes(q.freeBytes) + " frei",
    }));
    return sec;
  }

  function renderActionRow(snapshot) {
    var row = el("div", {
      "class": "sbkim-doku-actions",
      "style": "border-top:1px solid #eee;padding-top:0.4rem;margin-bottom:0.6rem;display:flex;flex-wrap:wrap;gap:0.4rem;",
    });
    var ap = getApoptose();
    var sweepBtn = el("button", {
      "class": "sbkim-doku-sweep",
      "type": "button",
      "style":
        "background:#0E7490;color:#fff;border:none;border-radius:4px;padding:0.3rem 0.6rem;" +
        "cursor:pointer;font-size:0.85rem;",
      "text": "Stille Geschwister vergessen",
    });
    if (!ap || typeof ap.forgetExpiredSiblings !== "function") {
      sweepBtn.disabled = true;
      sweepBtn.title = "SbkimApoptose nicht geladen";
      sweepBtn.style.opacity = "0.5";
      sweepBtn.style.cursor = "not-allowed";
    } else {
      sweepBtn.addEventListener("click", async function () {
        sweepBtn.disabled = true;
        try {
          var removed = await ap.forgetExpiredSiblings(SIBLING_MAX_AGE_MS);
          appendInlineNote(row,
            "TTL-Sweep: " + removed.length + " Geschwister entfernt" +
            (removed.length > 0
              ? " (" + removed.map(function (r) { return shortenNodeId(r.nodeId); }).join(", ") + ")"
              : ""),
            "#1a5e1a",
          );
        } catch (err) {
          appendInlineNote(row, "TTL-Sweep-Fehler: " + (err && err.message ? err.message : err), "#842029");
        } finally {
          sweepBtn.disabled = false;
        }
      });
    }
    row.appendChild(sweepBtn);

    var refreshBtn = el("button", {
      "class": "sbkim-doku-refresh",
      "type": "button",
      "style":
        "background:#0E7490;color:#fff;border:none;border-radius:4px;padding:0.3rem 0.6rem;" +
        "cursor:pointer;font-size:0.85rem;",
      "text": "Inbox aktualisieren",
    });
    refreshBtn.addEventListener("click", async function () {
      refreshBtn.disabled = true;
      try {
        var fresh = await getStatusSnapshot();
        // Inbox-Sektion neu aufbauen — einfacher: ganzes Fenster re-rendern
        // wäre möglich, aber Spec sagt nur die Inbox-Spalte. Wir tauschen
        // sie gezielt aus.
        var legacySec = windowEl.querySelector(".sbkim-doku-legacy");
        if (legacySec && legacySec.parentNode) {
          var fresh2 = renderLegacySection(fresh);
          legacySec.parentNode.replaceChild(fresh2, legacySec);
        }
      } catch (err) {
        appendInlineNote(row, "Refresh-Fehler: " + (err && err.message ? err.message : err), "#842029");
      } finally {
        refreshBtn.disabled = false;
      }
    });
    row.appendChild(refreshBtn);

    var closeBtn = el("button", {
      "class": "sbkim-doku-close-bottom",
      "type": "button",
      "style":
        "background:#eee;color:#222;border:none;border-radius:4px;padding:0.3rem 0.6rem;" +
        "cursor:pointer;font-size:0.85rem;margin-left:auto;",
      "text": "Schließen",
    });
    closeBtn.addEventListener("click", function () { close(); });
    row.appendChild(closeBtn);

    return row;
  }

  function appendInlineNote(parent, text, color) {
    parent.appendChild(el("span", {
      "class": "sbkim-doku-note",
      "style": "color:" + color + ";font-size:0.8rem;align-self:center;",
      "text": text,
    }));
  }

  function renderErrorBlock(snapshot) {
    if (!snapshot.errors || snapshot.errors.length === 0) return document.createComment("no errors");
    var sec = el("section", {
      "class": "sbkim-doku-errors",
      "style":
        "border-top:1px solid #eee;padding-top:0.4rem;margin-bottom:0.6rem;font-size:0.8rem;color:#842029;",
    });
    sec.appendChild(el("h3", {
      "style": "font-size:0.8rem;color:#842029;margin:0 0 0.2rem 0;text-transform:uppercase;letter-spacing:0.05em;",
      "text": "Hinweise · " + snapshot.errors.length,
    }));
    var ul = el("ul", { "style": "list-style:disc;padding-left:1.2rem;margin:0;" });
    for (var i = 0; i < snapshot.errors.length; i++) {
      var e = snapshot.errors[i];
      ul.appendChild(el("li", {
        "text": e.source + ": " + e.reason,
      }));
    }
    sec.appendChild(ul);
    return sec;
  }

  function renderFooter(snapshot) {
    return el("p", {
      "class": "sbkim-doku-footer",
      "style": "margin:0;color:#888;font-size:0.75rem;border-top:1px solid #eee;padding-top:0.4rem;",
      "text":
        "Geöffnet: " + (snapshot.openedAt || "—") +
        " · zuletzt: " + (snapshot.lastOpenedAt || "—"),
    });
  }

  // ---- Test-Brücken (Unterstrich-Präfix, inoffiziell) ----

  function _dispatchClick() {
    if (!searchEl) {
      // Kein DOM-Element registriert — direkter Pfad zum Klick-Handler.
      onSearchClick();
      return;
    }
    // Realen click-Event dispatchen, damit der Pfad identisch zum echten Klick ist.
    var ev;
    try {
      ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    } catch (err) {
      ev = document.createEvent("MouseEvents");
      ev.initEvent("click", true, true);
    }
    searchEl.dispatchEvent(ev);
  }

  function _resetClickCounter() {
    cancelRevealTimer();
    resetClicks();
  }

  function _advanceRevealClock(ms) {
    if (typeof ms !== "number" || !isFinite(ms) || ms <= 0) {
      throw makeError(
        "InvalidDokuOptionsError",
        "_advanceRevealClock erwartet eine endliche positive Zahl. Bekommen: " + ms,
      );
    }
    if (revealTimerId === null || clickCount === 0) return false;
    revealStartedAt -= ms;
    var elapsed = nowMs() - revealStartedAt;
    if (elapsed >= options.revealWindowMs) {
      cancelRevealTimer();
      resetClicks();
      return true;
    }
    // Timer neu setzen mit verbleibender Zeit.
    cancelRevealTimer();
    revealTimerId = setTimeout(resetClicks, options.revealWindowMs - elapsed);
    return false;
  }

  function _setQuotaForTest(spec) {
    if (!spec || typeof spec !== "object") {
      throw makeError("InvalidDokuOptionsError", "_setQuotaForTest erwartet {usage, quota}.");
    }
    if (typeof spec.usage !== "number" || typeof spec.quota !== "number" || spec.quota <= 0) {
      throw makeError("InvalidDokuOptionsError", "_setQuotaForTest: usage und quota müssen Zahlen sein, quota > 0.");
    }
    quotaOverride = { usage: spec.usage, quota: spec.quota };
  }

  function _clearQuotaForTest() {
    quotaOverride = null;
  }

  // ---- public surface ----

  var SbkimDoku = {
    init: init,
    open: open,
    close: close,
    isOpen: isOpen,
    getStatusSnapshot: getStatusSnapshot,
    recordSighttest: recordSighttest,

    // Test-Brücken
    _dispatchClick: _dispatchClick,
    _resetClickCounter: _resetClickCounter,
    _advanceRevealClock: _advanceRevealClock,
    _setQuotaForTest: _setQuotaForTest,
    _clearQuotaForTest: _clearQuotaForTest,

    // Error-Klassen (für instanceof-Checks)
    InvalidDokuOptionsError: InvalidDokuOptionsError,
    DokuDependenciesError: DokuDependenciesError,
    InvalidSighttestResultError: InvalidSighttestResultError,
    StorageQuotaError: StorageQuotaError,

    _meta: {
      dokuRevealClicks: DOKU_REVEAL_CLICKS,
      dokuRevealWindowMs: DOKU_REVEAL_WINDOW_MS,
      dokuQuotaWarnRatio: DOKU_QUOTA_WARN_RATIO,
      dokuQuotaWarnBytes: DOKU_QUOTA_WARN_BYTES,
      siblingMaxAgeMs: SIBLING_MAX_AGE_MS,
      windowTitleDefault: WINDOW_TITLE_DEFAULT,
      nodeIdShortLen: NODE_ID_SHORT_LEN,
      dokuMetaStore: DOKU_META_STORE,
      dokuBackupTipText: DOKU_BACKUP_TIP_TEXT,
      // Pflege Persistenz-Strategie verbinden (2026-05-16): Test-Helper, der
      // einen frischen Snapshot zieht und prüft, ob die Backup-Tipp-Zeile beim
      // nächsten open() gerendert würde.
      backupTipActive: function () {
        return getStatusSnapshot().then(isBackupTipActive);
      },
    },
  };

  global.SbkimDoku = SbkimDoku;

  // Self-check: synchronous on script load. Format uniform across SBKIM —
  // see INTERFACES.md §1 Modul 00. Reveal-Schwelle / Quota-Schwellen stehen
  // in §0 — sie werden in der Selbstcheck-Zeile bewusst nicht wiederholt.
  if (typeof console !== "undefined" && console.info) {
    console.info(
      "MODUL 00 DOKU-FENSTER bereit, Funktionen: " +
        "init/open/close/isOpen/getStatusSnapshot/recordSighttest",
    );
  }
})(typeof window !== "undefined" ? window : globalThis);
