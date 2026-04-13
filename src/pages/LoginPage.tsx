import { useState } from 'react';
import { Navigate } from 'react-router-dom';

import { useAuth } from '../app/auth';

type AuthMode = 'login' | 'register';

export function LoginPage() {
  const { isAuthenticated, login, register } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('admin@trade-ops.local');
  const [password, setPassword] = useState('secret123');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setSubmitting(true);
      setError(null);

      if (mode === 'login') {
        await login({ email, password });
      } else {
        await register({ name, email, password });
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'No fue posible iniciar sesion.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel auth-panel-brand">
        <p className="eyebrow">Trade Operations Suite</p>
        <h1>Operacion E2E con contexto persistente</h1>
        <p className="auth-copy">
          Ya tenemos backend real, trazabilidad por checkpoint, proformas y
          rentabilidad. Ahora la UI puede guardar sesion y operar sobre esa base.
        </p>

        <div className="auth-demo-box">
          <strong>Credenciales demo locales</strong>
          <span>Email: admin@trade-ops.local</span>
          <span>Password: secret123</span>
        </div>
      </section>

      <section className="auth-panel auth-panel-form">
        <div className="auth-mode-toggle">
          <button
            type="button"
            className={mode === 'login' ? 'toggle-button toggle-active' : 'toggle-button'}
            onClick={() => setMode('login')}
          >
            Ingresar
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'toggle-button toggle-active' : 'toggle-button'}
            onClick={() => setMode('register')}
          >
            Registrar
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div>
            <p className="eyebrow">Acceso</p>
            <h2>{mode === 'login' ? 'Inicia sesion' : 'Crea un usuario'}</h2>
          </div>

          {mode === 'register' ? (
            <label className="field">
              <span>Nombre</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Tu nombre"
                required
              />
            </label>
          ) : null}

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="usuario@trade-ops.local"
              required
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Tu password"
              required
            />
          </label>

          {error ? <p className="feedback feedback-error">{error}</p> : null}

          <button type="submit" className="primary-button" disabled={submitting}>
            {submitting
              ? 'Procesando...'
              : mode === 'login'
                ? 'Entrar al panel'
                : 'Crear usuario y entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}
