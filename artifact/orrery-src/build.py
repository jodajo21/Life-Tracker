import os
d=os.path.dirname(os.path.abspath(__file__))
r=lambda f:open(os.path.join(d,f)).read()
js=''.join(r(f)+'\n' for f in ['20_data.js','30_terrain.js','35_overlay.js','40_constellation.js','41_deck.js','50_director.js','60_desktop.js','65_cards.js','70_mobile.js'] if os.path.exists(os.path.join(d,f)))
html=r('00_head.html')+'\n<body>\n'+r('10_body.html')+'\n<script>\n(function(){\n"use strict";\n'+js+'\n})();\n</script>\n</body>\n'
html=html.replace('</style>',r('72_cards.css')+'\n</style>',1)
mob=os.path.join(d,'75_mobile.css')
if os.path.exists(mob): html=html.replace('</style>',r('75_mobile.css')+'\n</style>',1)
open(os.path.join(d,'orrery.html'),'w').write('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n'+html+'</html>')
print(len(html))
