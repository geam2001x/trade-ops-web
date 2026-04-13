import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="page-grid">
      <article className="hero-panel not-found-panel">
        <p className="eyebrow">Ruta no encontrada</p>
        <h2>Esta vista todavia no existe en el frontend</h2>
        <p className="hero-copy">
          La base ya esta lista para seguir creciendo. Puedes volver al dashboard
          y seguir revisando el flujo E2E disponible.
        </p>
        <Link to="/" className="primary-link">
          Volver al dashboard
        </Link>
      </article>
    </section>
  );
}
