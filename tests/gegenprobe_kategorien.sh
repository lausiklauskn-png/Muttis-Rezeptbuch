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
DATEI="$(ls QC_*.html | head -1)"
echo "Kopie: $KOPIE · Quelldatei: $DATEI"

gefangen=0; durch=0; falsch=0; tot=0
lauf(){ python3 build.py >/dev/null 2>&1; node tests/smoke_kategorien.mjs 2>&1; }

if lauf | grep -qE "^[0-9]+ grün · 0 ROT$"; then echo "Ausgangslage gruen"; else
  echo "ABBRUCH: schon ohne Eingriff rot."; lauf | tail -4; exit 2; fi

fall(){
  cp "$DATEI" /tmp/_sich_buch.html
  python3 - "$3" <<'PY'
import io,sys,glob
p=glob.glob('QC_*.html')[0]
s=io.open(p,encoding='utf-8').read()
alt,neu=sys.argv[1].split('@@@')
if s.count(alt)!=1:
    io.open('/tmp/_ankerfehl_buch','w').write('1'); sys.exit(0)
io.open(p,'w',encoding='utf-8').write(s.replace(alt,neu,1))
PY
  if [ -f /tmp/_ankerfehl_buch ]; then rm -f /tmp/_ankerfehl_buch
    echo "  ⊘ ANKER NICHT GEFUNDEN — $1"; tot=$((tot+1)); cp /tmp/_sich_buch.html "$DATEI"; return; fi
  AUS="$(lauf)"
  cp /tmp/_sich_buch.html "$DATEI"
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
'onclick="katEmojiOeffnen(this)" onfocus="katEmojiOeffnen(this)"@@@onclick="void 0" onfocus="void 0"'

fall "das Raster wandert nicht unter die Zeile" "direkt unter" \
"  if(zeile&&zeile.parentNode)zeile.parentNode.insertBefore(raster,zeile.nextSibling);@@@  if(false)zeile.parentNode.insertBefore(raster,zeile.nextSibling);"

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
  /* ⚠ HIER STAND@@@  raster.hidden=false;
  raster.scrollIntoView({block:'nearest'});
  /* ⚠ HIER STAND"

echo
echo "$gefangen gefangen · $durch durchgerutscht · $falsch aus falschem Grund · $tot tote Anker"
cd /; rm -rf "$(dirname "$KOPIE")"
[ "$durch" -eq 0 ] && [ "$falsch" -eq 0 ] && [ "$tot" -eq 0 ]
