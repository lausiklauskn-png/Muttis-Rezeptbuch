#!/usr/bin/env python3
"""
extract_cr.py – Extrahiert den _CR-Block aus index.html
Einmalig ausführen, wenn sich der _CR-Block ändert: python3 extract_cr.py
"""

CR_FILE = '_cr_block.txt'

with open('index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

cr_line = None
for i, l in enumerate(lines):
    if l.strip().startswith('const _CR=Object.freeze'):
        cr_line = i
        break

if cr_line is None:
    raise RuntimeError('_CR-Zeile nicht gefunden in index.html')

with open(CR_FILE, 'w', encoding='utf-8') as f:
    f.write(lines[cr_line])

kb = len(lines[cr_line]) // 1024
print(f'Gespeichert: {CR_FILE} ({kb} KB)')
