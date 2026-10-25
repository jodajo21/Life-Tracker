"""Build artifact/orrery.html from the modules listed in modules.txt.

Usage: python3 artifact/orrery-src/build.py [output-path]   (default: artifact/orrery.html)
JS modules are concatenated, in order, into one async IIFE; CSS is 00_head.html + 01_ui.css + 02_screens.css + 03_depth.css.
"""
import os, sys
d = os.path.dirname(os.path.abspath(__file__))
r = lambda f: open(os.path.join(d, f), encoding='utf-8').read()
mods = [l.strip() for l in open(os.path.join(d, 'modules.txt'), encoding='utf-8') if l.strip() and not l.startswith('#')]
js = '\n'.join(r(f) for f in mods)
head = r('00_head.html') + '\n' + r('01_ui.css') + '\n' + r('02_screens.css') + '\n' + r('03_depth.css') + '\n</style>'
html = ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        + head + '</head><body>\n' + r('10_body.html') + '\n<script>\n(async () => {\n"use strict";\n' + js + '\n})();\n</script>\n</body></html>')
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(d, '..', 'orrery.html')
open(out, 'w', encoding='utf-8').write(html)
print(len(html), 'bytes;', len(mods), 'modules ->', os.path.relpath(out))
