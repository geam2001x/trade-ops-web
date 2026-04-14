import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../app/auth';
import {
  type Customer,
  type Product,
  type Supplier,
  type Warehouse,
  getJson,
  patchJson,
  postJson,
} from '../app/api';
import { SectionCard } from '../components/ui/SectionCard';

type SupplierFormState = {
  name: string;
  taxId: string;
  countryCode: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
};

type CustomerFormState = {
  customerType: string;
  name: string;
  taxId: string;
  email: string;
  phone: string;
  address: string;
};

type ProductFormState = {
  sku: string;
  name: string;
  description: string;
  unitMeasure: string;
  defaultSalePriceUsd: string;
};

type WarehouseFormState = {
  name: string;
  location: string;
};

function getInitialSupplierForm(): SupplierFormState {
  return {
    name: '',
    taxId: '',
    countryCode: 'CL',
    contactName: '',
    email: '',
    phone: '',
    address: '',
  };
}

function getInitialCustomerForm(): CustomerFormState {
  return {
    customerType: 'wholesale',
    name: '',
    taxId: '',
    email: '',
    phone: '',
    address: '',
  };
}

function getInitialProductForm(): ProductFormState {
  return {
    sku: '',
    name: '',
    description: '',
    unitMeasure: 'unit',
    defaultSalePriceUsd: '',
  };
}

function getInitialWarehouseForm(): WarehouseFormState {
  return {
    name: '',
    location: '',
  };
}

function formatUsd(value: string | null) {
  if (!value) {
    return 'N/D';
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function MastersPage() {
  const { session } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [supplierForm, setSupplierForm] = useState<SupplierFormState>(
    getInitialSupplierForm,
  );
  const [customerForm, setCustomerForm] = useState<CustomerFormState>(
    getInitialCustomerForm,
  );
  const [productForm, setProductForm] = useState<ProductFormState>(
    getInitialProductForm,
  );
  const [warehouseForm, setWarehouseForm] = useState<WarehouseFormState>(
    getInitialWarehouseForm,
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const activeSummary = useMemo(
    () => ({
      suppliers: suppliers.filter((item) => item.isActive).length,
      customers: customers.filter((item) => item.isActive).length,
      products: products.filter((item) => item.isActive).length,
      warehouses: warehouses.filter((item) => item.isActive).length,
    }),
    [customers, products, suppliers, warehouses],
  );

  const loadSuppliers = useCallback(async () => {
    const response = await getJson<Supplier[]>(
      '/master-data/suppliers?includeInactive=true',
      session?.accessToken,
    );
    setSuppliers(response);
  }, [session?.accessToken]);

  const loadCustomers = useCallback(async () => {
    const response = await getJson<Customer[]>(
      '/master-data/customers?includeInactive=true',
      session?.accessToken,
    );
    setCustomers(response);
  }, [session?.accessToken]);

  const loadProducts = useCallback(async () => {
    const response = await getJson<Product[]>(
      '/master-data/products?includeInactive=true',
      session?.accessToken,
    );
    setProducts(response);
  }, [session?.accessToken]);

  const loadWarehouses = useCallback(async () => {
    const response = await getJson<Warehouse[]>(
      '/master-data/warehouses?includeInactive=true',
      session?.accessToken,
    );
    setWarehouses(response);
  }, [session?.accessToken]);

  useEffect(() => {
    async function loadPageData() {
      try {
        setError(null);
        await Promise.all([
          loadSuppliers(),
          loadCustomers(),
          loadProducts(),
          loadWarehouses(),
        ]);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'No fue posible cargar los catalogos maestros.',
        );
      }
    }

    void loadPageData();
  }, [loadCustomers, loadProducts, loadSuppliers, loadWarehouses]);

  async function handleCreateSupplier(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setBusyKey('supplier-create');
      setError(null);
      setSuccessMessage(null);

      await postJson<Supplier>(
        '/master-data/suppliers',
        {
          name: supplierForm.name,
          taxId: supplierForm.taxId || undefined,
          countryCode: supplierForm.countryCode,
          contactName: supplierForm.contactName || undefined,
          email: supplierForm.email || undefined,
          phone: supplierForm.phone || undefined,
          address: supplierForm.address || undefined,
        },
        session?.accessToken,
      );

      setSupplierForm(getInitialSupplierForm());
      setSuccessMessage('Proveedor creado correctamente.');
      await loadSuppliers();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'No fue posible crear el proveedor.',
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function handleCreateCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setBusyKey('customer-create');
      setError(null);
      setSuccessMessage(null);

      await postJson<Customer>(
        '/master-data/customers',
        {
          customerType: customerForm.customerType,
          name: customerForm.name,
          taxId: customerForm.taxId || undefined,
          email: customerForm.email || undefined,
          phone: customerForm.phone || undefined,
          address: customerForm.address || undefined,
        },
        session?.accessToken,
      );

      setCustomerForm(getInitialCustomerForm());
      setSuccessMessage('Cliente creado correctamente.');
      await loadCustomers();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'No fue posible crear el cliente.',
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function handleCreateProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setBusyKey('product-create');
      setError(null);
      setSuccessMessage(null);

      await postJson<Product>(
        '/master-data/products',
        {
          sku: productForm.sku,
          name: productForm.name,
          description: productForm.description || undefined,
          unitMeasure: productForm.unitMeasure,
          defaultSalePriceUsd: productForm.defaultSalePriceUsd
            ? Number(productForm.defaultSalePriceUsd)
            : undefined,
        },
        session?.accessToken,
      );

      setProductForm(getInitialProductForm());
      setSuccessMessage('Producto creado correctamente.');
      await loadProducts();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'No fue posible crear el producto.',
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function handleCreateWarehouse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setBusyKey('warehouse-create');
      setError(null);
      setSuccessMessage(null);

      await postJson<Warehouse>(
        '/master-data/warehouses',
        {
          name: warehouseForm.name,
          location: warehouseForm.location || undefined,
        },
        session?.accessToken,
      );

      setWarehouseForm(getInitialWarehouseForm());
      setSuccessMessage('Bodega creada correctamente.');
      await Promise.all([loadWarehouses()]);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'No fue posible crear la bodega.',
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function handleToggleStatus(
    kind: 'supplier' | 'customer' | 'product' | 'warehouse',
    id: number,
    isActive: boolean,
  ) {
    try {
      setBusyKey(`${kind}-${id}`);
      setError(null);
      setSuccessMessage(null);

      await patchJson(
        `/master-data/${kind}s/${id}/status`,
        { isActive: !isActive },
        session?.accessToken,
      );

      setSuccessMessage(
        `${kind === 'warehouse' ? 'Bodega' : 'Registro'} ${
          isActive ? 'desactivado' : 'activado'
        } correctamente.`,
      );

      if (kind === 'supplier') {
        await loadSuppliers();
      } else if (kind === 'customer') {
        await loadCustomers();
      } else if (kind === 'product') {
        await loadProducts();
      } else {
        await loadWarehouses();
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'No fue posible actualizar el estado.',
      );
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="page-grid">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Catalogos base</p>
          <h2>Maestros operativos</h2>
          <p className="hero-copy">
            Administra proveedores, clientes, productos y bodegas desde una sola
            vista. Estos catalogos alimentan compras, ventas, inventario y la
            operacion diaria.
          </p>
        </div>

        <div className="metric-strip">
          <div className="metric-chip">
            <span>Proveedores activos</span>
            <strong>{activeSummary.suppliers}</strong>
          </div>
          <div className="metric-chip">
            <span>Clientes activos</span>
            <strong>{activeSummary.customers}</strong>
          </div>
          <div className="metric-chip">
            <span>Productos activos</span>
            <strong>{activeSummary.products}</strong>
          </div>
          <div className="metric-chip">
            <span>Bodegas activas</span>
            <strong>{activeSummary.warehouses}</strong>
          </div>
        </div>
      </section>

      {error ? <p className="feedback feedback-error">{error}</p> : null}
      {successMessage ? (
        <p className="feedback feedback-success">{successMessage}</p>
      ) : null}

      <div className="two-column-grid">
        <SectionCard
          title="Proveedores"
          subtitle="Base de compras, importacion y carga documental"
          action={<span className="pill">{suppliers.length} registros</span>}
        >
          <form className="stack-form" onSubmit={handleCreateSupplier}>
            <div className="form-grid form-grid-three">
              <label className="field">
                <span>Nombre</span>
                <input
                  value={supplierForm.name}
                  onChange={(event) =>
                    setSupplierForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label className="field">
                <span>Pais</span>
                <input
                  value={supplierForm.countryCode}
                  onChange={(event) =>
                    setSupplierForm((current) => ({
                      ...current,
                      countryCode: event.target.value.toUpperCase(),
                    }))
                  }
                  maxLength={2}
                  required
                />
              </label>
              <label className="field">
                <span>Tax ID</span>
                <input
                  value={supplierForm.taxId}
                  onChange={(event) =>
                    setSupplierForm((current) => ({
                      ...current,
                      taxId: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Contacto</span>
                <input
                  value={supplierForm.contactName}
                  onChange={(event) =>
                    setSupplierForm((current) => ({
                      ...current,
                      contactName: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={supplierForm.email}
                  onChange={(event) =>
                    setSupplierForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Telefono</span>
                <input
                  value={supplierForm.phone}
                  onChange={(event) =>
                    setSupplierForm((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <label className="field">
              <span>Direccion</span>
              <input
                value={supplierForm.address}
                onChange={(event) =>
                  setSupplierForm((current) => ({
                    ...current,
                    address: event.target.value,
                  }))
                }
              />
            </label>
            <div className="form-actions">
              <button
                type="submit"
                className="primary-button"
                disabled={busyKey === 'supplier-create'}
              >
                {busyKey === 'supplier-create' ? 'Guardando...' : 'Crear proveedor'}
              </button>
            </div>
          </form>

          <div className="table-shell compact-table">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Pais</th>
                  <th>Contacto</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td>{supplier.name}</td>
                    <td>{supplier.countryCode}</td>
                    <td>{supplier.contactName ?? supplier.email ?? 'N/D'}</td>
                    <td>{supplier.isActive ? 'activo' : 'inactivo'}</td>
                    <td>
                      <button
                        type="button"
                        className="ghost-button"
                        disabled={busyKey === `supplier-${supplier.id}`}
                        onClick={() =>
                          void handleToggleStatus(
                            'supplier',
                            supplier.id,
                            supplier.isActive,
                          )
                        }
                      >
                        {supplier.isActive ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard
          title="Clientes"
          subtitle="Base comercial para retail y wholesale"
          action={<span className="pill">{customers.length} registros</span>}
        >
          <form className="stack-form" onSubmit={handleCreateCustomer}>
            <div className="form-grid form-grid-three">
              <label className="field">
                <span>Tipo cliente</span>
                <select
                  value={customerForm.customerType}
                  onChange={(event) =>
                    setCustomerForm((current) => ({
                      ...current,
                      customerType: event.target.value,
                    }))
                  }
                >
                  <option value="wholesale">wholesale</option>
                  <option value="retail">retail</option>
                </select>
              </label>
              <label className="field">
                <span>Nombre</span>
                <input
                  value={customerForm.name}
                  onChange={(event) =>
                    setCustomerForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label className="field">
                <span>Tax ID</span>
                <input
                  value={customerForm.taxId}
                  onChange={(event) =>
                    setCustomerForm((current) => ({
                      ...current,
                      taxId: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={customerForm.email}
                  onChange={(event) =>
                    setCustomerForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Telefono</span>
                <input
                  value={customerForm.phone}
                  onChange={(event) =>
                    setCustomerForm((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Direccion</span>
                <input
                  value={customerForm.address}
                  onChange={(event) =>
                    setCustomerForm((current) => ({
                      ...current,
                      address: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <div className="form-actions">
              <button
                type="submit"
                className="primary-button"
                disabled={busyKey === 'customer-create'}
              >
                {busyKey === 'customer-create' ? 'Guardando...' : 'Crear cliente'}
              </button>
            </div>
          </form>

          <div className="table-shell compact-table">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>Tax ID</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>{customer.name}</td>
                    <td>{customer.customerType}</td>
                    <td>{customer.taxId ?? 'N/D'}</td>
                    <td>{customer.isActive ? 'activo' : 'inactivo'}</td>
                    <td>
                      <button
                        type="button"
                        className="ghost-button"
                        disabled={busyKey === `customer-${customer.id}`}
                        onClick={() =>
                          void handleToggleStatus(
                            'customer',
                            customer.id,
                            customer.isActive,
                          )
                        }
                      >
                        {customer.isActive ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      <div className="two-column-grid">
        <SectionCard
          title="Productos"
          subtitle="Catalogo comercial y de compra para snapshots operativos"
          action={<span className="pill">{products.length} registros</span>}
        >
          <form className="stack-form" onSubmit={handleCreateProduct}>
            <div className="form-grid form-grid-three">
              <label className="field">
                <span>SKU</span>
                <input
                  value={productForm.sku}
                  onChange={(event) =>
                    setProductForm((current) => ({
                      ...current,
                      sku: event.target.value.toUpperCase(),
                    }))
                  }
                  required
                />
              </label>
              <label className="field">
                <span>Nombre</span>
                <input
                  value={productForm.name}
                  onChange={(event) =>
                    setProductForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label className="field">
                <span>Unidad</span>
                <input
                  value={productForm.unitMeasure}
                  onChange={(event) =>
                    setProductForm((current) => ({
                      ...current,
                      unitMeasure: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label className="field">
                <span>Precio sugerido USD</span>
                <input
                  value={productForm.defaultSalePriceUsd}
                  onChange={(event) =>
                    setProductForm((current) => ({
                      ...current,
                      defaultSalePriceUsd: event.target.value,
                    }))
                  }
                  inputMode="decimal"
                />
              </label>
            </div>
            <label className="field">
              <span>Descripcion</span>
              <textarea
                value={productForm.description}
                onChange={(event) =>
                  setProductForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={3}
              />
            </label>
            <div className="form-actions">
              <button
                type="submit"
                className="primary-button"
                disabled={busyKey === 'product-create'}
              >
                {busyKey === 'product-create' ? 'Guardando...' : 'Crear producto'}
              </button>
            </div>
          </form>

          <div className="table-shell compact-table">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Nombre</th>
                  <th>Unidad</th>
                  <th>Precio USD</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td>{product.sku}</td>
                    <td>{product.name}</td>
                    <td>{product.unitMeasure}</td>
                    <td>{formatUsd(product.defaultSalePriceUsd)}</td>
                    <td>{product.isActive ? 'activo' : 'inactivo'}</td>
                    <td>
                      <button
                        type="button"
                        className="ghost-button"
                        disabled={busyKey === `product-${product.id}`}
                        onClick={() =>
                          void handleToggleStatus(
                            'product',
                            product.id,
                            product.isActive,
                          )
                        }
                      >
                        {product.isActive ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard
          title="Bodegas"
          subtitle="Ubicaciones activas para recepcion y seguimiento de inventario"
          action={<span className="pill">{warehouses.length} registros</span>}
        >
          <form className="stack-form" onSubmit={handleCreateWarehouse}>
            <div className="form-grid form-grid-three">
              <label className="field">
                <span>Nombre</span>
                <input
                  value={warehouseForm.name}
                  onChange={(event) =>
                    setWarehouseForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label className="field field-span-two">
                <span>Ubicacion</span>
                <input
                  value={warehouseForm.location}
                  onChange={(event) =>
                    setWarehouseForm((current) => ({
                      ...current,
                      location: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <div className="form-actions">
              <button
                type="submit"
                className="primary-button"
                disabled={busyKey === 'warehouse-create'}
              >
                {busyKey === 'warehouse-create' ? 'Guardando...' : 'Crear bodega'}
              </button>
            </div>
          </form>

          <div className="table-shell compact-table">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Ubicacion</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {warehouses.map((warehouse) => (
                  <tr key={warehouse.id}>
                    <td>{warehouse.name}</td>
                    <td>{warehouse.location ?? 'N/D'}</td>
                    <td>{warehouse.isActive ? 'activo' : 'inactivo'}</td>
                    <td>
                      <button
                        type="button"
                        className="ghost-button"
                        disabled={busyKey === `warehouse-${warehouse.id}`}
                        onClick={() =>
                          void handleToggleStatus(
                            'warehouse',
                            warehouse.id,
                            warehouse.isActive,
                          )
                        }
                      >
                        {warehouse.isActive ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
