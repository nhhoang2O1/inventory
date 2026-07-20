import { useState, useEffect } from 'react';

export interface QualityCase {
  id: string;
  case_line_id: string;
  sku_code: string;
  sku_name: string;
  batch_code: string;
  quantity: number;
  location_id: string;
  location_code: string;
  reason: string;
  status: string;
  disposition_type?: string | null;
  created_at: string;
}

export interface ExpiryRun {
  id: string;
  business_date: string;
  expired_line_count: number;
  created_at: string;
}

export interface RecallCampaign {
  id: string;
  recall_code: string;
  sku_code: string;
  sku_name: string;
  batch_code: string;
  severity: string;
  status: string;
  created_at: string;
}

export interface CustomerReturnItem {
  id: string;
  return_code: string;
  customer_name: string;
  reason: string;
  total_cases: number;
  status: string;
  created_at: string;
}

export function useQuality(actorId?: string, warehouseId?: string) {
  const [cases, setCases] = useState<QualityCase[]>([]);
  const [expiryRuns, setExpiryRuns] = useState<ExpiryRun[]>([]);
  const [recalls, setRecalls] = useState<RecallCampaign[]>([]);
  const [returns, setReturns] = useState<CustomerReturnItem[]>([]);

  // Metadata dropdown state
  const [locations, setLocations] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQualityData = () => {
    if (!actorId || !warehouseId) return;
    setIsLoading(true);
    setError(null);

    Promise.all([
      fetch(`/api/v1/quality/cases?warehouseId=${warehouseId}`, { headers: { 'x-actor-id': actorId } }).then(res => res.json()),
      fetch(`/api/v1/quality/expiry-runs?warehouseId=${warehouseId}`, { headers: { 'x-actor-id': actorId } }).then(res => res.json()),
      fetch(`/api/v1/recalls?warehouseId=${warehouseId}`, { headers: { 'x-actor-id': actorId } }).then(res => res.json()),
      fetch(`/api/v1/returns?warehouseId=${warehouseId}`, { headers: { 'x-actor-id': actorId } }).then(res => res.json()),
      fetch(`/api/v1/inventory/locations?warehouseId=${warehouseId}`, { headers: { 'x-actor-id': actorId } }).then(res => res.json()),
      fetch(`/api/v1/inventory/positions?warehouseId=${warehouseId}`, { headers: { 'x-actor-id': actorId } }).then(res => res.json()),
      fetch(`/api/v1/inventory/users`, { headers: { 'x-actor-id': actorId } }).then(res => res.json())
    ])
      .then(([casesData, expiryData, recallsData, returnsData, locsData, posData, usersData]) => {
        setCases(Array.isArray(casesData) ? casesData : []);
        setExpiryRuns(Array.isArray(expiryData) ? expiryData : []);
        setRecalls(Array.isArray(recallsData) ? recallsData : []);
        setReturns(Array.isArray(returnsData) ? returnsData : []);
        setLocations(Array.isArray(locsData) ? locsData : []);
        setPositions(Array.isArray(posData) ? posData : []);
        setUsersList(Array.isArray(usersData) ? usersData : []);
      })
      .catch(err => {
        console.error('Error fetching quality data:', err);
        setError('Không thể kết nối đến backend Quality Service.');
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchQualityData();
  }, [actorId, warehouseId]);

  return {
    cases,
    expiryRuns,
    recalls,
    returns,
    locations,
    positions,
    usersList,
    isLoading,
    error,
    fetchQualityData
  };
}
