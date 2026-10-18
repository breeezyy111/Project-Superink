/**
 * Minimal PlayFab Client API wrapper over REST (no SDK needed).
 * Only the public Title ID lives in the client. Never put the developer secret key here.
 */

export const TITLE_ID: string = (import.meta.env.VITE_PLAYFAB_TITLE_ID ?? '').trim();

export class PlayFabError extends Error {
  constructor(readonly code: string, message: string, readonly details?: Record<string, string[]>) {
    super(message);
  }
}

export interface LoginResult {
  PlayFabId: string;
  SessionTicket: string;
  NewlyCreated: boolean;
  InfoResultPayload?: {
    AccountInfo?: { Username?: string; PrivateInfo?: { Email?: string }; TitleInfo?: { DisplayName?: string } };
    UserData?: Record<string, { Value: string }>;
  };
}

const INFO = { GetUserAccountInfo: true, GetUserData: true, UserDataKeys: ['profile'] };

export class PlayFabClient {
  ticket: string | null = null;
  playFabId: string | null = null;

  get configured() {
    return TITLE_ID.length > 0;
  }

  async call<T>(api: string, body: Record<string, unknown>, auth = true): Promise<T> {
    if (!this.configured) throw new PlayFabError('NotConfigured', 'Online play is not set up yet.');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth) {
      if (!this.ticket) throw new PlayFabError('NotLoggedIn', 'Not signed in.');
      headers['X-Authorization'] = this.ticket;
    }
    let res: Response;
    try {
      res = await fetch(`https://${TITLE_ID}.playfabapi.com/Client/${api}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(auth ? body : { TitleId: TITLE_ID, ...body }),
      });
    } catch {
      throw new PlayFabError('Network', "Can't reach the Splashburg servers. Check your connection.");
    }
    let json: { data?: T; error?: string; errorMessage?: string; errorDetails?: Record<string, string[]> };
    try {
      json = await res.json();
    } catch {
      throw new PlayFabError('BadResponse', 'The server sent something unexpected.');
    }
    if (!res.ok || json.error) {
      throw new PlayFabError(json.error ?? `HTTP${res.status}`, json.errorMessage ?? 'Something went wrong.', json.errorDetails);
    }
    return json.data as T;
  }

  private take(r: LoginResult) {
    this.ticket = r.SessionTicket;
    this.playFabId = r.PlayFabId;
    return r;
  }

  async loginWithCustomId(customId: string, create: boolean) {
    return this.take(await this.call<LoginResult>('LoginWithCustomID', { CustomId: customId, CreateAccount: create, InfoRequestParameters: INFO }, false));
  }

  async loginWithUsername(username: string, password: string) {
    return this.take(await this.call<LoginResult>('LoginWithPlayFab', { Username: username, Password: password, InfoRequestParameters: INFO }, false));
  }

  async loginWithEmail(email: string, password: string) {
    return this.take(await this.call<LoginResult>('LoginWithEmailAddress', { Email: email, Password: password, InfoRequestParameters: INFO }, false));
  }

  async register(username: string, email: string, password: string) {
    const r = await this.call<{ PlayFabId: string; SessionTicket: string }>(
      'RegisterPlayFabUser',
      { Username: username, Email: email, Password: password, DisplayName: username, RequireBothUsernameAndEmail: true },
      false,
    );
    this.ticket = r.SessionTicket;
    this.playFabId = r.PlayFabId;
    return r;
  }

  /** Turn the current (guest) account into a full account, keeping its progress. */
  addUsernamePassword(username: string, email: string, password: string) {
    return this.call('AddUsernamePassword', { Username: username, Email: email, Password: password });
  }

  linkCustomId(customId: string) {
    return this.call('LinkCustomID', { CustomId: customId, ForceLink: true });
  }

  unlinkCustomId(customId: string) {
    return this.call('UnlinkCustomID', { CustomId: customId });
  }

  setDisplayName(name: string) {
    return this.call<{ DisplayName: string }>('UpdateUserTitleDisplayName', { DisplayName: name });
  }

  saveUserData(data: Record<string, string>) {
    return this.call('UpdateUserData', { Data: data, Permission: 'Private' });
  }

  sendRecoveryEmail(email: string) {
    return this.call('SendAccountRecoveryEmail', { Email: email }, false);
  }

  async cloudScript<T>(name: string, args: Record<string, unknown> = {}) {
    const r = await this.call<{ FunctionResult?: T; Error?: { Error: string; Message: string } }>('ExecuteCloudScript', {
      FunctionName: name,
      FunctionParameter: args,
      GeneratePlayStreamEvent: false,
    });
    if (r.Error) throw new PlayFabError(r.Error.Error, r.Error.Message);
    return r.FunctionResult as T;
  }

  logout() {
    this.ticket = null;
    this.playFabId = null;
  }
}
