#!/usr/bin/env python3
"""
Entfernt führende Emojis aus Titeltexten in der QC-HTML-Datei:
- HTML-Elemente: <div class="fov-title"> und <div class="exp-title">
- LANGS-Strings: hlpTitle, hlpShare, hlpPwa, hlpCacheTitle (alle 8 Sprachen)
"""

import re
import glob
import sys

# Regex für führende Emojis + nachfolgendes Leerzeichen
# Deckt alle gängigen Emoji-Unicode-Bereiche ab
LEADING_EMOJI_RE = re.compile(
    r'^(?:'
    r'[\U0001F000-\U0001FFFF]|'   # Diverse Emojis (Symbole, Piktogramme, etc.)
    r'[\U00002600-\U000027BF]|'   # Verschiedene Symbole
    r'[\u2194-\u21AA]|'           # Pfeile
    r'[\u2300-\u23FF]|'           # Technische Symbole
    r'[\u25AA-\u25FE]|'           # Geometrische Formen
    r'[\u2600-\u26FF]|'           # Verschiedene Symbole
    r'[\u2700-\u27BF]|'           # Dingbats
    r'[\uFE00-\uFE0F]|'           # Variation Selectors
    r'\u200D|'                     # Zero Width Joiner
    r'\u20E3'                      # Combining Enclosing Keycap
    r')+\s*',
    re.UNICODE
)

def strip_leading_emoji(text):
    """Entfernt führende Emojis (inkl. Variation Selectors) + Leerzeichen."""
    return LEADING_EMOJI_RE.sub('', text)

def process_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    changes = []

    # ── 1. HTML-Elemente: fov-title und exp-title ──────────────────────────────
    # Muster: id="hlpTitle">EMOJI Text</div>
    # oder:   id="hlpPwa">EMOJI Text</div>
    # oder:   id="hlpShare">EMOJI Text</div>
    # oder:   id="hlpCacheTitle">EMOJI Text</div>

    target_ids = ['hlpTitle', 'hlpShare', 'hlpPwa', 'hlpCacheTitle']

    for tid in target_ids:
        # Trifft auf alles zwischen id="X"> und </div>, inkl. Attribute vorher
        pattern = re.compile(
            r'(id="' + re.escape(tid) + r'"[^>]*>)'   # öffnendes Tag-Ende
            r'((?:[\U0001F000-\U0001FFFF\U00002600-\U000027BF\u2139\u2194-\u21AA'
            r'\u2300-\u23FF\u25AA-\u25FE\u2600-\u26FF\u2700-\u27BF\uFE00-\uFE0F'
            r'\u200D\u20E3])+\s*)',                     # führende Emojis
            re.UNICODE
        )
        def replacer(m, tid=tid):
            removed = m.group(2)
            changes.append(f'  HTML id="{tid}": entfernt "{removed.strip()}"')
            return m.group(1)  # Emoji + Leerzeichen entfernen

        content = pattern.sub(replacer, content)

    # ── 2. LANGS-Strings: hlpTitle, hlpShare, hlpPwa, hlpCacheTitle ────────────
    # Muster: hlpTitle:'EMOJI Text'  oder  hlpTitle:"EMOJI Text"
    # Die Strings liegen in JS-Objekt-Literalen (einfache oder doppelte Anführungszeichen)

    for key in target_ids:
        # Einfache Anführungszeichen (häufigster Fall)
        pattern_sq = re.compile(
            r"(" + re.escape(key) + r":')"
            r"((?:[\U0001F000-\U0001FFFF\U00002600-\U000027BF\u2139\u2194-\u21AA"
            r"\u2300-\u23FF\u25AA-\u25FE\u2600-\u26FF\u2700-\u27BF\uFE00-\uFE0F"
            r"\u200D\u20E3])+\s*)",
            re.UNICODE
        )
        def replacer_sq(m, key=key):
            removed = m.group(2)
            changes.append(f'  LANGS {key} (SQ): entfernt "{removed.strip()}"')
            return m.group(1)

        content = pattern_sq.sub(replacer_sq, content)

        # Doppelte Anführungszeichen (Fallback)
        pattern_dq = re.compile(
            r'(' + re.escape(key) + r':")'
            r'((?:[\U0001F000-\U0001FFFF\U00002600-\U000027BF\u2139\u2194-\u21AA'
            r'\u2300-\u23FF\u25AA-\u25FE\u2600-\u26FF\u2700-\u27BF\uFE00-\uFE0F'
            r'\u200D\u20E3])+\s*)',
            re.UNICODE
        )
        def replacer_dq(m, key=key):
            removed = m.group(2)
            changes.append(f'  LANGS {key} (DQ): entfernt "{removed.strip()}"')
            return m.group(1)

        content = pattern_dq.sub(replacer_dq, content)

    if content == original:
        print('Keine Änderungen notwendig – keine führenden Emojis in Titeltexten gefunden.')
        return False

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f'Datei aktualisiert: {path}')
    print(f'{len(changes)} Änderungen:')
    for c in changes:
        print(c)
    return True


if __name__ == '__main__':
    files = sorted(glob.glob('QC_MR_*.html'))
    if not files:
        print('Keine QC_MR_*.html Datei gefunden!', file=sys.stderr)
        sys.exit(1)

    qc_file = files[-1]
    print(f'Verarbeite: {qc_file}')
    process_file(qc_file)
