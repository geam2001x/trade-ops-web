import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../app/auth';
import {
  type DocumentExtraction,
  type DocumentUpload,
  type PurchaseOrder,
  getJson,
  postJson,
} from '../app/api';
import { SectionCard } from '../components/ui/SectionCard';

type UploadFormState = {
  documentType: string;
  originalFileName: string;
  storagePath: string;
  mimeType: string;
};

type ExtractionItemFormState = {
  lineIndex: string;
  productDescription: string;
  skuDetected: string;
  quantity: string;
  unitMeasure: string;
  unitPrice: string;
  lineTotal: string;
  confidenceScore: string;
};

type ExtractionFormState = {
  documentUploadId: string;
  detectedDocumentType: string;
  rawText: string;
  confidenceScore: string;
  items: ExtractionItemFormState[];
};

type ValidationItemFormState = {
  productId: string;
  productDescriptionSnapshot: string;
  quantityOrdered: string;
  unitMeasure: string;
  unitPriceOriginal: string;
};

type ValidationFormState = {
  supplierId: string;
  orderNumber: string;
  orderDate: string;
  supplierInvoiceNumber: string;
  supplierInvoiceDate: string;
  currencyCode: string;
  exchangeRateToUsd: string;
  paymentTerms: string;
  estimatedDispatchDate: string;
  notes: string;
  items: ValidationItemFormState[];
};

type ConversionFormState = {
  status: string;
  notes: string;
};

type ExtractionOption = DocumentExtraction & {
  uploadId: number;
  uploadFileName: string;
  uploadStatus: string;
  uploadHasConvertedExtraction: boolean;
};

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function getInitialUploadForm(): UploadFormState {
  return {
    documentType: 'proforma_invoice',
    originalFileName: '',
    storagePath: '',
    mimeType: 'application/pdf',
  };
}

function createExtractionItem(index: number): ExtractionItemFormState {
  return {
    lineIndex: String(index + 1),
    productDescription: '',
    skuDetected: '',
    quantity: '1',
    unitMeasure: 'unit',
    unitPrice: '0',
    lineTotal: '',
    confidenceScore: '0.92',
  };
}

function getInitialExtractionForm(): ExtractionFormState {
  return {
    documentUploadId: '',
    detectedDocumentType: 'proforma_invoice',
    rawText: '',
    confidenceScore: '0.92',
    items: [createExtractionItem(0)],
  };
}

function getInitialConversionForm(): ConversionFormState {
  return {
    status: 'draft',
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function readNumberishValue(value: unknown, fallback = '') {
  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'string') {
    return value;
  }

  return fallback;
}

function buildDefaultValidationForm(
  extraction: ExtractionOption,
): ValidationFormState {
  const validatedPayload = extraction.validation?.validatedPayloadJson;

  if (isRecord(validatedPayload)) {
    const payloadItems = Array.isArray(validatedPayload.items)
      ? validatedPayload.items
      : [];

    return {
      supplierId: readNumberishValue(validatedPayload.supplierId, '1'),
      orderNumber: readStringValue(
        validatedPayload.orderNumber,
        `PO-DOC-${String(extraction.id).padStart(4, '0')}`,
      ),
      orderDate: readStringValue(validatedPayload.orderDate, getTodayDate()),
      supplierInvoiceNumber: readStringValue(
        validatedPayload.supplierInvoiceNumber,
      ),
      supplierInvoiceDate: readStringValue(
        validatedPayload.supplierInvoiceDate,
      ),
      currencyCode: readStringValue(validatedPayload.currencyCode, 'USD'),
      exchangeRateToUsd:
        readStringValue(validatedPayload.currencyCode, 'USD') === 'USD'
          ? '1'
          : '950',
      paymentTerms: readStringValue(validatedPayload.paymentTerms),
      estimatedDispatchDate: readStringValue(
        validatedPayload.estimatedDispatchDate,
      ),
      notes: readStringValue(validatedPayload.notes),
      items:
        payloadItems.length > 0
          ? payloadItems.map((item, index) => {
              const record = isRecord(item) ? item : {};

              return {
                productId: readNumberishValue(record.productId, String(index + 1)),
                productDescriptionSnapshot: readStringValue(
                  record.productDescriptionSnapshot,
                  `Linea ${index + 1}`,
                ),
                quantityOrdered: readNumberishValue(record.quantityOrdered, '1'),
                unitMeasure: readStringValue(record.unitMeasure, 'unit'),
                unitPriceOriginal: readNumberishValue(record.unitPriceOriginal, '0'),
              };
            })
          : extraction.items.map((item, index) => ({
              productId: String(index + 1),
              productDescriptionSnapshot: item.productDescription,
              quantityOrdered: item.quantity,
              unitMeasure: item.unitMeasure ?? 'unit',
              unitPriceOriginal: item.unitPrice ?? '0',
            })),
    };
  }

  return {
    supplierId: '1',
    orderNumber: `PO-DOC-${String(extraction.id).padStart(4, '0')}`,
    orderDate: getTodayDate(),
    supplierInvoiceNumber: '',
    supplierInvoiceDate: '',
    currencyCode: 'USD',
    exchangeRateToUsd: '1',
    paymentTerms: '50% advance / 50% before dispatch',
    estimatedDispatchDate: '',
    notes: '',
    items: extraction.items.map((item, index) => ({
      productId: String(index + 1),
      productDescriptionSnapshot: item.productDescription,
      quantityOrdered: item.quantity,
      unitMeasure: item.unitMeasure ?? 'unit',
      unitPriceOriginal: item.unitPrice ?? '0',
    })),
  };
}

export function DocumentsPage() {
  const { session } = useAuth();
  const [uploads, setUploads] = useState<DocumentUpload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [uploadSubmitting, setUploadSubmitting] = useState(false);
  const [extractionSubmitting, setExtractionSubmitting] = useState(false);
  const [validationSubmitting, setValidationSubmitting] = useState(false);
  const [conversionSubmitting, setConversionSubmitting] = useState(false);
  const [uploadForm, setUploadForm] = useState<UploadFormState>(getInitialUploadForm);
  const [extractionForm, setExtractionForm] = useState<ExtractionFormState>(
    getInitialExtractionForm,
  );
  const [selectedExtractionId, setSelectedExtractionId] = useState('');
  const [validationForm, setValidationForm] = useState<ValidationFormState | null>(
    null,
  );
  const [conversionForm, setConversionForm] = useState<ConversionFormState>(
    getInitialConversionForm,
  );

  const extractionOptions = useMemo<ExtractionOption[]>(
    () =>
      uploads.flatMap((upload) => {
        const uploadHasConvertedExtraction = upload.extractions.some(
          (extraction) => extraction.status === 'converted',
        );

        return upload.extractions.map((extraction) => ({
          ...extraction,
          uploadId: upload.id,
          uploadFileName: upload.originalFileName,
          uploadStatus: upload.status,
          uploadHasConvertedExtraction,
        }));
      }),
    [uploads],
  );

  const selectedExtraction =
    extractionOptions.find(
      (extraction) => String(extraction.id) === selectedExtractionId,
    ) ?? null;

  const loadUploads = useCallback(async () => {
    try {
      setError(null);
      const response = await getJson<DocumentUpload[]>(
        '/document-processing/uploads',
        session?.accessToken,
      );
      setUploads(response);
      setExtractionForm((current) => ({
        ...current,
        documentUploadId:
          current.documentUploadId || (response.length > 0 ? String(response[0].id) : ''),
      }));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No fue posible cargar las proformas procesadas.',
      );
    }
  }, [session?.accessToken]);

  useEffect(() => {
    void loadUploads();
  }, [loadUploads]);

  useEffect(() => {
    if (extractionOptions.length === 0) {
      setSelectedExtractionId('');
      setValidationForm(null);
      return;
    }

    if (
      !selectedExtractionId ||
      !extractionOptions.some(
        (extraction) => String(extraction.id) === selectedExtractionId,
      )
    ) {
      setSelectedExtractionId(String(extractionOptions[0].id));
      return;
    }

    const nextSelected = extractionOptions.find(
      (extraction) => String(extraction.id) === selectedExtractionId,
    );

    if (nextSelected) {
      setValidationForm(buildDefaultValidationForm(nextSelected));
      setConversionForm(getInitialConversionForm());
    }
  }, [extractionOptions, selectedExtractionId]);

  async function handleCreateUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session?.user.id) {
      setError('La sesion no tiene un userId valido para registrar documentos.');
      return;
    }

    try {
      setUploadSubmitting(true);
      setError(null);
      setSuccessMessage(null);

      const createdUpload = await postJson<DocumentUpload>(
        '/document-processing/uploads',
        {
          ...uploadForm,
          uploadedByUserId: session.user.id,
        },
        session.accessToken,
      );

      setUploadForm(getInitialUploadForm());
      setSuccessMessage(
        `Upload ${createdUpload.originalFileName} registrado correctamente.`,
      );

      await loadUploads();
      setExtractionForm((current) => ({
        ...current,
        documentUploadId: String(createdUpload.id),
      }));
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'No fue posible registrar la proforma.',
      );
    } finally {
      setUploadSubmitting(false);
    }
  }

  function updateExtractionItem(
    index: number,
    field: keyof ExtractionItemFormState,
    value: string,
  ) {
    setExtractionForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
  }

  function addExtractionItem() {
    setExtractionForm((current) => ({
      ...current,
      items: [...current.items, createExtractionItem(current.items.length)],
    }));
  }

  function removeExtractionItem(index: number) {
    setExtractionForm((current) => {
      const nextItems = current.items.filter((_, itemIndex) => itemIndex !== index);

      return {
        ...current,
        items:
          nextItems.length > 0
            ? nextItems.map((item, itemIndex) => ({
                ...item,
                lineIndex: String(itemIndex + 1),
              }))
            : [createExtractionItem(0)],
      };
    });
  }

  async function handleCreateExtraction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!extractionForm.documentUploadId) {
      setError('Primero crea o selecciona un upload para generar la extraccion.');
      return;
    }

    try {
      setExtractionSubmitting(true);
      setError(null);
      setSuccessMessage(null);

      const createdExtraction = await postJson<DocumentExtraction>(
        `/document-processing/uploads/${extractionForm.documentUploadId}/extractions`,
        {
          detectedDocumentType: extractionForm.detectedDocumentType,
          rawText: extractionForm.rawText || undefined,
          confidenceScore: parseDecimal(extractionForm.confidenceScore, 0.92),
          items: extractionForm.items.map((item, index) => {
            const quantity = parseDecimal(item.quantity);
            const unitPrice = parseDecimal(item.unitPrice, 0);
            const lineTotal =
              item.lineTotal.trim().length > 0
                ? parseDecimal(item.lineTotal)
                : quantity * unitPrice;

            return {
              lineIndex: parseDecimal(item.lineIndex, index + 1),
              productDescription: item.productDescription,
              skuDetected: item.skuDetected || undefined,
              quantity,
              unitMeasure: item.unitMeasure || undefined,
              unitPrice,
              lineTotal,
              confidenceScore: parseDecimal(item.confidenceScore, 0.92),
            };
          }),
        },
        session?.accessToken,
      );

      setSuccessMessage('Extraccion creada y lista para validacion humana.');
      setExtractionForm((current) => ({
        ...getInitialExtractionForm(),
        documentUploadId: current.documentUploadId,
      }));
      setSelectedExtractionId(String(createdExtraction.id));

      await loadUploads();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'No fue posible crear la extraccion.',
      );
    } finally {
      setExtractionSubmitting(false);
    }
  }

  function updateValidationItem(
    index: number,
    field: keyof ValidationItemFormState,
    value: string,
  ) {
    setValidationForm((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        items: current.items.map((item, itemIndex) =>
          itemIndex === index ? { ...item, [field]: value } : item,
        ),
      };
    });
  }

  async function handleValidateExtraction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session?.user.id || !selectedExtraction || !validationForm) {
      setError('No hay una extraccion valida seleccionada para validar.');
      return;
    }

    try {
      setValidationSubmitting(true);
      setError(null);
      setSuccessMessage(null);

      const exchangeRateToUsd = parseDecimal(
        validationForm.exchangeRateToUsd,
        validationForm.currencyCode === 'USD' ? 1 : undefined,
      );

      await postJson<DocumentExtraction>(
        `/document-processing/extractions/${selectedExtraction.id}/validate`,
        {
          validatedByUserId: session.user.id,
          supplierId: parseDecimal(validationForm.supplierId),
          orderNumber: validationForm.orderNumber,
          orderDate: validationForm.orderDate,
          supplierInvoiceNumber: validationForm.supplierInvoiceNumber || undefined,
          supplierInvoiceDate: validationForm.supplierInvoiceDate || undefined,
          currencyCode: validationForm.currencyCode,
          paymentTerms: validationForm.paymentTerms || undefined,
          estimatedDispatchDate:
            validationForm.estimatedDispatchDate || undefined,
          notes: validationForm.notes || undefined,
          items: validationForm.items.map((item) => {
            const quantityOrdered = parseDecimal(item.quantityOrdered);
            const unitPriceOriginal = parseDecimal(item.unitPriceOriginal);
            const unitPriceUsd =
              validationForm.currencyCode === 'USD'
                ? unitPriceOriginal
                : unitPriceOriginal / exchangeRateToUsd;
            const lineTotalOriginal = quantityOrdered * unitPriceOriginal;
            const lineTotalUsd = quantityOrdered * unitPriceUsd;

            return {
              productId: parseDecimal(item.productId),
              productDescriptionSnapshot: item.productDescriptionSnapshot,
              quantityOrdered,
              unitMeasure: item.unitMeasure,
              unitPriceOriginal,
              exchangeRateToUsd,
              unitPriceUsd,
              lineTotalOriginal,
              lineTotalUsd,
            };
          }),
        },
        session.accessToken,
      );

      setSuccessMessage(
        `Extraccion ${selectedExtraction.id} validada y lista para crear pedido.`,
      );

      await loadUploads();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'No fue posible validar la extraccion.',
      );
    } finally {
      setValidationSubmitting(false);
    }
  }

  async function handleCreateOrderFromValidatedExtraction() {
    if (!session?.user.id || !selectedExtraction) {
      setError('No hay una extraccion valida seleccionada para convertir.');
      return;
    }

    try {
      setConversionSubmitting(true);
      setError(null);
      setSuccessMessage(null);

      const createdOrder = await postJson<PurchaseOrder>(
        `/document-processing/extractions/${selectedExtraction.id}/create-purchase-order`,
        {
          createdByUserId: session.user.id,
          status: conversionForm.status || undefined,
          notes: conversionForm.notes || undefined,
        },
        session.accessToken,
      );

      setSuccessMessage(
        `Pedido ${createdOrder.orderNumber} creado desde la extraccion ${selectedExtraction.id}.`,
      );

      await loadUploads();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'No fue posible crear el pedido desde la extraccion.',
      );
    } finally {
      setConversionSubmitting(false);
    }
  }

  const validationTotals = validationForm
    ? validationForm.items.reduce(
        (totals, item) => {
          const quantity = parseDecimal(item.quantityOrdered, 0);
          const unitPriceOriginal = parseDecimal(item.unitPriceOriginal, 0);
          const original = quantity * unitPriceOriginal;
          const exchangeRate = parseDecimal(
            validationForm.exchangeRateToUsd,
            validationForm.currencyCode === 'USD' ? 1 : 0,
          );
          const usd =
            validationForm.currencyCode === 'USD'
              ? original
              : exchangeRate > 0
                ? original / exchangeRate
                : 0;

          return {
            original: totals.original + original,
            usd: totals.usd + usd,
          };
        },
        { original: 0, usd: 0 },
      )
    : { original: 0, usd: 0 };

  return (
    <div className="page-grid">
      <SectionCard
        title="Registrar proforma"
        subtitle="Primer paso del pipeline documental"
      >
        <form className="inline-form" onSubmit={handleCreateUpload}>
          <label className="field">
            <span>Tipo</span>
            <select
              value={uploadForm.documentType}
              onChange={(event) =>
                setUploadForm((current) => ({
                  ...current,
                  documentType: event.target.value,
                }))
              }
            >
              <option value="proforma_invoice">proforma_invoice</option>
            </select>
          </label>

          <label className="field">
            <span>Nombre archivo</span>
            <input
              value={uploadForm.originalFileName}
              onChange={(event) =>
                setUploadForm((current) => ({
                  ...current,
                  originalFileName: event.target.value,
                }))
              }
              placeholder="proforma-abril.pdf"
              required
            />
          </label>

          <label className="field">
            <span>Ruta local o storage</span>
            <input
              value={uploadForm.storagePath}
              onChange={(event) =>
                setUploadForm((current) => ({
                  ...current,
                  storagePath: event.target.value,
                }))
              }
              placeholder="/tmp/proforma-abril.pdf"
              required
            />
          </label>

          <label className="field">
            <span>MIME type</span>
            <input
              value={uploadForm.mimeType}
              onChange={(event) =>
                setUploadForm((current) => ({
                  ...current,
                  mimeType: event.target.value,
                }))
              }
              placeholder="application/pdf"
              required
            />
          </label>

          <button
            type="submit"
            className="primary-button"
            disabled={uploadSubmitting}
          >
            {uploadSubmitting ? 'Registrando...' : 'Crear upload'}
          </button>
        </form>
      </SectionCard>

      <SectionCard
        title="Crear extraccion"
        subtitle="Simula la lectura automatica del PDF y deja la data lista para validar"
      >
        {error ? <p className="feedback feedback-error">{error}</p> : null}
        {successMessage ? (
          <p className="feedback feedback-success">{successMessage}</p>
        ) : null}

        {uploads.length === 0 ? (
          <p className="muted">
            Primero crea un upload para poder generar una extraccion.
          </p>
        ) : (
          <form className="stack-form" onSubmit={handleCreateExtraction}>
            <div className="form-grid form-grid-three">
              <label className="field">
                <span>Upload</span>
                <select
                  value={extractionForm.documentUploadId}
                  onChange={(event) =>
                    setExtractionForm((current) => ({
                      ...current,
                      documentUploadId: event.target.value,
                    }))
                  }
                  required
                >
                  {uploads.map((upload) => (
                    <option key={upload.id} value={upload.id}>
                      #{upload.id} · {upload.originalFileName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Tipo detectado</span>
                <select
                  value={extractionForm.detectedDocumentType}
                  onChange={(event) =>
                    setExtractionForm((current) => ({
                      ...current,
                      detectedDocumentType: event.target.value,
                    }))
                  }
                >
                  <option value="proforma_invoice">proforma_invoice</option>
                </select>
              </label>

              <label className="field">
                <span>Confianza</span>
                <input
                  value={extractionForm.confidenceScore}
                  onChange={(event) =>
                    setExtractionForm((current) => ({
                      ...current,
                      confidenceScore: event.target.value,
                    }))
                  }
                  inputMode="decimal"
                  required
                />
              </label>
            </div>

            <label className="field">
              <span>Texto bruto extraido</span>
              <textarea
                value={extractionForm.rawText}
                onChange={(event) =>
                  setExtractionForm((current) => ({
                    ...current,
                    rawText: event.target.value,
                  }))
                }
                placeholder="Texto OCR o texto digital del PDF..."
                rows={4}
              />
            </label>

            <div className="subsection-head">
              <div>
                <h4>Lineas detectadas</h4>
                <p className="muted">
                  Cada fila representa un articulo detectado desde la proforma.
                </p>
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={addExtractionItem}
              >
                Agregar linea
              </button>
            </div>

            <div className="stack-list">
              {extractionForm.items.map((item, index) => (
                <div key={`${item.lineIndex}-${index}`} className="line-item-card">
                  <div className="form-grid form-grid-four">
                    <label className="field">
                      <span>Linea</span>
                      <input
                        value={item.lineIndex}
                        onChange={(event) =>
                          updateExtractionItem(index, 'lineIndex', event.target.value)
                        }
                        inputMode="numeric"
                        required
                      />
                    </label>

                    <label className="field field-span-two">
                      <span>Descripcion</span>
                      <input
                        value={item.productDescription}
                        onChange={(event) =>
                          updateExtractionItem(
                            index,
                            'productDescription',
                            event.target.value,
                          )
                        }
                        placeholder="Producto detectado en la proforma"
                        required
                      />
                    </label>

                    <label className="field">
                      <span>SKU detectado</span>
                      <input
                        value={item.skuDetected}
                        onChange={(event) =>
                          updateExtractionItem(index, 'skuDetected', event.target.value)
                        }
                        placeholder="Opcional"
                      />
                    </label>

                    <label className="field">
                      <span>Cantidad</span>
                      <input
                        value={item.quantity}
                        onChange={(event) =>
                          updateExtractionItem(index, 'quantity', event.target.value)
                        }
                        inputMode="decimal"
                        required
                      />
                    </label>

                    <label className="field">
                      <span>Unidad</span>
                      <input
                        value={item.unitMeasure}
                        onChange={(event) =>
                          updateExtractionItem(index, 'unitMeasure', event.target.value)
                        }
                      />
                    </label>

                    <label className="field">
                      <span>Unit price</span>
                      <input
                        value={item.unitPrice}
                        onChange={(event) =>
                          updateExtractionItem(index, 'unitPrice', event.target.value)
                        }
                        inputMode="decimal"
                        required
                      />
                    </label>

                    <label className="field">
                      <span>Line total</span>
                      <input
                        value={item.lineTotal}
                        onChange={(event) =>
                          updateExtractionItem(index, 'lineTotal', event.target.value)
                        }
                        inputMode="decimal"
                        placeholder="Auto si se deja vacio"
                      />
                    </label>

                    <label className="field">
                      <span>Confianza</span>
                      <input
                        value={item.confidenceScore}
                        onChange={(event) =>
                          updateExtractionItem(
                            index,
                            'confidenceScore',
                            event.target.value,
                          )
                        }
                        inputMode="decimal"
                      />
                    </label>
                  </div>

                  <div className="line-item-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => removeExtractionItem(index)}
                    >
                      Quitar linea
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="form-actions">
              <button
                type="submit"
                className="primary-button"
                disabled={extractionSubmitting}
              >
                {extractionSubmitting ? 'Extrayendo...' : 'Crear extraccion'}
              </button>
            </div>
          </form>
        )}
      </SectionCard>

      <SectionCard
        title="Validar extraccion"
        subtitle="Revision humana antes de convertir la proforma en un pedido real"
      >
        {extractionOptions.length === 0 || !selectedExtraction || !validationForm ? (
          <p className="muted">
            Todavia no hay extracciones disponibles para validar.
          </p>
        ) : (
          <form className="stack-form" onSubmit={handleValidateExtraction}>
            <div className="form-grid form-grid-three">
              <label className="field">
                <span>Extraccion</span>
                <select
                  value={selectedExtractionId}
                  onChange={(event) => setSelectedExtractionId(event.target.value)}
                >
                  {extractionOptions.map((extraction) => (
                    <option key={extraction.id} value={extraction.id}>
                      #{extraction.id} · upload {extraction.uploadId} ·{' '}
                      {extraction.uploadFileName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Estado actual</span>
                <input value={selectedExtraction.status} readOnly />
              </label>

              <label className="field">
                <span>Upload</span>
                <input
                  value={`#${selectedExtraction.uploadId} · ${selectedExtraction.uploadFileName}`}
                  readOnly
                />
              </label>
            </div>

            <div className="form-grid form-grid-four">
              <label className="field">
                <span>Supplier ID</span>
                <input
                  value={validationForm.supplierId}
                  onChange={(event) =>
                    setValidationForm((current) =>
                      current
                        ? { ...current, supplierId: event.target.value }
                        : current,
                    )
                  }
                  inputMode="numeric"
                  required
                />
              </label>

              <label className="field">
                <span>Numero pedido</span>
                <input
                  value={validationForm.orderNumber}
                  onChange={(event) =>
                    setValidationForm((current) =>
                      current
                        ? { ...current, orderNumber: event.target.value }
                        : current,
                    )
                  }
                  required
                />
              </label>

              <label className="field">
                <span>Fecha pedido</span>
                <input
                  type="date"
                  value={validationForm.orderDate}
                  onChange={(event) =>
                    setValidationForm((current) =>
                      current
                        ? { ...current, orderDate: event.target.value }
                        : current,
                    )
                  }
                  required
                />
              </label>

              <label className="field">
                <span>Moneda</span>
                <select
                  value={validationForm.currencyCode}
                  onChange={(event) =>
                    setValidationForm((current) =>
                      current
                        ? {
                            ...current,
                            currencyCode: event.target.value,
                            exchangeRateToUsd:
                              event.target.value === 'USD'
                                ? '1'
                                : current.exchangeRateToUsd,
                          }
                        : current,
                    )
                  }
                >
                  <option value="USD">USD</option>
                  <option value="CLP">CLP</option>
                </select>
              </label>

              <label className="field">
                <span>TC a USD</span>
                <input
                  value={validationForm.exchangeRateToUsd}
                  onChange={(event) =>
                    setValidationForm((current) =>
                      current
                        ? { ...current, exchangeRateToUsd: event.target.value }
                        : current,
                    )
                  }
                  inputMode="decimal"
                  required
                />
              </label>

              <label className="field">
                <span>Factura proveedor</span>
                <input
                  value={validationForm.supplierInvoiceNumber}
                  onChange={(event) =>
                    setValidationForm((current) =>
                      current
                        ? {
                            ...current,
                            supplierInvoiceNumber: event.target.value,
                          }
                        : current,
                    )
                  }
                  placeholder="Opcional"
                />
              </label>

              <label className="field">
                <span>Fecha factura</span>
                <input
                  type="date"
                  value={validationForm.supplierInvoiceDate}
                  onChange={(event) =>
                    setValidationForm((current) =>
                      current
                        ? { ...current, supplierInvoiceDate: event.target.value }
                        : current,
                    )
                  }
                />
              </label>

              <label className="field">
                <span>Dispatch estimado</span>
                <input
                  type="date"
                  value={validationForm.estimatedDispatchDate}
                  onChange={(event) =>
                    setValidationForm((current) =>
                      current
                        ? {
                            ...current,
                            estimatedDispatchDate: event.target.value,
                          }
                        : current,
                    )
                  }
                />
              </label>
            </div>

            <label className="field">
              <span>Condiciones de pago</span>
              <input
                value={validationForm.paymentTerms}
                onChange={(event) =>
                  setValidationForm((current) =>
                    current
                      ? { ...current, paymentTerms: event.target.value }
                      : current,
                  )
                }
              />
            </label>

            <label className="field">
              <span>Notas de validacion</span>
              <textarea
                value={validationForm.notes}
                onChange={(event) =>
                  setValidationForm((current) =>
                    current ? { ...current, notes: event.target.value } : current,
                  )
                }
                rows={3}
                placeholder="Ajustes manuales, confirmaciones o comentarios internos"
              />
            </label>

            <div className="subsection-head">
              <div>
                <h4>Items confirmados</h4>
                <p className="muted">
                  Aqui se asigna el `productId` real y se corrigen cantidades o
                  precios si hace falta.
                </p>
              </div>
            </div>

            <div className="stack-list">
              {validationForm.items.map((item, index) => (
                <div key={`${selectedExtraction.id}-${index}`} className="line-item-card">
                  <div className="form-grid form-grid-four">
                    <label className="field">
                      <span>Product ID</span>
                      <input
                        value={item.productId}
                        onChange={(event) =>
                          updateValidationItem(index, 'productId', event.target.value)
                        }
                        inputMode="numeric"
                        required
                      />
                    </label>

                    <label className="field field-span-two">
                      <span>Descripcion final</span>
                      <input
                        value={item.productDescriptionSnapshot}
                        onChange={(event) =>
                          updateValidationItem(
                            index,
                            'productDescriptionSnapshot',
                            event.target.value,
                          )
                        }
                        required
                      />
                    </label>

                    <label className="field">
                      <span>Unidad</span>
                      <input
                        value={item.unitMeasure}
                        onChange={(event) =>
                          updateValidationItem(index, 'unitMeasure', event.target.value)
                        }
                        required
                      />
                    </label>

                    <label className="field">
                      <span>Cantidad</span>
                      <input
                        value={item.quantityOrdered}
                        onChange={(event) =>
                          updateValidationItem(
                            index,
                            'quantityOrdered',
                            event.target.value,
                          )
                        }
                        inputMode="decimal"
                        required
                      />
                    </label>

                    <label className="field">
                      <span>Precio original</span>
                      <input
                        value={item.unitPriceOriginal}
                        onChange={(event) =>
                          updateValidationItem(
                            index,
                            'unitPriceOriginal',
                            event.target.value,
                          )
                        }
                        inputMode="decimal"
                        required
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="metric-strip">
              <div className="metric-chip">
                <span>Total original</span>
                <strong>
                  {validationTotals.original.toFixed(2)} {validationForm.currencyCode}
                </strong>
              </div>
              <div className="metric-chip">
                <span>Total USD</span>
                <strong>{validationTotals.usd.toFixed(2)} USD</strong>
              </div>
            </div>

            <div className="form-actions">
              <button
                type="submit"
                className="primary-button"
                disabled={validationSubmitting}
              >
                {validationSubmitting ? 'Validando...' : 'Validar extraccion'}
              </button>
            </div>
          </form>
        )}
      </SectionCard>

      <SectionCard
        title="Crear pedido desde validacion"
        subtitle="Ultimo paso del flujo documental asistido"
      >
        {!selectedExtraction ? (
          <p className="muted">Selecciona una extraccion para continuar.</p>
        ) : (
          <div className="stack-form">
            <div className="info-banner">
              <strong>Extraccion seleccionada</strong>
              <span>
                #{selectedExtraction.id} · {selectedExtraction.uploadFileName} · estado{' '}
                {selectedExtraction.status}
              </span>
            </div>

            {selectedExtraction.uploadHasConvertedExtraction &&
            selectedExtraction.status !== 'converted' ? (
              <p className="feedback feedback-warning">
                Este upload ya genero un pedido anteriormente. La UI bloquea una
                segunda conversion para evitar duplicados.
              </p>
            ) : null}

            <div className="form-grid form-grid-three">
              <label className="field">
                <span>Status del pedido</span>
                <select
                  value={conversionForm.status}
                  onChange={(event) =>
                    setConversionForm((current) => ({
                      ...current,
                      status: event.target.value,
                    }))
                  }
                >
                  <option value="draft">draft</option>
                  <option value="ordered">ordered</option>
                </select>
              </label>

              <label className="field field-span-two">
                <span>Notas</span>
                <input
                  value={conversionForm.notes}
                  onChange={(event) =>
                    setConversionForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Notas para el pedido creado desde la extraccion"
                />
              </label>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="primary-button"
                disabled={
                  conversionSubmitting ||
                  !selectedExtraction.validation ||
                  (selectedExtraction.uploadHasConvertedExtraction &&
                    selectedExtraction.status !== 'converted')
                }
                onClick={() => void handleCreateOrderFromValidatedExtraction()}
              >
                {conversionSubmitting
                  ? 'Creando pedido...'
                  : 'Crear pedido desde validacion'}
              </button>

              {!selectedExtraction.validation ? (
                <p className="muted">
                  Primero valida la extraccion para habilitar este paso.
                </p>
              ) : null}
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Pipeline documental"
        subtitle="Cargas, extracciones y validaciones auditadas"
      >
        {uploads.length === 0 ? (
          <p className="muted">Todavia no hay proformas cargadas.</p>
        ) : (
          <div className="upload-grid">
            {uploads.map((upload) => (
              <article key={upload.id} className="upload-card">
                <header>
                  <strong>{upload.originalFileName}</strong>
                  <span className="pill">{upload.status}</span>
                </header>

                <div className="stack-list">
                  <div className="list-row">
                    <span>Tipo</span>
                    <strong>{upload.documentType}</strong>
                  </div>
                  <div className="list-row">
                    <span>Extracciones</span>
                    <strong>{upload.extractions.length}</strong>
                  </div>
                </div>

                {upload.extractions.map((extraction) => (
                  <div key={extraction.id} className="extraction-box">
                    <div className="list-row">
                      <span>Extraccion</span>
                      <strong>{extraction.detectedDocumentType}</strong>
                    </div>
                    <div className="list-row">
                      <span>Confianza</span>
                      <strong>{extraction.confidenceScore ?? 'N/A'}</strong>
                    </div>
                    <div className="list-row">
                      <span>Estado</span>
                      <strong>{extraction.status}</strong>
                    </div>
                    <div className="list-row">
                      <span>Validacion</span>
                      <strong>
                        {extraction.validation
                          ? new Intl.DateTimeFormat('es-CL', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            }).format(new Date(extraction.validation.validatedAt))
                          : 'Pendiente'}
                      </strong>
                    </div>

                    <div className="table-shell compact-table">
                      <table>
                        <thead>
                          <tr>
                            <th>Linea</th>
                            <th>Articulo</th>
                            <th>Qty</th>
                            <th>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {extraction.items.map((item) => (
                            <tr key={item.id}>
                              <td>{item.lineIndex}</td>
                              <td>{item.productDescription}</td>
                              <td>{item.quantity}</td>
                              <td>{item.lineTotal ?? '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="form-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => setSelectedExtractionId(String(extraction.id))}
                      >
                        Revisar en validador
                      </button>
                    </div>
                  </div>
                ))}
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
