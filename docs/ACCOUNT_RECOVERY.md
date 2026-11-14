# Account recovery: what support may and may not do

SECURITY_REPORT 3.7.c–3.7.e (checklist 3.7 "Two-factor and recovery"). The founder's decisions of
8 November 2026 apply (decision 5: the email code only resets the 2-step counter).

**The rule: support never moves an account, changes its login, or turns off its 2-step login
because someone asks.** Taking over hotel and host accounts by talking to support is how the 2026
Booking.com fraud wave worked. The site has no admin tool that resets 2-step login or changes a
login address, on purpose. People recover their accounts themselves, with something only they have.

## What the account owner can do alone

| Lost | How they get back in | What happens |
|---|---|---|
| The phone with the authenticator app | Log in with an email code, then on /two-factor choose "No access to your app? Use a recovery code" and enter one of the 10 recovery codes saved at setup | The code is used up. The account gets an email ("A recovery code was used"), the use is in the audit log (`auth.recovery`) and the security event log (`recovery_code_used`); for staff the founder is emailed too. Then Settings → Security → "Move to a new phone" (a fresh code first). |
| The recovery codes (but still has the app) | Settings → Security → "New codes" (a fresh code first) | The old set stops working at once; the account is emailed. |
| 20 wrong 2-step codes today ("locked") | On /two-factor: "Email me a code" | The email code ONLY resets the counter. Logging in still needs the app code or a recovery code. |
| The email inbox | Nothing changes by itself. If they still have a session, Settings → contact email (a fresh code, then a code to the new address). | The old address is told. |

## When someone has lost everything (app, recovery codes, or the inbox)

Support can only point to the steps above. If none works:

1. **Proof.** The person must show BOTH: a 6-digit code sent to the account's login email address
   (support asks them to request one on /two-factor and read it back) AND a code sent by SMS to the
   account's verified phone number. Support never accepts a selfie, an ID photo, a phone call, a
   "booking confirmation" or a message from another address as proof.
2. **24-hour wait.** After the proof, wait 24 hours. During the wait, email the account's addresses
   and say what was asked and how to stop it ("If this wasn't you, reply now").
3. **Only an ADMIN** may then act, and only with a database change done by the founder (there is no
   button for it). The change and the reason are written to the audit log, and the account is
   emailed again afterwards.
4. **Staff accounts:** never recovered by support. The founder grants the role again with
   `npm run admin:grant` after checking in person.

## For a future "reset 2-step login" tool

If one is ever built: ADMIN only, a fresh authenticator code from the admin who uses it, the proof
and the 24-hour wait above, an audit row (`auth.recovery`) that stops the action if it cannot be
written, a security event, and an email to every address of the account. It is not built now.
