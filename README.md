# Life Tracker

A personal goals tracker (Fitness + Home life) that runs as an installable web app on your iPhone and Mac, with one shared database so everything syncs.

| You want | How it works |
|---|---|
| Never lose data | Cloudflare D1 database (30-day point-in-time restore), photos in R2, **nightly full JSON backup to R2**, plus a one-tap "Download backup" in the app |
| Same data on iPhone + Mac | One hosted app; open it in Safari → Share → **Add to Home Screen** (Mac: Safari → File → Add to Dock) |
| Infographics at several time scales | Trends: Day / Week / Month / 3 Months / Year — bars, calendar heatmaps, day-of-week patterns, room completion rings |
| Ask questions about yourself | **Ask** tab: Claude writes read-only SQL against your data and answers conversationally |
| Photo of a checked card | **Cards → Photo**: camera on iPhone, file picker on Mac. Claude reads the card code and which boxes are checked; if unsure it asks you to confirm |
| Just tell it what you did | **Log** tab (type or dictate) or a **Siri Shortcut** ("Hey Siri, log it") |
| Merge "jog" / "run" | New wording that's clearly the same is merged automatically (≥80% sure); 50–80% shows up under **Tidy** as a question; below that it's a new category |
| 4×6 printable cards | **Cards → Generate**: spreads your house tasks over 13 weeks × 3 cards (Mon–Tue, Wed–Thu, Fri–Sat), 3–6 tasks per card |

## One-time setup (~15 min)

Requires a free Cloudflare account (R2 asks for a payment method, but this usage stays in the free tier) and an Anthropic API key.

```bash
npm install
npx wrangler login
npx wrangler d1 create life-tracker          # paste the database_id into wrangler.toml
npx wrangler r2 bucket create life-tracker-data
npm run db:migrate   # applies both migrations (0001 base, 0002 game layer)
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put APP_TOKEN            # make up a long random password
# edit TZ_NAME in wrangler.toml to your timezone, then:
npm run deploy
```

Open the printed `https://life-tracker.<you>.workers.dev` URL on your phone, enter the `APP_TOKEN`, and add it to your Home Screen. Same on the Mac.

Local development: put `APP_TOKEN` and `ANTHROPIC_API_KEY` in `.dev.vars`, run `npm run db:migrate:local && npm run dev`.

## Siri Shortcuts

Create these in the Shortcuts app. Replace `<app>` with your `https://life-tracker.<you>.workers.dev` URL and `<token>` with your `APP_TOKEN`.

**Log habit** (say "Hey Siri, log habit", or put it on the Action Button / Lock Screen):
1. **Dictate Text**
2. **Get Contents of URL** → `<app>/api/log?plain=1` · Method **POST** · Request Body **JSON** · header `Authorization: Bearer <token>` · field `text` = *Dictated Text*
3. **Speak Text** (or Show Result) → *Contents of URL*. It replies like "Logged: Squats (5x5, @185). +15 XP".

**Snap checklist**:
1. **Take Photo**
2. **Resize Image** (longest edge 1600)
3. **Base64 Encode** (Line Breaks: None)
4. **Get Contents of URL** → `<app>/api/photo?plain=1` · POST · JSON · same header · field `image` = *Base64 Encoded*
5. **Speak Text** → *Contents of URL*, e.g. "Card S1-07: recorded. 1 left. +30 XP".

**Optional reminder, only when something is open** (no push server needed): Shortcuts → Automation → Time of Day (your time) →
1. **Get Contents of URL** → `<app>/api/today?plain=1` (GET, same header)
2. **If** *Contents of URL* **has any value** → **Show Notification** with it.

The endpoint returns an empty reply when today's card has nothing open, so you get no notification on those days. The text is neutral ("2 boxes open on today's card (Wed–Thu).").

**Deep links** (e.g. a Home Screen shortcut using *Open URLs*): `<app>/?voice=1` and `<app>/?snap=1` open the app's + sheet with the mic or camera button ready. Browsers only allow the mic and camera after a tap, so one tap is still needed.
On a Mac, ⌘K (Ctrl+K elsewhere) opens quick-add from any screen.

## How the game layer works (all visible in the app)

- **XP** is an append-only ledger. Every log earns base XP (fitness 15, home 10). Total XP only ever goes up; deleting an entry removes only the XP that entry earned.
- **Seasons** are calendar quarters per domain, each with a level bar. Trophies, shards and lifetime XP persist across seasons.
- **Lucky drops**: about 10% of logs also get a bonus (+10 to +40). The roll is stored and shown in the XP list. For card boxes it is seeded by the box, so un-checking and re-checking can't re-roll it.
- **Other awards**: +10 for a brand-new category, +15 "welcome back" after 3+ days away, +25 and a shard per room when a card is perfectly cleared. Rooms earn bronze/silver/gold trophies at 5/15/30 shards.
- **Momentum** (7 dots) is a gentle meter, separate from XP: +1 per active day; after 2+ missed days it loses 1 per further day. Sundays are free for Home. **Soft day** shields a day so it doesn't dip. You earn a shield per 7 active days (hold up to 3).
- **Near-miss**: the Today bar reads "X of Y · Z left"; the last open box pulses once after a photo; rooms glow at 70%+.
- **House map** lights up as each room's card tasks get done. When you generate the next quarter, rooms under 60% last time get one extra occurrence of their occasional tasks (you can untick that).
- There is no weekly review, boss fight, countdown or streak-loss message anywhere.

## Cards

- The starter house-task list (about 30 tasks, each with a frequency: every card, weekly, every 2 weeks, twice a month, monthly, quarterly) is editable on the Cards tab.
- **Assumption:** one printed card per 2-day segment (so 39 cards per quarter), with the day pair printed at the top and a code like `S1-07`. Sunday is the rest day.
- Print: AirPrint from iPhone, or the Mac print dialog with a 4×6 in paper size (margins none).
- Checking a task (tap in app, or photo) records a Home entry dated that day, so dashboards and the Ask tab include it.

## Tests

`npm test` verifies the card scheduler (counts per chore, 3–6 per card, spacing, weak-room boost) and the game rules (levels, seasons, lucky-drop odds and determinism, momentum, shields, trophies).

## Notes / limits

- Single user; access is by the bearer token. Don't share the URL+token.
- Offline: logs, photos and card check-offs are queued on the device and sent when you reconnect (safe to retry, no double-counting). Dates use your phone's local day.
- Reminders use a Shortcuts automation rather than web push (see above); real push notifications are not built.
- Photo recognition is best with good light and the card filling the frame.
