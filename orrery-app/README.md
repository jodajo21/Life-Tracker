# Orrery: your own app

Your goals tracker as its own installable app (no Claude window around it), with a "Hey Siri, log workout" shortcut.
It runs on **your** Cloudflare account; your data lives in a small database there.

**Status: the app and server are tested locally end to end (`npm test`). The deployment to real Cloudflare, installing on a real iPhone, and the Siri Shortcut on a real device have not been tested.**

## What you need
- A free Cloudflare account (cloudflare.com), no card needed for the free plan
- Node.js 18+ on your Mac (nodejs.org)
- An Anthropic API key (console.anthropic.com → API keys). Set a monthly spending limit there.

## Install
```
cd orrery-app
npm install
npm run setup
```
Setup signs you in to Cloudflare, creates the database, makes you an access code, asks for your API key, and deploys. At the end it prints your link and access code.

## On the iPhone
1. Open the link in **Safari**. Enter the access code once.
2. Share button → **Add to Home Screen**. Open it from the new icon: it runs full screen with no browser bars.

It keeps a copy on the phone, so it opens instantly and ticking works offline; changes send when you are back online.

## "Hey Siri, log workout"
In the **Shortcuts** app, make a new shortcut named **Log workout** with these actions:
1. **Dictate Text**
2. **Format Date**: Current Date, custom format `yyyy-MM-dd`
3. **Get Contents of URL**
   - URL: `https://YOUR-LINK/api/siri?plain=1`
   - Method: POST
   - Headers: `Authorization` = `Bearer YOUR-ACCESS-CODE`
   - Request Body: JSON with `text` = the Dictated Text and `date` = the Formatted Date
4. **Speak Text** (or Show Result): the contents of the URL

Then say "Hey Siri, Log workout", and then "back squat five sets of five at 185". Siri reads back what it understood. The entry appears in the app the next time you open it (or within about 20 seconds if it is open), scored with the same rules as anything else.

## Cost
- Cloudflare free plan covers personal use of this app.
- Anthropic API is pay as you go; it is used for photo reading, text logging, Ask and Siri. Light personal use is usually small, but check current rates at anthropic.com/pricing and set a spending limit. The app also caps calls per day (`DAILY_CALL_LIMIT` in `wrangler.toml`).

## Notes
- Anyone with your link **and** access code can use your data. Keep the code private. To change it: `npx wrangler secret put APP_TOKEN`.
- Time zone for daily jobs is `TZ_NAME` in `wrangler.toml`.
- Move your existing data from the Claude version using More → Backup there, then Restore here.
- `npm run dev` runs it locally; `npm test` runs the checks.
