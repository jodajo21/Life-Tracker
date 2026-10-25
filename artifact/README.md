# Claude Artifacts

Two single-file apps that run as private [Claude Artifacts](https://claude.ai) (no server, no API key: data lives in the artifact's own database, and Claude is reached through the artifact runtime).

| File | What it is |
|---|---|
| `orrery.html` | **The app.** Fitness + home life tracker built around printable two-day cards. Starts empty, guides setup, exports the cards as a PDF, reads photos of ticked cards, takes typed or dictated logs, finds patterns. |
| `life-tracker.html` | The earlier prototype the engine came from. Superseded by Orrery; it has its own separate database. |

## Orrery

The loop it supports:

1. **Plan → Rooms & tasks.** Pick rooms; starter tasks are added (or chat with the room planner). Tasks belong to a room, a category (plants, car...) or the whole house, with a frequency per quarter.
2. **Plan → Deck.** The scheduler spreads tasks over **39 two-day cards** (13 weeks × Mon–Tue / Wed–Thu / Fri–Sat), 3 to 5 tasks each (6 only when unavoidable). Every card is editable; each must be marked Reviewed before printing.
3. **Plan → Print & start.** A sheet-by-sheet preview, then the **PDF**: 2 cards per US-Letter landscape sheet, a blank strip at the top of each card for a clamp (4×6 or 5.5×8.5 card size). A one-sheet test print is available. Then start the cycle (this week or next).
4. **Today.** The wall shows all 39 cards at a glance; today's card can be ticked on screen. Cards lock after their week's Sunday, so there is no backlog. Log sheet: type or dictate ("hoovered downstairs", "legs 5x5 at 185"), or photograph a ticked paper card for Claude to read (always reviewable, with undo).
5. **Patterns / Ask.** A landscape of the whole cycle, plain-language insights with "show me why" stories, completion rates, and a chat that queries your data. Light game layer (XP, momentum, soft days).
6. **Notes.** Any card takes a short note, tagged *Just a note* (stays with the card; Ask can read it), *Next deck* (shown on the Deck step when you deal the next deck, and given to the room planner) or *App idea* (collected under More, with Copy). Notes are included in backups.
7. **More.** Appearance, backup / restore as JSON, settings, possible-duplicate categories.

### Look and feel

Two themes share one depth system: a fixed ambient scene that panels slide over as you scroll, tinted glass panels with a light rim, raised controls, gauges with tick marks, and floating chrome (header, tab bar, sheets) that blurs what scrolls under it. **Nebula** (default) is deep indigo with an aqua accent; **Ember** is smoked graphite with an orange accent. Colour keeps the same jobs in both: accent = done and primary actions, pink/red = missed, lilac/teal = what Claude knows, gold/blue = fitness. Themes are CSS variables in `00_head.html` (canvas and SVG read them through `syncPalette()` in `45_land.js`); the choice is stored per device in `localStorage`. The review cards on the Deck step are dark glass that keeps the paper's structure (clamp strip, number badge, ruled header, drawn boxes) and lights up when reviewed; the tick card on Today and the print preview stay white paper because they depict the printed card. Reduced motion and reduced transparency are respected.

A **sample preview** (read-only, in memory, nothing saved) is available from the first-run card and the Ask/Patterns empty states so the screens can be explored before any real data exists.

### Data

Collections in the artifact database (`db` capability): `entries`, `categories`, `chores`, `rooms`, `taskcats`, `decks` (undated, 39 cards, `reviewed` per card), `cardsets` (dated runs of a deck, items with `done`), `notes`, `roomchats`, `shields`, `suggestions`, and `settings/main`.

Capabilities declared when publishing: `db`, `sample` (with images, for photo reading and chat), `downloads` (PDF and backup).

### Build and test

```bash
python3 artifact/orrery-src/build.py            # concatenates modules.txt -> artifact/orrery.html
node artifact/orrery-src/test/smoke.mjs         # Playwright, with test/mock-claude.js standing in for window.claude
```

`smoke.mjs` runs first run → quick start → deal → review → PDF (20 sheets) → start cycle → tick → text log. Offline, point `JSPDF_PATH` at a local `jspdf.umd.min.js`; `CHROMIUM` selects a browser binary.

The sources are plain modules concatenated in the order of `orrery-src/modules.txt` into one async function (CSS: `00_head.html` + `01_ui.css` + `02_screens.css` + `03_depth.css`). `window.__ORRERY_DEBUG = 1` before load exposes `window.__O` for tests.

### Known limits

- Tested with a mock runtime and Chromium, not on a physical iPhone. Real photo-reading accuracy depends on lighting and handwriting.
- Artifacts cannot send notifications or use the microphone; use the keyboard's dictation key for voice logging.
- Dates are the device's local dates; cards are dated from the Monday the cycle starts.
