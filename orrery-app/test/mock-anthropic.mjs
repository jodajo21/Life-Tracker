// A stand-in for the Anthropic Messages API, for local tests only: it answers the way Claude would for the app's own prompts.
import http from 'http';
export function startMock(port = 9911) {
  const calls = [];
  const srv = http.createServer((req, res) => {
    let raw = ''; req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (req.method !== 'POST' || !req.url.startsWith('/v1/messages')) { res.writeHead(404); return res.end('{}'); }
      const b = JSON.parse(raw); const key = req.headers['x-api-key'];
      calls.push({ model: b.model, stream: !!b.stream, tools: (b.tools || []).map((t) => t.name), key });
      if (key === 'bad-key') { res.writeHead(401, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } })); }
      const last = b.messages[b.messages.length - 1], first = b.messages[0];
      const firstText = typeof first.content === 'string' ? first.content : first.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
      const lastIsResult = Array.isArray(last.content) && last.content.some((c) => c.type === 'tool_result');
      const tools = Object.fromEntries((b.tools || []).map((t) => [t.name, t]));
      let blocks, stop = 'end_turn';
      const text = (t) => ({ type: 'text', text: t }), use = (name, input, i = 0) => ({ type: 'tool_use', id: `tu_${name}_${i}`, name, input });
      if (/printed 4x6 paper checklist/.test(firstText)) {
        const code = firstText.match(/\n(C\d+) \(card/)[1], ids = [...firstText.split(code)[1].matchAll(/item ([\w-]+):/g)].map((m) => m[1]).slice(0, 6);
        blocks = [text(JSON.stringify({ card_code: code, card_confidence: 0.95, items: ids.map((id, i) => ({ item_id: id, checked: i < 2, confidence: 0.95 })), notes: '' }))];
      } else if (/turn a person's casual/.test(firstText)) {
        const note = JSON.parse(firstText.match(/Note: (".*")/)[1]), today = firstText.match(/Today is (\d{4}-\d\d-\d\d)/)[1];
        const date = /yesterday/i.test(note) ? new Date(new Date(today + 'T12:00:00Z').getTime() - 864e5).toISOString().slice(0, 10) : today;
        const e = /squat/i.test(note) ? [{ goal: 'fitness', date, activity: 'Back Squat', best_match_id: null, match_confidence: 0, details: { sets: 5, reps: 5, weight: 185 } }]
          : /run|jog/i.test(note) ? [{ goal: 'fitness', date, activity: 'Running', best_match_id: null, match_confidence: 0, details: { distance_mi: 3 } }] : [];
        blocks = [text(JSON.stringify({ entries: e, clarification: e.length ? null : 'What did you do?' }))];
      } else if (/helping plan ONE space/.test(firstText)) {
        if (!lastIsResult) { blocks = [text('Here is a start.'), use('propose_changes', { summary: 'Starter plan', adds: [{ name: 'Clean one shelf', per_quarter: 7, area: 'Shelves', parts: 6, why: 'covers all six' }], updates: [], removes: [] }, 0), use('quick_replies', { options: ['Looks good', 'Lighter'] }, 1)]; stop = 'tool_use'; }
        else blocks = [text('Want me to add these?')];
      } else if (tools.aggregate) {
        if (!lastIsResult) { blocks = [use('aggregate', { source: 'entries', group_by: 'weekday', metric: 'count' })]; stop = 'tool_use'; }
        else blocks = [text('Most of your entries land on Wednesday.\nTiny move: log one thing on your quietest day.')];
      } else blocks = [text('ok')];
      const msg = { id: 'msg_mock', type: 'message', role: 'assistant', model: b.model, content: blocks, stop_reason: stop, usage: { input_tokens: 1, output_tokens: 1 } };
      if (!b.stream) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(msg)); }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const ev = (t, d) => res.write(`event: ${t}\ndata: ${JSON.stringify({ type: t, ...d })}\n\n`);
      ev('message_start', { message: { ...msg, content: [] } });
      blocks.forEach((blk, index) => {
        if (blk.type === 'text') { ev('content_block_start', { index, content_block: { type: 'text', text: '' } }); const h = Math.ceil(blk.text.length / 2); ev('content_block_delta', { index, delta: { type: 'text_delta', text: blk.text.slice(0, h) } }); ev('content_block_delta', { index, delta: { type: 'text_delta', text: blk.text.slice(h) } }); }
        else { ev('content_block_start', { index, content_block: { type: 'tool_use', id: blk.id, name: blk.name, input: {} } }); const j = JSON.stringify(blk.input), h = Math.ceil(j.length / 2); ev('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: j.slice(0, h) } }); ev('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: j.slice(h) } }); }
        ev('content_block_stop', { index });
      });
      ev('message_delta', { delta: { stop_reason: stop } }); ev('message_stop', {}); res.end();
    });
  });
  return new Promise((ok) => srv.listen(port, '127.0.0.1', () => ok({ srv, calls, close: () => srv.close() })));
}
if (import.meta.url === `file://${process.argv[1]}`) { await startMock(+process.argv[2] || 9911); console.log('mock anthropic on', process.argv[2] || 9911); }
