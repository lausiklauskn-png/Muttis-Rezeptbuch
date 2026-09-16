# Projektregeln für Claude – Muttis Rezeptbuch

---

## ⚠️ PFLICHT-CHECKLISTE NACH JEDER ÄNDERUNG

Claude muss nach **jeder** Änderung an der QC-Datei folgende Punkte ausgeben und den Benutzer explizit darauf hinweisen:

```
✅ 1. QC-Datei geändert:   QC_MR_*.html       ← erledigt
✅ 2. index.html:          Neu gebaut via build.py ← erledigt (Claude darf bauen)
```

**Claude darf eine Aufgabe NICHT als erledigt melden, ohne diese Checkliste anzuzeigen.**

---

## Projektübersicht

### Dieses Repo: `lausiklauskn-png/Muttis-Rezeptbuch`
- **App-Name:** Muttis Rezeptbuch (das Original)
- **Aktuelle Version:** v9.2
- **Lokaler Pfad:** `/home/user/Muttis-Rezeptbuch/`

### Schwesterprojekt: `lausiklauskn-png/Mein-Rezeptbuch`
- **App-Name:** Mein Rezeptbuch (öffentlicher Klon)
- Die beiden Apps sind funktional identisch – Mein Rezeptbuch ist ein Klon
- Änderungen werden in der Regel **zuerst hier** (Muttis Rezeptbuch) entwickelt, dann in Mein-Rezeptbuch übertragen

---

## Dateistruktur

| Datei | Bedeutung |
|---|---|
| `index.html` | **Produktionsdatei** – enthält `_CR`-Wasserzeichen – NICHT direkt bearbeiten |
| `QC_MR_08_04_26.html` | **Quelldatei (v9.2)** – saubere, lesbare Version ohne Sicherheitsblock – hier werden Änderungen gemacht |
| `build.py` | **Build-Skript** – baut `index.html` aus QC-Datei + `_cr_block.txt` |
| `_cr_block.txt` | Gespeicherter _CR-Schutzblock (~111 KB, Einzeiler) |
| `extract_cr.py` | Einmalig: extrahiert _CR-Block aus bestehender `index.html` |
| `sw.js` / `app-sw.js` | Service Worker |
| `manifest.json` / `app-manifest.json` | PWA-Manifeste |

### Build-Workflow (index.html neu bauen)
Nach Änderungen an der QC-Datei einfach ausführen:
```bash
python3 build.py
```
Das Skript findet automatisch die neueste `QC_MR_*.html` und kombiniert sie mit `_cr_block.txt` → erzeugt `index.html`.

### QC-Datei aus index.html extrahieren (falls nötig)
Der `_CR`-Block ist **eine einzige Zeile** (~113.000 Zeichen), die mit `const _CR=Object.freeze` beginnt.
```python
python3 -c "
with open('index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()
header_end = 0
for i, l in enumerate(lines):
    if '-->' in l and i < 20:
        header_end = i + 1
        break
cr_line = None
for i, l in enumerate(lines):
    if l.strip().startswith('const _CR=Object.freeze'):
        cr_line = i
        break
import datetime
d = datetime.date.today().strftime('%d_%m_%y')
output = lines[header_end:cr_line] + lines[cr_line+1:]
filename = f'QC_MR_{d}.html'
open(filename, 'w', encoding='utf-8').writelines(output)
print(f'Gespeichert: {filename}, {len(output)} Zeilen')
"
```

---

## Übersetzungssystem
- `LANGS`-Objekt im JS (ab ca. Zeile 2324 in index.html)
- Funktion `T(k)` für alle UI-Texte
- 8 Sprachen: de, en, ru, zh, es, fr, it, pt
- Variable `CL` = aktuelle Sprache (aus localStorage `mlang9`)

---

## Workflow-Regeln

### Entwicklung
1. Änderungen **immer** in der QC-Datei (`QC_MR_*.html`) vornehmen
2. Nach Änderungen: `python3 build.py` ausführen → erzeugt neue `index.html`
3. Commit-Nachrichten auf **Deutsch**

### Selbst-Merge-Freibrief (Klaus 2026-06-28, netzweit für ALLE Repos)

Die Sitzung merget ihre **eigenen** PRs selbstständig nach `main`, sobald sie getestet
(Build/Smoke grün), abgegrenzt und nicht architektonisch zweifelhaft sind — **ohne** auf
ein „X mergen" zu warten. **Nicht** bei echtem Zweifel oder wenn Klaus vorher
draufschauen will. Klaus' Browser-Sichttest läuft **nach** dem Merge auf der Live-Seite.
Volltext: [NETZWEIT § 1](https://github.com/lausiklauskn-png/Sage-Protokol/blob/main/docs/NETZWEIT.md).

> **Dieser Abschnitt fehlte hier bis zum 2026-08-22** — als einziges der 20 Repos.
> Der „Hochladen"-Ablauf unten endete bei „PR-URL mitteilen", während die Schwester-
> Datei in Mein-Rezeptbuch an derselben Stelle „und direkt mergen" ergänzt. Zwei
> Schwester-Repos, zwei Regeln. Nachgetragen, damit der Freibrief netzweit gilt,
> wie Klaus ihn erteilt hat.

### "Hochladen"-Befehl
Wenn der Benutzer **"Hochladen"** schreibt:
1. Alle lokalen Änderungen committen
2. Auf aktuellen Feature-Branch pushen: `git push -u origin <branch>`
3. PR erstellen via `mcp__github__create_pull_request` → nach `main`
4. PR-URL mitteilen

### Pflicht-Prüfung bei "Hochladen" oder "Mergen"
**Immer** alle offenen Branches und PRs prüfen – nicht nur den aktuellen Branch:

| Schritt | Primär (MCP) | Fallback (git) |
|---|---|---|
| Offene PRs prüfen | `mcp__github__list_pull_requests` (state: open) | entfällt |
| Alle Branches prüfen | `mcp__github__list_branches` | `git fetch --all` |
| Branches ahead of main | — | `git log origin/main..origin/<branch> --oneline` für jeden Branch |

**Wenn MCP-Tools nicht verfügbar:**
- Explizit melden: *"GitHub-PRs können gerade nicht geprüft werden (MCP nicht verfügbar)"*
- git-Fallback verwenden: alle Remote-Branches auf ungemergede Commits prüfen
- NIEMALS "nichts offen" sagen ohne zu prüfen, was tatsächlich geprüft wurde

**⚠️ Squash-Merge-Falle:**
Nach einem Squash-Merge zeigt `git log origin/main..origin/<branch>` immer noch Commits an, obwohl der Inhalt bereits in main ist. Deshalb **immer zusätzlich** prüfen:
```bash
git diff origin/main..origin/<branch> --stat
```
- Keine Unterschiede → Branch ist veraltet, sicher zu löschen
- Echte Unterschiede → Branch hat neueren/anderen Inhalt, erst prüfen ob Merge sinnvoll

**⚠️ Branch würde main VERSCHLECHTERN:**
Wenn `git diff` zeigt, dass der Branch ältere Versionen von Dateien enthält (z.B. kleinere PNGs, alten Code), würde ein Merge main-Verbesserungen **rückgängig machen**.
→ **NIEMALS mergen** – stattdessen klar erklären und Branch zum Löschen empfehlen.

**⚠️ Angaben aus anderen Sitzungen nicht blind vertrauen:**
Wenn der Benutzer sagt "Branch X muss noch hochgeladen/gemergt werden" (Info aus anderer Session):
→ **Immer zuerst selbst prüfen** mit `git log` + `git diff --stat` bevor gehandelt wird.

### Branch-Konvention
- Feature-Branches werden automatisch angelegt (Format: `claude/<beschreibung>-<id>`)
- Immer auf dem zugewiesenen Branch arbeiten (steht oben in der Session-Konfiguration)

---

## Icon-System

### Aktuelle Icon-Datei
`icons/icon-book-blue.svg` – Spektral-Verlauf (Violett→Blau→Cyan→Grün→Orange→Rot)

### Icons neu generieren (nach SVG-Änderung)
```python
import cairosvg
for s in [72,96,120,128,144,152,180,192,384,512]:
    cairosvg.svg2png(url='icons/icon-book-blue.svg',
                     write_to=f'icons/icon-book-blue-{s}.png',
                     output_width=s, output_height=s)
```

### ⚠️ REGEL GEÄNDERT 2026-08-08: Icons als DATEI mit Versionsnummer

**Bis dahin galt:** alle Icons als Base64 in die HTML einbetten, weil Browser
externe Favicon-URLs aggressiv cachen — selbst nach Cache-Leeren blieb das alte
Icon stehen.

**Das Problem war echt, der Preis war zu hoch.** Gemessen am 2026-08-08: die
eingebetteten Symbole machten **1.119 KB** der Quelldatei aus (darunter ein
625-KB-SVG). Sie lagen damit bei **jedem** Seitenaufruf auf dem kritischen Pfad,
obwohl sie während des Ladens **niemand sieht** — es sind Tab- und
Startbildschirm-Symbole.

| | vorher | nachher |
|---|---|---|
| Quelldatei | 1.929 K | **810 K** |
| erster Anstrich | 6,7 · 6,5 s | **2,5 · 2,3 s** |
| Leistung (Handy, lokal) | 56 · 51 | **90 · 90** |

**Neue Regel:** Icons als Datei verlinken, mit **Versionsnummer in der Adresse**:

```html
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-book-192.png?v=1">
```

Die Versionsnummer löst dasselbe Problem wie die Einbettung: eine geänderte
Adresse ist für den Cache ein **anderes** Bild, das alte kann er nicht mehr
liefern. Nur kostet sie keine Bytes im Dokument.

**Nach jeder Icon-Änderung `?v=` um eins hochzählen** — in der QC-Datei und in
`app-sw.js`. Beide müssen **dieselbe** Adresse nennen, sonst holt der
Offline-Vorrat ein anderes Bild als die Seite.

**Pflicht dabei:** jedes verlinkte Icon gehört in den `SHELL`-Vorrat von
`app-sw.js`, sonst fehlen die Symbole offline. Vorher lag das Problem nicht vor,
weil sie im Dokument steckten.

**Bleibt es bei einer eingebetteten Icon-Datei, obwohl das Icon sich ändert und
der Browser das alte zeigt?** Dann ist die stärkere Fassung ein echter
Dateiname-Wechsel (`icon-book-192-v2.png`) statt der `?v=`-Angabe.

Die Icons selbst erzeugt weiterhin `generate_icons.py` aus `icons/icon-book.svg`.

---

## Häufige Aufgaben

### Neue Funktion hinzufügen
1. In `QC_MR_*.html` implementieren
2. `python3 build.py` ausführen
3. Hochladen

### Zurück-Navigation (Back-Taste / Maus-Zurück)
Das System arbeitet in drei Schichten (Priorität von oben nach unten):
1. **newPanel** offen → schließen
2. **Mein Menü offen + Tab-History** → zum vorigen Tab (`_mvTabStack`)
3. **Mein Menü offen, kein Tab mehr** → MV schließen
4. **Anderes Overlay offen** → Overlay schließen (`OVERLAY_MAP`)
5. **Screen-History** → zum vorigen Screen (`_scStack`, max. 20)
6. **Nichts mehr** → Toast "Nochmal drücken" → beim 2. Druck in App bleiben

**`_mvTabStack`** – Tab-History für Mein Menü:
- `switchMVTab()` ist gewrappt: jeder Tab-Wechsel wird auf den Stack gelegt
- Zurück popt den letzten Tab und wechselt dorthin (ohne MV zu schließen)
- Stack wird beim Schließen von MV automatisch geleert
- Gleiches Muster wie `_scStack` für Haupt-Screens

**`_scStack`** – Screen-History für Haupt-Navigation:
- `showSc()` ist gewrappt: jeder Screen-Wechsel wird gespeichert (max. 20)
- Zurück navigiert zum tatsächlich letzten Screen statt immer zu Rezepte

→ **Für Mein-Rezeptbuch übernehmen** (identische Implementierung)

### ⚠️ REGEL: Elementhöhe niemals per CSS calc(vw) — immer JS
CSS `height:calc(vw)` und `padding-top`-Tricks greifen in Chrome/Android nicht zuverlässig.
Stattdessen: `offsetWidth` messen + `element.style.setProperty('height', px, 'important')`.

Beispiel (Rezeptkarten-Bildbereich, 3:4-Hochformat):
```javascript
const cw = cont.offsetWidth;
if (cw >= 50) {
  const h = Math.round(cw * 4 / 3);
  document.querySelectorAll('.rcard').forEach(card => {
    const wrap = card.querySelector('.rcard-img-wrap');
    const img  = card.querySelector('.rcard-img');
    if (wrap) wrap.style.setProperty('height', h + 'px', 'important');
    if (img)  img.style.setProperty('height',  h + 'px', 'important');
  });
}
```
Dieser Fix läuft am Ende von `render()` – nach `c.innerHTML=html`, wenn der Container bereits sichtbar ist.

### Swipe / Touch / Drag & Drop
- Swipe-Handler: IIFE ab `// ── SWIPE-NAVIGATION ──` (kurz vor `boot()`)
- Touch-Drag: `setupTouchDrag()` und `setupWkTouchDrag()`
- Drag-Selektoren: `.drag-hdl`, `.ing-drag-hdl`, `.fld-drag-hdl`, `.wk-drag-hdl`

### Sprache hinzufügen
- Im `LANGS`-Objekt neuen Sprachblock ergänzen
- `CL`-Variable und `T(k)`-Funktion funktionieren automatisch

---

## 🏷️ KATEGORIEN SIND UMBENENNBAR — mit eigenem Symbol (Klaus 2026-09-15)

Übertragen aus **Mein Mixarium**. Klaus: *„diese Möglichkeit des Umbenennens
der Kategorien bitte in mein Rezeptbuch und Muttis Rezeptbuch übertragen."*

Der Weg: 📂 **Ordner** → in der Knopfzeile **✎ Kategorien umbenennen**. Je Zeile
ein Symbol und ein Name; ein Tipp aufs Symbol öffnet ein Raster mit 107
Emojis. Leer lassen heisst Vorgabe, ↺ setzt eine Zeile zurück.

### Drei Sachen, die man wissen muss, bevor man daran baut

- ⚠ **Gespeichert wird NUR die Beschriftung, nie die Kennung.** `c.id` bleibt
  `fleisch`, auch wenn dort „Hauptgerichte" steht. Jedes Rezept zeigt über
  `r.cat` auf diese Kennung — wer sie umbenennt, nimmt allen Rezepten ihr
  Zuhause.
- ⚠ **Der Speicher-Schlüssel ist app-eigen.** Beide Rezeptbücher liegen auf
  derselben `github.io`-Adresse und teilen sich den localStorage. Mein
  Rezeptbuch schreibt `mrz9m`, Muttis `mrz9` — der neue Schlüssel folgt genau
  dieser Trennung (`mrzcats9m` bzw. `mrzcats9`). Eine Probe besteht darauf,
  dass der Schlüssel des ANDEREN Buches leer bleibt.
- ⚠ **Ein eigener Name gilt in allen 8 Sprachen.** Er ist selbst geschrieben;
  ihn zu übersetzen hiesse raten. Das steht im Dialog, sonst wäre es eine
  stille Entscheidung.

### Fremde Kategorien verschwinden nicht mehr still

`catsFremd()` sammelt Kennungen, die in `R` vorkommen und die `CATS` nicht
kennt — etwa aus einem Import der Schwester-App. Solche Rezepte lagen bisher
in `R`, wurden gespeichert und mitexportiert und **nie gezeichnet**, auch nicht
unter „Alle": die Alle-Ansicht lief über `CATS`. Zu finden waren sie nur über
die Suche. Sie bekommen jetzt einen eigenen Reiter, tragen im Dialog die Marke
„mitgebracht" und sind umbenennbar wie jede andere.

### ⚠ Die Namen sind mit Bedacht anders als `catName`/`catIco`

`katBeschriftung(c)` und `katSymbol(c)` nehmen das **Objekt**, die alten
`catName(id)`/`catIco(id)` eine **Kennung**. In Mixarium hiess `katSymbol`
zuerst `catIco` — Funktions-Deklarationen werden hochgezogen, die spätere
gewinnt, und jeder Aufruf landete in der falschen. **Vor dem Ergänzen
nachsehen, ob es den Namen schon gibt.**

### ⚠ Und die Emoji-Auswahl machte sich zuerst selbst wieder zu

`scrollIntoView` beim Öffnen verschob die Liste unter dem Finger; zwischen
`focus` und `click` wanderte das Feld weg, der Klick landete woanders, und der
„Tipp daneben"-Riegel schloss sofort. **Gemessen: drei Läufe derselben Datei,
zweimal offen, einmal zu.** Kein Proben-Artefakt — am Tablet schnappt dasselbe
zu. Das Scrollen ist raus, und ein Wächter auf die **Ursache** steht daneben:
ein Verhaltens-Wächter allein war in zwei von drei Läufen grün.

### ⚠ UND HIER FEHLTE `window.R` — die Stufe vom selben Tag war tot

`sbkim/sbkim-init.js` rechnet den Inhalts-Vektor aus `window.R`. Ein
top-level `let R` hängt aber **nicht** am window-Objekt, und dieses Buch hat
die Brücke nie bekommen — Mein Rezeptbuch schon, am 2026-07-02.

**Gemessen am 2026-09-15:** `window.R` kam hier **null Mal** vor, in Mein
Rezeptbuch vier Mal. Folge: `sampleContent()` gab eine leere Liste zurück, der
Vektor fiel auf die Beschreibung zurück, und die Zeile *„Dein Vektor kommt aus
deinen eigenen Inhalten"* konnte im Siegel **gar nicht erscheinen**.

Die Brücke steht jetzt — ein Getter, wortgleich aus Mein Rezeptbuch. `R` wird
beim Laden neu zugewiesen, eine feste Zuweisung zeigte danach aufs alte Feld.
Eine Probe misst den **Wert**, nicht die Anwesenheit der Zeile:
`sampleContent()` muss die echten Rezepte erreichen.

### ⚠ Die Auswahl war „nicht vollkommen aufgeklappt" — 12 px statt 529 (Klaus 2026-09-15)

Klaus hat es an allen drei Apps gesehen: unter der angetippten Zeile stand nur
ein flacher Streifen. **Gemessen im Browser: 12 px hoch, bei 598 px Inhalt und
107 Knöpfen — nicht eine einzige Reihe.**

**Die Ursache ist eine Zeile CSS, und sie hat nichts mit dem Raster zu tun.**
`.kat-list` ist ein Flex-Container. Ein Flex-Kind mit `overflow-y:auto`
bekommt `min-height:auto` = **0** — es wird plattgedrückt, sobald die Liste
überläuft (gemessen: 773 px Inhalt in 529 px Fenster). Die Zeilen darüber
halten stand, weil ihre Eingabefelder eine Mindesthöhe haben; das Raster nicht.

⚠ **UND DER ALTE WÄCHTER WAR DABEI GRÜN.** Er hieß „steht DIREKT unter der
bearbeiteten Zeile" und fragte, **WO** das Raster hängt — nie, **WIE HOCH** es
ist. *Ein Wächter auf die Lage misst nicht die Sichtbarkeit.* Die Zusicherung
ist ersetzt, nicht stillschweigend getauscht (Tafel-Evolutions-Klausel).

### Was jetzt gilt

Das Raster steht **außerhalb** der scrollenden Liste und legt sich als
Überlagerung **genau über sie** — gemessen gegen die echte Lage der Liste,
nicht gegen einen geratenen Abstand. Die bearbeitete Zeile wird markiert, die
Kopfzeile nennt sie beim Namen, ein × schließt ohne Wahl.

| | vorher | nachher |
|---|---|---|
| Höhe des Rasters | **12 px** | **529 px** (Tablet hoch) · 368 · 421 |
| sichtbare Reihen | 0,3 | **13,2** · 9,2 · 10,5 |
| Liste beim Öffnen | — | **bewegt sich nicht** (529 → 529) |

### ⚠ Drei Anläufe, und die ersten zwei bewegten das Layout

Jeder wurde von einer Probe gefangen, keiner vom Nachdenken:

1. **Die Liste schrumpfen lassen** (46vh → 22vh), damit der Dialog nicht über
   den Schirm wächst. Dabei wandert die angetippte Zeile unter dem Finger weg,
   der folgende `click` landet auf einer **anderen** Zeile — **vier Wächter
   fielen um.** Das ist wortgleich derselbe Fehler wie `scrollIntoView` am
   selben Tag, nur mit einer anderen Ursache für dieselbe Bewegung.
   **Ein Auswahl-Feld darf das Layout nicht bewegen.**
2. **Die Überlagerung über den ganzen Dialog** — sie deckte „Speichern" mit ab.
   Ein Tipp dort war wirkungslos: ein toter Knopf, den man sieht. Sie deckt
   jetzt genau die Liste ab.
3. **`onfocus` öffnete mit.** `focus` feuert beim **Mausdruck**, das Raster
   erscheint also noch **während** des Fingertipps unter dem Finger — und das
   Loslassen landet auf einem Emoji-Knopf darin. Gemessen: der erste Tipp
   suchte ein zufälliges Symbol aus. Es hängt jetzt **nur am Klick**, und der
   feuert erst nach dem Loslassen.

⚠ **DER WÄCHTER MISST SEITDEM DIE BEWEGUNG, NICHT DIE FOLGE:** die angetippte
Zeile muss vor und nach dem Öffnen an derselben Stelle stehen. Ein
Verhaltens-Wächter allein war beim ersten Mal in zwei von drei Läufen grün.

⚠ **UND EIN NEUER WÄCHTER WAR SELBST BLIND.** „Mehrere ganze Reihen hoch"
maß `hoehe >= 3 * knopfhoehe` — legt man das Gitter auf `display:none`, ist
die **Knopfhöhe 0**, und `hoehe >= 0` ist immer wahr. *Ein Maßstab, der selbst
verschwinden kann, misst nichts.* Gefangen hat es die Gegenprobe.
### ⚠ Und die Gegenprobe lief zweier Läufe wegen ins Leere

Zwei Läufe **nebeneinander** teilten sich feste Ablagen unter `/tmp` — sie
haben einander die Quelldatei überschrieben. Gemessen: **15 Fälle „rot aus
falschem Grund"**, und es sah aus wie ein Fehler im Code. Die Ablagen liegen
jetzt **in der Wegwerf-Kopie**.

⚠ **Und ich habe den Rückgabewert einmal von `tail` abgelesen.** Der Aufruf
war `bash tests/gegenprobe_*.sh | tail -28`; gemeldet wurde `exit 0`, während
die Gegenprobe selbst `1` zurückgab. **`| tail` ist zum Lesen da, nicht zum
Urteilen** — dieselbe Falle wie netzweit aufgeschrieben, nur in noch einem
Kostüm. Die Zahl steht in der Schlusszeile, nicht im Rückgabewert der Pipe.

### ⚠ EINE KENNUNG IST KEIN NAME — und ein Rezept ohne Kategorie hatte kein Zuhause (Klaus 2026-09-16)

Zwei Befunde aus einem Durchgang, beide von derselben Sorte: **die Auskunft war
da, nur nicht dort, wo jemand hinsieht.**

**1 · `AFCKT, was ist das?`** Aus einem Import der Schwester-App kamen Kennungen
wie `afckt`, `mock`, `bowle`, `smooth` — und die Ordner-Liste zeigte sie **roh**
an. Der Reiter war da (das war die Reparatur vom Vortag), aber niemand weiß, was
`afckt` sein soll.

⚠ **UND DIE NAMEN LAGEN SCHON IN DER APP.** Die Spore kündigt seit jeher
*„Alkfr. Cocktails, Mocktails, Bowlen, Smoothies & Shakes"* als Gast-Kategorien
an (`guestCategories` in `sbkim/sbkim-init.js`) — eine Liste von **Namen ohne
Kennungen**. Sie half der Oberfläche deshalb nichts. *Zwei Listen derselben
Sache, und die eine kennt die andere nicht.*

**`KAT_FAMILIE`** ist jetzt das Wörterbuch: Kennung → Symbol + Name in 8
Sprachen, **aus den CATS-Blöcken der drei Apps abgeleitet, nicht abgetippt**.
18 Kennungen. Ein eigener Name (`CATS_EIGEN`) gewinnt weiterhin über alles.

⚠ **Eine unbekannte Kennung wird NICHT erfunden.** Steht sie nicht im
Wörterbuch, bleibt sie sichtbar wie sie ist und trägt die Marke `unbekannt`.
*Einen Namen zu raten wäre schlimmer als eine Kennung zu zeigen.*

**2 · Die Sushi, die nur die Suche fand.** Klaus: *„gebe ich oben im Suchfeld
Sushi ein, taucht plötzlich Sushi auf … Sushi taucht immer nicht auf."* Gemessen
im Code, nicht geraten:

| | Befund |
|---|---|
| `catsFremd()` | stieg bei **leerer** Kennung mit `continue` aus |
| die „Alle"-Ansicht | läuft über `catsAlle()` — zeichnete sie also auch nicht |
| der Reiter „Alle" | zählte `R.filter(r=>r.name&&!r.blank)`, also **alle** |

**Die Zahl versprach 52, gezeichnet wurden weniger.** Nicht der Import war
schuld — die Rezepte waren da, gespeichert und exportiert, nur ohne Zuhause.

⚠ **UND EIN ORDNER, DEN ES NICHT MEHR GIBT, IST AUCH KEIN ZUHAUSE.** Eine
Kennung `fld_…` wird übersprungen, weil Ordner ihren eigenen Weg haben — steht
der Ordner aber nicht mehr in `FD`, fällt das Rezept durch dieselbe Lücke.

Sie werden jetzt als **eigene Kategorie** geführt (`KAT_OHNE`, „Ohne
Kategorie"), nicht repariert: **welche Kategorie sie bekommen sollen,
entscheidet Klaus, nicht die App.** Der Reiter erscheint nur, wenn es ihn
braucht — ein Sammel-Reiter, der immer leer dasteht, wäre ein toter Knopf mit
Beschriftung.

### ⚠ Und die drei Apps standen dabei NICHT gleich da

Gemessen am 2026-09-16: **Mein Rezeptbuch trägt alle 18 Familien-Kennungen
selbst** (Essen *und* Getränke), Muttis Rezeptbuch nur die sieben
Essens-Kategorien. Klaus' `afckt`-Befund ist deshalb ein **Muttis**-Befund; in
Mein Rezeptbuch kommt aus dem Mixarium gar nichts als „fremd" an.

**Die Wächter sagen in jeder App, was DORT gilt** — in Mein Rezeptbuch steht als
benannte Grenze, dass das Wörterbuch hier nie feuert, und gemessen wird
stattdessen, dass die eigenen Kategorien die Familie abdecken. *Drei Apps
dieselbe Zusicherung behaupten zu lassen wäre in einer davon eine Lüge.*

### ⚠ ZWEI STELLEN ZÄHLTEN DIESELBE SACHE VERSCHIEDEN (Klaus 2026-09-16)

Klaus mit Bild: *„Sushi steht in den Ordnern mit null Rezepten, obwohl
mindestens sechs drin sind. Oben in der Kategorie-Leiste in dem oberen Bereich
bei Rezepte steht Sushi mit sechs."*

**Beide Zahlen waren richtig gerechnet — sie rechneten nur aus verschiedenen
Quellen:**

| | fragte | Sushi |
|---|---|---|
| Kategorie-Leiste (`renderCatNav`) | `katVonRezept(r)` | **6** |
| Ordner-Baum (`renderFolders`) | das **rohe** Feld `r.cat` | **0** |

⚠ **DAS IST DER PREIS EINER HALBEN UMSTELLUNG.** Am Vortag ist `katVonRezept`
an **drei** Anzeige-Stellen eingesetzt worden (Reiter-Zahl, „Alle", Einzel-
Kategorie) — der Ordner-Baum blieb absichtlich unangetastet, weil er „nur
anzeigt". *Eine Kennung, die an einer Stelle gedeutet und an der anderen roh
gelesen wird, ist zwei verschiedene Kennungen.* Dieselbe Lücke traf auch
**„Ohne Kategorie"**: der Reiter zählte zwei, der Ordner-Eintrag null.

⚠ **UND EINE ZEILE TIEFER DASSELBE NOCH EINMAL.** Die Ordner-Gruppe zählte
`r.folder===…`, die Ordner-Pille `r.folder ODER r.cat==='fld_…'`. Ein Rezept,
das nur über `r.cat` in einem Ordner liegt, fiel im Baum heraus. Zwei Zeilen
untereinander, zwei Wahrheiten.

**Umgestellt sind jetzt alle Zähl- und Zeichen-Stellen**, die eine Kategorie
meinen — Ordner-Baum, Ordner-Zähler im Reiter-Abzeichen, und in Mein Rezeptbuch
zusätzlich die Gruppen des KI-Buchs und die Lieblingsrezept-Auswahl.

⚠ **DER WÄCHTER MISST DIE ÜBEREINSTIMMUNG, NICHT EINE ZAHL.** „Der Ordner zeigt
6" wäre blind, sobald sich die Leiste bewegt. Gemessen wird Gruppe für Gruppe,
dass **beide Ansichten dieselbe Zahl nennen** — plus die Gegenrichtung, dass
überhaupt eine mitgebrachte Kategorie mit Inhalt dabei ist (sonst wären alle
Zahlen 0 und stimmten trivial überein).

### Geprüft

```bash
node tests/smoke_kategorien.mjs        # echter Browser, an der GEBAUTEN index.html
bash tests/gegenprobe_kategorien.sh    # Wegwerf-Kopie, MIT Bau-Schritt
```

⚠ **Die Gegenprobe baut zwischen Sabotage und Messung neu.** Ohne
`python3 build.py` misst sie die alte `index.html`, und jeder Fall wäre „nicht
gefangen".
---

## 🏷️ NACHGEZOGEN AUS MEIN REZEPTBUCH (2026-09-16)

Klaus: *„jetzt Muttis Rezeptbuch und Mixarium nachziehen."* Was dort an einem
Tag entstanden ist, steht seitdem auch hier. **Die Befunde sind dort gemacht
worden** — hier stehen nur die Stellen, an denen sich diese App unterscheidet.

### ⚠ EIN ORDNER, DEN ES NICHT GIBT, IST KEIN ORDNER

Klaus am Tablet, über Mein Rezeptbuch: *„sie werden immer nur innerhalb eines
Ordners verschoben … und dieser Ordner lässt sich nicht umbenennen, sondern
bleibt ein **unsichtbarer Ordner**."* Zeigt `r.folder` auf eine Kennung, die in
`FD` nicht steht, fällt das Rezept aus **jeder** Kategorie-Gruppe (die fragt
`!r.folder`), und einen Ordner-Eintrag gibt es auch nicht.

`ordnerVonRezept(r)` ist das Gegenstück zu `katVonRezept` am **anderen Feld**:
es gibt den Ordner nur zurück, wenn es ihn wirklich gibt. Eingesetzt an den
**drei** Stellen, die „liegt es in einem Ordner?" fragen — Ordner-Baum,
`imOrdner`-Zahl und das Abzeichen in `badge()`.

⚠ **UND DAS ABZEICHEN WAR DABEI BLIND.** Der vorhandene Wächter misst
„Leiste = Baum" und fragt das Abzeichen bei einem **toten** Ordner gar nicht —
der Gegenprobe-Fall rutschte durch. **Gefunden hat es die Gegenprobe, nicht
das Nachdenken.** Gemessen wird jetzt genau die Lage, in der beide Fassungen
auseinandergehen: eine Kategorie mit **einem** Rezept, und das liegt in einem
Ordner, den es nicht gibt.

### ⚠ `T(k)` FÄLLT NICHT ZURÜCK — UND HIER FEHLTE WIRKLICH EIN SCHLÜSSEL

```js
function T(k){ return (LANGS[CL]||LANGS.de)[k] || k; }
```

Bei einem fehlenden Schlüssel gibt `T(k)` den **Schlüssel** heraus, also immer
etwas Wahres — ein `T('x')||'Rückfall'` dahinter kann **nie** greifen.

**Der Schlüssel-Sammler hat beim ersten Lauf sofort einen Fund gemacht:
`hAddLbl`.** Er steht in der leeren Ansicht (`empty-state`) und war in
`LANGS` nie eingetragen; auf dem Schirm stand dort **„+ hAddLbl hinzufügen"**.
In acht Sprachen nachgetragen. Gemessen: **169 benutzte Schlüssel, alle
vorhanden.**

⚠ **In Mein Mixarium hat derselbe Sammler nichts gefunden** (196 Schlüssel,
alle da). *Drei Apps dieselbe Zusicherung behaupten zu lassen wäre in einer
davon eine Lüge* — deshalb steht in jeder App die Zahl, die dort gemessen
wurde.

### Eine Kennung kommt genau einmal vor · Kennung sichtbar

`catsAlle()` hängte `CATS` und `catsFremd()` aneinander, **ohne zu prüfen, ob
eine Kennung schon dabei war**. Standen zwei Einträge mit derselben Kennung in
der Liste, markierte ein Tipp folgerichtig **beide** — sie sind für die App
dieselbe Kategorie. Der Riegel sitzt jetzt an der **Quelle**, nicht auf der
Anzeige.

Und der Umbenennen-Dialog zeigt neben jedem Namen die Kennung **mit ihrer
Zeichenzahl** (`"sushi" ·5`) — ohne die Zahl sehen `"sushi"` und `"sushi "`
gleich aus, und genau so entstehen zwei Zeilen, die keiner auseinanderhält.

⚠ **UND DIE GEGENRICHTUNG DAZU WAR SELBST BLIND — eine Zahl statt einer
Liste.** Der Wächter „ohne Duplikat geht keine Kategorie verloren" verglich
`catsAlle().length` mit der Zahl der festen Kategorien. Das misst nichts: die
Liste trägt außer den festen auch die mitgebrachten und „Ohne Kategorie", ist
also groß genug, selbst wenn eine feste fehlt. Gemessen wird jetzt
**namentlich**, welche feste Kennung verschwunden ist. *Eine Zahl in einer
Prüfung ist kein Vertrag.*

⚠ **Und die zugehörige Sabotage traf zuerst die VORBEDINGUNG.** Sie faltete
alle Kategorien auf ihren ersten Buchstaben zusammen; die Probe starb damit
schon im ersten Abschnitt an einem fremden Reiter, und der Fall meldete sich
als „rot aus falschem Grund" — **rot war es beides Mal, nur trug die rote
Zeile den falschen Namen.** Weggenommen wird jetzt genau **eine** feste
Kategorie.

⚠ **UND BASH LIEST EIN SKRIPT STÜCKWEISE — die Gegenprobe-Datei darf während
ihres eigenen Laufs nicht angefasst werden.** Am 2026-09-16 habe ich einen
Fall repariert, während der Lauf noch lief; er quittierte mit
`line 192: n: command not found` und meldete danach Fälle als „rot aus
falschem Grund", die tadellos waren. **Die Wegwerf-Kopie schützt den Baum,
nicht das Skript:** `bash tests/gegenprobe_kategorien.sh` liest die Datei im
**echten** Depot, auch wenn der Lauf danach in die Kopie wechselt. Derselbe
Fehler wie „nicht am Arbeitsbaum arbeiten, während die Gegenprobe läuft", nur
an der einen Datei, die man dafür für sicher hält. Der Lauf war als Messung
wertlos und wurde verworfen statt gezählt.

### Kategorien löschen, zusammenlegen, neu anlegen

📂 **Ordner** → **✎ Kategorien umbenennen** → 🗑 an einer Zeile bzw.
**＋ Neue Kategorie**. Löschen fragt **immer** nach dem Ziel; die Antworten
sind **drei**, nicht zwei:

| Wahl | was mit `r.cat` geschieht |
|---|---|
| eine andere Kategorie | trägt deren Kennung |
| **ausdrücklich ohne** (`''`) | leer — landet sichtbar unter „Ohne Kategorie" |
| **es war nichts zu verschieben** (`null`) | gar nichts, die Kategorie war leer |

⚠ **Der Speicher-Schlüssel ist app-eigen**, wie `mrzcats9`: hier
`mrzcatsneu9` / `mrzcatsaus9`, in Mein Rezeptbuch `…9m`. Beide Bücher liegen
auf derselben `github.io`-Adresse.

⚠ **Eine feste Kategorie verschwindet über `CATS_AUS`, und nur solange sie
leer ist.** `katAnzahl(id)===0` wird bei jedem `catsAlle()` neu gerechnet:
kommt wieder ein Rezept hinein, ist der Reiter von selbst zurück. Ein Riegel,
der eine Kategorie mit Inhalt verschwinden ließe, wäre ein stiller
Datenverlust.

### 🏷️ Kategorie zuordnen aus der Rezeptzeile

Das **🏷️** steht links neben dem Papierkorb. Die Auswahl trägt alle
Kategorien (die aktuelle mit ✓), darunter abgesetzt **„ohne Kategorie"** als
Weg zurück und **＋ Neue Kategorie**.

**Gesetzt wird NUR `r.cat`.** Der Ordner bleibt stehen. Ein
`fld_…`-Altbestand wird **ersetzt**, nicht danebengelegt.

⚠ **DAS AUSWAHL-FENSTER MACHTE SICH IN MEIN REZEPTBUCH SELBST WIEDER ZU.**
＋ Neue Kategorie tauscht den Inhalt des Fensters; danach sucht der „Tipp
daneben"-Riegel den geklickten Knopf **darin** und findet ihn nicht mehr.
Repariert wird die **Ursache**, nicht der eine Knopf:

```js
if(!document.contains(e.target))return;   // gerade ersetzt ≠ Tipp nach draußen
```

⚠ **UND EINE PROBE, DIE SYNCHRON KLICKT, IST DAFÜR BLIND.** Der Riegel hängt
an einem `setTimeout(…,0)`; klickt eine Probe alles in **einem** Durchgang,
läuft dazwischen kein Timer. **Ein Finger ist langsamer als ein Skript** — die
Probe lässt zwischen den Griffen einen `await tick()` verstreichen.

### Geprüft

Zuletzt gemessen (2026-09-16, nach dem Nachziehen): **109 grün · 0 ROT**
(169 Schlüssel geprüft). Gegenprobe: die Zahl steht im Übergabe-Absatz weiter
unten, direkt gelesen und nicht hinter einer Pipe.

```bash
node tests/smoke_kategorien.mjs           # echter Browser, an der GEBAUTEN index.html
NUR_ANKER=1 bash tests/gegenprobe_kategorien.sh   # tote Anker in Sekunden
bash tests/gegenprobe_kategorien.sh       # Wegwerf-Kopie, MIT Bau-Schritt
```

✅ **`NUR_ANKER=1` ist beim Nachziehen dreimal eingesprungen** — Zeilen, die
diese Arbeit selbst bewegt hat und auf die ältere Fälle zeigten. Ohne den Gang
wären es drei „NICHT GEFANGEN" nach Minuten gewesen, und die weisen in die
**entgegengesetzte** Richtung („bau einen Wächter" statt „zieh den Fall nach").

---

## 🏷️ Gerätename · netzweite Regeln

Der Gerätename gehört **ins Verbinden-Panel**, hineingehängt vom app-eigenen Glue
— **nie** in eine byte-kopierte Panel-Datei. Jedes Feld trägt
`data-sbkim-geraetename`; der Name geht **nur** an Anzeige und Anmeldung, **nie** an
`generateOwnSpore`. Er ist ein Hinweis, kein Vertrauens-Beweis: immer mit der Kennung
zusammen anzeigen.

Diese und die übrigen netzweiten Regeln — Selbst-Merge-Freibrief, frisch von
`origin/main`, Ton, kein PII, Ehrlichkeit — stehen seit 2026-08-22 **einmal** in
**[`Sage-Protokol/docs/NETZWEIT.md`](https://github.com/lausiklauskn-png/Sage-Protokol/blob/main/docs/NETZWEIT.md)** statt wortgleich in bis zu
20 Repos. Verträge: **[`INTERFACES.md`](https://github.com/lausiklauskn-png/Sage-Protokol/blob/main/docs/INTERFACES.md)** · die Fallen beim
Abzweigen und Veröffentlichen: **[`LEHREN.md`](https://github.com/lausiklauskn-png/Sage-Protokol/blob/main/docs/LEHREN.md)** · alte Fassung dieser
Datei: [`docs/archiv/CLAUDE-2026-08-22.md`](docs/archiv/CLAUDE-2026-08-22.md).
