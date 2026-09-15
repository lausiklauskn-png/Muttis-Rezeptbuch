#!/usr/bin/env bash
# Gegenprobe zu tests/smoke_kategorien.mjs. Jeder eingebaute Fehler MUSS die
# Probe umwerfen — UND die rote Zeile muss den Namen der gemeinten Zusicherung
# tragen. „Rot" allein genuegt nicht.
#
# ⚠ Laeuft in einer WEGWERF-KOPIE. Eine liegengebliebene Sabotage im echten
#   Baum sieht danach wie ein Baufehler aus.
# ⚠ Anders als in Mixarium liegt hier ein BAU-SCHRITT dazwischen: die QC-Datei
#   wird sabotiert, dann `python3 build.py`. Ohne den Bau misst man die alte
#   index.html — und jeder Fall waere „nicht gefangen".
set -u
QUELLE="$(cd "$(dirname "$0")/.." && pwd)"
KOPIE="$(mktemp -d)/buch"
mkdir -p "$KOPIE"; cp -a "$QUELLE/." "$KOPIE/" 2>/dev/null
rm -rf "$KOPIE/node_modules"; ln -s "$QUELLE/node_modules" "$KOPIE/node_modules"
cd "$KOPIE" || exit 2
# ⚠ Ablagen INNERHALB der Wegwerf-Kopie. Feste /tmp-Namen teilen sich
#   zwei Laeufe nebeneinander — sie ueberschreiben einander die
#   Quelldatei, und jeder Fall danach ist „rot aus falschem Grund".
SICH="$KOPIE/../_sich.html"; ANKERFEHL="$KOPIE/../_ankerfehl"
DATEI="$(ls QC_*.html | head -1)"
echo "Kopie: $KOPIE · Quelldatei: $DATEI"

gefangen=0; durch=0; falsch=0; tot=0
lauf(){ python3 build.py >/dev/null 2>&1; node tests/smoke_kategorien.mjs 2>&1; }

if lauf | grep -qE "^[0-9]+ grün · 0 ROT$"; then echo "Ausgangslage gruen"; else
  echo "ABBRUCH: schon ohne Eingriff rot."; lauf | tail -4; exit 2; fi

fall(){
  cp "$DATEI" "$SICH"
  ANKERFEHL="$ANKERFEHL" python3 - "$3" <<'PY'
import io,sys,glob
p=glob.glob('QC_*.html')[0]
s=io.open(p,encoding='utf-8').read()
alt,neu=sys.argv[1].split('@@@')
if s.count(alt)!=1:
    io.open('"$ANKERFEHL"','w').write('1'); sys.exit(0)
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

echo "── Gegenprobe Kategorien ──"

fall "catsFremd findet nichts mehr" "sushi" \
'  return out;
}
function catsAlle(){@@@  return [];
}
function catsAlle(){'

fall "der eigene Name wird ignoriert" "Japanisch" \
"function katBeschriftung(c){if(!c)return'';const e=CATS_EIGEN[c.id];if(e&&e.name)return e.name;@@@function katBeschriftung(c){if(!c)return'';const e=null;if(e&&e.name)return e.name;"

fall "das eigene Symbol wird ignoriert" "Symbol steht davor" \
"function katSymbol(c){if(!c)return'📦';const e=CATS_EIGEN[c.id];if(e&&e.ico)return e.ico;@@@function katSymbol(c){if(!c)return'📦';const e=null;if(e&&e.ico)return e.ico;"

fall "gespeichert wird nicht" "Neuladen" \
"  CATS_EIGEN=neu;svCatsEigen();@@@  CATS_EIGEN=neu;"

fall "das Umbenennen aendert die KENNUNG mit" "Speicher-Weg bleibt r.cat" \
"    if(nm||ic){neu[id]={};if(nm)neu[id].name=nm;if(ic)neu[id].ico=ic;}@@@    if(nm||ic){neu[id]={};if(nm)neu[id].name=nm;if(ic)neu[id].ico=ic;R.forEach(r=>{if(r.cat===id)r.cat=nm||id;});}"

fall "die Alle-Ansicht laeuft wieder nur ueber CATS" "Maki-Rolle" \
"    for(const cat of catsAlle()){@@@    for(const cat of CATS.filter(c=>c.id!=='all')){"

fall "der Dialog listet die mitgebrachten nicht" "listet jede Kategorie" \
"  const liste=catsAlle();@@@  const liste=CATS.filter(c=>c.id!=='all');"

fall "die Herkunfts-Marke faellt weg" "gekennzeichnet" \
"      \${c.fremd?\`<span class=\"kat-fremd\">\${h(X.f)}</span>\`:''}@@@      \${''}"

fall "das Symbol-Feld oeffnet die Auswahl nicht" "Tipp aufs Symbol-Feld" \
'onclick="katEmojiOeffnen(this)"@@@onclick="void 0"'

fall "das Raster wird wieder in die scrollende Liste gebaut" "AUSSERHALB der scrollenden Liste" \
'<div class="kat-list">${zeilen}</div>@@@<div class="kat-list">${zeilen}${katEmojiRaster()}</div><div hidden>'

fall "das Gitter wird wieder plattgedrueckt (kein eigener Scrollbereich)" "wirklich aufgeklappt" \
'.kat-emoji-gitter{display:grid;grid-template-columns:repeat(auto-fill,minmax(40px,1fr));gap:2px;@@@.kat-emoji-gitter{display:none;grid-template-columns:repeat(auto-fill,minmax(40px,1fr));gap:2px;'

fall "das Raster schiebt die Liste wieder (Layout bewegt sich beim Oeffnen)" "bewegt sich die angetippte Zeile NICHT" \
'.kat-emoji-raster{position:absolute;left:12px;right:12px;z-index:3;@@@.kat-emoji-raster{position:static;z-index:3;'

fall "das Raster deckt wieder die Knoepfe mit ab (toter Speichern-Knopf)" "verdeckt den Speichern-Knopf nicht" \
"      raster.style.bottom=Math.max(0,bb.bottom-lb.bottom)+'px';@@@      raster.style.bottom='0px';raster.style.top='0px';"

fall "die bearbeitete Zeile wird nicht mehr markiert" "bearbeitete Zeile ist markiert" \
"  if(zeile)zeile.classList.add('kat-row-aktiv');@@@  if(false)zeile.classList.add('kat-row-aktiv');"

fall "die Kopfzeile nennt die Zeile nicht mehr" "nennt sie beim Namen" \
"    kopf.textContent=wie?((X.fuer||'Symbol fuer')+' '+wie):(X.sym||'');@@@    kopf.textContent='';"

fall "die Marke bleibt nach dem Schliessen stehen" "gibt der Liste ihren Platz zurueck" \
"    if(box)box.classList.remove('emoji-auf');@@@    if(false)box.classList.remove('emoji-auf');"

fall "die Wahl schreibt nichts ins Feld" "schreibt es ins Feld" \
"    _katZiel.value=e;@@@    _katZiel.value=_katZiel.value;"

fall "das Raster bleibt nach der Wahl offen" "schliesst das Raster" \
"  katEmojiSchliessen();
}
function openKatUmbenennen(){@@@  _katZiel=null;
}
function openKatUmbenennen(){"

fall "der Vorrat schrumpft auf eine Handvoll" "bietet eine Auswahl an" \
'const KAT_EMOJIS = [@@@const KAT_EMOJIS = ["🍹","🍸","🥤"]; const _KAT_UNUSED = ['

fall "das Scrollen beim Oeffnen kommt zurueck" "verschiebt die Liste nicht" \
"  raster.hidden=false;
}@@@  raster.scrollIntoView({block:'nearest'});
  raster.hidden=false;
}"

echo
echo "$gefangen gefangen · $durch durchgerutscht · $falsch aus falschem Grund · $tot tote Anker"
cd /; rm -rf "$(dirname "$KOPIE")"
[ "$durch" -eq 0 ] && [ "$falsch" -eq 0 ] && [ "$tot" -eq 0 ]
