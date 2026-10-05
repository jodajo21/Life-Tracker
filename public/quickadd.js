// Floating "+" (voice or photo first), ⌘K quick-add, and ?voice=1 / ?snap=1 deep links.
import { $, esc, api, toast, rewardToast, ymd, store } from './util.js';
import { snapPhoto } from './photo.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let sheet, rec;

export function initQuickAdd() {
  document.body.insertAdjacentHTML('beforeend', `
    <button id="fab" aria-label="Add">+</button>
    <input id="snapfile" type="file" accept="image/*" capture="environment" hidden>
    <dialog id="sheet" class="sheet">
      <div class="bigrow">
        <button class="bigbtn" id="qa-voice"><span class="ico">🎤</span><span id="qa-voice-l">Say it</span></button>
        <button class="bigbtn" id="qa-snap"><span class="ico">📷</span><span id="qa-snap-l">Snap a card</span></button>
      </div>
      <textarea id="qa-text" placeholder="…or type it. e.g. “legs, squats 5x5 at 185, then cleaned both bathrooms”"></textarea>
      <p id="qa-status" class="sub" aria-live="polite"></p>
      <div class="row"><button class="sec" id="qa-close">Close</button><span class="grow"></span><span class="sub hide-sm">⌘↵</span><button class="primary" id="qa-go">Log it</button></div>
    </dialog>`);
  sheet = $('#sheet');
  $('#fab').onclick = () => open();
  $('#qa-close').onclick = close;
  $('#qa-voice').onclick = listen;
  $('#qa-snap').onclick = () => $('#snapfile').click();
  $('#snapfile').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; close(); snapPhoto(f, changed); };
  $('#qa-go').onclick = () => submit($('#qa-text').value, 'text');
  $('#qa-text').onkeydown = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit($('#qa-text').value, 'text'); };
  sheet.addEventListener('close', () => { try { rec?.abort(); } catch {} });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open({ type: true }); }
  });

  // Deep links. Browsers only allow the mic/camera after a tap, so these open the sheet with the right button ready.
  const p = new URLSearchParams(location.search);
  if (p.get('voice') || p.get('snap')) {
    history.replaceState(null, '', location.pathname + location.hash);
    setTimeout(() => open(), 300);
    const k = p.get('voice') ? 'voice' : 'snap';
    $(`#qa-${k}`).classList.add('hot'); $(`#qa-${k}-l`).textContent = k === 'voice' ? 'Tap to talk' : 'Tap to open camera';
  }
}

const changed = () => window.dispatchEvent(new Event('data-changed'));
function open({ type } = {}) {
  $('#qa-status').textContent = ''; $('#qa-text').value = '';
  if (!sheet.open) sheet.showModal();
  if (type) $('#qa-text').focus();
}
function close() { if (sheet.open) sheet.close(); }

function listen() {
  if (!SR) { $('#qa-status').textContent = 'Voice isn’t available in this browser. Tap the text box and use the keyboard’s 🎤 key.'; $('#qa-text').focus(); return; }
  try { rec?.abort(); } catch {}
  rec = new SR(); rec.lang = 'en-US'; rec.interimResults = true;
  let text = '';
  rec.onresult = (e) => { text = [...e.results].map((r) => r[0].transcript).join(' '); $('#qa-text').value = text; };
  rec.onend = () => { $('#qa-voice').classList.remove('live'); $('#qa-status').textContent = ''; if (text.trim()) submit(text, 'voice'); };
  rec.onerror = (ev) => { $('#qa-status').textContent = ev.error === 'not-allowed' ? 'Microphone permission is off for this site.' : 'Didn’t catch that — try again.'; };
  rec.start(); $('#qa-voice').classList.add('live'); $('#qa-status').textContent = 'Listening… just say what you did.';
}

async function submit(text, source) {
  text = text.trim(); if (!text) return;
  const go = $('#qa-go'); go.disabled = true; $('#qa-status').textContent = 'Working on it…';
  try {
    const r = await api('/log', { body: { text, source, client_today: ymd(new Date()) }, queue: true });
    if (r.queued) { toast("Saved offline — I'll log it when you're back online."); close(); return; }
    if (!r.counted) { $('#qa-status').textContent = r.message; return; }
    store.set('domain', r.saved[0].goal);
    rewardToast(`Logged ✓ ${r.saved.map((s) => s.activity).join(', ')}`, r.rewards);
    close(); changed();
  } catch (e) { $('#qa-status').textContent = e.message; } finally { go.disabled = false; }
}
