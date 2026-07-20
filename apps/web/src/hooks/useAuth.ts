import { useEffect, useState } from 'react';
import { UserRole, ViewType } from '../types';
import { apiCommand, apiGet, apiRequest, ApiError } from '../apiClient';

export function useAuth() {
  const [view, setView] = useState<ViewType>('login');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [selectedWarehouseCode, setSelectedWarehouseCode] = useState('');
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [userId, setUserId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [userRole, setUserRole] = useState<UserRole>('Warehouse Staff');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const applySession = (data: any) => {
    setIsLoggedIn(true); setView('dashboard');
    setUserRole(data.userRole as UserRole); setUserId(data.userId || ''); setUsername(data.username || '');
    const nextWarehouses = data.warehouses || [];
    setWarehouses(nextWarehouses);
    if (nextWarehouses[0]) {
      setSelectedWarehouse(nextWarehouses[0].name);
      setSelectedWarehouseId(nextWarehouses[0].id);
      setSelectedWarehouseCode(nextWarehouses[0].code);
    }
  };

  useEffect(() => {
    let mounted = true;
    void apiGet<any>('/iam/auth/me').then((data) => { if (mounted) applySession(data); }).catch(() => { if (mounted) setIsLoggedIn(false); }).finally(() => { if (mounted) setIsLoading(false); });
    return () => { mounted = false; };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoginError(null); setIsLoading(true);
    try {
      const data = await apiRequest<any>('/iam/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      applySession(data);
    } catch (err) {
      setLoginError(err instanceof ApiError ? err.message : 'Tên đăng nhập hoặc mật khẩu không chính xác.');
    } finally { setIsLoading(false); }
  };

  const handleLogout = () => {
    void apiCommand('/iam/auth/logout', 'POST', {}, undefined);
    setIsLoggedIn(false); setView('login'); setPassword(''); setUserId(''); setWarehouses([]);
    setSelectedWarehouseId(''); setSelectedWarehouseCode(''); setSelectedWarehouse('');
  };

  return {
    view, setView, isLoggedIn, selectedWarehouse, setSelectedWarehouse,
    selectedWarehouseId, setSelectedWarehouseId, selectedWarehouseCode, setSelectedWarehouseCode,
    warehouses, userId, username, setUsername, password, setPassword, userRole, loginError,
    isLoading, handleLogin, handleLogout
  };
}
