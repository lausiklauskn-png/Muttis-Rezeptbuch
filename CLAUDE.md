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

### Icons in HTML einbetten (Favicon-Caching-Lösung)
Browser cachen externe Favicon-URLs aggressiv – selbst nach Cache-Leeren bleibt das alte Icon.
**Lösung:** Alle Icons als Base64-Data-URL direkt in die HTML-Datei einbetten:

```html
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,...">
<link rel="icon" type="image/png" sizes="192x192" href="data:image/png;base64,...">
```

- Kein separater HTTP-Request, kein separater Cache-Eintrag
- Icon aktualisiert sich automatisch wenn die HTML-Datei geändert wird
- Auch apple-touch-icons und PWA-Manifest-Icons sind eingebettet (JS-Blob)

Nach Icon-Änderung: Base64-Strings in QC-Datei neu generieren (Python-Script), dann `build.py`.

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

### Swipe / Touch / Drag & Drop
- Swipe-Handler: IIFE ab `// ── SWIPE-NAVIGATION ──` (kurz vor `boot()`)
- Touch-Drag: `setupTouchDrag()` und `setupWkTouchDrag()`
- Drag-Selektoren: `.drag-hdl`, `.ing-drag-hdl`, `.fld-drag-hdl`, `.wk-drag-hdl`

### Sprache hinzufügen
- Im `LANGS`-Objekt neuen Sprachblock ergänzen
- `CL`-Variable und `T(k)`-Funktion funktionieren automatisch
