#!/usr/bin/env node
// Makes sure .env has a VAPID key pair for browser notifications (booking alerts, round 3:
// src/lib/alerts/push.ts). Run by .devcontainer/setup.sh and start.sh; safe to run again.
//
// - .env already has both keys → nothing changes (they must stay the same: every device that
//   turned notifications on is tied to the pair).
// - VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are set in the environment (e.g. Codespaces secrets) →
//   those are written to .env.
// - otherwise a new pair is generated (web-push, or node:crypto when packages are not installed
//   yet) and appended.
// Only the NAMES are printed, never a key. The real site needs the same two settings: see
// OWNER_TODO.md ("Browser notifications").
import { createECDH } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), ".env");
if (!fs.existsSync(file)) {
  console.log("[vapid] no .env yet — skipped");
  process.exit(0);
}

const text = fs.readFileSync(file, "utf8");
const valueOf = (name) => {
  const match = text.match(new RegExp(`^${name}=["']?([^"'\\n]*)["']?\\s*$`, "m"));
  return match ? match[1].trim() : "";
};

if (valueOf("VAPID_PUBLIC_KEY") && valueOf("VAPID_PRIVATE_KEY")) process.exit(0);

async function generate() {
  try {
    const webpush = (await import("web-push")).default;
    return webpush.generateVAPIDKeys();
  } catch {
    // Same format as web-push: an uncompressed P-256 public key and the raw private key, base64url.
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    return { publicKey: ecdh.getPublicKey().toString("base64url"), privateKey: ecdh.getPrivateKey().toString("base64url") };
  }
}

const fromEnv = process.env.VAPID_PUBLIC_KEY?.trim() && process.env.VAPID_PRIVATE_KEY?.trim();
const keys = fromEnv
  ? { publicKey: process.env.VAPID_PUBLIC_KEY.trim(), privateKey: process.env.VAPID_PRIVATE_KEY.trim() }
  : await generate();

// Replace empty lines of the same name (from .env.example), then append.
const kept = text
  .split("\n")
  .filter((line) => !/^VAPID_(PUBLIC|PRIVATE)_KEY=/.test(line))
  .join("\n")
  .replace(/\n*$/, "\n");
const block = `# Browser notifications (scripts/ensure-vapid.mjs): keep this pair; the real site needs the same one.\nVAPID_PUBLIC_KEY="${keys.publicKey}"\nVAPID_PRIVATE_KEY="${keys.privateKey}"\n`;
fs.writeFileSync(file, `${kept}${block}`);
console.log(fromEnv ? "[vapid] copied VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY into .env" : "[vapid] generated VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env");
