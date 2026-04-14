import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '../app/auth';
import {
  type Customer,
  type InventoryLot,
  type LatestExchangeRate,
  type Product,
  type SalesOrder,
  getJson,
  patchJson,
  postJson,
} from '../app/api';
import { downloadCsv } from '../app/export';
import { SectionCard } from '../components/ui/SectionCard';

type SalesFormState = {
  saleType: 'retail' | 'wholesale';
  orderNumber: string;
  orderDate: string;
  currencyCode: 'USD' | 'CLP';
  exchangeRateToUsd: string;
  customerId: string;
  customerNameSnapshot: string;
  customerTaxIdSnapshot: string;
  notes: string;
  inventoryLotId: string;
  productDescriptionSnapshot: string;
  quantity: string;
  unitPriceOriginal: string;
};

type SalesStatusFormState = {
  salesOrderId: string;
  status: 'quoted' | 'confirmed' | 'dispatched' | 'completed' | 'cancelled';
  notes: string;
};

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function getInitialSalesForm(): SalesFormState {
  return {
    saleType: 'retail',
    orderNumber: '',
    orderDate: getTodayDate(),
    currencyCode: 'USD',
    exchangeRateToUsd: '1',
    customerId: '',
    customerNameSnapshot: '',
    customerTaxIdSnapshot: '',
    notes: '',
    inventoryLotId: '',
    productDescriptionSnapshot: '',
    quantity: '1',
    unitPriceOriginal: '0',
  };
}

function getInitialStatusForm(): SalesStatusFormState {
  return {
    salesOrderId: '',
    status: 'quoted',
    notes: '',
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

export function SalesPage() {
  const { session } = useAuth();
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [latestExchangeRate, setLatestExchangeRate] =
    useState<LatestExchangeRate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [form, setForm] = useState<SalesFormState>(getInitialSalesForm);
  const [statusForm, setStatusForm] =
    useState<SalesStatusFormState>(getInitialStatusForm);

  const selectedLot = useMemo(
    () => lots.find((lot) => String(lot.id) === form.inventoryLotId) ?? null,
    [lots, form.inventoryLotId],
  );

  const customersById = useMemo(
    () => new Map(customers.map((customer) => [String(customer.id), customer])),
    [customers],
  );

  const productsById = useMemo(
    () => new Map(products.map((product) => [String(product.id), product])),
    [products],
  );

  const selectedCustomer = customersById.get(form.customerId) ?? null;
  const selectedLotProduct = selectedLot
    ? productsById.get(String(selectedLot.productId)) ?? null
    : null;

  useEffect(() => {
    async function loadData() {
      try {
        setError(null);
        const [
          ordersResponse,
          lotsResponse,
          customersResponse,
          productsResponse,
          latestRateResponse,
        ] = await Promise.all([
          getJson<SalesOrder[]>('/sales/orders', session?.accessToken),
          getJson<InventoryLot[]>('/inventory/lots', session?.accessToken),
          getJson<Customer[]>('/master-data/customers', session?.accessToken),
          getJson<Product[]>('/master-data/products', session?.accessToken),
          getJson<LatestExchangeRate>(
            '/finance/exchange-rates/latest?base=USD&quote=CLP',
            session?.accessToken,
          ).catch(() => null),
        ]);
        setOrders(ordersResponse);
        setLots(lotsResponse);
        setCustomers(customersResponse);
        setProducts(productsResponse);
        setLatestExchangeRate(latestRateResponse);
        setForm((current) => ({
          ...current,
          inventoryLotId:
            current.inventoryLotId ||
            (lotsResponse.length > 0 ? String(lotsResponse[0].id) : ''),
          customerId:
            current.customerId ||
            (customersResponse.length > 0 ? String(customersResponse[0].id) : ''),
        }));
        setStatusForm((current) => ({
          ...current,
          salesOrderId:
            current.salesOrderId ||
            (ordersResponse.length > 0 ? String(ordersResponse[0].id) : ''),
          status:
            ordersResponse.length > 0
              ? (ordersResponse[0].status as SalesStatusFormState['status'])
              : current.status,
        }));
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'No fue posible cargar ventas o lotes.',
        );
      }
    }

    void loadData();
  }, [session?.accessToken]);

  useEffect(() => {
    if (!selectedLot) {
      return;
    }

    setForm((current) => ({
      ...current,
      productDescriptionSnapshot:
        current.productDescriptionSnapshot ||
        selectedLotProduct?.name ||
        `Producto ${selectedLot.productId} · ${selectedLot.lotCode}`,
      unitPriceOriginal:
        current.unitPriceOriginal !== '0'
          ? current.unitPriceOriginal
          : selectedLotProduct?.defaultSalePriceUsd ?? current.unitPriceOriginal,
    }));
  }, [selectedLot, selectedLotProduct]);

  useEffect(() => {
    if (!selectedCustomer) {
      return;
    }

    setForm((current) => ({
      ...current,
      customerNameSnapshot: current.customerNameSnapshot || selectedCustomer.name,
      customerTaxIdSnapshot:
        current.customerTaxIdSnapshot || selectedCustomer.taxId || '',
    }));
  }, [selectedCustomer]);

  useEffect(() => {
    if (form.currencyCode !== 'CLP' || !latestExchangeRate) {
      return;
    }

    setForm((current) => {
      const currentRate = parseDecimal(current.exchangeRateToUsd, 0);

      if (currentRate > 0 && currentRate !== 1) {
        return current;
      }

      return {
        ...current,
        exchangeRateToUsd: String(latestExchangeRate.rate),
      };
    });
  }, [form.currencyCode, latestExchangeRate]);

  const quantity = parseDecimal(form.quantity, 0);
  const unitPriceOriginal = parseDecimal(form.unitPriceOriginal, 0);
  const exchangeRateToUsd = parseDecimal(
    form.exchangeRateToUsd,
    form.currencyCode === 'USD' ? 1 : 0,
  );
  const unitPriceUsd =
    form.currencyCode === 'USD'
      ? unitPriceOriginal
      : exchangeRateToUsd > 0
        ? unitPriceOriginal / exchangeRateToUsd
        : 0;
  const lineTotalOriginal = quantity * unitPriceOriginal;
  const lineTotalUsd = quantity * unitPriceUsd;
  const snapshotRate = latestExchangeRate?.rate ?? null;
  const snapshotBuyRate = latestExchangeRate?.buyRate ?? null;
  const snapshotSellRate = latestExchangeRate?.sellRate ?? null;
  const lineTotalClpFromUsd = snapshotRate ? lineTotalUsd * snapshotRate : null;

  function handleExportSalesOrders() {
    downloadCsv(
      `sales-orders-${getTodayDate()}.csv`,
      [
        'order_number',
        'sale_type',
        'status',
        'order_date',
        'currency_code',
        'exchange_rate_to_usd',
        'total_original',
        'total_usd',
        'reference_total_clp',
        'bcch_rate_clp',
        'bank_buy_rate_clp',
        'bank_sell_rate_clp',
      ],
      orders.map((order) => {
        const totalUsd = parseDecimal(order.totalUsd, 0);

        return [
          order.orderNumber,
          order.saleType,
          order.status,
          order.orderDate,
          order.currencyCode,
          order.exchangeRateToUsd,
          order.totalOriginal,
          totalUsd.toFixed(2),
          snapshotRate ? (totalUsd * snapshotRate).toFixed(0) : null,
          snapshotRate,
          snapshotBuyRate,
          snapshotSellRate,
        ];
      }),
    );
  }

  async function handleCreateSalesOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session?.user.id) {
      setError('La sesion no tiene un userId valido para crear ventas.');
      return;
    }

    if (!selectedLot) {
      setError('Selecciona un lote valido para consumir inventario.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setSuccessMessage(null);

      const createdOrder = await postJson<SalesOrder>(
        '/sales/orders',
        {
          customerId: form.customerId ? parseDecimal(form.customerId) : undefined,
          saleType: form.saleType,
          orderNumber: form.orderNumber,
          orderDate: form.orderDate,
          currencyCode: form.currencyCode,
          exchangeRateToUsd,
          totalOriginal: lineTotalOriginal,
          totalUsd: lineTotalUsd,
          status: 'quoted',
          customerNameSnapshot: form.customerNameSnapshot || undefined,
          customerTaxIdSnapshot: form.customerTaxIdSnapshot || undefined,
          notes: form.notes || undefined,
          createdByUserId: session.user.id,
          items: [
            {
              productId: Number(selectedLot.productId),
              productDescriptionSnapshot: form.productDescriptionSnapshot,
              quantity,
              unitPriceOriginal,
              unitPriceUsd,
              lineTotalOriginal,
              lineTotalUsd,
              lots: [
                {
                  inventoryLotId: Number(selectedLot.id),
                  quantityConsumed: quantity,
                },
              ],
            },
          ],
        },
        session.accessToken,
      );

      setSuccessMessage(`Venta ${createdOrder.orderNumber} creada en estado quoted.`);
      setForm((current) => ({
        ...getInitialSalesForm(),
        inventoryLotId: current.inventoryLotId,
        customerId: current.customerId,
        currencyCode: current.currencyCode,
        exchangeRateToUsd:
          current.currencyCode === 'USD' ? '1' : current.exchangeRateToUsd,
      }));

      const [
        ordersResponse,
        lotsResponse,
        customersResponse,
        productsResponse,
        latestRateResponse,
      ] = await Promise.all([
        getJson<SalesOrder[]>('/sales/orders', session?.accessToken),
        getJson<InventoryLot[]>('/inventory/lots', session?.accessToken),
        getJson<Customer[]>('/master-data/customers', session?.accessToken),
        getJson<Product[]>('/master-data/products', session?.accessToken),
        getJson<LatestExchangeRate>(
          '/finance/exchange-rates/latest?base=USD&quote=CLP',
          session?.accessToken,
        ).catch(() => null),
      ]);
      setOrders(ordersResponse);
      setLots(lotsResponse);
      setCustomers(customersResponse);
      setProducts(productsResponse);
      setLatestExchangeRate(latestRateResponse);
      setStatusForm((current) => ({
        ...current,
        salesOrderId:
          ordersResponse.length > 0 ? String(ordersResponse[0].id) : current.salesOrderId,
        status:
          ordersResponse.length > 0
            ? (ordersResponse[0].status as SalesStatusFormState['status'])
            : current.status,
      }));
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'No fue posible crear la venta.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateStatus(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!statusForm.salesOrderId) {
      setError('Selecciona una orden de venta para actualizar su estado.');
      return;
    }

    if (!session?.user.id) {
      setError('La sesion no tiene un userId valido para actualizar ventas.');
      return;
    }

    try {
      setUpdatingStatus(true);
      setError(null);
      setSuccessMessage(null);

      await patchJson<SalesOrder>(
        `/sales/orders/${statusForm.salesOrderId}/status`,
        {
          status: statusForm.status,
          changedByUserId: session.user.id,
          notes: statusForm.notes || undefined,
        },
        session?.accessToken,
      );

      setSuccessMessage(
        `Estado actualizado a ${statusForm.status} para la venta seleccionada.`,
      );

      const ordersResponse = await getJson<SalesOrder[]>(
        '/sales/orders',
        session?.accessToken,
      );
      setOrders(ordersResponse);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'No fue posible actualizar el estado de la venta.',
      );
    } finally {
      setUpdatingStatus(false);
    }
  }

  return (
    <div className="page-grid">
      <SectionCard
        title="Crear venta"
        subtitle="Formulario real conectado a sales con consumo directo de lotes y conversion USD / CLP"
      >
        {error ? <p className="feedback feedback-error">{error}</p> : null}
        {successMessage ? (
          <p className="feedback feedback-success">{successMessage}</p>
        ) : null}
        {customers.length === 0 ? (
          <p className="feedback feedback-warning">
            Aun no hay clientes activos en Maestros. Puedes seguir digitando el
            cliente manualmente, pero conviene cargar el catalogo.
          </p>
        ) : null}

        <div className="info-banner" style={{ marginBottom: '1rem' }}>
          <strong>Tipo de cambio del dia</strong>
          <span>
            {latestExchangeRate
              ? `BCCh USD/CLP ${formatClp(latestExchangeRate.rate)}${
                  latestExchangeRate.buySellSourceName
                    ? ` · Banco compra ${snapshotBuyRate ? formatClp(snapshotBuyRate) : 'N/D'} · Banco vende ${snapshotSellRate ? formatClp(snapshotSellRate) : 'N/D'}`
                    : ''
                }`
              : 'No hay snapshot USD/CLP disponible. Puedes seguir trabajando en USD o indicar manualmente el TC a USD.'}
          </span>
        </div>

        <form className="stack-form" onSubmit={handleCreateSalesOrder}>
          <div className="form-grid form-grid-three">
            <label className="field">
              <span>Tipo venta</span>
              <select
                value={form.saleType}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    saleType: event.target.value as 'retail' | 'wholesale',
                  }))
                }
              >
                <option value="retail">retail</option>
                <option value="wholesale">wholesale</option>
              </select>
            </label>

            <label className="field">
              <span>Numero orden</span>
              <input
                value={form.orderNumber}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    orderNumber: event.target.value,
                  }))
                }
                placeholder="SO-2026-001"
                required
              />
            </label>

            <label className="field">
              <span>Fecha venta</span>
              <input
                type="date"
                value={form.orderDate}
                onChange={(event) =>
                  setForm((current) => ({
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
                value={form.currencyCode}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    currencyCode: event.target.value as 'USD' | 'CLP',
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
                value={form.exchangeRateToUsd}
                onChange={(event) =>
                  setForm((current) => ({
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
              <span>Cliente del catalogo</span>
              <select
                value={form.customerId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    customerId: event.target.value,
                    customerNameSnapshot:
                      customersById.get(event.target.value)?.name ?? current.customerNameSnapshot,
                    customerTaxIdSnapshot:
                      (customersById.get(event.target.value)?.taxId ||
                        current.customerTaxIdSnapshot),
                  }))
                }
              >
                <option value="">Seleccion manual / sin catalogo</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    #{customer.id} · {customer.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field field-span-two">
              <span>Cliente (nombre)</span>
              <input
                value={form.customerNameSnapshot}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    customerNameSnapshot: event.target.value,
                  }))
                }
                placeholder="Nombre cliente o empresa"
              />
            </label>

            <label className="field">
              <span>Cliente ID manual</span>
              <input
                value={form.customerId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    customerId: event.target.value,
                  }))
                }
                inputMode="numeric"
                placeholder="Opcional"
              />
            </label>

            <label className="field">
              <span>RUT</span>
              <input
                value={form.customerTaxIdSnapshot}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    customerTaxIdSnapshot: event.target.value,
                  }))
                }
                placeholder="Opcional"
              />
            </label>
          </div>

          <div className="form-grid form-grid-four">
            <label className="field field-span-two">
              <span>Lote origen</span>
              <select
                value={form.inventoryLotId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    inventoryLotId: event.target.value,
                  }))
                }
                required
              >
                {lots.map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    #{lot.id} · {lot.lotCode} · disponible {lot.availableQuantity}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Cantidad</span>
              <input
                value={form.quantity}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    quantity: event.target.value,
                  }))
                }
                inputMode="decimal"
                required
              />
            </label>

            <label className="field">
              <span>Precio unitario</span>
              <input
                value={form.unitPriceOriginal}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    unitPriceOriginal: event.target.value,
                  }))
                }
                inputMode="decimal"
                required
              />
            </label>

            <label className="field field-span-two">
              <span>Descripcion</span>
              <input
                value={form.productDescriptionSnapshot}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    productDescriptionSnapshot: event.target.value,
                  }))
                }
                placeholder="Descripcion a mostrar en venta"
                required
              />
            </label>
          </div>

          <label className="field">
            <span>Notas</span>
            <textarea
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({ ...current, notes: event.target.value }))
              }
              rows={3}
            />
          </label>

          <div className="metric-strip">
            <div className="metric-chip">
              <span>Total original</span>
              <strong>
                {lineTotalOriginal.toFixed(2)} {form.currencyCode}
              </strong>
            </div>
            <div className="metric-chip">
              <span>Total USD</span>
              <strong>{formatUsd(lineTotalUsd)} USD</strong>
            </div>
            <div className="metric-chip">
              <span>Total CLP referencial</span>
              <strong>
                {lineTotalClpFromUsd !== null
                  ? `${formatClp(lineTotalClpFromUsd)} CLP`
                  : 'N/D'}
              </strong>
            </div>
          </div>

          <div className="form-actions">
            <button
              type="submit"
              className="primary-button"
              disabled={submitting}
            >
              {submitting ? 'Creando...' : 'Crear venta'}
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Ventas recientes"
        subtitle="Listado simple con lectura en USD y CLP usando el snapshot del dia"
        action={
          <button
            type="button"
            className="ghost-button"
            onClick={handleExportSalesOrders}
            disabled={orders.length === 0}
          >
            Exportar CSV
          </button>
        }
      >
        {orders.length === 0 ? (
          <p className="muted">Todavia no hay ventas registradas.</p>
        ) : (
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                  <th>Total USD</th>
                  <th>Total CLP ref.</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.orderNumber}</td>
                    <td>{order.saleType}</td>
                    <td>{order.status}</td>
                    <td>{order.orderDate}</td>
                    <td>{formatUsd(parseDecimal(order.totalUsd, 0))}</td>
                    <td>
                      {snapshotRate
                        ? formatClp(parseDecimal(order.totalUsd, 0) * snapshotRate)
                        : 'N/D'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {latestExchangeRate ? (
          <p className="muted" style={{ marginTop: '0.8rem' }}>
            Exportacion referencial con snapshot activo: 1 USD ={' '}
            {formatClp(latestExchangeRate.rate)} CLP.
          </p>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Actualizar estado de venta"
        subtitle="Marca la venta como confirmada, despachada o completada"
      >
        {orders.length === 0 ? (
          <p className="muted">Todavia no hay ventas para actualizar.</p>
        ) : (
          <form className="stack-form" onSubmit={handleUpdateStatus}>
            <div className="form-grid form-grid-three">
              <label className="field">
                <span>Orden</span>
                <select
                  value={statusForm.salesOrderId}
                  onChange={(event) =>
                    setStatusForm((current) => ({
                      ...current,
                      salesOrderId: event.target.value,
                    }))
                  }
                  required
                >
                  {orders.map((order) => (
                    <option key={order.id} value={order.id}>
                      #{order.id} · {order.orderNumber} · {order.status}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Nuevo estado</span>
                <select
                  value={statusForm.status}
                  onChange={(event) =>
                    setStatusForm((current) => ({
                      ...current,
                      status: event.target.value as SalesStatusFormState['status'],
                    }))
                  }
                >
                  <option value="quoted">quoted</option>
                  <option value="confirmed">confirmed</option>
                  <option value="dispatched">dispatched</option>
                  <option value="completed">completed</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </label>

              <label className="field">
                <span>Notas</span>
                <input
                  value={statusForm.notes}
                  onChange={(event) =>
                    setStatusForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Motivo o comentario opcional"
                />
              </label>
            </div>

            <div className="form-actions">
              <button
                type="submit"
                className="primary-button"
                disabled={updatingStatus}
              >
                {updatingStatus ? 'Actualizando...' : 'Actualizar estado'}
              </button>
            </div>
          </form>
        )}
      </SectionCard>
    </div>
  );
}
