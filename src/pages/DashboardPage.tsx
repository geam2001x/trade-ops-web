import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '../app/auth';
import {
  type CheckpointSummary,
  type CustomsEntry,
  type DocumentUpload,
  type InventoryLot,
  type LatestExchangeRate,
  type SalesOrder,
  type SalesOrderProfitability,
  type Shipment,
  type Warehouse,
  getJson,
} from '../app/api';
import { downloadCsv } from '../app/export';
import { KpiCard } from '../components/ui/KpiCard';
import { SectionCard } from '../components/ui/SectionCard';

function parseDecimal(value: string | number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatClp(value: number) {
  return new Intl.NumberFormat('es-CL', {
    maximumFractionDigits: 0,
  }).format(value);
}

function getLotAgeInDays(receivedAt: string) {
  const receivedDate = new Date(receivedAt);
  const now = new Date();
  const diffMs = now.getTime() - receivedDate.getTime();

  if (Number.isNaN(diffMs) || diffMs < 0) {
    return 0;
  }

  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function getShipmentStatusGroup(status: string) {
  if (status === 'delivered') {
    return 'closed';
  }

  if (status === 'released' || status === 'arrived' || status === 'customs') {
    return 'arrived';
  }

  return 'in_transit';
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

export function DashboardPage() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currencyView, setCurrencyView] = useState<'USD' | 'CLP'>('USD');
  const [summary, setSummary] = useState<CheckpointSummary[]>([]);
  const [uploads, setUploads] = useState<DocumentUpload[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [salesProfitability, setSalesProfitability] =
    useState<SalesOrderProfitability | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [customsEntries, setCustomsEntries] = useState<CustomsEntry[]>([]);
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [latestExchangeRate, setLatestExchangeRate] =
    useState<LatestExchangeRate | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [
          checkpointSummary,
          documentUploads,
          salesOrdersResponse,
          shipmentsResponse,
          customsEntriesResponse,
          inventoryLotsResponse,
          warehousesResponse,
          latestExchangeRateResponse,
        ] = await Promise.all([
          getJson<CheckpointSummary[]>(
            '/procurement/checkpoints/summary',
            session?.accessToken,
          ),
          getJson<DocumentUpload[]>(
            '/document-processing/uploads',
            session?.accessToken,
          ),
          getJson<SalesOrder[]>('/sales/orders', session?.accessToken),
          getJson<Shipment[]>('/shipments', session?.accessToken),
          getJson<CustomsEntry[]>('/customs/entries', session?.accessToken),
          getJson<InventoryLot[]>('/inventory/lots', session?.accessToken),
          getJson<Warehouse[]>('/inventory/warehouses', session?.accessToken).catch(
            () => [],
          ),
          getJson<LatestExchangeRate>(
            '/finance/exchange-rates/latest?base=USD&quote=CLP',
            session?.accessToken,
          ).catch(() => null),
        ]);

        setSummary(checkpointSummary);
        setUploads(documentUploads);
        setSalesOrders(salesOrdersResponse);
        setShipments(shipmentsResponse);
        setCustomsEntries(customsEntriesResponse);
        setLots(inventoryLotsResponse);
        setWarehouses(warehousesResponse);
        setLatestExchangeRate(latestExchangeRateResponse);

        if (salesOrdersResponse.length > 0) {
          const latestOrder = [...salesOrdersResponse].sort((left, right) => {
            return (
              new Date(right.orderDate).getTime() -
              new Date(left.orderDate).getTime()
            );
          })[0];

          const profitability = await getJson<SalesOrderProfitability>(
            `/finance/sales-orders/${latestOrder.id}/profitability`,
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

  const latestUpload = useMemo(
    () =>
      [...uploads].sort(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      )[0] ?? null,
    [uploads],
  );

  const warehousesById = useMemo(
    () => new Map(warehouses.map((warehouse) => [warehouse.id, warehouse])),
    [warehouses],
  );

  function formatMoneyFromUsd(usdValue: number) {
    if (currencyView === 'CLP' && latestExchangeRate) {
      return `CLP ${formatClp(usdValue * latestExchangeRate.rate)}`;
    }

    return `USD ${formatUsd(usdValue)}`;
  }

  const totalOrders = summary.reduce((sum, item) => sum + item.ordersCount, 0);
  const totalArticles = summary.reduce(
    (sum, item) => sum + item.articlesQuantity,
    0,
  );
  const totalInventoryValueUsd = lots.reduce(
    (sum, lot) =>
      sum +
      parseDecimal(lot.availableQuantity) * parseDecimal(lot.unitLandedCostUsd),
    0,
  );
  const agedLotsOver30 = lots.filter(
    (lot) => getLotAgeInDays(lot.receivedAt) >= 30,
  );
  const agedLotsOver90 = lots.filter(
    (lot) => getLotAgeInDays(lot.receivedAt) >= 90,
  );

  const activeShipments = useMemo(
    () =>
      shipments
        .filter((shipment) => getShipmentStatusGroup(shipment.status) !== 'closed')
        .sort((left, right) => {
          return (
            new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
          );
        }),
    [shipments],
  );

  const openCustomsEntries = useMemo(
    () =>
      customsEntries.filter((entry) =>
        ['pending', 'in_review'].includes(entry.status),
      ),
    [customsEntries],
  );

  const oldestLots = useMemo(
    () =>
      [...lots]
        .sort(
          (left, right) =>
            getLotAgeInDays(right.receivedAt) - getLotAgeInDays(left.receivedAt),
        )
        .slice(0, 5),
    [lots],
  );

  const warehouseMetrics = useMemo(() => {
    const grouped = new Map<
      string,
      {
        warehouseName: string;
        lotsCount: number;
        availableQuantity: number;
        visibleUsd: number;
      }
    >();

    for (const lot of lots) {
      const warehouseName =
        warehousesById.get(Number(lot.warehouseId))?.name ??
        `Warehouse ${lot.warehouseId}`;
      const current = grouped.get(lot.warehouseId) ?? {
        warehouseName,
        lotsCount: 0,
        availableQuantity: 0,
        visibleUsd: 0,
      };

      current.lotsCount += 1;
      current.availableQuantity += parseDecimal(lot.availableQuantity);
      current.visibleUsd +=
        parseDecimal(lot.availableQuantity) * parseDecimal(lot.unitLandedCostUsd);

      grouped.set(lot.warehouseId, current);
    }

    return [...grouped.values()].sort((left, right) => right.visibleUsd - left.visibleUsd);
  }, [lots, warehousesById]);

  function handleExportCheckpointSummary() {
    downloadCsv(
      `dashboard-checkpoints-${getTodayDate()}.csv`,
      ['checkpoint', 'orders_count', 'articles_quantity', 'usd_total', 'clp_total'],
      summary.map((item) => [
        item.checkpoint,
        item.ordersCount,
        item.articlesQuantity,
        item.usdTotal.toFixed(2),
        latestExchangeRate ? (item.usdTotal * latestExchangeRate.rate).toFixed(0) : null,
      ]),
    );
  }

  function handleExportActiveShipments() {
    downloadCsv(
      `dashboard-active-shipments-${getTodayDate()}.csv`,
      [
        'shipment_number',
        'status',
        'transport_mode',
        'origin',
        'destination',
        'tracking_reference',
        'eta',
        'updated_at',
      ],
      activeShipments.map((shipment) => [
        shipment.shipmentNumber,
        shipment.status,
        shipment.transportMode,
        shipment.originLocation,
        shipment.destinationLocation,
        shipment.trackingReference,
        shipment.eta,
        shipment.updatedAt,
      ]),
    );
  }

  function handleExportOpenCustomsEntries() {
    downloadCsv(
      `dashboard-open-customs-${getTodayDate()}.csv`,
      [
        'entry_number',
        'shipment_id',
        'status',
        'entry_date',
        'total_expenses_usd',
        'total_expenses_clp',
      ],
      openCustomsEntries.map((entry) => {
        const totalExpensesUsd = entry.expenses.reduce(
          (sum, expense) => sum + parseDecimal(expense.amountUsd),
          0,
        );

        return [
          entry.entryNumber,
          entry.shipmentId,
          entry.status,
          entry.arrivalDateChile,
          totalExpensesUsd.toFixed(2),
          latestExchangeRate ? (totalExpensesUsd * latestExchangeRate.rate).toFixed(0) : null,
        ];
      }),
    );
  }

  function handleExportInventoryAging() {
    downloadCsv(
      `dashboard-inventory-aging-${getTodayDate()}.csv`,
      [
        'lot_code',
        'warehouse',
        'age_days',
        'aging_bucket',
        'available_quantity',
        'visible_usd',
        'visible_clp',
      ],
      oldestLots.map((lot) => {
        const visibleUsd =
          parseDecimal(lot.availableQuantity) * parseDecimal(lot.unitLandedCostUsd);
        const ageDays = getLotAgeInDays(lot.receivedAt);

        return [
          lot.lotCode,
          warehousesById.get(Number(lot.warehouseId))?.name ?? `Warehouse ${lot.warehouseId}`,
          ageDays,
          ageDays >= 90 ? '>90' : ageDays >= 30 ? '30-89' : '0-29',
          lot.availableQuantity,
          visibleUsd.toFixed(2),
          latestExchangeRate ? (visibleUsd * latestExchangeRate.rate).toFixed(0) : null,
        ];
      }),
    );
  }

  function handleExportWarehouseMetrics() {
    downloadCsv(
      `dashboard-warehouse-value-${getTodayDate()}.csv`,
      ['warehouse', 'lots_count', 'available_quantity', 'visible_usd', 'visible_clp'],
      warehouseMetrics.map((warehouseMetric) => [
        warehouseMetric.warehouseName,
        warehouseMetric.lotsCount,
        warehouseMetric.availableQuantity.toFixed(2),
        warehouseMetric.visibleUsd.toFixed(2),
        latestExchangeRate
          ? (warehouseMetric.visibleUsd * latestExchangeRate.rate).toFixed(0)
          : null,
      ]),
    );
  }

  return (
    <div className="page-grid">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Operacion viva</p>
          <h2>Vision E2E del flujo completo</h2>
          <p className="hero-copy">
            El dashboard ya consolida compras, documentos, embarques, aduana,
            inventario y rentabilidad base desde el backend real.
          </p>
          <div className="form-actions">
            <button
              type="button"
              className={currencyView === 'USD' ? 'primary-button' : 'ghost-button'}
              onClick={() => setCurrencyView('USD')}
            >
              Ver en USD
            </button>
            <button
              type="button"
              className={currencyView === 'CLP' ? 'primary-button' : 'ghost-button'}
              onClick={() => setCurrencyView('CLP')}
              disabled={!latestExchangeRate}
            >
              Ver en CLP
            </button>
          </div>
          <p className="muted">
            {latestExchangeRate
              ? `Tipo de cambio ${latestExchangeRate.baseCurrencyCode}/${latestExchangeRate.quoteCurrencyCode}: ${latestExchangeRate.rate.toFixed(2)} · fuente ${latestExchangeRate.sourceName} · ${new Date(latestExchangeRate.rateDate).toLocaleString('es-CL')}${latestExchangeRate.buyRate === null && latestExchangeRate.sellRate === null ? ' · BCCh entrega referencia oficial, no puntas compra/venta bancarias.' : ''}`
              : 'Sin snapshot de tipo de cambio cargado. La vista monetaria queda en USD.'}
          </p>
        </div>
        <div className="kpi-grid">
          <KpiCard
            label="Pedidos en flujo"
            value={loading ? '...' : String(totalOrders)}
            detail="Suma visible de checkpoints"
            tone="accent"
          />
          <KpiCard
            label="Articulos trazados"
            value={loading ? '...' : String(totalArticles)}
            detail="Cantidad total visible en la cadena"
          />
          <KpiCard
            label="Embarques activos"
            value={loading ? '...' : String(activeShipments.length)}
            detail="No entregados aun"
          />
          <KpiCard
            label="Aduanas abiertas"
            value={loading ? '...' : String(openCustomsEntries.length)}
            detail="Pendientes o en revision"
          />
          <KpiCard
            label={`Inventario visible ${currencyView}`}
            value={loading ? '...' : formatMoneyFromUsd(totalInventoryValueUsd)}
            detail="Disponible por costo landed"
            tone="success"
          />
          <KpiCard
            label="Lotes > 30 dias"
            value={loading ? '...' : String(agedLotsOver30.length)}
            detail={`${agedLotsOver90.length} lotes sobre 90 dias`}
          />
        </div>
      </section>

      {error ? <p className="feedback feedback-error">{error}</p> : null}

      <SectionCard
        title="Resumen por checkpoint"
        subtitle="Vista rapida del estado actual del flujo operativo"
        action={
          <button
            type="button"
            className="ghost-button"
            onClick={handleExportCheckpointSummary}
            disabled={summary.length === 0}
          >
            Exportar CSV
          </button>
        }
      >
        <div className="checkpoint-grid">
          {summary.map((item) => (
            <article key={item.checkpoint} className="checkpoint-card">
              <strong>{item.checkpoint}</strong>
              <span>{item.ordersCount} pedidos</span>
              <small>{item.articlesQuantity} articulos</small>
              <small>{formatMoneyFromUsd(item.usdTotal)}</small>
            </article>
          ))}
        </div>
      </SectionCard>

      <div className="two-column-grid">
        <SectionCard
          title="Operacion logistica viva"
          subtitle="Embarques que siguen avanzando dentro del flujo"
          action={
            <button
              type="button"
              className="ghost-button"
              onClick={handleExportActiveShipments}
              disabled={activeShipments.length === 0}
            >
              Exportar CSV
            </button>
          }
        >
          {activeShipments.length === 0 ? (
            <p className="muted">No hay embarques activos en este momento.</p>
          ) : (
            <div className="stack-list">
              {activeShipments.slice(0, 5).map((shipment) => (
                <div key={shipment.id} className="list-row">
                  <span>
                    {shipment.shipmentNumber} · {shipment.transportMode} ·{' '}
                    {shipment.originLocation ?? 'Origen N/A'} →{' '}
                    {shipment.destinationLocation ?? 'Destino N/A'}
                  </span>
                  <strong>
                    {shipment.status}
                    {shipment.eta ? ` · ETA ${shipment.eta}` : ''}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Aduana abierta"
          subtitle="Expedientes pendientes con costo ya visible"
          action={
            <button
              type="button"
              className="ghost-button"
              onClick={handleExportOpenCustomsEntries}
              disabled={openCustomsEntries.length === 0}
            >
              Exportar CSV
            </button>
          }
        >
          {openCustomsEntries.length === 0 ? (
            <p className="muted">No hay expedientes aduaneros abiertos.</p>
          ) : (
            <div className="stack-list">
              {openCustomsEntries.slice(0, 5).map((entry) => {
                const totalExpensesUsd = entry.expenses.reduce(
                  (sum, expense) => sum + parseDecimal(expense.amountUsd),
                  0,
                );

                return (
                  <div key={entry.id} className="list-row">
                    <span>
                      {entry.entryNumber} · shipment #{entry.shipmentId} ·{' '}
                      {entry.status}
                    </span>
                    <strong>{formatMoneyFromUsd(totalExpensesUsd)}</strong>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="two-column-grid">
        <SectionCard
          title="Inventario lento"
          subtitle="Lotes con mas tiempo en bodega para seguimiento operativo"
          action={
            <button
              type="button"
              className="ghost-button"
              onClick={handleExportInventoryAging}
              disabled={oldestLots.length === 0}
            >
              Exportar CSV
            </button>
          }
        >
          {oldestLots.length === 0 ? (
            <p className="muted">Todavia no hay lotes en inventario.</p>
          ) : (
            <div className="table-shell compact-table">
              <table>
                <thead>
                  <tr>
                    <th>Lote</th>
                    <th>Bodega</th>
                    <th>Dias en bodega</th>
                    <th>Disponible</th>
                    <th>Visible USD</th>
                  </tr>
                </thead>
                <tbody>
                  {oldestLots.map((lot) => (
                    <tr key={lot.id}>
                      <td>{lot.lotCode}</td>
                      <td>
                        {warehousesById.get(Number(lot.warehouseId))?.name ??
                          `Warehouse ${lot.warehouseId}`}
                      </td>
                      <td>{getLotAgeInDays(lot.receivedAt)} dias</td>
                      <td>{lot.availableQuantity}</td>
                      <td>
                        {formatMoneyFromUsd(
                          parseDecimal(lot.availableQuantity) *
                            parseDecimal(lot.unitLandedCostUsd),
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Valor por warehouse"
          subtitle="Distribucion visible del inventario por bodega"
          action={
            <button
              type="button"
              className="ghost-button"
              onClick={handleExportWarehouseMetrics}
              disabled={warehouseMetrics.length === 0}
            >
              Exportar CSV
            </button>
          }
        >
          {warehouseMetrics.length === 0 ? (
            <p className="muted">No hay lotes suficientes para agrupar por bodega.</p>
          ) : (
            <div className="stack-list">
              {warehouseMetrics.map((warehouseMetric) => (
                <div
                  key={warehouseMetric.warehouseName}
                  className="list-row"
                >
                  <span>
                    {warehouseMetric.warehouseName} · {warehouseMetric.lotsCount}{' '}
                    lotes
                  </span>
                  <strong>
                    {formatMoneyFromUsd(warehouseMetric.visibleUsd)} · qty{' '}
                    {warehouseMetric.availableQuantity.toFixed(2)}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="two-column-grid">
        <SectionCard
          title="Ultima proforma procesada"
          subtitle="Documento mas reciente en el pipeline documental"
        >
          {latestUpload ? (
            <div className="stack-list">
              <div className="list-row">
                <span>Archivo</span>
                <strong>{latestUpload.originalFileName}</strong>
              </div>
              <div className="list-row">
                <span>Estado</span>
                <strong>{latestUpload.status}</strong>
              </div>
              <div className="list-row">
                <span>Extracciones</span>
                <strong>{latestUpload.extractions.length}</strong>
              </div>
            </div>
          ) : (
            <p className="muted">Todavia no hay uploads documentales.</p>
          )}
        </SectionCard>

        <SectionCard
          title="Rentabilidad destacada"
          subtitle="Ultima orden de venta con analisis base"
        >
          {salesProfitability ? (
            <div className="stack-list">
              <div className="list-row">
                <span>Orden</span>
                <strong>{salesProfitability.orderNumber}</strong>
              </div>
              <div className="list-row">
                <span>Revenue {currencyView}</span>
                <strong>{formatMoneyFromUsd(salesProfitability.revenueUsd)}</strong>
              </div>
              <div className="list-row">
                <span>Gross margin {currencyView}</span>
                <strong>
                  {formatMoneyFromUsd(salesProfitability.grossMarginUsd)}
                </strong>
              </div>
              <div className="list-row">
                <span>ROI %</span>
                <strong>
                  {salesProfitability.roiPercent?.toFixed(2) ?? 'N/A'}
                </strong>
              </div>
            </div>
          ) : salesOrders.length === 0 ? (
            <p className="muted">No hay ventas listas para analizar.</p>
          ) : (
            <p className="muted">
              Hay ventas registradas, pero no fue posible cargar la rentabilidad
              destacada.
            </p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
