export type CheckpointSummary = {
  checkpoint: string;
  ordersCount: number;
  articlesQuantity: number;
  usdTotal: number;
};

export type CheckpointArticle = {
  purchaseOrderId: number;
  orderNumber: string;
  checkpoint: string;
  productId: number;
  productDescriptionSnapshot: string;
  articlesQuantity: number;
};

export type PurchaseOrderItem = {
  id: number;
  productId: number;
  productDescriptionSnapshot: string;
  quantityOrdered: string;
  quantityReceived: string;
  unitMeasure: string;
  unitPriceOriginal: string;
  exchangeRateToUsd: string;
  unitPriceUsd: string;
  lineTotalOriginal: string;
  lineTotalUsd: string;
};

export type PurchaseOrderCheckpointEvent = {
  id: number;
  fromCheckpoint: string | null;
  toCheckpoint: string;
  changedByUserId: number;
  changedAt: string;
  notes: string | null;
  createdAt: string;
};

export type PurchaseOrder = {
  id: number;
  supplierId: number;
  proformaDocumentUploadId: number | null;
  invoiceDocumentUploadId: number | null;
  orderNumber: string;
  orderDate: string;
  currencyCode: string;
  paymentTerms: string | null;
  status: string;
  currentCheckpointStatus: string;
  currentCheckpointUpdatedAt: string | null;
  notes: string | null;
  items: PurchaseOrderItem[];
  checkpointEvents: PurchaseOrderCheckpointEvent[];
};

export type DocumentExtractionItem = {
  id: string;
  lineIndex: number;
  productDescription: string;
  skuDetected: string | null;
  quantity: string;
  unitMeasure: string | null;
  unitPrice: string | null;
  lineTotal: string | null;
  confidenceScore: string | null;
};

export type DocumentValidation = {
  id: string;
  validatedByUserId: string;
  validationNotes: string | null;
  validatedAt: string;
  validatedPayloadJson: Record<string, unknown>;
};

export type DocumentExtraction = {
  id: number;
  detectedDocumentType: string;
  status: string;
  confidenceScore: string | null;
  items: DocumentExtractionItem[];
  validation: DocumentValidation | null;
};

export type DocumentUpload = {
  id: number;
  documentType: string;
  originalFileName: string;
  storagePath: string;
  mimeType: string;
  status: string;
  createdAt: string;
  extractions: DocumentExtraction[];
};

export type InventoryLot = {
  id: string;
  productId: string;
  purchaseOrderItemId: string;
  shipmentItemId: string | null;
  warehouseId: string;
  lotCode: string;
  receivedQuantity: string;
  availableQuantity: string;
  reservedQuantity: string;
  status: string;
  receivedAt: string;
  purchaseUnitCostUsd: string;
  allocatedImportCostUsd: string;
  unitLandedCostUsd: string;
  createdAt: string;
  updatedAt: string;
  movements: InventoryMovement[];
};

export type Warehouse = {
  id: number;
  name: string;
  location: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type InventoryMovement = {
  id: string;
  inventoryLotId: string;
  movementType: string;
  quantity: string;
  referenceType: string | null;
  referenceId: string | null;
  movementDate: string;
  notes: string | null;
  createdAt: string;
};

export type SalesOrder = {
  id: string;
  orderNumber: string;
  saleType: string;
  status: string;
  orderDate: string;
  totalUsd: string;
};

export type SalesOrderProfitability = {
  salesOrderId: number;
  orderNumber: string;
  status: string;
  saleType: string;
  orderDate: string;
  quantitySold: number;
  revenueUsd: number;
  costUsd: number;
  grossMarginUsd: number;
  roiPercent: number | null;
  items: Array<{
    salesOrderItemId: number;
    productId: number;
    productDescriptionSnapshot: string;
    quantitySold: number;
    revenueUsd: number;
    costUsd: number;
    grossMarginUsd: number;
  }>;
};

export type InventoryLotProfitability = {
  inventoryLotId: number;
  lotCode: string;
  status: string;
  receivedQuantity: number;
  availableQuantity: number;
  reservedQuantity: number;
  purchaseUnitCostUsd: number;
  allocatedImportCostUsd: number;
  unitLandedCostUsd: number;
  dispatchedQuantity: number;
  completedQuantity: number;
  dispatchedRevenueUsd: number;
  completedRevenueUsd: number;
  dispatchedCostUsd: number;
  completedCostUsd: number;
  dispatchedGrossMarginUsd: number;
  completedGrossMarginUsd: number;
  completedRoiPercent: number | null;
};

export type LatestExchangeRate = {
  baseCurrencyCode: string;
  quoteCurrencyCode: string;
  rate: number;
  buyRate: number | null;
  sellRate: number | null;
  rateDate: string;
  sourceName: string;
  sourceUrl: string | null;
  buySellSourceName: string | null;
  buySellSourceUrl: string | null;
  fetchedAt: string;
};

export type ExchangeRateSyncSummary = {
  baseCurrencyCode: string;
  quoteCurrencyCode: string;
  firstDate: string;
  lastDate: string;
  processedCount: number;
  importedCount: number;
  updatedCount: number;
  sourceName: string;
  sourceUrl: string;
  buySellSourceName: string | null;
  buySellSourceUrl: string | null;
};

export type ShipmentItem = {
  id: number;
  shipmentId: number;
  purchaseOrderItemId: number;
  productId: number;
  quantityShipped: string;
  createdAt: string;
  updatedAt: string;
};

export type ShipmentEvent = {
  id: number;
  shipmentId: number;
  eventType: string;
  eventDate: string;
  location: string | null;
  description: string | null;
  createdAt: string;
};

export type Shipment = {
  id: number;
  purchaseOrderId: number;
  shipmentNumber: string;
  transportMode: string;
  carrierName: string | null;
  originLocation: string | null;
  destinationLocation: string | null;
  trackingReference: string | null;
  etd: string | null;
  eta: string | null;
  actualDepartureAt: string | null;
  actualArrivalAt: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  items: ShipmentItem[];
  events: ShipmentEvent[];
};

export type ImportExpense = {
  id: number;
  customsEntryId: number;
  expenseType: string;
  expenseDate: string;
  currencyCode: string;
  amountOriginal: string;
  exchangeRateToUsd: string;
  amountUsd: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomsEntry = {
  id: number;
  shipmentId: number;
  entryNumber: string;
  arrivalDateChile: string | null;
  clearanceDate: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  expenses: ImportExpense[];
};

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000/api';

export function getApiBaseUrl() {
  return API_BASE_URL;
}

type RequestJsonOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  accessToken?: string | null;
};

async function requestJson<T>(
  path: string,
  { method = 'GET', body, accessToken }: RequestJsonOptions = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const errorPayload = (await response
      .json()
      .catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(errorPayload?.message)
      ? errorPayload.message.join(', ')
      : errorPayload?.message;

    throw new Error(
      message ?? `API request failed: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as T;
}

export function getJson<T>(path: string, accessToken?: string | null): Promise<T> {
  return requestJson<T>(path, { accessToken });
}

export function postJson<T>(
  path: string,
  body: unknown,
  accessToken?: string | null,
): Promise<T> {
  return requestJson<T>(path, { method: 'POST', body, accessToken });
}

export function patchJson<T>(
  path: string,
  body: unknown,
  accessToken?: string | null,
): Promise<T> {
  return requestJson<T>(path, { method: 'PATCH', body, accessToken });
}
