# Open the real Bayit website on your phone (GitHub Codespaces)

GitHub Codespaces is a free cloud computer that GitHub runs for you. The repository is set up to
start the whole website there, with its own database and the demo listings. You only need your
GitHub account. It works from a phone browser.

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

Phone codes are not sent by SMS in this preview. The login page shows the code on screen
("Development mode — your code is …").

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

## Getting the newest version

When new work is pushed to the branch, open the codespace, open the terminal and run:

```bash
git pull && npm ci && npx prisma db push && npm run db:seed
```

Then reload the page.

## If the page says "502" or "This page isn't working"

The website isn't running yet. Open a terminal in the codespace (the **☰ menu** at the top left →
**Terminal → New Terminal**), type this and press Enter:

```bash
git pull; bash .devcontainer/start.sh
```

It waits for the first-run setup (or runs it), starts the website, and prints **"Bayit is ready:
https://…/he"** when the site answers. Then open that address, or reload the page.

## If something else goes wrong

* **Setup failed:** run `bash .devcontainer/setup.sh` and read the last lines it prints.
* **See what the website is doing:** `tail -50 /tmp/bayit-dev.log`.
* **Login fails with an origin error:** the codespace was renamed or created another way. Delete
  `.env`, then run `bash .devcontainer/setup.sh` and `bash .devcontainer/start.sh`.

This is a preview for you only. For a public website with a real address, follow "Going live" in
the README.
