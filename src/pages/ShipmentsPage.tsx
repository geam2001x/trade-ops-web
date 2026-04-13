import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../app/auth';
import {
  type PurchaseOrder,
  type Shipment,
  getJson,
  patchJson,
  postJson,
} from '../app/api';
import { SectionCard } from '../components/ui/SectionCard';

type ShipmentItemDraft = {
  purchaseOrderItemId: string;
  productId: string;
  productDescriptionSnapshot: string;
  quantityShipped: string;
};

type ShipmentFormState = {
  purchaseOrderId: string;
  shipmentNumber: string;
  transportMode: 'sea' | 'air' | 'land';
  carrierName: string;
  originLocation: string;
  destinationLocation: string;
  trackingReference: string;
  etd: string;
  eta: string;
  status:
    | 'planned'
    | 'in_origin'
    | 'in_transit'
    | 'arrived'
    | 'customs'
    | 'released'
    | 'delivered';
  items: ShipmentItemDraft[];
};

type ShipmentEventFormState = {
  shipmentId: string;
  eventType: string;
  eventDate: string;
  location: string;
  description: string;
  shipmentStatus: string;
};

type ShipmentStatusFormState = {
  shipmentId: string;
  status:
    | 'planned'
    | 'in_origin'
    | 'in_transit'
    | 'arrived'
    | 'customs'
    | 'released'
    | 'delivered';
  description: string;
};

const transportModeOptions = ['sea', 'air', 'land'] as const;
const shipmentStatusOptions = [
  'planned',
  'in_origin',
  'in_transit',
  'arrived',
  'customs',
  'released',
  'delivered',
] as const;

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function getCurrentDateTimeLocal() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
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

function buildShipmentItems(order: PurchaseOrder | null) {
  if (!order) {
    return [] as ShipmentItemDraft[];
  }

  return order.items.map((item) => ({
    purchaseOrderItemId: String(item.id),
    productId: String(item.productId),
    productDescriptionSnapshot: item.productDescriptionSnapshot,
    quantityShipped: item.quantityOrdered,
  }));
}

function getInitialShipmentForm(): ShipmentFormState {
  return {
    purchaseOrderId: '',
    shipmentNumber: '',
    transportMode: 'sea',
    carrierName: '',
    originLocation: '',
    destinationLocation: 'Chile Warehouse',
    trackingReference: '',
    etd: getTodayDate(),
    eta: '',
    status: 'planned',
    items: [],
  };
}

function getInitialEventForm(): ShipmentEventFormState {
  return {
    shipmentId: '',
    eventType: 'tracking_update',
    eventDate: getCurrentDateTimeLocal(),
    location: '',
    description: '',
    shipmentStatus: '',
  };
}

function getInitialStatusForm(): ShipmentStatusFormState {
  return {
    shipmentId: '',
    status: 'planned',
    description: '',
  };
}

export function ShipmentsPage() {
  const { session } = useAuth();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState('');
  const [shipmentForm, setShipmentForm] = useState<ShipmentFormState>(
    getInitialShipmentForm,
  );
  const [eventForm, setEventForm] = useState<ShipmentEventFormState>(
    getInitialEventForm,
  );
  const [statusForm, setStatusForm] = useState<ShipmentStatusFormState>(
    getInitialStatusForm,
  );
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [creatingShipment, setCreatingShipment] = useState(false);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const selectedShipment = useMemo(
    () =>
      shipments.find((shipment) => String(shipment.id) === selectedShipmentId) ??
      null,
    [selectedShipmentId, shipments],
  );

  const syncShipmentFormWithOrder = useCallback(
    (availableOrders: PurchaseOrder[], nextOrderId: string) => {
      const nextOrder =
        availableOrders.find((order) => String(order.id) === nextOrderId) ?? null;

      setShipmentForm((current) => ({
        ...current,
        purchaseOrderId: nextOrderId,
        shipmentNumber:
          current.purchaseOrderId === nextOrderId && current.shipmentNumber
            ? current.shipmentNumber
            : nextOrder
              ? `SHP-${nextOrder.orderNumber}`
              : '',
        items: buildShipmentItems(nextOrder),
      }));
    },
    [],
  );

  const loadOrders = useCallback(async () => {
    const response = await getJson<PurchaseOrder[]>(
      '/procurement/orders',
      session?.accessToken,
    );

    setOrders(response);

    const nextOrderId =
      response.find((order) => String(order.id) === shipmentForm.purchaseOrderId)
        ? shipmentForm.purchaseOrderId
        : response.length > 0
          ? String(response[0].id)
          : '';

    syncShipmentFormWithOrder(response, nextOrderId);
  }, [
    session?.accessToken,
    shipmentForm.purchaseOrderId,
    syncShipmentFormWithOrder,
  ]);

  const loadShipments = useCallback(async () => {
    const response = await getJson<Shipment[]>(
      '/shipments',
      session?.accessToken,
    );

    setShipments(response);
    setSelectedShipmentId((current) => {
      if (current && response.some((shipment) => String(shipment.id) === current)) {
        return current;
      }

      return response.length > 0 ? String(response[0].id) : '';
    });
  }, [session?.accessToken]);

  useEffect(() => {
    async function loadPageData() {
      try {
        setError(null);
        await Promise.all([loadOrders(), loadShipments()]);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'No fue posible cargar embarques.',
        );
      }
    }

    void loadPageData();
  }, [loadOrders, loadShipments]);

  useEffect(() => {
    if (!selectedShipment) {
      setEventForm(getInitialEventForm());
      setStatusForm(getInitialStatusForm());
      return;
    }

    setEventForm((current) => ({
      ...current,
      shipmentId: String(selectedShipment.id),
    }));
    setStatusForm({
      shipmentId: String(selectedShipment.id),
      status: selectedShipment.status as ShipmentStatusFormState['status'],
      description: '',
    });
  }, [selectedShipment]);

  const totalDraftQuantity = shipmentForm.items.reduce(
    (sum, item) => sum + parseDecimal(item.quantityShipped, 0),
    0,
  );

  async function handleCreateShipment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!shipmentForm.purchaseOrderId) {
      setError('Selecciona un pedido para crear el embarque.');
      return;
    }

    const payloadItems = shipmentForm.items
      .map((item) => ({
        purchaseOrderItemId: parseDecimal(item.purchaseOrderItemId),
        productId: parseDecimal(item.productId),
        quantityShipped: parseDecimal(item.quantityShipped, 0),
      }))
      .filter((item) => item.quantityShipped > 0);

    if (payloadItems.length === 0) {
      setError('Debes indicar al menos una linea con cantidad mayor a cero.');
      return;
    }

    try {
      setCreatingShipment(true);
      setError(null);
      setSuccessMessage(null);

      const createdShipment = await postJson<Shipment>(
        '/shipments',
        {
          purchaseOrderId: parseDecimal(shipmentForm.purchaseOrderId),
          shipmentNumber: shipmentForm.shipmentNumber,
          transportMode: shipmentForm.transportMode,
          carrierName: shipmentForm.carrierName || undefined,
          originLocation: shipmentForm.originLocation || undefined,
          destinationLocation: shipmentForm.destinationLocation || undefined,
          trackingReference: shipmentForm.trackingReference || undefined,
          etd: shipmentForm.etd || undefined,
          eta: shipmentForm.eta || undefined,
          status: shipmentForm.status,
          items: payloadItems,
        },
        session?.accessToken,
      );

      setSuccessMessage(
        `Embarque ${createdShipment.shipmentNumber} creado y listo para seguimiento.`,
      );

      await Promise.all([loadShipments(), loadOrders()]);
      setSelectedShipmentId(String(createdShipment.id));
      syncShipmentFormWithOrder(orders, shipmentForm.purchaseOrderId);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'No fue posible crear el embarque.',
      );
    } finally {
      setCreatingShipment(false);
    }
  }

  async function handleCreateEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!eventForm.shipmentId) {
      setError('Selecciona un embarque para registrar eventos.');
      return;
    }

    try {
      setCreatingEvent(true);
      setError(null);
      setSuccessMessage(null);

      await postJson<Shipment>(
        `/shipments/${eventForm.shipmentId}/events`,
        {
          eventType: eventForm.eventType,
          eventDate: eventForm.eventDate,
          location: eventForm.location || undefined,
          description: eventForm.description || undefined,
          shipmentStatus: eventForm.shipmentStatus || undefined,
        },
        session?.accessToken,
      );

      setSuccessMessage('Evento logistico registrado correctamente.');
      await loadShipments();
      setEventForm((current) => ({
        ...getInitialEventForm(),
        shipmentId: current.shipmentId,
      }));
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'No fue posible registrar el evento.',
      );
    } finally {
      setCreatingEvent(false);
    }
  }

  async function handleUpdateStatus(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!statusForm.shipmentId) {
      setError('Selecciona un embarque para actualizar el estado.');
      return;
    }

    try {
      setUpdatingStatus(true);
      setError(null);
      setSuccessMessage(null);

      await patchJson<Shipment>(
        `/shipments/${statusForm.shipmentId}/status`,
        {
          status: statusForm.status,
          description: statusForm.description || undefined,
        },
        session?.accessToken,
      );

      setSuccessMessage(`Estado de embarque actualizado a ${statusForm.status}.`);
      await loadShipments();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'No fue posible actualizar el estado del embarque.',
      );
    } finally {
      setUpdatingStatus(false);
    }
  }

  return (
    <div className="page-grid">
      <SectionCard
        title="Crear embarque"
        subtitle="Conecta pedidos de compra con transporte y trazabilidad internacional"
      >
        {error ? <p className="feedback feedback-error">{error}</p> : null}
        {successMessage ? (
          <p className="feedback feedback-success">{successMessage}</p>
        ) : null}

        <form className="stack-form" onSubmit={handleCreateShipment}>
          <div className="form-grid form-grid-three">
            <label className="field">
              <span>Pedido compra</span>
              <select
                value={shipmentForm.purchaseOrderId}
                onChange={(currentEvent) =>
                  syncShipmentFormWithOrder(orders, currentEvent.target.value)
                }
              >
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.orderNumber}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Numero embarque</span>
              <input
                value={shipmentForm.shipmentNumber}
                onChange={(currentEvent) =>
                  setShipmentForm((current) => ({
                    ...current,
                    shipmentNumber: currentEvent.target.value,
                  }))
                }
                placeholder="SHP-PO-2026-001"
                required
              />
            </label>

            <label className="field">
              <span>Modo transporte</span>
              <select
                value={shipmentForm.transportMode}
                onChange={(currentEvent) =>
                  setShipmentForm((current) => ({
                    ...current,
                    transportMode:
                      currentEvent.target.value as ShipmentFormState['transportMode'],
                  }))
                }
              >
                {transportModeOptions.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Carrier</span>
              <input
                value={shipmentForm.carrierName}
                onChange={(currentEvent) =>
                  setShipmentForm((current) => ({
                    ...current,
                    carrierName: currentEvent.target.value,
                  }))
                }
                placeholder="Maersk / LATAM Cargo"
              />
            </label>

            <label className="field">
              <span>Origen</span>
              <input
                value={shipmentForm.originLocation}
                onChange={(currentEvent) =>
                  setShipmentForm((current) => ({
                    ...current,
                    originLocation: currentEvent.target.value,
                  }))
                }
                placeholder="Shenzhen / Miami"
              />
            </label>

            <label className="field">
              <span>Destino</span>
              <input
                value={shipmentForm.destinationLocation}
                onChange={(currentEvent) =>
                  setShipmentForm((current) => ({
                    ...current,
                    destinationLocation: currentEvent.target.value,
                  }))
                }
                placeholder="Santiago / warehouse"
              />
            </label>

            <label className="field">
              <span>Tracking</span>
              <input
                value={shipmentForm.trackingReference}
                onChange={(currentEvent) =>
                  setShipmentForm((current) => ({
                    ...current,
                    trackingReference: currentEvent.target.value,
                  }))
                }
                placeholder="BL / AWB / tracking"
              />
            </label>

            <label className="field">
              <span>ETD</span>
              <input
                type="date"
                value={shipmentForm.etd}
                onChange={(currentEvent) =>
                  setShipmentForm((current) => ({
                    ...current,
                    etd: currentEvent.target.value,
                  }))
                }
              />
            </label>

            <label className="field">
              <span>ETA</span>
              <input
                type="date"
                value={shipmentForm.eta}
                onChange={(currentEvent) =>
                  setShipmentForm((current) => ({
                    ...current,
                    eta: currentEvent.target.value,
                  }))
                }
              />
            </label>
          </div>

          <div className="info-banner">
            <strong>Items incluidos</strong>
            <span>
              El embarque se crea sobre las lineas del pedido seleccionado. Puedes
              ajustar cantidades antes de guardar.
            </span>
          </div>

          <div className="upload-grid">
            {shipmentForm.items.map((item, index) => (
              <div key={item.purchaseOrderItemId} className="line-item-card">
                <div className="subsection-head">
                  <div>
                    <h4>{item.productDescriptionSnapshot}</h4>
                    <p className="muted">
                      Purchase item #{item.purchaseOrderItemId} · Product #{item.productId}
                    </p>
                  </div>
                  <span className="pill">Linea {index + 1}</span>
                </div>

                <div className="form-grid form-grid-three">
                  <label className="field">
                    <span>Purchase order item</span>
                    <input value={item.purchaseOrderItemId} disabled />
                  </label>

                  <label className="field">
                    <span>Product ID</span>
                    <input value={item.productId} disabled />
                  </label>

                  <label className="field">
                    <span>Cantidad embarcada</span>
                    <input
                      value={item.quantityShipped}
                      inputMode="decimal"
                      onChange={(currentEvent) =>
                        setShipmentForm((current) => ({
                          ...current,
                          items: current.items.map((currentItem, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...currentItem,
                                  quantityShipped: currentEvent.target.value,
                                }
                              : currentItem,
                          ),
                        }))
                      }
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div className="metric-strip">
            <div className="metric-chip">
              <span>Lineas activas</span>
              <strong>{shipmentForm.items.length}</strong>
            </div>
            <div className="metric-chip">
              <span>Cantidad total embarcada</span>
              <strong>{totalDraftQuantity.toFixed(2)}</strong>
            </div>
            <div className="metric-chip">
              <span>Estado inicial</span>
              <strong>{shipmentForm.status}</strong>
            </div>
          </div>

          <div className="form-actions">
            <button
              type="submit"
              className="primary-button"
              disabled={creatingShipment}
            >
              {creatingShipment ? 'Creando...' : 'Crear embarque'}
            </button>
          </div>
        </form>
      </SectionCard>

      <div className="two-column-grid">
        <SectionCard
          title="Registrar evento logistico"
          subtitle="Tracking, hitos y cambios de estado durante el viaje"
        >
          <form className="stack-form" onSubmit={handleCreateEvent}>
            <div className="form-grid form-grid-three">
              <label className="field">
                <span>Embarque</span>
                <select
                  value={eventForm.shipmentId}
                  onChange={(currentEvent) => {
                    setSelectedShipmentId(currentEvent.target.value);
                    setEventForm((current) => ({
                      ...current,
                      shipmentId: currentEvent.target.value,
                    }));
                  }}
                >
                  {shipments.map((shipment) => (
                    <option key={shipment.id} value={shipment.id}>
                      {shipment.shipmentNumber}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Tipo evento</span>
                <input
                  value={eventForm.eventType}
                  onChange={(currentEvent) =>
                    setEventForm((current) => ({
                      ...current,
                      eventType: currentEvent.target.value,
                    }))
                  }
                  placeholder="tracking_update / arrived_port"
                  required
                />
              </label>

              <label className="field">
                <span>Fecha evento</span>
                <input
                  type="datetime-local"
                  value={eventForm.eventDate}
                  onChange={(currentEvent) =>
                    setEventForm((current) => ({
                      ...current,
                      eventDate: currentEvent.target.value,
                    }))
                  }
                  required
                />
              </label>

              <label className="field">
                <span>Ubicacion</span>
                <input
                  value={eventForm.location}
                  onChange={(currentEvent) =>
                    setEventForm((current) => ({
                      ...current,
                      location: currentEvent.target.value,
                    }))
                  }
                  placeholder="Puerto, aeropuerto o ciudad"
                />
              </label>

              <label className="field field-span-two">
                <span>Descripcion</span>
                <input
                  value={eventForm.description}
                  onChange={(currentEvent) =>
                    setEventForm((current) => ({
                      ...current,
                      description: currentEvent.target.value,
                    }))
                  }
                  placeholder="Detalle del hito logistico"
                />
              </label>
            </div>

            <div className="form-actions">
              <button
                type="submit"
                className="primary-button"
                disabled={creatingEvent}
              >
                {creatingEvent ? 'Registrando...' : 'Crear evento'}
              </button>
            </div>
          </form>
        </SectionCard>

        <SectionCard
          title="Actualizar estado del embarque"
          subtitle="Cambio rapido del checkpoint logistico"
        >
          <form className="stack-form" onSubmit={handleUpdateStatus}>
            <div className="form-grid form-grid-three">
              <label className="field">
                <span>Embarque</span>
                <select
                  value={statusForm.shipmentId}
                  onChange={(currentEvent) => {
                    setSelectedShipmentId(currentEvent.target.value);
                    setStatusForm((current) => ({
                      ...current,
                      shipmentId: currentEvent.target.value,
                    }));
                  }}
                >
                  {shipments.map((shipment) => (
                    <option key={shipment.id} value={shipment.id}>
                      {shipment.shipmentNumber}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Nuevo estado</span>
                <select
                  value={statusForm.status}
                  onChange={(currentEvent) =>
                    setStatusForm((current) => ({
                      ...current,
                      status:
                        currentEvent.target.value as ShipmentStatusFormState['status'],
                    }))
                  }
                >
                  {shipmentStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Descripcion</span>
                <input
                  value={statusForm.description}
                  onChange={(currentEvent) =>
                    setStatusForm((current) => ({
                      ...current,
                      description: currentEvent.target.value,
                    }))
                  }
                  placeholder="Cambio manual de estado"
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
        </SectionCard>
      </div>

      <div className="two-column-grid">
        <SectionCard
          title="Embarques registrados"
          subtitle="Vista operativa del pipeline de transporte"
          action={
            <select
              className="select-input"
              value={selectedShipmentId}
              onChange={(currentEvent) =>
                setSelectedShipmentId(currentEvent.target.value)
              }
            >
              {shipments.map((shipment) => (
                <option key={shipment.id} value={shipment.id}>
                  {shipment.shipmentNumber}
                </option>
              ))}
            </select>
          }
        >
          {shipments.length > 0 ? (
            <div className="table-shell compact-table">
              <table>
                <thead>
                  <tr>
                    <th>Embarque</th>
                    <th>Pedido</th>
                    <th>Modo</th>
                    <th>Estado</th>
                    <th>Lineas</th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((shipment) => (
                    <tr key={shipment.id}>
                      <td>{shipment.shipmentNumber}</td>
                      <td>{shipment.purchaseOrderId}</td>
                      <td>{shipment.transportMode}</td>
                      <td>{shipment.status}</td>
                      <td>{shipment.items.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">No hay embarques registrados todavia.</p>
          )}
        </SectionCard>

        <SectionCard
          title="Detalle del embarque"
          subtitle="Items, tracking y ultimos eventos"
        >
          {selectedShipment ? (
            <div className="stack-list">
              <div className="list-row">
                <span>Shipment number</span>
                <strong>{selectedShipment.shipmentNumber}</strong>
              </div>
              <div className="list-row">
                <span>Pedido compra</span>
                <strong>{selectedShipment.purchaseOrderId}</strong>
              </div>
              <div className="list-row">
                <span>Tracking</span>
                <strong>{selectedShipment.trackingReference ?? 'N/A'}</strong>
              </div>
              <div className="list-row">
                <span>ETA</span>
                <strong>{selectedShipment.eta ?? 'N/A'}</strong>
              </div>

              <div className="table-shell compact-table">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Purchase item</th>
                      <th>Qty shipped</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedShipment.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.productId}</td>
                        <td>{item.purchaseOrderItemId}</td>
                        <td>{item.quantityShipped}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="table-shell compact-table">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Evento</th>
                      <th>Ubicacion</th>
                      <th>Descripcion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...selectedShipment.events]
                      .sort(
                        (left, right) =>
                          new Date(right.eventDate).getTime() -
                          new Date(left.eventDate).getTime(),
                      )
                      .map((eventItem) => (
                        <tr key={eventItem.id}>
                          <td>{new Date(eventItem.eventDate).toLocaleString('es-CL')}</td>
                          <td>{eventItem.eventType}</td>
                          <td>{eventItem.location ?? 'N/A'}</td>
                          <td>{eventItem.description ?? 'Sin descripcion'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="muted">Selecciona un embarque para ver el detalle.</p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
