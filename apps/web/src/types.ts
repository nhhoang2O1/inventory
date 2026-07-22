export type ViewType = 'login' | 'dashboard' | 'inbound' | 'outbound' | 'inventory' | 'financial' | 'approval' | 'quality' | 'layout';
export type FinancialSubTab = 'valuation' | 'deposit' | 'leadtime' | 'reconciliation' | 'loss' | 'planning';
export type ApprovalTab = 'po' | 'adjustment' | 'exception';
export type UserRole = 'Warehouse Staff' | 'Manager' | 'Sales' | 'Accountant';

export interface InboundItem {
  sku: string;
  name: string;
  unit: string;
  ratio: number;
  qty: number;
  batch: string;
  mfg: string;
  exp: string;
  skuId: string;
  poLineId: string;
  locationId: string;
  uomId: string;
}

export interface OutboundItem {
  id: string;
  location: string;
  name: string;
  ratio: number;
  lot: string;
  exp: string;
  reqQty: number;
  status: 'Pending' | 'Picking' | 'Picked';
}

export interface ApprovalRequest {
  id: string;
  requester: string;
  role: string;
  type: string;
  details: string;
  value: string;
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL';
  submittedTime: string;
  creatorId: string;
}
