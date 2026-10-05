import { $, esc, api, toast, rewardToast } from './util.js';

export async function resizeToJpeg(file, max = 1600) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85).split(',')[1];
}

/** Reads a photo of a card. Auto-applies when sure; otherwise asks to confirm. Calls onDone() after anything changed. */
export async function snapPhoto(file, onDone) {
  toast('Reading your card…');
  try {
    const r = await api('/photo', { body: { image: await resizeToJpeg(file), media_type: 'image/jpeg' }, queue: true });
    if (r.queued) { toast("Saved offline — I'll read it when you're back online."); return; }
    if (!r.card) { toast(r.notes || "Couldn't tell which card that is — try a closer, brighter photo."); return; }
    const added = r.proposal.filter((p) => p.checked && !p.was_done).length;
    const left = r.proposal.filter((p) => !p.checked).length;
    if (r.auto_applied) {
      sessionStorage.setItem('pulse', '1'); // Today pulses the last open box once, so the near-miss is visible
      rewardToast(`${r.card.code}: ${added} new ✓ · ${left ? `${left} left` : 'card cleared!'}`, r.rewards || []);
      onDone?.(); return;
    }
    const dlg = $('#dlg');
    dlg.innerHTML = `<h2>Is this right? · ${esc(r.card.code)}</h2><p class="sub">I wasn't fully sure about a few boxes. Nothing is recorded until you confirm. ${esc(r.notes)}</p>
      ${r.proposal.map((p) => `<label class="check"><input type="checkbox" data-id="${p.item_id}" data-was="${p.was_done ? 1 : 0}" ${p.checked ? 'checked' : ''}><span>${esc(p.name)}${p.confidence < 0.8 ? '<small>unsure</small>' : ''}</span></label>`).join('')}
      <div class="row" style="margin-top:12px"><button class="sec" id="cancel">Cancel</button><span class="grow"></span><button class="primary" id="ok">Confirm</button></div>`;
    dlg.showModal();
    $('#cancel', dlg).onclick = () => dlg.close();
    $('#ok', dlg).onclick = async () => {
      const boxes = [...dlg.querySelectorAll('input')];
      const res = await api(`/cards/${r.card.id}/items`, { body: { check: boxes.filter((b) => b.checked && b.dataset.was === '0').map((b) => +b.dataset.id), uncheck: boxes.filter((b) => !b.checked && b.dataset.was === '1').map((b) => +b.dataset.id) } });
      dlg.close(); sessionStorage.setItem('pulse', '1');
      rewardToast('Card updated', res.rewards || []); onDone?.();
    };
  } catch (e) { toast(e.message); }
}
