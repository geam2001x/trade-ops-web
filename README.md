# Trade Ops Web

Frontend `React + Vite` del proyecto `Trade Operations Suite`.

## Estado

Proyecto inicializado y conectado al backend local.

Vistas base ya disponibles:

- dashboard E2E
- checkpoints de procurement
- proformas y pipeline documental
- finanzas basicas por lote y venta
- login y registro con sesion persistente
- formulario real para crear `document_uploads`
- formulario real para crear `purchase_orders`
- formulario real para crear `document_extractions`
- formulario real para validar extracciones
- creacion de pedido desde una extraccion validada
- boton para avanzar checkpoints manuales por pedido
- formulario real para ventas con consumo de lotes
- actualizacion de estado de ventas (quoted -> confirmed -> dispatched -> completed)
- historial de checkpoints por pedido en la vista de procurement

## Desarrollo local

```bash
cp .env.example .env
npm install
npm run dev
```

URL esperada:

```text
http://127.0.0.1:5173
```

## Variables de entorno

```bash
VITE_API_BASE_URL=http://127.0.0.1:3000/api
```

## Objetivo

Servir como panel web principal para operar:

- proveedores
- productos
- compras
- proformas PDF y validacion
- embarques
- aduana y gastos
- inventario por lote
- ventas retail y wholesale
- dashboard y reportes

## Siguiente etapa recomendada

- formulario real para ventas y avance manual de checkpoints desde UI
- vinculacion visual entre pedido creado y upload/extraccion origen
- navegacion completa de los modulos faltantes
- proteccion backend de rutas de negocio con JWT cuando se decida endurecer acceso
