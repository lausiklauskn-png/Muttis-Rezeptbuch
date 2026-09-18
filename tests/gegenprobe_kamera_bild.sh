#!/usr/bin/env bash
# Gegenprobe zu tests/smoke_kamera_bild.mjs. Jeder eingebaute Fehler MUSS die
# Probe umwerfen — UND die rote Zeile muss den Namen der gemeinten Zusicherung
# tragen. „Rot" allein genuegt nicht.
#
# ⚠ Laeuft in einer WEGWERF-KOPIE. Eine liegengebliebene Sabotage im echten
#   Baum sieht danach wie ein Baufehler aus.
# ⚠ Und ein BAU-SCHRITT liegt dazwischen: die QC-Datei wird sabotiert, dann
#   `python3 build.py`. Ohne den Bau misst man die alte index.html — und jeder
#   Fall waere „nicht gefangen".
set -u
QUELLE="$(cd "$(dirname "$0")/.." && pwd)"
KOPIE="$(mktemp -d)/buch"
mkdir -p "$KOPIE"; cp -a "$QUELLE/." "$KOPIE/" 2>/dev/null
rm -rf "$KOPIE/node_modules"; ln -s "$QUELLE/node_modules" "$KOPIE/node_modules"
cd "$KOPIE" || exit 2
SICH="$KOPIE/../_sich.html"; ANKERFEHL="$KOPIE/../_ankerfehl"
DATEI="$(ls QC_*.html | head -1)"
echo "Kopie: $KOPIE · Quelldatei: $DATEI"

gefangen=0; durch=0; falsch=0; tot=0
lauf(){ python3 build.py >/dev/null 2>&1; node tests/smoke_kamera_bild.mjs 2>&1; }

# `NUR_ANKER=1 bash tests/gegenprobe_kamera_bild.sh` prueft in Sekunden NUR,
# ob jeder Anker genau einmal trifft — es wird keine Probe gefahren.
if [ -n "${NUR_ANKER:-}" ]; then
  lauf(){ echo "0 grün · 0 ROT"; }
else
if lauf | grep -qE "^[0-9]+ grün · 0 ROT$"; then echo "Ausgangslage gruen"; else
  echo "ABBRUCH: schon ohne Eingriff rot."; lauf | tail -4; exit 2; fi
fi

fall(){
  cp "$DATEI" "$SICH"
  ANKERFEHL="$ANKERFEHL" python3 - "$3" <<'PY'
import io,os,sys,glob
p=glob.glob('QC_*.html')[0]
s=io.open(p,encoding='utf-8').read()
alt,neu=sys.argv[1].split('@@@')
if s.count(alt)!=1:
    io.open(os.environ['ANKERFEHL'],'w').write('1'); sys.exit(0)
io.open(p,'w',encoding='utf-8').write(s.replace(alt,neu,1))
PY
  if [ -f "$ANKERFEHL" ]; then rm -f "$ANKERFEHL"
    echo "  ⊘ ANKER NICHT GEFUNDEN — $1"; tot=$((tot+1)); cp "$SICH" "$DATEI"; return; fi
  AUS="$(lauf)"
  cp "$SICH" "$DATEI"
  if echo "$AUS" | grep -qE "^[0-9]+ grün · 0 ROT$"; then
    echo "  ✗ NICHT GEFANGEN — $1"; durch=$((durch+1))
  elif echo "$AUS" | grep "✗ ROT" | grep -q "$2"; then
    echo "  ✓ gefangen — $1"; gefangen=$((gefangen+1))
  else
    echo "  ⚠ ROT AUS FALSCHEM GRUND — $1"; echo "$AUS" | grep "✗ ROT" | head -2 | sed 's/^/      /'
    falsch=$((falsch+1))
  fi
}

echo "── Gegenprobe Kamerafoto ──"

# Der Ausgangszustand vom 2026-09-18, wortwoertlich zurueckgeholt.
fall "der 5-MB-Riegel kommt zurueck" "verarbeitet ein Foto über 5 MB" \
'  if(file.size>BILD_ROH_MAX){@@@  if(file.size>5*1024*1024){'

fall "loadScanFile geht wieder nicht durch die eine Tuer" "geht durch scanBildAufbereiten" \
'  const bilder=await scanBildAufbereiten(file);@@@  const bilder=null;'

# Der alte Fehler in resizeImage: nur die Breite gedeckelt.
fall "resizeImage deckelt wieder nur die Breite" "LANGE Kante" \
'      const scale=Math.min(1,maxKante/Math.max(img.width,img.height));@@@      const scale=Math.min(1,maxKante/img.width);'

fall "_aufKante deckelt nur die Breite" "lange Kante der Netz-Fassung" \
'  const scale=Math.min(1,kante/Math.max(bw,bh));@@@  const scale=Math.min(1,kante/bw);'

# ⚠ Die Nachrechnung ist NUR mit uebergebenem Deckel messbar — bei 1200 px
#   springt sie nie an. Deshalb steht der Deckel als Argument im Code.
fall "die Nachrechnung faellt weg (erste Stufe wird einfach genommen)" "NACHGERECHNET" \
'  if(_b64Bytes(aus)<=max) return aus;@@@  if(true) return aus;'

fall "die Kanten-Stufen gehen nach oben" "Kanten-Stufen gehen nach unten" \
'const BILD_NETZ_STUFEN = [1200,900,700,500,380];@@@const BILD_NETZ_STUFEN = [380,500,700,900,1200];'

fall "der Deckel liegt ueber der Grenze der Schnittstelle" "Grenze der Schnittstelle" \
'const BILD_NETZ_B64_MAX = 4*1024*1024;@@@const BILD_NETZ_B64_MAX = 40*1024*1024;'

fall "der Speicher-Riegel rutscht wieder auf 5 MB" "WEIT über 5 MB" \
'const BILD_ROH_MAX = 40*1024*1024;@@@const BILD_ROH_MAX = 5*1024*1024;'

# ⚠ Zwei Riegel decken einander: waere hier nur `return aus;` entfernt, faenge
#   schon der Nachrechnungs-Waechter. Sabotiert wird der fail-soft-Ausgang.
fall "ein unmoeglicher Deckel gibt nichts mehr heraus" "fail-soft ein Bild" \
'  return aus;   // fail-soft: das kleinste Ergebnis, nie ein Abbruch@@@  return _b64Bytes(aus)<=max?aus:"";'

fall "_b64Bytes zaehlt den data-URL-Kopf mit" "zählt den base64-Teil" \
'  return i<0?s.length:(s.length-i-1);@@@  return s.length;'

fall "das Rezeptbild faellt weg" "Rezeptbild entsteht mit" \
"  const store=_aufKante(bild,800,0.75);@@@  const store='';"

# ⚠ EIN FALL, ZWEI CALL-SITES. Im Stapel gehen zwei Anbieter hinaus; der
#   Waechter ZAEHLT sie deshalb. Ein Fall am Anthropic-Aufruf steht hier
#   nicht, weil sein Anker sich je App unterscheidet — die Zaehlung deckt
#   ihn mit, und ein Fall, der je App anders lautet, ist eine zweite Fassung.
fall "der OCR-Weg im Stapel geht wieder am Verkleinern vorbei" "BEIDE Anbieter" \
'        const ocrData=fileIsPdf?origData:await bildFuersNetz(files[i],1200,0.90);@@@        const ocrData=origData;'

fall "das Kamera-Feld verliert seinen Weg" "führt auf handleScanFile" \
'<input type="file" id="scanCameraIn" accept="image/*" capture="environment" style="display:none"
          onchange="handleScanFile(event)"/>@@@<input type="file" id="scanCameraIn" accept="image/*" capture="environment" style="display:none"/>'

echo
echo "$gefangen gefangen · $durch durchgerutscht · $falsch aus falschem Grund · $tot tote Anker"
[ "$durch" -eq 0 ] && [ "$falsch" -eq 0 ] && [ "$tot" -eq 0 ]
