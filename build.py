#!/usr/bin/env python3
"""
build.py – Baut index.html aus QC-Datei + _CR-Block
Aufruf: python3 build.py

Voraussetzung: _cr_block.txt muss vorhanden sein.
Einmalig erstellen mit: python3 extract_cr.py
"""

import glob
import os

CR_FILE = '_cr_block.txt'
OUTPUT  = 'index.html'


def find_qc_file():
    files = sorted(glob.glob('QC_MR_*.html'))
    if not files:
        raise FileNotFoundError('Keine QC_MR_*.html Datei gefunden')
    return files[-1]  # neueste (alphabetisch = chronologisch)


def build():
    # _CR-Block lesen
    if not os.path.exists(CR_FILE):
        raise FileNotFoundError(
            f'{CR_FILE} fehlt – einmalig erstellen mit: python3 extract_cr.py'
        )
    with open(CR_FILE, 'r', encoding='utf-8') as f:
        cr_block = f.read()
    if not cr_block.strip().startswith('const _CR=Object.freeze'):
        raise ValueError(f'{CR_FILE} enthält keinen gültigen _CR-Block')

    # QC-Datei finden und lesen
    qc_file = find_qc_file()
    print(f'QC-Datei:  {qc_file}')
    with open(qc_file, 'r', encoding='utf-8') as f:
        qc_lines = f.readlines()

    # Einfügestelle: <script> direkt vor </head>
    insert_pos = None
    for i in range(len(qc_lines) - 1):
        if qc_lines[i].strip() == '<script>' and qc_lines[i + 1].strip() == '</head>':
            insert_pos = i + 1
            break
    if insert_pos is None:
        raise RuntimeError(
            'Einfügestelle nicht gefunden – erwartet: <script> direkt vor </head>'
        )

    # Header
    header = (
        '<!--\n'
        '  ╔═════════════════════════════════════════════════════════════════╗\n'
        '  ║  Muttis Rezeptbuch  v9.2  ©  2026  Klaus Nitzsche            ║\n'
        '  ║  klaus-nitzsche@t-online.de                                     ║\n'
        '  ║  Alle Rechte vorbehalten. Unautorisierte Vervielfaeltigung,     ║\n'
        '  ║  Verbreitung oder Bearbeitung ist untersagt.                    ║\n'
        '  ║  All rights reserved. Unauthorized reproduction prohibited.     ║\n'
        f'  ║  https://github.com/lausiklauskn-png/Muttis-Rezeptbuch         ║\n'
        '  ╚═════════════════════════════════════════════════════════════════╝\n'
        f'  🔒 Protected. Source: {qc_file}\n'
        '-->\n'
    )

    # index.html zusammenbauen
    result = (
        header
        + ''.join(qc_lines[:insert_pos])
        + cr_block
        + ''.join(qc_lines[insert_pos:])
    )

    with open(OUTPUT, 'w', encoding='utf-8') as f:
        f.write(result)

    kb = os.path.getsize(OUTPUT) // 1024
    lines_count = result.count('\n')
    print(f'Fertig:    {OUTPUT} ({kb} KB, ~{lines_count} Zeilen)')


if __name__ == '__main__':
    build()
