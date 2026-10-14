/* Auslieferungsprüfer — die Eingänge NEBEN der HTML-Seite.
 *
 * WARUM ES DIESE DATEI GIBT. Am 2026-08-22 lagen 75 Rechnungen als JSON unter
 * einer öffentlichen Adresse, obwohl das Depot privat stand. Der Prüfer hätte
 * sie durchgewinkt: er ist ein HTML-Leser, und auf einer JSON-Datei feuert kein
 * einziges Tag. Einziger Fund wäre gewesen „keine Sprache angegeben" — also
 * eine Meldung, die vom eigentlichen Schaden ablenkt.
 *
 * ⚠ `pruefer.js` WIRD DABEI NICHT ANGEFASST. Dessen `pruefe()` steht unter der
 * Zusicherung „zwei Fassungen, ein Ergebnis": `tests/smoke_pruefer.mjs`
 * vergleicht jede Meldung Zeichen für Zeichen gegen die Python-Fassung in
 * Kimhub. Was hier dazukommt, kommt DANEBEN — ein neuer Eingang, kein Eingriff
 * in den alten. Die Textmuster unten sind in der Python-Fassung wortgleich
 * nachgezogen und werden ebenso gegeneinander geprüft.
 *
 * Läuft in beiden Welten (Browser und Node), wie die SBKIM-Module — damit die
 * Probe genau den Code prüft, den der Besucher ausführt.
 */
(function (welt) {
  "use strict";

  var BEFUNDE_TEXT = ["SCHLUESSEL", "PERSONENBEZUG", "RECHNUNGSDATEN",
                      "FREMDE-ADRESSE", "FUELLTEXT"];
  var BEFUNDE_PDF  = ["PDF-VERWEIS", "PDF-AKTION", "PDF-ANHANG",
                      "PDF-METADATEN", "PDF-ALTFASSUNG", "PDF-HERKUNFT"];

  /* ══ FREIGESTELLTE PFADE ══════════════════════════════════════════════════
   * Neunzehn von Klaus' Seiten tragen ein Impressum mit echter Anschrift und
   * echter Mailadresse. Die MÜSSEN dort stehen (§ 5 DDG). Ein Prüfer, der bei
   * jedem Lauf Alarm schlägt, wird abgeschaltet — und dann meldet er auch den
   * echten Fund nicht mehr.
   *
   * ⚠ FREIGESTELLT WIRD DER PFAD, NIE DER WERT. Würde man den Wert freistellen
   * („diese Mailadresse ist in Ordnung"), schwiege dieselbe Adresse auch dort,
   * wo sie versehentlich steht — in einer Konfigurationsdatei, in einem
   * Protokoll, in einem Datenauszug. Genau die ist der echte Fund.
   */
  var FREI_PFADE = ["impressum.html", "datenschutz.html", "rechte.md",
                    "impressum.md", "datenschutz.md", "license", "licence"];

  function istFreigestellt(pfad) {
    var p = String(pfad || "").toLowerCase().replace(/\\/g, "/");
    var name = p.split("/").pop();
    for (var i = 0; i < FREI_PFADE.length; i++) {
      if (name === FREI_PFADE[i] || name.indexOf(FREI_PFADE[i]) === 0) return true;
    }
    return false;
  }

  /* ══ DIE MUSTER ═══════════════════════════════════════════════════════════
   * Jedes Muster ist so eng gefasst, wie es sein kann, ohne den Fall zu
   * verlieren. Der Grund steht in jeder zweiten Tafel dieses Netzes: eine
   * Warnung, die man nicht mehr los wird, ist keine Warnung. Ein Prüfer, der
   * auf jeder Datei etwas meldet, wird weggeklickt — und dann sieht niemand
   * mehr den einen Fund, auf den es ankam.
   *
   * Deshalb steht bei den Schlüsseln überall eine MINDESTLÄNGE: `sk-` allein
   * kommt in gewöhnlichem Text vor, `sk-` plus zwanzig Zeichen aus dem
   * Schlüssel-Alphabet nicht.
   */
  var MUSTER = [
    /* -- Schlüssel und Zugangsdaten ------------------------------------- */
    { k: "SCHLUESSEL", was: "ein Anthropic-Schlüssel",
      re: /sk-ant-[A-Za-z0-9_\-]{16,}/ },
    { k: "SCHLUESSEL", was: "ein OpenAI-Schlüssel",
      re: /\bsk-(?!ant-)[A-Za-z0-9_\-]{20,}/ },
    { k: "SCHLUESSEL", was: "ein GitHub-Token",
      re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/ },
    { k: "SCHLUESSEL", was: "ein GitHub-Token (neue Form)",
      re: /\bgithub_pat_[A-Za-z0-9_]{20,}/ },
    { k: "SCHLUESSEL", was: "ein Google-API-Schlüssel",
      re: /\bAIza[A-Za-z0-9_\-]{30,}/ },
    { k: "SCHLUESSEL", was: "ein Amazon-Zugangsschlüssel",
      re: /\bAKIA[0-9A-Z]{16}\b/ },
    { k: "SCHLUESSEL", was: "ein Slack-Token",
      re: /\bxox[baprs]-[A-Za-z0-9\-]{10,}/ },
    /* Klaus' eigenes Netz: der private Nostr-Schlüssel der Pinnwand. Wer den
       veröffentlicht, gibt seine Identität am Brett aus der Hand. */
    { k: "SCHLUESSEL", was: "ein privater Nostr-Schlüssel (nsec)",
      re: /\bnsec1[02-9ac-hj-np-z]{50,}/ },
    { k: "SCHLUESSEL", was: "ein privater Schlüssel im Klartext",
      re: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/ },
    /* ⚠ DAS SCHLIESSENDE ANFÜHRUNGSZEICHEN MUSS MIT. In JSON heisst das Feld
       `"api_key":` — mit Zeichen VOR dem Doppelpunkt. Die erste Fassung suchte
       `api_key` gefolgt von `:` und traf deshalb in einer JSON-Datei nie, also
       genau dort, wo Schlüssel am häufigsten liegen. Gemessen an einer
       Probedatei: 0 Treffer, obwohl der Schlüssel dastand. */
    { k: "SCHLUESSEL", was: "ein Feld, das einen Schlüssel trägt",
      re: /\b(?:api[_\-]?key|apikey|secret|client[_\-]?secret|passwort|password|passwd)\b["']?\s*[:=]\s*["']?[^\s"',}]{12,}/i },
    { k: "SCHLUESSEL", was: "ein Bearer-Token in einem Kopf",
      re: /Authorization\s*:\s*Bearer\s+[A-Za-z0-9._\-]{16,}/i },

    /* -- Personenbezug --------------------------------------------------- */
    /* ⚠ DIE GRENZEN SIND KEINE ZIERDE — OHNE SIE FRIERT DIE SEITE EIN.
       Gemessen am 2026-09-09 an einer EINZIGEN langen Zeile (und genau so
       kommt HTML-Post an: der ganze Rumpf steht oft in einer Zeile):

         60 000 Zeichen   ·  unbegrenzt 2 174 ms  ·  begrenzt 0 ms
        100 000 Zeichen   ·  die ganze Prüfung 5 787 ms
        200 000 Zeichen   ·  die ganze Prüfung 23 211 ms

       Die Ursache ist das unbegrenzte `+` vor dem `@`: an JEDER Stelle frisst
       es bis zum Zeilenende, findet kein `@` und geht Zeichen für Zeichen
       zurück — das ist quadratisch. Alle übrigen Muster dieser Datei wurden
       einzeln nachgemessen und liegen bei 0 ms; es war dieses eine.

       Die Grenzen sind zugleich die richtige Angabe: RFC 5321 lässt vor dem @
       höchstens 64 Zeichen zu und dahinter 255. Am Ergebnis ändert sich
       dadurch nichts — eine Adresse, die diese Grenzen sprengt, wird weiterhin
       gemeldet, nur ohne den Rückwärtsgang.

       ⚠ DIE PYTHON-FASSUNG HAT DENSELBEN FEHLER (`pruefe-datei.py`, Zeile 88).
       Nachgemessen: 3 454 ms → 9 ms mit derselben Änderung. Sie ist HIER nicht
       mitgezogen, weil sie in einem anderen Depot liegt — das steht im Brief
       und im PR-Text, damit es nicht verlorengeht. Die Zusicherung „zwei
       Fassungen, ein Ergebnis" bleibt unberührt: die Ergebnisse sind gleich,
       nur die Laufzeit ist es nicht. */
    { k: "PERSONENBEZUG", was: "eine Mailadresse",
      re: /[A-Za-z0-9._%+\-]{1,64}@[A-Za-z0-9.\-]{1,255}\.[A-Za-z]{2,}/ },
    /* ⚠ NUR MIT LÄNDERVORWAHL ODER tel:. Eine blosse Ziffernfolge als
       Telefonnummer zu lesen, meldet jede Kennung und jeden Zeitstempel in
       einer JSON-Datei — gemessen an Klaus' eigenen Daten wäre das der lauteste
       Fehlalarm von allen. Lieber eine Nummer ohne Vorwahl übersehen als jede
       Datei mit Zahlen anklagen. */
    { k: "PERSONENBEZUG", was: "eine Telefonnummer",
      re: /(?:tel:|\+\d{2}[\s\-/()]?)\d[\d\s\-/()]{6,}\d/ }
  ];

  /* Die IBAN bekommt eine eigene Prüfung statt eines Musters: die Form allein
     (zwei Buchstaben, zwei Ziffern, dann Zeichen) trifft auch Bestellnummern
     und Kennungen. Mit der Prüfziffer nach ISO 7064 bleibt fast nur eine echte
     IBAN übrig — dieselbe Rechnung, die auch die Bank macht. Ein Muster ohne
     diese Rechnung wäre ein Fehlalarm-Werk. */
  function istIban(roh) {
    var s = String(roh).replace(/[\s\-]/g, "").toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
    var um = s.slice(4) + s.slice(0, 4), rest = 0;
    for (var i = 0; i < um.length; i++) {
      var c = um.charCodeAt(i);
      var teil = (c >= 65 && c <= 90) ? String(c - 55) : um.charAt(i);
      for (var j = 0; j < teil.length; j++) rest = (rest * 10 + (teil.charCodeAt(j) - 48)) % 97;
    }
    return rest === 1;
  }
  var IBAN_FORM = /\b[A-Z]{2}\d{2}(?:[ \-]?[A-Z0-9]{2,4}){3,8}\b/g;

  /* Rechnungsdaten. Der Fall, um den es geht: eine Sammlung von Belegen, die
     niemand ins Depot legen wollte. Ein einzelner Betrag auf einer Seite ist
     kein Befund — ein FELD, das Beträge oder Belegnummern trägt, schon. */
  var GELD_FELD = /"(?:betrag|amount|total|summe|netto|brutto|preis|price|ust|mwst|steuer|tax)"\s*:/i;
  var BELEG_FELD = /"(?:rechnung|rechnungsnummer|invoice|invoice_id|beleg|belegnummer|receipt|receipt_number|kundennummer|customer_id)[a-z_]*"\s*:/i;
  var GELD_WERT = /\d+[.,]\d{2}\s?(?:€|EUR|\$|USD|CHF)\b|\b(?:EUR|USD|CHF)\s?\d+[.,]\d{2}/;

  function maskiere(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  /* Fremde Adressen in einer Textdatei. In HTML hängt eine Adresse an einem
     Attribut; hier steht sie nackt. Gemeldet wird nur, was wirklich holt —
     `http(s)://` —, nicht jedes Wort mit einem Punkt darin. */
  var ADRESSE = /\bhttps?:\/\/([A-Za-z0-9._\-]+(?::\d+)?)/g;
  /* Ein Namensraum ist ein NAME, kein Abruf (Klaus 2026-09-30, H3/H4 im
     Text-Eingang: „www.w3.org", „schemas.openxmlformats.org", „purl.org" als
     fremde Rechner gemeldet). Zwei Riegel: alles hinter xmlns="…", und diese
     Wirte, die in SVG/Office/PDF nur als Kennung stehen. Benannte Grenze: ein
     echter Abruf von genau diesen Wirten wird im Text-Eingang nicht gemeldet. */
  var NAMENSRAUM_WIRTE = { "www.w3.org": 1, "schemas.openxmlformats.org": 1,
    "schemas.microsoft.com": 1, "purl.org": 1, "ns.adobe.com": 1 };
  var VOR_XMLNS = /xmlns(?::[\w.\-]+)?\s*=\s*["']$/i;

  /* Fülltext: dieselbe Liste wie in der HTML-Fassung, damit ein „TODO" in einer
     README genauso auffällt wie eines in der Seite. Eine zweite, eigene Liste
     wäre eine Drift-Quelle mit Ansage. */
  function fuellwoerter() {
    var p = welt.Auslieferungspruefer;
    return (p && p.FUELLWOERTER) ? p.FUELLWOERTER : [];
  }

  /**
   * Prüft eine Text-, JSON-, Markdown- oder Konfigurationsdatei.
   * @param {string} text  der Inhalt
   * @param {string} pfad  der Dateiname — entscheidet über die Freistellung
   * @param {string[]} erlaubt  Wirte, die nicht als fremd gelten
   * @returns {{zeile:number, kennung:string, satz:string}[]} nach Zeile sortiert
   */
  function pruefeText(text, pfad, erlaubt) {
    text = String(text == null ? "" : text);
    erlaubt = (erlaubt || []).map(function (e) { return String(e).toLowerCase().trim(); })
                             .filter(Boolean);
    var frei = istFreigestellt(pfad);
    var treffer = [];
    var zeilen = text.split("\n");

    var fuell = fuellwoerter().map(function (w) {
      return { wort: w, muster: new RegExp("(?:^|[^A-Za-z0-9_])" + maskiere(w) + "(?![A-Za-z0-9_])", "i") };
    });

    for (var z = 0; z < zeilen.length; z++) {
      var zeile = zeilen[z], nr = z + 1;

      for (var m = 0; m < MUSTER.length; m++) {
        var mu = MUSTER[m];
        /* ⚠ NUR DER PERSONENBEZUG WIRD FREIGESTELLT, NIE EIN SCHLÜSSEL.
           In einem Impressum gehört eine Anschrift; ein Zugangsschlüssel
           gehört dort so wenig hin wie anderswo. Eine Freistellung, die auch
           Schlüssel mitnimmt, wäre eine Hintertür mit Dateinamen. */
        if (frei && mu.k === "PERSONENBEZUG") continue;
        if (mu.re.test(zeile)) {
          treffer.push({ zeile: nr, kennung: mu.k, satz: "Gefunden: " + mu.was + "." });
        }
      }

      if (!frei) {
        IBAN_FORM.lastIndex = 0;
        var im;
        while ((im = IBAN_FORM.exec(zeile)) !== null) {
          if (istIban(im[0])) {
            treffer.push({ zeile: nr, kennung: "PERSONENBEZUG",
                           satz: "Gefunden: eine Kontonummer (IBAN, Prüfziffer stimmt)." });
            break;
          }
        }
      }

      if (GELD_FELD.test(zeile) || BELEG_FELD.test(zeile) || GELD_WERT.test(zeile)) {
        treffer.push({ zeile: nr, kennung: "RECHNUNGSDATEN",
                       satz: "Gefunden: ein Feld oder Betrag aus einer Abrechnung." });
      }

      ADRESSE.lastIndex = 0;
      var am, gemeldet = {};
      while ((am = ADRESSE.exec(zeile)) !== null) {
        var wirt = am[1].toLowerCase().split(":")[0];
        if (gemeldet[wirt]) continue;
        if (NAMENSRAUM_WIRTE[wirt] || VOR_XMLNS.test(zeile.slice(0, am.index))) continue;
        var eigen = false;
        for (var e = 0; e < erlaubt.length; e++) {
          if (wirt === erlaubt[e] || wirt.slice(-(erlaubt[e].length + 1)) === "." + erlaubt[e]) eigen = true;
        }
        if (eigen) continue;
        gemeldet[wirt] = 1;
        treffer.push({ zeile: nr, kennung: "FREMDE-ADRESSE",
                       satz: "Adresse eines fremden Rechners: " + wirt });
      }

      for (var f = 0; f < fuell.length; f++) {
        if (fuell[f].muster.test(zeile)) {
          treffer.push({ zeile: nr, kennung: "FUELLTEXT",
                         satz: "Rest aus dem Bau: '" + fuell[f].wort + "'" });
        }
      }
    }

    treffer.sort(function (x, y) {
      return x.zeile - y.zeile || (x.kennung < y.kennung ? -1 : x.kennung > y.kennung ? 1 : 0);
    });
    return treffer;
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * PDF
   *
   * ⚠ SELBST GEBAUT, KEIN pdf.js. Ein Megabyte aus dem Netz bräche die
   * Offline-Zusage, mit der diese Seite wirbt — und für das, was hier gesucht
   * wird, braucht es keinen vollständigen Leser: es sind Strukturen, keine
   * Seiteninhalte.
   *
   * ⚠ UND DER TEXT IM DOKUMENT WIRD NICHT GEDEUTET. Das ist eine bewusste
   * Grenze, keine Bequemlichkeit. Ein Textauszug aus einem PDF ist ein eigenes
   * Werkzeug (Schriftarten-Tabellen, Zeichen-Abbildungen, Satz-Reihenfolge) und
   * liefert am Ende einen Text, dem man nicht ansieht, wie zuverlässig er ist.
   * Ein Fund, dem man nicht trauen kann, ist schlimmer als kein Fund.
   *
   * ⚠ EIN PDF HAT KEINE ZEILEN, die einem Menschen etwas sagen. Die Stelle
   * heisst deshalb OBJEKT (die Nummer, unter der das PDF selbst sie führt) und
   * nicht Zeile. Das steht an jedem Fund dran, statt eine Genauigkeit
   * vorzutäuschen, die es nicht gibt.
   */

  function alsLatin1(bytes) {
    var s = "", h = 32768;
    for (var i = 0; i < bytes.length; i += h) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + h, bytes.length)));
    }
    return s;
  }

  /* Objektnummer zu einer Stelle: das letzte `N 0 obj` davor. Ohne das hiesse
     jeder Fund „irgendwo in der Datei", und damit fängt niemand etwas an. */
  function objektVor(roh, pos) {
    var bis = roh.lastIndexOf(" obj", pos);
    if (bis === -1) return null;
    var anf = Math.max(0, bis - 24);
    var m = /(\d+)\s+(\d+)\s+obj$/.exec(roh.slice(anf, bis + 4));
    return m ? m[1] : null;
  }

  /* ⚠ DAS ZEILENENDE VOR `endstream` GEHÖRT NICHT ZUM STROM. Der PDF-Standard
     verlangt dort ein Zeilenende, das ausdrücklich KEINE Nutzlast ist. Wer es
     mitgibt, bekommt „trailing junk after the end of the compressed stream" —
     an einer Probedatei gemessen: der einzige gepackte Strom galt als nicht
     lesbar, und die Metadaten darin blieben unentdeckt. Ein Strom, der nur
     wegen eines Zeilenumbruchs als unlesbar zählt, versteckt genau das, wofür
     das Öffnen gebaut wurde. */
  function ohneEndzeile(bytes) {
    var bis = bytes.length;
    while (bis > 0 && (bytes[bis - 1] === 10 || bytes[bis - 1] === 13)) bis--;
    return bytes.subarray(0, bis);
  }

  function entpacke(roheBytes) {
    /* Zwei Welten, ein Ergebnis. Im Browser bringt die Plattform es mit; unter
       Node liegt dasselbe in `zlib`. Geht es schief, wird der Strom
       übersprungen und NICHT als sauber gemeldet — die Zusammenfassung sagt,
       wie viele nicht lesbar waren. */
    var bytes = ohneEndzeile(roheBytes);
    if (typeof welt.DecompressionStream === "function") {
      return Promise.resolve().then(function () {
        var ds = new welt.DecompressionStream("deflate");
        var w = ds.writable.getWriter();
        /* ⚠ write() und close() liefern eigene Versprechen. Ein kaputter Strom
           lehnt sie ab — unbehandelt riss das unter Node den ganzen Lauf mit
           (gemessen 2026-09-29), im Browser landete es als roter Fehler in der
           Konsole. Abgefangen; das Ergebnis meldet readable ohnehin. */
        w.write(bytes).catch(function () {}); w.close().catch(function () {});
        return new Response(ds.readable).arrayBuffer();
      }).then(function (b) { return new Uint8Array(b); }, function () { return null; });
    }
    /* ⚠ ÜBER EIN VERSPRECHEN, NICHT ÜBER try/catch. `inflateSync` meldet einen
       kaputten Strom in Node 22 aus einem Rückruf heraus — die Ausnahme fliegt
       AN try/catch VORBEI und riss den ganzen Lauf mit („uncaught exception
       from promise"). Gemessen, nicht vermutet. */
    return Promise.resolve().then(function () {
      var zlib = welt.__pruefer_zlib;
      if (!zlib) return null;
      return new Uint8Array(zlib.inflateSync(Buffer.from(bytes)));
    }).then(null, function () { return null; });
  }

  var PDF_AKTIONEN = [
    { re: /\/JavaScript\b/,  was: "eingebettetes JavaScript" },
    { re: /\/JS\b/,          was: "eingebettetes JavaScript (/JS)" },
    { re: /\/Launch\b/,      was: "eine Aktion, die ein Programm startet" },
    { re: /\/SubmitForm\b/,  was: "ein Formular, das Eingaben verschickt" },
    { re: /\/OpenAction\b/,  was: "eine Aktion, die beim Öffnen von allein läuft" },
    { re: /\/AA\b/,          was: "eine Aktion, die an ein Ereignis hängt" },
    { re: /\/RichMedia\b/,   was: "eingebettete Medien mit eigener Abspiel-Logik" },
    { re: /\/GoToR\b/,       was: "ein Sprung in eine andere Datei" }
  ];

  /* -- Zeichenketten eines PDFs ------------------------------------------
     Klaus 2026-09-29, an einer echten Word-PDF: „þÿMicrosoft® Word LTSC" und
     „MicrosoftÂ®". Beides waren richtige Angaben, falsch gelesen: eine
     Zeichenkette, die mit den Bytes FE FF beginnt, ist UTF-16 (þÿ sind genau
     diese zwei Bytes, als Latin-1 angezeigt), und XMP ist UTF-8 (Â® ist ein
     UTF-8-®, als Latin-1 angezeigt). Dazu stehen in einer Literal-Zeichenkette
     Escapes (\n, \( , \ooo) und geklammerte Klammern — ein Muster [^)] brach
     an der ersten schliessenden Klammer ab. */
  function bytesAus(s) {
    var b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
    return b;
  }

  function dekodiere(b) {
    if (b.length >= 2 && b[0] === 0xFE && b[1] === 0xFF) {
      var t = "";
      for (var i = 2; i + 1 < b.length; i += 2) t += String.fromCharCode((b[i] << 8) | b[i + 1]);
      return t;
    }
    if (b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return utf8(b.subarray(3));
    return alsLatin1(b);
  }

  function utf8(b) {
    if (typeof welt.TextDecoder !== "function") return alsLatin1(b);
    var t = new welt.TextDecoder("utf-8").decode(b);
    return t.indexOf("\uFFFD") === -1 ? t : alsLatin1(b);
  }

  /* Liest die Literal-Zeichenkette, deren "(" bei `pos` steht. */
  function literal(text, pos) {
    var tiefe = 0, aus = "", i = pos, ESC = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };
    for (; i < text.length && aus.length < 2000; i++) {
      var c = text[i];
      if (c === "\\") {
        var d = text[++i];
        if (d === undefined) break;
        if (ESC[d]) aus += ESC[d];
        else if (/[0-7]/.test(d)) {
          var okt = d;
          while (okt.length < 3 && /[0-7]/.test(text[i + 1] || "")) okt += text[++i];
          aus += String.fromCharCode(parseInt(okt, 8) & 255);
        } else if (d === "\r") { if (text[i + 1] === "\n") i++; }
        else if (d !== "\n") aus += d;
        continue;
      }
      if (c === "(") { if (tiefe++ === 0) continue; }
      else if (c === ")") { if (--tiefe === 0) break; }
      aus += c;
    }
    return dekodiere(bytesAus(aus));
  }

  function hexZk(hex) {
    hex = hex.replace(/\s+/g, "");
    if (hex.length % 2) hex += "0";
    var b = new Uint8Array(hex.length / 2);
    for (var i = 0; i < b.length; i++) b[i] = parseInt(hex.substr(i * 2, 2), 16);
    return dekodiere(b);
  }

  /* Der Wert hinter `/Feld` — Literal oder Hex, oder null. */
  function zkWert(text, m) {
    var rest = m.index + m[0].length;
    if (text[rest] === "(") return literal(text, rest);
    var h = /^<([0-9A-Fa-f\s]{0,2000})>/.exec(text.slice(rest, rest + 2004));
    return h && text[rest + 1] !== "<" ? hexZk(h[1]) : null;
  }

  function sauberZk(w) {
    return String(w).replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function ohneEntities(s) {
    return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); })
            .replace(/&#x([0-9a-fA-F]+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 16)); })
            .replace(/&amp;/g, "&");
  }

  /* ══ HERKUNFTSNACHWEIS (C2PA, „Content Credentials") ═════════════════════
   * Klaus 2026-10-14, an einer PDF aus ChatGPT: Workflow PDF meldete „weitere
   * Datei (Salat-Name)". Die „weitere Datei" war ein Herkunftsnachweis nach
   * C2PA — Programme wie ChatGPT, Photoshop oder eine Kamera hängen ihn an,
   * damit man sieht, WOMIT etwas gemacht wurde. Der Salat-Name kam aus den
   * Bilddaten daneben, nicht aus dem Nachweis.
   *
   * Gelesen wird: Boxen (JUMBF) → CBOR → die wenigen Felder, die ein Mensch
   * versteht (Programm, Aktion, KI ja/nein, wer unterschrieben hat, wann).
   * ⚠ DIE UNTERSCHRIFT WIRD NICHT NACHGERECHNET. Wer sie liest, liest eine
   * ANGABE. Das steht in jedem Satz, der daraus entsteht.
   * Nie ausgeführt, nur gelesen; jede Länge wird gegen die Datei geprüft. */
  function jumbf(b, von, bis, tiefe, aus) {
    var i = von;
    while (i + 8 <= bis && aus.length < 400) {
      var L = ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
      var typ = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
      var kopf = 8;
      if (L === 0) L = bis - i;
      if (L === 1) {
        if (i + 16 > bis) break;
        L = 0;
        for (var k = 8; k < 16; k++) L = L * 256 + b[i + k];
        kopf = 16;
      }
      if (L < kopf || i + L > bis) break;
      var knoten = { typ: typ, von: i + kopf, bis: i + L, kinder: [] };
      if (typ === "jumb" && tiefe < 8) {
        jumbf(b, i + kopf, i + L, tiefe + 1, knoten.kinder);
        var d = knoten.kinder[0];
        if (d && d.typ === "jumd" && d.bis - d.von > 17) {
          var lab = "", p = d.von + 17;
          if (b[d.von + 16] & 2) while (p < d.bis && b[p] !== 0 && lab.length < 200) lab += String.fromCharCode(b[p++]);
          knoten.label = lab;
        }
      }
      aus.push(knoten);
      i += L;
    }
    return aus;
  }

  /* Ein kleiner CBOR-Leser (RFC 8949): genug für die Felder oben, mit Deckeln
     für Tiefe und Länge. Bytefolgen bleiben Uint8Array. */
  function cbor(b, start) {
    var i = start, schritte = 0;
    function zahl(info) {
      if (info < 24) return info;
      var n = info === 24 ? 1 : info === 25 ? 2 : info === 26 ? 4 : info === 27 ? 8 : -1;
      if (n < 0 || i + n > b.length) throw new Error("cbor");
      var v = 0;
      for (var k = 0; k < n; k++) v = v * 256 + b[i++];
      return v;
    }
    function lies(tiefe) {
      if (tiefe > 24 || ++schritte > 20000 || i >= b.length) throw new Error("cbor");
      var kopf = b[i++], art = kopf >> 5, info = kopf & 31;
      if (art === 7) {
        if (info === 20) return false;
        if (info === 21) return true;
        if (info === 22 || info === 23) return null;
        if (info === 25 || info === 26 || info === 27) { zahl(info); return 0; }
        return null;
      }
      if (info === 31) throw new Error("cbor");
      var n = zahl(info);
      if (art === 0) return n;
      if (art === 1) return -1 - n;
      if (art === 2 || art === 3) {
        if (i + n > b.length) throw new Error("cbor");
        var s = b.subarray(i, i + n); i += n;
        return art === 2 ? s : utf8(s);
      }
      if (art === 4) {
        var a = [];
        for (var k = 0; k < n; k++) a.push(lies(tiefe + 1));
        return a;
      }
      if (art === 5) {
        var o = {};
        for (var m = 0; m < n; m++) { var key = lies(tiefe + 1); o[String(key)] = lies(tiefe + 1); }
        return o;
      }
      return lies(tiefe + 1);   /* art 6: Tag — der Inhalt zählt */
    }
    try { return lies(0); } catch (e) { return undefined; }
  }

  /* Aus einem X.509-Zertifikat (DER): Organisation und Name von Aussteller
     und Unterzeichner. Kein ASN.1-Leser — die Felder stehen hinter festen
     Kennungen (2.5.4.10 = O, 2.5.4.3 = CN); der Aussteller steht vor der
     ersten Zeitangabe, der Unterzeichner danach. */
  function zertNamen(der) {
    var aus = { aussteller: {}, inhaber: {} }, zeit = -1;
    for (var i = 0; i + 2 < der.length; i++) {
      if ((der[i] === 0x17 || der[i] === 0x18) && der[i + 1] >= 13 && der[i + 1] <= 15 && zeit === -1) {
        var z = alsLatin1(der.subarray(i + 2, i + 2 + der[i + 1]));
        if (/^\d{12,14}Z$/.test(z)) zeit = i;
      }
      if (der[i] === 0x06 && der[i + 1] === 3 && der[i + 2] === 0x55 && der[i + 3] === 0x04 &&
          (der[i + 4] === 0x0A || der[i + 4] === 0x03)) {
        var p = i + 5, typ = der[p], len = der[p + 1];
        if ((typ === 0x0C || typ === 0x13 || typ === 0x14) && len < 128 && p + 2 + len <= der.length) {
          var feld = der[i + 4] === 0x0A ? "O" : "CN";
          var ziel = zeit === -1 ? aus.aussteller : aus.inhaber;
          if (!ziel[feld]) ziel[feld] = sauberZk(utf8(der.subarray(p + 2, p + 2 + len)));
        }
      }
    }
    return aus;
  }

  var KI_QUELLEN = {
    trainedAlgorithmicMedia: "von einer KI erzeugt",
    compositeWithTrainedAlgorithmicMedia: "teilweise mit einer KI erzeugt",
    algorithmicMedia: "von einem Programm erzeugt (ohne KI-Training)",
    compositeSynthetic: "aus erzeugten Teilen zusammengesetzt",
    digitalCapture: "eine Kamera-Aufnahme",
    negativeFilm: "ein eingescannter Film", positiveFilm: "ein eingescanntes Dia",
    print: "ein eingescannter Ausdruck",
    minorHumanEdits: "mit kleinen Änderungen von Hand",
    humanEdits: "von Hand bearbeitet",
    composite: "aus mehreren Quellen zusammengesetzt",
    screenCapture: "ein Bildschirmfoto"
  };
  var AKTIONEN = {
    "c2pa.created": "erstellt", "c2pa.opened": "geöffnet", "c2pa.edited": "bearbeitet",
    "c2pa.converted": "umgewandelt", "c2pa.placed": "eingefügt", "c2pa.resized": "in der Größe geändert",
    "c2pa.cropped": "zugeschnitten", "c2pa.filtered": "gefiltert", "c2pa.color_adjustments": "Farben geändert",
    "c2pa.drawing": "gezeichnet", "c2pa.published": "veröffentlicht", "c2pa.transcoded": "umgerechnet",
    "c2pa.repackaged": "neu verpackt", "c2pa.removed": "etwas entfernt", "c2pa.translated": "übersetzt"
  };

  function nameVon(x) {
    if (!x) return "";
    if (typeof x === "string") return sauberZk(x).slice(0, 120);
    if (typeof x === "object" && typeof x.name === "string")
      return sauberZk(x.name + (typeof x.version === "string" && x.version !== x.name ? " " + x.version : "")).slice(0, 120);
    return "";
  }

  /**
   * Liest einen C2PA-Herkunftsnachweis (JUMBF-Bytes).
   * @returns {null | {satz:string, daten:string[][]}}
   */
  function c2paLesen(b) {
    b = b instanceof Uint8Array ? b : new Uint8Array(b || []);
    var wurzel = jumbf(b, 0, b.length, 0, [])[0];
    if (!wurzel) {
      /* abgeschnitten: die Wurzel passt nicht in die Bytes. Steht vorn trotzdem
         „c2pa" als Etikett, ist es ein Nachweis — kaputt, nicht „keiner". */
      var vorn = "";
      for (var q = 33; q < Math.min(b.length, 38) && b[q] !== 0; q++) vorn += String.fromCharCode(b[q]);
      var t1 = String.fromCharCode(b[4], b[5], b[6], b[7]), t2 = String.fromCharCode(b[12], b[13], b[14], b[15]);
      return (t1 === "jumb" && t2 === "jumd" && vorn === "c2pa") ? { satz: "", daten: [], kaputt: true } : null;
    }
    if (wurzel.label !== "c2pa") return null;
    var manifeste = wurzel.kinder.filter(function (k) { return k.typ === "jumb" && /^urn:/.test(k.label || ""); });
    if (!manifeste.length) return { satz: "", daten: [], kaputt: true };
    var akt = manifeste[manifeste.length - 1];   /* der aktive Nachweis steht zuletzt */
    function kind(k, re) { return (k.kinder || []).filter(function (c) { return re.test(c.label || ""); })[0]; }
    function inhalt(k) {
      var c = (k && k.kinder || []).filter(function (x) { return x.typ === "cbor"; })[0];
      return c ? cbor(b.subarray(c.von, c.bis), 0) : undefined;
    }
    var claim = inhalt(kind(akt, /^c2pa\.claim(\.v\d+)?$/)) || {};
    var behauptungen = kind(akt, /^c2pa\.assertions$/);
    var aktionen = inhalt(behauptungen && kind(behauptungen, /^c2pa\.actions(\.v\d+)?$/)) || {};
    var sig = inhalt(kind(akt, /^c2pa\.signature$/));

    var gi = claim.claim_generator_info;
    var programm = nameVon(Array.isArray(gi) ? gi[0] : gi) ||
                   nameVon(claim.claim_generator);
    var titel = typeof claim["dc:title"] === "string" ? sauberZk(claim["dc:title"]).slice(0, 120) :
                typeof claim.title === "string" ? sauberZk(claim.title).slice(0, 120) : "";
    var taten = [], quellen = [], werkzeuge = [], zeit = "";
    (Array.isArray(aktionen.actions) ? aktionen.actions : []).slice(0, 20).forEach(function (a) {
      if (!a || typeof a !== "object") return;
      var was = AKTIONEN[a.action] || (typeof a.action === "string" ? sauberZk(a.action).slice(0, 60) : "");
      if (was && taten.indexOf(was) === -1) taten.push(was);
      var q = typeof a.digitalSourceType === "string" ? a.digitalSourceType.split("/").pop() : "";
      if (q && quellen.indexOf(KI_QUELLEN[q] || q) === -1) quellen.push(KI_QUELLEN[q] || sauberZk(q).slice(0, 60));
      var w = nameVon(a.softwareAgent);
      if (w && werkzeuge.indexOf(w) === -1) werkzeuge.push(w);
      if (!zeit && typeof a.when === "string") zeit = sauberZk(a.when).slice(0, 40);
    });
    /* COSE_Sign1: [geschützt, ungeschützt, Nutzlast, Unterschrift];
       das Zertifikat steht unter Schlüssel 33 (x5chain). */
    var zert = null;
    if (Array.isArray(sig)) {
      var kopfe = [sig[1]];
      if (sig[0] instanceof Uint8Array) kopfe.unshift(cbor(sig[0], 0));
      kopfe.forEach(function (h) {
        if (zert || !h || typeof h !== "object") return;
        var x = h["33"];
        if (Array.isArray(x)) x = x[0];
        if (x instanceof Uint8Array) zert = zertNamen(x);
      });
    }
    var unterschrieben = zert && (zert.inhaber.O || zert.inhaber.CN) || "";
    var aussteller = zert && (zert.aussteller.O || zert.aussteller.CN) || "";

    var teile = [];
    if (programm) teile.push("erstellt mit " + programm);
    else if (werkzeuge.length) teile.push("erstellt mit " + werkzeuge[0]);
    quellen.forEach(function (q) { teile.push(q); });
    if (unterschrieben) teile.push("unterschrieben von " + unterschrieben);
    var satz = "Herkunftsnachweis (Content Credentials)" +
               (teile.length ? ": laut Angabe " + teile.join(", ") : "") +
               ". Die Unterschrift wird hier nicht nachgerechnet.";

    var daten = [];
    if (titel) daten.push(["Titel", titel]);
    if (programm) daten.push(["Programm", programm]);
    werkzeuge.forEach(function (w) { if (w !== programm) daten.push(["Werkzeug", w]); });
    if (taten.length) daten.push(["Was gemacht wurde", taten.join(", ")]);
    if (quellen.length) daten.push(["Woher der Inhalt stammt", quellen.join(", ")]);
    if (zeit) daten.push(["Zeitpunkt", zeit]);
    if (unterschrieben) daten.push(["Unterschrieben von", unterschrieben]);
    if (aussteller) daten.push(["Zertifikat ausgestellt von", aussteller]);
    daten.push(["Nachweise in der Datei", String(manifeste.length) +
                (manifeste.length > 1 ? " (frühere Bearbeitungen stehen davor)" : "")]);
    daten.push(["Geprüft", "Nur gelesen. Ob die Unterschrift echt ist, rechnet dieser Prüfer nicht nach."]);
    return { satz: satz, daten: daten };
  }

  var PDF_METAFELDER = ["Author", "Creator", "Producer", "Title", "Subject", "Keywords"];

  /**
   * Prüft eine PDF-Datei.
   * @param {Uint8Array} bytes  die Datei
   * @param {string[]} erlaubt  Wirte, die nicht als fremd gelten
   * @returns {Promise<{stellen:object[], hinweise:string[]}>}
   */
  function pruefePdf(bytes, erlaubt) {
    erlaubt = (erlaubt || []).map(function (e) { return String(e).toLowerCase().trim(); })
                             .filter(Boolean);
    bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    var roh = alsLatin1(bytes);
    var treffer = [], hinweise = [];

    if (roh.slice(0, 5) !== "%PDF-") {
      return Promise.resolve({
        stellen: [],
        hinweise: ["Das ist keine PDF-Datei — sie beginnt nicht mit %PDF-."]
      });
    }
    hinweise.push("PDF-Fassung " + (/^%PDF-(\d+\.\d+)/.exec(roh) || [, "?"])[1] +
                  ", " + bytes.length + " Bytes.");

    function melde(pos, kennung, satz) {
      var obj = objektVor(roh, pos);
      treffer.push({ stelle: obj ? "Objekt " + obj : "Byte " + pos,
                     kennung: kennung, satz: satz });
    }

    /* Strom-Inhalte ausgeblendet, gleich lang (Stellen bleiben gleich).
     * Klaus 2026-10-14: in den Bilddaten einer PDF aus ChatGPT stand zufällig
     * „/JS" und „/AA" — gemeldet wurde „eingebettetes JavaScript". Wörterbücher
     * werden im ausgeblendeten Text gelesen; gepackte Ströme prüft die
     * Schleife unten nach dem Entpacken. */
    var ohneStr = roh.replace(/(>>\s*stream(?:\r\n|\n|\r))([\s\S]*?)(endstream)/g, function (g, a, mitte, c) {
      return a + mitte.replace(/[^\r\n]/g, " ") + c;
    });

    /* -- Verweise nach außen --------------------------------------------- */
    var ure = /\/URI\s*\(\s*([^)]{1,400})\)/g, um;
    var wirteGesehen = {};
    while ((um = ure.exec(ohneStr)) !== null) {
      var adr = um[1].replace(/\\([()\\])/g, "$1").trim();
      var wm = /^(?:https?:)?\/\/([A-Za-z0-9._\-]+)/.exec(adr);
      if (!wm) continue;
      var wirt = wm[1].toLowerCase(), eigen = false;
      for (var e = 0; e < erlaubt.length; e++) {
        if (wirt === erlaubt[e] || wirt.slice(-(erlaubt[e].length + 1)) === "." + erlaubt[e]) eigen = true;
      }
      if (eigen || wirteGesehen[wirt]) continue;
      wirteGesehen[wirt] = 1;
      melde(um.index, "PDF-VERWEIS", "Verweis auf einen fremden Rechner: " + wirt);
    }

    /* -- Aktionen --------------------------------------------------------- */
    function aktionenIn(text, versatz, herkunft) {
      for (var a = 0; a < PDF_AKTIONEN.length; a++) {
        var m = PDF_AKTIONEN[a].re.exec(text);
        if (!m) continue;
        melde(versatz + m.index, "PDF-AKTION",
              "Das Dokument enthält " + PDF_AKTIONEN[a].was + herkunft + ".");
      }
    }
    aktionenIn(ohneStr, 0, "");

    /* -- Anhänge ---------------------------------------------------------- *
     * Klaus 2026-10-14: „weitere Datei (Salat-Name)" an einer PDF aus ChatGPT.
     * Zwei Fehler: die Namen wurden in der GANZEN Datei gesucht — auch in den
     * Bilddaten, und dort steht zufällig „/F(" —, und ein Herkunftsnachweis
     * (C2PA) wurde wie ein beliebiger Anhang gemeldet. Jetzt: Ströme werden vor
     * der Namenssuche ausgeblendet, gelesen wird nur in einem /Filespec-Objekt,
     * und ein Nachweis wird GELESEN und als PDF-HERKUNFT gemeldet. */
    var herkunftLesen = [];
    if (/\/EmbeddedFile\b|\/FileAttachment\b|\/Filespec\b/.test(ohneStr)) {
      var ap = ohneStr.search(/\/EmbeddedFile\b|\/FileAttachment\b|\/Filespec\b/);
      var namen = [], andere = 0, nachweise = 0;
      var fre = /\/Type\s*\/Filespec\b/g, fm;
      function objektText(pos) {
        var a = ohneStr.lastIndexOf(" obj", pos), z = ohneStr.indexOf("endobj", pos);
        return ohneStr.slice(a === -1 ? Math.max(0, pos - 2000) : a, z === -1 ? pos + 2000 : z);
      }
      while ((fm = fre.exec(ohneStr)) !== null && namen.length + nachweise < 20) {
        var ot = objektText(fm.index);
        var efm = /\/EF\s*<<[^>]*?\/(?:UF|F)\s+(\d+)\s+0\s+R/.exec(ot);
        var istC2pa = /\/AFRelationship\s*\/C2PA_Manifest\b/.test(ot);
        var efText = "";
        if (efm) {
          var ore = new RegExp("(?:^|[^0-9])" + efm[1] + "\\s+0\\s+obj\\b", "g"), om, letzt = -1;
          while ((om = ore.exec(ohneStr)) !== null) letzt = om.index;
          if (letzt !== -1) {
            efText = ohneStr.slice(letzt, ohneStr.indexOf("stream", letzt) + 1 || letzt + 2000);
            if (/\/Subtype\s*\/application#2Fc2pa\b/i.test(efText)) istC2pa = true;
          }
        }
        if (istC2pa) {
          nachweise++;
          if (efm && letzt !== -1) herkunftLesen.push({ pos: fm.index, obj: letzt });
          else melde(fm.index, "PDF-HERKUNFT", "Herkunftsnachweis (Content Credentials) vorhanden, aber nicht lesbar — ungeprüft.");
          continue;
        }
        andere++;
        var nre = /\/(?:UF|F)\s*(?=[(<])/g, nm;
        while ((nm = nre.exec(ot)) !== null) {
          var nw = zkWert(ot, nm);
          if (nw === null || !sauberZk(nw)) continue;
          if (namen.indexOf(sauberZk(nw).slice(0, 200)) === -1) namen.push(sauberZk(nw).slice(0, 200));
          break;
        }
      }
      if (andere || (!nachweise && /\/EmbeddedFile\b|\/FileAttachment\b/.test(ohneStr))) {
        melde(ap, "PDF-ANHANG", "An der Datei hängt eine weitere Datei" +
              (namen.length ? " (" + namen.slice(0, 6).join(", ") + ")" : "") +
              " — sie wird mit ausgeliefert, ohne im Dokument sichtbar zu sein.");
      }
    }
    /* Den Strom eines Nachweises öffnen: /Length direkt, sonst bis endstream. */
    function nachweisLesen(n) {
      var sm2 = />>\s*stream(?:\r\n|\n|\r)/g; sm2.lastIndex = n.obj;
      var s = sm2.exec(roh);
      if (!s) return Promise.resolve(null);
      var beginn = s.index + s[0].length, wb = roh.slice(n.obj, s.index + 2);
      var lm = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(wb), ende = -1;
      if (lm && /^\s*endstream/.test(roh.slice(beginn + (+lm[1]), beginn + (+lm[1]) + 16))) ende = beginn + (+lm[1]);
      if (ende === -1) ende = roh.indexOf("endstream", beginn);
      if (ende === -1) return Promise.resolve(null);
      var teil = bytes.subarray(beginn, ende);
      var gepackt = /\/Filter\s*(?:\[\s*)?\/FlateDecode/.test(wb);
      return (gepackt ? entpacke(teil) : Promise.resolve(ohneEndzeile(teil))).then(function (aus) {
        return aus ? c2paLesen(aus) : null;
      }, function () { return null; });
    }

    /* -- Metadaten -------------------------------------------------------- */
    function metaIn(text, versatz, herkunft) {
      for (var i = 0; i < PDF_METAFELDER.length; i++) {
        var feld = PDF_METAFELDER[i];
        var re = new RegExp("/" + feld + "\\s*(?=[(<])", "g"), m;
        while ((m = re.exec(text)) !== null) {
          var wert = zkWert(text, m);
          if (wert === null) continue;
          wert = sauberZk(wert);
          if (!wert) continue;
          melde(versatz + m.index, "PDF-METADATEN",
                feld + ": " + (wert.length > 120 ? wert.slice(0, 120) + " …" : wert) + herkunft);
          break;
        }
      }
      /* XMP — dieselbe Auskunft in einer zweiten Sprache, und oft die
         gesprächigere: dort steht das Programm samt Fassung und die Uhrzeit. */
      var xre = /<(dc:creator|xmp:CreatorTool|pdf:Producer|xmp:CreateDate)[^>]*>([\s\S]{1,300}?)<\/\1>/g, xm;
      while ((xm = xre.exec(text)) !== null) {
        /* XMP ist UTF-8 (Standard). Gelesen wurde es als Latin-1 — daher Â®. */
        var inhalt = sauberZk(ohneEntities(utf8(bytesAus(xm[2].replace(/<[^>]*>/g, " ")))));
        if (!inhalt) continue;
        melde(versatz + xm.index, "PDF-METADATEN",
              xm[1] + ": " + (inhalt.length > 120 ? inhalt.slice(0, 120) + " …" : inhalt) + herkunft);
      }
    }
    metaIn(roh, 0, "");

    /* -- Frühere Fassungen -------------------------------------------------
     * Der beste Fund, den ein PDF hergibt, und der am wenigsten bekannte:
     * Bearbeitungs-Programme hängen Änderungen HINTEN AN, statt die Datei neu
     * zu schreiben. Wer einen Absatz gelöscht, einen Preis geändert oder etwas
     * geschwärzt und dann gespeichert hat, liefert die alte Fassung mit — sie
     * steht weiter in der Datei und ist mit jedem Betrachter wieder sichtbar
     * zu machen. Erkennbar an mehr als einem `%%EOF`. */
    var eofs = (roh.match(/%%EOF/g) || []).length;
    if (eofs > 1) {
      treffer.push({ stelle: eofs + "-mal %%EOF", kennung: "PDF-ALTFASSUNG",
        satz: "Die Datei enthält " + eofs + " Speicherstände. Alles, was vor dem " +
              "letzten stand, steckt weiter darin — auch Gelöschtes und Geschwärztes." });
    }

    if (/\/Encrypt\b/.test(roh)) {
      hinweise.push("Die Datei ist verschlüsselt oder mit Rechten versehen. " +
                    "Was in den verschlüsselten Teilen steht, ist hier NICHT geprüft.");
    }

    /* -- Ströme öffnen -----------------------------------------------------
     * Seit PDF 1.5 stecken ganze Objekte in gepackten Strömen (`/ObjStm`) —
     * darunter die Metadaten. Ein Leser, der nur den Klartext ansieht, meldet
     * dort NICHTS und sieht dabei aus, als sei die Datei sauber. */
    /* ⚠ ZWEI FEHLER, AN KLAUS' WORD-PDF GEFUNDEN (2026-09-29): „3 gepackte
       Ströme geöffnet, 2 davon NICHT lesbar".
       · Die Suche ging nach jedem Strom bei `endstream` weiter — und fand das
         „stream" IN „endstream". Daraus wurde ein Scheinstrom vom Ende des einen
         bis zum Ende des nächsten, und der war natürlich nicht zu entpacken.
       · Ob ein Strom gepackt ist, wurde an den 400 Zeichen davor abgelesen — dort
         steht oft das /FlateDecode des NACHBARN.
       Jetzt zählt nur ein `stream` direkt hinter dem `>>` seines Wörterbuchs, und
       der Filter wird aus genau diesem Wörterbuch gelesen. Ein Deckel bleibt, aber
       er wird genannt, statt still abzuschneiden. */
    var STROM_DECKEL = 400;
    var stroeme = [], sre = />>\s*stream(?:\r\n|\n|\r)/g, sm, uebrig = 0;
    while ((sm = sre.exec(roh)) !== null) {
      var beginn = sm.index + sm[0].length;
      var objAnf = roh.lastIndexOf(" obj", sm.index);
      var wb = roh.slice(objAnf === -1 ? Math.max(0, sm.index - 2000) : objAnf, sm.index + 2);
      var laenge = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(wb);
      var ende = -1;
      if (laenge) {
        var bis = beginn + (+laenge[1]);
        if (/^\s*endstream/.test(roh.slice(bis, bis + 16))) ende = bis;
      }
      if (ende === -1) ende = roh.indexOf("endstream", beginn);
      if (ende === -1) break;
      sre.lastIndex = ende + 9;
      var filter = /\/Filter\s*(?:\[\s*)?\/(\w+)/.exec(wb);
      if (!filter || filter[1] !== "FlateDecode") continue;
      if (stroeme.length >= STROM_DECKEL) { uebrig++; continue; }
      stroeme.push({ von: beginn, bis: ende });
    }

    var nichtLesbar = 0;
    var start = herkunftLesen.reduce(function (kette, n) {
      return kette.then(function () {
        return nachweisLesen(n).then(function (r) {
          if (r && r.satz) treffer.push({ stelle: objektVor(roh, n.pos) ? "Objekt " + objektVor(roh, n.pos) : "Byte " + n.pos,
                                          kennung: "PDF-HERKUNFT", satz: r.satz, daten: r.daten });
          else melde(n.pos, "PDF-HERKUNFT", "Herkunftsnachweis (Content Credentials) vorhanden, aber nicht lesbar — ungeprüft.");
        });
      });
    }, Promise.resolve());
    return stroeme.reduce(function (kette, s) {
      return kette.then(function () {
        return entpacke(bytes.subarray(s.von, s.bis)).then(function (aus) {
          if (!aus) { nichtLesbar++; return; }
          var text = alsLatin1(aus);
          metaIn(text, s.von, " (in einem gepackten Strom)");
          aktionenIn(text, s.von, " (in einem gepackten Strom)");
        }, function () { nichtLesbar++; });
      });
    }, start).then(function () {
      if (stroeme.length) {
        hinweise.push(stroeme.length + " gepackte Ströme geöffnet" +
          (nichtLesbar ? ", " + nichtLesbar + " davon NICHT lesbar — die sind ungeprüft, nicht sauber" : "") + ".");
      }
      if (uebrig) {
        hinweise.push(uebrig + " weitere gepackte Ströme NICHT geöffnet (Deckel " + STROM_DECKEL +
                      ") — die sind ungeprüft, nicht sauber.");
      }
      /* Doppelte Meldungen zusammenfassen: derselbe Befund kann im Klartext UND
         im gepackten Strom stehen. Zweimal dasselbe zu melden lässt eine Datei
         schlimmer aussehen, als sie ist. */
      var gesehen = {}, sauber = [];
      treffer.forEach(function (x) {
        var s = x.kennung + "|" + x.satz.replace(" (in einem gepackten Strom)", "");
        if (gesehen[s]) return;
        gesehen[s] = 1; sauber.push(x);
      });
      return { stellen: sauber, hinweise: hinweise };
    });
  }

  welt.PrueferFormate = {
    pruefeText: pruefeText,
    pruefePdf: pruefePdf,
    c2paLesen: c2paLesen,
    istFreigestellt: istFreigestellt,
    istIban: istIban,
    BEFUNDE_TEXT: BEFUNDE_TEXT,
    BEFUNDE_PDF: BEFUNDE_PDF,
    FREI_PFADE: FREI_PFADE,
    _meta: { herkunft: "PWA Toolpoint 2026-08-23", fassung: "3" }
  };
})(typeof window !== "undefined" ? window : globalThis);
