import { useEffect, useState } from 'react';

import { useAuth } from '../app/auth';
import {
  type InventoryLot,
  type InventoryLotProfitability,
  type SalesOrder,
  type SalesOrderProfitability,
  getJson,
} from '../app/api';
import { SectionCard } from '../components/ui/SectionCard';

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
  const [error, setError] = useState<string | null>(null);

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
    async function loadLot() {
      if (!selectedLotId) {
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

  return (
    <div className="page-grid">
      {error ? <p className="feedback feedback-error">{error}</p> : null}

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
                <strong>{orderProfitability.revenueUsd.toFixed(2)}</strong>
              </div>
              <div className="list-row">
                <span>Cost USD</span>
                <strong>{orderProfitability.costUsd.toFixed(2)}</strong>
              </div>
              <div className="list-row">
                <span>Gross margin USD</span>
                <strong>{orderProfitability.grossMarginUsd.toFixed(2)}</strong>
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
