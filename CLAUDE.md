# Projektregeln für Claude – Mein Rezeptbuch

## Projektübersicht

### Dieses Repo: `lausiklauskn-png/Mein-Rezeptbuch`
- **App-Name:** Mein Rezeptbuch (öffentlicher Klon von Muttis Rezeptbuch)
- **Aktuelle Version:** v9.2
- **Lokaler Pfad:** `/home/user/Mein-Rezeptbuch/`

### Schwesterprojekt: `lausiklauskn-png/mutti-rezeptbuch`
- **App-Name:** Muttis Rezeptbuch (das Original)
- Die beiden Apps sind funktional identisch – Mein Rezeptbuch ist ein Klon
- Änderungen werden in der Regel **zuerst in mutti-rezeptbuch** entwickelt, dann hierher übertragen

---

## Dateistruktur

| Datei | Bedeutung |
|---|---|
| `index.html` | **Produktionsdatei** – obfuskiert, enthält `_CR`-Wasserzeichen (Zeile 1356, ~113 KB Einzeiler) – NICHT direkt bearbeiten |
| `QC_MeinR_07_04_26.html` | **Quelldatei (v9.2)** – saubere, lesbare Version ohne Sicherheitsblock – hier werden Änderungen gemacht |
| `sw.js` / `app-sw.js` | Service Worker |
| `manifest.json` / `app-manifest.json` | PWA-Manifeste |

### Wichtig: QC-Datei erstellen / aktualisieren
Der `_CR`-Block ist **eine einzige Zeile** (~113.000 Zeichen), die mit `const _CR=Object.freeze` beginnt.
Zum Erstellen einer neuen QC-Datei aus index.html:
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
filename = f'QC_MeinR_{d}.html'
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
1. Änderungen **immer** in der QC-Datei (`QC_MeinR_*.html`) vornehmen
2. Nach dem Testen: index.html separat neu generieren/obfuskieren (nicht durch Claude)
3. Commit-Nachrichten auf **Deutsch**

### "Hochladen"-Befehl
Wenn der Benutzer **"Hochladen"** schreibt:
1. Alle lokalen Änderungen committen
2. Auf aktuellen Feature-Branch pushen: `git push -u origin <branch>`
3. PR erstellen via `mcp__github__create_pull_request` → nach `main`
4. PR-URL mitteilen

### Branch-Konvention
- Feature-Branches werden automatisch angelegt (Format: `claude/<beschreibung>-<id>`)
- Immer auf dem zugewiesenen Branch arbeiten (steht oben in der Session-Konfiguration)

---

## Häufige Aufgaben

### Neue Funktion hinzufügen
1. In `QC_MeinR_*.html` implementieren
2. Testen (in Browser öffnen)
3. Hochladen

### Swipe / Touch / Drag & Drop
- Swipe-Handler: IIFE ab `// ── SWIPE-NAVIGATION ──` (kurz vor `boot()`)
- Touch-Drag: `setupTouchDrag()` und `setupWkTouchDrag()`
- Drag-Selektoren: `.drag-hdl`, `.ing-drag-hdl`, `.fld-drag-hdl`, `.wk-drag-hdl`

---

## Maus-Swipe & Scrollrad-Navigation (✅ fertig in Mein-Rezeptbuch, fehlt noch in mutti-rezeptbuch)

### Status
In **Mein Rezeptbuch** funktioniert die seitliche Navigation per Maus vollständig (getestet mit Rapoo 9900M):
1. **Maus-Drag** (klicken + ziehen) → wechselt Seite
2. **Seitliches Scrollrad** (horizontales Scrollen) → wechselt Seite

In **mutti-rezeptbuch** fehlt diese Funktion noch → bitte übertragen.

### Was fehlt in mutti-rezeptbuch

#### 1. CSS-Animationen (im `<style>`-Block)
```css
.sc.swipe-left{animation:swipeInL .22s cubic-bezier(.25,.46,.45,.94)}
.sc.swipe-right{animation:swipeInR .22s cubic-bezier(.25,.46,.45,.94)}
@keyframes swipeInL{from{opacity:.5;transform:translateX(32px)}to{opacity:1;transform:translateX(0)}}
@keyframes swipeInR{from{opacity:.5;transform:translateX(-32px)}to{opacity:1;transform:translateX(0)}}
```

#### 2. `showSc()`-Funktion — `dir`-Parameter hinzufügen
```js
function showSc(n,dir){
  document.querySelectorAll('.sc').forEach(s=>s.classList.remove('on','swipe-left','swipe-right'));
  document.querySelectorAll('.bn').forEach(b=>b.classList.remove('on'));
  const sc=document.getElementById('sc-'+n);
  if(sc){
    sc.classList.add('on');
    if(dir==='left')sc.classList.add('swipe-left');
    else if(dir==='right')sc.classList.add('swipe-right');
  }
  document.getElementById('bn-'+n)?.classList.add('on');
  if(n==='menu')renderMenu();
  // ... restlicher Code bleibt unverändert
}
```

#### 3. SWIPE-NAVIGATION IIFE (kurz vor `boot()` einfügen)
```js
// ── SWIPE-NAVIGATION ──────────────────────────────────
(function(){
  const SC_ORDER=['recipes','folders','menu','backup','settings'];
  const MODAL_IDS=['mv','importOv','exportOv','courseSheet','spellModal',
    'aip','aslBg','ob-wizard-bg','ob-helper-bg','ob-settings-bg','ob-scan-ov',
    'manualOv','bvaultModal'];
  function anyModalOpen(){
    return MODAL_IDS.some(id=>{
      const el=document.getElementById(id);
      return el&&el.style.display&&el.style.display!=='none';
    });
  }
  function _doSwipe(dx){
    const cur=document.querySelector('.sc.on')?.id?.replace('sc-','');
    const idx=SC_ORDER.indexOf(cur);
    if(idx<0)return;
    if(dx<0&&idx<SC_ORDER.length-1)showSc(SC_ORDER[idx+1],'left');
    else if(dx>0&&idx>0)showSc(SC_ORDER[idx-1],'right');
  }
  const SWIPE_DRAG_SEL='.drag-hdl,.ing-drag-hdl,.fld-drag-hdl,.wk-drag-hdl';
  // Touch-Swipe (Finger / Stift)
  let tx=0,ty=0,locked=false,_swTarget=null;
  document.addEventListener('touchstart',function(e){
    tx=e.touches[0].clientX;
    ty=e.touches[0].clientY;
    locked=false;
    _swTarget=e.target;
  },{passive:true});
  document.addEventListener('touchmove',function(e){
    if(locked)return;
    const dx=e.touches[0].clientX-tx;
    const dy=e.touches[0].clientY-ty;
    if(Math.abs(dy)>Math.abs(dx)*1.2)locked=true;
  },{passive:true});
  document.addEventListener('touchend',function(e){
    if(locked)return;
    if(anyModalOpen())return;
    if(_swTarget&&_swTarget.closest(SWIPE_DRAG_SEL))return;
    const dx=e.changedTouches[0].clientX-tx;
    const dy=e.changedTouches[0].clientY-ty;
    if(Math.abs(dx)<55||Math.abs(dx)<Math.abs(dy)*1.5)return;
    if(e.target.closest('#catNav'))return;
    _doSwipe(dx);
  },{passive:true});
  // Maus-Drag (DeX / Desktop)
  let mx=0,my=0,mdown=false,mmoved=false;
  document.addEventListener('mousedown',function(e){
    if(e.button!==0)return;
    if(e.target.closest(SWIPE_DRAG_SEL))return;
    mx=e.clientX;my=e.clientY;mdown=true;mmoved=false;
  });
  document.addEventListener('mousemove',function(e){
    if(!mdown)return;
    if(Math.abs(e.clientX-mx)>10||Math.abs(e.clientY-my)>10)mmoved=true;
  });
  document.addEventListener('mouseup',function(e){
    if(!mdown)return;
    const wasMoved=mmoved;
    mdown=false;mmoved=false;
    if(!wasMoved)return;
    if(anyModalOpen())return;
    const dx=e.clientX-mx,dy=e.clientY-my;
    if(Math.abs(dx)<55||Math.abs(dx)<Math.abs(dy)*1.5)return;
    if(e.target.closest('#catNav'))return;
    _doSwipe(dx);
  });
  // Seitliches Scrollrad (Rapoo 9900M u.ä.)
  let _wAccX=0,_wTimer=null;
  document.addEventListener('wheel',function(e){
    if(Math.abs(e.deltaY)>Math.abs(e.deltaX)*1.5)return;
    if(Math.abs(e.deltaX)<5)return;
    if(anyModalOpen())return;
    if(e.target.closest('#catNav'))return;
    _wAccX+=e.deltaX;
    clearTimeout(_wTimer);
    _wTimer=setTimeout(function(){
      const dx=_wAccX;_wAccX=0;
      if(Math.abs(dx)<60)return;
      _doSwipe(-dx);
    },150);
  },{passive:true});
})();
```

### Hinweise für mutti-rezeptbuch
- `MODAL_IDS` ggf. anpassen falls mutti-rezeptbuch andere Modal-IDs hat
- `SC_ORDER` ggf. anpassen falls die Screens anders heißen
- Die `showSc()`-Funktion in mutti-rezeptbuch muss den `dir`-Parameter unterstützen (siehe oben)

### Sprache hinzufügen
- Im `LANGS`-Objekt neuen Sprachblock ergänzen
- `CL`-Variable und `T(k)`-Funktion funktionieren automatisch
