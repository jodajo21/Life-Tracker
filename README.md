# Life Tracker

A personal goals tracker (Fitness + Home life) that runs as an installable web app on your iPhone and Mac, with one shared database so everything syncs.

| You want | How it works |
|---|---|
| Never lose data | Cloudflare D1 database (30-day point-in-time restore), photos in R2, **nightly full JSON backup to R2**, plus a one-tap "Download backup" in the app |
| Same data on iPhone + Mac | One hosted app; open it in Safari → Share → **Add to Home Screen** (Mac: Safari → File → Add to Dock) |
| Infographics at several time scales | Dashboard: Week / Month / Quarter / Year — bars, calendar heatmaps, day-of-week patterns, room completion rings |
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
npm run db:migrate
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put APP_TOKEN            # make up a long random password
# edit TZ_NAME in wrangler.toml to your timezone, then:
npm run deploy
```

Open the printed `https://life-tracker.<you>.workers.dev` URL on your phone, enter the `APP_TOKEN`, and add it to your Home Screen. Same on the Mac.

Local development: put `APP_TOKEN` and `ANTHROPIC_API_KEY` in `.dev.vars`, run `npm run db:migrate:local && npm run dev`.

## Siri Shortcut (voice logging)

Shortcuts app → **+** → add these actions:

1. **Dictate Text** (stop listening: after pause)
2. **Get Contents of URL** → `https://life-tracker.<you>.workers.dev/api/log?plain=1`
   - Method: **POST**, Request Body: **JSON**
   - Headers: `Authorization` = `Bearer <your APP_TOKEN>`
   - JSON field: `text` = *Dictated Text*
3. **Speak Text** (or Show Result) → *Contents of URL*

Name the shortcut e.g. "Log it". Then "Hey Siri, log it" → speak "did legs, squats 5 by 5 at 185, then cleaned both bathrooms". Siri's wake phrase is fixed by iOS, but the shortcut name is yours. Also works from the Action Button / Lock Screen widget.

## Cards

- The starter house-task list (about 30 tasks, each with a frequency: every card, weekly, every 2 weeks, twice a month, monthly, quarterly) is editable on the Cards tab.
- **Assumption:** one printed card per 2-day segment (so 39 cards per quarter), with the day pair printed at the top and a code like `S1-07`. Sunday is the rest day.
- Print: AirPrint from iPhone, or the Mac print dialog with a 4×6 in paper size (margins none).
- Checking a task (tap in app, or photo) records a Home entry dated that day, so dashboards and the Ask tab include it.

## Tests

`npm test` verifies the card scheduler (counts per chore, 3–6 per card, spacing).

## Notes / limits

- Single user; access is by the bearer token. Don't share the URL+token.
- Entries are only logged while online (no offline queue yet).
- Photo recognition is best with good light and the card filling the frame.
