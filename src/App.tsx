/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Loader2 } from 'lucide-react';
import { BrandLogo } from './components/BrandLogo';
import { Layout } from './components/Layout';
import { AdminProvider, useAdmin } from './context/AdminContext';
import { CategoriesPage } from './pages/CategoriesPage';
import { CrmPage } from './pages/CrmPage';
import { CustomersPage } from './pages/CustomersPage';
import { DashboardPage } from './pages/DashboardPage';
import { HelpSupportPage } from './pages/HelpSupportPage';
import { LoginPage } from './pages/LoginPage';
import { MarketingPixelPage } from './pages/MarketingPixelPage';
import { OrdersPage } from './pages/OrdersPage';
import { ProductsPage } from './pages/ProductsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { UsersPermissionsPage } from './pages/UsersPermissionsPage';

import { OrderNotificationsProvider } from './context/OrderNotificationsContext';
import './hooks/usePwaStatus';

const AdminRouter: React.FC = () => {
  const { session, activeModule } = useAdmin();

  if (session.isLoadingAuth) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col items-center justify-center p-6 gap-4">
        <BrandLogo variant="login" />
        <div className="flex items-center gap-2.5 text-xs text-[#D4D4D4]">
          <Loader2 className="w-4 h-4 text-[#FF8A00] animate-spin" />
          <span>A verificar sessão administrativa segura...</span>
        </div>
      </div>
    );
  }

  if (!session.isAuthenticated || session.isPasswordRecoveryMode) {
    return <LoginPage />;
  }

  return (
    <Layout>
      {activeModule === 'dashboard' && <DashboardPage />}
      {activeModule === 'products' && <ProductsPage />}
      {activeModule === 'categories' && <CategoriesPage />}
      {activeModule === 'orders' && <OrdersPage />}
      {activeModule === 'customers' && <CustomersPage />}
      {activeModule === 'crm' && <CrmPage />}
      {activeModule === 'marketing' && <MarketingPixelPage />}
      {activeModule === 'reports' && <ReportsPage />}
      {activeModule === 'users' && <UsersPermissionsPage />}
      {activeModule === 'settings' && <SettingsPage />}
      {activeModule === 'help' && <HelpSupportPage />}
    </Layout>
  );
};

export default function App() {
  return (
    <AdminProvider>
      <OrderNotificationsProvider>
        <AdminRouter />
      </OrderNotificationsProvider>
    </AdminProvider>
  );
}
