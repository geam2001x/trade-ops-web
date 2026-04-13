import { useEffect, useState } from 'react';

import { useAuth } from '../app/auth';
import {
  type CheckpointArticle,
  type CheckpointSummary,
  type PurchaseOrder,
  getJson,
  postJson,
} from '../app/api';
import { SectionCard } from '../components/ui/SectionCard';

type PurchaseOrderFormState = {
  supplierId: string;
  proformaDocumentUploadId: string;
  orderNumber: string;
  orderDate: string;
  currencyCode: string;
  paymentTerms: string;
  notes: string;
  productId: string;
  productDescriptionSnapshot: string;
  quantityOrdered: string;
  unitMeasure: string;
  unitPriceOriginal: string;
  exchangeRateToUsd: string;
};

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function getInitialOrderForm(): PurchaseOrderFormState {
  return {
    supplierId: '1',
    proformaDocumentUploadId: '',
    orderNumber: '',
    orderDate: getTodayDate(),
    currencyCode: 'USD',
    paymentTerms: '50% advance / 50% before dispatch',
    notes: '',
    productId: '1',
    productDescriptionSnapshot: '',
    quantityOrdered: '1',
    unitMeasure: 'unit',
    unitPriceOriginal: '0',
    exchangeRateToUsd: '1',
  };
}

function parseDecimal(value: string, fallback?: number) {
  const parsed = Number(value);

  if (Number.isFinite(parsed)) {
    return parsed;
  }

  if (typeof fallback === 'number') {
    return fallback;
  }

  throw new Error(`Valor numerico invalido: ${value}`);
}

export function ProcurementPage() {
  const { session } = useAuth();
  const [summary, setSummary] = useState<CheckpointSummary[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState('quotation');
  const [articles, setArticles] = useState<CheckpointArticle[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [advancingOrderId, setAdvancingOrderId] = useState<number | null>(null);
  const [advanceNotes, setAdvanceNotes] = useState('');
  const [orderForm, setOrderForm] = useState<PurchaseOrderFormState>(
    getInitialOrderForm,
  );

  async function loadSummary() {
    const response = await getJson<CheckpointSummary[]>(
      '/procurement/checkpoints/summary',
      session?.accessToken,
    );
    setSummary(response);
  }

  async function loadOrders() {
    const response = await getJson<PurchaseOrder[]>(
      '/procurement/orders',
      session?.accessToken,
    );
    setOrders(response);
    setSelectedOrderId((current) => {
      if (current && response.some((order) => String(order.id) === current)) {
        return current;
      }
      return response.length > 0 ? String(response[0].id) : '';
    });
  }

  async function loadArticles(checkpoint: string) {
    const response = await getJson<CheckpointArticle[]>(
      `/procurement/checkpoints/${checkpoint}/articles`,
      session?.accessToken,
    );
    setArticles(response);
  }

  useEffect(() => {
    async function loadPageData() {
      try {
        setError(null);
        await Promise.all([
          loadSummary(),
          loadOrders(),
          loadArticles(selectedCheckpoint),
        ]);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'No fue posible cargar procurement.',
        );
      }
    }

    void loadPageData();
  }, [selectedCheckpoint, session?.accessToken]);

  async function handleCreateOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session?.user.id) {
      setError('La sesion no tiene un userId valido para crear pedidos.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setSuccessMessage(null);

      const quantityOrdered = parseDecimal(orderForm.quantityOrdered);
      const unitPriceOriginal = parseDecimal(orderForm.unitPriceOriginal);
      const exchangeRateToUsd = parseDecimal(
        orderForm.exchangeRateToUsd,
        orderForm.currencyCode === 'USD' ? 1 : undefined,
      );
      const unitPriceUsd =
        orderForm.currencyCode === 'USD'
          ? unitPriceOriginal
          : unitPriceOriginal / exchangeRateToUsd;
      const lineTotalOriginal = quantityOrdered * unitPriceOriginal;
      const lineTotalUsd = quantityOrdered * unitPriceUsd;

      const createdOrder = await postJson<PurchaseOrder>(
        '/procurement/orders',
        {
          supplierId: parseDecimal(orderForm.supplierId),
          proformaDocumentUploadId: orderForm.proformaDocumentUploadId
            ? parseDecimal(orderForm.proformaDocumentUploadId)
            : undefined,
          orderNumber: orderForm.orderNumber,
          orderDate: orderForm.orderDate,
          currencyCode: orderForm.currencyCode,
          paymentTerms: orderForm.paymentTerms || undefined,
          notes: orderForm.notes || undefined,
          createdByUserId: session.user.id,
          items: [
            {
              productId: parseDecimal(orderForm.productId),
              productDescriptionSnapshot:
                orderForm.productDescriptionSnapshot ||
                `Producto ${orderForm.productId}`,
              quantityOrdered,
              unitMeasure: orderForm.unitMeasure,
              unitPriceOriginal,
              exchangeRateToUsd,
              unitPriceUsd,
              lineTotalOriginal,
              lineTotalUsd,
            },
          ],
        },
        session.accessToken,
      );

      setSuccessMessage(
        `Pedido ${createdOrder.orderNumber} creado en checkpoint quotation.`,
      );
      setOrderForm((current) => ({
        ...getInitialOrderForm(),
        supplierId: current.supplierId,
        productId: current.productId,
        currencyCode: current.currencyCode,
        exchangeRateToUsd: current.currencyCode === 'USD' ? '1' : current.exchangeRateToUsd,
      }));

      await Promise.all([
        loadOrders(),
        loadSummary(),
        loadArticles(selectedCheckpoint),
      ]);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'No fue posible crear el pedido.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAdvanceCheckpoint(order: PurchaseOrder) {
    if (!session?.user.id) {
      setError('La sesion no tiene un userId valido para avanzar checkpoints.');
      return;
    }

    try {
      setAdvancingOrderId(order.id);
      setError(null);
      setSuccessMessage(null);

      await postJson<PurchaseOrder>(
        `/procurement/orders/${order.id}/advance-checkpoint`,
        {
          changedByUserId: session.user.id,
          notes: advanceNotes || undefined,
        },
        session.accessToken,
      );

      setSuccessMessage(
        `Pedido ${order.orderNumber} avanzado a su siguiente checkpoint.`,
      );

      await Promise.all([
        loadOrders(),
        loadSummary(),
        loadArticles(selectedCheckpoint),
      ]);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'No fue posible avanzar el checkpoint.',
      );
    } finally {
      setAdvancingOrderId(null);
    }
  }

  const selectedOrder =
    orders.find((order) => String(order.id) === selectedOrderId) ?? null;

  const quantityPreview = parseDecimal(orderForm.quantityOrdered, 0);
  const unitPriceOriginalPreview = parseDecimal(orderForm.unitPriceOriginal, 0);
  const exchangeRatePreview = parseDecimal(
    orderForm.exchangeRateToUsd,
    orderForm.currencyCode === 'USD' ? 1 : 0,
  );
  const unitPriceUsdPreview =
    orderForm.currencyCode === 'USD'
      ? unitPriceOriginalPreview
      : exchangeRatePreview > 0
        ? unitPriceOriginalPreview / exchangeRatePreview
        : 0;
  const lineTotalOriginalPreview =
    quantityPreview > 0 ? quantityPreview * unitPriceOriginalPreview : 0;
  const lineTotalUsdPreview =
    quantityPreview > 0 ? quantityPreview * unitPriceUsdPreview : 0;

  return (
    <div className="page-grid">
      <SectionCard
        title="Crear pedido de compra"
        subtitle="Formulario real conectado a procurement para registrar una orden inicial"
      >
        <form className="stack-form" onSubmit={handleCreateOrder}>
          <div className="form-grid form-grid-three">
            <label className="field">
              <span>Supplier ID</span>
              <input
                value={orderForm.supplierId}
                onChange={(event) =>
                  setOrderForm((current) => ({
                    ...current,
                    supplierId: event.target.value,
                  }))
                }
                inputMode="numeric"
                required
              />
            </label>

            <label className="field">
              <span>Proforma upload ID</span>
              <input
                value={orderForm.proformaDocumentUploadId}
                onChange={(event) =>
                  setOrderForm((current) => ({
                    ...current,
                    proformaDocumentUploadId: event.target.value,
                  }))
                }
                inputMode="numeric"
                placeholder="Opcional"
              />
            </label>

            <label className="field">
              <span>Numero pedido</span>
              <input
                value={orderForm.orderNumber}
                onChange={(event) =>
                  setOrderForm((current) => ({
                    ...current,
                    orderNumber: event.target.value,
                  }))
                }
                placeholder="PO-2026-001"
                required
              />
            </label>

            <label className="field">
              <span>Fecha pedido</span>
              <input
                type="date"
                value={orderForm.orderDate}
                onChange={(event) =>
                  setOrderForm((current) => ({
                    ...current,
                    orderDate: event.target.value,
                  }))
                }
                required
              />
            </label>

            <label className="field">
              <span>Moneda</span>
              <select
                value={orderForm.currencyCode}
                onChange={(event) =>
                  setOrderForm((current) => ({
                    ...current,
                    currencyCode: event.target.value,
                    exchangeRateToUsd:
                      event.target.value === 'USD'
                        ? '1'
                        : current.exchangeRateToUsd,
                  }))
                }
              >
                <option value="USD">USD</option>
                <option value="CLP">CLP</option>
              </select>
            </label>

            <label className="field">
              <span>TC a USD</span>
              <input
                value={orderForm.exchangeRateToUsd}
                onChange={(event) =>
                  setOrderForm((current) => ({
                    ...current,
                    exchangeRateToUsd: event.target.value,
                  }))
                }
                inputMode="decimal"
                required
              />
            </label>
          </div>

          <div className="form-grid form-grid-four">
            <label className="field">
              <span>Product ID</span>
              <input
                value={orderForm.productId}
                onChange={(event) =>
                  setOrderForm((current) => ({
                    ...current,
                    productId: event.target.value,
                  }))
                }
                inputMode="numeric"
                required
              />
            </label>

            <label className="field">
              <span>Descripcion</span>
              <input
                value={orderForm.productDescriptionSnapshot}
                onChange={(event) =>
                  setOrderForm((current) => ({
                    ...current,
                    productDescriptionSnapshot: event.target.value,
                  }))
                }
                placeholder="Producto importado / color / variante"
                required
              />
            </label>

            <label className="field">
              <span>Cantidad</span>
              <input
                value={orderForm.quantityOrdered}
                onChange={(event) =>
                  setOrderForm((current) => ({
                    ...current,
                    quantityOrdered: event.target.value,
                  }))
                }
                inputMode="decimal"
                required
              />
            </label>

            <label className="field">
              <span>Unidad</span>
              <input
                value={orderForm.unitMeasure}
                onChange={(event) =>
                  setOrderForm((current) => ({
                    ...current,
                    unitMeasure: event.target.value,
                  }))
                }
                placeholder="unit"
                required
              />
            </label>

            <label className="field">
              <span>Precio unitario original</span>
              <input
                value={orderForm.unitPriceOriginal}
                onChange={(event) =>
                  setOrderForm((current) => ({
                    ...current,
                    unitPriceOriginal: event.target.value,
                  }))
                }
                inputMode="decimal"
                required
              />
            </label>

            <label className="field field-span-two">
              <span>Condiciones de pago</span>
              <input
                value={orderForm.paymentTerms}
                onChange={(event) =>
                  setOrderForm((current) => ({
                    ...current,
                    paymentTerms: event.target.value,
                  }))
                }
                placeholder="50% advance / 50% before dispatch"
              />
            </label>
          </div>

          <label className="field">
            <span>Notas operativas</span>
            <textarea
              value={orderForm.notes}
              onChange={(event) =>
                setOrderForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              placeholder="Comentarios para logística, proveedor o validación interna"
              rows={3}
            />
          </label>

          <div className="metric-strip">
            <div className="metric-chip">
              <span>Total original</span>
              <strong>
                {lineTotalOriginalPreview.toFixed(2)} {orderForm.currencyCode}
              </strong>
            </div>
            <div className="metric-chip">
              <span>Total USD</span>
              <strong>{lineTotalUsdPreview.toFixed(2)} USD</strong>
            </div>
          </div>

          <div className="form-actions">
            <button
              type="submit"
              className="primary-button"
              disabled={submitting}
            >
              {submitting ? 'Creando...' : 'Crear pedido'}
            </button>
            {successMessage ? (
              <p className="feedback feedback-success">{successMessage}</p>
            ) : null}
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Checkpoints operativos"
        subtitle="Seguimiento manual del pedido de compra/importacion"
      >
        {error ? <p className="feedback feedback-error">{error}</p> : null}

        <div className="checkpoint-grid">
          {summary.map((item) => (
            <button
              key={item.checkpoint}
              type="button"
              className={
                item.checkpoint === selectedCheckpoint
                  ? 'checkpoint-card checkpoint-card-active'
                  : 'checkpoint-card checkpoint-card-button'
              }
              onClick={() => setSelectedCheckpoint(item.checkpoint)}
            >
              <strong>{item.checkpoint}</strong>
              <span>{item.ordersCount} pedidos</span>
              <small>{item.articlesQuantity} articulos</small>
              <small>{item.usdTotal.toFixed(2)} USD</small>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Pedidos recientes"
        subtitle="Ultimas ordenes creadas desde procurement y desde documentos"
      >
        <div className="table-actions">
          <label className="field field-span-two">
            <span>Nota para avance de checkpoint</span>
            <input
              value={advanceNotes}
              onChange={(event) => setAdvanceNotes(event.target.value)}
              placeholder="Comentario opcional para el historial"
            />
          </label>
        </div>

        {orders.length === 0 ? (
          <p className="muted">Todavia no hay pedidos registrados.</p>
        ) : (
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Supplier</th>
                  <th>Moneda</th>
                  <th>Checkpoint</th>
                  <th>Items</th>
                  <th>Total USD</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const isFinal = order.currentCheckpointStatus === 'sold_or_paid';

                  return (
                    <tr key={order.id}>
                      <td>{order.orderNumber}</td>
                      <td>{order.supplierId}</td>
                      <td>{order.currencyCode}</td>
                      <td>{order.currentCheckpointStatus}</td>
                      <td>{order.items.length}</td>
                      <td>
                        {order.items
                          .reduce(
                            (total, item) => total + Number(item.lineTotalUsd),
                            0,
                          )
                          .toFixed(2)}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="ghost-button"
                          disabled={isFinal || advancingOrderId === order.id}
                          onClick={() => void handleAdvanceCheckpoint(order)}
                        >
                          {advancingOrderId === order.id
                            ? 'Avanzando...'
                            : isFinal
                              ? 'Finalizado'
                              : 'Avanzar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Historial de checkpoints"
        subtitle="Auditoria de avances manuales y automaticos por pedido"
      >
        {orders.length === 0 ? (
          <p className="muted">Todavia no hay pedidos para auditar.</p>
        ) : (
          <div className="stack-form">
            <div className="form-grid form-grid-three">
              <label className="field field-span-two">
                <span>Pedido</span>
                <select
                  value={selectedOrderId}
                  onChange={(event) => setSelectedOrderId(event.target.value)}
                >
                  {orders.map((order) => (
                    <option key={order.id} value={order.id}>
                      #{order.id} · {order.orderNumber} · {order.currentCheckpointStatus}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Checkpoint actual</span>
                <input
                  value={selectedOrder?.currentCheckpointStatus ?? 'N/A'}
                  readOnly
                />
              </label>
            </div>

            {!selectedOrder || selectedOrder.checkpointEvents.length === 0 ? (
              <p className="muted">
                No hay eventos registrados para este pedido.
              </p>
            ) : (
              <div className="table-shell">
                <table>
                  <thead>
                    <tr>
                      <th>Desde</th>
                      <th>Hacia</th>
                      <th>Usuario</th>
                      <th>Fecha</th>
                      <th>Notas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.checkpointEvents.map((event) => (
                      <tr key={event.id}>
                        <td>{event.fromCheckpoint ?? 'inicio'}</td>
                        <td>{event.toCheckpoint}</td>
                        <td>{event.changedByUserId}</td>
                        <td>
                          {new Intl.DateTimeFormat('es-CL', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }).format(new Date(event.changedAt))}
                        </td>
                        <td>{event.notes ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Articulos en el checkpoint seleccionado"
        subtitle={`Estado activo: ${selectedCheckpoint}`}
      >
        {articles.length === 0 ? (
          <p className="muted">
            No hay articulos visibles en este punto del flujo todavia.
          </p>
        ) : (
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Producto</th>
                  <th>Descripcion</th>
                  <th>Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {articles.map((item) => (
                  <tr
                    key={`${item.purchaseOrderId}-${item.productId}-${item.checkpoint}`}
                  >
                    <td>{item.orderNumber}</td>
                    <td>{item.productId}</td>
                    <td>{item.productDescriptionSnapshot}</td>
                    <td>{item.articlesQuantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
