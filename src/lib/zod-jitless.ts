/**
 * zod 4 compiles object schemas with `new Function()` unless `jitless` is set, and checks for
 * that once by calling `Function("")`. Our Content-Security-Policy has no 'unsafe-eval', so that
 * check is reported as a CSP violation on every page with a form (listing, owner, contact…).
 *
 * The root layout has Next.js run this before any app module (a "beforeInteractive" script,
 * executed by Next.js' own bootstrap before it loads the page's modules): zod reads its shared config object
 * (`globalThis.__zod_globalConfig`, the one `z.config()` writes) when it loads, and schema
 * modules read `jitless` when they are defined, which is too early for a `z.config()` call in
 * one of them. Server code is not affected.
 */
export const ZOD_JITLESS_SCRIPT =
  "globalThis.__zod_globalConfig=Object.assign(globalThis.__zod_globalConfig||{},{jitless:true});";
