import { useEffect, useState } from 'react';

import { useAuth } from '../app/auth';
import {
  type CheckpointSummary,
  type DocumentUpload,
  type SalesOrder,
  type SalesOrderProfitability,
  getJson,
} from '../app/api';
import { KpiCard } from '../components/ui/KpiCard';
import { SectionCard } from '../components/ui/SectionCard';

export function DashboardPage() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CheckpointSummary[]>([]);
  const [uploads, setUploads] = useState<DocumentUpload[]>([]);
  const [salesProfitability, setSalesProfitability] =
    useState<SalesOrderProfitability | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [checkpointSummary, documentUploads, salesOrders] = await Promise.all([
          getJson<CheckpointSummary[]>(
            '/procurement/checkpoints/summary',
            session?.accessToken,
          ),
          getJson<DocumentUpload[]>(
            '/document-processing/uploads',
            session?.accessToken,
          ),
          getJson<SalesOrder[]>('/sales/orders', session?.accessToken),
        ]);

        setSummary(checkpointSummary);
        setUploads(documentUploads);

        if (salesOrders.length > 0) {
          const profitability = await getJson<SalesOrderProfitability>(
            `/finance/sales-orders/${salesOrders[0].id}/profitability`,
            session?.accessToken,
          );
          setSalesProfitability(profitability);
        } else {
          setSalesProfitability(null);
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'No fue posible cargar el dashboard.',
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [session?.accessToken]);

  const totalOrders = summary.reduce((sum, item) => sum + item.ordersCount, 0);
  const totalArticles = summary.reduce(
    (sum, item) => sum + item.articlesQuantity,
    0,
  );

  return (
    <div className="page-grid">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Operacion viva</p>
          <h2>Vision E2E del flujo completo</h2>
          <p className="hero-copy">
            Esta primera version del frontend ya lee datos reales del backend:
            checkpoints, documentos procesados y rentabilidad base.
          </p>
        </div>
        <div className="kpi-grid">
          <KpiCard
            label="Pedidos en flujo"
            value={loading ? '...' : String(totalOrders)}
            detail="Suma de checkpoints activos"
            tone="accent"
          />
          <KpiCard
            label="Articulos trazados"
            value={loading ? '...' : String(totalArticles)}
            detail="Cantidad total visible en el flujo"
          />
          <KpiCard
            label="Proformas registradas"
            value={loading ? '...' : String(uploads.length)}
            detail="Documentos con auditoria de validacion"
            tone="success"
          />
        </div>
      </section>

      {error ? <p className="feedback feedback-error">{error}</p> : null}

      <SectionCard
        title="Resumen por checkpoint"
        subtitle="Vista rapida del estado actual del flujo operativo"
      >
        <div className="checkpoint-grid">
          {summary.map((item) => (
            <article key={item.checkpoint} className="checkpoint-card">
              <strong>{item.checkpoint}</strong>
              <span>{item.ordersCount} pedidos</span>
              <small>{item.articlesQuantity} articulos</small>
            </article>
          ))}
        </div>
      </SectionCard>

      <div className="two-column-grid">
        <SectionCard
          title="Ultima proforma procesada"
          subtitle="Documento mas reciente en el pipeline documental"
        >
          {uploads.length === 0 ? (
            <p className="muted">Todavia no hay uploads documentales.</p>
          ) : (
            <div className="stack-list">
              <div className="list-row">
                <span>Archivo</span>
                <strong>{uploads[0].originalFileName}</strong>
              </div>
              <div className="list-row">
                <span>Estado</span>
                <strong>{uploads[0].status}</strong>
              </div>
              <div className="list-row">
                <span>Extracciones</span>
                <strong>{uploads[0].extractions.length}</strong>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Rentabilidad destacada"
          subtitle="Orden de venta demo ya cerrada en el backend"
        >
          {salesProfitability ? (
            <div className="stack-list">
              <div className="list-row">
                <span>Orden</span>
                <strong>{salesProfitability.orderNumber}</strong>
              </div>
              <div className="list-row">
                <span>Revenue USD</span>
                <strong>{salesProfitability.revenueUsd.toFixed(2)}</strong>
              </div>
              <div className="list-row">
                <span>Gross margin USD</span>
                <strong>{salesProfitability.grossMarginUsd.toFixed(2)}</strong>
              </div>
              <div className="list-row">
                <span>ROI %</span>
                <strong>
                  {salesProfitability.roiPercent?.toFixed(2) ?? 'N/A'}
                </strong>
              </div>
            </div>
          ) : (
            <p className="muted">No hay ventas listas para analizar.</p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
