import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';
import { Navigate } from 'react-router-dom';

import { postJson } from './api';
import {
  clearAuthSession,
  readAuthSession,
  writeAuthSession,
  type AuthSession,
} from './auth-storage';

type LoginInput = {
  email: string;
  password: string;
};

type RegisterInput = {
  name: string;
  email: string;
  password: string;
};

type AuthResponse = {
  accessToken: string;
  tokenType: string;
  user?: {
    id: number;
    name: string;
    email: string;
    roles: string[];
  };
};

type AuthContextValue = {
  session: AuthSession | null;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) {
      return null;
    }

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = window.atob(padded);

    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function buildSession(
  response: AuthResponse,
  fallbackEmail?: string,
  fallbackName?: string,
): AuthSession {
  const jwtPayload = decodeJwtPayload(response.accessToken);
  const subject = jwtPayload?.sub;
  const userId =
    typeof subject === 'string'
      ? Number(subject)
      : typeof subject === 'number'
        ? subject
        : null;
  const expiresAt =
    typeof jwtPayload?.exp === 'number' ? jwtPayload.exp * 1000 : null;

  return {
    accessToken: response.accessToken,
    tokenType: response.tokenType,
    user: {
      id: Number.isFinite(userId) ? userId : null,
      email:
        response.user?.email ??
        (typeof jwtPayload?.email === 'string' ? jwtPayload.email : null) ??
        fallbackEmail ??
        null,
      name: response.user?.name ?? fallbackName ?? null,
      roles: response.user?.roles ?? [],
    },
    expiresAt,
  };
}

function getInitialSession(): AuthSession | null {
  const session = readAuthSession();

  if (!session) {
    return null;
  }

  if (session.expiresAt && session.expiresAt <= Date.now()) {
    clearAuthSession();
    return null;
  }

  return session;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(getInitialSession);

  useEffect(() => {
    if (!session) {
      return;
    }

    if (session.expiresAt && session.expiresAt <= Date.now()) {
      clearAuthSession();
      setSession(null);
    }
  }, [session]);

  async function login(input: LoginInput): Promise<void> {
    const response = await postJson<AuthResponse>('/auth/login', input);
    const nextSession = buildSession(response, input.email);
    writeAuthSession(nextSession);
    setSession(nextSession);
  }

  async function register(input: RegisterInput): Promise<void> {
    const response = await postJson<AuthResponse>('/auth/register', input);
    const nextSession = buildSession(response, input.email, input.name);
    writeAuthSession(nextSession);
    setSession(nextSession);
  }

  function logout() {
    clearAuthSession();
    setSession(null);
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        isAuthenticated: Boolean(session?.accessToken),
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}

export function RequireAuth({ children }: PropsWithChildren) {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export function RedirectIfAuthenticated({ children }: PropsWithChildren) {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
