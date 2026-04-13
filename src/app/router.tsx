import { createBrowserRouter } from 'react-router-dom';

import { RedirectIfAuthenticated, RequireAuth } from './auth';
import { AppShell } from '../components/layout/AppShell';
import { DashboardPage } from '../pages/DashboardPage';
import { DocumentsPage } from '../pages/DocumentsPage';
import { FinancePage } from '../pages/FinancePage';
import { LoginPage } from '../pages/LoginPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { ProcurementPage } from '../pages/ProcurementPage';
import { SalesPage } from '../pages/SalesPage';

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
      { path: 'sales', element: <SalesPage /> },
      { path: 'documents', element: <DocumentsPage /> },
      { path: 'finance', element: <FinancePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
