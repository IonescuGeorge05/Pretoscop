# @pretoscop/web

Next.js 16 (App Router): public site, admin, API routes and click-out. Romanian UI.

- `pnpm --filter @pretoscop/web dev` → http://localhost:3000 (reads the repository-root `.env`).
- `pnpm --filter @pretoscop/web test` (Vitest), `e2e` (Playwright, mobile + desktop; needs `next build` first), `lhci` (Lighthouse CI).

## Design rules (M12)

- **Tokens** live in `src/app/globals.css` (`@theme`): teal brand scale (`brand-50…900`), ink/muted/line/surface
  neutrals, and verdict colours `good`, `usual`, `high` (+ `*-bg`). Green/amber/red mean price verdicts and nothing else.
- **Fonts**: system stack only (no web-font download; Romanian diacritics are native). This keeps mobile LCP under 2.5 s.
- **Strings**: `src/messages/ro.json` via `t(key)`; comma-below ș ț only (an e2e test fails on cedilla forms).
- **Formatting**: `src/lib/format.ts` — `formatLei(bani)` → `1.234,56 lei`, `formatLeiShort`, `formatLeiNumeric('3170.99')`,
  `formatDate` (`27 oct. 2026`), `formatDateTime` (`27 oct. 2026, 14:05`, Europe/Bucharest), `formatRelative`
  (`acum 3 ore`, `ieri`), `plural(n, 'magazin', 'magazine')` (`25 de magazine`). Money never goes through floats
  except for display.
- **Images**: `<ProductImage storageKey alt size>` shows our own licensed copy (`images/…` in the blob store; R2 via
  `NEXT_PUBLIC_MEDIA_BASE_URL` in production, `/media/…` in dev) or a neutral placeholder. Never a shop image (ADR-008).
- **Analytics**: `track(name, props)` (client) → `POST /api/events` → `events` table. No cookies, no raw IP: the
  session is sha256(daily rotating salt, IP, UA). Payloads over 4 KB → 413; invalid names → 400; 120 events/min per session.
- **Consent**: `ConsentBanner` with equal Accept/Reject (same style, same size), choice in localStorage
  (`pretoscop.consent`, versioned). Plausible (`NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL` + `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`,
  inlined at build) loads only after Accept; nothing third-party loads before a choice (e2e network assertion).
  `useConsent()` exposes the choice.
- **Static vs dynamic**: pages prerendered at build read env at build time; use `NEXT_PUBLIC_*` for client values.
- **Security headers** in `next.config.ts` (nosniff, referrer policy, frame options, permissions policy). CSP comes with M16/M17.
- **Accessibility**: jsx-a11y recommended rules are errors; skip link; landmarks; visible focus ring.
