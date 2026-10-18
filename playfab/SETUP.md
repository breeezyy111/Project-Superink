# PlayFab setup

SuperInk uses PlayFab for optional accounts. Without it the game still runs, but saves only in the browser.

1. **Create a title** at https://developer.playfab.com (Game Manager) and copy its **Title ID**.
2. **Add the Title ID**: copy `.env.example` to `.env` and set `VITE_PLAYFAB_TITLE_ID=XXXXX`, then restart `npm run dev`.
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
