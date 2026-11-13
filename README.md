# Азын хүрд (Lucky Wheel)

A standalone spin-to-win site in Mongolian. Visitors enter their **name and phone number**, spin the wheel,
and win a discount, free delivery, a cash prize, or nothing. The owner gets a call list in the admin
to phone people back later.

- **Frontend:** React + Vite (`src/`)
- **Backend:** Node.js + Express (`server/`), SQLite database (Node's built-in `node:sqlite`, one file in `data/`)
- Needs **Node.js 24 or newer** (the server runs TypeScript directly, no build step).

## Run it locally

```bash
npm install
cp .env.example .env      # then set ADMIN_PASSWORD (10+ characters) and SESSION_SECRET
npm run dev               # API on :3001 + site on http://localhost:5173
```

- `/` is the wheel visitors see.
- `/#/admin` is the admin (password from `.env`). Nothing on the public page links to it.

## Deploy

```bash
npm install
npm run build             # type-checks and builds the site into dist/
npm start                 # one process serves the API and the site on PORT
```

In `.env` on the server set `NODE_ENV=production`, a strong `ADMIN_PASSWORD`, a random `SESSION_SECRET`,
and `TRUST_PROXY=1` if it runs behind nginx or a load balancer. Serve it over **HTTPS** (admin cookies are
secure-only in production). **Back up `data/luckywheel.db`**: it holds all phone numbers, codes and notes.

## How a spin works

1. The page loads the wheel from `GET /api/wheel` (names and colors only, never the odds).
2. The visitor submits name + phone. `POST /api/spin` checks the number (8-digit Mongolian, `+976` optional),
   the per-number limit, the wait time, the per-IP daily limit and a 10-per-minute burst limit, then picks
   the prize **on the server** and saves it, all in one transaction (double-clicks can't win twice).
3. The browser only animates the wheel to the slice the server chose and shows the code.

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
| GET | `/api/admin/session` · POST `/login` · POST `/logout` | admin session (HttpOnly cookie) |
| GET / PUT | `/api/admin/config` · POST `/api/admin/config/reset` | settings, prizes, design |
| GET / DELETE | `/api/admin/spins` | all spins / delete everything |
| GET · PUT | `/api/admin/contacts` · `/api/admin/contacts/:phone` | call-back status and notes |
| GET · POST | `/api/admin/coupons/:code` · `/api/admin/coupons/:code/redeem` | check / mark a code used |

## Notes

- Phone numbers are personal data. The consent checkbox text says people agree to be called; keep it on.
- Codes are only shown on screen (no SMS is sent). An SMS gateway could be added in `server/index.ts` after a win.
- SQLite fits a single server comfortably. For several servers, move to PostgreSQL (all queries live in `server/db.ts`).
