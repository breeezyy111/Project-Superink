# PlayFab setup

SuperInk uses PlayFab for optional accounts. If PlayFab can't be reached, the game still runs and saves only in the browser.

1. **Title ID**: SuperInk's title is **`90E97`**, built into `src/online/PlayFab.ts`.
   To point at a different (e.g. test) title, copy `.env.example` to `.env`, set `VITE_PLAYFAB_TITLE_ID=XXXXX`, and restart `npm run dev`.
   The Title ID is public. Never put the **Developer Secret Key** in the game or the repo.
3. **Nothing else is required.** Guest names (`Guest01`, `Guest02`, ...) work out of the box. The game
   asks PlayFab which `Guest0N` display names are already taken, using a doubling then binary search
   (about 2×log₂(N) lookups), and claims the next free one. If two guests try to take the same number at
   once, PlayFab's unique display names make one of them retry with the next number.
4. **Optional: CloudScript counter.** If your title has *Automation > CloudScript > Revisions (Legacy)*,
   you can upload `playfab/cloudscript.js` and deploy it. The game then uses that counter instead, which
   takes one call instead of several lookups. Newer titles often don't have Legacy CloudScript, and that's fine.

## How accounts work

- **Play as Guest**: a PlayFab account tied to this browser, named `Guest0` + the guest's number
  (`Guest01`, `Guest02`, ... `Guest09`, `Guest010`, ...).
- **Sign Up** (username + email + password): if you were a guest, your guest account is upgraded, so
  you keep your coins, gear and level.
- **Sign In** with a username or email on any device. The game remembers you on this browser until you sign out.
- Progress (look, gear, coins, XP, level, settings) is saved to PlayFab player data.

Note: coins and XP are currently saved by the client, so a determined player could edit them. Moving
the economy to PlayFab virtual currency with CloudScript-granted rewards would make it cheat-proof.
