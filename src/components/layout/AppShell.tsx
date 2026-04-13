import { NavLink, Outlet } from 'react-router-dom';

import { getApiBaseUrl } from '../../app/api';
import { useAuth } from '../../app/auth';

const navigationItems = [
  { to: '/', label: 'Dashboard', caption: 'Resumen E2E' },
  { to: '/procurement', label: 'Checkpoints', caption: 'Pedidos y articulos' },
  { to: '/sales', label: 'Ventas', caption: 'Retail y wholesale' },
  { to: '/documents', label: 'Proformas', caption: 'Carga y validacion' },
  { to: '/finance', label: 'Finanzas', caption: 'Lotes y ventas' },
];

export function AppShell() {
  const { session, logout } = useAuth();
  const today = new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date());

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <p className="eyebrow">Trade Operations Suite</p>
          <h1>Operacion E2E</h1>
          <p className="brand-copy">
            Compra, importacion, bodega, venta y rentabilidad en una sola vista.
          </p>
        </div>

        <nav className="sidebar-nav">
          {navigationItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                isActive ? 'nav-link nav-link-active' : 'nav-link'
              }
            >
              <span>{item.label}</span>
              <small>{item.caption}</small>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span>API</span>
          <code>{getApiBaseUrl()}</code>
        </div>
      </aside>

      <main className="content-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Workspace local</p>
            <h2>Frontend inicial conectado al backend real</h2>
          </div>
          <div className="topbar-actions">
            <div className="status-chip">
              <span className="status-dot" />
              <span>{today}</span>
            </div>
            <div className="session-chip">
              <strong>{session?.user.name ?? 'Sesion activa'}</strong>
              <span>{session?.user.email ?? 'usuario local'}</span>
            </div>
            <button type="button" className="ghost-button" onClick={logout}>
              Cerrar sesion
            </button>
          </div>
        </header>

        <Outlet />
      </main>
    </div>
  );
}
