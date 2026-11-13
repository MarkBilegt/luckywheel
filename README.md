# Азын хүрд (Lucky Wheel)

A standalone spin-to-win site in Mongolian. Visitors enter their **name and phone number**, spin the wheel,
and win a discount, free delivery, a cash prize, or nothing. The owner gets a call list in the admin
to phone people back later.

Runs entirely on **Cloudflare**:

- **Site:** React + Vite (`src/`), served by Workers Static Assets from `dist/`
- **API:** a Cloudflare Worker using Hono (`worker/`), handling `/api/*`
- **Database:** Cloudflare D1, which is SQLite (`migrations/`)

## Run it locally

```bash
npm install
cp .dev.vars.example .dev.vars   # set ADMIN_PASSWORD (10+ characters) and SESSION_SECRET
npm run dev                      # Worker + local D1 on :8787, site on http://localhost:5173
```

- `/` is the wheel visitors see.
- `/#/admin` is the admin (password from `.dev.vars`). Nothing on the public page links to it.
- The local database lives in `.wrangler/` and has nothing to do with the live one.

## Deploy to Cloudflare (first time)

```bash
npx wrangler login                          # opens the browser to sign in to Cloudflare
npx wrangler d1 create luckywheel           # prints a database_id: paste it into wrangler.jsonc
npx wrangler secret put ADMIN_PASSWORD      # type the admin password (10+ characters)
npx wrangler secret put SESSION_SECRET      # paste a long random string
npm run deploy                              # build, create the tables, upload
```

`npm run deploy` prints the site's address (`https://luckywheel.<your-subdomain>.workers.dev`).
To use your own domain: Cloudflare dashboard → Workers & Pages → luckywheel → Settings → Domains & Routes.

After that, `npm run deploy` publishes any change. Or connect the GitHub repo in the dashboard
(Workers & Pages → luckywheel → Settings → Builds) with build command `npm run build` and deploy
command `npx wrangler d1 migrations apply luckywheel --remote && npx wrangler deploy`, so every push to
`main` goes live.

**Backups:** `npx wrangler d1 export luckywheel --remote --output backup.sql` saves all phone numbers,
codes and notes. D1 also keeps 30 days of point-in-time history (`wrangler d1 time-travel`).

## How a spin works

1. The page loads the wheel from `GET /api/wheel` (names and colors only, never the odds).
2. The visitor submits name + phone. `POST /api/spin` checks the number (8-digit Mongolian, `+976` optional),
   the per-number limit, the wait time, the per-IP daily limit, and a 10-per-minute burst limit, then picks
   the prize **on the server** and saves it.
3. Each spin takes a numbered "slot" for that phone, protected by a `UNIQUE (phone, slot)` rule, so a
   double-click or two tabs can't win twice.
4. The browser only animates the wheel to the slice the server chose and shows the code.

Daily resets use Mongolian time (UTC+8; `UTC_OFFSET_MINUTES` in `wrangler.jsonc`), because Workers run on UTC.

## Admin

- **Шагнал ба магадлал:** up to 20 slices, prize types, weights (odds), colors, palettes.
- **Дүрэм ба маягт:** spins per number, per-IP limit, wait time, daily reset, name required/optional/hidden, consent checkbox and text, all wording, coupon prefix and validity.
- **Загвар:** wheel and page look, effects, fonts, custom CSS.
- **Купон шалгах:** type a customer's code to see if it's valid, used or expired, and mark it used.
- **Утасны жагсаалт:** everyone who spun, with tap-to-call numbers, a "called" checkbox, a note per person, a "not called yet" filter, search, and CSV export.
- **Тайлан:** new numbers, spins, coupons and win rate for a date range, by prize.

## API

| Method | Path | |
| --- | --- | --- |
| GET | `/api/wheel` | public wheel (no odds) |
| POST | `/api/spin` | `{ name, phone, consent }` → `{ segments, segmentIndex, record }` |
| GET / POST / POST | `/api/admin/session` · `/login` · `/logout` | admin session (HttpOnly, Secure, SameSite=Strict cookie) |
| GET / PUT · POST | `/api/admin/config` · `/api/admin/config/reset` | settings, prizes, design |
| GET / DELETE | `/api/admin/spins` | all spins / delete everything |
| GET · PUT | `/api/admin/contacts` · `/api/admin/contacts/:phone` | call-back status and notes |
| GET · POST | `/api/admin/coupons/:code` · `/api/admin/coupons/:code/redeem` | check / mark a code used |

## Notes

- Phone numbers are personal data. The consent checkbox says people agree to be called; keep it on.
- Codes are only shown on screen (no SMS is sent). An SMS gateway could be called from `worker/index.ts` after a win.
- Free plan limits (100,000 requests/day, 5 GB D1) are far beyond what this site needs.
