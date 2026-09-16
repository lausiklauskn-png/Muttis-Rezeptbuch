#!/usr/bin/env bash
# Gegenprobe zu tests/smoke_einstellungen_sprache.mjs.
#
# ⚠ SIE LÄUFT IN EINER WEGWERF-KOPIE — eine liegengebliebene Sabotage sieht im
#   echten Baum wie ein Baufehler aus.
# ⚠ SIE BAUT ZWISCHEN SABOTAGE UND MESSUNG NEU (`python3 build.py`). Ohne das
#   misst sie die alte index.html, und JEDER Fall wäre „nicht gefangen".
# ⚠ SIE URTEILT AN DER ROTEN ZEILE, nicht an „rot ja/nein" — ein Fall, der eine
#   FREMDE Zusicherung umwirft, hat seine eigene nicht gemessen.
# ⚠ UND DER AUSGANGSLAGEN-RIEGEL LIEST DIE GANZE SCHLUSSZEILE: „10 ROT" enthält
#   „0 ROT". Derselbe Fehler stand in der Nachbar-Gegenprobe.
set -u
WURZEL="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
cp -a "$WURZEL/." "$TMP/kopie" 2>/dev/null
rm -rf "$TMP/kopie/node_modules"; ln -s "$WURZEL/node_modules" "$TMP/kopie/node_modules"
cd "$TMP/kopie" || exit 2
Q="$(ls QC_MR_*.html | head -1)"
P=tests/smoke_einstellungen_sprache.mjs
gefangen=0; durch=0; falsch=0; tot=0

python3 build.py >/dev/null 2>&1
if ! node "$P" 2>&1 | grep -qE "^[0-9]+ grün · 0 ROT$"; then
  echo "✗ ABBRUCH: die Probe ist schon OHNE Eingriff rot — kein Fall würde etwas messen."; exit 2
fi
echo "Ausgangslage grün."; echo

fall () {   # $1 Name  $2 Anker  $3 Ersatz  $4 erwartete rote Zeile
  local name="$1" anker="$2" ersatz="$3" trifft="$4"
  cp "$Q" "$Q.sicher"
  local erg
  erg=$(python3 - "$Q" "$anker" "$ersatz" <<'PYIN'
import sys
p,a,e = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(p, encoding='utf-8').read()
if s.count(a) == 0: print("ANKER_FEHLT"); raise SystemExit
if s.count(a) > 1:  print("ANKER_MEHRFACH"); raise SystemExit
n = s.replace(a, e, 1)
if n == s: print("OHNE_WIRKUNG"); raise SystemExit
open(p, 'w', encoding='utf-8').write(n); print("GEAENDERT")
PYIN
)
  if [ "$erg" != "GEAENDERT" ]; then
    echo "⊘ TOTER ANKER ($erg): $name"; tot=$((tot+1)); mv "$Q.sicher" "$Q"; return
  fi
  python3 build.py >/dev/null 2>&1
  local aus rotz
  aus=$(node "$P" 2>&1)
  rotz=$(printf '%s\n' "$aus" | grep -m1 '^  ✗' || true)
  if [ -z "$rotz" ]; then
    echo "✗ NICHT GEFANGEN: $name"; durch=$((durch+1))
  elif printf '%s' "$rotz" | grep -q "$trifft"; then
    echo "✓ gefangen: $name"; gefangen=$((gefangen+1))
  else
    echo "⚠ ROT AUS FALSCHEM GRUND: $name"; echo "      $rotz"; falsch=$((falsch+1))
  fi
  mv "$Q.sicher" "$Q"; python3 build.py >/dev/null 2>&1
}

# Diese App hat die Abschnitte Netz und Werkzeuge NICHT — die Faelle setzen
# deshalb am Mistral-Schluessel an. Drei Apps dieselbe Sabotage behaupten zu
# lassen waere in einer davon ein toter Anker.
fall "eine Beschriftung verliert ihre Kennung und bleibt deutsch" \
  '<div class="sett-lbl" id="sMistralLbl">Mistral-Schlüssel (EU)</div>' \
  '<div class="sett-lbl">Mistral-Schlüssel (EU)</div>' \
  "steht still"

fall "die Kennung steht nicht in der Namensliste des Setzers" \
  "'sMistralSub'," \
  "'sMistralSubFehlt'," \
  "steht still"

fall "der Update-Satz fällt aus der Namensliste" \
  "'updateStatus'," \
  "'updateStatusFehlt'," \
  "steht still"

fall "die englische Fassung wird wortgleich mit der deutschen" \
  "sMistralLbl:'Mistral key (EU)'" \
  "sMistralLbl:'Mistral-Schlüssel (EU)'" \
  "wortgleich"

fall "ein Schlüssel fehlt in einer der acht Sprachen" \
  ",sMistralSub:'Per il riconoscimento del testo nella scansione IA'" \
  "" \
  "fehlt in it"

fall "der Setzer überspringt Deutsch — die Oberfläche kommt nicht zurück" \
  "  ids.forEach(id=>{const el=document.getElementById(id);if(el&&L[id]!==undefined)el.textContent=L[id];});" \
  "  if(code!=='de')ids.forEach(id=>{const el=document.getElementById(id);if(el&&L[id]!==undefined)el.textContent=L[id];});" \
  "zurück auf"

fall "die Zeile aus Klaus' Bild verschwindet ganz" \
  '<div class="sett-sub">Version 9.5 · <span id="sOfflineCap">Offline-fähig</span></div>' \
  '<div class="sett-sub"></div>' \
  "steht im Einstellungs-Bildschirm"

echo
echo "$gefangen gefangen · $durch durchgerutscht · $falsch aus falschem Grund · $tot tote Anker"
[ "$durch" -eq 0 ] && [ "$falsch" -eq 0 ] && [ "$tot" -eq 0 ]
