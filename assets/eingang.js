/* Workfloh PDF — Prüfung beim Einlesen (Klaus 2026-10-01).
   „Wie können wir verhindern, dass ähnliche Schadtexte … beim Importieren von PDF-Dateien
   und Lesen über KI und Übersetzen … Schon wenn ich ein Foto mache, kann das ja passieren.
   Oder Importdatei." — und auf die Frage, ob der Text raus soll: MARKIEREN, nicht entfernen.
   Wer ihn findet, spricht mit dem Absender.

   Der Prüfkern ist der des Auslieferungsprüfers, byte-1:1 kopiert und in
   tests/eingang.mjs per SHA-256 gepinnt — dort pflegen, hier neu kopieren:
     assets/pruefer-anhang.js · assets/pruefer-mail.js · assets/pruefer-formate.js
   Diese Datei ist der Klebstoff: sie lädt den Kern erst, wenn etwas eingelesen wird,
   prüft die ORIGINALDATEI (ein Foto als Foto, nicht das daraus gebaute PDF) und gibt
   nur die Warnungen weiter, um die es hier geht.

   ⚠ GEMELDET wird nur, was eine KI oder einen Menschen täuschen soll: eine Anweisung an
     eine KI (im Text, auf einer Scan-Seite, im Bild, auch blass), unsichtbarer Text im
     PDF, versteckter Text in den Bildpunkten (Verdacht), eine Datei im PDF, ein Programm
     oder eine Tarnung. NICHT gemeldet, mit Absicht:
     · Personenbezug, Rechnungsdaten, Metadaten — in einem Formular normal;
     · PDF-AKTION (JavaScript, /AA …) — Behördenformulare rechnen damit, und diese App
       führt nichts davon aus (pdf.js zeigt ohne Skripte);
     · BILD-ANHAENGSEL — Kamerafotos (Bewegungsfoto) tragen das von sich aus.
   ⚠ Das Original bleibt UNVERÄNDERT. Nichts wird entfernt. Was fehlt, sagt die
     Prüfung selbst („nicht geprüft" mit Grund), nie still „sauber". */
(function () {
  'use strict';
  const WFP = window.WFP = window.WFP || {};
  const KERN = ['assets/pruefer-formate.js?v=2', 'assets/pruefer-mail.js?v=2', 'assets/pruefer-anhang.js?v=4'];
  const WARN = ['KI-ANWEISUNG', 'PDF-KI-ANWEISUNG', 'BILD-KI-ANWEISUNG', 'PDF-VERSTECKTER-TEXT', 'VERSTECKTER-TEXT',
    'BILD-LSB-VERDACHT', 'PDF-ANHANG', 'ANHANG-PROGRAMM', 'ANHANG-TARNUNG'];
  const NAME = {
    'KI-ANWEISUNG': 'Anweisung an eine KI im Text',
    'PDF-KI-ANWEISUNG': 'Anweisung an eine KI im Text',
    'BILD-KI-ANWEISUNG': 'Anweisung an eine KI im Bild',
    'PDF-VERSTECKTER-TEXT': 'Unsichtbarer Text im PDF',
    'VERSTECKTER-TEXT': 'Unsichtbarer Text',
    'BILD-LSB-VERDACHT': 'Verdacht: versteckter Text in den Bildpunkten',
    'PDF-ANHANG': 'Im PDF steckt eine weitere Datei',
    'ANHANG-PROGRAMM': 'Das ist ein Programm',
    'ANHANG-TARNUNG': 'Die Endung passt nicht zum Inhalt'
  };
  /* Herkunftsnachweis (C2PA, „Content Credentials"): womit eine Datei entstanden ist. Eine ANGABE,
     keine Gefahr — steht deshalb NIE in WARN und ändert den Stand nicht. Die Unterschrift prüft
     niemand nach; es ist die eigene Aussage des Programms. */
  const HERKUNFT = ['PDF-HERKUNFT', 'BILD-HERKUNFT'];
  /* Alles Übrige, was der Kern findet (Metadaten, frühere Speicherstände, Personenbezug …), ist in einem
     Formular normal und wird NICHT gemeldet — es steht aber im Prüfbericht (Klaus 2026-10-14: „man kann
     danach auch keine Analyse erkennen … so dass man weiß, Zertifikat und was nicht alles"). */
  const ANGABE_NAME = {
    'PDF-METADATEN': 'Angaben im Dateikopf (Verfasser, Programm …)',
    'PDF-ALTFASSUNG': 'Frühere Speicherstände in der Datei',
    'PDF-AKTION': 'Aktion im PDF (wird hier nicht ausgeführt)',
    'PDF-VERWEIS': 'Verweis nach außen',
    'BILD-METADATEN': 'Angaben im Bild (Kamera, Programm, Ort …)',
    'BILD-ANHAENGSEL': 'Daten hinter dem Bildende',
    'PERSONENBEZUG': 'Personenbezogene Angaben',
    'RECHNUNGSDATEN': 'Rechnungsdaten',
    'KI-BEGRIFF': 'Fachbegriff zu KI-Angriffen (keine Anweisung)',
    'FREMDE-ADRESSE': 'Adresse eines fremden Rechners',
    'UNSICHTBARE-ZEICHEN': 'Unsichtbare Zeichen im Text'
  };
  const MARKE_KANTE = 1600;   // die markierte Kopie liegt am Dokument — klein halten

  function skript(src) {
    return new Promise((ok, nein) => {
      const el = document.createElement('script'); el.src = src; el.async = false;
      el.onload = () => ok(); el.onerror = () => nein(new Error('Datei fehlt: ' + src.split('?')[0]));
      document.head.appendChild(el);
    });
  }
  let _bereit = null;
  function bereit() {
    if (_bereit) return _bereit;
    _bereit = (async () => {
      for (const s of KERN) await skript(s);
      const A = window.PrueferAnhang;
      if (!A || !A.pruefe) throw new Error('der Prüfkern meldet sich nicht');
      A.pfade({ pdfjs: new URL('vendor/pdfjs/', location.href).href, tesseract: new URL('vendor/tesseract/', location.href).href });
      return A;
    })();
    _bereit.catch(() => { _bereit = null; });   // ein späterer Versuch darf neu laden
    return _bereit;
  }

  /* Eine markierte Kopie (JPEG-Datenadresse) — nur bei Bildern mit Stelle. */
  async function markiert(A, bytes, befunde) {
    try {
      const c = await A.markieren(bytes, befunde); if (!c) return null;
      const f = Math.min(1, MARKE_KANTE / Math.max(c.width, c.height));
      const k = document.createElement('canvas'); k.width = Math.round(c.width * f); k.height = Math.round(c.height * f);
      k.getContext('2d').drawImage(c, 0, 0, k.width, k.height);
      return k.toDataURL('image/jpeg', 0.85);
    } catch (_) { return null; }
  }

  /* Die eine Tür. @returns {stand:'warnung'|'sauber'|'ungeprueft', funde:[{kennung,satz}], hinweise:[],
     markiert:dataURL|null, art, zeit}. Wirft nie: was schiefgeht, heißt „ungeprueft" mit Grund. */
  async function pruefen(name, bytes) {
    const zeit = new Date().toISOString();
    try {
      const A = await bereit();
      const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      const r = await A.pruefe(name, b);
      let alle = r.befunde.slice(), hinweise = r.hinweise.slice();
      // Bildpunkte: nur bei verlustfreien Bildern messbar (PNG, verlustfreies WebP) — günstig, also immer
      if (/^(png|webp)$/.test(r.art) && A.verdachtPruefen) {
        const v = await A.verdachtPruefen(name, b);
        if (v.geprueft) alle = alle.concat(v.befunde); else if (r.art === 'png') hinweise.push(v.grund);
        hinweise = hinweise.concat(v.hinweise || []);
      }
      const funde = alle.filter(x => WARN.includes(x.kennung)).map(x => ({ kennung: x.kennung, satz: x.satz }));
      const stand = funde.length ? 'warnung' : (r.bildUngeprueft ? 'ungeprueft' : 'sauber');
      const m = funde.length ? await markiert(A, b, alle.filter(x => WARN.includes(x.kennung))) : null;
      // Herkunftsnachweis (C2PA, Klaus 2026-10-14): eine ANGABE, nie ein Befund — ändert den Stand nicht.
      const herkunft = alle.filter(x => HERKUNFT.includes(x.kennung)).map(x => ({ kennung: x.kennung, satz: x.satz, daten: Array.isArray(x.daten) ? x.daten.map(z => [String(z[0]), String(z[1])]) : null }));
      const angaben = alle.filter(x => !WARN.includes(x.kennung) && !HERKUNFT.includes(x.kennung)).map(x => ({ kennung: x.kennung, satz: x.satz }));
      return { stand, funde, hinweise, markiert: m, art: r.art, zeit, herkunft, angaben };
    } catch (e) {
      return { stand: 'ungeprueft', funde: [], hinweise: ['Die Prüfung lief nicht: ' + (e && e.message || e)], markiert: null, art: '', zeit, herkunft: [], angaben: [] };
    }
  }
  function wasTun(kennung) {
    const A = window.PrueferAnhang;
    return A && A.wasTun ? A.wasTun(kennung) : [];
  }
  WFP.Eingang = { pruefen, bereit, wasTun, WARN, NAME, HERKUNFT, ANGABE_NAME };
})();
