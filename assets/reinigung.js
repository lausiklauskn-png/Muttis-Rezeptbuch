/* Workfloh PDF — Reinigung vor der KI (Klaus 2026-10-14).
   „Erst wenn etwas an eine KI geht, wird gereinigt: Bild-Metadaten und versteckter Text.
   Der entfernte Text wird mit dem Dokument gespeichert, damit man weiß, woher er kam."
   Vorbild ist der Sende-Prüfer: einmal anhalten, dann die sichere Fassung senden.

   Diese Datei ist die RECHNUNG — kein DOM, keine Datenbank, kein Netz. Sie läuft im Browser
   (window.WFP.Reinigung) und in Node (globalThis.WFP.Reinigung), geprüft in tests/reinigung.mjs.

   ⚠ Das ORIGINAL bleibt unverändert. Gereinigt wird nur, was hinausgeht.
   ⚠ „Versteckt" heißt hier: ein Mensch sieht den Text auf der gezeichneten Seite nicht —
     an seiner Stelle ist keine Schrift (weiß auf weiß, Darstellungsart 3, fast gleiche Farbe
     wie der Grund), er ist winzig oder liegt außerhalb der Seite. Eine KI liest ihn trotzdem.
     Gemessen wird an SEINER Stelle im gezeichneten Bild (dieselbe Idee wie tinteIm im Prüfkern).
   ⚠ GRENZEN, benannt: Text über einem Foto oder über sichtbarer Schrift hat dort „Tinte" und
     bleibt drin · schräger Text (nicht 0°) wird nicht beurteilt und bleibt drin · die Schwellen
     KONTRAST 32, ANTEIL 0,4 %, WINZIG 1,5 pt sind gewählt, nicht an echten Dokumenten gemessen. */
(function (welt) {
  'use strict';
  const KONTRAST = 32;      // Helligkeitsabstand zum Grund, ab dem ein Bildpunkt Schrift ist (0–255)
  const ANTEIL = 0.004;     // so viel Schrift muss im Kasten sein (und mindestens TINTE_MIN Punkte)
  const TINTE_MIN = 2;
  const WINZIG_PT = 1.5;    // Schrift unter 1,5 pt liest kein Mensch
  const MAX_VERMERKE = 300, MAX_TEXT = 400;

  const GRUND = {
    winzig: 'winzige Schrift',
    aussen: 'außerhalb der Seite',
    unsichtbar: 'auf der Seite nicht zu sehen (gleiche Farbe wie der Grund oder unsichtbar gesetzt)',
    meta: 'Bild-Metadaten'
  };

  const hell = (d, i) => (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;

  /* Kasten in Bildpunkten (x0,y0,x1,y1), auf das Bild geschnitten. null = ganz außerhalb. */
  function kasten(img, x0, y0, x1, y1) {
    const a = Math.max(0, Math.floor(x0)), b = Math.max(0, Math.floor(y0));
    const c = Math.min(img.width, Math.ceil(x1)), d = Math.min(img.height, Math.ceil(y1));
    return c > a && d > b ? [a, b, c, d] : null;
  }
  /* Wie viel Schrift steht im Kasten? Der Grund ist der Median der Helligkeit im Kasten. */
  function tinte(img, k) {
    const [a, b, c, d] = k, D = img.data, l = [];
    for (let y = b; y < d; y++) for (let x = a; x < c; x++) l.push(hell(D, (y * img.width + x) * 4));
    if (!l.length) return { punkte: 0, tinte: 0, grund: 255 };
    const s = l.slice().sort((p, q) => p - q), grund = s[s.length >> 1];
    let t = 0; for (const v of l) if (Math.abs(v - grund) > KONTRAST) t++;
    return { punkte: l.length, tinte: t, grund };
  }
  /* Ein Textstück {s, x, y (Grundlinie), w, fh} in Seiteneinheiten; massstab = Bildpunkte je Einheit.
     @returns null (sichtbar) oder der Grund ('winzig' | 'aussen' | 'unsichtbar'). */
  function versteckt(stueck, img, massstab) {
    const m = massstab || 1;
    if (!(stueck.fh >= WINZIG_PT)) return 'winzig';
    const k = kasten(img, stueck.x * m, (stueck.y - stueck.fh) * m, (stueck.x + Math.max(stueck.w, stueck.fh * 0.3)) * m, (stueck.y + stueck.fh * 0.25) * m);
    if (!k) return 'aussen';
    const t = tinte(img, k);
    return t.tinte >= TINTE_MIN && t.tinte / t.punkte >= ANTEIL ? null : 'unsichtbar';
  }
  /* Die Stücke einer Seite, nach Richtung (wie bloecke() in uebersetzung.js sie ablegt: {0:[…], 90:[…]}).
     Nur waagerechter Text (0) wird beurteilt — der Rest bleibt, wie er ist (Grenze, siehe oben).
     @returns {roh, entfernt:[{text, grund}]} — roh ist eine Kopie, das Original bleibt. */
  function reinigeRoh(roh, img, massstab) {
    const neu = {}, entfernt = [];
    for (const o of Object.keys(roh || {})) {
      if (Number(o) !== 0) { neu[o] = roh[o].slice(); continue; }
      neu[o] = roh[o].filter(t => {
        const g = versteckt(t, img, massstab);
        if (g) entfernt.push({ text: String(t.s), grund: g });
        return !g;
      });
    }
    return { roh: neu, entfernt };
  }
  /* Ein Stück im Bild mit der Farbe seines Grundes zudecken — für den Weg, auf dem ein BILD
     zur KI geht (Felder erkennen). Ändert img.data (eine Kopie für die KI, nie die Anzeige). */
  function zudecken(img, stueck, massstab) {
    const m = massstab || 1;
    const k = kasten(img, stueck.x * m, (stueck.y - stueck.fh * 1.1) * m, (stueck.x + Math.max(stueck.w, stueck.fh * 0.3)) * m, (stueck.y + stueck.fh * 0.3) * m);
    if (!k) return false;
    const [a, b, c, d] = k, D = img.data, rs = [], gs = [], bs = [];
    for (let y = b; y < d; y++) for (let x = a; x < c; x++) { const i = (y * img.width + x) * 4; rs.push(D[i]); gs.push(D[i + 1]); bs.push(D[i + 2]); }
    const med = v => v.sort((p, q) => p - q)[v.length >> 1];
    const r = med(rs), g = med(gs), bl = med(bs);
    for (let y = b; y < d; y++) for (let x = a; x < c; x++) { const i = (y * img.width + x) * 4; D[i] = r; D[i + 1] = g; D[i + 2] = bl; }
    return true;
  }

  /* ---------- Bild-Metadaten ----------
     Was eine Kamera oder ein Programm über sich und den Menschen anhängt — EXIF (Gerät, Zeit, Ort), XMP,
     IPTC, Hersteller-Segmente, Kommentar — steht in APP1, APP3–APP13, APP15 und COM. Diese Segmente
     werden vor dem Senden herausgenommen, alles andere bleibt Byte für Byte.
     ⚠ BLEIBEN, mit Absicht: APP2 (ICC-Farbprofil, MPF) und APP14 (Adobe). Sie sagen nichts über Gerät,
     Ort oder Person; APP14 braucht der Decoder für die Farben. GEMESSEN 2026-10-14: Chromium hängt an
     JEDES JPEG aus einer Leinwand ein ICC-Profil (474 Byte) — wer es als Metadaten zählte, hielte bei
     jedem Formular an (tests/e2e.mjs war daran rot).
     Kein JPEG oder kaputtes JPEG → unverändert zurück, mit {geprueft:false}. */
  const APP_NAME = { 0xE1: 'EXIF/XMP', 0xED: 'IPTC/Photoshop', 0xFE: 'Kommentar' };
  const META = m => (m >= 0xE1 && m <= 0xEF && m !== 0xE2 && m !== 0xEE) || m === 0xFE;
  function jpegOhneMeta(u8) {
    if (!(u8 && u8.length > 4 && u8[0] === 0xFF && u8[1] === 0xD8)) return { bytes: u8, entfernt: [], geprueft: false };
    const teile = [u8.subarray(0, 2)], entfernt = [];
    let i = 2;
    while (i + 4 <= u8.length) {
      if (u8[i] !== 0xFF) return { bytes: u8, entfernt: [], geprueft: false };
      const m = u8[i + 1];
      if (m === 0xDA) { teile.push(u8.subarray(i)); i = u8.length; break; }   // Bilddaten: Rest unverändert
      if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { teile.push(u8.subarray(i, i + 2)); i += 2; continue; }
      const len = (u8[i + 2] << 8) | u8[i + 3];
      if (len < 2 || i + 2 + len > u8.length) return { bytes: u8, entfernt: [], geprueft: false };
      if (META(m)) entfernt.push({ art: APP_NAME[m] || ('APP' + (m - 0xE0)), bytes: len + 2 });
      else teile.push(u8.subarray(i, i + 2 + len));
      i += 2 + len;
    }
    if (!entfernt.length) return { bytes: u8, entfernt, geprueft: true };
    const n = teile.reduce((s, t) => s + t.length, 0), out = new Uint8Array(n);
    let p = 0; for (const t of teile) { out.set(t, p); p += t.length; }
    return { bytes: out, entfernt, geprueft: true };
  }
  function ausB64(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function zuB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
  /* Dieselbe Reinigung für eine Datenadresse (data:image/jpeg;base64,…), wie sie an die KI geht. */
  function datenAdresseOhneMeta(url) {
    const m = /^data:image\/jpeg;base64,(.*)$/.exec(String(url || ''));
    if (!m) return { url, entfernt: [], geprueft: false };
    const r = jpegOhneMeta(ausB64(m[1]));
    return { url: r.entfernt.length ? 'data:image/jpeg;base64,' + zuB64(r.bytes) : url, entfernt: r.entfernt, geprueft: r.geprueft };
  }

  /* ---------- Vermerk am Dokument ----------
     d.kiEntfernt = [{zeit, weg, seite, text, grund}] — reist mit dem Dokument (Datenbank, Sicherung,
     Arbeitsstand). Dasselbe Stück auf derselben Seite mit demselben Grund auf demselben Weg steht einmal da.
     @returns die Zahl der NEUEN Vermerke. */
  function vermerken(d, liste, weg, zeit) {
    if (!d || !liste || !liste.length) return 0;
    const alt = Array.isArray(d.kiEntfernt) ? d.kiEntfernt : [];
    const schl = v => v.weg + '|' + v.seite + '|' + v.grund + '|' + v.text;
    const schon = new Set(alt.map(schl));
    let neu = 0;
    for (const e of liste) {
      const v = { zeit: zeit || new Date().toISOString(), weg: String(weg || ''), seite: e.seite == null ? null : Number(e.seite), text: String(e.text || '').slice(0, MAX_TEXT), grund: String(e.grund || '') };
      const k = schl(v);
      if (schon.has(k) || alt.length >= MAX_VERMERKE) continue;
      schon.add(k); alt.push(v); neu++;
    }
    d.kiEntfernt = alt;
    return neu;
  }
  const grundSatz = g => GRUND[g] || String(g || '');

  const API = { versteckt, reinigeRoh, zudecken, tinte, jpegOhneMeta, datenAdresseOhneMeta, vermerken, grundSatz,
    GRUND, KONTRAST, ANTEIL, TINTE_MIN, WINZIG_PT, MAX_VERMERKE, MAX_TEXT };
  welt.WFP = welt.WFP || {};
  welt.WFP.Reinigung = API;
})(typeof window !== 'undefined' ? window : globalThis);
