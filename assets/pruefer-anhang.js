/* Auslieferungsprüfer — Anhänge und einzelne Dateien öffnen und prüfen.
 * (Klaus 2026-09-29: „Ist das nicht dann dem Auslieferungsprüfer …?" — „bitte so".)
 *
 * ⚠ HIER WIRD GEPFLEGT. Diese Datei steht byte-1:1 im Sende-Prüfer
 * (assets/pruefer-anhang.js, dort per SHA-256 gepinnt). Wer sie ändert,
 * ändert sie HIER, kopiert sie dorthin und zieht den Pin nach.
 * Einen Python-Zwilling hat sie nicht — benannte Grenze.
 *
 * Was sie prüft: Strukturen, die sich ohne Deutung erkennen lassen — Daten
 * hinter dem Bildende, Metadaten, Skripte in SVG, Makros und Verweise in
 * Office-Dateien, Programme, eine Endung, die nicht zum Dateikopf passt.
 * PDFs gehen an assets/pruefer-formate.js. Den TEXT einer Datei (SVG, Word,
 * Excel, PowerPoint) gibt sie heraus; wer ihn weiterprüft, entscheidet die App.
 *
 * ⚠ KEIN VIRENSCANNER. In Bildpunkten versteckte Botschaften sucht seit
 * Stufe 2 C (2026-10-01) verdachtPruefen() — NUR auf einen eigenen Knopf, nie
 * bei jeder Prüfung, und das Ergebnis heißt „Verdacht", nie „gefunden".
 * Der Seitentext eines PDFs wird seit
 * Stufe 2 D (2026-09-29) gelesen — mit pdf.js, das die App nachlädt
 * (pfade({pdfjs})). Fehlt es, bleibt der Seitentext UNGEPRÜFT und das steht da.
 * Text IN einem Bild (PNG, JPEG, WebP, GIF) und auf PDF-Seiten ohne Textebene
 * liest seit Stufe 2 A (2026-09-30) die Texterkennung (Tesseract, von der App
 * nachgeladen: pfade({tesseract})). Liest sie nichts Sicheres, steht „Text im
 * Bild ungeprüft" da — nie „kein Befund". Seit Stufe 2 B (2026-09-30) liest
 * ein zweiter Durchgang dasselbe Bild nach einer Kontrast-Spreizung; was nur
 * dort steht, ist blass und wird so benannt.
 *
 * ausMail(roh) packt die Anhänge einer Mail aus: base64 und quoted-printable,
 * Namen nach RFC 2047/2231. Nichts davon wird ausgeführt oder angezeigt; eine
 * Datei über GROESSE_MAX wird nicht geöffnet, sondern benannt.
 *
 * Läuft in Browser und Node, ohne Oberfläche.
 */
(function (welt) {
  "use strict";

  var BEFUNDE = ["ANHANG-TARNUNG", "ANHANG-PROGRAMM", "BILD-ANHAENGSEL", "BILD-METADATEN",
    "SVG-SKRIPT", "SVG-VERWEIS", "OFFICE-MAKRO", "OFFICE-VERWEIS", "OFFICE-EINBETTUNG",
    "PDF-VERWEIS", "PDF-AKTION", "PDF-ANHANG", "PDF-METADATEN", "PDF-ALTFASSUNG", "PDF-KI-ANWEISUNG", "BILD-KI-ANWEISUNG", "PDF-VERSTECKTER-TEXT", "BILD-LSB-VERDACHT", "BILD-METADATEN-KI-ANWEISUNG", "PDF-HERKUNFT", "BILD-HERKUNFT"];

  function alsBytes(b) { return b instanceof Uint8Array ? b : new Uint8Array(b || []); }
  function latin1(b, von, bis) {
    var s = "", e = Math.min(bis == null ? b.length : bis, b.length);
    for (var i = von || 0; i < e; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, Math.min(i + 32768, e)));
    return s;
  }
  var u16 = function (b, i) { return b[i] | (b[i + 1] << 8); };
  var u32 = function (b, i) { return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0; };
  var b32 = function (b, i) { return ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0; };
  function gross(n) { return n < 1024 ? n + " Bytes" : n < 1048576 ? (n / 1024).toFixed(1).replace(".", ",") + " KB" : (n / 1048576).toFixed(1).replace(".", ",") + " MB"; }

  /* ══ WAS IST ES WIRKLICH? — am Dateikopf, nicht an der Endung */
  function artVon(b) {
    if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return "png";
    if (b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return "jpeg";
    if (b.length >= 6 && latin1(b, 0, 4) === "GIF8") return "gif";
    if (b.length >= 12 && latin1(b, 0, 4) === "RIFF" && latin1(b, 8, 12) === "WEBP") return "webp";
    if (latin1(b, 0, 5) === "%PDF-") return "pdf";
    if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4B && b[2] === 3 && b[3] === 4) return "zip";
    if (b[0] === 0x4D && b[1] === 0x5A) return "programm";               // MZ: Windows-Programm
    if (b[0] === 0x7F && latin1(b, 1, 4) === "ELF") return "programm";
    if (latin1(b, 0, 2) === "#!") return "programm";
    var anf = latin1(b, 0, 1024).replace(/^﻿|^\xEF\xBB\xBF/, "").trimStart();
    if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(anf)) return "svg";
    /* HTML-Anhang (Klaus 2026-09-30): eine Datei, die mit <!DOCTYPE html oder
       <html beginnt, ist eine Seite — sie geht zusätzlich durch den HTML-Prüfer
       (assets/pruefer.js). Nur am ANFANG erkannt: eine .txt, die irgendwo
       „<html>" erwähnt, bleibt eine Textdatei. */
    if (/^(<!--[\s\S]*?-->\s*)*(<!DOCTYPE html[\s>]|<html[\s>])/i.test(anf)) return "html";
    if (istText(b)) return "text";
    return "unbekannt";
  }
  /* Klaus 2026-09-30, Vorlage H1 als Mail-Anhang: eine .txt kam als „unbekannte
     Art" an, und ihr Inhalt wurde NICHT durchsucht — im Reiter „Textdatei"
     fand dieselbe Datei vier Befunde. Text ist, was sich als UTF-8 lesen lässt
     und keine Steuerzeichen trägt (außer Tab, Zeilenende, Seitenvorschub). */
  function istText(b) {
    if (!b.length || typeof TextDecoder === "undefined") return false;
    var t;
    try { t = new TextDecoder("utf-8", { fatal: true }).decode(b.subarray(0, Math.min(b.length, 65536))); }
    catch (e) { if (b.length > 65536) { try { t = new TextDecoder("utf-8").decode(b.subarray(0, 65532)); } catch (e2) { return false; } } else return false; }
    return !/[\x00-\x08\x0E-\x1F\x7F]/.test(t);
  }
  var ART_NAME = { png: "PNG-Bild", jpeg: "JPEG-Bild", gif: "GIF-Bild", webp: "WebP-Bild", pdf: "PDF",
    zip: "ZIP-Archiv", docx: "Word-Dokument", xlsx: "Excel-Tabelle", pptx: "PowerPoint", svg: "SVG-Grafik", html: "HTML-Seite", text: "Textdatei",
    programm: "ausführbares Programm", unbekannt: "unbekannte Art" };
  var ENDUNGEN = { png: ["png"], jpeg: ["jpg", "jpeg", "jfif"], gif: ["gif"], webp: ["webp"], pdf: ["pdf"],
    svg: ["svg"], zip: ["zip", "docx", "docm", "xlsx", "xlsm", "pptx", "pptm", "odt", "ods", "odp", "epub"] };
  var PROGRAMM_ENDUNG = /\.(exe|scr|com|bat|cmd|ps1|vbs|vbe|js|jse|wsf|hta|msi|lnk|jar|apk|sh|dll|cpl|reg)$/i;

  /* ══ BILDER */
  function jpegPruefen(b, melde, texte) {
    var i = 2, ende = -1, meta = [], c2pa = [];
    texte = texte || [];
    while (i + 4 <= b.length) {
      if (b[i] !== 0xFF) break;
      var mk = b[i + 1];
      if (mk === 0xFF) { i++; continue; }
      if (mk === 0xD9) { ende = i + 2; break; }
      if (mk >= 0xD0 && mk <= 0xD7 || mk === 0x01) { i += 2; continue; }
      var len = (b[i + 2] << 8) | b[i + 3];
      var inhalt = latin1(b, i + 4, Math.min(i + 4 + 40, b.length));
      if (mk === 0xE1 && inhalt.indexOf("Exif\0") === 0) {
        var gps = exifHatGps(b, i + 10, Math.min(i + 2 + len, b.length));
        meta.push("EXIF (Kamera, Aufnahmezeit" + (gps ? ", Ortsangabe GPS" : "") + ")");
        exifTexte(b, i + 10, Math.min(i + 2 + len, b.length), texte);
      } else if (mk === 0xE1 && inhalt.indexOf("http://ns.adobe.com/xap/") === 0) {
        meta.push("XMP");
        var xs = b.subarray(i + 4, Math.min(i + 2 + len, b.length)), xn = xs.indexOf(0);
        xmpTexte(xs.subarray(xn < 0 ? 0 : xn + 1), texte);
      }
      else if (mk === 0xED) { meta.push("IPTC/Photoshop"); iptcTexte(b, i + 4, Math.min(i + 2 + len, b.length), texte); }
      else if (mk === 0xEB && inhalt.slice(0, 2) === "JP") {   // APP11: JUMBF (Herkunftsnachweis)
        var seg = b.subarray(i + 4, Math.min(i + 2 + len, b.length));
        if (seg.length > 16) c2pa.push(c2pa.length ? seg.subarray(16) : seg.subarray(8));
      }
      else if (mk === 0xFE) { meta.push("Kommentar"); texte.push({ feld: "Kommentar", text: utf8oderLatin1(b.subarray(i + 4, Math.min(i + 2 + len, b.length))) }); }
      if (mk === 0xDA) {                         // Bilddaten: bis zum echten Ende suchen
        var j = i + 2 + len;
        while (j + 1 < b.length) {
          if (b[j] === 0xFF && b[j + 1] === 0xD9) { ende = j + 2; break; }
          j++;
        }
        break;
      }
      i += 2 + len;
    }
    if (meta.length) melde("BILD-METADATEN", "Im Bild stehen Metadaten: " + meta.join(", ") + ".");
    herkunftMelden(c2pa, melde);
    return ende;
  }
  /* Herkunftsnachweis (C2PA, „Content Credentials") lesen — Klaus 2026-10-14:
     „kurz und verständlich, genauere Ausgabe auf Knopfdruck". Gelesen wird mit
     PrueferFormate.c2paLesen (eine Stelle für PDF und Bild). Das ist eine
     Auskunft, keine Warnung. Fehlt der Leser oder ist der Nachweis nicht
     lesbar, steht „ungeprüft" da, nie „nichts". */
  function herkunftMelden(teile, melde) {
    if (!teile || !teile.length) return;
    var n = 0; teile.forEach(function (x) { n += x.length; });
    var alle = new Uint8Array(n), o = 0;
    teile.forEach(function (x) { alle.set(x, o); o += x.length; });
    var PF = welt.PrueferFormate, r = null;
    if (!PF || !PF.c2paLesen) { melde("BILD-HERKUNFT", "Herkunftsnachweis (Content Credentials) vorhanden, aber der Leser fehlt — ungeprüft."); return; }
    try { r = PF.c2paLesen(alle); } catch (e) { r = { kaputt: true }; }
    if (r === null) return;                    // eine andere JUMBF-Box, kein Nachweis
    if (r.satz) melde("BILD-HERKUNFT", r.satz, null, r.daten);
    else melde("BILD-HERKUNFT", "Herkunftsnachweis (Content Credentials) vorhanden, aber nicht lesbar — ungeprüft.");
  }
  /* GPS nur, wenn IFD0 wirklich den Verweis 0x8825 trägt — eine geratene
     Ortsangabe wäre eine falsche Warnung über den Aufnahmeort. */
  function exifHatGps(b, t, bis) {
    if (t + 8 > bis) return false;
    var le = b[t] === 0x49, r16 = function (i) { return le ? u16(b, i) : (b[i] << 8) | b[i + 1]; },
      r32 = function (i) { return le ? u32(b, i) : b32(b, i); };
    var ifd = t + r32(t + 4); if (ifd + 2 > bis) return false;
    var n = r16(ifd);
    for (var k = 0; k < n && ifd + 2 + k * 12 + 2 <= bis; k++) if (r16(ifd + 2 + k * 12) === 0x8825) return true;
    return false;
  }
  function pngPruefen(b, melde, texte) {
    var i = 8, ende = -1, meta = [], c2pa = [];
    texte = texte || [];
    while (i + 12 <= b.length) {
      var len = b32(b, i), typ = latin1(b, i + 4, i + 8);
      if (typ === "tEXt" || typ === "iTXt" || typ === "zTXt") {
        var schl = latin1(b, i + 8, Math.min(i + 8 + len, i + 8 + 80)).split("\0")[0];
        meta.push("Text „" + schl + "“");
        pngTextLesen(typ, schl, b.subarray(i + 8, Math.min(i + 8 + len, b.length)), texte);
      } else if (typ === "eXIf") { meta.push("EXIF"); exifTexte(b, i + 8, Math.min(i + 8 + len, b.length), texte); }
      else if (typ === "caBX") c2pa.push(b.subarray(i + 8, Math.min(i + 8 + len, b.length)));
      i += 12 + len;
      if (typ === "IEND") { ende = i; break; }
    }
    if (meta.length) melde("BILD-METADATEN", "Im Bild stehen Metadaten: " + meta.join(", ") + ".");
    herkunftMelden(c2pa, melde);
    return ende;
  }
  function webpPruefen(b, melde, texte) {
    var ende = 8 + u32(b, 4), i = 12, meta = [], c2pa = [];
    texte = texte || [];
    while (i + 8 <= Math.min(ende, b.length)) {
      var typ = latin1(b, i, i + 4), len = u32(b, i + 4), dbis = Math.min(i + 8 + len, b.length);
      if (typ === "EXIF") { meta.push("EXIF"); exifTexte(b, latin1(b, i + 8, i + 14) === "Exif\0\0" ? i + 14 : i + 8, dbis, texte); }
      else if (typ === "XMP ") { meta.push("XMP"); xmpTexte(b.subarray(i + 8, dbis), texte); }
      else if (typ === "C2PA") c2pa.push(b.subarray(i + 8, dbis));
      i += 8 + len + (len & 1);
    }
    if (meta.length) melde("BILD-METADATEN", "Im Bild stehen Metadaten: " + meta.join(", ") + ".");
    herkunftMelden(c2pa, melde);
    return ende;
  }
  /* ══ TEXT IN DEN METADATEN — Stufe 0 (Klaus 2026-10-05)
   * Bisher meldeten die Metadaten nur ihre NAMEN („XMP", „Text „Comment““).
   * Was darin STEHT, wurde nicht gelesen — ein Satz an eine KI im Feld
   * „Ersteller" oder „Beschreibung" kam ungeprüft durch. Jetzt wird der Text
   * dieser Felder gesammelt ({feld, text}, beim gepackten PNG-Text ein
   * Versprechen) und mit derselben Liste wie der Mail-Eingang geprüft.
   * Gelesen, nie ausgeführt. Je Feld höchstens META_MAX Zeichen.
   * ⚠ BENANNTE GRENZE: GIF-Kommentare, Herstellerfelder (MakerNote) und
   *   PDF-Metadaten fallen nicht hierunter (PDF hat seinen eigenen Weg). */
  var META_MAX = 65536, META_ENTPACKT_MAX = 1048576;
  function utf8oderLatin1(b) {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(b); } catch (_e) { return latin1(b, 0, b.length); }
  }
  function ucs2(b) { var s = ""; for (var k = 0; k + 1 < b.length; k += 2) s += String.fromCharCode(b[k] | (b[k + 1] << 8)); return s; }
  var EXIF_FELDER = { 0x010E: "Bildbeschreibung", 0x010F: "Hersteller", 0x0110: "Modell", 0x0131: "Software", 0x013B: "Künstler",
    0x8298: "Copyright", 0x9C9B: "Titel (Windows)", 0x9C9C: "Kommentar (Windows)", 0x9C9D: "Autor (Windows)",
    0x9C9E: "Stichworte (Windows)", 0x9C9F: "Betreff (Windows)", 0x9286: "Benutzerkommentar" };
  var EXIF_GROESSE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  function exifTexte(b, t, bis, texte) {
    if (t + 8 > bis) return;
    var le = b[t] === 0x49, r16 = function (i) { return le ? u16(b, i) : (b[i] << 8) | b[i + 1]; },
      r32 = function (i) { return le ? u32(b, i) : b32(b, i); };
    function ifdLesen(ifd, tiefe) {
      if (tiefe > 2 || ifd + 2 > bis) return;
      var n = r16(ifd);
      for (var k = 0; k < n && k < 512; k++) {
        var e = ifd + 2 + k * 12; if (e + 12 > bis) break;
        var tag = r16(e), typ = r16(e + 2), anz = r32(e + 4);
        if (tag === 0x8769) { ifdLesen(t + r32(e + 8), tiefe + 1); continue; }
        if (!EXIF_FELDER[tag]) continue;
        var groesse = (EXIF_GROESSE[typ] || 1) * anz; if (groesse > META_MAX) groesse = META_MAX;
        var von = groesse <= 4 ? e + 8 : t + r32(e + 8); if (von < t || von >= bis) continue;
        var roh = b.subarray(von, Math.min(von + groesse, bis)), text;
        if (tag >= 0x9C9B && tag <= 0x9C9F) text = ucs2(roh);
        else if (tag === 0x9286) {
          var kopf = latin1(roh, 0, 8);
          text = /^UNICODE/.test(kopf) ? (le ? ucs2(roh.subarray(8)) : utf8oderLatin1(roh.subarray(8))) : utf8oderLatin1(roh.subarray(8));
        } else text = utf8oderLatin1(roh);
        text = text.replace(/\0+/g, " ").trim();
        if (text) texte.push({ feld: "EXIF " + EXIF_FELDER[tag], text: text });
      }
    }
    ifdLesen(t + r32(t + 4), 0);
  }
  function xmlEntity(s) {
    return s.replace(/&#x([0-9a-f]+);/gi, function (_a, h) { return String.fromCodePoint(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (_a, d) { return String.fromCodePoint(+d); })
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  }
  function xmpTexte(b, texte) {
    var x = utf8oderLatin1(b.subarray(0, Math.min(b.length, META_MAX * 4)));
    x = x.replace(/<\?[\s\S]*?\?>/g, " ").replace(/<!--[\s\S]*?-->/g, " ");
    var teile = [];
    /* Kurzform: dc:title="…" als Eigenschaft — Namensräume (xmlns) und
       rdf-Verwaltung zählen nicht. */
    x.replace(/\s([A-Za-z][\w.-]*:[\w.-]+)\s*=\s*"([^"]*)"/g, function (_a, n, v) {
      if (!/^(xmlns|rdf|xml|x):/i.test(n) && v.trim()) teile.push(xmlEntity(v));
      return _a;
    });
    x.replace(/>([^<]+)</g, function (_a, t) { if (t.trim()) teile.push(xmlEntity(t.trim())); return _a; });
    var text = teile.join("\n").slice(0, META_MAX);
    if (text.trim()) texte.push({ feld: "XMP", text: text });
  }
  function iptcTexte(b, von, bis, texte) {
    var IPTC = { 5: "IPTC Titel", 25: "IPTC Stichwort", 80: "IPTC Ersteller", 105: "IPTC Überschrift", 116: "IPTC Copyright", 120: "IPTC Beschreibung" };
    for (var i = von; i + 5 <= bis; i++) {
      if (b[i] !== 0x1C || b[i + 1] !== 2) continue;
      var ds = b[i + 2], n = (b[i + 3] << 8) | b[i + 4];
      if (n & 0x8000) continue;
      if (IPTC[ds]) { var t = utf8oderLatin1(b.subarray(i + 5, Math.min(i + 5 + n, bis))).trim(); if (t) texte.push({ feld: IPTC[ds], text: t }); }
      i += 4 + n;
    }
  }
  function entpacken(daten) {
    if (typeof welt.DecompressionStream !== "function") return Promise.resolve(null);
    return Promise.resolve().then(function () {
      var ds = new welt.DecompressionStream("deflate"), w = ds.writable.getWriter();
      w.write(daten).catch(function () {}); w.close().catch(function () {});
      var r = ds.readable.getReader(), stuecke = [], n = 0;
      function lies() {
        return r.read().then(function (x) {
          if (x.done) return;
          stuecke.push(x.value); n += x.value.length;
          if (n >= META_ENTPACKT_MAX) { r.cancel().catch(function () {}); return; }   // Deckel gegen Pack-Bomben
          return lies();
        });
      }
      return lies().then(function () {
        var aus = new Uint8Array(Math.min(n, META_ENTPACKT_MAX)), p = 0;
        for (var k = 0; k < stuecke.length && p < aus.length; k++) { var s2 = stuecke[k].subarray(0, aus.length - p); aus.set(s2, p); p += s2.length; }
        return aus;
      });
    }).catch(function () { return null; });
  }
  function pngTextLesen(typ, schl, d, texte) {
    var feld = "PNG-Text „" + schl + "“", z = d.indexOf(0); if (z < 0) return;
    if (typ === "tEXt") { texte.push({ feld: feld, text: latin1(d, z + 1, Math.min(d.length, z + 1 + META_MAX)) }); return; }
    if (typ === "zTXt") {
      texte.push(entpacken(d.subarray(z + 2)).then(function (x) {
        return x ? { feld: feld, text: latin1(x, 0, Math.min(x.length, META_MAX)) } : { feld: feld, text: null, nichtEntpackt: true };
      }));
      return;
    }
    var gepackt = d[z + 1] === 1, p = z + 3;                  // iTXt: Schalter, Verfahren, Sprache\0, Schlüssel übersetzt\0, Text
    var l1 = d.indexOf(0, p); if (l1 < 0) return;
    var l2 = d.indexOf(0, l1 + 1); if (l2 < 0) return;
    var roh = d.subarray(l2 + 1);
    if (!gepackt) { texte.push({ feld: feld, text: utf8oderLatin1(roh.subarray(0, META_MAX)) }); return; }
    texte.push(entpacken(roh).then(function (x) {
      return x ? { feld: feld, text: utf8oderLatin1(x.subarray(0, META_MAX)) } : { feld: feld, text: null, nichtEntpackt: true };
    }));
  }
  function metatextPruefen(texte, melde, hinweise, stand) {
    if (!texte.length) return Promise.resolve();
    return Promise.all(texte).then(function (liste) {
      var PM = welt.PrueferMail, gelesen = 0;
      liste.forEach(function (x) {
        if (x.nichtEntpackt) { hinweise.push("Der gepackte Text im Feld " + x.feld + " ließ sich hier nicht entpacken — ungeprüft, nicht sauber."); ungeprueft(stand, "Metadaten ungeprüft"); return; }
        if (!x.text || !x.text.trim()) return;
        gelesen++;
        if (!PM) return;
        var schon = {};
        PM.pruefeMail("\n" + x.text).stellen.forEach(function (st) {
          if (st.kennung !== "KI-ANWEISUNG" || schon[st.satz]) return;
          schon[st.satz] = true;
          melde("BILD-METADATEN-KI-ANWEISUNG", st.satz + " (Metadaten, Feld " + x.feld + ")");
        });
      });
      if (gelesen && !PM) {
        hinweise.push("Der Text in den Metadaten wurde gelesen, aber die Liste der KI-Anweisungen (assets/pruefer-mail.js) ist nicht geladen — auf Anweisungen an eine KI ist er ungeprüft, nicht sauber.");
        stand.textUngeprueft = true; ungeprueft(stand, "Metadaten ungeprüft");
      } else if (gelesen) hinweise.push("Text in den Metadaten gelesen: " + gelesen + " Feld(er), auf Anweisungen an eine KI geprüft.");
    });
  }
  function anhaengsel(b, ende, melde) {
    if (ende < 0 || ende >= b.length) return;
    var rest = b.subarray(ende), leer = true;
    for (var k = 0; k < rest.length; k++) if (rest[k] !== 0 && rest[k] !== 10 && rest[k] !== 13 && rest[k] !== 32) { leer = false; break; }
    if (leer && rest.length <= 64) return;       // Füllbytes einiger Programme
    var kopf = latin1(rest, 0, 4096), was = "";
    if (/ftyp(mp4|isom|qt)/.test(kopf) || /MotionPhoto|MicroVideo/i.test(latin1(b, 0, 65536))) was = " — vermutlich ein Bewegungsfoto (Video)";
    else if (/SEF[HT]/.test(latin1(rest, Math.max(0, rest.length - 64)))) was = " — vermutlich Zusatzdaten einer Samsung-Kamera";
    else if (rest[0] === 0x50 && rest[1] === 0x4B) was = " — dort beginnt ein ZIP-Archiv";
    else if (latin1(rest, 0, 5) === "%PDF-") was = " — dort beginnt ein PDF";
    melde("BILD-ANHAENGSEL", "Hinter dem Ende des Bildes stehen noch " + gross(rest.length) +
      " Daten" + was + ". Kein Bildbetrachter zeigt sie, mitgeschickt werden sie trotzdem.");
  }

  /* ══ SVG — Text, kein Bild: darin kann ein Skript stehen */
  function svgPruefen(b, melde) {
    var s = new TextDecoder("utf-8").decode(b);
    if (/<script[\s>]/i.test(s)) melde("SVG-SKRIPT", "Die Grafik enthält ein Skript (<script>). Im Browser geöffnet läuft es.");
    var h = s.match(/\son[a-z]+\s*=/i);
    if (h) melde("SVG-SKRIPT", "Die Grafik enthält einen Ereignis-Auslöser (" + h[0].trim().replace(/\s*=$/, "") + "=…).");
    if (/javascript:/i.test(s)) melde("SVG-SKRIPT", "Die Grafik enthält eine javascript:-Adresse.");
    if (/<foreignObject[\s>]/i.test(s)) melde("SVG-SKRIPT", "Die Grafik bettet fremdes HTML ein (<foreignObject>).");
    var wirte = {}, re = /(?:href|src)\s*=\s*["']\s*((?:https?:)?\/\/([A-Za-z0-9.\-]+))/gi, m;
    while ((m = re.exec(s)) !== null) {
      var w = m[2].toLowerCase(); if (w === "www.w3.org" || wirte[w]) continue;
      wirte[w] = 1; melde("SVG-VERWEIS", "Die Grafik lädt etwas von einem fremden Rechner: " + w);
    }
    var text = s.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ");
    return entitaeten(text).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  }
  function entitaeten(s) {
    return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (_a, n) { return String.fromCodePoint(+n); })
      .replace(/&#x([0-9a-f]+);/gi, function (_a, n) { return String.fromCodePoint(parseInt(n, 16)); })
      .replace(/&amp;/g, "&");
  }

  /* ══ ZIP / OFFICE — das Inhaltsverzeichnis am Ende der Datei */
  function zipEintraege(b) {
    var e = -1;
    for (var i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (u32(b, i) === 0x06054b50) { e = i; break; }
    if (e < 0) return null;
    var n = u16(b, e + 10), p = u32(b, e + 16), liste = [];
    for (var k = 0; k < n && p + 46 <= b.length; k++) {
      if (u32(b, p) !== 0x02014b50) break;
      var nl = u16(b, p + 28), xl = u16(b, p + 30), cl = u16(b, p + 32);
      liste.push({ name: new TextDecoder("utf-8").decode(b.subarray(p + 46, p + 46 + nl)), art: u16(b, p + 10),
        gepackt: u32(b, p + 20), roh: u32(b, p + 24), lokal: u32(b, p + 42) });
      p += 46 + nl + xl + cl;
    }
    return liste;
  }
  function zipLesen(b, e) {
    if (e.roh > 8 * 1048576) return Promise.resolve(null);   // Deckel: 8 MB entpackt
    var p = e.lokal; if (u32(b, p) !== 0x04034b50) return Promise.resolve(null);
    var daten = b.subarray(p + 30 + u16(b, p + 26) + u16(b, p + 28)).subarray(0, e.gepackt);
    if (e.art === 0) return Promise.resolve(daten);
    if (e.art !== 8 || typeof welt.DecompressionStream !== "function") return Promise.resolve(null);
    return Promise.resolve().then(function () {
      var ds = new welt.DecompressionStream("deflate-raw"), w = ds.writable.getWriter();
      w.write(daten).catch(function () {}); w.close().catch(function () {});
      return new Response(ds.readable).arrayBuffer();
    }).then(function (x) { return new Uint8Array(x); }, function () { return null; });
  }
  function officePruefen(b, name, melde) {
    var liste = zipEintraege(b);
    if (!liste) return Promise.resolve({ art: "zip", text: null, hinweis: "Das Inhaltsverzeichnis des Archivs ist nicht lesbar." });
    var namen = liste.map(function (x) { return x.name; });
    var art = namen.some(function (n) { return /^word\//.test(n); }) ? "docx" : namen.some(function (n) { return /^xl\//.test(n); }) ? "xlsx"
      : namen.some(function (n) { return /^ppt\//.test(n); }) ? "pptx" : "zip";
    var makro = namen.filter(function (n) { return /vbaProject\.bin$|\.bin$/i.test(n) && /vba/i.test(n); });
    if (makro.length) melde("OFFICE-MAKRO", "Die Datei enthält Makros (" + makro[0] + "). Makros sind Programme, die beim Öffnen laufen können.");
    var eingebettet = namen.filter(function (n) { return /\/embeddings\/|\/oleObject/i.test(n); });
    if (eingebettet.length) melde("OFFICE-EINBETTUNG", "In der Datei stecken " + eingebettet.length + " eingebettete Datei(en), z. B. " + eingebettet[0].split("/").pop() + ".");
    var prog = namen.filter(function (n) { return PROGRAMM_ENDUNG.test(n); });
    if (prog.length) melde("ANHANG-PROGRAMM", "Im Archiv liegt eine ausführbare Datei: " + prog[0]);
    var textTeile = liste.filter(function (x) {
      return /^word\/(document|header\d*|footer\d*|footnotes|comments)\.xml$/.test(x.name) || /^xl\/sharedStrings\.xml$/.test(x.name)
        || /^ppt\/(slides\/slide|notesSlides\/notesSlide)\d+\.xml$/.test(x.name) || /^docProps\/core\.xml$/.test(x.name);
    });
    var rels = liste.filter(function (x) { return /\.rels$/.test(x.name); });
    var texte = [], wirte = {}, unlesbar = 0;
    var kette = Promise.resolve();
    rels.concat(textTeile).slice(0, 80).forEach(function (e) {
      kette = kette.then(function () { return zipLesen(b, e); }).then(function (roh) {
        if (!roh) { unlesbar++; return; }
        var xml = new TextDecoder("utf-8").decode(roh);
        if (/\.rels$/.test(e.name)) {
          var re = /<Relationship\b[^>]*>/g, m;
          while ((m = re.exec(xml)) !== null) {
            if (!/TargetMode="External"/.test(m[0])) continue;
            var ziel = (/Target="([^"]*)"/.exec(m[0]) || [])[1] || "";
            var wm = /^(?:https?:|file:)?\/\/([^/"]+)/i.exec(ziel), wirt = wm ? wm[1].toLowerCase() : ziel.slice(0, 60);
            if (wirte[wirt]) continue; wirte[wirt] = 1;
            melde("OFFICE-VERWEIS", "Die Datei verweist auf etwas außerhalb: " + wirt +
              (/attachedTemplate|oleObject|frame/i.test(m[0]) ? " (wird beim Öffnen geladen)" : ""));
          }
        } else if (/core\.xml$/.test(e.name)) {
          var au = /<dc:creator>([^<]{1,120})<\/dc:creator>/.exec(xml), lm = /<cp:lastModifiedBy>([^<]{1,120})<\/cp:lastModifiedBy>/.exec(xml);
          if (au || lm) texte.push([au && au[1], lm && lm[1]].filter(Boolean).map(entitaeten).join("\n"));
        } else {
          texte.push(entitaeten(xml.replace(/<\/(w:p|a:p|si)>/g, "\n").replace(/<w:tab\/>/g, "\t").replace(/<[^>]+>/g, "")).trim());
        }
      });
    });
    return kette.then(function () {
      return { art: art, text: texte.filter(Boolean).join("\n"), hinweis: unlesbar ? unlesbar + " Teil(e) des Archivs waren nicht lesbar — die sind ungeprüft, nicht sauber." : "" };
    });
  }

  /* ══ DER SEITENTEXT EINES PDFs (Stufe 2 D, Klaus 2026-09-29)
   * pdf.js liest die Textebene jeder Seite. Es wird NICHT mitgeliefert (1,5 MB),
   * sondern von der App nachgeladen: pfade({pdfjs: "<Ordner>/"}) — im Netz
   * liegt es neben Workflow PDF. Steht schon ein pdfjsLib da (Node-Probe),
   * wird das genommen.
   * ⚠ isEvalSupported: false. pdf.js 3.x konnte mit einer präparierten Schrift
   *   eigenen Code ausführen (CVE-2024-4367); ohne eval geht dieser Weg nicht.
   * ⚠ Höchstens SEITEN_TEXT_MAX Seiten; was dahinter liegt, wird benannt.
   * Die Anweisungen an eine KI sucht dieselbe Liste wie im Mail-Eingang
   * (PrueferMail) — eine zweite Liste liefe auseinander. Fehlt sie, steht das da. */
  var SEITEN_TEXT_MAX = 100, PFADE = { pdfjs: null, tesseract: null }, pdfjsVersprechen = null;
  function pfade(neu) { for (var k in neu || {}) PFADE[k] = neu[k]; return PFADE; }
  function pdfjsHolen() {
    if (welt.pdfjsLib) return Promise.resolve(welt.pdfjsLib);
    if (!PFADE.pdfjs || !welt.document) return Promise.reject(new Error("pdf.js ist nicht erreichbar"));
    if (pdfjsVersprechen) return pdfjsVersprechen;
    pdfjsVersprechen = new Promise(function (ok, nein) {
      var s = welt.document.createElement("script"), uhr = setTimeout(function () { nein(new Error("pdf.js kam nicht an")); }, 20000);
      s.src = PFADE.pdfjs + "pdf.min.js";
      s.onload = function () {
        clearTimeout(uhr);
        if (!welt.pdfjsLib) return nein(new Error("pdf.js meldet sich nicht"));
        welt.pdfjsLib.GlobalWorkerOptions.workerSrc = PFADE.pdfjs + "pdf.worker.min.js";
        ok(welt.pdfjsLib);
      };
      s.onerror = function () { clearTimeout(uhr); nein(new Error("pdf.js kam nicht an")); };
      welt.document.head.appendChild(s);
    });
    pdfjsVersprechen.catch(function () { pdfjsVersprechen = null; });   // ein späterer Versuch darf es neu holen
    return pdfjsVersprechen;
  }
  function pdfSeitentext(b) {
    return pdfjsHolen().then(function (L) {
      return L.getDocument({ data: b.slice(0), isEvalSupported: false }).promise;
    }).then(function (doc) {
      var n = Math.min(doc.numPages, SEITEN_TEXT_MAX), seiten = [], kette = Promise.resolve();
      for (var i = 1; i <= n; i++) (function (nr) {
        kette = kette.then(function () { return doc.getPage(nr); }).then(function (pg) { return pg.getTextContent(); })
          .then(function (t) {
            var zeilen = [], z = "";
            t.items.forEach(function (it) { z += it.str; if (it.hasEOL) { zeilen.push(z); z = ""; } else if (it.str) z += " "; });
            if (z) zeilen.push(z);
            seiten.push({ seite: nr, text: zeilen.map(function (x) { return x.replace(/\s+/g, " ").trim(); }).filter(Boolean).join("\n") });
          });
      })(i);
      return kette.then(function () { return { seiten: seiten, alle: doc.numPages, doc: doc }; });
    });
  }
  /* ══ TEXT IM BILD — Stufe 2 A (2026-09-30)
   * Tesseract.js 7.0.0 liegt im eigenen Ordner der App (vendor/tesseract/, 21 MB,
   * nicht im Installations-Vorrat); die App setzt pfade({tesseract}). Gelesen
   * wird Deutsch, Englisch und Russisch in einem Durchgang.
   * ⚠ Gewählte Zahlen, nicht gemessen am Tablet:
   *   OCR_FRIST 90 s je Bild — das erste Bild trägt das Laden der Sprachdaten
   *   (9,5 MB) mit. OCR_SICHER 60 — Zeilen mit geringerer Sicherheit zählen
   *   nicht (Kanten und Muster eines Fotos liest Tesseract sonst als Buchstaben).
   *   OCR_SEITEN_MAX 10 PDF-Seiten ohne Textebene; dahinter wird benannt.
   *   OCR_KANTE 3000 px lange Kante; größere Bilder werden verkleinert gelesen. */
  var OCR_SPRACHEN = ["deu", "eng", "rus"], OCR_FRIST = 90000, OCR_SICHER = 60, OCR_SEITEN_MAX = 10, OCR_KANTE = 3000;
  var tessVersprechen = null;
  function absolut(u) { try { return welt.location ? new URL(u, welt.location.href).href : u; } catch (_e) { return u; } }
  function tesseractHolen() {
    if (tessVersprechen) return tessVersprechen;
    if (!welt.Tesseract && (!PFADE.tesseract || !welt.document)) return Promise.reject(new Error("die Texterkennung ist nicht erreichbar"));
    /* Unter file:// startet der Worker nicht, er HÄNGT bis zur Frist (gemessen
       2026-09-30). Dann lieber sofort und mit Grund. */
    if (!welt.Tesseract && welt.location && welt.location.protocol === "file:") return Promise.reject(new Error("die Texterkennung läuft nicht aus einer lokal geöffneten Datei (file://)"));
    var basis = PFADE.tesseract ? absolut(PFADE.tesseract) : "";
    tessVersprechen = (welt.Tesseract ? Promise.resolve(welt.Tesseract) : new Promise(function (ok, nein) {
      var s = welt.document.createElement("script"), uhr = setTimeout(function () { nein(new Error("die Texterkennung kam nicht an")); }, 30000);
      s.src = basis + "tesseract.min.js";
      s.onload = function () { clearTimeout(uhr); welt.Tesseract ? ok(welt.Tesseract) : nein(new Error("die Texterkennung meldet sich nicht")); };
      s.onerror = function () { clearTimeout(uhr); nein(new Error("die Texterkennung kam nicht an")); };
      welt.document.head.appendChild(s);
    })).then(function (T) {
      return T.createWorker(OCR_SPRACHEN, 1, { workerPath: basis + "worker.min.js", corePath: basis, langPath: basis + "lang",
        gzip: false, cacheMethod: "none" });
    });
    tessVersprechen.catch(function () { tessVersprechen = null; });   // ein späterer Versuch darf neu holen
    return tessVersprechen;
  }
  /* quelle: ein Canvas oder Bild-Bytes. Gibt {zeilen:[text], unsicher:n} zurück.
     bis: Zeitpunkt (Date.now()), an dem die Frist endet — zwei Durchgänge teilen
     sich EINE Frist (Stufe 2 B). Ohne bis gilt OCR_FRIST ab jetzt. */
  function bildLesen(quelle, bis) {
    var rest = Math.max(1, (bis || Date.now() + OCR_FRIST) - Date.now());
    var uhr, frist = new Promise(function (_ok, nein) { uhr = setTimeout(function () { nein(new Error("Zeit abgelaufen (" + OCR_FRIST / 1000 + " s)")); }, rest); });
    var arbeit = tesseractHolen().then(function (w) {
      return w.recognize(quelle, {}, { blocks: true, text: false });
    }).then(function (r) {
      var zeilen = [], unsicher = 0, alle = [], boxen = [], alleBoxen = [];
      /* Je Zeile ihr Kasten als ANTEIL der gelesenen Leinwand (0…1) — so passt
         er auf das Bild in jeder Größe (Markierung, Klaus 2026-10-01). Ohne
         Leinwand (Node) gibt es keine Maße, dann null. */
      var bw = quelle && quelle.width, bh = quelle && quelle.height;
      function kasten(li) {
        var b = li.bbox;
        if (!b || !(bw > 0) || !(bh > 0)) return null;
        return { x: b.x0 / bw, y: b.y0 / bh, w: (b.x1 - b.x0) / bw, h: (b.y1 - b.y0) / bh };
      }
      ((r && r.data && r.data.blocks) || []).forEach(function (bl) {
        (bl.paragraphs || []).forEach(function (pa) {
          (pa.lines || []).forEach(function (li) {
            var t = String(li.text || "").replace(/\s+/g, " ").trim();
            if (!t || !/[\p{L}\p{N}]/u.test(t)) return;
            alle.push(t); alleBoxen.push(kasten(li));
            if (!(li.confidence >= OCR_SICHER)) { unsicher++; return; }
            zeilen.push(t); boxen.push(kasten(li));
          });
        });
      });
      return { zeilen: zeilen, unsicher: unsicher, alle: alle, boxen: boxen, alleBoxen: alleBoxen };
    });
    return Promise.race([arbeit, frist]).then(function (x) { clearTimeout(uhr); return x; }, function (e) {
      clearTimeout(uhr);
      /* Ein hängender Leser darf das nächste Bild nicht mitnehmen. */
      if (/Zeit abgelaufen/.test(e && e.message) && tessVersprechen) {
        tessVersprechen.then(function (w) { try { w.terminate(); } catch (_e) {} }, function () {});
        tessVersprechen = null;
      }
      throw e;
    });
  }
  /* Bild-Bytes → Canvas (lange Kante höchstens OCR_KANTE). Ohne Browser: die Bytes selbst. */
  function bildQuelle(b, art) {
    if (!welt.document || !welt.createImageBitmap || !welt.Blob) return Promise.resolve(b);
    return welt.createImageBitmap(new welt.Blob([b], { type: "image/" + art })).then(function (bm) {
      var f = Math.min(1, OCR_KANTE / Math.max(bm.width, bm.height)), c = welt.document.createElement("canvas");
      c.width = Math.max(1, Math.round(bm.width * f)); c.height = Math.max(1, Math.round(bm.height * f));
      var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(bm, 0, 0, c.width, c.height); if (bm.close) bm.close();
      return c;
    }, function () { return b; });
  }
  /* Den gelesenen Text auf Anweisungen an eine KI prüfen — dieselbe Liste wie
     der Mail-Eingang. wo: "" beim Bild, "Seite n, " beim PDF. */
  /* Punkt 7 (2026-10-01): auch unsichtbare Zeichen (ohne Breite, Richtungs-
     wechsel) im gelesenen Text. Die Texterkennung liefert sie selten, aber
     wenn, dann sind sie kein Zufall. Die Kennung bleibt die des Textes. */
  var BILDTEXT_ARTEN = { "KI-ANWEISUNG": "BILD-KI-ANWEISUNG", "UNSICHTBARE-ZEICHEN": "UNSICHTBARE-ZEICHEN" };
  function bildtextPruefen(text, wo, melde, hinweise, boxen) {
    var PM = welt.PrueferMail;
    if (!PM) { hinweise.push("Der Text im Bild wurde gelesen, aber die Liste der KI-Anweisungen (assets/pruefer-mail.js) ist nicht geladen — auf Anweisungen an eine KI ist er ungeprüft."); return; }
    PM.pruefeMail(text).stellen.forEach(function (st) {
      var k = BILDTEXT_ARTEN[st.kennung]; if (!k) return;
      melde(k, st.satz + " (" + wo + "Bildtext Zeile " + st.zeile + ")", boxen ? boxen[st.zeile - 1] : null);
    });
  }
  /* ══ BLASSER TEXT — Stufe 2 B (2026-09-30)
   * Hellgrau auf Weiß übersieht ein Mensch, eine Bild-KI liest es trotzdem.
   * Der zweite Durchgang liest dasselbe Bild nach einer Kontrast-Spreizung:
   * je Kachel wird die Papier-Helligkeit bestimmt (hellster Wert der Kachel
   * und ihrer acht Nachbarn) und jede Abweichung davon um KONTRAST_VERST
   * verstärkt. Was NUR in diesem Durchgang steht, ist blass — der
   * Unterschied ist der Befund. Gemeldet wird eine Anweisung an eine KI darin
   * als BILD-KI-ANWEISUNG mit dem Wort „blass“ in der Stelle.
   * ⚠ Gewählte Zahlen, nicht gemessen am Tablet: KONTRAST_KACHEL 32 px,
   *   KONTRAST_VERST 8 (eine Abweichung ab 32 Stufen wird schwarz; #ececec
   *   auf Weiß sind 19 Stufen). Beide Durchgänge teilen sich OCR_FRIST.
   * ⚠ BENANNTE GRENZE: nur für Bilder. Gescannte PDF-Seiten werden einmal
   *   gelesen, nicht zweimal. Ohne Browser (keine Leinwand) gibt es keinen
   *   zweiten Durchgang, und das wird gesagt. */
  var KONTRAST_KACHEL = 32, KONTRAST_VERST = 8;
  function kontrastStrecken(d, w, h) {
    var K = KONTRAST_KACHEL, kx = Math.ceil(w / K), ky = Math.ceil(h / K), hell = new Uint8Array(kx * ky), grau = new Uint8Array(w * h);
    for (var i = 0, n = w * h; i < n; i++) grau[i] = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var t = ((y / K) | 0) * kx + ((x / K) | 0), v = grau[y * w + x];
      if (v > hell[t]) hell[t] = v;
    }
    var papier = new Uint8Array(kx * ky);
    for (var ty = 0; ty < ky; ty++) for (var tx = 0; tx < kx; tx++) {
      var m = 0;
      for (var a = -1; a <= 1; a++) for (var c = -1; c <= 1; c++) {
        var yy = ty + a, xx = tx + c;
        if (yy >= 0 && yy < ky && xx >= 0 && xx < kx && hell[yy * kx + xx] > m) m = hell[yy * kx + xx];
      }
      papier[ty * kx + tx] = m;
    }
    var aus = new Uint8ClampedArray(w * h * 4);
    for (var y2 = 0; y2 < h; y2++) for (var x2 = 0; x2 < w; x2++) {
      var j = y2 * w + x2, p = papier[((y2 / K) | 0) * kx + ((x2 / K) | 0)];
      var g = 255 - Math.min(255, Math.max(0, p - grau[j]) * KONTRAST_VERST);
      aus[j * 4] = aus[j * 4 + 1] = aus[j * 4 + 2] = g; aus[j * 4 + 3] = 255;
    }
    return aus;
  }
  function gestreckt(c) {
    if (!c || !c.getContext || !welt.document) return null;
    var g = c.getContext("2d"), bild = g.getImageData(0, 0, c.width, c.height);
    var z = welt.document.createElement("canvas"); z.width = c.width; z.height = c.height;
    var neu = z.getContext("2d").createImageData(c.width, c.height);
    neu.data.set(kontrastStrecken(bild.data, c.width, c.height));
    z.getContext("2d").putImageData(neu, 0, 0);
    return z;
  }
  /* Eine Zeile des zweiten Durchgangs ist NEU, wenn weniger als die Hälfte
     ihrer Wörter (ab 3 Buchstaben) schon im ersten Durchgang vorkam. Ein
     wörtlicher Vergleich reichte nicht: Tesseract liest dieselbe dunkle Zeile
     nach der Spreizung manchmal um ein Zeichen anders. */
  function woerter(t) { return (String(t).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []); }
  function neueZeilen(erste, zweite) {
    var bekannt = {};
    erste.forEach(function (z) { woerter(z).forEach(function (w) { bekannt[w] = true; }); });
    return zweite.filter(function (z) {
      var ws = woerter(z); if (!ws.length) return false;
      return ws.filter(function (w) { return bekannt[w]; }).length * 2 < ws.length;
    });
  }
  /* Jede blasse Zeile einzeln, mit ihrer Nummer im zweiten Durchgang (der
     sieht alle Zeilen, die dunklen und die blassen). */
  function blassPruefen(blass, alle, melde, hinweise, alleBoxen) {
    var PM = welt.PrueferMail;
    if (!PM) { hinweise.push("Der blasse Text wurde gelesen, aber die Liste der KI-Anweisungen (assets/pruefer-mail.js) ist nicht geladen — auf Anweisungen an eine KI ist er ungeprüft."); return; }
    blass.forEach(function (z) {
      PM.pruefeMail(z).stellen.forEach(function (st) {
        var k = BILDTEXT_ARTEN[st.kennung]; if (!k) return;
        melde(k, st.satz + " (blass, erst nach Kontrast-Spreizung lesbar: Bildtext Zeile " + (alle.indexOf(z) + 1) + ")",
              alleBoxen ? alleBoxen[alle.indexOf(z)] : null);
      });
    });
  }
  function bildTextPruefen(b, art, melde, hinweise, stand) {
    var bis = Date.now() + OCR_FRIST, quelle;
    return bildQuelle(b, art).then(function (q) { quelle = q; return bildLesen(q, bis); }).then(function (r) {
      var z2 = gestreckt(quelle), zweiter = !z2 ? Promise.resolve({ fehlt: "ohne Leinwand (nur im Browser)" }) :
        bildLesen(z2, bis).then(null, function (e) { return { fehlt: (e && e.message) || "unbekannt" }; });
      return zweiter.then(function (r2) {
        var blass = r2.fehlt ? [] : neueZeilen(r.zeilen, r2.zeilen);
        if (!r.zeilen.length && !blass.length) {
          stand.bildUngeprueft = true;
          hinweise.push("Text im Bild ungeprüft: die Texterkennung fand keine sicher lesbare Zeile" +
            (r.unsicher ? " (" + r.unsicher + " unsichere verworfen)" : "") + ". Ein Bild ohne Text sieht genauso aus.");
        }
        var text = r.zeilen.length ? r.zeilen.join("\n") : null;
        if (r.zeilen.length) {
          hinweise.push("Text im Bild gelesen: " + r.zeilen.length + " Zeile(n)" + (r.unsicher ? ", " + r.unsicher + " unsichere verworfen" : "") + ".");
          /* Punkt 6 b: eine verworfene Zeile ist eine NICHT geprüfte Zeile. */
          if (r.unsicher) {
            ungeprueft(stand, "Text im Bild teilweise ungeprüft");
            hinweise.push(r.unsicher + " Zeile(n) im Bild waren zu unsicher gelesen (unter " + OCR_SICHER + " %) und wurden verworfen — dort ist der Text ungeprüft, nicht sauber.");
          }
          bildtextPruefen(text, "", melde, hinweise, r.boxen);
        }
        if (r2.fehlt) hinweise.push("Blasser Text ungeprüft: der zweite Lesedurchgang mit mehr Kontrast lief nicht (" + r2.fehlt + ").");
        else if (blass.length) {
          hinweise.push("Blasser Text: " + blass.length + " Zeile(n) erst nach Kontrast-Spreizung lesbar — ein Mensch übersieht sie, eine Bild-KI nicht.");
          blassPruefen(blass, r2.zeilen, melde, hinweise, r2.boxen);
          text = (text ? text + "\n" : "") + blass.join("\n");
        } else hinweise.push("Blasser Text: der zweite Lesedurchgang mit mehr Kontrast fand keine weitere Zeile.");
        return text;
      });
    }, function (e) {
      stand.bildUngeprueft = true;
      hinweise.push("Text im Bild ungeprüft: die Texterkennung lief nicht (" + ((e && e.message) || "unbekannt") + ").");
      return null;
    });
  }
  /* Eine PDF-Seite ohne Textebene zeichnen und lesen. */
  function seiteLeinwand(doc, nr, mitKaesten) {
    return doc.getPage(nr).then(function (pg) {
      var v1 = pg.getViewport({ scale: 1 }), f = Math.min(2, OCR_KANTE / Math.max(v1.width, v1.height)), vp = pg.getViewport({ scale: f });
      var c = welt.document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      return pg.render({ canvasContext: g, viewport: vp }).promise.then(function () {
        if (!mitKaesten) return c;
        return pg.getTextContent().then(function (t) { c.__kaesten = wortKaesten(t.items, vp); return c; });
      });
    });
  }
  /* Je Wort der Textebene sein Kasten auf der gezeichneten Seite (in Pixeln).
     pdf.js gibt je Stück Lage, Breite und Schriftgröße; ein Wort bekommt den
     Anteil der Breite, der seinen Zeichen entspricht (genähert, reicht für die
     Frage „steht dort Schrift?"). */
  function wortKaesten(items, vp) {
    var aus = [];
    items.forEach(function (it) {
      if (!it.str || !it.transform) return;
      var t = it.transform, h = Math.hypot(t[2], t[3]) || Math.abs(it.height) || 0, w = it.width || 0;
      var p0 = vp.convertToViewportPoint(t[4], t[5]), p1 = vp.convertToViewportPoint(t[4] + w, t[5] + h);
      var x0 = Math.min(p0[0], p1[0]), x1 = Math.max(p0[0], p1[0]), y0 = Math.min(p0[1], p1[1]), y1 = Math.max(p0[1], p1[1]);
      var s = it.str, re = /[\p{L}\p{N}]+/gu, m;
      while ((m = re.exec(s))) aus.push({ w: m[0].toLowerCase(), x0: x0 + (x1 - x0) * m.index / s.length, x1: x0 + (x1 - x0) * (m.index + m[0].length) / s.length, y0: y0, y1: y1 });
    });
    return aus;
  }
  /* Steht im Kasten sichtbare Schrift? Winzig (unter GEGEN_MIN_PX Pixel hoch)
     oder außerhalb der Seite zählt als NICHT sichtbar; sonst muss die Helligkeit
     im Kasten um mindestens GEGEN_TINTE schwanken. Weiß auf Weiß, Rendermodus 3
     auf leerem Grund: kein Ausschlag. */
  var GEGEN_MIN_PX = 4, GEGEN_TINTE = 40;
  function tinteIm(c, k) {
    if (k.y1 - k.y0 < GEGEN_MIN_PX) return false;
    var x0 = Math.max(0, Math.floor(k.x0)), x1 = Math.min(c.width, Math.ceil(k.x1)), y0 = Math.max(0, Math.floor(k.y0)), y1 = Math.min(c.height, Math.ceil(k.y1));
    if (x1 - x0 < 1 || y1 - y0 < 1) return false;
    var d = c.getContext("2d").getImageData(x0, y0, x1 - x0, y1 - y0).data, lo = 255, hi = 0;
    for (var i = 0; i < d.length; i += 4) { var l = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000; if (l < lo) lo = l; if (l > hi) hi = l; }
    return hi - lo >= GEGEN_TINTE;
  }
  function seiteLesen(doc, nr) { return seiteLeinwand(doc, nr).then(function (c) { return bildLesen(c); }); }
  function scanSeitenLesen(doc, leer, melde, hinweise, stand) {
    var liste = leer.slice(0, OCR_SEITEN_MAX), gelesen = [], kette = Promise.resolve(), abbruch = null;
    if (!welt.document) {
      stand.bildUngeprueft = true;
      hinweise.push(leer.length + " Seite(n) ohne Textebene (" + leer.slice(0, 8).join(", ") + (leer.length > 8 ? " …" : "") + ") — Text im Bild ungeprüft: die Texterkennung läuft nur im Browser.");
      return Promise.resolve(gelesen);
    }
    liste.forEach(function (nr) {
      kette = kette.then(function () {
        if (abbruch) return;
        return seiteLesen(doc, nr).then(function (r) {
          if (!r.zeilen.length) { stand.bildUngeprueft = true; hinweise.push("Seite " + nr + " ohne Textebene: Text im Bild ungeprüft — die Texterkennung fand keine sicher lesbare Zeile."); return; }
          var text = r.zeilen.join("\n");
          gelesen.push({ seite: nr, text: text, bild: true });
          hinweise.push("Seite " + nr + " ohne Textebene: Text im Bild gelesen, " + r.zeilen.length + " Zeile(n).");
          bildtextPruefen(text, "Seite " + nr + ", ", melde, hinweise);
        }, function (e) { abbruch = e; });
      });
    });
    return kette.then(function () {
      var rest = abbruch ? leer.filter(function (n) { return !gelesen.some(function (x) { return x.seite === n; }); }) : leer.slice(OCR_SEITEN_MAX);
      if (rest.length) stand.bildUngeprueft = true;
      if (abbruch) hinweise.push("Text im Bild ungeprüft auf Seite " + rest.slice(0, 8).join(", ") + (rest.length > 8 ? " …" : "") + ": die Texterkennung lief nicht (" + ((abbruch && abbruch.message) || "unbekannt") + ").");
      else if (rest.length) hinweise.push("Seiten ohne Textebene hinter den ersten " + OCR_SEITEN_MAX + " (" + rest.slice(0, 8).join(", ") + (rest.length > 8 ? " …" : "") + ") wurden NICHT gelesen — dort ist der Text im Bild ungeprüft.");
      return gelesen;
    });
  }
  /* ══ STUFE 2 E · WAS MAN SIEHT GEGEN DAS, WAS IM TEXT STEHT (2026-09-30)
   * Je PDF-Seite wird die Textebene (pdf.js, D) mit dem verglichen, was die
   * Texterkennung auf dem GEZEICHNETEN Bild derselben Seite liest (A). Wörter,
   * die nur in der Textebene stehen, sieht ein Mensch nicht: weiß auf weiß,
   * winzig, außerhalb der Seite, Darstellungsart 3. Eine KI liest sie trotzdem. Befund PDF-VERSTECKTER-TEXT, Stelle „Seite n".
   *
   * Verglichen wird wie bei B über Wörter ab 3 Buchstaben/Ziffern. Ein Wort
   * gilt als GESEHEN, wenn es im gelesenen Bild steht — als Wort, als Teil der
   * zusammengeschriebenen Zeilen (Silbentrennung, zusammengelesene Wörter) oder
   * mit einem verlesenen Zeichen — die letzten beiden erst ab 5 Zeichen, sonst
   * steckt „and" in jedem „Land". Gelesen werden dafür
   * AUCH die unsicheren Zeilen: jede verworfene Zeile wäre ein Schein-Fund.
   *
   * ⚠ „nicht gelesen" ist noch nicht „unsichtbar". Gemessen am 2026-09-30 an
   * 0D, 3E und 104 sauberen Seiten aus 18 PDFs der eigenen Depots: die
   * Texterkennung übersah auf sauberen Seiten bis zu 12 Wörter AM STÜCK
   * (kleine Schrift auf einem Foto, grau auf dunkel) — mehr als 0D (10).
   * Keine Zählung trennt das. Deshalb wird jedes fehlende Wort an SEINER
   * Stelle im gezeichneten Bild nachgesehen (tinteIm): Schrift dort → verlesen,
   * kein Befund. Danach: saubere Seiten 0 versteckte Wörter (alle 104), 0D
   * Seite 2: 10, 3E Seite 1: 12, 0D Seite 1: 0.
   *
   * GEGEN_MIN_VERSTECKT = 2: so viele unsichtbare Wörter braucht der Befund.
   * Gewählt zwischen 0 (sauber) und 10 (0D) — ein einzelnes Wort ist kein
   * Satz an eine KI, und eine Kasten-Näherung kann einmal danebenliegen.
   *
   * ⚠ GRENZE: Text HINTER oder ÜBER einem Foto fällt durch — dort zählen die
   * Bildpunkte als Tinte. In 3E liegt ein Teil der Anweisung über der
   * sichtbaren Zeile; gemeldet werden die übrigen 12 Wörter. */
  var GEGEN_SEITEN_MAX = 10, GEGEN_MIN_VERSTECKT = 2;
  function versteckteWoerter(fehlt, kaesten, tinte) {
    return fehlt.filter(function (w) {
      var da = kaesten.filter(function (x) { return x.w === w || (w.length >= 5 && x.w.indexOf(w) >= 0); });
      return da.length > 0 && da.every(function (x) { return !tinte(x); });
    });
  }
  function aehnlich(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    var i = 0, j = 0, fehler = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++fehler > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return fehler + (a.length - i) + (b.length - j) <= 1;
  }
  function vergleiche(textebene, bildzeilen) {
    var gesehen = {}, ganz = "", liste = [];
    bildzeilen.forEach(function (z) { woerter(z).forEach(function (w) { if (!gesehen[w]) { gesehen[w] = true; liste.push(w); } }); ganz += String(z).toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""); });
    /* Die Textebene in Lesefolge, auch die kurzen Stücke: pdf.js zerlegt ein
       Wort manchmal in zwei („Eng lish"). Ein Stück gilt dann als gesehen,
       wenn es mit seinem Nachbarn zusammen im Bild steht. */
    var stuecke = String(textebene).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    var alle = [], fehlt = [], schon = {};
    stuecke.forEach(function (w, i) {
      if (w.length < 3) return;
      var weg = !(gesehen[w] ||
        (w.length >= 5 && (ganz.indexOf(w) >= 0 || liste.some(function (o) { return aehnlich(w, o); }))) ||
        (function () { var vor = stuecke[i - 1], nach = stuecke[i + 1];
          return (vor && (vor + w).length >= 5 && ganz.indexOf(vor + w) >= 0) || (nach && (w + nach).length >= 5 && ganz.indexOf(w + nach) >= 0); })());
      if (schon[w]) return;
      schon[w] = true; alle.push(w);
      if (weg) fehlt.push(w);
    });
    return { woerter: alle.length, fehlt: fehlt };
  }
  function gegenlesen(doc, seiten, gesamt, leer, melde, hinweise, stand) {
    var mitText = seiten.filter(function (x) { return x.text; }).map(function (x) { return x.seite; });
    var liste = mitText.filter(function (n) { return n <= GEGEN_SEITEN_MAX; });
    if (!mitText.length) return Promise.resolve();
    if (!welt.document) {
      stand.bildUngeprueft = true;
      hinweise.push("Textebene NICHT gegen das Seitenbild gelesen (" + liste.length + " Seite(n)) — das geht nur im Browser. Ob unsichtbarer Text darin steht, ist ungeprüft.");
      return Promise.resolve();
    }
    var t0 = Date.now(), gelesen = 0, abbruch = null, kette = Promise.resolve();
    liste.forEach(function (nr) {
      kette = kette.then(function () {
        if (abbruch) return;
        var text = (seiten.filter(function (x) { return x.seite === nr; })[0] || {}).text || "";
        var leinwand;
        return seiteLeinwand(doc, nr, true).then(function (c) { leinwand = c; return bildLesen(c); }).then(function (r) {
          /* Liest die Erkennung auf dem Bild GAR NICHTS, ist das kein „ungeprüft":
             eine Seite, deren ganzer Text unsichtbar ist, sieht genau so aus. */
          gelesen++;
          var v = vergleiche(text, r.alle);
          /* Was die Erkennung nicht las, wird an seiner Stelle im Bild
             nachgesehen: steht dort Schrift, hat sie sich verlesen (kleine
             Schrift auf einem Foto, grau auf dunkel) — das ist kein Befund. */
          v.versteckt = versteckteWoerter(v.fehlt, leinwand.__kaesten || [], function (k) { return tinteIm(leinwand, k); });
          if (v.versteckt.length >= GEGEN_MIN_VERSTECKT)
            melde("PDF-VERSTECKTER-TEXT", "Was man sieht und was im Text steht, weicht ab (Seite " + nr + "): " + v.versteckt.length + " von " + v.woerter +
              " Wörtern der Textebene sind auf der Seite nicht zu sehen — „" + v.versteckt.slice(0, 12).join(" ") + (v.versteckt.length > 12 ? " …" : "") + "“.");
        }, function (e) { abbruch = e; });
      });
    });
    return kette.then(function () {
      var s = (Date.now() - t0) / 1000;
      if (gelesen) hinweise.push("Textebene gegen das Seitenbild gelesen: " + gelesen + " Seite(n) in " + s.toFixed(1).replace(".", ",") + " s (" + (s / gelesen).toFixed(1).replace(".", ",") + " s je Seite).");
      if (abbruch) {
        stand.bildUngeprueft = true;
        var rest = liste.slice(gelesen);
        hinweise.push("Textebene NICHT gegengelesen auf Seite " + rest.slice(0, 8).join(", ") + (rest.length > 8 ? " …" : "") + ": die Texterkennung lief nicht (" + ((abbruch && abbruch.message) || "unbekannt") + ") — ungeprüft, nicht sauber.");
      }
      if (gesamt > GEGEN_SEITEN_MAX) hinweise.push("Seiten " + (GEGEN_SEITEN_MAX + 1) + "–" + gesamt + " nicht gegengelesen (höchstens " + GEGEN_SEITEN_MAX + ") — ob dort unsichtbarer Text steht, ist ungeprüft.");
      if (leer.length) hinweise.push("Seiten ohne Textebene (" + leer.slice(0, 8).join(", ") + (leer.length > 8 ? " …" : "") + ") haben nichts zum Gegenlesen; ihr Bild läuft über die Texterkennung (oben).");
    });
  }
  function pdfTextPruefen(b, melde, hinweise, stand) {
    var frist = new Promise(function (_ok, nein) { setTimeout(function () { nein(new Error("Zeit abgelaufen")); }, 60000); });
    return Promise.race([pdfSeitentext(b), frist]).then(function (r) {
      var leer = r.seiten.filter(function (x) { return !x.text; }).map(function (x) { return x.seite; });
      var PM = welt.PrueferMail;
      if (!PM) hinweise.push("Der Seitentext wurde gelesen, aber die Liste der KI-Anweisungen (assets/pruefer-mail.js) ist nicht geladen — auf Anweisungen an eine KI ist er ungeprüft.");
      else r.seiten.forEach(function (x) {
        if (!x.text) return;
        PM.pruefeMail(x.text).stellen.forEach(function (st) {
          if (st.kennung === "UNSICHTBARE-ZEICHEN") { melde(st.kennung, st.satz + " (Seite " + x.seite + ", Zeile " + st.zeile + ")"); return; }
          if (st.kennung !== "KI-ANWEISUNG") return;
          melde("PDF-KI-ANWEISUNG", st.satz + " (Seite " + x.seite + ", Zeile " + st.zeile + ")");
        });
      });
      hinweise.push("Seitentext gelesen: " + r.seiten.length + " von " + r.alle + " Seite(n).");
      if (r.alle > r.seiten.length) hinweise.push("Seiten " + (r.seiten.length + 1) + "–" + r.alle + " wurden NICHT gelesen (höchstens " + SEITEN_TEXT_MAX + ") — dort ungeprüft, nicht sauber.");
      var mitText = r.seiten.filter(function (x) { return x.text; });
      var fertig = function (x) { try { r.doc.destroy(); } catch (_e) {} return x; };
      var scan = leer.length ? scanSeitenLesen(r.doc, leer, melde, hinweise, stand).then(null, function () { return []; }) : Promise.resolve([]);
      return scan.then(function (g) {
        return gegenlesen(r.doc, r.seiten, r.alle, leer, melde, hinweise, stand).then(null, function () {}).then(function () {
          return fertig(mitText.concat(g).sort(function (a, z) { return a.seite - z.seite; }));
        });
      });
    }, function (e) {
      var grund = /password/i.test((e && (e.name + e.message)) || "") ? "das PDF ist mit einem Passwort geschützt" : (e && e.message) || "unbekannt";
      hinweise.push("Der Seitentext des PDFs wurde NICHT gelesen (" + grund + ") — er ist ungeprüft, nicht sauber.");
      ungeprueft(stand, "Seitentext des PDFs ungeprüft");
      return null;
    });
  }

  /* ══ HTML-ANHANG — der vorhandene HTML-Prüfer (pruefer.js), nicht neu erfunden.
   * Übernommen wird nur FREMDE-ADRESSE: ein Skript, ein Bild (Zählpixel), ein
   * Formular oder ein Stylesheet von einem fremden Rechner — das, was eine Seite
   * beim Öffnen nachlädt oder wohin sie schickt. Fehlender alt-Text, fehlende
   * Sprache und Bau-Reste sind Fragen an eine eigene Webseite, keine Gefahr in
   * einem Anhang; als Befund wären sie in jeder harmlosen Seite ein Fehlalarm.
   * Ein <a href> ist kein Abruf (so misst es pruefer.js seit 2026-08-20). Fehlt
   * pruefer.js, heißt die Seite „ungeprüft", nie sauber. */
  var HTML_UEBERNOMMEN = ["FREMDE-ADRESSE"];
  function htmlPruefen(b, melde, hinweise, stand) {
    var t = new TextDecoder("utf-8").decode(b).replace(/^\uFEFF/, "");
    var H = welt.Auslieferungspruefer;
    if (!H || typeof H.pruefe !== "function") {
      hinweise.push("Der HTML-Prüfer (assets/pruefer.js) ist nicht geladen — die Seite ist ungeprüft, nicht sauber.");
      stand.bildUngeprueft = true;
      return t;
    }
    H.pruefe(t, []).forEach(function (x) {
      if (HTML_UEBERNOMMEN.indexOf(x.kennung) >= 0) melde(x.kennung, x.satz + " (Zeile " + x.zeile + ")");
    });
    hinweise.push("Als HTML-Seite gelesen: gesucht wurde, was sie von fremden Rechnern lädt oder dorthin schickt. Ausgeführt oder angezeigt wurde sie nicht.");
    /* Weiter geht der SICHTBARE Text, nicht der Quelltext: sonst läse die
       Textprüfung jedes Linkziel als fremde Adresse (gemessen im Browser an
       einer harmlosen Einladung). Adressen im Markup misst pruefer.js oben. */
    var sichtbar = t.replace(/<!--[\s\S]*?-->/g, " ").replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
    return entitaeten(sichtbar).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  }

  /* ══ VERSTECKTE DATEN IN BILDPUNKTEN — Stufe 2 C (2026-10-01)
   * Nur auf einen eigenen Knopf (Klaus 2026-09-29), und das Ergebnis heißt
   * „Verdacht", nie „gefunden".
   * GEMESSEN, BEVOR GEBAUT WURDE (17 Testfotos aus Workflow-PDF, als
   * verlustfreie Bildpunkte, dazu sechs Testvorlagen):
   *   · Chi-Quadrat auf den Wertepaaren (Westfeld/Pfitzmann), wachsende Fenster
   *     ab dem ersten Bildpunkt: auf SAUBEREN Fotos bis 4096 Bildpunkte mit
   *     p ≥ 0,01 — Fehlalarme. Und 4C trifft es nicht verlässlich: dort steht
   *     Klartext auf weißem Grund, die Bits sind nicht gleich verteilt.
   *   · Text aus den untersten Bits lesen: 0 Fehlalarme auf allen 23 Bildern,
   *     4C mit Botschaft gefunden, 4C ohne nicht. Gebaut ist nur das.
   * Gelesen werden die untersten Bits ab dem ersten Bildpunkt, Zeile für
   * Zeile, in vier Wegen (Rot, Grün, Blau, alle drei der Reihe nach), höchstes
   * Bit zuerst. Verdacht heißt: (a) 16 Bit Länge, dann so viele Bytes gültiger
   * Text ohne Steuerzeichen (mindestens VERDACHT_MIN_TEXT Zeichen), oder (b)
   * ohne Längenangabe mindestens VERDACHT_MIN_LAUF druckbare Zeichen in Folge.
   * ⚠ BENANNTE GRENZEN: verschlüsselte, gepackte oder verstreute Botschaften
   *   erkennt das nicht (sie sehen aus wie Rauschen) · JPEG und verlustbehaftetes
   *   WebP haben keine verlässlichen untersten Bits → „nicht geprüft" · GIF
   *   (Farbtabelle) → „nicht geprüft" · durchsichtige Bildpunkte verlieren beim
   *   Zeichnen ihre untersten Bits → benannt · über VERDACHT_MAX_PIXEL → „nicht
   *   geprüft". Die Zahlen 8 und 16 und die Grenze sind gewählt, nicht am Tablet
   *   gemessen. */
  var VERDACHT_MIN_TEXT = 8, VERDACHT_MIN_LAUF = 16, VERDACHT_LESEN_MAX = 70000, VERDACHT_MAX_PIXEL = 40000000;
  var LSB_WEGE = [["Rot", [0]], ["Grün", [1]], ["Blau", [2]], ["Rot, Grün und Blau", [0, 1, 2]]];
  function lsbBytes(d, n, kanaele, anzahl) {
    var out = new Uint8Array(anzahl), bit = 0, max = anzahl * 8;
    for (var i = 0; i < n && bit < max; i++)
      for (var c = 0; c < kanaele.length && bit < max; c++) {
        if (d[i * 4 + kanaele[c]] & 1) out[bit >> 3] |= 128 >> (bit & 7);
        bit++;
      }
    return out;
  }
  function lsbDruckbar(x) { return x === 9 || x === 10 || x === 13 || (x >= 32 && x < 127); }
  function lsbTextOk(t) { return t.length >= VERDACHT_MIN_TEXT && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F�]/.test(t); }
  /* Reine Rechnung auf einem RGBA-Feld. Gibt die Funde zurück: {weg, kopf, text}. */
  function bildpunkteLesen(d, w, h) {
    var n = w * h, funde = [];
    LSB_WEGE.forEach(function (wg) {
      var kap = Math.floor(n * wg[1].length / 8);
      if (kap < 4) return;
      var roh = lsbBytes(d, n, wg[1], Math.min(kap, VERDACHT_LESEN_MAX));
      var L = (roh[0] << 8) | roh[1], t = null;
      if (L >= VERDACHT_MIN_TEXT && L + 2 <= roh.length) {
        try { t = new TextDecoder("utf-8", { fatal: true }).decode(roh.subarray(2, 2 + L)); } catch (_e) { t = null; }
        if (t && lsbTextOk(t)) { funde.push({ weg: wg[0], kopf: true, text: t, bytes: 2 + L, kanaele: wg[1].length }); return; }
      }
      var r = 0;
      while (r < roh.length && lsbDruckbar(roh[r])) r++;
      if (r >= VERDACHT_MIN_LAUF) funde.push({ weg: wg[0], kopf: false, text: latin1(roh, 0, r), bytes: r, kanaele: wg[1].length });
    });
    return funde;
  }
  /* @returns Promise<{art, artName, geprueft, grund, verdacht, befunde, hinweise}>
     geprueft:false heißt „nicht geprüft" mit grund — nie „kein Verdacht". */
  function verdachtPruefen(name, bytes) {
    var b = alsBytes(bytes), art = artVon(b), befunde = [], hinweise = [];
    function melde(k, satz, box) { var x = { kennung: k, satz: satz }; if (box) x.box = box; befunde.push(x); }
    function aus(geprueft, grund) {
      return { art: art, artName: ART_NAME[art] || art, geprueft: geprueft, grund: grund || "", befunde: befunde, hinweise: hinweise,
        verdacht: befunde.some(function (x) { return x.kennung === "BILD-LSB-VERDACHT"; }) };
    }
    var nicht = "Bildpunkte nicht geprüft: ";
    if (art === "jpeg") return Promise.resolve(aus(false, nicht + "ein JPEG ist verlustbehaftet gepackt — die untersten Bits trägt dort die Kompression, nicht der Absender. Verfahren für JPEG (F5, OutGuess, steghide) erkennt diese Prüfung nicht."));
    if (art === "gif") return Promise.resolve(aus(false, nicht + "ein GIF speichert Farben über eine Farbtabelle; deren untersten Bits liest diese Prüfung nicht."));
    if (art === "webp" && latin1(b, 12, 16) !== "VP8L") return Promise.resolve(aus(false, nicht + "dieses WebP ist verlustbehaftet gepackt — die untersten Bits trägt die Kompression."));
    if (art !== "png" && art !== "webp") return Promise.resolve(aus(false, nicht + "das ist kein Bild (" + (ART_NAME[art] || art) + ")."));
    if (!welt.document || !welt.createImageBitmap || !welt.Blob) return Promise.resolve(aus(false, nicht + "ohne Browser lassen sich die Bildpunkte nicht auspacken."));
    return welt.createImageBitmap(new welt.Blob([b], { type: "image/" + art }), { premultiplyAlpha: "none", colorSpaceConversion: "none" }).then(function (bm) {
      var w = bm.width, h = bm.height;
      if (w * h > VERDACHT_MAX_PIXEL) { if (bm.close) bm.close(); return aus(false, nicht + "das Bild ist mit " + w + " × " + h + " Bildpunkten zu groß (Grenze " + (VERDACHT_MAX_PIXEL / 1e6) + " Millionen)."); }
      var c = welt.document.createElement("canvas"); c.width = w; c.height = h;
      var g = c.getContext("2d"); g.drawImage(bm, 0, 0); if (bm.close) bm.close();
      var d = g.getImageData(0, 0, w, h).data, durch = 0, probe = Math.min(w * h, VERDACHT_LESEN_MAX * 8);
      for (var i = 0; i < probe; i++) if (d[i * 4 + 3] < 255) durch++;
      if (durch) hinweise.push(durch + " der ersten " + probe + " Bildpunkte sind durchsichtig — dort gehen beim Auspacken die untersten Bits verloren; was dort steckt, ist ungeprüft.");
      var funde = bildpunkteLesen(d, w, h);
      funde.forEach(function (f) {
        /* Die Bits liegen Bildpunkt für Bildpunkt ab oben links — markiert wird
           der Streifen, der sie trägt (Klaus 2026-10-01: „an der Stelle, wo das
           Problem aufgetaucht ist"). */
        var px = Math.ceil(f.bytes * 8 / f.kanaele), reihen = Math.ceil(px / w);
        var box = { x: 0, y: 0, w: reihen > 1 ? 1 : px / w, h: reihen / h };
        melde("BILD-LSB-VERDACHT", "In den untersten Bits (" + f.weg + ") steht ab dem ersten Bildpunkt lesbarer Text" +
          (f.kopf ? " mit einer Längenangabe davor" : "") + ", " + f.text.length + " Zeichen: „" + (f.text.length > 160 ? f.text.slice(0, 160) + " …" : f.text) +
          "“. Gemessen wurde, ob dort Text steht — nicht, wer ihn hineingeschrieben hat.", box);
        var PM = welt.PrueferMail;
        if (PM) PM.pruefeMail(f.text).stellen.forEach(function (st) {
          if (st.kennung === "KI-ANWEISUNG") melde("BILD-KI-ANWEISUNG", st.satz + " (in den Bildpunkten versteckt, " + f.weg + ")", box);
        });
        else hinweise.push("Die Liste der KI-Anweisungen (assets/pruefer-mail.js) ist nicht geladen — der versteckte Text ist auf Anweisungen an eine KI ungeprüft.");
      });
      if (!funde.length) hinweise.push("Kein Verdacht: in den untersten Bits steht ab dem ersten Bildpunkt kein lesbarer Text (Rot, Grün, Blau, alle drei). Verschlüsselte, gepackte oder verstreute Botschaften erkennt dieses Verfahren nicht.");
      return aus(true);
    }, function () { return aus(false, nicht + "das Bild ließ sich nicht auspacken."); });
  }

  /* ══ WAS JETZT TUN (Klaus 2026-10-01) ══════════════════════════════════
     „… eine Handlungsoption bereitstellen, sodass jemand weiß, was er machen
     soll, falls er in Panik gerät." Je Befundart ruhige Schritte, im
     Indikativ, ohne Fachwort. EINE Quelle für beide Apps (Auslieferungs-
     prüfer und Sende-Prüfer tragen diese Datei byte-1:1) — eine zweite
     Fassung derselben Anleitung liefe auseinander. Gemeinsame Teile stehen
     einmal und werden zusammengesetzt. */
  var RUHE_LESEN = "Ruhig bleiben: Ansehen und Lesen schadet nicht. Gefährlich wird so ein Satz erst, wenn eine KI die Datei oder Mail verarbeitet.";
  var RUHE_ABSENDER = "Kennen Sie den Absender, fragen Sie auf einem anderen Weg nach, zum Beispiel am Telefon. Kennen Sie ihn nicht: löschen.";
  var RUHE_SCHON = "Haben Sie die Datei schon einer KI gegeben, sehen Sie nach, was die KI danach getan hat (gesendete Nachrichten, geteilte Dateien), und ändern Sie Passwörter, die darin standen.";
  var RUHE_KI = [RUHE_LESEN,
    "Die Datei oder Mail nicht an eine KI geben: keinen Assistenten zusammenfassen, übersetzen oder antworten lassen.",
    RUHE_ABSENDER,
    "Wird der Inhalt trotzdem gebraucht: die nötigen Stellen von Hand abschreiben, ohne den verdächtigen Satz.",
    RUHE_SCHON];
  var WAS_TUN = {
    "KI-ANWEISUNG": RUHE_KI,
    "PDF-KI-ANWEISUNG": RUHE_KI,
    "BILD-KI-ANWEISUNG": RUHE_KI,
    "BILD-METADATEN-KI-ANWEISUNG": RUHE_KI.concat(["Wird das Bild gebraucht: ein Bildschirmfoto davon weitergeben statt der Datei. Ein Bildschirmfoto trägt die Metadaten nicht mit; prüfen Sie es hier noch einmal."]),
    "BILD-LSB-VERDACHT": ["Ruhig bleiben: Ansehen schadet nicht. Versteckter Text in den Bildpunkten tut von allein nichts.",
      "Das Bild nicht weitergeben und nicht an eine KI geben.",
      RUHE_ABSENDER,
      "Wird das Bild gebraucht: ein Bildschirmfoto davon weitergeben statt der Datei. Die versteckten Bits gehen dabei meist verloren; prüfen Sie das Bildschirmfoto hier noch einmal.",
      RUHE_SCHON],
    "PDF-VERSTECKTER-TEXT": ["Ruhig bleiben: der unsichtbare Text tut beim Lesen nichts.",
      "Das PDF nicht an eine KI geben und seinen Text nicht kopieren und woanders einfügen: dabei kommt der unsichtbare Text mit.",
      RUHE_ABSENDER, RUHE_SCHON],
    "VERSTECKTER-TEXT": ["Ruhig bleiben: der versteckte Text tut beim Lesen nichts.",
      "Die Mail nicht an eine KI geben und nicht weiterleiten.",
      RUHE_ABSENDER, RUHE_SCHON]
  };
  function wasTun(kennung) { return (WAS_TUN[kennung] || []).slice(); }

  /* ══ IM BILD MARKIERT (Klaus 2026-10-01) ═══════════════════════════════
     „… ein Vermerk gemacht werden an der Stelle, wo das Problem aufgetaucht
     ist. Oder der Text kenntlich gemacht werden." Jeder Befund mit Kasten
     (box: Anteile 0…1) wird rot umrandet und beschriftet. Gezeichnet wird auf
     eine NEUE Leinwand — die Datei selbst bleibt unverändert. Ohne Browser:
     null (es gibt nichts zu zeichnen, und das sagt die Oberfläche).
     ⚠ Ein Kasten der Texterkennung ist so genau wie die Texterkennung. */
  var MARKE_TEXT = { "BILD-KI-ANWEISUNG": "⚠ Anweisung an eine KI", "BILD-LSB-VERDACHT": "⚠ versteckter Text in den Bildpunkten" };
  var MARKE_KANTE = 3000;
  function marken(befunde) {
    var gesehen = {}, aus = [];
    (befunde || []).forEach(function (x) {
      if (!x.box || !MARKE_TEXT[x.kennung]) return;
      var k = [x.box.x, x.box.y, x.box.w, x.box.h].map(function (v) { return v.toFixed(4); }).join(",");
      if (gesehen[k]) return;              // dieselbe Stelle nur einmal (LSB + Anweisung darin)
      gesehen[k] = true;
      aus.push({ box: x.box, text: MARKE_TEXT[x.kennung], kennung: x.kennung });
    });
    return aus;
  }
  function markieren(bytes, befunde) {
    var b = alsBytes(bytes), art = artVon(b), liste = marken(befunde);
    if (!liste.length || !/^(png|jpeg|webp|gif)$/.test(art) || !welt.document || !welt.createImageBitmap || !welt.Blob) return Promise.resolve(null);
    return welt.createImageBitmap(new welt.Blob([b], { type: "image/" + art })).then(function (bm) {
      var f = Math.min(1, MARKE_KANTE / Math.max(bm.width, bm.height)), c = welt.document.createElement("canvas");
      c.width = Math.max(1, Math.round(bm.width * f)); c.height = Math.max(1, Math.round(bm.height * f));
      var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(bm, 0, 0, c.width, c.height); if (bm.close) bm.close();
      var dick = Math.max(2, Math.round(Math.min(c.width, c.height) / 250)), schrift = Math.max(13, Math.round(Math.min(c.width, c.height) / 32));
      liste.forEach(function (m) {
        var x = m.box.x * c.width, y = m.box.y * c.height, w = Math.max(dick * 2, m.box.w * c.width), h = Math.max(dick * 2, m.box.h * c.height), r = dick * 2;
        x = Math.max(0, x - r); y = Math.max(0, y - r); w = Math.min(c.width - x, w + 2 * r); h = Math.min(c.height - y, h + 2 * r);
        g.fillStyle = "rgba(220,30,30,.18)"; g.fillRect(x, y, w, h);
        g.lineWidth = dick; g.strokeStyle = "#d61e1e"; g.strokeRect(x + dick / 2, y + dick / 2, w - dick, h - dick);
        g.font = "600 " + schrift + "px system-ui, sans-serif";
        var tw = g.measureText(m.text).width + schrift, th = Math.round(schrift * 1.5);
        var ly = y - th >= 0 ? y - th : Math.min(c.height - th, y + h);   // über dem Kasten, sonst darunter
        var lx = Math.min(Math.max(0, x), Math.max(0, c.width - tw));
        g.fillStyle = "#d61e1e"; g.fillRect(lx, ly, tw, th);
        g.fillStyle = "#fff"; g.textBaseline = "middle"; g.fillText(m.text, lx + schrift / 2, ly + th / 2);
      });
      c.__marken = liste.length;
      return c;
    }, function () { return null; });
  }

  /* ══ TEXT IN DATEIEN AUF ANWEISUNGEN AN EINE KI (Punkt 4, 2026-10-01)
   * ChatGPT-Prüfbericht vom 2026-10-01: Text aus TXT, SVG, HTML und Word ging
   * nur durch pruefeText (Schlüssel, Mailadressen, IBAN), nicht durch die
   * Liste der KI-Anweisungen. Jetzt dieselbe Liste wie der Mail-Eingang.
   * Übernommen werden nur KI-ANWEISUNG, UNSICHTBARE-ZEICHEN und
   * VERSTECKTER-TEXT — der Rest gehört zu Mails (Absender, Links).
   * ⚠ Ein "\n" davor: pruefeMail hält eine erste Zeile wie „Hinweis: …"
   *   sonst für einen Mailkopf und verschiebt die Zeilen. Abgezogen wird 1.
   * Fehlt pruefer-mail.js, ist der Text ungeprüft, nicht sauber. */
  var DATEI_KI_ARTEN = ["KI-ANWEISUNG", "KI-BEGRIFF", "UNSICHTBARE-ZEICHEN", "VERSTECKTER-TEXT"];
  function dateitextPruefen(text, melde, hinweise, stand) {
    if (!text || !String(text).trim()) return;
    var PM = welt.PrueferMail;
    if (!PM) {
      hinweise.push("Der Text der Datei wurde gelesen, aber die Liste der KI-Anweisungen (assets/pruefer-mail.js) ist nicht geladen — auf Anweisungen an eine KI ist er ungeprüft, nicht sauber.");
      stand.bildUngeprueft = true; stand.textUngeprueft = true;
      return;
    }
    PM.pruefeMail("\n" + text).stellen.forEach(function (st) {
      if (DATEI_KI_ARTEN.indexOf(st.kennung) < 0) return;
      melde(st.kennung, st.satz + " (Zeile " + Math.max(1, st.zeile - 1) + ")");
    });
  }

  /* ══ DIE EINE TÜR
   * @returns Promise<{art, artName, befunde:[{kennung,satz}], text:string|null,
   *                   textQuelle:"bild"|null, seiten:[{seite,text,bild?}]|null,
   *                   hinweise:[], sicher:boolean, bildUngeprueft:boolean}>
   * bildUngeprueft: Text in einem Bild oder auf einer Scan-Seite wurde NICHT
   * gelesen — die App darf dann nicht „kein Befund" melden.
   * text: was Modul 25 danach lesen soll (null = kein Text gelesen).
   * seiten: beim PDF der Text je Seite, damit ein Fund seine Seite nennt. */
  /* Ungeprüft markieren — der erste Grund nennt den Satz oben (Punkt 6). */
  function ungeprueft(stand, satz) {
    stand.bildUngeprueft = true;
    if (satz && !stand.satz) stand.satz = satz;
  }
  function pruefe(name, bytes) {
    var b = alsBytes(bytes), art = artVon(b), befunde = [], hinweise = [], text = null, seiten = null, stand = { bildUngeprueft: false };
    function melde(k, satz, box, daten) { var x = { kennung: k, satz: satz }; if (box) x.box = box; if (daten) x.daten = daten; befunde.push(x); }
    name = String(name || "");
    var endung = (/\.([A-Za-z0-9]{1,6})$/.exec(name) || [])[1];
    endung = endung ? endung.toLowerCase() : "";
    if (art === "programm" || PROGRAMM_ENDUNG.test(name))
      melde("ANHANG-PROGRAMM", "Das ist ein Programm oder Skript" + (art === "programm" ? " (am Dateikopf erkannt)" : " (Endung ." + endung + ")") + ". Programme gehören nicht in einen Mail-Anhang an eine KI.");
    var doppelt = /\.(pdf|jpe?g|png|docx?|xlsx?|txt)\.[a-z0-9]{2,4}$/i.exec(name);
    if (doppelt && PROGRAMM_ENDUNG.test(name)) melde("ANHANG-TARNUNG", "Der Name täuscht eine harmlose Datei vor (doppelte Endung).");
    else if (art === "programm" && endung && !PROGRAMM_ENDUNG.test(name)) melde("ANHANG-TARNUNG", "Die Endung „." + endung + "“ täuscht: die Datei ist in Wahrheit ein Programm.");
    else if (ENDUNGEN[art] && endung && ENDUNGEN[art].indexOf(endung) < 0)
      melde("ANHANG-TARNUNG", "Die Endung „." + endung + "“ passt nicht zum Inhalt: die Datei ist in Wahrheit ein " + ART_NAME[art] + ".");
    var weiter = Promise.resolve(), metatexte = [];
    if (art === "jpeg") anhaengsel(b, jpegPruefen(b, melde, metatexte), melde);
    else if (art === "png") anhaengsel(b, pngPruefen(b, melde, metatexte), melde);
    else if (art === "webp") anhaengsel(b, webpPruefen(b, melde, metatexte), melde);
    else if (art === "unbekannt") {
      /* Punkt 6 c: eine Datei, deren Art der Prüfer nicht kennt, ist nicht sauber, sondern ungeprüft. */
      hinweise.push("Die Art dieser Datei hat der Prüfer nicht erkannt — ihr Inhalt wurde NICHT geprüft, nur Name und Endung. Ungeprüft, nicht sauber.");
      ungeprueft(stand, "Dateiart nicht erkannt — ungeprüft");
    }
    else if (art === "gif") hinweise.push("Bei GIF wird nur der Dateikopf geprüft, nicht, was hinter dem Bild steht.");
    else if (art === "svg") text = svgPruefen(b, melde);
    else if (art === "text") text = new TextDecoder("utf-8").decode(b).replace(/^\uFEFF/, "");
    else if (art === "html") text = htmlPruefen(b, melde, hinweise, stand);
    else if (art === "zip") weiter = officePruefen(b, name, melde).then(function (r) {
      art = r.art; text = r.text; if (r.hinweis) hinweise.push(r.hinweis);
    });
    else if (art === "pdf") {
      var PF = welt.PrueferFormate;
      if (!PF) { hinweise.push("Der PDF-Prüfer (assets/pruefer-formate.js) ist nicht geladen — das PDF ist ungeprüft, nicht sauber."); ungeprueft(stand, "PDF ungeprüft"); }
      else weiter = PF.pruefePdf(b, []).then(function (r) {
        r.stellen.forEach(function (x) { melde(x.kennung, x.satz + " (" + x.stelle + ")", null, x.daten); });
        hinweise.push.apply(hinweise, r.hinweise);
      });
      weiter = weiter.then(function () { return pdfTextPruefen(b, melde, hinweise, stand); }).then(function (s) {
        if (s && s.length) { seiten = s; text = s.map(function (x) { return x.text; }).join("\n"); }
      });
    }
    /* HTML: der Quelltext (dort stehen CSS-Verstecke und die echten Zeilen),
       sonst der gelesene Text der Datei. */
    var htmlRoh = art === "html" ? new TextDecoder("utf-8").decode(b).replace(/^\uFEFF/, "") : null;
    weiter = weiter.then(function () {
      if (/^(text|svg|html|docx|xlsx|pptx|odt|zip)$/.test(art) || htmlRoh) dateitextPruefen(htmlRoh || text, melde, hinweise, stand);
    });
    weiter = weiter.then(function () { return metatextPruefen(metatexte, melde, hinweise, stand); });
    var textQuelle = null;
    if (/^(png|jpeg|webp|gif)$/.test(art)) weiter = weiter.then(function () {
      return bildTextPruefen(b, art, melde, hinweise, stand).then(function (t) { if (t) { text = t; textQuelle = "bild"; } });
    });
    return weiter.then(function () {
      return { art: art, artName: ART_NAME[art] || art, befunde: befunde, text: text, textQuelle: textQuelle, seiten: seiten, hinweise: hinweise,
        bildUngeprueft: stand.bildUngeprueft, textUngeprueft: !!stand.textUngeprueft, ungeprueftSatz: stand.satz || "",
        sicher: /^(png|jpeg|webp|gif|svg)$/.test(art) };
    });
  }

  /* ══ ANHÄNGE AUS EINER MAIL — nur auspacken, nie ausführen. */
  var GROESSE_MAX = 25 * 1024 * 1024;
  function vonB64(s) {
    var t = String(s).replace(/[^A-Za-z0-9+/=]/g, ""), b;
    try { b = welt.atob ? welt.atob(t) : Buffer.from(t, "base64").toString("binary"); } catch (_e) { return new Uint8Array(0); }
    var u = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u;
  }
  function vonQP(s, wort) {
    if (wort) s = s.replace(/_/g, " ");
    s = s.replace(/=\r?\n/g, "");
    var out = [], enc = new TextEncoder();
    for (var i = 0; i < s.length; i++) {
      if (s[i] === "=" && /^[0-9A-F]{2}$/i.test(s.substr(i + 1, 2))) { out.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; }
      else { var x = enc.encode(s[i]); for (var j = 0; j < x.length; j++) out.push(x[j]); }
    }
    return Uint8Array.from(out);
  }
  function dekod(b, cs) {
    try { return new TextDecoder(cs || "utf-8").decode(b); } catch (_e) { return new TextDecoder("utf-8").decode(b); }
  }
  function kopfWort(s) {
    return String(s || "").replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=(\s+(?==\?))?/g, function (_a, cs, art, t) {
      return dekod(/b/i.test(art) ? vonB64(t) : vonQP(t, true), cs);
    });
  }
  function kopfTeilen(roh) {
    var i = roh.search(/\r?\n\r?\n/);
    var kopf = (i < 0 ? roh : roh.slice(0, i)).replace(/\r?\n[ \t]+/g, " "), k = {};
    kopf.split(/\r?\n/).forEach(function (z) { var m = /^([A-Za-z\-]+):\s*(.*)$/.exec(z); if (m) k[m[1].toLowerCase()] = m[2]; });
    return { k: k, rumpf: i < 0 ? "" : roh.slice(i).replace(/^\r?\n\r?\n/, "") };
  }
  function dateiname(k) {
    var cd = k["content-disposition"] || "", ct = k["content-type"] || "";
    var m = /filename\*=(?:"?)([^";]+)/i.exec(cd);
    if (m) { var n = m[1].replace(/^[^']*'[^']*'/, ""); try { return decodeURIComponent(n); } catch (_e) { return n; } }
    m = /filename="?([^";]+)"?/i.exec(cd) || /name="?([^";]+)"?/i.exec(ct);
    return m ? kopfWort(m[1]) : null;
  }
  function ausMail(roh) {
    var aus = [], s = String(roh || "").replace(/^﻿/, "");
    (function teil(x, tiefe) {
      if (tiefe > 8) return;
      var ct = x.k["content-type"] || "", gr = /boundary="?([^";]+)"?/i.exec(ct);
      if (/^multipart\//i.test(ct) && gr) {
        x.rumpf.split("--" + gr[1]).slice(1).filter(function (t) { return !/^--/.test(t); }).forEach(function (t) {
          teil(kopfTeilen(t.replace(/^\r?\n/, "").replace(/\r?\n$/, "")), tiefe + 1);   // der Umbruch vor der Grenze gehört zur Grenze (RFC 2046)
        });
        return;
      }
      var name = dateiname(x.k);
      if (!name) return;
      var cte = (x.k["content-transfer-encoding"] || "").toLowerCase().trim(), typ = ct.split(";")[0].trim();
      var geschaetzt = cte === "base64" ? Math.floor(x.rumpf.replace(/\s/g, "").length * 3 / 4) : x.rumpf.length;
      if (geschaetzt > GROESSE_MAX) { aus.push({ name: name, typ: typ, groesse: geschaetzt, bytes: null, zuGross: true }); return; }
      var b = cte === "base64" ? vonB64(x.rumpf) : cte === "quoted-printable" ? vonQP(x.rumpf) : new TextEncoder().encode(x.rumpf);
      aus.push({ name: name, typ: typ, groesse: b.length, bytes: b, zuGross: false });
    })(kopfTeilen(s), 0);
    return aus;
  }

  var API = { pruefe: pruefe, artVon: artVon, zipEintraege: zipEintraege, ausMail: ausMail,
    BEFUNDE: BEFUNDE, gross: gross, GROESSE_MAX: GROESSE_MAX, pfade: pfade, SEITEN_TEXT_MAX: SEITEN_TEXT_MAX,
    OCR_SICHER: OCR_SICHER, OCR_SEITEN_MAX: OCR_SEITEN_MAX,
    kontrastStrecken: kontrastStrecken, neueZeilen: neueZeilen,
    wasTun: wasTun, markieren: markieren, marken: marken, verdachtPruefen: verdachtPruefen, bildpunkteLesen: bildpunkteLesen, VERDACHT_MIN_LAUF: VERDACHT_MIN_LAUF, VERDACHT_MAX_PIXEL: VERDACHT_MAX_PIXEL,
    vergleiche: vergleiche, GEGEN_SEITEN_MAX: GEGEN_SEITEN_MAX, GEGEN_MIN_VERSTECKT: GEGEN_MIN_VERSTECKT, versteckteWoerter: versteckteWoerter, wortKaesten: wortKaesten,
    /* nur für die Proben: die Frist kürzen, um das Hängen zu messen */
    ocrFrist: function (ms) { if (ms > 0) OCR_FRIST = ms; return OCR_FRIST; } };
  welt.PrueferAnhang = API;
  welt.SPAnhang = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
