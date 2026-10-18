import type { Sfx } from '../audio/Sfx';
import type { Profile } from '../game/profile';
import { Account, friendlyError } from '../online/Account';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface AuthDeps {
  account: Account;
  sfx: Sfx;
  /** signed in / guest / offline: continue into Splashburg with the remote profile (if any) */
  onDone(remote: Profile | null): void;
  onBack(): void;
}

export function toast(text: string, bad = false) {
  const el = $('toast');
  el.textContent = text;
  el.classList.toggle('bad', bad);
  el.classList.remove('hidden');
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
}

/** The optional (but recommended!) Splashburg ID screen. */
export class AuthUI {
  private busy = false;

  constructor(private d: AuthDeps) {
    $('tab-signin').onclick = () => this.tab('signin');
    $('tab-signup').onclick = () => this.tab('signup');
    $('form-signin').addEventListener('submit', (e) => {
      e.preventDefault();
      this.signIn();
    });
    $('form-signup').addEventListener('submit', (e) => {
      e.preventDefault();
      this.signUp();
    });
    $('btn-guest').onclick = () => this.guest();
    $('btn-forgot').onclick = () => this.forgot();
    $('btn-auth-back').onclick = () => {
      this.d.sfx.ui();
      this.hide();
      this.d.onBack();
      if (this.d.account.online) $('hub-hud').classList.remove('hidden');
    };
  }

  get open() {
    return !$('auth').classList.contains('hidden');
  }

  show(tab: 'signin' | 'signup' = 'signin') {
    const a = this.d.account;
    const upgrading = a.mode === 'guest';
    $('su-upgrade').classList.toggle('hidden', !upgrading);
    $('su-guest').textContent = a.displayName;
    $('btn-guest').textContent = upgrading ? 'KEEP PLAYING AS GUEST' : 'PLAY AS GUEST';
    $('guest-note').innerHTML = upgrading
      ? `You're <b>${escapeHtml(a.displayName)}</b> right now.`
      : a.configured
        ? "You'll be named <b>Guest0</b>-something. You can sign up later from the plaza!"
        : 'Online accounts are not set up yet, so progress saves in this browser.';
    this.msg(a.configured ? '' : 'Online accounts are not set up yet. Play as a guest for now!', !a.configured);
    this.tab(tab);
    $('hub-hud').classList.add('hidden');
    $('auth').classList.remove('hidden');
  }

  hide() {
    $('auth').classList.add('hidden');
  }

  private tab(t: 'signin' | 'signup') {
    $('tab-signin').classList.toggle('sel', t === 'signin');
    $('tab-signup').classList.toggle('sel', t === 'signup');
    $('form-signin').classList.toggle('hidden', t !== 'signin');
    $('form-signup').classList.toggle('hidden', t !== 'signup');
    $('auth-title').textContent = t === 'signin' ? 'Welcome back, Inkfin!' : 'Get your Splashburg ID!';
    if (this.d.account.configured) this.msg('');
    this.d.sfx.ui();
  }

  private msg(text: string, bad = true) {
    const el = $('auth-msg');
    el.textContent = text;
    el.classList.toggle('hidden', !text);
    el.classList.toggle('ok', !bad);
  }

  private async run(btn: HTMLElement, job: () => Promise<void>) {
    if (this.busy) return;
    this.busy = true;
    btn.classList.add('busy');
    this.msg('');
    try {
      await job();
    } catch (e) {
      this.d.sfx.denied();
      this.msg(friendlyError(e));
    } finally {
      this.busy = false;
      btn.classList.remove('busy');
    }
  }

  private signIn() {
    const user = $<HTMLInputElement>('si-user').value;
    const pass = $<HTMLInputElement>('si-pass').value;
    const btn = $('form-signin').querySelector('button[type=submit]') as HTMLElement;
    this.run(btn, async () => {
      const remote = await this.d.account.signIn(user, pass);
      $<HTMLInputElement>('si-pass').value = '';
      this.d.sfx.coin();
      this.hide();
      toast(`Welcome back, ${this.d.account.displayName || user}!`);
      this.d.onDone(remote);
    });
  }

  private signUp() {
    const user = $<HTMLInputElement>('su-user').value.trim();
    const email = $<HTMLInputElement>('su-email').value.trim();
    const pass = $<HTMLInputElement>('su-pass').value;
    const pass2 = $<HTMLInputElement>('su-pass2').value;
    if (!/^[A-Za-z0-9]{3,20}$/.test(user)) return this.msg('Usernames are 3–20 letters or numbers.');
    if (/^guest0?\d*$/i.test(user)) return this.msg('Pick a name that isn\'t a Guest name!');
    if (pass !== pass2) return this.msg("Those passwords don't match.");
    const btn = $('form-signup').querySelector('button[type=submit]') as HTMLElement;
    this.run(btn, async () => {
      const how = await this.d.account.signUp(user, email, pass);
      $<HTMLInputElement>('su-pass').value = $<HTMLInputElement>('su-pass2').value = '';
      this.d.sfx.coin();
      this.hide();
      toast(how === 'upgraded' ? `You're ${this.d.account.displayName} now. Progress saved!` : `Welcome to Splashburg, ${this.d.account.displayName}!`);
      this.d.onDone(null);
    });
  }

  private guest() {
    const a = this.d.account;
    if (a.mode === 'guest' || !a.configured) {
      this.hide();
      this.d.onDone(null);
      return;
    }
    this.run($('btn-guest'), async () => {
      try {
        const remote = await a.playAsGuest();
        this.hide();
        toast(`Hi, ${a.displayName}!`);
        this.d.onDone(remote);
      } catch (e) {
        // can't reach PlayFab: still let them play, progress stays in this browser
        a.goOffline();
        this.hide();
        toast(`${friendlyError(e)} Playing offline.`, true);
        this.d.onDone(null);
      }
    });
  }

  private forgot() {
    const v = $<HTMLInputElement>('si-user').value.trim();
    if (!v.includes('@')) return this.msg('Type your email above, then press "Forgot your password?" again.');
    this.run($('btn-forgot'), async () => {
      await this.d.account.sendRecovery(v);
      this.msg('Check your email for a reset link!', false);
    });
  }
}

/** The small account panel opened from the plaza profile chip. */
export class AccountPanel {
  constructor(private account: Account, private auth: AuthUI, private sfx: Sfx, private onSignedOut: () => void, private onClose: () => void) {
    $('btn-acct-close').onclick = () => this.close();
    $('btn-acct-signup').onclick = () => {
      $('account').classList.add('hidden');
      this.auth.show(this.account.mode === 'guest' ? 'signup' : 'signin');
    };
    $('btn-acct-signout').onclick = async () => {
      await this.account.signOut();
      this.sfx.ui();
      $('account').classList.add('hidden');
      toast('Signed out. See you soon!');
      this.onSignedOut();
    };
  }

  get open() {
    return !$('account').classList.contains('hidden');
  }

  show() {
    const a = this.account;
    $('acct-name').textContent = a.displayName || '-';
    $('acct-status').textContent = a.mode === 'account' ? `Signed in as ${a.username}` : a.mode === 'guest' ? 'Guest (progress saved online)' : 'Offline (this browser only)';
    $('acct-email').textContent = a.email || '-';
    $('acct-email-row').classList.toggle('hidden', a.mode !== 'account');
    $('btn-acct-signup').classList.toggle('hidden', a.mode === 'account');
    $('btn-acct-signup').textContent = a.mode === 'guest' ? 'SIGN UP (KEEP PROGRESS)' : 'SIGN IN / SIGN UP';
    $('btn-acct-signout').classList.toggle('hidden', a.mode === 'offline');
    $('account').classList.remove('hidden');
    this.sfx.ui();
  }

  close() {
    $('account').classList.add('hidden');
    this.onClose();
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
