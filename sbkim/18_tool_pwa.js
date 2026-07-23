/*
 * SBKIM — Modul 18 — Tool-PWA-Container (Sub (a) Vorab)
 *
 * Andock-Wizard als modularer Endknoten-Pfad, getriggert durch
 * Bronze-SIEGEL-Klick (Modul 16 Sub e Hook) oder Multisuchfeld-Treffer.
 * Bau-Sitzung 18 Sub (a) Vorab vom 2026-05-28 implementiert
 * AUSSCHLIESSLICH den Andock-Pfad (Sub a) gemäß Spec-Sitzung 18
 * Sub (a) Vorab (Pipeline 5h.1). Sub-Bereiche (b)–(i) bleiben für
 * Voll-Spec 18 / Pipeline 5h.2 nach App-Freigabe.
 *
 *   Surface — public:
 *     init(options)         -> Promise<void>   (idempotent, fail-soft)
 *     openAndockTab(url?)   -> Promise<void>   (sync-Validierung vor await)
 *     close()               -> void            (sync)
 *     isOpen()              -> boolean         (sync)
 *     _meta                 -> Read-Anker (13 Felder, defensive Kopie)
 *
 *   Errors (Factory-Stil, analog Modul 15/16-Konvention):
 *     ToolPwaNotReadyError      — openAndockTab() ohne ready (Liste der
 *                                 fehlenden init-Felder im message).
 *     ToolPwaInvalidUrlArgError — openAndockTab(url) mit ungültigem URL-
 *                                 Argument (new URL(url) wirft).
 *
 *   options-Form (init):
 *     {
 *       endpoint:        string,            // Pflicht
 *       domain:          string,            // Pflicht
 *       domainKeywords:  string[],          // Pflicht
 *       stammCategories?:  string[],        // Default []
 *       guestCategories?:  string[],        // Default []
 *       matchThreshold?:   number,          // Default PROVIDER_MIN_MATCH = 0.80
 *                                           // Geclampt auf [0, 0.80];
 *                                           // > 0.80 → console.warn + 0.80.
 *       externalHubUrl?:   string | null,   // Default null. KEIN Hub-Fetch
 *                                           // in Sub (a) Vorab — Read-Anker.
 *       repoUrl?:          string,          // Default Auto-Erkennung
 *                                           // (location.origin + erstes
 *                                           // Pfad-Segment, analog Modul 16).
 *       mountTarget?:      HTMLElement,     // Default document.body
 *     }
 *
 *   Modul 18 Sub (a) Vorab ist NICHT protokoll-aktiv: kein Netz beim
 *   init() (Spore-Fetch erst beim Wizard-Schritt 2), keine Signatur,
 *   kein Embedding beim init() (Lazy-Load erst beim ersten openAndockTab).
 *   Sub (a) Vorab ist RAM-only Render-Schicht — kein eigener Store,
 *   kein PROTOCOL_VERSION-/DB_VERSION-/BACKUP_FORMAT_VERSION-Bump.
 *
 *   Self-check: emits a console.info line on script load (synchronous,
 *   before any call). Siehe INTERFACES.md §1 Modul 18 und
 *   docs/components/18_tool_pwa.md.
 */
(function (global) {
  "use strict";

  // ---- Konstanten ----

  var PROVIDER_MIN_MATCH = 0.80;             // §0 INTERFACES
  var SCHICHT_MIN_MATCH = 0.60;              // §0 INTERFACES
  var EMBEDDING_LOAD_TIMEOUT_MS = 30000;     // Spec § Sub (a) Schritt 3
  var HANDSHAKE_AUTO_CLOSE_MS = 2000;        // Spec § Sub (a) Schritt 4
  var MOUNT_OBSERVER_TIMEOUT_MS = 10000;
  var MODAL_Z_INDEX = 10000;                 // > Modul-17-Modal-9999 (Spec § Risiken)

  var MODAL_ID = "sbkim-tool-pwa-modal";
  var STYLE_ID = "sbkim-tool-pwa-style";
  var SPORE_JSON_PATH = "sbkim/spore.json";

  // Pflicht-Felder für _meta.ready=true (Spec § Sub (a) Endknoten-Init-Schema).
  var REQUIRED_FIELDS = ["endpoint", "domain", "domainKeywords"];

  // Stepper-Schritt-Liste (UI-Render-Quelle).
  var STEPS = [
    { id: 1, label: "URL" },
    { id: 2, label: "Spore" },
    { id: 3, label: "Match" },
    { id: 4, label: "Handshake" },
  ];

  // ---- Errors (Factory-Stil) ----

  function makeError(name, message) {
    var err = new Error(message);
    err.name = name;
    return err;
  }
  function ToolPwaNotReadyError(missingFields) {
    var list = Array.isArray(missingFields) && missingFields.length > 0
      ? missingFields.join(", ")
      : "(keine Liste)";
    return makeError(
      "ToolPwaNotReadyError",
      "SbkimToolPwa nicht bereit. Fehlende init-Felder: " + list +
      ". Aufrufer muss SbkimToolPwa.init({endpoint, domain, domainKeywords}) " +
      "mit allen Pflicht-Feldern aufrufen.",
    );
  }
  function ToolPwaInvalidUrlArgError(urlArg, cause) {
    return makeError(
      "ToolPwaInvalidUrlArgError",
      "openAndockTab(url): Argument ist kein gültiger URL-String — bekam " +
      JSON.stringify(urlArg) +
      (cause && cause.message ? " (" + cause.message + ")" : ""),
    );
  }

  // ---- Modul-Zustand (Closure) ----

  var ready = false;
  var endpoint = "";
  var domain = "";
  var domainKeywords = [];
  var stammCategories = [];
  var guestCategories = [];
  var matchThreshold = PROVIDER_MIN_MATCH;
  var externalHubUrl = null;
  var repoUrl = "";
  var mountTarget = null;
  var missingFields = REQUIRED_FIELDS.slice();
  var embeddingReady = null;                 // null | "loading" | true | "failed"

  // Wizard-State (RAM-only, Reset bei close()).
  var modalRoot = null;
  var modalOpen = false;
  var currentStep = 0;                       // 0 = zu; 1–4 = Wizard-Schritt
  var lastFetchUrl = null;
  var foreignSporeCache = null;              // Schritt-2-Foreign-Spore (RAM)
  var matchResultCache = null;               // Schritt-3-MatchDimensionsResult (RAM)
  var styleElement = null;
  var modalKeydownHandler = null;
  var autoCloseTimerId = null;
  var embeddingTimeoutTimerId = null;
  var mountObserver = null;
  var mountObserverTimeoutId = null;

  // ---- Hilfsfunktionen ----

  function warn(message, cause) {
    if (typeof console !== "undefined" && console.warn) {
      if (cause !== undefined) console.warn("[SbkimToolPwa] " + message, cause);
      else console.warn("[SbkimToolPwa] " + message);
    }
  }

  function defensiveArrayCopy(arr) {
    if (!Array.isArray(arr)) return [];
    var out = new Array(arr.length);
    for (var i = 0; i < arr.length; i++) out[i] = arr[i];
    return out;
  }

  function detectRepoUrl() {
    // Analog Modul 16: location.origin + erstes Pfad-Segment + trailing "/".
    try {
      var loc = global.location;
      if (!loc) return "";
      var origin = loc.origin || "";
      var path = loc.pathname || "/";
      var seg = path.split("/").filter(function (s) { return s.length > 0; })[0];
      if (!seg) return origin + "/";
      return origin + "/" + seg + "/";
    } catch (_e) {
      return "";
    }
  }

  function computeMissingFields(opts) {
    var missing = [];
    for (var i = 0; i < REQUIRED_FIELDS.length; i++) {
      var f = REQUIRED_FIELDS[i];
      var v = opts ? opts[f] : undefined;
      if (f === "endpoint" || f === "domain") {
        if (typeof v !== "string" || v.length === 0) missing.push(f);
      } else if (f === "domainKeywords") {
        if (!Array.isArray(v) || v.length === 0) missing.push(f);
      }
    }
    return missing;
  }

  function clampMatchThreshold(raw) {
    if (typeof raw !== "number" || !isFinite(raw)) return PROVIDER_MIN_MATCH;
    if (raw > PROVIDER_MIN_MATCH) {
      warn("matchThreshold " + raw + " > PROVIDER_MIN_MATCH (" + PROVIDER_MIN_MATCH +
           ") — wird auf " + PROVIDER_MIN_MATCH + " geclampt (Tabu § Sub (a) Vorab).");
      return PROVIDER_MIN_MATCH;
    }
    if (raw < 0) return 0;
    return raw;
  }

  function optsDiffer(a, b) {
    // Pflicht-Feld-Vergleich (Auslöser für console.warn bei Re-Init).
    if (!a || !b) return true;
    if (a.endpoint !== b.endpoint) return true;
    if (a.domain !== b.domain) return true;
    var ak = Array.isArray(a.domainKeywords) ? a.domainKeywords : [];
    var bk = Array.isArray(b.domainKeywords) ? b.domainKeywords : [];
    if (ak.length !== bk.length) return true;
    for (var i = 0; i < ak.length; i++) {
      if (ak[i] !== bk[i]) return true;
    }
    return false;
  }

  var lastInitSnapshot = null;

  // ---- init() ----

  function init(options) {
    var opts = options || {};
    var missing = computeMissingFields(opts);

    if (missing.length > 0) {
      missingFields = missing;
      ready = false;
      warn("init({…}) fail-soft: Pflicht-Felder fehlen: " + missing.join(", ") +
           ". _meta.ready bleibt false. Re-Init mit voll-Pflicht-Feldern setzt ready=true.");
      return Promise.resolve();
    }

    // Idempotenz-Check: identische Pflicht-Felder → no-op (Spec § Sub (a)
    // Endknoten-Init-Schema Idempotenz-Pflicht).
    var sameAsPrev = ready && lastInitSnapshot &&
      !optsDiffer(lastInitSnapshot, {
        endpoint: opts.endpoint,
        domain: opts.domain,
        domainKeywords: opts.domainKeywords,
      });

    if (sameAsPrev) {
      // Optional-Felder können sich trotzdem ändern (Spec: „mit geänderten
      // Optional-Feldern → _meta-Werte überschreiben").
      applyOptionalFields(opts);
      return Promise.resolve();
    }

    // Pflicht-Feld-Wechsel bei laufendem Modul → console.warn (Spec).
    if (ready && lastInitSnapshot) {
      warn("init({…}) re-init mit verändertem Pflicht-Feld erkannt — _meta wird neu gesetzt. " +
           "Bestehende open()-Modal-Session wird NICHT automatisch geschlossen; " +
           "Aufrufer prüft isOpen() und ruft close() bei Bedarf.");
    }

    endpoint = opts.endpoint;
    domain = opts.domain;
    domainKeywords = defensiveArrayCopy(opts.domainKeywords);
    applyOptionalFields(opts);
    missingFields = [];
    ready = true;
    lastInitSnapshot = {
      endpoint: endpoint,
      domain: domain,
      domainKeywords: domainKeywords.slice(),
    };
    return Promise.resolve();
  }

  function applyOptionalFields(opts) {
    stammCategories = defensiveArrayCopy(opts.stammCategories);
    guestCategories = defensiveArrayCopy(opts.guestCategories);
    matchThreshold = clampMatchThreshold(
      typeof opts.matchThreshold === "number" ? opts.matchThreshold : PROVIDER_MIN_MATCH,
    );
    externalHubUrl = (typeof opts.externalHubUrl === "string" && opts.externalHubUrl.length > 0)
      ? opts.externalHubUrl
      : null;
    repoUrl = (typeof opts.repoUrl === "string" && opts.repoUrl.length > 0)
      ? opts.repoUrl
      : detectRepoUrl();
    mountTarget = (opts.mountTarget && typeof opts.mountTarget === "object")
      ? opts.mountTarget
      : null;
  }

  // ---- openAndockTab(url?) ----

  function openAndockTab(url) {
    // SYNC vor await: ready-Check.
    if (ready !== true) {
      throw ToolPwaNotReadyError(missingFields);
    }
    // SYNC vor await: url-Validierung.
    var validUrl = null;
    if (url !== undefined && url !== null) {
      if (typeof url !== "string") {
        throw ToolPwaInvalidUrlArgError(url, new Error("nicht-string-Argument"));
      }
      try {
        var parsed = new URL(url);
        validUrl = parsed.href;
      } catch (err) {
        throw ToolPwaInvalidUrlArgError(url, err);
      }
    }

    // Async: Modal mounten / wechseln.
    return Promise.resolve().then(function () {
      // Bereits offen mit gleicher URL → no-op (Spec).
      if (modalOpen && lastFetchUrl === validUrl) {
        return;
      }
      // Bereits offen mit anderer URL → Reset auf Schritt 2.
      if (modalOpen && validUrl !== null) {
        lastFetchUrl = validUrl;
        currentStep = 2;
        foreignSporeCache = null;
        matchResultCache = null;
        renderModal();
        triggerStepTwoFetch();
        return;
      }
      // Frischer Mount.
      lastFetchUrl = validUrl;
      currentStep = validUrl !== null ? 2 : 1;
      foreignSporeCache = null;
      matchResultCache = null;
      mountModal();
      if (currentStep === 2) {
        triggerStepTwoFetch();
      }
    });
  }

  // ---- close() ----

  function close() {
    if (!modalOpen) return;
    // Bestätigungs-Modal bei offenen Wizard-Eingaben (Spec § Sub (a) close()).
    if (hasUnsubmittedInput()) {
      if (typeof global.confirm === "function") {
        var ok = false;
        try {
          ok = global.confirm("Andock-Wizard schließen? Eingaben gehen verloren.");
        } catch (_e) { ok = true; }
        if (!ok) return;
      }
    }
    teardownModal();
  }

  function hasUnsubmittedInput() {
    // Schritt 1: leere URL ist OK (kein Input). Schritt 2/3: zwischen-State.
    // Schritt 4 läuft auto-close — wenn Schritt 4 final ist, hasUnsubmittedInput false.
    if (currentStep === 0) return false;
    if (currentStep === 1) {
      // Eingabefeld lesen (sync DOM).
      var input = modalRoot && modalRoot.querySelector && modalRoot.querySelector("[data-tool-pwa-url-input]");
      return !!(input && typeof input.value === "string" && input.value.length > 0);
    }
    if (currentStep === 2 || currentStep === 3) return true;
    return false;
  }

  // ---- isOpen() ----

  function isOpen() {
    return modalOpen === true;
  }

  // ---- Modal-Mount + Render ----

  function mountModal() {
    var doc = global.document;
    if (!doc) {
      warn("document fehlt — Modal kann nicht gemountet werden.");
      return;
    }
    injectStyle(doc);
    var target = mountTarget || doc.body;
    if (!target) {
      setupMountObserver(doc);
      return;
    }
    if (modalRoot && modalRoot.parentNode) {
      try { modalRoot.parentNode.removeChild(modalRoot); }
      catch (_e) { /* nb */ }
    }
    modalRoot = doc.createElement("div");
    modalRoot.id = MODAL_ID;
    modalRoot.className = "sbkim-tool-pwa-modal";
    modalRoot.setAttribute("data-open", "true");
    modalRoot.setAttribute("role", "dialog");
    modalRoot.setAttribute("aria-modal", "true");
    modalRoot.setAttribute("aria-label", "SBKIM Andock-Wizard");
    target.appendChild(modalRoot);

    attachKeydownHandler(doc);
    modalOpen = true;
    renderModal();
  }

  function teardownModal() {
    if (autoCloseTimerId !== null) {
      try { clearTimeout(autoCloseTimerId); } catch (_e) { /* nb */ }
      autoCloseTimerId = null;
    }
    if (embeddingTimeoutTimerId !== null) {
      try { clearTimeout(embeddingTimeoutTimerId); } catch (_e) { /* nb */ }
      embeddingTimeoutTimerId = null;
    }
    detachKeydownHandler();
    if (modalRoot && modalRoot.parentNode) {
      try { modalRoot.parentNode.removeChild(modalRoot); }
      catch (_e) { /* nb */ }
    }
    modalRoot = null;
    modalOpen = false;
    currentStep = 0;
    foreignSporeCache = null;
    matchResultCache = null;
  }

  function setupMountObserver(doc) {
    if (mountObserver) return;
    if (typeof global.MutationObserver === "undefined") {
      if (typeof doc.addEventListener === "function") {
        doc.addEventListener("DOMContentLoaded", function () { mountModal(); }, { once: true });
      }
      return;
    }
    var docElement = doc.documentElement;
    if (!docElement) return;
    mountObserver = new global.MutationObserver(function () {
      if (doc.body) {
        disconnectMountObserver();
        mountModal();
      }
    });
    try {
      mountObserver.observe(docElement, { childList: true, subtree: true });
    } catch (err) {
      warn("MutationObserver für Modal-Mount konnte nicht starten.", err);
      mountObserver = null;
      return;
    }
    mountObserverTimeoutId = setTimeout(function () {
      if (mountObserver) {
        disconnectMountObserver();
        warn("document.body auch nach " + MOUNT_OBSERVER_TIMEOUT_MS +
             " ms nicht erschienen — Modal-Mount übersprungen.");
      }
    }, MOUNT_OBSERVER_TIMEOUT_MS);
  }

  function disconnectMountObserver() {
    if (mountObserver) {
      try { mountObserver.disconnect(); } catch (_e) { /* nb */ }
      mountObserver = null;
    }
    if (mountObserverTimeoutId !== null) {
      try { clearTimeout(mountObserverTimeoutId); } catch (_e) { /* nb */ }
      mountObserverTimeoutId = null;
    }
  }

  function attachKeydownHandler(doc) {
    detachKeydownHandler();
    modalKeydownHandler = function (ev) {
      if (ev && ev.key === "Escape") {
        close();
      }
    };
    try { doc.addEventListener("keydown", modalKeydownHandler); }
    catch (_e) { /* nb */ }
  }

  function detachKeydownHandler() {
    if (modalKeydownHandler && global.document) {
      try { global.document.removeEventListener("keydown", modalKeydownHandler); }
      catch (_e) { /* nb */ }
    }
    modalKeydownHandler = null;
  }

  // ---- Modal-Render (rebuild bei jedem Schritt-Wechsel) ----

  function renderModal() {
    if (!modalRoot) return;
    var doc = global.document;
    // Komplett-Rebuild — kein Diff. Sub (a) Vorab hat nur ein Modal mit
    // wenigen Schritten, das ist günstig.
    while (modalRoot.firstChild) {
      try { modalRoot.removeChild(modalRoot.firstChild); }
      catch (_e) { break; }
    }
    // Backdrop.
    var backdrop = doc.createElement("div");
    backdrop.className = "sbkim-tool-pwa-modal-backdrop";
    backdrop.addEventListener("click", function () { close(); });
    modalRoot.appendChild(backdrop);

    // Panel.
    var panel = doc.createElement("div");
    panel.className = "sbkim-tool-pwa-modal-panel";
    modalRoot.appendChild(panel);

    // Header: Titel + Close-Knopf.
    var header = doc.createElement("div");
    header.className = "sbkim-tool-pwa-modal-header";
    var title = doc.createElement("h2");
    title.className = "sbkim-tool-pwa-modal-title";
    title.textContent = "SBKIM Andock-Wizard";
    header.appendChild(title);
    var closeBtn = doc.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "sbkim-tool-pwa-modal-close";
    closeBtn.setAttribute("aria-label", "Schließen");
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", function () { close(); });
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Stepper.
    panel.appendChild(buildStepper(doc));

    // Schritt-Body.
    var body = doc.createElement("div");
    body.className = "sbkim-tool-pwa-modal-body";
    body.setAttribute("data-tool-pwa-body", "");
    panel.appendChild(body);

    if (currentStep === 1) renderStepOne(doc, body);
    else if (currentStep === 2) renderStepTwo(doc, body);
    else if (currentStep === 3) renderStepThree(doc, body);
    else if (currentStep === 4) renderStepFour(doc, body);
  }

  function buildStepper(doc) {
    var stepper = doc.createElement("ol");
    stepper.className = "sbkim-tool-pwa-stepper";
    stepper.setAttribute("aria-label", "Andock-Wizard-Schritte");
    for (var i = 0; i < STEPS.length; i++) {
      var s = STEPS[i];
      var li = doc.createElement("li");
      li.className = "sbkim-tool-pwa-stepper-item";
      li.setAttribute("data-step", String(s.id));
      if (s.id === currentStep) li.setAttribute("data-active", "true");
      else if (s.id < currentStep) li.setAttribute("data-done", "true");
      var num = doc.createElement("span");
      num.className = "sbkim-tool-pwa-stepper-num";
      num.textContent = String(s.id);
      var lbl = doc.createElement("span");
      lbl.className = "sbkim-tool-pwa-stepper-label";
      lbl.textContent = s.label;
      li.appendChild(num);
      li.appendChild(lbl);
      stepper.appendChild(li);
    }
    return stepper;
  }

  // ---- Schritt 1 — URL eingeben ----

  function renderStepOne(doc, body) {
    var p = doc.createElement("p");
    p.className = "sbkim-tool-pwa-text";
    p.textContent =
      "Gib die Repo-URL eines Geschwister-Knotens ein, z.B. " +
      "https://lausiklauskn-png.github.io/Mein-Mixarium/. " +
      "Der Wizard lädt anschließend dessen Spore und prüft den Match.";
    body.appendChild(p);

    var label = doc.createElement("label");
    label.className = "sbkim-tool-pwa-label";
    label.textContent = "Geschwister-URL";
    label.setAttribute("for", "sbkim-tool-pwa-url-input");
    body.appendChild(label);

    var input = doc.createElement("input");
    input.type = "text";
    input.id = "sbkim-tool-pwa-url-input";
    input.className = "sbkim-tool-pwa-input";
    input.setAttribute("data-tool-pwa-url-input", "");
    input.setAttribute("placeholder", "https://…");
    input.setAttribute("inputmode", "url");
    input.setAttribute("autocomplete", "url");
    if (lastFetchUrl) input.value = lastFetchUrl;
    body.appendChild(input);

    var errLine = doc.createElement("p");
    errLine.className = "sbkim-tool-pwa-error";
    errLine.setAttribute("data-tool-pwa-step1-error", "");
    body.appendChild(errLine);

    var actions = doc.createElement("div");
    actions.className = "sbkim-tool-pwa-actions";
    var nextBtn = doc.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "sbkim-tool-pwa-btn sbkim-tool-pwa-btn-primary";
    nextBtn.textContent = "Weiter →";
    nextBtn.addEventListener("click", function () {
      var raw = String(input.value || "").trim();
      if (raw.length === 0) {
        errLine.textContent = "URL fehlt — bitte eingeben.";
        return;
      }
      var parsed;
      try { parsed = new URL(raw); }
      catch (_e) {
        errLine.textContent = "URL ungültig — bitte mit https:// einleiten.";
        return;
      }
      errLine.textContent = "";
      lastFetchUrl = parsed.href;
      currentStep = 2;
      renderModal();
      triggerStepTwoFetch();
    });
    actions.appendChild(nextBtn);
    body.appendChild(actions);
  }

  // ---- Schritt 2 — Spore fetchen ----

  function triggerStepTwoFetch() {
    if (currentStep !== 2 || !lastFetchUrl) return;
    var fetchUrl = lastFetchUrl;
    var sporeUrl = joinUrl(fetchUrl, SPORE_JSON_PATH);
    setStep2Status("loading", "Lade " + sporeUrl + " …");
    foreignSporeCache = null;

    var fetchFn = global.fetch;
    if (typeof fetchFn !== "function") {
      setStep2Status("error", "fetch-API nicht verfügbar (Browser zu alt?).");
      return;
    }
    var p;
    try {
      p = fetchFn(sporeUrl);
    } catch (err) {
      setStep2Status("error", "Spore-Anfrage konnte nicht starten — " + (err && err.message || "unbekannt") + ".");
      return;
    }
    Promise.resolve(p).then(function (resp) {
      if (!resp) throw new Error("Leere Antwort vom Server.");
      if (typeof resp.ok === "boolean" && !resp.ok) {
        if (resp.status === 404) throw new Error("404 — Spore-Datei nicht gefunden.");
        throw new Error("HTTP-Status " + resp.status + ".");
      }
      if (typeof resp.json !== "function") {
        throw new Error("Antwort hat keine .json()-Methode.");
      }
      return resp.json();
    }).then(function (spore) {
      if (!spore || typeof spore !== "object") {
        throw new Error("spore.json ist kein Objekt.");
      }
      return verifySporeIfPossible(spore).then(function (result) {
        if (!result.valid) {
          setStep2Status("error", "Spore-Signatur ungültig" +
                         (result.reason ? " — " + result.reason : "") + ".");
          return;
        }
        foreignSporeCache = spore;
        setStep2SuccessRender(spore);
      });
    }).catch(function (err) {
      var msg = (err && err.message) || String(err);
      if (msg.indexOf("CORS") >= 0 || msg.indexOf("Failed to fetch") >= 0) {
        setStep2Status("error", "CORS / Netz-Fehler — Spore-URL nicht abrufbar (" + msg + ").");
      } else if (msg.indexOf("404") >= 0) {
        setStep2Status("error", "Spore-Datei nicht gefunden — " + sporeUrl + ".");
      } else if (msg.indexOf("JSON") >= 0 || msg.indexOf("parse") >= 0) {
        setStep2Status("error", "Spore-Datei nicht lesbar (kein gültiges JSON) — " + msg + ".");
      } else {
        setStep2Status("error", "Fehler beim Spore-Fetch — " + msg + ".");
      }
    });
  }

  function joinUrl(base, path) {
    if (!base) return path;
    var trail = base.charAt(base.length - 1) === "/" ? base : base + "/";
    var head = path.charAt(0) === "/" ? path.slice(1) : path;
    return trail + head;
  }

  function verifySporeIfPossible(spore) {
    var spoMod = global.SbkimSpore;
    if (!spoMod || typeof spoMod.verifyForeignSpore !== "function") {
      // Fail-soft: ohne Modul 02 lassen wir die Spore durch (Spec: Bauer-
      // Verantwortung über opts.endpoint+domain+domainKeywords), aber
      // markieren das im Fehlerverhalten als reduced-trust nicht weiter
      // sichtbar (Sub (a) Vorab; Modul 02 ist Pflicht-Modul in Endknoten).
      return Promise.resolve({ valid: true, reason: "verifyForeignSpore nicht verfügbar (fail-soft)" });
    }
    try {
      var p = spoMod.verifyForeignSpore(spore);
      return Promise.resolve(p).then(function (r) {
        if (r && typeof r === "object" && typeof r.valid === "boolean") return r;
        return { valid: false, reason: "verifyForeignSpore lieferte unerwartetes Ergebnis" };
      }).catch(function (err) {
        return { valid: false, reason: (err && err.message) || "verifyForeignSpore warf" };
      });
    } catch (err) {
      return Promise.resolve({ valid: false, reason: (err && err.message) || "verifyForeignSpore warf sync" });
    }
  }

  function renderStepTwo(doc, body) {
    var p = doc.createElement("p");
    p.className = "sbkim-tool-pwa-text";
    p.textContent = "Spore wird geladen und signaturgeprüft.";
    body.appendChild(p);

    var statusBox = doc.createElement("div");
    statusBox.className = "sbkim-tool-pwa-status";
    statusBox.setAttribute("data-tool-pwa-step2-status", "");
    body.appendChild(statusBox);

    var preview = doc.createElement("div");
    preview.className = "sbkim-tool-pwa-spore-preview";
    preview.setAttribute("data-tool-pwa-step2-preview", "");
    body.appendChild(preview);

    var actions = doc.createElement("div");
    actions.className = "sbkim-tool-pwa-actions";

    var backBtn = doc.createElement("button");
    backBtn.type = "button";
    backBtn.className = "sbkim-tool-pwa-btn sbkim-tool-pwa-btn-ghost";
    backBtn.textContent = "← URL ändern";
    backBtn.addEventListener("click", function () {
      currentStep = 1;
      renderModal();
    });
    actions.appendChild(backBtn);

    var retryBtn = doc.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "sbkim-tool-pwa-btn sbkim-tool-pwa-btn-ghost";
    retryBtn.setAttribute("data-tool-pwa-step2-retry", "");
    retryBtn.textContent = "Erneut versuchen";
    retryBtn.addEventListener("click", function () { triggerStepTwoFetch(); });
    retryBtn.style.display = "none";
    actions.appendChild(retryBtn);

    var nextBtn = doc.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "sbkim-tool-pwa-btn sbkim-tool-pwa-btn-primary";
    nextBtn.setAttribute("data-tool-pwa-step2-next", "");
    nextBtn.textContent = "Weiter zum Match-Check →";
    nextBtn.disabled = true;
    nextBtn.addEventListener("click", function () {
      if (!foreignSporeCache) return;
      currentStep = 3;
      renderModal();
      triggerStepThreeMatch();
    });
    actions.appendChild(nextBtn);

    body.appendChild(actions);
  }

  function setStep2Status(kind, message) {
    if (!modalRoot) return;
    var status = modalRoot.querySelector("[data-tool-pwa-step2-status]");
    var retry = modalRoot.querySelector("[data-tool-pwa-step2-retry]");
    var next = modalRoot.querySelector("[data-tool-pwa-step2-next]");
    if (status) {
      status.textContent = message;
      status.setAttribute("data-kind", kind);
    }
    if (retry) retry.style.display = (kind === "error") ? "" : "none";
    if (next) next.disabled = (kind !== "ok");
  }

  function setStep2SuccessRender(spore) {
    if (!modalRoot) return;
    setStep2Status("ok", "Spore geladen + signaturgeprüft.");
    var preview = modalRoot.querySelector("[data-tool-pwa-step2-preview]");
    if (!preview) return;
    var doc = global.document;
    while (preview.firstChild) {
      try { preview.removeChild(preview.firstChild); } catch (_e) { break; }
    }
    appendDl(doc, preview, "Domain", spore.domain || "—");
    appendDl(doc, preview, "Knoten-ID",
             (typeof spore.id === "string" && spore.id.length > 16)
               ? spore.id.slice(0, 16) + "…"
               : (spore.id || "—"));
    var kw = Array.isArray(spore.domainKeywords) ? spore.domainKeywords.join(", ") : "—";
    appendDl(doc, preview, "Domain-Stichworte", kw);
    if (Array.isArray(spore.stammCategories) && spore.stammCategories.length > 0) {
      appendDl(doc, preview, "Stamm-Kategorien", spore.stammCategories.join(", "));
    }
    if (Array.isArray(spore.guestCategories) && spore.guestCategories.length > 0) {
      appendDl(doc, preview, "Gast-Kategorien", spore.guestCategories.join(", "));
    }
  }

  function appendDl(doc, parent, label, value) {
    var row = doc.createElement("div");
    row.className = "sbkim-tool-pwa-dl-row";
    var dt = doc.createElement("span");
    dt.className = "sbkim-tool-pwa-dl-key";
    dt.textContent = label;
    var dd = doc.createElement("span");
    dd.className = "sbkim-tool-pwa-dl-value";
    dd.textContent = String(value);
    row.appendChild(dt);
    row.appendChild(dd);
    parent.appendChild(row);
  }

  // ---- Schritt 3 — Match-Check mit Lazy-Embedding ----

  function renderStepThree(doc, body) {
    var p = doc.createElement("p");
    p.className = "sbkim-tool-pwa-text";
    p.textContent =
      "Match-Check: wie gut passen deine Domain-Stichworte zu denen des " +
      "Geschwister-Knotens? Schwelle " + matchThreshold.toFixed(2) +
      " (PROVIDER_MIN_MATCH = " + PROVIDER_MIN_MATCH.toFixed(2) + ").";
    body.appendChild(p);

    var status = doc.createElement("div");
    status.className = "sbkim-tool-pwa-status";
    status.setAttribute("data-tool-pwa-step3-status", "");
    body.appendChild(status);

    var bars = doc.createElement("div");
    bars.className = "sbkim-tool-pwa-bars";
    bars.setAttribute("data-tool-pwa-step3-bars", "");
    body.appendChild(bars);

    var actions = doc.createElement("div");
    actions.className = "sbkim-tool-pwa-actions";

    var backBtn = doc.createElement("button");
    backBtn.type = "button";
    backBtn.className = "sbkim-tool-pwa-btn sbkim-tool-pwa-btn-ghost";
    backBtn.textContent = "← Spore-Schritt";
    backBtn.addEventListener("click", function () {
      currentStep = 2;
      renderModal();
      setStep2SuccessRender(foreignSporeCache || {});
    });
    actions.appendChild(backBtn);

    var retryBtn = doc.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "sbkim-tool-pwa-btn sbkim-tool-pwa-btn-ghost";
    retryBtn.setAttribute("data-tool-pwa-step3-retry", "");
    retryBtn.textContent = "Erneut versuchen";
    retryBtn.style.display = "none";
    retryBtn.addEventListener("click", function () { triggerStepThreeMatch(); });
    actions.appendChild(retryBtn);

    var anywayBtn = doc.createElement("button");
    anywayBtn.type = "button";
    anywayBtn.className = "sbkim-tool-pwa-btn sbkim-tool-pwa-btn-warning";
    anywayBtn.setAttribute("data-tool-pwa-step3-anyway", "");
    anywayBtn.textContent = "Trotzdem andocken";
    anywayBtn.style.display = "none";
    anywayBtn.addEventListener("click", function () {
      currentStep = 4;
      renderModal();
      triggerStepFourHandshake();
    });
    actions.appendChild(anywayBtn);

    var nextBtn = doc.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "sbkim-tool-pwa-btn sbkim-tool-pwa-btn-primary";
    nextBtn.setAttribute("data-tool-pwa-step3-next", "");
    nextBtn.textContent = "Weiter zum Handshake →";
    nextBtn.disabled = true;
    nextBtn.addEventListener("click", function () {
      currentStep = 4;
      renderModal();
      triggerStepFourHandshake();
    });
    actions.appendChild(nextBtn);

    body.appendChild(actions);
  }

  function triggerStepThreeMatch() {
    if (currentStep !== 3) return;
    if (!foreignSporeCache) {
      setStep3Status("error", "Foreign-Spore nicht geladen — bitte Schritt 2 wiederholen.");
      return;
    }
    // Re-Use-Check: ist Modul 03 schon ready?
    var embMod = global.SbkimEmbedding;
    if (embMod && embMod._meta && embMod._meta.ready === true) {
      embeddingReady = true;
      computeAndRenderMatch();
      return;
    }
    if (embMod && typeof embMod.isReady === "function") {
      try {
        if (embMod.isReady() === true) {
          embeddingReady = true;
          computeAndRenderMatch();
          return;
        }
      } catch (_e) { /* fail-soft */ }
    }
    // Lazy-Load Modul 03 (Spec § Embedding-Lazy-Trigger).
    if (!embMod || typeof embMod.init !== "function") {
      embeddingReady = "failed";
      setStep3Status("error", "Modul 03 (Embedding) ist nicht geladen.");
      return;
    }
    embeddingReady = "loading";
    setStep3Status("loading", "Embedding-Modul lädt … (~30 MB beim ersten Lauf)");
    if (embeddingTimeoutTimerId !== null) {
      try { clearTimeout(embeddingTimeoutTimerId); } catch (_e) { /* nb */ }
    }
    embeddingTimeoutTimerId = setTimeout(function () {
      if (embeddingReady === "loading") {
        setStep3Status("warn", "Lädt länger als erwartet — Netz prüfen? (~30 MB Modell-Download).");
      }
    }, EMBEDDING_LOAD_TIMEOUT_MS);
    try {
      Promise.resolve(embMod.init()).then(function () {
        if (embeddingTimeoutTimerId !== null) {
          try { clearTimeout(embeddingTimeoutTimerId); } catch (_e) { /* nb */ }
          embeddingTimeoutTimerId = null;
        }
        embeddingReady = true;
        if (currentStep === 3) computeAndRenderMatch();
      }).catch(function (err) {
        if (embeddingTimeoutTimerId !== null) {
          try { clearTimeout(embeddingTimeoutTimerId); } catch (_e) { /* nb */ }
          embeddingTimeoutTimerId = null;
        }
        embeddingReady = "failed";
        setStep3Status("error", "Embedding-Modul lädt nicht — Netz prüfen? (" +
                       (err && err.message || "unbekannt") + ")");
      });
    } catch (err) {
      embeddingReady = "failed";
      setStep3Status("error", "Embedding-Init warf: " + (err && err.message || "unbekannt"));
    }
  }

  function computeAndRenderMatch() {
    var matchMod = global.SbkimMatch;
    if (!matchMod || typeof matchMod.matchDimensions !== "function") {
      setStep3Status("error", "Modul 04 (Match) ist nicht geladen — matchDimensions fehlt.");
      return;
    }
    // Sub (a) Vorab: Cap/Needs aus den Spore-Feldern ableiten.
    // domainKeywords = capability + needs (symmetrisch); spec spricht von
    // „eigenem domainKeywords-Vektor vs. Foreign-Spore-domainKeywords"
    // (INTERFACES § 1 Modul 18 Nutzt). Wir füttern beide Spalten gleich
    // — die Engine reduziert auf die vorhandene Schicht.
    var ownCap = textBlob(domainKeywords, stammCategories);
    var ownNeeds = textBlob(domainKeywords, guestCategories);
    var foreignKw = Array.isArray(foreignSporeCache.domainKeywords)
      ? foreignSporeCache.domainKeywords
      : [];
    var foreignStamm = Array.isArray(foreignSporeCache.stammCategories)
      ? foreignSporeCache.stammCategories
      : [];
    var foreignGuest = Array.isArray(foreignSporeCache.guestCategories)
      ? foreignSporeCache.guestCategories
      : [];
    var foreignCap = textBlob(foreignKw, foreignStamm);
    var foreignNeeds = textBlob(foreignKw, foreignGuest);

    setStep3Status("loading", "Match wird berechnet …");
    Promise.resolve()
      .then(function () { return matchMod.matchDimensions(ownCap, ownNeeds, foreignCap, foreignNeeds); })
      .then(function (result) {
        matchResultCache = result;
        renderMatchBars(result);
        var overall = (result && typeof result.overall === "number") ? result.overall : 0;
        if (overall >= matchThreshold) {
          setStep3Status("ok", "Match: " + (overall * 100).toFixed(0) + " % — über Schwelle. Bereit für Handshake.");
          var next = modalRoot && modalRoot.querySelector("[data-tool-pwa-step3-next]");
          if (next) next.disabled = false;
        } else {
          setStep3Status("warn", "Match: " + (overall * 100).toFixed(0) + " % — unter Schwelle " +
                         (matchThreshold * 100).toFixed(0) + " %. „Trotzdem andocken" + "\"" +
                         " ist möglich, aber Risiko-bewusst.");
          var anyway = modalRoot && modalRoot.querySelector("[data-tool-pwa-step3-anyway]");
          if (anyway) anyway.style.display = "";
        }
      })
      .catch(function (err) {
        var name = err && err.name;
        if (name === "DimensionsAllNullError") {
          setStep3Status("error",
            "Match konnte nicht berechnet werden — Domain-Stichworte fehlen " +
            "auf einer Seite. Eigene oder Geschwister-Spore prüfen.");
        } else {
          setStep3Status("error",
            "Match-Berechnung warf: " + (err && err.message || "unbekannt"));
        }
        var retry = modalRoot && modalRoot.querySelector("[data-tool-pwa-step3-retry]");
        if (retry) retry.style.display = "";
      });
  }

  function textBlob(keywords, categories) {
    var parts = [];
    if (Array.isArray(keywords)) for (var i = 0; i < keywords.length; i++) parts.push(String(keywords[i]));
    if (Array.isArray(categories)) for (var j = 0; j < categories.length; j++) parts.push(String(categories[j]));
    if (parts.length === 0) return null;
    return parts.join(" · ");
  }

  function setStep3Status(kind, message) {
    if (!modalRoot) return;
    var status = modalRoot.querySelector("[data-tool-pwa-step3-status]");
    if (status) {
      status.textContent = message;
      status.setAttribute("data-kind", kind);
    }
    if (kind === "error") {
      var retry = modalRoot.querySelector("[data-tool-pwa-step3-retry]");
      if (retry) retry.style.display = "";
    }
  }

  function renderMatchBars(result) {
    if (!modalRoot || !result) return;
    var bars = modalRoot.querySelector("[data-tool-pwa-step3-bars]");
    if (!bars) return;
    var doc = global.document;
    while (bars.firstChild) {
      try { bars.removeChild(bars.firstChild); } catch (_e) { break; }
    }
    var lanes = [
      { id: "fachlich",   label: "Fachlich",   value: getLane(result, "fachlich") },
      { id: "prozess",    label: "Prozess",    value: getLane(result, "prozess") },
      { id: "skalierung", label: "Skalierung", value: getLane(result, "skalierung") },
    ];
    for (var i = 0; i < lanes.length; i++) {
      var lane = lanes[i];
      var row = doc.createElement("div");
      row.className = "sbkim-tool-pwa-bar-row";
      var label = doc.createElement("span");
      label.className = "sbkim-tool-pwa-bar-label";
      label.textContent = lane.label;
      var trough = doc.createElement("div");
      trough.className = "sbkim-tool-pwa-bar-trough";
      var fill = doc.createElement("div");
      fill.className = "sbkim-tool-pwa-bar-fill";
      var v = (typeof lane.value === "number" && isFinite(lane.value)) ? lane.value : 0;
      fill.style.width = Math.max(0, Math.min(1, v)) * 100 + "%";
      fill.setAttribute("data-tone", toneForValue(v));
      trough.appendChild(fill);
      var val = doc.createElement("span");
      val.className = "sbkim-tool-pwa-bar-value";
      val.textContent = (lane.value === null || lane.value === undefined)
        ? "—"
        : (v * 100).toFixed(0) + " %";
      row.appendChild(label);
      row.appendChild(trough);
      row.appendChild(val);
      bars.appendChild(row);
    }
  }

  function getLane(result, key) {
    if (!result) return null;
    if (result[key] && typeof result[key].score === "number") return result[key].score;
    if (typeof result[key] === "number") return result[key];
    return null;
  }

  function toneForValue(v) {
    if (typeof v !== "number" || !isFinite(v)) return "rot";
    if (v >= matchThreshold) return "gruen";
    if (v >= SCHICHT_MIN_MATCH) return "gelb";
    return "rot";
  }

  // ---- Schritt 4 — Handshake ----

  function renderStepFour(doc, body) {
    var p = doc.createElement("p");
    p.className = "sbkim-tool-pwa-text";
    p.textContent = "Handshake wird ausgeführt …";
    body.appendChild(p);

    var status = doc.createElement("div");
    status.className = "sbkim-tool-pwa-status";
    status.setAttribute("data-tool-pwa-step4-status", "");
    status.textContent = "Sende Andock-Anfrage …";
    status.setAttribute("data-kind", "loading");
    body.appendChild(status);

    var actions = doc.createElement("div");
    actions.className = "sbkim-tool-pwa-actions";

    var backBtn = doc.createElement("button");
    backBtn.type = "button";
    backBtn.className = "sbkim-tool-pwa-btn sbkim-tool-pwa-btn-ghost";
    backBtn.textContent = "← Match-Schritt";
    backBtn.setAttribute("data-tool-pwa-step4-back", "");
    backBtn.addEventListener("click", function () {
      currentStep = 3;
      renderModal();
      if (matchResultCache) renderMatchBars(matchResultCache);
    });
    actions.appendChild(backBtn);

    var retryBtn = doc.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "sbkim-tool-pwa-btn sbkim-tool-pwa-btn-primary";
    retryBtn.setAttribute("data-tool-pwa-step4-retry", "");
    retryBtn.textContent = "Erneut versuchen";
    retryBtn.style.display = "none";
    retryBtn.addEventListener("click", function () { triggerStepFourHandshake(); });
    actions.appendChild(retryBtn);

    body.appendChild(actions);
  }

  function triggerStepFourHandshake() {
    if (currentStep !== 4) return;
    var anaMod = global.SbkimAnastomose;
    if (!anaMod || typeof anaMod.handshake !== "function") {
      setStep4Status("error", "Modul 05 (Anastomose) ist nicht geladen — handshake fehlt.");
      return;
    }
    if (!foreignSporeCache) {
      setStep4Status("error", "Foreign-Spore nicht geladen.");
      return;
    }
    setStep4Status("loading", "Handshake läuft …");
    Promise.resolve()
      .then(function () { return anaMod.handshake(foreignSporeCache); })
      .then(function () {
        setStep4Status("ok",
          "Handshake erfolgreich — Geschwister-Knoten verbunden. " +
          "Wizard schließt automatisch.");
        if (autoCloseTimerId !== null) {
          try { clearTimeout(autoCloseTimerId); } catch (_e) { /* nb */ }
        }
        autoCloseTimerId = setTimeout(function () {
          autoCloseTimerId = null;
          // Bei auto-close nach Erfolg: kein Bestätigungs-Dialog
          // (Schritt 4 ist final, hasUnsubmittedInput liefert false).
          currentStep = 0;
          teardownModal();
        }, HANDSHAKE_AUTO_CLOSE_MS);
      })
      .catch(function (err) {
        var reason = (err && err.message) || String(err);
        var hint = "";
        if (reason.indexOf("Timeout") >= 0 || reason.indexOf("timeout") >= 0) {
          hint = " Geschwister-Knoten antwortet nicht — vielleicht offline?";
        } else if (reason.toLowerCase().indexOf("signat") >= 0) {
          hint = " Signatur-Problem — Spore-Datei prüfen.";
        } else if (reason.toLowerCase().indexOf("schwell") >= 0 ||
                   reason.toLowerCase().indexOf("match") >= 0) {
          hint = " Match-Schwelle nicht erfüllt.";
        }
        setStep4Status("error", "Handshake fehlgeschlagen — " + reason + "." + hint);
        var retry = modalRoot && modalRoot.querySelector("[data-tool-pwa-step4-retry]");
        if (retry) retry.style.display = "";
      });
  }

  function setStep4Status(kind, message) {
    if (!modalRoot) return;
    var status = modalRoot.querySelector("[data-tool-pwa-step4-status]");
    if (status) {
      status.textContent = message;
      status.setAttribute("data-kind", kind);
    }
  }

  // ---- CSS-Inline (analog Modul 17 — eine Datei, drei Zeilen Einbau) ----

  function injectStyle(doc) {
    if (!doc || !doc.head) return;
    if (styleElement && styleElement.parentNode) return;
    var existing = doc.getElementById(STYLE_ID);
    if (existing) { styleElement = existing; return; }
    styleElement = doc.createElement("style");
    styleElement.id = STYLE_ID;
    styleElement.textContent = buildCss();
    doc.head.appendChild(styleElement);
  }

  function buildCss() {
    return [
      "/* SBKIM Modul 18 Tool-PWA — Andock-Wizard-Modal. Inline-CSS, damit */",
      "/* Endknoten nur eine Datei kopieren muss (Konvention analog Modul 17). */",
      ".sbkim-tool-pwa-modal {",
      "  position: fixed;",
      "  inset: 0;",
      "  z-index: " + MODAL_Z_INDEX + ";",
      "  display: none;",
      "  align-items: center;",
      "  justify-content: center;",
      "  font-family: 'Geist', system-ui, sans-serif;",
      "}",
      ".sbkim-tool-pwa-modal[data-open=\"true\"] { display: flex; }",
      ".sbkim-tool-pwa-modal-backdrop {",
      "  position: absolute;",
      "  inset: 0;",
      "  background: rgba(0, 0, 0, 0.62);",
      "}",
      ".sbkim-tool-pwa-modal-panel {",
      "  position: relative;",
      "  background: #10102A;",
      "  color: #F5F5FF;",
      "  border: 1px solid rgba(255, 255, 255, 0.18);",
      "  border-radius: 12px;",
      "  padding: 1.2rem 1.4rem;",
      "  width: min(640px, 92vw);",
      "  max-height: 86vh;",
      "  overflow: auto;",
      "  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);",
      "}",
      ".sbkim-tool-pwa-modal-header {",
      "  display: flex;",
      "  align-items: center;",
      "  gap: 0.8rem;",
      "  margin-bottom: 0.9rem;",
      "}",
      ".sbkim-tool-pwa-modal-title {",
      "  margin: 0;",
      "  font-size: 1rem;",
      "  font-weight: 600;",
      "  flex: 1;",
      "}",
      ".sbkim-tool-pwa-modal-close {",
      "  background: transparent;",
      "  color: #F5F5FF;",
      "  border: 1px solid rgba(255, 255, 255, 0.18);",
      "  border-radius: 8px;",
      "  padding: 0.25rem 0.6rem;",
      "  cursor: pointer;",
      "}",
      ".sbkim-tool-pwa-stepper {",
      "  list-style: none;",
      "  margin: 0 0 1rem;",
      "  padding: 0;",
      "  display: flex;",
      "  gap: 0.5rem;",
      "  justify-content: space-between;",
      "}",
      ".sbkim-tool-pwa-stepper-item {",
      "  flex: 1;",
      "  display: flex;",
      "  flex-direction: column;",
      "  align-items: center;",
      "  gap: 0.2rem;",
      "  font-size: 0.7rem;",
      "  letter-spacing: 0.06em;",
      "  text-transform: uppercase;",
      "  color: rgba(245, 245, 255, 0.45);",
      "}",
      ".sbkim-tool-pwa-stepper-num {",
      "  width: 1.7rem;",
      "  height: 1.7rem;",
      "  border-radius: 50%;",
      "  border: 1px solid rgba(255, 255, 255, 0.18);",
      "  display: inline-flex;",
      "  align-items: center;",
      "  justify-content: center;",
      "  background: rgba(255, 255, 255, 0.06);",
      "  font-weight: 600;",
      "}",
      ".sbkim-tool-pwa-stepper-item[data-active=\"true\"] {",
      "  color: #F4B435;",
      "}",
      ".sbkim-tool-pwa-stepper-item[data-active=\"true\"] .sbkim-tool-pwa-stepper-num {",
      "  border-color: #F4B435;",
      "  background: rgba(244, 180, 53, 0.15);",
      "}",
      ".sbkim-tool-pwa-stepper-item[data-done=\"true\"] {",
      "  color: #6EE7D3;",
      "}",
      ".sbkim-tool-pwa-stepper-item[data-done=\"true\"] .sbkim-tool-pwa-stepper-num {",
      "  border-color: #6EE7D3;",
      "  background: rgba(110, 231, 211, 0.15);",
      "}",
      ".sbkim-tool-pwa-text {",
      "  margin: 0 0 0.8rem;",
      "  font-size: 0.92rem;",
      "  line-height: 1.55;",
      "}",
      ".sbkim-tool-pwa-label {",
      "  display: block;",
      "  font-size: 0.78rem;",
      "  letter-spacing: 0.06em;",
      "  text-transform: uppercase;",
      "  color: rgba(245, 245, 255, 0.55);",
      "  margin-bottom: 0.4rem;",
      "}",
      ".sbkim-tool-pwa-input {",
      "  width: 100%;",
      "  background: rgba(255, 255, 255, 0.06);",
      "  color: #F5F5FF;",
      "  border: 1px solid rgba(255, 255, 255, 0.18);",
      "  border-radius: 8px;",
      "  padding: 0.55rem 0.7rem;",
      "  font-family: 'Geist Mono', ui-monospace, monospace;",
      "  font-size: 0.9rem;",
      "}",
      ".sbkim-tool-pwa-input:focus {",
      "  outline: 1px solid #F4B435;",
      "  outline-offset: 2px;",
      "}",
      ".sbkim-tool-pwa-error {",
      "  color: #F5C4C4;",
      "  font-size: 0.82rem;",
      "  min-height: 1.1rem;",
      "  margin: 0.3rem 0 0;",
      "}",
      ".sbkim-tool-pwa-status {",
      "  font-family: 'Geist Mono', ui-monospace, monospace;",
      "  font-size: 0.82rem;",
      "  padding: 0.55rem 0.7rem;",
      "  border-radius: 8px;",
      "  margin: 0.6rem 0;",
      "  background: rgba(255, 255, 255, 0.06);",
      "  border: 1px solid rgba(255, 255, 255, 0.12);",
      "}",
      ".sbkim-tool-pwa-status[data-kind=\"loading\"] { color: rgba(245, 245, 255, 0.65); }",
      ".sbkim-tool-pwa-status[data-kind=\"ok\"] { color: #6EE7D3; border-color: rgba(110, 231, 211, 0.4); }",
      ".sbkim-tool-pwa-status[data-kind=\"warn\"] { color: #F4B435; border-color: rgba(244, 180, 53, 0.4); }",
      ".sbkim-tool-pwa-status[data-kind=\"error\"] { color: #F5C4C4; border-color: rgba(220, 38, 38, 0.4); background: rgba(220, 38, 38, 0.12); }",
      ".sbkim-tool-pwa-spore-preview {",
      "  display: grid;",
      "  grid-template-columns: max-content 1fr;",
      "  gap: 0.4rem 0.9rem;",
      "  font-size: 0.86rem;",
      "  font-family: 'Geist Mono', ui-monospace, monospace;",
      "  margin: 0.6rem 0;",
      "}",
      ".sbkim-tool-pwa-dl-row {",
      "  display: contents;",
      "}",
      ".sbkim-tool-pwa-dl-key { color: rgba(245, 245, 255, 0.55); }",
      ".sbkim-tool-pwa-dl-value { color: #F5F5FF; word-break: break-word; }",
      ".sbkim-tool-pwa-bars {",
      "  margin: 0.6rem 0 0.8rem;",
      "  display: flex;",
      "  flex-direction: column;",
      "  gap: 0.45rem;",
      "}",
      ".sbkim-tool-pwa-bar-row {",
      "  display: grid;",
      "  grid-template-columns: 6.5rem 1fr 3.5rem;",
      "  align-items: center;",
      "  gap: 0.6rem;",
      "  font-size: 0.84rem;",
      "  font-family: 'Geist Mono', ui-monospace, monospace;",
      "}",
      ".sbkim-tool-pwa-bar-label { color: rgba(245, 245, 255, 0.65); }",
      ".sbkim-tool-pwa-bar-trough {",
      "  position: relative;",
      "  height: 0.7rem;",
      "  background: rgba(255, 255, 255, 0.06);",
      "  border-radius: 999px;",
      "  overflow: hidden;",
      "}",
      ".sbkim-tool-pwa-bar-fill {",
      "  height: 100%;",
      "  background: #6EE7D3;",
      "  transition: width 220ms ease;",
      "}",
      ".sbkim-tool-pwa-bar-fill[data-tone=\"gruen\"] { background: #6EE7D3; }",
      ".sbkim-tool-pwa-bar-fill[data-tone=\"gelb\"] { background: #F4B435; }",
      ".sbkim-tool-pwa-bar-fill[data-tone=\"rot\"] { background: #DC2626; }",
      ".sbkim-tool-pwa-bar-value { text-align: right; color: #F5F5FF; }",
      ".sbkim-tool-pwa-actions {",
      "  display: flex;",
      "  flex-wrap: wrap;",
      "  gap: 0.5rem;",
      "  justify-content: flex-end;",
      "  margin-top: 1rem;",
      "}",
      ".sbkim-tool-pwa-btn {",
      "  background: rgba(255, 255, 255, 0.06);",
      "  color: #F5F5FF;",
      "  border: 1px solid rgba(255, 255, 255, 0.18);",
      "  border-radius: 8px;",
      "  padding: 0.45rem 0.95rem;",
      "  font-family: 'Geist', system-ui, sans-serif;",
      "  font-size: 0.88rem;",
      "  cursor: pointer;",
      "}",
      ".sbkim-tool-pwa-btn:disabled {",
      "  opacity: 0.45;",
      "  cursor: not-allowed;",
      "}",
      ".sbkim-tool-pwa-btn-primary {",
      "  background: #F4B435;",
      "  color: #1A1306;",
      "  border-color: #F4B435;",
      "  font-weight: 600;",
      "}",
      ".sbkim-tool-pwa-btn-primary:disabled { background: rgba(244, 180, 53, 0.25); color: rgba(26, 19, 6, 0.5); }",
      ".sbkim-tool-pwa-btn-warning {",
      "  background: rgba(220, 38, 38, 0.18);",
      "  border-color: rgba(220, 38, 38, 0.55);",
      "  color: #F5C4C4;",
      "}",
      ".sbkim-tool-pwa-btn-ghost { background: transparent; }",
    ].join("\n");
  }

  // ---- _meta-Read-Anker (defensive Kopie pro Lese-Zugriff) ----

  function buildMeta() {
    return {
      ready:            ready,
      endpoint:         endpoint,
      domain:           domain,
      domainKeywords:   domainKeywords.slice(),
      stammCategories:  stammCategories.slice(),
      guestCategories:  guestCategories.slice(),
      matchThreshold:   matchThreshold,
      externalHubUrl:   externalHubUrl,
      repoUrl:          repoUrl,
      embeddingReady:   embeddingReady,
      modalOpen:        modalOpen,
      currentStep:      currentStep,
      lastFetchUrl:     lastFetchUrl,
      missingFields:    missingFields.slice(),
    };
  }

  // ---- Public-Surface registrieren ----

  var SbkimToolPwa = {
    init:                       init,
    openAndockTab:              openAndockTab,
    close:                      close,
    isOpen:                     isOpen,
    ToolPwaNotReadyError:       ToolPwaNotReadyError,
    ToolPwaInvalidUrlArgError:  ToolPwaInvalidUrlArgError,
  };
  Object.defineProperty(SbkimToolPwa, "_meta", { get: buildMeta });

  global.SbkimToolPwa = SbkimToolPwa;

  // ---- Selbstcheck (sync, beim Skript-Laden) ----

  if (typeof console !== "undefined" && console.info) {
    console.info(
      "MODUL 18 TOOL-PWA bereit, Sub (a) Vorab, Funktionen: init/openAndockTab/close/isOpen",
    );
  }
})(typeof window !== "undefined" ? window : globalThis);
