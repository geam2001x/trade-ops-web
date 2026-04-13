import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../app/auth';
import {
  type InventoryLot,
  type PurchaseOrder,
  type Shipment,
  getJson,
  postJson,
} from '../app/api';
import { SectionCard } from '../components/ui/SectionCard';

type ShipmentItemOption = {
  shipmentId: number;
  shipmentNumber: string;
  shipmentStatus: string;
  transportMode: string;
  shipmentItemId: string;
  purchaseOrderItemId: string;
  productId: string;
  productDescriptionSnapshot: string;
  quantityShipped: string;
};

type ReceiveLotFormState = {
  shipmentItemId: string;
  warehouseId: string;
  lotCode: string;
  receivedQuantity: string;
  allocatedImportCostUsd: string;
  receivedAt: string;
  notes: string;
};

type InventoryMovementFormState = {
  inventoryLotId: string;
  movementType:
    | 'inbound'
    | 'reserve'
    | 'release'
    | 'sale'
    | 'adjustment'
    | 'loss';
  quantity: string;
  referenceType: string;
  referenceId: string;
  movementDate: string;
  notes: string;
};

const movementTypeOptions = [
  'inbound',
  'reserve',
  'release',
  'sale',
  'adjustment',
  'loss',
] as const;

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
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

function buildShipmentItemOptions(
  shipments: Shipment[],
  orders: PurchaseOrder[],
): ShipmentItemOption[] {
  const purchaseOrderItemsById = new Map<
    number,
    { productDescriptionSnapshot: string }
  >();

  for (const order of orders) {
    for (const item of order.items) {
      purchaseOrderItemsById.set(item.id, {
        productDescriptionSnapshot: item.productDescriptionSnapshot,
      });
    }
  }

  return shipments.flatMap((shipment) =>
    shipment.items.map((item) => ({
      shipmentId: shipment.id,
      shipmentNumber: shipment.shipmentNumber,
      shipmentStatus: shipment.status,
      transportMode: shipment.transportMode,
      shipmentItemId: String(item.id),
      purchaseOrderItemId: String(item.purchaseOrderItemId),
      productId: String(item.productId),
      productDescriptionSnapshot:
        purchaseOrderItemsById.get(item.purchaseOrderItemId)
          ?.productDescriptionSnapshot ?? `Producto ${item.productId}`,
      quantityShipped: item.quantityShipped,
    })),
  );
}

function buildSuggestedLotCode(option: ShipmentItemOption | null) {
  if (!option) {
    return '';
  }

  return `${option.shipmentNumber}-LOT-${option.shipmentItemId}`;
}

function getInitialReceiveLotForm(): ReceiveLotFormState {
  return {
    shipmentItemId: '',
    warehouseId: '1',
    lotCode: '',
    receivedQuantity: '0',
    allocatedImportCostUsd: '0',
    receivedAt: getTodayDate(),
    notes: '',
  };
}

function getInitialMovementForm(): InventoryMovementFormState {
  return {
    inventoryLotId: '',
    movementType: 'reserve',
    quantity: '1',
    referenceType: 'manual',
    referenceId: '',
    movementDate: getTodayDate(),
    notes: '',
  };
}

export function InventoryPage() {
  const { session } = useAuth();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [selectedLotId, setSelectedLotId] = useState('');
  const [receiveForm, setReceiveForm] = useState<ReceiveLotFormState>(
    getInitialReceiveLotForm,
  );
  const [movementForm, setMovementForm] = useState<InventoryMovementFormState>(
    getInitialMovementForm,
  );
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [receivingLot, setReceivingLot] = useState(false);
  const [creatingMovement, setCreatingMovement] = useState(false);

  const shipmentItemOptions = useMemo(
    () => buildShipmentItemOptions(shipments, orders),
    [orders, shipments],
  );

  const selectedShipmentItem = useMemo(
    () =>
      shipmentItemOptions.find(
        (shipmentItem) => shipmentItem.shipmentItemId === receiveForm.shipmentItemId,
      ) ?? null,
    [receiveForm.shipmentItemId, shipmentItemOptions],
  );

  const selectedLot = useMemo(
    () => lots.find((lot) => String(lot.id) === selectedLotId) ?? null,
    [lots, selectedLotId],
  );

  const syncReceiveFormWithShipmentItem = useCallback(
    (availableOptions: ShipmentItemOption[], nextShipmentItemId: string) => {
      const nextShipmentItem =
        availableOptions.find(
          (shipmentItem) => shipmentItem.shipmentItemId === nextShipmentItemId,
        ) ?? null;

      setReceiveForm((current) => ({
        ...current,
        shipmentItemId: nextShipmentItemId,
        lotCode:
          current.shipmentItemId === nextShipmentItemId && current.lotCode
            ? current.lotCode
            : buildSuggestedLotCode(nextShipmentItem),
        receivedQuantity:
          current.shipmentItemId === nextShipmentItemId &&
          current.receivedQuantity !== '0'
            ? current.receivedQuantity
            : nextShipmentItem?.quantityShipped ?? '0',
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
    return response;
  }, [session?.accessToken]);

  const loadShipments = useCallback(async () => {
    const response = await getJson<Shipment[]>(
      '/shipments',
      session?.accessToken,
    );
    setShipments(response);
    return response;
  }, [session?.accessToken]);

  const loadLots = useCallback(async () => {
    const response = await getJson<InventoryLot[]>(
      '/inventory/lots',
      session?.accessToken,
    );
    setLots(response);
    setSelectedLotId((current) => {
      if (current && response.some((lot) => String(lot.id) === current)) {
        return current;
      }

      return response.length > 0 ? String(response[0].id) : '';
    });
    setMovementForm((current) => ({
      ...current,
      inventoryLotId:
        current.inventoryLotId ||
        (response.length > 0 ? String(response[0].id) : current.inventoryLotId),
    }));
    return response;
  }, [session?.accessToken]);

  useEffect(() => {
    async function loadPageData() {
      try {
        setError(null);
        const [ordersResponse, shipmentsResponse] = await Promise.all([
          loadOrders(),
          loadShipments(),
        ]);
        await loadLots();

        const nextOptions = buildShipmentItemOptions(
          shipmentsResponse,
          ordersResponse,
        );
        const nextShipmentItemId =
          nextOptions.find(
            (shipmentItem) =>
              shipmentItem.shipmentItemId === receiveForm.shipmentItemId,
          )?.shipmentItemId ?? nextOptions[0]?.shipmentItemId ?? '';

        syncReceiveFormWithShipmentItem(nextOptions, nextShipmentItemId);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'No fue posible cargar inventario.',
        );
      }
    }

    void loadPageData();
  }, [
    loadLots,
    loadOrders,
    loadShipments,
    receiveForm.shipmentItemId,
    syncReceiveFormWithShipmentItem,
  ]);

  useEffect(() => {
    if (!selectedLot) {
      return;
    }

    setMovementForm((current) => ({
      ...current,
      inventoryLotId: String(selectedLot.id),
    }));
  }, [selectedLot]);

  const totalAvailableQuantity = lots.reduce(
    (sum, lot) => sum + parseDecimal(lot.availableQuantity, 0),
    0,
  );
  const totalReservedQuantity = lots.reduce(
    (sum, lot) => sum + parseDecimal(lot.reservedQuantity, 0),
    0,
  );
  const totalInventoryValueUsd = lots.reduce(
    (sum, lot) =>
      sum +
      parseDecimal(lot.availableQuantity, 0) * parseDecimal(lot.unitLandedCostUsd, 0),
    0,
  );

  async function handleReceiveLot(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!receiveForm.shipmentItemId) {
      setError('Selecciona un shipment item para recibir el lote.');
      return;
    }

    try {
      setReceivingLot(true);
      setError(null);
      setSuccessMessage(null);

      const createdLot = await postJson<InventoryLot>(
        '/inventory/lots/receive',
        {
          shipmentItemId: parseDecimal(receiveForm.shipmentItemId),
          warehouseId: parseDecimal(receiveForm.warehouseId),
          lotCode: receiveForm.lotCode,
          receivedQuantity: parseDecimal(receiveForm.receivedQuantity),
          allocatedImportCostUsd: parseDecimal(
            receiveForm.allocatedImportCostUsd,
            0,
          ),
          receivedAt: receiveForm.receivedAt || undefined,
          notes: receiveForm.notes || undefined,
        },
        session?.accessToken,
      );

      setSuccessMessage(`Lote ${createdLot.lotCode} recibido correctamente.`);
      await loadLots();
      setSelectedLotId(String(createdLot.id));
      syncReceiveFormWithShipmentItem(
        shipmentItemOptions,
        receiveForm.shipmentItemId,
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'No fue posible recibir el lote.',
      );
    } finally {
      setReceivingLot(false);
    }
  }

  async function handleCreateMovement(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!movementForm.inventoryLotId) {
      setError('Selecciona un lote para registrar el movimiento.');
      return;
    }

    try {
      setCreatingMovement(true);
      setError(null);
      setSuccessMessage(null);

      const updatedLot = await postJson<InventoryLot>(
        `/inventory/lots/${movementForm.inventoryLotId}/movements`,
        {
          movementType: movementForm.movementType,
          quantity: parseDecimal(movementForm.quantity),
          referenceType: movementForm.referenceType || undefined,
          referenceId: movementForm.referenceId
            ? parseDecimal(movementForm.referenceId)
            : undefined,
          movementDate: movementForm.movementDate || undefined,
          notes: movementForm.notes || undefined,
        },
        session?.accessToken,
      );

      setSuccessMessage(
        `Movimiento ${movementForm.movementType} registrado en lote ${updatedLot.lotCode}.`,
      );

      await loadLots();
      setSelectedLotId(String(updatedLot.id));
      setMovementForm((current) => ({
        ...getInitialMovementForm(),
        inventoryLotId: current.inventoryLotId,
      }));
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'No fue posible crear el movimiento.',
      );
    } finally {
      setCreatingMovement(false);
    }
  }

  return (
    <div className="page-grid">
      <SectionCard
        title="Recepcion de lotes"
        subtitle="Convierte shipment items en inventario disponible o reservado"
      >
        {error ? <p className="feedback feedback-error">{error}</p> : null}
        {successMessage ? (
          <p className="feedback feedback-success">{successMessage}</p>
        ) : null}

        <form className="stack-form" onSubmit={handleReceiveLot}>
          <div className="form-grid form-grid-three">
            <label className="field">
              <span>Shipment item</span>
              <select
                value={receiveForm.shipmentItemId}
                onChange={(event) =>
                  syncReceiveFormWithShipmentItem(
                    shipmentItemOptions,
                    event.target.value,
                  )
                }
              >
                {shipmentItemOptions.map((shipmentItem) => (
                  <option
                    key={shipmentItem.shipmentItemId}
                    value={shipmentItem.shipmentItemId}
                  >
                    {shipmentItem.shipmentNumber} · item {shipmentItem.shipmentItemId}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Warehouse ID</span>
              <input
                value={receiveForm.warehouseId}
                onChange={(event) =>
                  setReceiveForm((current) => ({
                    ...current,
                    warehouseId: event.target.value,
                  }))
                }
                inputMode="numeric"
                required
              />
            </label>

            <label className="field">
              <span>Lot code</span>
              <input
                value={receiveForm.lotCode}
                onChange={(event) =>
                  setReceiveForm((current) => ({
                    ...current,
                    lotCode: event.target.value,
                  }))
                }
                placeholder="SHP-001-LOT-10"
                required
              />
            </label>

            <label className="field">
              <span>Received quantity</span>
              <input
                value={receiveForm.receivedQuantity}
                onChange={(event) =>
                  setReceiveForm((current) => ({
                    ...current,
                    receivedQuantity: event.target.value,
                  }))
                }
                inputMode="decimal"
                required
              />
            </label>

            <label className="field">
              <span>Allocated import cost USD</span>
              <input
                value={receiveForm.allocatedImportCostUsd}
                onChange={(event) =>
                  setReceiveForm((current) => ({
                    ...current,
                    allocatedImportCostUsd: event.target.value,
                  }))
                }
                inputMode="decimal"
              />
            </label>

            <label className="field">
              <span>Received at</span>
              <input
                type="date"
                value={receiveForm.receivedAt}
                onChange={(event) =>
                  setReceiveForm((current) => ({
                    ...current,
                    receivedAt: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <label className="field">
            <span>Notes</span>
            <textarea
              value={receiveForm.notes}
              onChange={(event) =>
                setReceiveForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              rows={3}
              placeholder="Observaciones de recepcion, diferencias o control"
            />
          </label>

          {selectedShipmentItem ? (
            <div className="info-banner">
              <strong>
                {selectedShipmentItem.productDescriptionSnapshot}
              </strong>
              <span>
                Shipment {selectedShipmentItem.shipmentNumber} · mode{' '}
                {selectedShipmentItem.transportMode} · status{' '}
                {selectedShipmentItem.shipmentStatus} · qty shipped{' '}
                {selectedShipmentItem.quantityShipped}
              </span>
            </div>
          ) : (
            <p className="muted">
              No hay shipment items disponibles. Primero crea y carga un embarque.
            </p>
          )}

          <div className="form-actions">
            <button
              type="submit"
              className="primary-button"
              disabled={receivingLot || shipmentItemOptions.length === 0}
            >
              {receivingLot ? 'Recibiendo...' : 'Recibir lote'}
            </button>
          </div>
        </form>
      </SectionCard>

      <div className="two-column-grid">
        <SectionCard
          title="Registrar movimiento"
          subtitle="Reserva, libera, ajusta o marca salida de inventario"
        >
          <form className="stack-form" onSubmit={handleCreateMovement}>
            <div className="form-grid form-grid-three">
              <label className="field">
                <span>Lote</span>
                <select
                  value={movementForm.inventoryLotId}
                  onChange={(event) => {
                    setSelectedLotId(event.target.value);
                    setMovementForm((current) => ({
                      ...current,
                      inventoryLotId: event.target.value,
                    }));
                  }}
                >
                  {lots.map((lot) => (
                    <option key={lot.id} value={lot.id}>
                      {lot.lotCode}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Movement type</span>
                <select
                  value={movementForm.movementType}
                  onChange={(event) =>
                    setMovementForm((current) => ({
                      ...current,
                      movementType:
                        event.target.value as InventoryMovementFormState['movementType'],
                    }))
                  }
                >
                  {movementTypeOptions.map((movementType) => (
                    <option key={movementType} value={movementType}>
                      {movementType}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Quantity</span>
                <input
                  value={movementForm.quantity}
                  onChange={(event) =>
                    setMovementForm((current) => ({
                      ...current,
                      quantity: event.target.value,
                    }))
                  }
                  inputMode="decimal"
                  required
                />
              </label>

              <label className="field">
                <span>Reference type</span>
                <input
                  value={movementForm.referenceType}
                  onChange={(event) =>
                    setMovementForm((current) => ({
                      ...current,
                      referenceType: event.target.value,
                    }))
                  }
                  placeholder="manual / recount / sale"
                />
              </label>

              <label className="field">
                <span>Reference ID</span>
                <input
                  value={movementForm.referenceId}
                  onChange={(event) =>
                    setMovementForm((current) => ({
                      ...current,
                      referenceId: event.target.value,
                    }))
                  }
                  inputMode="numeric"
                  placeholder="Opcional"
                />
              </label>

              <label className="field">
                <span>Movement date</span>
                <input
                  type="date"
                  value={movementForm.movementDate}
                  onChange={(event) =>
                    setMovementForm((current) => ({
                      ...current,
                      movementDate: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <label className="field">
              <span>Notes</span>
              <textarea
                value={movementForm.notes}
                onChange={(event) =>
                  setMovementForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                rows={3}
                placeholder="Motivo del movimiento o comentario de control"
              />
            </label>

            {selectedLot ? (
              <div className="metric-strip">
                <div className="metric-chip">
                  <span>Available</span>
                  <strong>{selectedLot.availableQuantity}</strong>
                </div>
                <div className="metric-chip">
                  <span>Reserved</span>
                  <strong>{selectedLot.reservedQuantity}</strong>
                </div>
                <div className="metric-chip">
                  <span>Status</span>
                  <strong>{selectedLot.status}</strong>
                </div>
              </div>
            ) : null}

            <div className="form-actions">
              <button
                type="submit"
                className="primary-button"
                disabled={creatingMovement || lots.length === 0}
              >
                {creatingMovement ? 'Registrando...' : 'Crear movimiento'}
              </button>
            </div>
          </form>
        </SectionCard>

        <SectionCard
          title="Resumen de inventario"
          subtitle="Foto rapida del stock y del valor visible"
        >
          <div className="metric-strip">
            <div className="metric-chip">
              <span>Lotes</span>
              <strong>{lots.length}</strong>
            </div>
            <div className="metric-chip">
              <span>Disponible</span>
              <strong>{totalAvailableQuantity.toFixed(2)}</strong>
            </div>
            <div className="metric-chip">
              <span>Reservado</span>
              <strong>{totalReservedQuantity.toFixed(2)}</strong>
            </div>
            <div className="metric-chip">
              <span>Valor visible USD</span>
              <strong>{totalInventoryValueUsd.toFixed(2)}</strong>
            </div>
          </div>

          <div className="info-banner">
            <strong>Nota operativa</strong>
            <span>
              `warehouseId` sigue manual por ahora porque aun no existe endpoint
              frontend para catalogo de bodegas.
            </span>
          </div>
        </SectionCard>
      </div>

      <div className="two-column-grid">
        <SectionCard
          title="Lotes en inventario"
          subtitle="Recepcion, disponibilidad y costo por lote"
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
          {lots.length > 0 ? (
            <div className="table-shell compact-table">
              <table>
                <thead>
                  <tr>
                    <th>Lot</th>
                    <th>Product</th>
                    <th>Status</th>
                    <th>Available</th>
                    <th>Reserved</th>
                    <th>Landed USD</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map((lot) => (
                    <tr key={lot.id}>
                      <td>{lot.lotCode}</td>
                      <td>{lot.productId}</td>
                      <td>{lot.status}</td>
                      <td>{lot.availableQuantity}</td>
                      <td>{lot.reservedQuantity}</td>
                      <td>{lot.unitLandedCostUsd}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">No hay lotes recibidos todavia.</p>
          )}
        </SectionCard>

        <SectionCard
          title="Detalle del lote"
          subtitle="Movimientos, costos y referencias del inventario seleccionado"
        >
          {selectedLot ? (
            <div className="stack-list">
              <div className="list-row">
                <span>Warehouse ID</span>
                <strong>{selectedLot.warehouseId}</strong>
              </div>
              <div className="list-row">
                <span>Shipment item</span>
                <strong>{selectedLot.shipmentItemId ?? 'N/A'}</strong>
              </div>
              <div className="list-row">
                <span>Purchase unit cost USD</span>
                <strong>{selectedLot.purchaseUnitCostUsd}</strong>
              </div>
              <div className="list-row">
                <span>Allocated import cost USD</span>
                <strong>{selectedLot.allocatedImportCostUsd}</strong>
              </div>
              <div className="list-row">
                <span>Received at</span>
                <strong>
                  {new Date(selectedLot.receivedAt).toLocaleString('es-CL')}
                </strong>
              </div>

              <div className="table-shell compact-table">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th>Qty</th>
                      <th>Ref</th>
                      <th>Notas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...selectedLot.movements]
                      .sort(
                        (left, right) =>
                          new Date(right.movementDate).getTime() -
                          new Date(left.movementDate).getTime(),
                      )
                      .map((movement) => (
                        <tr key={movement.id}>
                          <td>
                            {new Date(movement.movementDate).toLocaleString('es-CL')}
                          </td>
                          <td>{movement.movementType}</td>
                          <td>{movement.quantity}</td>
                          <td>
                            {movement.referenceType ?? 'N/A'}
                            {movement.referenceId
                              ? ` #${movement.referenceId}`
                              : ''}
                          </td>
                          <td>{movement.notes ?? 'Sin notas'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="muted">Selecciona un lote para ver su detalle.</p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
