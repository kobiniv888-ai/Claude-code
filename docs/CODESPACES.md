# Open the real Bayit website on your phone (GitHub Codespaces)

GitHub Codespaces is a free cloud computer that GitHub runs for you. The repository is set up to
start the whole website there, with its own database and the demo listings. You only need your
GitHub account. It works from a phone browser.

**The fast version, in one command:** once the site runs, type
`bash .devcontainer/start-prod.sh` in the codespace terminal (see
[The fast version](#the-fast-version-production-mode)). Same address, the real speed.

## Start it (first time: about 5–8 minutes)

1. On your phone, sign in at **github.com** in the browser (Safari or Chrome, not the GitHub app).
2. Open this link:
   **https://codespaces.new/kobiniv888-ai/Claude-code?ref=claude/website-build-jm62em**

   If the link doesn't work, open the repository on github.com, switch to the branch
   `claude/website-build-jm62em`, tap **Code → Codespaces → Create codespace on
   claude/website-build-jm62em**.
3. Tap **Create codespace**. GitHub picks a 4-core machine, which is included in the free monthly
   hours.
4. A code editor opens and a terminal shows the setup: installing packages, creating the database
   and loading the demo data. Wait until it prints **"Setup finished."**, then
   **"Bayit is starting at https://…"**.
5. Open the **Ports** tab, or the notification "Your application running on port 3000 is
   available", and tap the address for **Bayit website** (port 3000). Add `/he` for Hebrew or `/en`
   for English. The first page takes about a minute to compile; after that it's quick.

The address looks like `https://<name>-3000.app.github.dev/he`. Bookmark it, or use **Add to Home
Screen**. It works only for you while you are signed in to GitHub, because the port is private.

## Log in

Nothing is sent by SMS or email in this preview: the login form shows the code on screen, under a
small "Development mode" (or "Test mode") strip. Log in with your email, or as a demo account: tap
"Log in with a phone code (test mode)" under the email form and use a number below. A new account
is asked for its first name once.

| Phone | Who |
|---|---|
| +995 555 000 021 | Demo guest |
| +995 555 000 011 | Demo owner (has listings in every status) |
| +995 555 000 001 | Demo admin (open `/he/admin`) |

You can also sign up with any other phone number to try posting a listing from scratch. Photo
uploads work, and the files are stored inside the codespace.

## Stop it and start it again

* A codespace stops by itself after 30 minutes without use, and you are not charged while it is
  stopped.
* To come back, go to **github.com/codespaces** and tap the same codespace. The website starts
  again automatically, with your data kept. The address stays the same.
* Free accounts include 120 core-hours a month, which is about 30 hours on this 4-core machine.
  Delete the codespace from github.com/codespaces when you no longer need it.

## Switch the codespace to the redesign branch

Open the terminal in the codespace (the **☰ menu** at the top left → **Terminal → New Terminal**)
and run:

```bash
git fetch origin && git checkout redesign && bash .devcontainer/start.sh
```

`start.sh` updates the database tables, reloads the demo data when it is missing or expired, and
starts the website. If it says a package is missing, run `npm ci` once and then the same
`bash .devcontainer/start.sh` again.

## Getting the newest version

When new work is pushed to the branch, open the codespace, open the terminal and run:

```bash
git pull && npm ci && bash .devcontainer/start.sh
```

Then reload the page.

## Map key (so the maps show streets)

The maps use CARTO's map pictures, which need a free key. Without it the maps still work (pins on
a plain background) and show **"Map key missing"**.

**Get the key (once, about 5 minutes):**
1. Open **https://carto.com/basemaps/apikey** and fill in the short form. Choose commercial use —
   it is free up to 1 million map tiles a month.
2. Copy the key you receive.
3. In the CARTO dashboard, limit the key to your addresses: your production domain (for example
   `bayit.example`) and `*.app.github.dev` (codespaces). Then nobody else can use your key.

**Give it to the codespace — either way works:**
* **Codespaces secret (recommended, survives new codespaces):** github.com → your avatar →
  **Settings → Codespaces → Secrets → New secret**. Name: `NEXT_PUBLIC_MAP_TILE_KEY`, value: the
  key, repository: this one. Restart the codespace (or run `bash .devcontainer/start.sh`): the key
  is copied into `.env` automatically.
* **Directly in `.env`:** open `.env` in the codespace editor, set
  `NEXT_PUBLIC_MAP_TILE_KEY="…"`, save, then restart the website:
  `pkill -f "next dev"; bash .devcontainer/start.sh`.

On Vercel, add the same variable under **Settings → Environment Variables** and redeploy.

## The fast version (production mode)

Development mode compiles every page on its first visit (the round "N" button, "Compiling…",
"Rendering…") and converts photos one at a time, so it feels slow on a phone. To try the site the
way visitors will get it, run **one command** in the codespace terminal:

```bash
bash .devcontainer/start-prod.sh
```

It stops the development server, builds the site (3–5 minutes), starts it in production mode on
the **same port 3000** and prints the address. Open that address on your phone (the same one as
before). Each page now arrives ready-made: no "Compiling…", and the first visit to a page is as
fast as the second. Right after it starts, it prepares the photos of the main pages in the
background (2–3 minutes, log in `/tmp/bayit-warm.log`), so they are sharp at once.

- **Logging in works here too**: `start-prod.sh` turns on test mode (`AUTH_TEST_MODE=true`), so the
  login codes are shown on screen. Test mode only works on the Codespaces address and localhost,
  never on the real domain, and the server log says so loudly while it is on. To see exactly what
  visitors get (no codes on screen): `AUTH_TEST_MODE=false bash .devcontainer/start-prod.sh`.
- Changed some code or switched branch? Run the command again: production mode does not reload
  by itself.
- Back to development mode (hot reload): `bash .devcontainer/start.sh`.
- The build log is in `/tmp/bayit-dev.log`.
- On your own computer the same is `npm run preview` (build, then serve on port 3000).

## If the page says "502" or "This page isn't working"

The website isn't running yet. Open a terminal in the codespace (the **☰ menu** at the top left →
**Terminal → New Terminal**), type this and press Enter:

```bash
git pull; bash .devcontainer/start.sh
```

It waits for the first-run setup (or runs it), starts the website, and prints **"Bayit is ready:
https://…/he"** when the site answers. Then open that address, or reload the page.

## If something else goes wrong

* **The site looks empty (no cities, "0 listings"), or a yellow strip says "Demo data not
  loaded":** run `bash .devcontainer/start.sh` — it reloads the demo data when the database has
  no cities or no public listings (demo listings expire after a few weeks). Or run
  `npm run db:seed` yourself. `node scripts/db-status.mjs` shows what the database contains.
* **Setup failed:** run `bash .devcontainer/setup.sh` and read the last lines it prints. Setup and
  seed output is also kept in `/tmp/bayit-setup.log`.
* **See what the website is doing:** `tail -50 /tmp/bayit-dev.log`.
* **Login says the request was stopped for your safety, or that the connection was blocked:**
  the codespace's port forwarder changed the request. Run `bash .devcontainer/start.sh` (it fixes
  the address in `.env`), restart the website, and reload the page. In development the login form
  also shows a yellow hint with the exact cause.

This is a preview for you only. For a public website with a real address, follow "Going live" in
the README.
