import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../app/auth';
import {
  type ExchangeRateSyncSummary,
  type InventoryLot,
  type InventoryLotProfitability,
  type LatestExchangeRate,
  type SalesOrder,
  type SalesOrderProfitability,
  getJson,
  postJson,
} from '../app/api';
import { SectionCard } from '../components/ui/SectionCard';

const DEFAULT_HISTORY_START = '2026-04-12';

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatClpRate(value: number | null) {
  if (value === null) {
    return 'N/D';
  }

  return new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatDateOnly(value: string) {
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

export function FinancePage() {
  const { session } = useAuth();
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [selectedLotId, setSelectedLotId] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [lotProfitability, setLotProfitability] =
    useState<InventoryLotProfitability | null>(null);
  const [orderProfitability, setOrderProfitability] =
    useState<SalesOrderProfitability | null>(null);
  const [latestExchangeRate, setLatestExchangeRate] =
    useState<LatestExchangeRate | null>(null);
  const [exchangeRateHistory, setExchangeRateHistory] = useState<
    LatestExchangeRate[]
  >([]);
  const [firstDate, setFirstDate] = useState(DEFAULT_HISTORY_START);
  const [lastDate, setLastDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [isSyncingRates, setIsSyncingRates] = useState(false);
  const [syncSummary, setSyncSummary] = useState<ExchangeRateSyncSummary | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadExchangeRates = useCallback(async () => {
    const [latestRateResponse, historyResponse] = await Promise.all([
      getJson<LatestExchangeRate>(
        '/finance/exchange-rates/latest?base=USD&quote=CLP',
        session?.accessToken,
      ).catch(() => null),
      getJson<LatestExchangeRate[]>(
        `/finance/exchange-rates/history?base=USD&quote=CLP&firstDate=${firstDate}&lastDate=${lastDate}`,
        session?.accessToken,
      ).catch(() => []),
    ]);

    setLatestExchangeRate(latestRateResponse);
    setExchangeRateHistory(historyResponse);
  }, [firstDate, lastDate, session?.accessToken]);

  useEffect(() => {
    async function loadBase() {
      try {
        setError(null);
        const [inventoryLots, salesOrders] = await Promise.all([
          getJson<InventoryLot[]>('/inventory/lots', session?.accessToken),
          getJson<SalesOrder[]>('/sales/orders', session?.accessToken),
        ]);

        setLots(inventoryLots);
        setOrders(salesOrders);

        if (inventoryLots.length > 0) {
          setSelectedLotId(inventoryLots[0].id);
        }

        if (salesOrders.length > 0) {
          setSelectedOrderId(salesOrders[0].id);
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'No fue posible cargar la base financiera.',
        );
      }
    }

    void loadBase();
  }, [session?.accessToken]);

  useEffect(() => {
    void loadExchangeRates();
  }, [loadExchangeRates]);

  useEffect(() => {
    async function loadLot() {
      if (!selectedLotId) {
        setLotProfitability(null);
        return;
      }

      const response = await getJson<InventoryLotProfitability>(
        `/finance/inventory-lots/${selectedLotId}/profitability`,
        session?.accessToken,
      );
      setLotProfitability(response);
    }

    void loadLot();
  }, [selectedLotId, session?.accessToken]);

  useEffect(() => {
    async function loadOrder() {
      if (!selectedOrderId) {
        setOrderProfitability(null);
        return;
      }

      const response = await getJson<SalesOrderProfitability>(
        `/finance/sales-orders/${selectedOrderId}/profitability`,
        session?.accessToken,
      );
      setOrderProfitability(response);
    }

    void loadOrder();
  }, [selectedOrderId, session?.accessToken]);

  async function handleSyncExchangeRates() {
    try {
      setIsSyncingRates(true);
      setError(null);
      setSuccessMessage(null);

      const response = await postJson<ExchangeRateSyncSummary>(
        '/finance/exchange-rates/sync',
        {
          baseCurrencyCode: 'USD',
          quoteCurrencyCode: 'CLP',
          firstDate,
          lastDate,
        },
        session?.accessToken,
      );

      setSyncSummary(response);
      setSuccessMessage(
        `Sync completado: ${response.processedCount} snapshots procesados entre ${response.firstDate} y ${response.lastDate}.`,
      );
      await loadExchangeRates();
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? syncError.message
          : 'No fue posible sincronizar el tipo de cambio.',
      );
    } finally {
      setIsSyncingRates(false);
    }
  }

  return (
    <div className="page-grid">
      {error ? <p className="feedback feedback-error">{error}</p> : null}
      {successMessage ? (
        <p className="feedback feedback-success">{successMessage}</p>
      ) : null}

      <SectionCard
        title="Tipo de cambio USD / CLP"
        subtitle="Referencia oficial BCCh con complemento compra / venta desde BancoEstado cuando el dia coincide"
        action={
          <button
            type="button"
            className="primary-button"
            onClick={handleSyncExchangeRates}
            disabled={isSyncingRates}
          >
            {isSyncingRates ? 'Sincronizando...' : 'Sincronizar ahora'}
          </button>
        }
      >
        <div className="form-grid form-grid-three">
          <label className="field">
            <span>Fecha inicial</span>
            <input
              type="date"
              value={firstDate}
              onChange={(event) => setFirstDate(event.target.value)}
            />
          </label>

          <label className="field">
            <span>Fecha final</span>
            <input
              type="date"
              value={lastDate}
              onChange={(event) => setLastDate(event.target.value)}
            />
          </label>

          <div className="info-banner">
            <strong>Sync automatico diario</strong>
            <span>
              Quedo preparado en backend. En tu entorno local quedara activo con
              `FX_AUTO_SYNC_ENABLED=true`.
            </span>
          </div>
        </div>

        <div className="kpi-grid" style={{ marginTop: '1rem' }}>
          <article className="kpi-card kpi-accent">
            <span>USD observado BCCh</span>
            <strong>
              {latestExchangeRate
                ? `CLP ${formatClpRate(latestExchangeRate.rate)}`
                : 'N/D'}
            </strong>
            <p>
              {latestExchangeRate
                ? formatDateOnly(latestExchangeRate.rateDate)
                : 'Sin snapshot'}
            </p>
          </article>

          <article className="kpi-card">
            <span>Banco compra USD</span>
            <strong>
              {latestExchangeRate
                ? `CLP ${formatClpRate(latestExchangeRate.buyRate)}`
                : 'N/D'}
            </strong>
            <p>Cliente vende USD a BancoEstado</p>
          </article>

          <article className="kpi-card kpi-success">
            <span>Banco vende USD</span>
            <strong>
              {latestExchangeRate
                ? `CLP ${formatClpRate(latestExchangeRate.sellRate)}`
                : 'N/D'}
            </strong>
            <p>Cliente compra USD a BancoEstado</p>
          </article>
        </div>

        {latestExchangeRate ? (
          <div className="stack-list" style={{ marginTop: '1rem' }}>
            <div className="list-row">
              <span>Fuente referencia oficial</span>
              <strong>{latestExchangeRate.sourceName}</strong>
            </div>
            <div className="list-row">
              <span>Fuente compra / venta</span>
              <strong>{latestExchangeRate.buySellSourceName ?? 'No disponible'}</strong>
            </div>
            <div className="list-row">
              <span>Snapshot cargado</span>
              <strong>{formatDateTime(latestExchangeRate.fetchedAt)}</strong>
            </div>
          </div>
        ) : (
          <p className="muted" style={{ marginTop: '1rem' }}>
            Aun no hay snapshot cargado para `USD/CLP`.
          </p>
        )}

        {syncSummary ? (
          <p className="muted" style={{ marginTop: '1rem' }}>
            Ultimo sync: {syncSummary.importedCount} importados,{' '}
            {syncSummary.updatedCount} actualizados, fuente oficial{' '}
            {syncSummary.sourceName}
            {syncSummary.buySellSourceName
              ? ` y compra/venta desde ${syncSummary.buySellSourceName}`
              : ''}
            .
          </p>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Historico diario de snapshots"
        subtitle="Persistencia de referencia oficial y, cuando existe, compra / venta del dia"
      >
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>USD observado</th>
                <th>Compra USD</th>
                <th>Venta USD</th>
                <th>Fuente oficial</th>
                <th>Fuente compra / venta</th>
              </tr>
            </thead>
            <tbody>
              {exchangeRateHistory.map((snapshot) => (
                <tr key={snapshot.rateDate}>
                  <td>{formatDateOnly(snapshot.rateDate)}</td>
                  <td>CLP {formatClpRate(snapshot.rate)}</td>
                  <td>CLP {formatClpRate(snapshot.buyRate)}</td>
                  <td>CLP {formatClpRate(snapshot.sellRate)}</td>
                  <td>{snapshot.sourceName}</td>
                  <td>{snapshot.buySellSourceName ?? 'N/D'}</td>
                </tr>
              ))}
              {exchangeRateHistory.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    No hay snapshots en el rango solicitado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: '0.8rem' }}>
          BCCh entrega una tasa observada oficial. Compra y venta se guardan
          solo cuando la fuente bancaria del dia esta disponible.
        </p>
      </SectionCard>

      <div className="two-column-grid">
        <SectionCard
          title="Rentabilidad por lote"
          subtitle="Costo acumulado y margen realizado"
          action={
            <select
              className="select-input"
              value={selectedLotId}
              onChange={(event) => setSelectedLotId(event.target.value)}
            >
              {lots.map((lot) => (
                <option key={lot.id} value={lot.id}>
                  {lot.lotCode}
                </option>
              ))}
            </select>
          }
        >
          {lotProfitability ? (
            <div className="stack-list">
              <div className="list-row">
                <span>Estado</span>
                <strong>{lotProfitability.status}</strong>
              </div>
              <div className="list-row">
                <span>Unit landed cost USD</span>
                <strong>{lotProfitability.unitLandedCostUsd.toFixed(4)}</strong>
              </div>
              <div className="list-row">
                <span>Import cost asignado USD</span>
                <strong>{lotProfitability.allocatedImportCostUsd.toFixed(4)}</strong>
              </div>
              <div className="list-row">
                <span>Revenue completado USD</span>
                <strong>{lotProfitability.completedRevenueUsd.toFixed(2)}</strong>
              </div>
              <div className="list-row">
                <span>Gross margin USD</span>
                <strong>{lotProfitability.completedGrossMarginUsd.toFixed(2)}</strong>
              </div>
              <div className="list-row">
                <span>ROI %</span>
                <strong>
                  {lotProfitability.completedRoiPercent?.toFixed(2) ?? 'N/A'}
                </strong>
              </div>
            </div>
          ) : (
            <p className="muted">No hay lotes disponibles.</p>
          )}
        </SectionCard>

        <SectionCard
          title="Rentabilidad por orden"
          subtitle="Margen realizado sobre ventas cerradas"
          action={
            <select
              className="select-input"
              value={selectedOrderId}
              onChange={(event) => setSelectedOrderId(event.target.value)}
            >
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.orderNumber}
                </option>
              ))}
            </select>
          }
        >
          {orderProfitability ? (
            <div className="stack-list">
              <div className="list-row">
                <span>Canal</span>
                <strong>{orderProfitability.saleType}</strong>
              </div>
              <div className="list-row">
                <span>Revenue USD</span>
                <strong>{formatUsd(orderProfitability.revenueUsd)}</strong>
              </div>
              <div className="list-row">
                <span>Cost USD</span>
                <strong>{formatUsd(orderProfitability.costUsd)}</strong>
              </div>
              <div className="list-row">
                <span>Gross margin USD</span>
                <strong>{formatUsd(orderProfitability.grossMarginUsd)}</strong>
              </div>
              <div className="list-row">
                <span>ROI %</span>
                <strong>
                  {orderProfitability.roiPercent?.toFixed(2) ?? 'N/A'}
                </strong>
              </div>
            </div>
          ) : (
            <p className="muted">No hay ordenes de venta disponibles.</p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
