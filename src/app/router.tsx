import { createBrowserRouter } from 'react-router-dom';

import { RedirectIfAuthenticated, RequireAuth } from './auth';
import { AppShell } from '../components/layout/AppShell';
import { CustomsPage } from '../pages/CustomsPage';
import { DashboardPage } from '../pages/DashboardPage';
import { DocumentsPage } from '../pages/DocumentsPage';
import { FinancePage } from '../pages/FinancePage';
import { InventoryPage } from '../pages/InventoryPage';
import { LoginPage } from '../pages/LoginPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { ProcurementPage } from '../pages/ProcurementPage';
import { ReportsPage } from '../pages/ReportsPage';
import { SalesPage } from '../pages/SalesPage';
import { ShipmentsPage } from '../pages/ShipmentsPage';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <RedirectIfAuthenticated>
        <LoginPage />
      </RedirectIfAuthenticated>
    ),
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'procurement', element: <ProcurementPage /> },
      { path: 'shipments', element: <ShipmentsPage /> },
      { path: 'customs', element: <CustomsPage /> },
      { path: 'inventory', element: <InventoryPage /> },
      { path: 'sales', element: <SalesPage /> },
      { path: 'documents', element: <DocumentsPage /> },
      { path: 'finance', element: <FinancePage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
