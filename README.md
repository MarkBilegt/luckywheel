# Азын хүрд (Lucky Wheel)

A standalone spin-to-win website in Mongolian. Visitors enter their **name and phone number**, spin the
wheel, and win a discount, free delivery, a cash prize, or nothing. The owner manages prizes, odds and
design in an admin area, and gets a **call list** of everyone who spun to phone them back later.

**Live:** https://luckywheel.mpbilegt.workers.dev · **Admin:** `/#/admin`

![Stack](https://img.shields.io/badge/React-19-61dafb) ![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers%20%2B%20D1-f38020)

---

## What it does

**For visitors**
- Full-page wheel with name + phone form (8-digit Mongolian numbers, `+976` optional) and a consent checkbox.
- On spin, the wheel flies to the centre of the screen and grows, spins with a tick for every slice that
  passes the pointer, lights up the winning slice with a prize badge, then glides back and shows the result
  and coupon code.
- Sound: synced ticks + a big win fanfare (brass, drums, bells, applause). Mute button top-right.
- Works on phones; respects "reduce motion".

**For the owner (admin)**
| Tab | What's there |
| --- | --- |
| Шагнал ба магадлал | Up to 20 slices: label, prize type (% off, fixed off, free delivery, cash, nothing), value, colours, **weight (odds)**, palettes |
| Дүрэм ба маягт | Spins per number, per-device daily limit, wait time, daily reset, wheel on/off, name field, consent text, all wording, currency, coupon prefix and validity, **sound** on/off + volume + preview |
| Загвар | Full/half wheel, pointer position, size, colours, logo in the centre, background, fonts, effects, custom CSS |
| Купон шалгах | Type a customer's code → valid / used / expired → mark as used |
| Утасны жагсаалт | **Call list**: tap-to-call numbers, prize and code, "called" checkbox, a note per person, "not called yet" filter, search, CSV export |
| Тайлан | New numbers, spins, coupons and win rate for a date range, by prize |

"Туршиж үзэх" plays the real wheel with unsaved changes, without recording anything.

## Tech

| Part | What | Where |
| --- | --- | --- |
| Website | React 19 + Vite + TypeScript | `src/` |
| API | [Hono](https://hono.dev) app — the same code runs on Cloudflare Workers and on Node | `worker/` |
| Database | SQLite: Cloudflare D1, or a file on a VPS | `migrations/` |
| Hosting | **Cloudflare** (Workers + D1) or **any VPS** (Docker: Node + SQLite + Caddy for HTTPS) | `wrangler.jsonc` · `docker-compose.yml` |

```
src/
  components/      Wheel, SpinPanel (form + spin show), LuckyWheel (page), admin/ (tabs)
  lib/
    rules.ts       shared rules: phone check, spin limits, daily reset (UB time), config cleaning
    wheel.ts       wheel maths: odds, landing angle, tick timing, Mongolian money/prize text
    sound.ts       tick sound + audio engine        fanfare.ts   the win fanfare
    api.ts         calls to the API, CSV export
  config/defaults.ts   default prizes, texts and design
worker/            index.ts (routes), db.ts (database queries, rate limits), auth.ts (admin session)
server/            VPS only: index.ts (Node entry), d1-sqlite.ts (SQLite in place of D1),
                   backup.ts / import.ts / export.ts (data tools)
migrations/        database tables (used by both Cloudflare and the VPS)
tests/             unit tests (npm test)
scripts/           dev.mjs (local dev), api-test.mjs (end-to-end API test)
```

## Run it locally

Needs **Node.js 22.18+**.

```bash
npm install
cp .dev.vars.example .dev.vars    # then set ADMIN_PASSWORD (10+ chars) and SESSION_SECRET
npm run dev                       # site http://localhost:5173 + API with a local database
```

The local database lives in `.wrangler/` and is completely separate from the live one.

## Commands

| Command | |
| --- | --- |
| `npm run dev` | Local site + API |
| `npm test` | Unit tests (≈ 0.2 s) |
| `npm run test:api` | Builds, starts the real Worker with a throwaway database, tests the whole API (≈ 1.5 min) |
| `npm run test:api:node` | Same 30 checks against the VPS server (Node + SQLite) |
| `npm run build` | Type-check everything and build the site |
| `npm run deploy` | Build, update the live database tables, publish |
| `npm run db:backup` | Cloudflare: download the live database to `backup.sql` (phone numbers, codes, notes) |
| `npm run start:node` | VPS without Docker: run the site + API on Node (after `npm run build`) |
| `npm run vps:backup` | VPS: snapshot the database into `backups/` (keeps 30) |
| `npm run vps:import -- backup.sql` | VPS: load data exported from Cloudflare |
| `npm run vps:export` | VPS: write `export.sql` to load into Cloudflare |

## Deploying

The site runs on **Cloudflare** today. It can also run on **any VPS** — see [Hosting on a VPS](#hosting-on-a-vps).

### Cloudflare

Already set up on Cloudflare: after any change, `npm run deploy` (you must be logged in with `npx wrangler login`).

**Setting it up on a different Cloudflare account** (e.g. taking ownership):

```bash
npx wrangler login
npx wrangler d1 create luckywheel           # paste the printed database_id into wrangler.jsonc
npx wrangler secret put ADMIN_PASSWORD      # 10+ characters
npx wrangler secret put SESSION_SECRET      # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm run deploy
```

Your own domain: Cloudflare dashboard → Workers & Pages → luckywheel → Settings → Domains & Routes.
Auto-deploy on every push: same page → Settings → Builds → connect the GitHub repo
(build command `npm run build`, deploy command `npx wrangler d1 migrations apply luckywheel --remote && npx wrangler deploy`).

To move the existing data to a new account: `npm run db:backup` on the old one, then
`npx wrangler d1 execute luckywheel --remote --file backup.sql` on the new one.

### Hosting on a VPS

The same API code runs on Node, with SQLite in a file instead of D1 (`server/d1-sqlite.ts` provides the
D1 calls the code uses). Caddy sits in front and gets the HTTPS certificate automatically — **HTTPS is
required**, because the admin login cookie only works over HTTPS.

**You need:** a Linux VPS with [Docker](https://docs.docker.com/engine/install/) (1 GB RAM is plenty), and a
domain whose DNS **A record** points at the server's IP. Ports 80 and 443 must be open.

```bash
git clone https://github.com/MarkBilegt/luckywheel.git && cd luckywheel
cp .env.example .env          # set DOMAIN, ADMIN_PASSWORD, SESSION_SECRET
docker compose up -d --build  # builds, runs the tests, starts the app + Caddy
```

Open `https://<your domain>` — the first start creates the database. Updating later:

```bash
git pull && docker compose up -d --build
```

**Backups** (the database is one file in the `appdata` volume):

```bash
docker compose exec app npm run vps:backup        # → backups volume, keeps the newest 30
docker compose cp app:/app/backups ./backups      # copy them off the server
```

Nightly at 03:00 — add with `crontab -e`:
`0 3 * * * cd /path/to/luckywheel && docker compose exec -T app npm run vps:backup`

**Moving data from Cloudflare to the VPS:**

```bash
npm run db:backup                                  # on a computer logged in to Cloudflare → backup.sql
# copy backup.sql to the server's luckywheel folder, then:
docker compose stop app
docker compose run --rm -v ./backup.sql:/app/backup.sql app npm run vps:import -- backup.sql
docker compose start app
```

The import loads into a fresh database first and keeps the previous one as
`luckywheel.before-import-<time>.db`, so nothing is lost if something goes wrong.
**Back the other way:** `docker compose exec app npm run vps:export`, copy `export.sql` out with
`docker compose cp app:/app/export.sql .`, then `npx wrangler d1 execute luckywheel --remote --file export.sql`.

**Without Docker** (Node 22.18+ on the server, plus Caddy or nginx for HTTPS in front):

```bash
npm ci && npm run build
ADMIN_PASSWORD=… SESSION_SECRET=… TRUST_PROXY=1 PORT=3000 npm run start:node
```

Run it as a service (systemd / pm2) and point the proxy at `localhost:3000`. Set `TRUST_PROXY=1` **only**
behind a proxy — it makes the app trust the proxy's `X-Forwarded-For` for rate limits.

| | Cloudflare | VPS |
| --- | --- | --- |
| Cost | Free at this size | ~$4–6 / month |
| Upkeep | None | OS updates, backups, restarts are yours |
| HTTPS, DDoS protection | Built in | Caddy (HTTPS); no DDoS protection |
| Where the data lives | Cloudflare | Wherever the server is (e.g. in Mongolia) |

## How it works (the important bits)

- **The server picks the prize.** The browser never sees the odds (`/api/wheel` strips the weights). It sends
  name + phone; the Worker checks the rules, picks the prize with a secure random number, saves it, and
  tells the browser which slice to animate to.
- **No double wins.** Each spin takes a numbered "slot" for that phone (`UNIQUE (phone, slot)` in the
  database), so a double-click or two tabs can't win twice.
- **Limits:** spins per number, wait between spins, daily reset at a set time (Mongolian time, UTC+8 —
  Workers run on UTC, see `UTC_OFFSET_MINUTES`), spins per device per day, 10 spin requests per minute
  per IP, 8 admin login attempts per 15 minutes.
- **Two runtimes, one codebase:** `worker/index.ts` is the whole API. Cloudflare runs it directly;
  on a VPS `server/index.ts` runs the same app on Node and hands it SQLite in place of D1.
- **Admin login:** password from the `ADMIN_PASSWORD` secret; 12-hour session in an HttpOnly, Secure,
  SameSite=Strict cookie signed with `SESSION_SECRET`.
- **Config:** everything the admin saves goes through `sanitizeConfig` (unknown fields dropped, bad values
  replaced with defaults).
- **Tick sound:** tick times are calculated from the same speed curve as the CSS animation (`SPIN_EASING`),
  anchored to the moment the browser starts the animation, and scheduled on the audio clock with the
  speaker delay taken into account — so every tick lands exactly as a divider passes the pointer.

## Data & privacy

- Phone numbers are personal data. Keep the consent checkbox on (it says people agree to be called).
- Only the admin can see the call list. IP addresses are stored for rate limiting but never shown or exported.
- Back up regularly with `npm run db:backup`. D1 also keeps 30 days of history (`npx wrangler d1 time-travel`).
- Never commit `.dev.vars`, `.env`, `backup.sql`, `export.sql`, `backups/`, `data/` or `.wrangler/` (all in `.gitignore`).

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Site says "Серверийн тохиргоо дутуу байна." | `ADMIN_PASSWORD` / `SESSION_SECRET` secrets aren't set (`npx wrangler secret list`) |
| Forgot the admin password | `npx wrangler secret put ADMIN_PASSWORD` (takes effect in seconds) |
| No sound on iPhone | The ring/silent switch mutes website sound — an iOS rule |
| "Хэт олон удаа буруу оролдлоо" | Too many wrong passwords; wait 15 minutes |
| Need to change the database | Add a new numbered file in `migrations/`, then `npm run deploy` (Cloudflare) or restart the app (VPS applies new migrations on start) |
| VPS: no HTTPS / certificate error | The domain's A record must point at the server and ports 80 + 443 must be open; see `docker compose logs caddy` |
| VPS: admin login doesn't stick | You're on `http://` — the login cookie needs HTTPS |
