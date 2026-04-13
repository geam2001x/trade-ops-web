import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../app/auth';
import {
  type CustomsEntry,
  type Shipment,
  getJson,
  patchJson,
  postJson,
} from '../app/api';
import { SectionCard } from '../components/ui/SectionCard';

type CustomsEntryFormState = {
  shipmentId: string;
  entryNumber: string;
  arrivalDateChile: string;
  clearanceDate: string;
  status: 'pending' | 'in_review' | 'cleared' | 'closed';
  notes: string;
};

type ImportExpenseFormState = {
  customsEntryId: string;
  expenseType:
    | 'freight'
    | 'insurance'
    | 'customs_duty'
    | 'vat'
    | 'customs_broker'
    | 'port_storage'
    | 'inland_transport'
    | 'miscellaneous';
  expenseDate: string;
  currencyCode: 'USD' | 'CLP';
  amountOriginal: string;
  exchangeRateToUsd: string;
  notes: string;
};

type CustomsStatusFormState = {
  customsEntryId: string;
  status: 'pending' | 'in_review' | 'cleared' | 'closed';
  notes: string;
};

const customsStatusOptions = ['pending', 'in_review', 'cleared', 'closed'] as const;
const importExpenseOptions = [
  'freight',
  'insurance',
  'customs_duty',
  'vat',
  'customs_broker',
  'port_storage',
  'inland_transport',
  'miscellaneous',
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

function getInitialCustomsEntryForm(): CustomsEntryFormState {
  return {
    shipmentId: '',
    entryNumber: '',
    arrivalDateChile: getTodayDate(),
    clearanceDate: '',
    status: 'pending',
    notes: '',
  };
}

function getInitialImportExpenseForm(): ImportExpenseFormState {
  return {
    customsEntryId: '',
    expenseType: 'customs_duty',
    expenseDate: getTodayDate(),
    currencyCode: 'USD',
    amountOriginal: '0',
    exchangeRateToUsd: '1',
    notes: '',
  };
}

function getInitialCustomsStatusForm(): CustomsStatusFormState {
  return {
    customsEntryId: '',
    status: 'pending',
    notes: '',
  };
}

export function CustomsPage() {
  const { session } = useAuth();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [entries, setEntries] = useState<CustomsEntry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState('');
  const [entryForm, setEntryForm] = useState<CustomsEntryFormState>(
    getInitialCustomsEntryForm,
  );
  const [expenseForm, setExpenseForm] = useState<ImportExpenseFormState>(
    getInitialImportExpenseForm,
  );
  const [statusForm, setStatusForm] = useState<CustomsStatusFormState>(
    getInitialCustomsStatusForm,
  );
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [creatingEntry, setCreatingEntry] = useState(false);
  const [addingExpense, setAddingExpense] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const selectedEntry = useMemo(
    () => entries.find((entry) => String(entry.id) === selectedEntryId) ?? null,
    [entries, selectedEntryId],
  );

  const findShipmentNumber = useCallback(
    (shipmentId: number) =>
      shipments.find((shipment) => shipment.id === shipmentId)?.shipmentNumber ??
      `Shipment #${shipmentId}`,
    [shipments],
  );

  const loadShipments = useCallback(async () => {
    const response = await getJson<Shipment[]>(
      '/shipments',
      session?.accessToken,
    );

    setShipments(response);
    setEntryForm((current) => ({
      ...current,
      shipmentId:
        current.shipmentId ||
        (response.length > 0 ? String(response[0].id) : current.shipmentId),
    }));
  }, [session?.accessToken]);

  const loadEntries = useCallback(async () => {
    const response = await getJson<CustomsEntry[]>(
      '/customs/entries',
      session?.accessToken,
    );

    setEntries(response);
    setSelectedEntryId((current) => {
      if (current && response.some((entry) => String(entry.id) === current)) {
        return current;
      }

      return response.length > 0 ? String(response[0].id) : '';
    });
  }, [session?.accessToken]);

  useEffect(() => {
    async function loadPageData() {
      try {
        setError(null);
        await Promise.all([loadShipments(), loadEntries()]);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'No fue posible cargar aduana.',
        );
      }
    }

    void loadPageData();
  }, [loadEntries, loadShipments]);

  useEffect(() => {
    if (!selectedEntry) {
      setExpenseForm(getInitialImportExpenseForm());
      setStatusForm(getInitialCustomsStatusForm());
      return;
    }

    setExpenseForm((current) => ({
      ...current,
      customsEntryId: String(selectedEntry.id),
    }));
    setStatusForm({
      customsEntryId: String(selectedEntry.id),
      status: selectedEntry.status as CustomsStatusFormState['status'],
      notes: selectedEntry.notes ?? '',
    });
  }, [selectedEntry]);

  const exchangeRateToUsd = parseDecimal(
    expenseForm.exchangeRateToUsd,
    expenseForm.currencyCode === 'USD' ? 1 : 0,
  );
  const amountOriginal = parseDecimal(expenseForm.amountOriginal, 0);
  const amountUsd =
    expenseForm.currencyCode === 'USD'
      ? amountOriginal
      : exchangeRateToUsd > 0
        ? amountOriginal / exchangeRateToUsd
        : 0;
  const selectedEntryTotalUsd =
    selectedEntry?.expenses.reduce(
      (sum, expense) => sum + parseDecimal(expense.amountUsd, 0),
      0,
    ) ?? 0;

  async function handleCreateCustomsEntry(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!entryForm.shipmentId) {
      setError('Selecciona un embarque para crear el expediente aduanero.');
      return;
    }

    try {
      setCreatingEntry(true);
      setError(null);
      setSuccessMessage(null);

      const createdEntry = await postJson<CustomsEntry>(
        '/customs/entries',
        {
          shipmentId: parseDecimal(entryForm.shipmentId),
          entryNumber: entryForm.entryNumber,
          arrivalDateChile: entryForm.arrivalDateChile || undefined,
          clearanceDate: entryForm.clearanceDate || undefined,
          status: entryForm.status,
          notes: entryForm.notes || undefined,
        },
        session?.accessToken,
      );

      setSuccessMessage(
        `Expediente ${createdEntry.entryNumber} creado para seguimiento aduanero.`,
      );
      await loadEntries();
      setSelectedEntryId(String(createdEntry.id));
      setEntryForm((current) => ({
        ...getInitialCustomsEntryForm(),
        shipmentId: current.shipmentId,
      }));
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'No fue posible crear el expediente aduanero.',
      );
    } finally {
      setCreatingEntry(false);
    }
  }

  async function handleAddExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!expenseForm.customsEntryId) {
      setError('Selecciona un expediente para registrar el gasto.');
      return;
    }

    try {
      setAddingExpense(true);
      setError(null);
      setSuccessMessage(null);

      await postJson<CustomsEntry>(
        `/customs/entries/${expenseForm.customsEntryId}/expenses`,
        {
          expenseType: expenseForm.expenseType,
          expenseDate: expenseForm.expenseDate,
          currencyCode: expenseForm.currencyCode,
          amountOriginal,
          exchangeRateToUsd,
          amountUsd,
          notes: expenseForm.notes || undefined,
        },
        session?.accessToken,
      );

      setSuccessMessage('Gasto de importacion agregado correctamente.');
      await loadEntries();
      setExpenseForm((current) => ({
        ...getInitialImportExpenseForm(),
        customsEntryId: current.customsEntryId,
      }));
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'No fue posible agregar el gasto.',
      );
    } finally {
      setAddingExpense(false);
    }
  }

  async function handleUpdateStatus(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!statusForm.customsEntryId) {
      setError('Selecciona un expediente para actualizar su estado.');
      return;
    }

    try {
      setUpdatingStatus(true);
      setError(null);
      setSuccessMessage(null);

      await patchJson<CustomsEntry>(
        `/customs/entries/${statusForm.customsEntryId}/status`,
        {
          status: statusForm.status,
          notes: statusForm.notes || undefined,
        },
        session?.accessToken,
      );

      setSuccessMessage(`Estado aduanero actualizado a ${statusForm.status}.`);
      await loadEntries();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'No fue posible actualizar el expediente.',
      );
    } finally {
      setUpdatingStatus(false);
    }
  }

  return (
    <div className="page-grid">
      <SectionCard
        title="Crear expediente aduanero"
        subtitle="Conecta el embarque con ingreso a Chile, revision y liberacion"
      >
        {error ? <p className="feedback feedback-error">{error}</p> : null}
        {successMessage ? (
          <p className="feedback feedback-success">{successMessage}</p>
        ) : null}

        <form className="stack-form" onSubmit={handleCreateCustomsEntry}>
          <div className="form-grid form-grid-three">
            <label className="field">
              <span>Embarque</span>
              <select
                value={entryForm.shipmentId}
                onChange={(currentEvent) =>
                  setEntryForm((current) => ({
                    ...current,
                    shipmentId: currentEvent.target.value,
                  }))
                }
              >
                {shipments.map((shipment) => (
                  <option key={shipment.id} value={shipment.id}>
                    {shipment.shipmentNumber}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Numero expediente</span>
              <input
                value={entryForm.entryNumber}
                onChange={(currentEvent) =>
                  setEntryForm((current) => ({
                    ...current,
                    entryNumber: currentEvent.target.value,
                  }))
                }
                placeholder="DIN-2026-001"
                required
              />
            </label>

            <label className="field">
              <span>Estado inicial</span>
              <select
                value={entryForm.status}
                onChange={(currentEvent) =>
                  setEntryForm((current) => ({
                    ...current,
                    status:
                      currentEvent.target.value as CustomsEntryFormState['status'],
                  }))
                }
              >
                {customsStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Llegada Chile</span>
              <input
                type="date"
                value={entryForm.arrivalDateChile}
                onChange={(currentEvent) =>
                  setEntryForm((current) => ({
                    ...current,
                    arrivalDateChile: currentEvent.target.value,
                  }))
                }
              />
            </label>

            <label className="field">
              <span>Fecha liberacion</span>
              <input
                type="date"
                value={entryForm.clearanceDate}
                onChange={(currentEvent) =>
                  setEntryForm((current) => ({
                    ...current,
                    clearanceDate: currentEvent.target.value,
                  }))
                }
              />
            </label>

            <label className="field field-span-two">
              <span>Notas</span>
              <input
                value={entryForm.notes}
                onChange={(currentEvent) =>
                  setEntryForm((current) => ({
                    ...current,
                    notes: currentEvent.target.value,
                  }))
                }
                placeholder="Observaciones del despacho o agente"
              />
            </label>
          </div>

          <div className="form-actions">
            <button
              type="submit"
              className="primary-button"
              disabled={creatingEntry}
            >
              {creatingEntry ? 'Creando...' : 'Crear expediente'}
            </button>
          </div>
        </form>
      </SectionCard>

      <div className="two-column-grid">
        <SectionCard
          title="Registrar gasto de importacion"
          subtitle="Freight, VAT, broker, inland transport y mas"
        >
          <form className="stack-form" onSubmit={handleAddExpense}>
            <div className="form-grid form-grid-three">
              <label className="field">
                <span>Expediente</span>
                <select
                  value={expenseForm.customsEntryId}
                  onChange={(currentEvent) => {
                    setSelectedEntryId(currentEvent.target.value);
                    setExpenseForm((current) => ({
                      ...current,
                      customsEntryId: currentEvent.target.value,
                    }));
                  }}
                >
                  {entries.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.entryNumber}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Tipo gasto</span>
                <select
                  value={expenseForm.expenseType}
                  onChange={(currentEvent) =>
                    setExpenseForm((current) => ({
                      ...current,
                      expenseType:
                        currentEvent.target.value as ImportExpenseFormState['expenseType'],
                    }))
                  }
                >
                  {importExpenseOptions.map((expenseType) => (
                    <option key={expenseType} value={expenseType}>
                      {expenseType}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Fecha gasto</span>
                <input
                  type="date"
                  value={expenseForm.expenseDate}
                  onChange={(currentEvent) =>
                    setExpenseForm((current) => ({
                      ...current,
                      expenseDate: currentEvent.target.value,
                    }))
                  }
                />
              </label>

              <label className="field">
                <span>Moneda</span>
                <select
                  value={expenseForm.currencyCode}
                  onChange={(currentEvent) =>
                    setExpenseForm((current) => ({
                      ...current,
                      currencyCode:
                        currentEvent.target.value as ImportExpenseFormState['currencyCode'],
                      exchangeRateToUsd:
                        currentEvent.target.value === 'USD'
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
                <span>Monto original</span>
                <input
                  value={expenseForm.amountOriginal}
                  inputMode="decimal"
                  onChange={(currentEvent) =>
                    setExpenseForm((current) => ({
                      ...current,
                      amountOriginal: currentEvent.target.value,
                    }))
                  }
                />
              </label>

              <label className="field">
                <span>TC a USD</span>
                <input
                  value={expenseForm.exchangeRateToUsd}
                  inputMode="decimal"
                  onChange={(currentEvent) =>
                    setExpenseForm((current) => ({
                      ...current,
                      exchangeRateToUsd: currentEvent.target.value,
                    }))
                  }
                />
              </label>

              <label className="field field-span-two">
                <span>Notas</span>
                <input
                  value={expenseForm.notes}
                  onChange={(currentEvent) =>
                    setExpenseForm((current) => ({
                      ...current,
                      notes: currentEvent.target.value,
                    }))
                  }
                  placeholder="Impuestos, almacenaje, broker o ajuste"
                />
              </label>
            </div>

            <div className="metric-strip">
              <div className="metric-chip">
                <span>Monto original</span>
                <strong>
                  {amountOriginal.toFixed(2)} {expenseForm.currencyCode}
                </strong>
              </div>
              <div className="metric-chip">
                <span>Monto USD</span>
                <strong>{amountUsd.toFixed(2)} USD</strong>
              </div>
            </div>

            <div className="form-actions">
              <button
                type="submit"
                className="primary-button"
                disabled={addingExpense}
              >
                {addingExpense ? 'Agregando...' : 'Agregar gasto'}
              </button>
            </div>
          </form>
        </SectionCard>

        <SectionCard
          title="Actualizar estado aduanero"
          subtitle="Control de pendiente, revision, liberado y cierre"
        >
          <form className="stack-form" onSubmit={handleUpdateStatus}>
            <div className="form-grid form-grid-three">
              <label className="field">
                <span>Expediente</span>
                <select
                  value={statusForm.customsEntryId}
                  onChange={(currentEvent) => {
                    setSelectedEntryId(currentEvent.target.value);
                    setStatusForm((current) => ({
                      ...current,
                      customsEntryId: currentEvent.target.value,
                    }));
                  }}
                >
                  {entries.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.entryNumber}
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
                        currentEvent.target.value as CustomsStatusFormState['status'],
                    }))
                  }
                >
                  {customsStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Notas</span>
                <input
                  value={statusForm.notes}
                  onChange={(currentEvent) =>
                    setStatusForm((current) => ({
                      ...current,
                      notes: currentEvent.target.value,
                    }))
                  }
                  placeholder="Estado del expediente y comentarios"
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
          title="Expedientes aduaneros"
          subtitle="Seguimiento de ingreso, revision y liberacion"
          action={
            <select
              className="select-input"
              value={selectedEntryId}
              onChange={(currentEvent) =>
                setSelectedEntryId(currentEvent.target.value)
              }
            >
              {entries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.entryNumber}
                </option>
              ))}
            </select>
          }
        >
          {entries.length > 0 ? (
            <div className="table-shell compact-table">
              <table>
                <thead>
                  <tr>
                    <th>Entry</th>
                    <th>Shipment</th>
                    <th>Estado</th>
                    <th>Gastos</th>
                    <th>Total USD</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.entryNumber}</td>
                      <td>{findShipmentNumber(entry.shipmentId)}</td>
                      <td>{entry.status}</td>
                      <td>{entry.expenses.length}</td>
                      <td>
                        {entry.expenses
                          .reduce(
                            (sum, expense) =>
                              sum + parseDecimal(expense.amountUsd, 0),
                            0,
                          )
                          .toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">No hay expedientes aduaneros registrados.</p>
          )}
        </SectionCard>

        <SectionCard
          title="Detalle del expediente"
          subtitle="Gastos, fechas clave y trazabilidad financiera"
        >
          {selectedEntry ? (
            <div className="stack-list">
              <div className="list-row">
                <span>Embarque</span>
                <strong>{findShipmentNumber(selectedEntry.shipmentId)}</strong>
              </div>
              <div className="list-row">
                <span>Estado</span>
                <strong>{selectedEntry.status}</strong>
              </div>
              <div className="list-row">
                <span>Llegada Chile</span>
                <strong>{selectedEntry.arrivalDateChile ?? 'N/A'}</strong>
              </div>
              <div className="list-row">
                <span>Clearance date</span>
                <strong>{selectedEntry.clearanceDate ?? 'N/A'}</strong>
              </div>
              <div className="list-row">
                <span>Total gastos USD</span>
                <strong>{selectedEntryTotalUsd.toFixed(2)}</strong>
              </div>

              <div className="table-shell compact-table">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th>Original</th>
                      <th>USD</th>
                      <th>Notas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedEntry.expenses.map((expense) => (
                      <tr key={expense.id}>
                        <td>{expense.expenseDate}</td>
                        <td>{expense.expenseType}</td>
                        <td>
                          {expense.amountOriginal} {expense.currencyCode}
                        </td>
                        <td>{expense.amountUsd}</td>
                        <td>{expense.notes ?? 'Sin notas'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="muted">Selecciona un expediente para ver el detalle.</p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
