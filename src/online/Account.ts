import type { Profile } from '../game/profile';
import { LoginResult, PlayFabClient, PlayFabError } from './PlayFab';

/**
 * Who you are in Splashburg.
 *  - guest:   a PlayFab account tied to this browser, named Guest01, Guest02, ...
 *  - account: a PlayFab account with username + email + password (works on any device)
 *  - offline: PlayFab isn't set up or reachable; progress stays in this browser only
 */
export type AccountMode = 'guest' | 'account' | 'offline';

const KEY_DEVICE = 'superink.deviceId';
const KEY_SESSION = 'superink.session';
const KEY_GUEST_HINT = 'superink.guestHint';

/** Guest names are always "Guest0" + the guest's number: Guest01, Guest02, ... Guest010, ... */
const guestName = (n: number) => `Guest0${n}`;
const guestNumber = (name: string) => parseInt(name.replace(/^Guest0/, ''), 10) || 0;

interface SavedSession {
  mode: 'guest' | 'account';
  /** account mode: a private id linked to the account so we can sign back in without the password */
  rememberId?: string;
}

function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage blocked: you'll just have to sign in again next time */
  }
}

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Friendly messages for the PlayFab errors players will actually hit. */
export function friendlyError(e: unknown): string {
  if (!(e instanceof PlayFabError)) return 'Something went wrong. Try again!';
  switch (e.code) {
    case 'AccountNotFound': return "We couldn't find that Inkfin. Check the name, or sign up!";
    case 'InvalidUsernameOrPassword':
    case 'InvalidEmailOrPassword': return "That password doesn't match. Try again!";
    case 'UsernameNotAvailable': return 'That username is taken. Try another one!';
    case 'EmailAddressNotAvailable': return 'That email already has an account. Try signing in!';
    case 'NameNotAvailable': return 'That name is taken. Try another one!';
    case 'InvalidUsername': return 'Usernames are 3–20 letters or numbers.';
    case 'InvalidEmailAddress': return "That email doesn't look right.";
    case 'InvalidPassword': return 'Passwords need 6–100 characters.';
    case 'ProfaneDisplayName': return "Let's keep names fresh and friendly!";
    case 'APIRequestsDisabledForTitle':
    case 'NotConfigured': return 'Online play is not set up yet.';
    case 'Network': return e.message;
    default:
      if (e.details) {
        const first = Object.values(e.details)[0];
        if (first?.length) return first[0];
      }
      return e.message || 'Something went wrong. Try again!';
  }
}

export class Account {
  readonly pf = new PlayFabClient();
  mode: AccountMode = 'offline';
  username = '';
  email = '';
  displayName = '';
  /** the guest name could not be assigned yet (e.g. CloudScript missing); retried on next login */
  guestNamePending = false;
  private syncTimer: number | null = null;
  private lastSynced = '';
  onChange: (() => void) | null = null;

  get online() {
    return this.mode !== 'offline';
  }

  get configured() {
    return this.pf.configured;
  }

  /** Did the player already choose (guest or account) on this device? */
  get hasSavedSession() {
    return read(KEY_SESSION) !== null;
  }

  private deviceId() {
    let id = read(KEY_DEVICE);
    if (!id) {
      id = `superink-${uuid()}`;
      store(KEY_DEVICE, id);
    }
    return id;
  }

  /** Quietly sign back in the way the player did last time. Returns the remote profile, if any. */
  async resume(): Promise<Profile | null> {
    const raw = read(KEY_SESSION);
    if (!raw || !this.configured) return null;
    let s: SavedSession;
    try {
      s = JSON.parse(raw);
    } catch {
      return null;
    }
    if (s.mode === 'guest') return this.playAsGuest();
    if (s.mode === 'account' && s.rememberId) {
      try {
        const r = await this.pf.loginWithCustomId(s.rememberId, false);
        return this.adopt(r, 'account');
      } catch (e) {
        if (e instanceof PlayFabError && e.code === 'AccountNotFound') store(KEY_SESSION, null);
        throw e;
      }
    }
    return null;
  }

  async playAsGuest(): Promise<Profile | null> {
    const r = await this.pf.loginWithCustomId(this.deviceId(), true);
    const remote = this.adopt(r, 'guest');
    store(KEY_SESSION, JSON.stringify({ mode: 'guest' } satisfies SavedSession));
    // brand-new guests (or ones whose name never got set) get the next GuestNN name
    if (r.NewlyCreated || !/^Guest0\d+$/.test(this.displayName)) await this.assignGuestName();
    return remote;
  }

  /**
   * Give a new guest the next GuestNN name (Guest01, Guest02, ...).
   * Uses the title's CloudScript counter if one is deployed; otherwise finds the next free
   * number itself by looking names up (works with zero server setup).
   */
  private async assignGuestName() {
    let useScript = true;
    let from = 1;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        let name: string;
        if (useScript) {
          try {
            const res = await this.pf.cloudScript<{ name: string }>('assignGuestName', { retry: attempt > 0 });
            if (!res?.name) throw new PlayFabError('NoName', 'CloudScript returned no name');
            name = res.name;
          } catch (e) {
            if (e instanceof PlayFabError && e.code === 'Network') throw e;
            // no CloudScript on this title (or it failed): fall back to finding the number ourselves
            useScript = false;
            name = guestName(await this.nextFreeGuestNumber(from));
          }
        } else {
          name = guestName(await this.nextFreeGuestNumber(from));
        }
        await this.pf.setDisplayName(name);
        this.displayName = name;
        this.guestNamePending = false;
        store(KEY_GUEST_HINT, String(guestNumber(name)));
        return;
      } catch (e) {
        // someone grabbed the same number at the same moment: take the next one
        if (e instanceof PlayFabError && e.code === 'NameNotAvailable') {
          from = Math.max(from, (parseInt(read(KEY_GUEST_HINT) ?? '0', 10) || 0)) + 1;
          continue;
        }
        console.warn('[SuperInk] Could not assign a guest name:', e);
        break;
      }
    }
    this.guestNamePending = true;
    if (!this.displayName) this.displayName = 'Guest';
  }

  /** Is GuestNN already somebody's display name? */
  private async guestTaken(n: number) {
    try {
      await this.pf.findByDisplayName(guestName(n));
      return true;
    } catch (e) {
      if (e instanceof PlayFabError && e.code === 'AccountNotFound') return false;
      throw e;
    }
  }

  /**
   * Smallest free guest number at or after the taken prefix, found with a doubling search then a
   * binary search, so the 1,000th guest needs about 20 lookups instead of 1,000.
   */
  private async nextFreeGuestNumber(from = 1) {
    const hint = Math.max(from, parseInt(read(KEY_GUEST_HINT) ?? '1', 10) || 1);
    let lo = from - 1; // known taken (0 = "none")
    let hi: number; // known free
    if (!(await this.guestTaken(hint))) {
      hi = hint;
    } else {
      lo = hint;
      let step = Math.max(1, hint);
      hi = hint + step;
      while (await this.guestTaken(hi)) {
        lo = hi;
        step *= 2;
        hi = lo + step;
      }
    }
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (await this.guestTaken(mid)) lo = mid;
      else hi = mid;
    }
    return hi;
  }

  async signIn(nameOrEmail: string, password: string): Promise<Profile | null> {
    const r = nameOrEmail.includes('@')
      ? await this.pf.loginWithEmail(nameOrEmail.trim(), password)
      : await this.pf.loginWithUsername(nameOrEmail.trim(), password);
    const remote = this.adopt(r, 'account');
    await this.remember();
    return remote;
  }

  /**
   * Sign up. A signed-in guest is upgraded in place (keeps coins, gear and level);
   * otherwise a fresh account is registered.
   */
  async signUp(username: string, email: string, password: string): Promise<'upgraded' | 'created'> {
    username = username.trim();
    email = email.trim();
    let result: 'upgraded' | 'created';
    if (this.mode === 'guest' && this.pf.ticket) {
      await this.pf.addUsernamePassword(username, email, password);
      result = 'upgraded';
    } else {
      await this.pf.register(username, email, password);
      result = 'created';
    }
    this.mode = 'account';
    this.username = username;
    this.email = email;
    try {
      await this.pf.setDisplayName(username);
      this.displayName = username;
    } catch {
      /* keep the old display name if the username is taken as a display name */
    }
    await this.remember();
    this.onChange?.();
    return result;
  }

  async sendRecovery(email: string) {
    await this.pf.sendRecoveryEmail(email.trim());
  }

  /** Link a private random id to this account so the next visit signs in automatically. */
  private async remember() {
    const rememberId = `superink-remember-${uuid()}`;
    try {
      await this.pf.linkCustomId(rememberId);
      store(KEY_SESSION, JSON.stringify({ mode: 'account', rememberId } satisfies SavedSession));
    } catch (e) {
      console.warn('[SuperInk] Could not remember this sign-in:', e);
    }
  }

  async signOut() {
    const raw = read(KEY_SESSION);
    try {
      const s: SavedSession | null = raw ? JSON.parse(raw) : null;
      if (s?.mode === 'account' && s.rememberId && this.pf.ticket) await this.pf.unlinkCustomId(s.rememberId);
    } catch {
      /* best effort */
    }
    store(KEY_SESSION, null);
    this.pf.logout();
    this.mode = 'offline';
    this.username = this.email = this.displayName = '';
    this.onChange?.();
  }

  goOffline() {
    this.mode = 'offline';
    this.onChange?.();
  }

  private adopt(r: LoginResult, mode: 'guest' | 'account'): Profile | null {
    this.mode = mode;
    const info = r.InfoResultPayload?.AccountInfo;
    this.username = info?.Username ?? '';
    this.email = info?.PrivateInfo?.Email ?? '';
    this.displayName = info?.TitleInfo?.DisplayName ?? '';
    this.onChange?.();
    const raw = r.InfoResultPayload?.UserData?.profile?.Value;
    if (!raw) return null;
    try {
      this.lastSynced = raw;
      return JSON.parse(raw) as Profile;
    } catch {
      return null;
    }
  }

  /** Change the in-game name (it's the PlayFab display name, so it must be unique). */
  async rename(name: string) {
    if (!this.online) return name;
    const r = await this.pf.setDisplayName(name);
    this.displayName = r.DisplayName ?? name;
    this.onChange?.();
    return this.displayName;
  }

  /** Save progress to the cloud, batched so rapid changes become one request. */
  queueSync(p: Profile) {
    if (!this.online) return;
    if (this.syncTimer !== null) clearTimeout(this.syncTimer);
    this.syncTimer = window.setTimeout(() => {
      this.syncTimer = null;
      const json = JSON.stringify(p);
      if (json === this.lastSynced) return;
      this.pf.saveUserData({ profile: json }).then(
        () => (this.lastSynced = json),
        (e) => console.warn('[SuperInk] Cloud save failed:', e),
      );
    }, 1500);
  }
}
