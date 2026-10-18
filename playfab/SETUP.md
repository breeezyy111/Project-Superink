# PlayFab setup

SuperInk uses PlayFab for optional accounts. If PlayFab can't be reached, the game still runs and saves only in the browser.

1. **Title ID**: SuperInk's title is **`90E97`**, built into `src/online/PlayFab.ts`.
   To point at a different (e.g. test) title, copy `.env.example` to `.env`, set `VITE_PLAYFAB_TITLE_ID=XXXXX`, and restart `npm run dev`.
   The Title ID is public. Never put the **Developer Secret Key** in the game or the repo.
3. **Upload the CloudScript** in `playfab/cloudscript.js`: Game Manager > Automation > CloudScript >
   Revisions (Legacy) > Upload new revision, then tick **Deploy**. This gives guests their
   `Guest01`, `Guest02`, ... names.
4. **Check API settings**: Title settings > API Features. "Allow client to execute CloudScript" must be on.
   It's on by default.

## How accounts work

- **Play as Guest**: a PlayFab account tied to this browser, named `Guest0` + the guest's number
  (`Guest01`, `Guest02`, ... `Guest09`, `Guest010`, ...).
- **Sign Up** (username + email + password): if you were a guest, your guest account is upgraded, so
  you keep your coins, gear and level.
- **Sign In** with a username or email on any device. The game remembers you on this browser until you sign out.
- Progress (look, gear, coins, XP, level, settings) is saved to PlayFab player data.

Note: coins and XP are currently saved by the client, so a determined player could edit them. Moving
the economy to PlayFab virtual currency with CloudScript-granted rewards would make it cheat-proof.
