import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../app/auth';
import {
  type CheckpointArticle,
  type CheckpointSummary,
  type CustomsEntry,
  type DocumentUpload,
  type InventoryLot,
  type LatestExchangeRate,
  type PurchaseOrder,
  type SalesOrder,
  type Shipment,
  type Warehouse,
  getJson,
} from '../app/api';
import { downloadCsv } from '../app/export';
import { SectionCard } from '../components/ui/SectionCard';

const DEFAULT_HISTORY_START = '2026-04-12';

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateInput(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function getDateDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return formatDateInput(date);
}

function getFirstDayOfCurrentMonth() {
  const date = new Date();
  date.setDate(1);
  return formatDateInput(date);
}

function parseDecimal(value: string | number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

function getDateOnly(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value.slice(0, 10);
}

function isWithinDateRange(
  value: string | null | undefined,
  firstDate: string,
  lastDate: string,
) {
  const normalized = getDateOnly(value);

  if (!normalized) {
    return true;
  }

  return normalized >= firstDate && normalized <= lastDate;
}

export function ReportsPage() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<CheckpointSummary[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState('quotation');
  const [articles, setArticles] = useState<CheckpointArticle[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState('');
  const [entries, setEntries] = useState<CustomsEntry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState('');
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [selectedLotId, setSelectedLotId] = useState('');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [uploads, setUploads] = useState<DocumentUpload[]>([]);
  const [latestExchangeRate, setLatestExchangeRate] =
    useState<LatestExchangeRate | null>(null);
  const [exchangeRateHistory, setExchangeRateHistory] = useState<
    LatestExchangeRate[]
  >([]);
  const [firstDate, setFirstDate] = useState(DEFAULT_HISTORY_START);
  const [lastDate, setLastDate] = useState(getTodayDate());
  const [shipmentStatusFilter, setShipmentStatusFilter] = useState('all');
  const [customsStatusFilter, setCustomsStatusFilter] = useState('all');
  const [saleTypeFilter, setSaleTypeFilter] = useState<'all' | 'retail' | 'wholesale'>(
    'all',
  );
  const [salesStatusFilter, setSalesStatusFilter] = useState('all');
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [activePreset, setActivePreset] = useState('custom');

  const filteredOrders = useMemo(
    () => orders.filter((order) => isWithinDateRange(order.orderDate, firstDate, lastDate)),
    [orders, firstDate, lastDate],
  );

  const filteredArticles = useMemo(() => {
    const visibleOrderIds = new Set(
      filteredOrders
        .filter((order) => order.currentCheckpointStatus === selectedCheckpoint)
        .map((order) => order.id),
    );

    return articles.filter((article) => visibleOrderIds.has(article.purchaseOrderId));
  }, [articles, filteredOrders, selectedCheckpoint]);

  const filteredSummary = useMemo(() => {
    const grouped = new Map<
      string,
      { checkpoint: string; ordersCount: number; articlesQuantity: number; usdTotal: number }
    >();

    for (const order of filteredOrders) {
      const checkpoint = order.currentCheckpointStatus;
      const current = grouped.get(checkpoint) ?? {
        checkpoint,
        ordersCount: 0,
        articlesQuantity: 0,
        usdTotal: 0,
      };

      current.ordersCount += 1;
      current.articlesQuantity += order.items.reduce(
        (sum, item) => sum + parseDecimal(item.quantityOrdered),
        0,
      );
      current.usdTotal += order.items.reduce(
        (sum, item) => sum + parseDecimal(item.lineTotalUsd),
        0,
      );

      grouped.set(checkpoint, current);
    }

    return [...grouped.values()].sort((left, right) =>
      left.checkpoint.localeCompare(right.checkpoint),
    );
  }, [filteredOrders]);

  const filteredShipments = useMemo(
    () =>
      shipments.filter(
        (shipment) =>
          isWithinDateRange(shipment.etd ?? shipment.createdAt, firstDate, lastDate) &&
          (shipmentStatusFilter === 'all' || shipment.status === shipmentStatusFilter),
      ),
    [shipments, firstDate, lastDate, shipmentStatusFilter],
  );

  const filteredEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          isWithinDateRange(
            entry.arrivalDateChile ?? entry.createdAt,
            firstDate,
            lastDate,
          ) &&
          (customsStatusFilter === 'all' || entry.status === customsStatusFilter),
      ),
    [entries, firstDate, lastDate, customsStatusFilter],
  );

  const filteredLots = useMemo(
    () =>
      lots.filter(
        (lot) =>
          isWithinDateRange(lot.receivedAt, firstDate, lastDate) &&
          (warehouseFilter === 'all' || String(lot.warehouseId) === warehouseFilter),
      ),
    [lots, firstDate, lastDate, warehouseFilter],
  );

  const filteredSalesOrders = useMemo(
    () =>
      salesOrders.filter(
        (order) =>
          isWithinDateRange(order.orderDate, firstDate, lastDate) &&
          (saleTypeFilter === 'all' || order.saleType === saleTypeFilter) &&
          (salesStatusFilter === 'all' || order.status === salesStatusFilter),
      ),
    [salesOrders, firstDate, lastDate, saleTypeFilter, salesStatusFilter],
  );

  const filteredUploads = useMemo(
    () =>
      uploads.filter((upload) =>
        isWithinDateRange(upload.createdAt, firstDate, lastDate),
      ),
    [uploads, firstDate, lastDate],
  );

  const selectedOrder = useMemo(
    () => filteredOrders.find((order) => String(order.id) === selectedOrderId) ?? null,
    [filteredOrders, selectedOrderId],
  );

  const selectedShipment = useMemo(
    () =>
      filteredShipments.find((shipment) => String(shipment.id) === selectedShipmentId) ??
      null,
    [filteredShipments, selectedShipmentId],
  );

  const selectedEntry = useMemo(
    () => filteredEntries.find((entry) => String(entry.id) === selectedEntryId) ?? null,
    [filteredEntries, selectedEntryId],
  );

  const selectedLot = useMemo(
    () => filteredLots.find((lot) => String(lot.id) === selectedLotId) ?? null,
    [filteredLots, selectedLotId],
  );

  const warehousesById = useMemo(
    () => new Map(warehouses.map((warehouse) => [String(warehouse.id), warehouse])),
    [warehouses],
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

    for (const lot of filteredLots) {
      const warehouseName =
        warehousesById.get(String(lot.warehouseId))?.name ??
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
  }, [filteredLots, warehousesById]);

  const loadFxHistory = useCallback(async () => {
    const response = await getJson<LatestExchangeRate[]>(
      `/finance/exchange-rates/history?base=USD&quote=CLP&firstDate=${firstDate}&lastDate=${lastDate}`,
      session?.accessToken,
    ).catch(() => []);

    setExchangeRateHistory(response);
  }, [firstDate, lastDate, session?.accessToken]);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        const [
          summaryResponse,
          ordersResponse,
          shipmentsResponse,
          entriesResponse,
          lotsResponse,
          warehousesResponse,
          salesOrdersResponse,
          uploadsResponse,
          latestExchangeRateResponse,
        ] = await Promise.all([
          getJson<CheckpointSummary[]>(
            '/procurement/checkpoints/summary',
            session?.accessToken,
          ),
          getJson<PurchaseOrder[]>('/procurement/orders', session?.accessToken),
          getJson<Shipment[]>('/shipments', session?.accessToken),
          getJson<CustomsEntry[]>('/customs/entries', session?.accessToken),
          getJson<InventoryLot[]>('/inventory/lots', session?.accessToken),
          getJson<Warehouse[]>('/inventory/warehouses', session?.accessToken).catch(
            () => [],
          ),
          getJson<SalesOrder[]>('/sales/orders', session?.accessToken),
          getJson<DocumentUpload[]>(
            '/document-processing/uploads',
            session?.accessToken,
          ),
          getJson<LatestExchangeRate>(
            '/finance/exchange-rates/latest?base=USD&quote=CLP',
            session?.accessToken,
          ).catch(() => null),
        ]);

        setSummary(summaryResponse);
        setOrders(ordersResponse);
        setShipments(shipmentsResponse);
        setEntries(entriesResponse);
        setLots(lotsResponse);
        setWarehouses(warehousesResponse);
        setSalesOrders(salesOrdersResponse);
        setUploads(uploadsResponse);
        setLatestExchangeRate(latestExchangeRateResponse);
        setSelectedOrderId((current) =>
          current && ordersResponse.some((order) => String(order.id) === current)
            ? current
            : ordersResponse[0]
              ? String(ordersResponse[0].id)
              : '',
        );
        setSelectedShipmentId((current) =>
          current &&
          shipmentsResponse.some((shipment) => String(shipment.id) === current)
            ? current
            : shipmentsResponse[0]
              ? String(shipmentsResponse[0].id)
              : '',
        );
        setSelectedEntryId((current) =>
          current && entriesResponse.some((entry) => String(entry.id) === current)
            ? current
            : entriesResponse[0]
              ? String(entriesResponse[0].id)
              : '',
        );
        setSelectedLotId((current) =>
          current && lotsResponse.some((lot) => String(lot.id) === current)
            ? current
            : lotsResponse[0]
              ? String(lotsResponse[0].id)
              : '',
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'No fue posible cargar el centro de reportes.',
        );
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, [session?.accessToken]);

  useEffect(() => {
    async function loadArticles() {
      try {
        const response = await getJson<CheckpointArticle[]>(
          `/procurement/checkpoints/${selectedCheckpoint}/articles`,
          session?.accessToken,
        );
        setArticles(response);
      } catch {
        setArticles([]);
      }
    }

    void loadArticles();
  }, [selectedCheckpoint, session?.accessToken]);

  useEffect(() => {
    void loadFxHistory();
  }, [loadFxHistory]);

  useEffect(() => {
    setSelectedOrderId((current) =>
      current && filteredOrders.some((order) => String(order.id) === current)
        ? current
        : filteredOrders[0]
          ? String(filteredOrders[0].id)
          : '',
    );
  }, [filteredOrders]);

  useEffect(() => {
    setSelectedShipmentId((current) =>
      current &&
      filteredShipments.some((shipment) => String(shipment.id) === current)
        ? current
        : filteredShipments[0]
          ? String(filteredShipments[0].id)
          : '',
    );
  }, [filteredShipments]);

  useEffect(() => {
    setSelectedEntryId((current) =>
      current && filteredEntries.some((entry) => String(entry.id) === current)
        ? current
        : filteredEntries[0]
          ? String(filteredEntries[0].id)
          : '',
    );
  }, [filteredEntries]);

  useEffect(() => {
    setSelectedLotId((current) =>
      current && filteredLots.some((lot) => String(lot.id) === current)
        ? current
        : filteredLots[0]
          ? String(filteredLots[0].id)
          : '',
    );
  }, [filteredLots]);

  function convertUsdToClp(usdValue: number) {
    if (!latestExchangeRate) {
      return null;
    }

    return usdValue * latestExchangeRate.rate;
  }

  function getPresetLabel() {
    if (activePreset === 'live-operation') {
      return 'Operacion viva';
    }

    if (activePreset === 'finance') {
      return 'Finanzas';
    }

    if (activePreset === 'slow-inventory') {
      return 'Inventario lento';
    }

    if (activePreset === 'monthly-close') {
      return 'Cierre mensual';
    }

    return 'Custom';
  }

  function runBatchExport(exporters: Array<() => void>, label: string) {
    exporters.forEach((exporter, index) => {
      window.setTimeout(() => {
        exporter();
      }, index * 180);
    });

    setSuccessMessage(
      `Exportacion por lote iniciada para ${label}. El navegador descargara ${exporters.length} archivos CSV.`,
    );
  }

  function resetFilters() {
    setActivePreset('custom');
    setFirstDate(DEFAULT_HISTORY_START);
    setLastDate(getTodayDate());
    setShipmentStatusFilter('all');
    setCustomsStatusFilter('all');
    setSaleTypeFilter('all');
    setSalesStatusFilter('all');
    setWarehouseFilter('all');
  }

  function applyPreset(
    preset:
      | 'live-operation'
      | 'finance'
      | 'slow-inventory'
      | 'monthly-close',
  ) {
    const today = getTodayDate();

    setActivePreset(preset);
    setWarehouseFilter('all');

    if (preset === 'live-operation') {
      setFirstDate(getDateDaysAgo(21));
      setLastDate(today);
      setShipmentStatusFilter('in_transit');
      setCustomsStatusFilter('pending');
      setSaleTypeFilter('all');
      setSalesStatusFilter('confirmed');
      return;
    }

    if (preset === 'finance') {
      setFirstDate(getFirstDayOfCurrentMonth());
      setLastDate(today);
      setShipmentStatusFilter('all');
      setCustomsStatusFilter('all');
      setSaleTypeFilter('all');
      setSalesStatusFilter('completed');
      return;
    }

    if (preset === 'slow-inventory') {
      setFirstDate(DEFAULT_HISTORY_START);
      setLastDate(getDateDaysAgo(30));
      setShipmentStatusFilter('all');
      setCustomsStatusFilter('all');
      setSaleTypeFilter('all');
      setSalesStatusFilter('all');
      return;
    }

    setFirstDate(getFirstDayOfCurrentMonth());
    setLastDate(today);
    setShipmentStatusFilter('delivered');
    setCustomsStatusFilter('closed');
    setSaleTypeFilter('all');
    setSalesStatusFilter('completed');
  }

  function handleExportCheckpointSummary() {
    downloadCsv(
      `reports-procurement-checkpoints-${getTodayDate()}.csv`,
      ['checkpoint', 'orders_count', 'articles_quantity', 'usd_total', 'clp_total'],
      filteredSummary.map((item) => [
        item.checkpoint,
        item.ordersCount,
        item.articlesQuantity,
        item.usdTotal.toFixed(2),
        convertUsdToClp(item.usdTotal)?.toFixed(0) ?? null,
      ]),
    );
  }

  function handleExportCheckpointArticles() {
    downloadCsv(
      `reports-procurement-articles-${selectedCheckpoint}-${getTodayDate()}.csv`,
      [
        'purchase_order_id',
        'order_number',
        'checkpoint',
        'product_id',
        'description',
        'articles_quantity',
      ],
      filteredArticles.map((item) => [
        item.purchaseOrderId,
        item.orderNumber,
        item.checkpoint,
        item.productId,
        item.productDescriptionSnapshot,
        item.articlesQuantity,
      ]),
    );
  }

  function handleExportOrders() {
    downloadCsv(
      `reports-purchase-orders-${getTodayDate()}.csv`,
      [
        'order_id',
        'order_number',
        'supplier_id',
        'currency_code',
        'status',
        'checkpoint',
        'order_date',
        'items_count',
        'total_usd',
      ],
      filteredOrders.map((order) => [
        order.id,
        order.orderNumber,
        order.supplierId,
        order.currencyCode,
        order.status,
        order.currentCheckpointStatus,
        order.orderDate,
        order.items.length,
        order.items
          .reduce((total, item) => total + parseDecimal(item.lineTotalUsd), 0)
          .toFixed(2),
      ]),
    );
  }

  function handleExportSelectedOrderHistory() {
    if (!selectedOrder) {
      return;
    }

    downloadCsv(
      `reports-order-history-${selectedOrder.orderNumber}-${getTodayDate()}.csv`,
      ['from_checkpoint', 'to_checkpoint', 'changed_by_user_id', 'changed_at', 'notes'],
      selectedOrder.checkpointEvents.map((event) => [
        event.fromCheckpoint ?? 'inicio',
        event.toCheckpoint,
        event.changedByUserId,
        event.changedAt,
        event.notes,
      ]),
    );
  }

  function handleExportShipments() {
    downloadCsv(
      `reports-shipments-${getTodayDate()}.csv`,
      [
        'shipment_id',
        'shipment_number',
        'purchase_order_id',
        'transport_mode',
        'status',
        'carrier_name',
        'origin',
        'destination',
        'tracking_reference',
        'etd',
        'eta',
      ],
      filteredShipments.map((shipment) => [
        shipment.id,
        shipment.shipmentNumber,
        shipment.purchaseOrderId,
        shipment.transportMode,
        shipment.status,
        shipment.carrierName,
        shipment.originLocation,
        shipment.destinationLocation,
        shipment.trackingReference,
        shipment.etd,
        shipment.eta,
      ]),
    );
  }

  function handleExportSelectedShipmentDetail() {
    if (!selectedShipment) {
      return;
    }

    const itemRows = selectedShipment.items.map((item) => [
      'item',
      item.id,
      item.productId,
      item.purchaseOrderItemId,
      item.quantityShipped,
      null,
      null,
    ]);

    const eventRows = [...selectedShipment.events]
      .sort(
        (left, right) =>
          new Date(right.eventDate).getTime() - new Date(left.eventDate).getTime(),
      )
      .map((eventItem) => [
        'event',
        eventItem.id,
        null,
        null,
        null,
        eventItem.eventDate,
        `${eventItem.eventType}${eventItem.location ? ` @ ${eventItem.location}` : ''}${
          eventItem.description ? ` · ${eventItem.description}` : ''
        }`,
      ]);

    downloadCsv(
      `reports-shipment-detail-${selectedShipment.shipmentNumber}-${getTodayDate()}.csv`,
      [
        'row_type',
        'record_id',
        'product_id',
        'purchase_order_item_id',
        'quantity',
        'event_date',
        'details',
      ],
      [
        [
          'summary',
          selectedShipment.id,
          null,
          selectedShipment.purchaseOrderId,
          null,
          null,
          `status=${selectedShipment.status}; transport=${selectedShipment.transportMode}; tracking=${
            selectedShipment.trackingReference ?? 'N/A'
          }; eta=${selectedShipment.eta ?? 'N/A'}`,
        ],
        ...itemRows,
        ...eventRows,
      ],
    );
  }

  function handleExportCustomsEntries() {
    downloadCsv(
      `reports-customs-entries-${getTodayDate()}.csv`,
      [
        'entry_id',
        'entry_number',
        'shipment_id',
        'status',
        'arrival_date_chile',
        'clearance_date',
        'expenses_count',
        'total_usd',
      ],
      filteredEntries.map((entry) => [
        entry.id,
        entry.entryNumber,
        entry.shipmentId,
        entry.status,
        entry.arrivalDateChile,
        entry.clearanceDate,
        entry.expenses.length,
        entry.expenses
          .reduce((sum, expense) => sum + parseDecimal(expense.amountUsd), 0)
          .toFixed(2),
      ]),
    );
  }

  function handleExportSelectedEntryDetail() {
    if (!selectedEntry) {
      return;
    }

    downloadCsv(
      `reports-customs-detail-${selectedEntry.entryNumber}-${getTodayDate()}.csv`,
      [
        'expense_date',
        'expense_type',
        'currency_code',
        'amount_original',
        'exchange_rate_to_usd',
        'amount_usd',
        'notes',
      ],
      selectedEntry.expenses.map((expense) => [
        expense.expenseDate,
        expense.expenseType,
        expense.currencyCode,
        expense.amountOriginal,
        expense.exchangeRateToUsd,
        expense.amountUsd,
        expense.notes,
      ]),
    );
  }

  function handleExportInventoryLots() {
    downloadCsv(
      `reports-inventory-lots-${getTodayDate()}.csv`,
      [
        'lot_code',
        'warehouse',
        'warehouse_location',
        'product_id',
        'status',
        'age_days',
        'received_quantity',
        'available_quantity',
        'reserved_quantity',
        'purchase_unit_cost_usd',
        'allocated_import_cost_usd',
        'unit_landed_cost_usd',
      ],
      filteredLots.map((lot) => {
        const warehouse = warehousesById.get(String(lot.warehouseId));

        return [
          lot.lotCode,
          warehouse?.name ?? `Warehouse ${lot.warehouseId}`,
          warehouse?.location ?? null,
          lot.productId,
          lot.status,
          getLotAgeInDays(lot.receivedAt),
          lot.receivedQuantity,
          lot.availableQuantity,
          lot.reservedQuantity,
          lot.purchaseUnitCostUsd,
          lot.allocatedImportCostUsd,
          lot.unitLandedCostUsd,
        ];
      }),
    );
  }

  function handleExportSelectedLotMovements() {
    if (!selectedLot) {
      return;
    }

    downloadCsv(
      `reports-lot-movements-${selectedLot.lotCode}-${getTodayDate()}.csv`,
      ['movement_date', 'movement_type', 'quantity', 'reference_type', 'reference_id', 'notes'],
      [...selectedLot.movements]
        .sort(
          (left, right) =>
            new Date(right.movementDate).getTime() -
            new Date(left.movementDate).getTime(),
        )
        .map((movement) => [
          movement.movementDate,
          movement.movementType,
          movement.quantity,
          movement.referenceType,
          movement.referenceId,
          movement.notes,
        ]),
    );
  }

  function handleExportWarehouseSummary() {
    downloadCsv(
      `reports-warehouses-${getTodayDate()}.csv`,
      ['warehouse', 'lots_count', 'available_quantity', 'visible_usd', 'visible_clp'],
      warehouseMetrics.map((warehouseMetric) => [
        warehouseMetric.warehouseName,
        warehouseMetric.lotsCount,
        warehouseMetric.availableQuantity.toFixed(2),
        warehouseMetric.visibleUsd.toFixed(2),
        convertUsdToClp(warehouseMetric.visibleUsd)?.toFixed(0) ?? null,
      ]),
    );
  }

  function handleExportSalesOrders() {
    downloadCsv(
      `reports-sales-orders-${getTodayDate()}.csv`,
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
      ],
      filteredSalesOrders.map((order) => {
        const totalUsd = parseDecimal(order.totalUsd);

        return [
          order.orderNumber,
          order.saleType,
          order.status,
          order.orderDate,
          order.currencyCode,
          order.exchangeRateToUsd,
          order.totalOriginal,
          totalUsd.toFixed(2),
          convertUsdToClp(totalUsd)?.toFixed(0) ?? null,
        ];
      }),
    );
  }

  function handleExportFxHistory() {
    downloadCsv(
      `reports-fx-history-${firstDate}-to-${lastDate}.csv`,
      [
        'rate_date',
        'observed_rate_clp',
        'buy_rate_clp',
        'sell_rate_clp',
        'source_name',
        'buy_sell_source_name',
        'fetched_at',
      ],
      exchangeRateHistory.map((snapshot) => [
        snapshot.rateDate,
        snapshot.rate,
        snapshot.buyRate,
        snapshot.sellRate,
        snapshot.sourceName,
        snapshot.buySellSourceName,
        snapshot.fetchedAt,
      ]),
    );
  }

  function handleExportDocumentUploads() {
    downloadCsv(
      `reports-document-uploads-${getTodayDate()}.csv`,
      [
        'upload_id',
        'document_type',
        'original_file_name',
        'status',
        'created_at',
        'extractions_count',
        'validated_extractions_count',
      ],
      filteredUploads.map((upload) => [
        upload.id,
        upload.documentType,
        upload.originalFileName,
        upload.status,
        upload.createdAt,
        upload.extractions.length,
        upload.extractions.filter((extraction) => extraction.validation !== null)
          .length,
      ]),
    );
  }

  function handleExportPresetBatch() {
    const exporters =
      activePreset === 'live-operation'
        ? [
            handleExportCheckpointSummary,
            handleExportCheckpointArticles,
            handleExportShipments,
            handleExportCustomsEntries,
          ]
        : activePreset === 'finance'
          ? [
              handleExportSalesOrders,
              handleExportFxHistory,
              handleExportCustomsEntries,
              handleExportDocumentUploads,
            ]
          : activePreset === 'slow-inventory'
            ? [
                handleExportInventoryLots,
                handleExportWarehouseSummary,
                handleExportSelectedLotMovements,
              ]
            : activePreset === 'monthly-close'
              ? [
                  handleExportOrders,
                  handleExportShipments,
                  handleExportCustomsEntries,
                  handleExportSalesOrders,
                  handleExportFxHistory,
                  handleExportDocumentUploads,
                ]
              : [
                  handleExportCheckpointSummary,
                  handleExportOrders,
                  handleExportShipments,
                  handleExportCustomsEntries,
                  handleExportInventoryLots,
                  handleExportSalesOrders,
                  handleExportFxHistory,
                  handleExportDocumentUploads,
                ];

    const availableExporters = exporters.filter((exporter) => {
      if (exporter === handleExportSelectedLotMovements) {
        return Boolean(selectedLot);
      }

      return true;
    });

    runBatchExport(availableExporters, getPresetLabel());
  }

  return (
    <div className="page-grid">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Report Center</p>
          <h2>Centro unificado de reportes exportables</h2>
          <p className="hero-copy">
            Desde aqui puedes descargar CSV del flujo completo sin entrar a cada
            modulo por separado.
          </p>
        </div>

        <div className="metric-strip">
          <div className="metric-chip">
            <span>Compras</span>
            <strong>{loading ? '...' : orders.length}</strong>
          </div>
          <div className="metric-chip">
            <span>Embarques</span>
            <strong>{loading ? '...' : shipments.length}</strong>
          </div>
          <div className="metric-chip">
            <span>Aduana</span>
            <strong>{loading ? '...' : entries.length}</strong>
          </div>
          <div className="metric-chip">
            <span>Inventario</span>
            <strong>{loading ? '...' : lots.length}</strong>
          </div>
          <div className="metric-chip">
            <span>Ventas</span>
            <strong>{loading ? '...' : salesOrders.length}</strong>
          </div>
          <div className="metric-chip">
            <span>Docs</span>
            <strong>{loading ? '...' : uploads.length}</strong>
          </div>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className={activePreset === 'live-operation' ? 'primary-button' : 'ghost-button'}
            onClick={() => applyPreset('live-operation')}
          >
            Operacion viva
          </button>
          <button
            type="button"
            className={activePreset === 'finance' ? 'primary-button' : 'ghost-button'}
            onClick={() => applyPreset('finance')}
          >
            Finanzas
          </button>
          <button
            type="button"
            className={activePreset === 'slow-inventory' ? 'primary-button' : 'ghost-button'}
            onClick={() => applyPreset('slow-inventory')}
          >
            Inventario lento
          </button>
          <button
            type="button"
            className={activePreset === 'monthly-close' ? 'primary-button' : 'ghost-button'}
            onClick={() => applyPreset('monthly-close')}
          >
            Cierre mensual
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={resetFilters}
          >
            Reset filtros
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={handleExportPresetBatch}
          >
            Exportar preset activo
          </button>
        </div>

        {latestExchangeRate ? (
          <p className="muted">
            Snapshot activo: 1 USD = {latestExchangeRate.rate.toFixed(2)} CLP ·
            {` ${latestExchangeRate.sourceName}`}
          </p>
        ) : null}

        {successMessage ? (
          <p className="feedback feedback-success">{successMessage}</p>
        ) : null}
      </section>

      {error ? <p className="feedback feedback-error">{error}</p> : null}

      <SectionCard
        title="Filtros globales"
        subtitle="Los exportables salen recortados por este rango y por los filtros operativos activos"
      >
        <div className="form-grid form-grid-three">
          <label className="field">
            <span>Desde</span>
            <input
              type="date"
              value={firstDate}
              onChange={(event) => setFirstDate(event.target.value)}
            />
          </label>

          <label className="field">
            <span>Hasta</span>
            <input
              type="date"
              value={lastDate}
              onChange={(event) => setLastDate(event.target.value)}
            />
          </label>

          <label className="field">
            <span>Warehouse</span>
            <select
              value={warehouseFilter}
              onChange={(event) => setWarehouseFilter(event.target.value)}
            >
              <option value="all">Todos</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Estado embarque</span>
            <select
              value={shipmentStatusFilter}
              onChange={(event) => setShipmentStatusFilter(event.target.value)}
            >
              <option value="all">Todos</option>
              {Array.from(new Set(shipments.map((shipment) => shipment.status))).map(
                (status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="field">
            <span>Estado aduana</span>
            <select
              value={customsStatusFilter}
              onChange={(event) => setCustomsStatusFilter(event.target.value)}
            >
              <option value="all">Todos</option>
              {Array.from(new Set(entries.map((entry) => entry.status))).map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Canal venta</span>
            <select
              value={saleTypeFilter}
              onChange={(event) =>
                setSaleTypeFilter(event.target.value as 'all' | 'retail' | 'wholesale')
              }
            >
              <option value="all">Todos</option>
              <option value="retail">retail</option>
              <option value="wholesale">wholesale</option>
            </select>
          </label>

          <label className="field">
            <span>Estado venta</span>
            <select
              value={salesStatusFilter}
              onChange={(event) => setSalesStatusFilter(event.target.value)}
            >
              <option value="all">Todos</option>
              {Array.from(new Set(salesOrders.map((order) => order.status))).map(
                (status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>

        <div className="metric-strip">
          <div className="metric-chip">
            <span>Pedidos filtrados</span>
            <strong>{filteredOrders.length}</strong>
          </div>
          <div className="metric-chip">
            <span>Embarques filtrados</span>
            <strong>{filteredShipments.length}</strong>
          </div>
          <div className="metric-chip">
            <span>Aduanas filtradas</span>
            <strong>{filteredEntries.length}</strong>
          </div>
          <div className="metric-chip">
            <span>Lotes filtrados</span>
            <strong>{filteredLots.length}</strong>
          </div>
          <div className="metric-chip">
            <span>Ventas filtradas</span>
            <strong>{filteredSalesOrders.length}</strong>
          </div>
          <div className="metric-chip">
            <span>Docs filtrados</span>
            <strong>{filteredUploads.length}</strong>
          </div>
        </div>

        <p className="muted">
          Preset activo: {activePreset === 'custom' ? 'custom' : activePreset}
        </p>
      </SectionCard>

      <div className="two-column-grid">
        <SectionCard
          title="Compras y checkpoints"
          subtitle="Pedidos, checkpoints y articulos visibles"
        >
          <div className="form-grid form-grid-three">
            <label className="field">
              <span>Checkpoint activo</span>
              <select
                value={selectedCheckpoint}
                onChange={(event) => setSelectedCheckpoint(event.target.value)}
              >
                {summary.map((item) => (
                  <option key={item.checkpoint} value={item.checkpoint}>
                    {item.checkpoint}
                  </option>
                ))}
              </select>
            </label>

            <label className="field field-span-two">
              <span>Pedido para historial</span>
              <select
                value={selectedOrderId}
                onChange={(event) => setSelectedOrderId(event.target.value)}
              >
                {filteredOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.orderNumber}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={handleExportCheckpointSummary}
              disabled={filteredSummary.length === 0}
            >
              Resumen checkpoints
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={handleExportOrders}
              disabled={filteredOrders.length === 0}
            >
              Pedidos
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={handleExportSelectedOrderHistory}
              disabled={!selectedOrder || selectedOrder.checkpointEvents.length === 0}
            >
              Historial pedido
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={handleExportCheckpointArticles}
              disabled={filteredArticles.length === 0}
            >
              Articulos checkpoint
            </button>
          </div>
        </SectionCard>

        <SectionCard
          title="Embarques y aduana"
          subtitle="Tracking logistico y gastos de internacion"
        >
          <div className="form-grid form-grid-three">
            <label className="field">
              <span>Embarque</span>
              <select
                value={selectedShipmentId}
                onChange={(event) => setSelectedShipmentId(event.target.value)}
              >
                {filteredShipments.map((shipment) => (
                  <option key={shipment.id} value={shipment.id}>
                    {shipment.shipmentNumber}
                  </option>
                ))}
              </select>
            </label>

            <label className="field field-span-two">
              <span>Expediente aduanero</span>
              <select
                value={selectedEntryId}
                onChange={(event) => setSelectedEntryId(event.target.value)}
              >
                {filteredEntries.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.entryNumber}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={handleExportShipments}
              disabled={filteredShipments.length === 0}
            >
              Embarques
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={handleExportSelectedShipmentDetail}
              disabled={!selectedShipment}
            >
              Detalle embarque
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={handleExportCustomsEntries}
              disabled={filteredEntries.length === 0}
            >
              Expedientes
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={handleExportSelectedEntryDetail}
              disabled={!selectedEntry || selectedEntry.expenses.length === 0}
            >
              Gastos expediente
            </button>
          </div>
        </SectionCard>
      </div>

      <div className="two-column-grid">
        <SectionCard
          title="Inventario y warehouses"
          subtitle="Lotes, movimientos y distribucion visible"
        >
          <div className="form-grid form-grid-three">
            <label className="field field-span-two">
              <span>Lote</span>
              <select
                value={selectedLotId}
                onChange={(event) => setSelectedLotId(event.target.value)}
              >
                {filteredLots.map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    {lot.lotCode}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={handleExportInventoryLots}
              disabled={filteredLots.length === 0}
            >
              Lotes inventario
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={handleExportSelectedLotMovements}
              disabled={!selectedLot}
            >
              Movimientos lote
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={handleExportWarehouseSummary}
              disabled={warehouseMetrics.length === 0}
            >
              Resumen warehouses
            </button>
          </div>
        </SectionCard>

        <SectionCard
          title="Ventas, finanzas y documentos"
          subtitle="Ordenes de venta, FX historico y uploads documentales"
        >
          <div className="form-grid form-grid-three">
            <label className="field">
              <span>FX desde</span>
              <input
                type="date"
                value={firstDate}
                onChange={(event) => setFirstDate(event.target.value)}
              />
            </label>

            <label className="field">
              <span>FX hasta</span>
              <input
                type="date"
                value={lastDate}
                onChange={(event) => setLastDate(event.target.value)}
              />
            </label>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={handleExportSalesOrders}
              disabled={filteredSalesOrders.length === 0}
            >
              Ventas
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={handleExportFxHistory}
              disabled={exchangeRateHistory.length === 0}
            >
              FX historico
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={handleExportDocumentUploads}
              disabled={filteredUploads.length === 0}
            >
              Uploads documentales
            </button>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
