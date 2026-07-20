import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { LoginView } from './views/LoginView';
import { DashboardView } from './views/DashboardView';
import { InboundView } from './views/InboundView';
import { OutboundView } from './views/OutboundView';
import { InventoryView } from './views/InventoryView';
import { FinancialView } from './views/FinancialView';
import { ApprovalView } from './views/ApprovalView';

// Import custom hooks (The ViewModel layer)
import { useAuth } from './hooks/useAuth';
import { useInbound } from './hooks/useInbound';
import { useOutbound } from './hooks/useOutbound';
import { useApproval } from './hooks/useApproval';

import { FinancialSubTab } from './types';

export function App() {
  // 1. ViewModel: Authenticating and role session states
  const auth = useAuth();

  // 2. ViewModel: Inbound goods receiving states
  const inbound = useInbound();

  // 3. ViewModel: Outbound picking states
  const outbound = useOutbound(auth.setView);

  // 4. ViewModel: Approval tickets states
  const approval = useApproval(auth.username);

  // 5. Shared local presentation states (Tabs filters & selections)
  const [financialSubTab, setFinancialSubTab] = useState<FinancialSubTab>('valuation');
  const [brandFilter, setBrandFilter] = useState('All');
  const [selectedPartnerId, setSelectedPartnerId] = useState('D-10089');

  return (
    <div className="min-h-screen bg-background text-on-background font-body-md flex">
      {/* Sidebar Navigation */}
      {auth.isLoggedIn && (
        <Sidebar
          currentView={auth.view}
          setView={auth.setView}
          userRole={auth.userRole}
          setUserRole={auth.setUserRole}
          onLogout={auth.handleLogout}
        />
      )}

      {/* Main Area */}
      <div className={`flex-1 flex flex-col min-h-screen ${auth.isLoggedIn ? 'md:ml-[240px]' : ''}`}>
        {/* Top Header Bar */}
        {auth.isLoggedIn && (
          <Header
            selectedWarehouse={auth.selectedWarehouse}
            setSelectedWarehouse={auth.setSelectedWarehouse}
            operatorId={auth.username}
            userRole={auth.userRole}
          />
        )}

        {/* View Router (Thin Declarative Presentation layer) */}
        <main className={`flex-1 p-6 ${auth.isLoggedIn ? 'mt-16' : ''}`}>
          {auth.view === 'login' && (
            <LoginView
              selectedWarehouse={auth.selectedWarehouse}
              setSelectedWarehouse={auth.setSelectedWarehouse}
              username={auth.username}
              setUsername={auth.setUsername}
              password={auth.password}
              setPassword={auth.setPassword}
              loginError={auth.loginError}
              isLoading={auth.isLoading}
              onLoginSubmit={auth.handleLogin}
            />
          )}

          {auth.isLoggedIn && auth.view === 'dashboard' && (
            <DashboardView
              pendingApprovalsCount={approval.approvalRequests.length}
            />
          )}

          {auth.isLoggedIn && auth.view === 'inbound' && (
            <InboundView
              operatorId={auth.username}
              inboundItems={inbound.inboundItems}
              setInboundItems={inbound.setInboundItems}
              handleInboundQtyChange={inbound.handleInboundQtyChange}
              handleInboundAddLine={inbound.handleInboundAddLine}
              handleInboundRemoveLine={inbound.handleInboundRemoveLine}
              returnedCrateQty={inbound.returnedCrateQty}
              setReturnedCrateQty={inbound.setReturnedCrateQty}
              uploadedFiles={inbound.uploadedFiles}
              setUploadedFiles={inbound.setUploadedFiles}
              inboundSuccessMessage={inbound.inboundSuccessMessage}
              handleConfirmReceipt={inbound.handleConfirmReceipt}
            />
          )}

          {auth.isLoggedIn && auth.view === 'outbound' && (
            <OutboundView
              outboundItems={outbound.outboundItems}
              scanInput={outbound.scanInput}
              setScanInput={outbound.setScanInput}
              pickAlert={outbound.pickAlert}
              handleScanSubmit={outbound.handleScanSubmit}
              handlePickRowClick={outbound.handlePickRowClick}
              onCompletePick={outbound.onCompletePick}
              onCancelPick={outbound.onCancelPick}
            />
          )}

          {auth.isLoggedIn && auth.view === 'inventory' && (
            <InventoryView
              brandFilter={brandFilter}
              setBrandFilter={setBrandFilter}
              onRefresh={() => alert("Đã làm mới dữ liệu từ Database Core Sync.")}
            />
          )}

          {auth.isLoggedIn && auth.view === 'financial' && (
            <FinancialView
              financialSubTab={financialSubTab}
              setFinancialSubTab={setFinancialSubTab}
              selectedPartnerId={selectedPartnerId}
              setSelectedPartnerId={setSelectedPartnerId}
            />
          )}

          {auth.isLoggedIn && auth.view === 'approval' && (
            <ApprovalView
              approvalRequests={approval.approvalRequests}
              approvalTab={approval.approvalTab}
              setApprovalTab={approval.setApprovalTab}
              approvalActionMessage={approval.approvalActionMessage}
              reviewModalRequest={approval.reviewModalRequest}
              setReviewModalRequest={approval.setReviewModalRequest}
              operatorId={auth.username}
              handleApproveRequest={approval.handleApproveRequest}
              handleRejectRequest={approval.handleRejectRequest}
            />
          )}
        </main>
      </div>
    </div>
  );
}
