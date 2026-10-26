"""Build artifact/orrery.html from the modules listed in modules.txt.

Usage: python3 artifact/orrery-src/build.py [output-path]   (default: artifact/orrery.html)
       python3 artifact/orrery-src/build.py --standalone orrery-app/public   (also writes the stand-alone app page there)
JS modules are concatenated, in order, into one async IIFE; CSS is 00_head.html + 01_ui.css + 02_screens.css + 03_depth.css.
"""
import os, sys, re, shutil
d = os.path.dirname(os.path.abspath(__file__))
r = lambda f: open(os.path.join(d, f), encoding='utf-8').read()
mods = [l.strip() for l in open(os.path.join(d, 'modules.txt'), encoding='utf-8') if l.strip() and not l.startswith('#')]
js = '\n'.join(r(f) for f in mods)
head = r('00_head.html') + '\n' + r('01_ui.css') + '\n' + r('02_screens.css') + '\n' + r('03_depth.css') + '\n</style>'
html = ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        + head + '</head><body>\n' + r('10_body.html') + '\n<script>\n(async () => {\n"use strict";\n' + js + '\n})();\n</script>\n</body></html>')
args = [a for a in sys.argv[1:] if a != '--standalone']
stand = '--standalone' in sys.argv[1:]
out = os.path.join(d, '..', 'orrery.html') if stand or not args else args[0]
stand_dir = args[0] if stand and args else None
open(out, 'w', encoding='utf-8').write(html)
print(len(html), 'bytes;', len(mods), 'modules ->', os.path.relpath(out))

if stand_dir:                                       # the same page, made installable and pointed at your own Worker
    page = html.replace('<title>Orrery</title>', '<title>Orrery</title>\n<link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#060818">\n<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="Orrery">\n<link rel="apple-touch-icon" href="/icon-180.png"><link rel="icon" href="/icon-192.png">', 1)
    page = page.replace('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', '/vendor/jspdf.umd.min.js')
    page = page.replace('<script>\n(async () => {', '<script src="/claude-shim.js"></script>\n<script>\n(async () => {', 1)
    page = page.replace('</body></html>', "<script>if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));</script>\n</body></html>")
    assert 'claude-shim.js' in page and '/vendor/jspdf' in page and 'serviceWorker' in page
    os.makedirs(stand_dir, exist_ok=True)
    open(os.path.join(stand_dir, 'index.html'), 'w', encoding='utf-8').write(page)
    shutil.copy(os.path.join(d, '..', '..', 'orrery-app', 'shim', 'claude-shim.js'), os.path.join(stand_dir, 'claude-shim.js'))
    print('stand-alone page ->', os.path.relpath(os.path.join(stand_dir, 'index.html')))
