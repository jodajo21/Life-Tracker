// Draws the app icon (an orrery: orbits, a sun, two planets) and writes the PNG sizes the home screen and manifest need.
let chromium; try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = await import('/opt/node-tools/node_modules/playwright/index.mjs')); }
import fs from 'fs';
const svg = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 512 512"><defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b0f33"/><stop offset="1" stop-color="#190d45"/></linearGradient>
<radialGradient id="o1" cx="18%" cy="8%" r="70%"><stop offset="0" stop-color="#7050ff" stop-opacity=".6"/><stop offset="1" stop-color="#7050ff" stop-opacity="0"/></radialGradient>
<radialGradient id="o2" cx="90%" cy="95%" r="60%"><stop offset="0" stop-color="#00c4ff" stop-opacity=".45"/><stop offset="1" stop-color="#00c4ff" stop-opacity="0"/></radialGradient>
<radialGradient id="sun"><stop offset="0" stop-color="#d9fbff"/><stop offset="1" stop-color="#3fe3f5"/></radialGradient>
<filter id="gl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter></defs>
<rect width="512" height="512" fill="url(#bg)"/><rect width="512" height="512" fill="url(#o1)"/><rect width="512" height="512" fill="url(#o2)"/>
<g fill="none" stroke="#c9cffa" stroke-opacity=".32" stroke-width="3"><circle cx="256" cy="256" r="74"/><circle cx="256" cy="256" r="128"/><circle cx="256" cy="256" r="182"/></g>
<ellipse cx="256" cy="256" rx="196" ry="68" transform="rotate(-24 256 256)" fill="none" stroke="#3fe3f5" stroke-opacity=".85" stroke-width="5"/>
<circle cx="256" cy="256" r="44" fill="#3fe3f5" filter="url(#gl)" opacity=".8"/><circle cx="256" cy="256" r="30" fill="url(#sun)"/>
<circle cx="394" cy="204" r="17" fill="#ffc65c"/><circle cx="148" cy="338" r="10" fill="#eef1ff"/><circle cx="256" cy="74" r="8" fill="#b69cff"/></svg>`;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
for (const [name, s] of [['icon-512.png', 512], ['icon-192.png', 192], ['icon-180.png', 180]]) {
  const p = await b.newPage({ viewport: { width: s, height: s } }); await p.setContent(`<body style="margin:0">${svg(s)}</body>`);
  await p.screenshot({ path: new URL(`../public/${name}`, import.meta.url).pathname, omitBackground: false }); await p.close();
}
fs.writeFileSync(new URL('../public/icon.svg', import.meta.url).pathname, svg(512)); await b.close(); console.log('icons written');
