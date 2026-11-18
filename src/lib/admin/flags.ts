/**
 * Admin → Flags rules: they live in src/lib/listing/host-flags.ts (the listing lifecycle uses them
 * too, and public pages must not reach src/lib/admin: src/app/stylesheets.test.ts).
 */
export * from "@/lib/listing/host-flags";
