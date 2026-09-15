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

### Geprüft

```bash
node tests/smoke_kategorien.mjs        # echter Browser, an der GEBAUTEN index.html
bash tests/gegenprobe_kategorien.sh    # Wegwerf-Kopie, MIT Bau-Schritt
```

⚠ **Die Gegenprobe baut zwischen Sabotage und Messung neu.** Ohne
`python3 build.py` misst sie die alte `index.html`, und jeder Fall wäre „nicht
gefangen".

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
