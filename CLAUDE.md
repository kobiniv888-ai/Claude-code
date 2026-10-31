# Bayit — notes for AI coding agents

Bayit is a multilingual (he/en/ru/ar/ka, Hebrew main, RTL for he/ar) home-listing site for Georgia
(the country) for Jewish travelers, families, investors and owners. The product brief is
`docs/BRIEF.md`; the plan is `docs/PLAN.md`.

**Before writing code, read `docs/CONVENTIONS.md`** — it defines the stack, folder layout, module
contracts, translation rules, RTL rules, roles and the listing lifecycle. Follow it exactly.

The most important rules:
- No hard-coded UI text: everything in `messages/<locale>/<namespace>.json`, all 5 languages.
- Logical CSS only (`ms/me/ps/pe/start/end`), `rtl:-scale-x-100` on directional icons, `<Ltr>` for
  phones/prices/IDs, `dir="auto"` on user text, numbers/dates via `@/lib/format` (Western digits).
- `Link`/`redirect`/`useRouter` from `@/i18n/navigation`.
- Every mutation checks session + ownership, validates with zod, rate-limits public endpoints;
  staff actions call `audit()`.
- Lucide icons only, never emojis. Designed loading/empty/error states. Mobile first (360px).
- Next.js 16: `src/proxy.ts` (not middleware), async `params`/`searchParams`/`cookies()`/`headers()`.
  Bundled docs in `node_modules/next/dist/docs/`.
- Never invent real places, reviews or testimonials. Demo data has `isDemo: true`.
