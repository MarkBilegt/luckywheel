# Lucky Wheel (React)

A standalone spin-to-win site. Visitors enter their email, spin the wheel, and win a discount,
free shipping, store credit, or nothing. Everything is managed from the admin section.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

- `/` is the wheel page visitors see.
- `/#/admin` is the admin section. Nothing on the public page links to it.

## Admin

- **Prizes & odds:** up to 20 slices; % off, fixed amount off, free shipping, cash/store credit, or nothing; weighted odds with the live win chance; one-click color palettes.
- **Rules & form:** turn the wheel on/off (off shows a "Back soon" message); spins per email, wait between spins, daily reset at a set time, spin duration; name and phone each hidden/optional/required; GDPR consent checkbox with a link; all text; coupon prefix and validity.
- **Design:** full or half wheel, pointer top/right/bottom/center, wheel size, label size, all colors, center logo, page background color/image, font, background effects (snow, stars, bubbles, hearts), win effects (confetti, fireworks, star burst), custom CSS.
- **Subscribers:** everyone who spun, with search and CSV export by date range.
- **Report:** subscribers, spins, coupons and win rate for a date range, broken down by prize.
- **Test unsaved changes:** try the wheel with your edits before saving; test spins aren't recorded.

## Before going live

Everything is stored in the visitor's browser (`localStorage`) so it runs without a server. That means:

- **Each browser has its own settings and subscribers.** Changes made in the admin only show up in that same browser,
  and subscribers collected on visitors' phones never reach the admin. A real deployment needs a small backend
  and database; all data access is in `src/lib/api.ts`, so only that file needs to change.
- **Prize selection and spin limits must run on the server.** Anything decided in the browser can be faked from the dev tools.
- **The admin has no login.** Add one on the server before going live.
- Coupons need to exist wherever they're redeemed (your shop or till system) to be accepted.
- Not built (needs a server): emailing the coupon to winners, syncing to Mailchimp/Klaviyo/etc., reCAPTCHA.
