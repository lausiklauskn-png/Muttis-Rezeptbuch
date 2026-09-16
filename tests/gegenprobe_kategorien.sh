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

# ⚠ EIN TOTER ANKER FIEL BISHER ERST NACH EINEM VOLLEN LAUF AUF — also nach
#   Minuten. `NUR_ANKER=1 bash tests/gegenprobe_kategorien.sh` prueft in
#   Sekunden NUR, ob jeder Anker genau einmal trifft; es faehrt keine Probe.
#   Uebertragen aus Mein Rezeptbuch, wo er am 2026-09-16 viermal zuschlug.
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
    # ⚠ DER PFAD KOMMT AUS DER UMGEBUNG, nicht aus einer Zeichenkette im
    #   ZITIERTEN Heredoc. Hier stand '"$ANKERFEHL"' — in einem <<'PY' wird
    #   NICHTS ersetzt, also entstand eine Datei, die WOERTLICH so hiess, und
    #   die Pruefung darauf traf nie zu. Folge: ein TOTER ANKER meldete sich
    #   als „NICHT GEFANGEN" — also als blinder Waechter, und das verlangt das
    #   Gegenteil („bau einen Waechter" statt „zieh den Fall nach").
    #   Uebertragen aus Mein Rezeptbuch, wo es am 2026-09-16 gemessen wurde.
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

echo "── Gegenprobe Kategorien ──"

fall "catsFremd findet nichts mehr" "sushi" \
'    if(!id||bekannt.has(id)||gesehen.has(id))continue;@@@    if(!id||bekannt.has(id)||gesehen.has(id)||true)continue;'

fall "der eigene Name wird ignoriert" "Japanisch" \
"function katBeschriftung(c){if(!c)return'';const e=CATS_EIGEN[c.id];if(e&&e.name)return e.name;@@@function katBeschriftung(c){if(!c)return'';const e=null;if(e&&e.name)return e.name;"

fall "das eigene Symbol wird ignoriert" "Symbol steht davor" \
"function katSymbol(c){if(!c)return'📦';const e=CATS_EIGEN[c.id];if(e&&e.ico)return e.ico;@@@function katSymbol(c){if(!c)return'📦';const e=null;if(e&&e.ico)return e.ico;"

fall "gespeichert wird nicht" "Neuladen" \
"  CATS_EIGEN=neu;svCatsEigen();
  /* Eine frisch angelegte@@@  CATS_EIGEN=neu;
  /* Eine frisch angelegte"

fall "das Umbenennen aendert die KENNUNG mit" "Speicher-Weg bleibt r.cat" \
"    if(nm||ic){neu[id]={};if(nm)neu[id].name=nm;if(ic)neu[id].ico=ic;}
  });
  CATS_EIGEN=neu;svCatsEigen();
  /* Eine frisch angelegte@@@    if(nm||ic){neu[id]={};if(nm)neu[id].name=nm;if(ic)neu[id].ico=ic;R.forEach(r=>{if(r.cat===id)r.cat=nm||id;});}
  });
  CATS_EIGEN=neu;svCatsEigen();
  /* Eine frisch angelegte"

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

fall "das Woerterbuch wird uebergangen — die rohe Kennung kommt zurueck" "steht im KLARTEXT da" \
"    const bk=katFamilie(id);@@@    const bk=null;"

fall "ein Name wird erfunden, wo das Woerterbuch schweigt" "keinen erfundenen Namen" \
"      out.push({id:id,ico:'📦',de:id,col:'#7a5840',fremd:true,unbekannt:true});@@@      out.push({id:id,ico:'🍹',de:'Erfunden',col:'#7a5840',fremd:true,unbekannt:true});"

fall "ein Rezept ohne Kategorie faellt wieder durch" "zaehlt BEIDE" \
"  if(!id)return KAT_OHNE;@@@  if(!id)return '';"

fall "ein toter Ordner gilt wieder als Zuhause" "zaehlt BEIDE" \
"    return da?id:KAT_OHNE;@@@    return id;"

fall "der Sammel-Reiter steht auch ohne Heimatlose da" "OHNE Heimatlose gibt es den Reiter nicht" \
"  if(ohne>0){@@@  if(ohne>=0){"

fall "die Alle-Ansicht fragt wieder das rohe Feld" "zeichnet das Rezept ohne Kategorie" \
"      const grp=R.filter(r=>katVonRezept(r)===cat.id);if(!grp.length)continue;@@@      const grp=R.filter(r=>r.cat===cat.id);if(!grp.length)continue;"

fall "die Getraenke-Symbole verschwinden wieder" "eigene Getraenke-Symbole" \
'"🍶","🍼","🚰","⚗️","🫧","🍋‍🟩",@@@'

# ── Die Ordner-Ansicht zaehlt wieder anders als die Leiste (Klaus 2026-09-16) ──
fall "der Ordner-Baum fragt wieder das rohe Feld" "Leiste = Baum" \
"      recipes:R.filter(r=>!ordnerVonRezept(r)&&katVonRezept(r)===c.id&&r.name),@@@      recipes:R.filter(r=>!ordnerVonRezept(r)&&r.cat===c.id&&r.name),"

fall "ein Ordner-Rezept ohne r.folder faellt im Baum wieder heraus" "faellt nirgends heraus" \
"      recipes:R.filter(r=>(r.folder===String(f.id)||r.cat==='fld_'+f.id)&&r.name)}))@@@      recipes:R.filter(r=>r.folder===String(f.id)&&r.name)}))"

# ── Eine Kennung kommt genau einmal vor (Klaus 2026-09-16, zwei Pillen) ──
fall "catsAlle laesst Duplikate wieder durch" "nur EINMAL" \
"    if(gesehen.has(id))return;
    gesehen.add(id);out.push(c);@@@    gesehen.add(id);out.push(c);"

# ⚠ EINE SABOTAGE DARF DIE VORBEDINGUNG NICHT TREFFEN. Hier stand zuerst
# `String(c.de||c.id).slice(0,1)` — das faltet ALLE Kategorien auf ihren
# ersten Buchstaben zusammen, und die Probe starb schon in Abschnitt 1 an
# einem fremden Reiter. Rot war es beides Mal; nur trug die rote Zeile den
# falschen Namen. Weggenommen wird jetzt genau EINE feste Kategorie.
fall "der Riegel wirft eine feste Kategorie mit weg" "geht keine Kategorie verloren" \
"function catsAlle(){
  const out=[],gesehen=new Set();@@@function catsAlle(){
  const out=[],gesehen=new Set([String(CATS[CATS.length-1].id)]);"

fall "der Dialog verschweigt die Kennung wieder" "der Dialog zeigt die Kennung" \
'        <div class="kat-kenn" title="${h(X.kenn||'"'"'Kennung'"'"')}">"${h(c.id)}" ·${String(c.id).length}</div>@@@'

fall "die Anfuehrungszeichen um die Kennung fallen weg" "sodass ein Leerzeichen sichtbar wird" \
'">"${h(c.id)}" ·${String(c.id).length}</div>@@@">${h(c.id)} ·${String(c.id).length}</div>'

fall "die Zeichenzahl faellt weg" "mit der Zeichenzahl daneben" \
'" ·${String(c.id).length}</div>@@@"</div>'

# ── Loeschen, Zusammenlegen, Neu-Anlegen (Klaus 2026-09-16) ──
fall "das Aufloesen haengt die Rezepte nicht um" "lassen sich zusammenlegen" \
"  if(ziel!==null)R.forEach(r=>{if(katVonRezept(r)===sid)r.cat=ziel;});@@@"

fall "„Ohne Kategorie\" wird wie ein fehlender Wert behandelt" "ist eine Wahl, kein fehlender Wert" \
"  if(ziel!==null)R.forEach(r=>{if(katVonRezept(r)===sid)r.cat=ziel;});@@@  if(ziel)R.forEach(r=>{if(katVonRezept(r)===sid)r.cat=ziel;});"

# ⚠ Der Suchtext nennt den Waechter, der WIRKLICH faellt: die mitgebrachte
#   Kennung verschwindet ohnehin von selbst, der Riegel wirkt nur auf feste.
fall "die aufgeloeste Kategorie bleibt in der Liste stehen" "der Riegel greift wirklich" \
"  if(CATS_NEU.length===vorher&&CATS_AUS.indexOf(sid)<0)CATS_AUS.push(sid);@@@"

fall "eine Kategorie MIT Inhalt wird still ausgeblendet" "MIT Inhalt bleibt sichtbar" \
"  const aus=new Set((CATS_AUS||[]).filter(id=>katAnzahl(id)===0));@@@  const aus=new Set(CATS_AUS||[]);"

fall "der Finger landet wieder in der letzten statt in der neuen Zeile" "im Namensfeld DER NEUEN" \
"  const zeile=document.querySelector('#katRenameOv .kat-row[data-kid=\"'+kid+'\"]');@@@  const _r=document.querySelectorAll('#katRenameOv .kat-row');const zeile=_r[_r.length-1];"

fall "eine namenlose neue Kategorie bleibt stehen" "wird sie beim Speichern wieder entfernt" \
"  CATS_NEU=CATS_NEU.filter(c=>!!(CATS_EIGEN[c.id]&&CATS_EIGEN[c.id].name)||katAnzahl(c.id)>0);@@@"

# ══ 19 · Kategorie zuordnen aus der Rezeptzeile (Klaus 2026-09-16) ══

# Die Lage ist die Bestellung — der Knopf wandert HINTER den Papierkorb.
# Die Lage ist die Bestellung. Sabotiert wird ueber `order` im Flex-Container —
# das verschiebt genau das, was Klaus SIEHT, und laesst die Reihenfolge im
# Dokument unberuehrt. Ein Waechter auf zwei Indizes waere hier blind geblieben.
fall "der Knopf rutscht hinter den Papierkorb" "LINKS neben dem Papierkorb" \
".ra:active{opacity:.65}@@@.ra:active{opacity:.65}
.kat-zu-btn{order:9}"

# ⚠ DER KERN: das Zuordnen frisst den Ordner mit auf — genau der Fehler vom
#   2026-09-16, nur von der anderen Seite.
fall "das Zuordnen nimmt den Ordner mit" "laesst den Ordner in Ruhe" \
"  r.cat=String(kid||'');@@@  r.cat=String(kid||'');r.folder='';"

# Ein `fld_…`-Altbestand bleibt stehen statt ersetzt zu werden.
fall "ein fld_-Altbestand wird nicht mehr ersetzt" "ERSETZT, nicht danebengelegt" \
"  r.cat=String(kid||'');@@@  if(String(r.cat||'').indexOf('fld_')!==0)r.cat=String(kid||'');"

# „ohne Kategorie" ist der Weg zurueck — er wird zur Sackgasse.
fall "der Weg zurueck fuehrt nicht mehr nach leer" "leert die Kategorie wirklich" \
"katZuSetzen('+rid+',\\'\\')@@@katZuSetzen('+rid+',\\'fleisch\\')"

# Eine namenlose Kategorie waere ein Reiter, den niemand wiederfindet.
fall "eine namenlose Kategorie entsteht doch" "ohne Namen entsteht KEINE" \
"  if(!name){if(f)f.focus();return;}@@@  if(!name){}"

# Ein Fenster, das zugeht und nichts getan hat, sieht aus wie ein kaputter Knopf.
fall "das leere Feld geht still zu" "Feld bleibt stehen" \
"  if(!name){if(f)f.focus();return;}@@@  if(!name){document.getElementById('katZuPop')?.remove();return;}"

# ⚠ ZWEI FASSUNGEN DES ANLEGENS — genau das, was katAnlegen verhindert.
fall "das Anlegen bekommt ein zweites Format" "Kennungs-Format" \
"  katZuSetzen(rid,katAnlegen(name));@@@  var kid2='neu_'+Date.now();CATS_NEU.push({id:kid2,ico:'🏷',de:name,col:'#7a5840',eigen:true});svCatsNeu();katZuSetzen(rid,kid2);"

# Die Auswahl bewegt das Layout — dieselbe Falle wie die Emoji-Auswahl.
# ⚠ ZWEI ZUSICHERUNGEN, ZWEI FAELLE. `position:relative` bewegt die Karte NICHT
#   (das Popup haengt an document.body) — es verschiebt nur, WO die Auswahl
#   steht. Der erste Anlauf zielte damit auf den falschen Waechter und rutschte
#   durch. Wer die Karte wirklich bewegen will, haengt das Popup IN sie hinein.
# ⚠ DAS FENSTER MACHT SICH SELBST WIEDER ZU. Ohne diesen Riegel haelt der
#   „Tipp daneben"-Wachhund den Knopf, den ＋ Neue Kategorie gerade ersetzt hat,
#   fuer einen Tipp nach DRAUSSEN — und schliesst. Genau das hat Klaus am
#   Tablet gesehen. Die Probe war blind, weil sie synchron klickt; erst ein
#   `tick()` zwischen den Klicks bildet einen Finger ab.
fall "der Tipp-daneben-Riegel schliesst das eigene Fenster" "oeffnet ein Namensfeld" \
"    if(!document.contains(e.target))return;@@@    if(false)return;"

fall "die Auswahl steht nicht mehr beim Knopf" "steht beim Knopf" \
".kat-zu-pop{position:fixed;@@@.kat-zu-pop{position:relative;"

# ⚠ ZWEI RIEGEL, DIE EINANDER DECKEN, GEHOEREN IN EINE SABOTAGE. Die Karte kann
#   sich nur bewegen, wenn die Auswahl IN ihr haengt UND im Fluss steht:
#   `position:fixed` allein haelt sie schon draussen, `document.body` allein
#   auch. Der erste Anlauf nahm nur das Anhaengen — und rutschte durch, obwohl
#   nichts am Waechter falsch war. Dieselbe Lehre wie `umask`+`chmod` in
#   Kimhubs Schluessel-Ablagefach.
# ⚠ Und der Anker braucht seinen Nachbarn: `document.body.appendChild` steht
#   auch im Bild-Popup, ein Anker, der zweimal trifft, ist keiner.
fall "die Auswahl haengt im Fluss der Karte" "bewegt die Karte nicht" \
"  pop.innerHTML=teile.join('');
  document.body.appendChild(pop);@@@  pop.innerHTML=teile.join('');
  btn.parentNode.appendChild(pop);pop.style.position='static';"

# Ohne Markierung weiss niemand, wo das Rezept gerade steht.
fall "die aktuelle Kategorie wird nicht mehr markiert" "aktuelle ist darin markiert" \
"(id===jetzt?'kzp-jetzt':'')@@@(false?'kzp-jetzt':'')"

# ══ 20 · Ein Ordner, den es nicht gibt, ist kein Ordner (Klaus 2026-09-16) ══

# Der Helfer prueft FD nicht mehr — ein toter Ordner gilt wieder als Ordner.
fall "ein toter Ordner gilt wieder als Ordner" "steht im Baum unter" \
"  return da?f:'';@@@  return f;"

# Die Kategorie-Gruppe liest wieder das ROHE Feld — die Lehre vom Vortag,
# rueckgaengig gemacht.
fall "die Kategorie-Gruppe liest r.folder wieder roh" "steht im Baum unter" \
"      recipes:R.filter(r=>!ordnerVonRezept(r)&&katVonRezept(r)===c.id&&r.name),@@@      recipes:R.filter(r=>!r.folder&&katVonRezept(r)===c.id&&r.name),"

# Die Zahl „+N in Ordnern" zaehlt wieder Geister mit.
fall "die Ordner-Zahl zaehlt wieder Geister" "zaehlt nicht als" \
"      imOrdner:R.filter(r=>ordnerVonRezept(r)&&katVonRezept(r)===c.id&&r.name).length})),@@@      imOrdner:R.filter(r=>r.folder&&katVonRezept(r)===c.id&&r.name).length})),"

# Das Abzeichen zaehlt die Gruppen wieder aus dem rohen Feld.
fall "das Abzeichen zaehlt Gruppen wieder aus dem rohen Feld" "mit totem Ordner MIT" \
"    ...catsAlle().filter(c=>R.some(r=>!ordnerVonRezept(r)&&katVonRezept(r)===c.id&&r.name)),@@@    ...catsAlle().filter(c=>R.some(r=>!r.folder&&katVonRezept(r)===c.id&&r.name)),"

# Die Zahl daneben faellt ganz weg.
fall "die Kategorie-Zeile verschweigt die in Ordnern wieder" "nennt die Zahl" \
'${g.imOrdner?` · +${g.imOrdner} ${T('"'"'fldInOrdnern'"'"')}`:'"'"''"'"'}@@@'

# ── Ein Text-Schluessel, den es nicht gibt (Klaus 2026-09-16: „+6 fldInOrdnern") ──
fall "die Ordner-Zeile zeigt wieder den Schluesselnamen" "ein WORT daneben" \
"fldInOrdnern:'in Ordnern',@@@fldInOrdnern:'fldInOrdnern',"

# ── Der Schluessel-Sammler (Abschnitt 16) ──
fall "ein benutzter Schluessel fehlt ganz in LANGS" "sind in LANGS.de vorhanden" \
"fldInOrdnern:'in Ordnern',@@@"

# ⚠ BENANNTE GRENZE — fuer „der Sammler findet ueberhaupt Schluessel" steht
#   hier KEIN Fall. Um ihn leerlaufen zu lassen, muesste eine Sabotage ALLE
#   `T('…')`-Aufrufe auf doppelte Anfuehrungszeichen umstellen; `fall` ersetzt
#   aber nur die erste Fundstelle. Gedeckt ist die Zusicherung trotzdem: der
#   Haupt-Waechter verlangt ausdruecklich `gesamt > 20` und faellt mit aus.
#   Uebertragen aus Mein Rezeptbuch, wo das am 2026-09-16 gemessen wurde.

# Nach dem Zuordnen bleibt der Ordner-Baum stehen — die Aenderung ist da,
# man sieht sie nur nicht.
fall "der Ordner-Baum zieht nach dem Zuordnen nicht nach" "steht es in SEINER Kategorie" \
"  sv();render();renderCatNav();renderFolders();badge();@@@  sv();render();badge();"

# ── 21 · Ganze Kategorien umsortieren ──
fall "die gespeicherte Folge wird gar nicht angewandt" "setzt die gezogene Kategorie wirklich an den Anfang" \
"  if(CATS_ORD&&CATS_ORD.length){@@@  if(false){"

fall "die Folge wird nicht gespeichert" "ueberlebt ein Neuladen" \
"  CATS_ORD=ids;svCatsOrd();@@@  CATS_ORD=ids;"

# ⚠ NICHT `out=…` — `out` ist `const`, und eine Sabotage, die das Programm
#   unlauffaehig macht, meldet einen Absturz statt der Zusicherung.
fall "eine Kategorie ohne Eintrag in der Folge faellt heraus" "geht nicht verloren" \
"  out.sort((a,b)=>{@@@  for(let z=out.length-1;z>=0;z--)if(pos[String(out[z].id)]===undefined)out.splice(z,1);
  out.sort((a,b)=>{"

fall "der Speicher-Schluessel ist der des ANDEREN Buches" "des anderen Buches bleibt leer" \
"CATS_ORD_KEY='mrzcatord9'@@@CATS_ORD_KEY='mrzcatord9m'"

fall "die Pillen sind nicht mehr ziehbar" "traegt eine Kennung und ist ziehbar" \
'draggable="true" data-kid="${c.id}"@@@data-kid="${c.id}"'

fall "auch ein ORDNER bekommt den Kategorie-Anfasser" "ein ORDNER dagegen nicht" \
"        \${isFolder?'':\`<span class=\"fld-grp-hdl\"@@@        \${false?'':\`<span class=\"fld-grp-hdl\""

# ── Der Finger geht einen anderen Weg als die Maus ──
fall "die Griffe bekommen gar keinen Finger-Weg" "hebt die Pille an" \
"'.fld-grp-hdl[data-kid],.cpill[data-kid]'@@@'.fld-grp-hdl[data-kid-aus],.cpill[data-kid-aus]'"

# ⚠ GENAU DER FEHLER, DEN DER FINGER-WAECHTER GEFUNDEN HAT: `renderCatNav`
#   ersetzt die Pillen und damit ihre touchstart-Anmeldung. Der Maus-Weg blieb
#   dabei gruen, weil `draggable` im Markup steht.
fall "die Leiste verliert beim Neuzeichnen ihre Finger-Griffe" "hebt die Pille an" \
"  if(typeof setupTouchDrag==='function')setupTouchDrag();@@@"

fall "ueber dem Ziel erscheint kein Strich" "zeigt ein Strich, wohin" \
"      zpill.classList.add('kat-'+wohin);@@@"

fall "der Strich ist da, aber unsichtbar" "zeigt ein Strich, wohin" \
".cpill.kat-vor{box-shadow:inset 3px 0 0@@@.cpill.kat-vor{box-shadow:none;x-inset:inset 3px 0 0"

fall "das Loslassen sortiert nicht um" "sortiert wirklich um" \
"      if(zid)katUmsortieren(vonId,zid,wohin);@@@      if(zid){}"

# ⚠ GEMESSEN WIRD DIE STELLE, DIE DIE ZUSICHERUNG WIRKLICH TRAEGT.
#   Der erste Anlauf sabotierte ein `katZiehMarkenWeg()` in `_tddEnd` — und
#   rutschte durch, weil `_tddMove` die Marken ohnehin bei jeder Bewegung
#   wegraeumt. Die Zeile war redundant und ist raus.
fall "beim Weiterziehen bleibt der alte Strich stehen" "kein Strich bleibt stehen" \
"  if(_tdd.type==='kat'){
    katZiehMarkenWeg();@@@  if(_tdd.type==='kat'){"

# ⚠ GENAU DER FEHLER, DEN DER MAUS-WAECHTER GEFUNDEN HAT: `katZiehEnde()`
#   setzt `_katWohin` auf null, und der Aufruf danach las den Rueckfall.
#   „nach" gab es damit gar nicht — von Hand nachgestellt, genau eine rote Zeile.
fall "der Maus-Weg liest die Richtung erst nach dem Aufraeumen" "landet sie HINTER dem Ziel" \
"    const von=_katZieh,wohin=_katWohin||'vor';katZiehEnde();
    katUmsortieren(von,cat,wohin);@@@    const von=_katZieh;katZiehEnde();
    katUmsortieren(von,cat,_katWohin||'vor');"

# ⚠ GENAU DER TOTE SELEKTOR, DEN DER BAUM-WAECHTER GEFUNDEN HAT: `.fld-grp-hd`
#   gibt es nicht, die Kopfzeile heisst `.fld-hdr`. Der Rueckfall `||el` machte
#   das Schattenbild zum 22 px breiten Anfasser.
fall "das Schattenbild zeigt nur den Anfasser" "zeigt die ganze Zeile, nicht nur den Anfasser" \
"querySelector('.fld-hdr')||el@@@querySelector('.fld-grp-hd')||el"

fall "im Ordner-Baum erscheint kein Strich" "Strich zeigt auch dort" \
"        zgrp.classList.add('kat-'+wohin);@@@"

fall "der Strich im Baum ist da, aber unsichtbar" "Strich zeigt auch dort" \
".fld-grp.kat-nach{box-shadow:inset 0 -3px 0@@@.fld-grp.kat-nach{box-shadow:none;x-inset:inset 0 -3px 0"

fall "der Ordner-Baum ordnet anders als die Leiste" "dieselbe Folge wie die Leiste" \
"    ...catsAlle().map(c=>({id:'cat_'+c.id,@@@    ...catsAlle().slice().reverse().map(c=>({id:'cat_'+c.id,"

# ⚠ BENANNTE GRENZE — fuer „ein kurzer Tipp zieht NICHT" steht hier KEIN Fall.
#   Der Riegel ist die Uhr selbst: ohne abgelaufenen Langdruck gibt es kein
#   Schattenbild, und keine Sabotage an einer einzelnen Zeile kann ein
#   Schattenbild im selben Tick erzeugen. Ein Fall, der nichts messen kann,
#   saehe wie Deckung aus. Gedeckt ist die Zusicherung durch den Selbst-Riegel
#   daneben: liegen die Griffe nicht auf dem Schirm, faellt der Abschnitt aus.

# ── 22 · Der Sammel-Eimer traegt seinen eigenen Namen ──
fall "die Zuordnen-Zeile nimmt wieder den fest verdrahteten Text" "zeigt den eigenen Namen des Sammel-Eimers" \
"  var eimerName=katBeschriftung(eimer)@@@  var eimerName=T('katZuOhne')"

fall "der Zustand steht nicht mehr daneben" "Zustand steht als Hinweis daneben" \
"    +(eigenerName?'<span class=\"kzp-ohne-hin\">'@@@    +(false?'<span class=\"kzp-ohne-hin\">'"

fall "der Hinweis ist da, aber unsichtbar" "Zustand steht als Hinweis daneben" \
".kat-zu-pop .kzp-ohne-hin{margin-left:6px@@@.kat-zu-pop .kzp-ohne-hin{display:none;margin-left:6px"

# Die Gegenrichtung: der Hinweis darf nicht IMMER dastehen, sonst waere er
# keine Auskunft ueber den eigenen Namen, sondern Zierde.
fall "der Hinweis steht auch ohne eigenen Namen da" "ohne eigenen Namen steht kein Hinweis" \
"  var eigenerName=eimerName!==T('katZuOhne');@@@  var eigenerName=true;"

echo
echo "$gefangen gefangen · $durch durchgerutscht · $falsch aus falschem Grund · $tot tote Anker"
cd /; rm -rf "$(dirname "$KOPIE")"
[ "$durch" -eq 0 ] && [ "$falsch" -eq 0 ] && [ "$tot" -eq 0 ]
