# Projektregeln für Claude

## Workflow-Regeln

### "Hochladen"-Befehl
Wenn der Benutzer **"Hochladen"** schreibt:
1. Alle lokalen Änderungen committen (falls noch nicht geschehen)
2. Auf den aktuellen Feature-Branch pushen (`git push -u origin <branch>`)
3. Einen Pull Request auf GitHub von diesem Branch nach `main` erstellen (via `mcp__github__create_pull_request`)
4. Die PR-URL dem Benutzer mitteilen

### Entwicklungs-Branch
Aktiver Branch: `claude/fix-scraping-input-field-NtVYX`
Repository: `lausiklauskn-png/QC_rezeptbuch`

## Allgemeine Hinweise
- Die App ist eine einzelne HTML-Datei: `/home/user/QC_rezeptbuch/index.html`
- Übersetzungssystem: `LANGS`-Objekt im JS, Funktion `T(k)`, aktuell 8 Sprachen (de, en, ru, zh, es, fr, it, pt)
- Commit-Nachrichten auf Deutsch
