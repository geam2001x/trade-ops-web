const AUTH_STORAGE_KEY = 'trade_ops_web_auth';

export type AuthSession = {
  accessToken: string;
  tokenType: string;
  user: {
    id: number | null;
    email: string | null;
    name: string | null;
    roles: string[];
  };
  expiresAt: number | null;
};

export function readAuthSession(): AuthSession | null {
  const rawValue = window.localStorage.getItem(AUTH_STORAGE_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as AuthSession;
  } catch {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

export function writeAuthSession(session: AuthSession): void {
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function clearAuthSession(): void {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}
