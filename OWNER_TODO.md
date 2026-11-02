# Things only you can do or decide

This list is kept up to date as the work goes on. It was last updated during redesign round 2.

## Content and wording
- [ ] Review the About page story in Hebrew and English (and the other translations), then replace
      `[השם שלכם]` / `[Your name]` with your name.
- [ ] Review the Hebrew notes in `docs/redesign/hebrew-notes.md`.

## Real data
- [ ] Real community places (synagogues, Chabad houses, kosher restaurants and shops): name,
      address, coordinates, the date you checked it and your source. Add them in
      **Admin → Content → Places**. Demo places stay marked "(דמו)", and they are never used for
      walking times on real listings.
- [ ] Your own photos: see `PHOTOS_NEEDED.md`.

## Legal
- [ ] Company name, registration number and address, to replace the visible placeholders such as
      `[שם החברה, מספר הרישום והכתובת]`.
- [ ] A lawyer's review of the Terms of use (booking rules) and the Privacy policy. Both are marked
      as drafts.

## Services and keys
- [ ] **CARTO map key.** Confirm it is registered for commercial use (free up to 1 million tiles a
      month), then add it as the Codespaces secret `NEXT_PUBLIC_MAP_TILE_KEY` (and on Vercel later).
- [ ] **SMS (Twilio).** You need this for the login codes on the real site and for booking text
      messages.
- [ ] **Email (Resend).** You need this for booking confirmations, reminders and cancellations.
      Until it's set up, emails only appear in Admin → Email outbox.
