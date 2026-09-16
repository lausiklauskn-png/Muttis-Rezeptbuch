#!/usr/bin/env bash
# Gegenprobe zu tests/smoke_herkunft.mjs.
#
# ⚠ SIE LÄUFT IN EINER WEGWERF-KOPIE — eine liegengebliebene Sabotage sieht im
#   echten Baum wie ein Baufehler aus.
# ⚠ SIE BAUT ZWISCHEN SABOTAGE UND MESSUNG NEU. Ohne `python3 build.py` misst
#   sie die alte index.html, und JEDER Fall wäre „nicht gefangen".
# ⚠ SIE URTEILT AN DER ROTEN ZEILE, nicht an „rot ja/nein" — ein Fall, der eine
#   FREMDE Zusicherung umwirft, hat seine eigene nicht gemessen.
# ⚠ UND SIE MISST, OB SICH DIE DATEI WIRKLICH GEÄNDERT HAT, statt den Anker
#   danach noch einmal zu suchen: ein Ersatztext darf den Anker enthalten.
set -u
WURZEL="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
cp -a "$WURZEL/." "$TMP/kopie" 2>/dev/null
rm -rf "$TMP/kopie/node_modules"; ln -s "$WURZEL/node_modules" "$TMP/kopie/node_modules"
cd "$TMP/kopie" || exit 2
Q="$(ls QC_MR_*.html | head -1)"
P=tests/smoke_herkunft.mjs
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

fall "die Herkunft wird gar nicht gestempelt" \
  "    r.herkunft.push({k:k,d:d});" \
  "    if(false)r.herkunft.push({k:k,d:d});" \
  "GENAU EINE Station"

fall "die Wiederholungs-Sperre fällt weg" \
  "    if(letzte&&letzte.k===k)return;" \
  "    if(false)return;" \
  "nicht doppelt"

fall "der Deckel auf fünf Stationen fällt weg" \
  "    if(r.herkunft.length>HERK_MAX){r.herkunft=r.herkunft.slice(-HERK_MAX);r.herkGekuerzt=true;}" \
  "    if(false){r.herkunft=r.herkunft.slice(-HERK_MAX);r.herkGekuerzt=true;}" \
  "bei 5 Stationen"

fall "gekürzt wird, aber es steht nicht dran" \
  "r.herkunft=r.herkunft.slice(-HERK_MAX);r.herkGekuerzt=true;" \
  "r.herkunft=r.herkunft.slice(-HERK_MAX);" \
  "gekürzt"

# ⚠ ZWEI ANLAEUFE TRAFEN DEN NACHBARN, NICHT DIE ZUSICHERUNG.
#   1. ein DRITTES Feld anhaengen → „genau zwei Felder" faellt zuerst.
#   2. den Namen an `k` kleben → „die Station ist dieser Knoten" faellt zuerst,
#      weil die Probe gegen `d1.knoten` vergleicht.
# Sabotiert wird deshalb `_knotenKennung()` SELBST: dann traegt die Datei
# denselben Wert wie die Station, der Identitaets-Waechter bleibt gruen — und
# nur der Namens-Waechter kann noch fallen.
fall "ein Gerätename steckt in der Knoten-Kennung" \
  "'lokal-'+Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4)" \
  "'lokal-Klaus-Handy-'+Math.random().toString(36).slice(2,10)" \
  "kein Gerätename"

fall "die mitgebrachte Kennung wird wieder weggeworfen" \
  "newRecs.forEach((r,i)=>{r.id=maxId+i+1; if(!r.uid)r.uid=_neueUid();});" \
  "newRecs.forEach((r,i)=>{r.id=maxId+i+1; r.uid=_neueUid();});" \
  "Kennung"

fall "verglichen wird wieder nur am Namen" \
  "    if(r.uid){" \
  "    if(false){" \
  "umbenannte"

fall "die Ordner kommen beim Hinzufügen nicht mit" \
  "  if(neueOrdner.length){FD=FD.concat(neueOrdner);svFD();}" \
  "  if(false){FD=FD.concat(neueOrdner);svFD();}" \
  "fehlende Ordner"

# ⚠ ZWEI VERSCHIEDENE SCHAEDEN, ZWEI FAELLE. Der erste Anlauf hiess
# „ueberschrieben" und erzeugte in Wahrheit eine DOPPELTE Kennung (`concat`
# legt den fremden daneben) — der Namens-Waechter blieb gruen, weil `find` den
# ersten trifft. Das ist genau der blinde Waechter, den dieser Lauf gefunden
# hat. Jetzt steht je ein Fall fuer jeden der beiden Schaeden.
fall "der fremde Ordner drängt sich neben den eigenen" \
  "  const neueOrdner=(ordnerAusDatei||[]).filter(f=>f&&!habeFid.has(String(f.id)));" \
  "  const neueOrdner=(ordnerAusDatei||[]).filter(f=>!!f);" \
  "doppelt"

fall "der fremde Ordner ersetzt den eigenen wirklich" \
  "  if(neueOrdner.length){FD=FD.concat(neueOrdner);svFD();}" \
  "  {const fr=(ordnerAusDatei||[]).filter(f=>!!f);FD=fr.concat(FD.filter(f=>!fr.some(n=>String(n.id)===String(f.id))));svFD();}" \
  "nicht überschrieben"

fall "der Import verschweigt wieder, was unsichtbar mitkommt" \
  '    ${ohneKat?`<div class="imp-ohnekat"' \
  '    ${false?`<div class="imp-ohnekat"' \
  "Zahl ohne Zuhause"

# ⚠ Der Fall, der den Fund von heute festnagelt: ein zweiter Weg baut sich
# seinen eigenen Dubletten-Riegel. Genau so ist der Tresor-Import beim ersten
# Bau durchgerutscht.
fall "ein zweiter Import-Weg baut sich seinen eigenen Riegel" \
  "          const _zf=_zusammenfuehren(recs, (data&&(data.folders||data.fd))||[]);" \
  "          const existingNames=new Set(R.filter(r=>r.name).map(r=>r.name.trim().toLowerCase()));const _zf={newRecs:recs.filter(r=>r.name&&!existingNames.has(r.name.trim().toLowerCase())),neueOrdner:[]};" \
  "genau einmal im Code"

echo
echo "$gefangen gefangen · $durch durchgerutscht · $falsch aus falschem Grund · $tot tote Anker"
[ "$durch" -eq 0 ] && [ "$falsch" -eq 0 ] && [ "$tot" -eq 0 ]
