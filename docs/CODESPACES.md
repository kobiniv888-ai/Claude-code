# Open the real Bayit website on your phone (GitHub Codespaces)

GitHub Codespaces is a free cloud computer that GitHub runs for you. The repository is set up to
start the whole website there, with its own database and the demo listings. You only need your
GitHub account. It works from a phone browser.

**One command, one link.** The codespace starts the **fast version** by itself every time it
opens. To start it by hand (after a `git pull`, or if a page says "502"), type this in the
codespace terminal:

```bash
bash .devcontainer/start-prod.sh
```

and open the address it prints at the end: the one ending in **`-3000.app.github.dev/he`**, for
example `https://<your-codespace-name>-3000.app.github.dev/he`. Bookmark it; it stays the same.

If a page shows a thin strip **"גרסת פיתוח (איטית). לגרסה המהירה: bash .devcontainer/start-prod.sh"**,
you are on the slow development version: run the command above and reload.

## Start it (first time: about 5–8 minutes)

1. On your phone, sign in at **github.com** in the browser (Safari or Chrome, not the GitHub app).
2. Open this link:
   **https://codespaces.new/kobiniv888-ai/Claude-code?ref=round-3**

   If the link doesn't work, open the repository on github.com, switch to the branch
   `round-3`, tap **Code → Codespaces → Create codespace on round-3**.
3. Tap **Create codespace**. GitHub picks a 4-core machine, which is included in the free monthly
   hours.
4. A code editor opens and a terminal shows the setup: installing packages, creating the database
   and loading the demo data. Wait until it prints **"Setup finished."**. Then the codespace builds
   the fast version (3–5 minutes) and prints **"Bayit is ready (the fast version). Open this
   address on your phone:"** with the address under it.
5. Open that address. It ends in **`-3000.app.github.dev/he`** (`/en` for English). You can also
   open the **Ports** tab and tap the address for **Bayit website** (port 3000), then add `/he`.

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
* To come back, go to **github.com/codespaces** and tap the same codespace. The fast version starts
  again by itself, with your data kept (in seconds when the code is the same as last time; it
  builds again only after new code). The address stays the same.
* Free accounts include 120 core-hours a month, which is about 30 hours on this 4-core machine.
  Delete the codespace from github.com/codespaces when you no longer need it.

## Switch the codespace to the newest work (round 3)

Open the terminal in the codespace (the **☰ menu** at the top left → **Terminal → New Terminal**)
and run:

```bash
git fetch origin && git checkout round-3 && git pull && bash .devcontainer/start-prod.sh
```

If git says your local changes would be overwritten, run `git stash` first and then the same line
again.

`start-prod.sh` (through `start.sh --prod`) installs packages when the package list changed, updates
the database code and tables, reloads the demo data when it is missing, expired or from an older
version, builds the fast version when the code changed, and starts it.

## Getting the newest version

When new work is pushed to the branch, open the codespace, open the terminal and run:

```bash
git pull && bash .devcontainer/start-prod.sh
```

Then reload the page.

`git pull` may say **"Already up to date"**: that only means there was nothing new to download
since your last pull. A running **fast version never shows new code** until it is rebuilt:
`start-prod.sh` sees that the code changed and builds again (`--rebuild` builds even when it did
not). Plain `bash .devcontainer/start.sh` keeps whatever is running, and starts the fast version
when nothing is. `bash .devcontainer/start.sh --dev` switches to the slow development version (for
programmers; every page then shows the "גרסת פיתוח" strip).

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
  `bash .devcontainer/start-prod.sh` (or `bash .devcontainer/start.sh --dev`).

On Vercel, add the same variable under **Settings → Environment Variables** and redeploy.

## Other keys (translation, email, Google login, SMS)

They work the same way as the map key: add a **Codespaces secret** with the exact name and restart
the codespace. `start.sh` copies these names into `.env`: `GOOGLE_TRANSLATE_API_KEY`,
`AZURE_TRANSLATOR_KEY`, `AZURE_TRANSLATOR_REGION`, `RESEND_API_KEY`, `EMAIL_FROM`,
`RESEND_WEBHOOK_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`, `TWILIO_MESSAGING_SERVICE_SID`,
`TWILIO_FROM_NUMBER`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`,
and the private admin settings `BAYIT_ADMIN_EMAIL`, `BAYIT_ADMIN_PHONE` and `ADMIN_ALERT_EMAIL`
(only the names are printed, never a value). Where to get each one and what it costs:
`OWNER_TODO.md`.

**Your admin account:** set `BAYIT_ADMIN_EMAIL` (the email you sign in with; or
`BAYIT_ADMIN_PHONE`) and `ADMIN_ALERT_EMAIL` (where admin alerts go) as Codespaces secrets, sign
in on the site once with that account, and restart the codespace: the start makes the account
admin (`npm run admin:grant -- --from-env`). The first visit to `/admin` asks you to set up Google
Authenticator; that is required for your account, also in the codespace.

With `GOOGLE_TRANSLATE_API_KEY` set, every start also translates the listings that are still
missing languages (`npm run translate:missing` does the same by hand).

## Approving listings (the review queue)

A new listing waits "In review" until a moderator approves it:
1. Log in as the demo admin: phone **+995 555 000 001** (the code shows on screen in the codespace).
2. Open the menu (☰) → **Admin panel** → **Moderation** (or go to `/en/admin/moderation`).
3. Tap the listing → **Approve** → **Approve and publish**. It goes live, it is translated if a
   translation key is set, and the owner gets an email.

**2-step login for staff.** The admin panel needs 2-step login (an authenticator app such as Google
Authenticator), as on the real site. The **development version** (`bash .devcontainer/start.sh --dev`)
skips it for the demo accounts, so approving there needs no app. In the **fast version**
(`start-prod.sh`) the admin panel first asks you to set up the app once (scan the QR code, type the
6-digit code).

To approve with your own account instead: as the demo admin, open **Admin panel → Roles**, find
your account by phone or email and give it the **Admin** (or **Moderator**) role.

**Why the first login can take minutes in the development version:** it builds every page the
first time someone opens it, and a codespace is slow at that (the login, the signed-in pages and
the admin panel are each built on first use). `start.sh --dev` now opens the main pages in the
background right after it starts. Wait until `tail /tmp/bayit-warm.log` says **"Main pages ready"**
(1–4 minutes), then log in: it takes seconds. Built pages are kept, so later starts are faster.
The fast version (`start-prod.sh`) is built in advance, so its logins are always quick; there the
admin panel asks for the authenticator app (see above).

## The fast version (production mode)

Development mode compiles every page on its first visit (the round "N" button, "Compiling…",
"Rendering…") and converts photos one at a time, so it feels slow on a phone. To try the site the
way visitors will get it, run **one command** in the codespace terminal:

```bash
bash .devcontainer/start-prod.sh
```

It stops the development server, builds the site when the code changed (3–5 minutes; otherwise
it starts in seconds), starts it in production mode on the **same port 3000** and prints the
address, ending in `-3000.app.github.dev/he`. Open that address on your phone (the same one as
before). The codespace also runs this command by itself every time it starts. Each page now arrives ready-made: no "Compiling…", and the first visit to a page is as
fast as the second. Right after it starts, it prepares the photos of the main pages in the
background (2–3 minutes, log in `/tmp/bayit-warm.log`), so they are sharp at once.

- **Logging in works here too**: `start-prod.sh` turns on test mode (`AUTH_TEST_MODE=true`), so the
  login codes are shown on screen. Test mode only works on the Codespaces address and localhost,
  never on the real domain, and the server log says so loudly while it is on. To see exactly what
  visitors get (no codes on screen): `AUTH_TEST_MODE=false bash .devcontainer/start-prod.sh`.
- Changed some code or switched branch? Run the command again: production mode does not reload
  by itself (it builds again only when something changed; `--rebuild` forces a build).
- Back to development mode (hot reload): `bash .devcontainer/start.sh --dev`.
- The build log is in `/tmp/bayit-dev.log`.
- On your own computer the same is `npm run preview` (build, then serve on port 3000).

## If the page says "502" or "This page isn't working"

The website isn't running yet. Open a terminal in the codespace (the **☰ menu** at the top left →
**Terminal → New Terminal**), type this and press Enter:

```bash
git pull; bash .devcontainer/start-prod.sh
```

It waits for the first-run setup (or runs it), starts the fast version, and prints **"Bayit is
ready"** with the address (ending in `-3000.app.github.dev/he`) when the site answers. Then open
that address, or reload the page.

## If something else goes wrong

* **The site looks empty (no cities, "0 listings"), or a yellow strip says "Demo data not
  loaded":** run `bash .devcontainer/start-prod.sh` — it reloads the demo data when the database has
  no cities or no public listings (demo listings expire after a few weeks). Or run
  `npm run db:seed` yourself. `node scripts/db-status.mjs` shows what the database contains.
* **Setup failed:** run `bash .devcontainer/setup.sh` and read the last lines it prints. Setup and
  seed output is also kept in `/tmp/bayit-setup.log`.
* **See what the website is doing:** `tail -50 /tmp/bayit-dev.log`.
* **Login says the request was stopped for your safety, or that the connection was blocked:**
  the codespace's port forwarder changed the request. Run `bash .devcontainer/start-prod.sh` (it
  fixes the address in `.env` and builds again when the address changed), then reload the page. In
  the development version the login form also shows a yellow hint with the exact cause.

This is a preview for you only. For a public website with a real address, follow "Going live" in
the README.
