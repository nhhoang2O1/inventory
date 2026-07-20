import { useEffect, useState } from 'react';
import { UserRole, ViewType } from '../types';

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

  useEffect(() => {
    let mounted = true;
    void fetch('/api/v1/iam/auth/me', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('No active session');
        return response.json();
      })
      .then((data) => {
        if (!mounted) return;
        setIsLoggedIn(true);
        setView('dashboard');
        setUserRole(data.userRole as UserRole);
        setUserId(data.userId || '');
        setUsername(data.username || '');
        const nextWarehouses = data.warehouses || [];
        setWarehouses(nextWarehouses);
        if (nextWarehouses[0]) {
          setSelectedWarehouse(nextWarehouses[0].name);
          setSelectedWarehouseId(nextWarehouses[0].id);
          setSelectedWarehouseCode(nextWarehouses[0].code);
        }
      })
      .catch(() => {
        if (mounted) setIsLoggedIn(false);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/v1/iam/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-Id': crypto.randomUUID ? crypto.randomUUID() : 'auth-correlation-id'
        },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Tên đăng nhập hoặc mật khẩu không chính xác.');
      }

      // Login successful
      setIsLoggedIn(true);
      setUserRole(data.userRole as UserRole);
      setUserId(data.userId || '');
      setWarehouses(data.warehouses || []);

      // Select first warehouse if returned, otherwise default
      if (data.warehouses && data.warehouses.length > 0) {
        setSelectedWarehouse(data.warehouses[0].name);
        setSelectedWarehouseId(data.warehouses[0].id);
        setSelectedWarehouseCode(data.warehouses[0].code);
      }
      setView('dashboard');
    } catch (err: any) {
      setLoginError(err.message || 'Đã xảy ra lỗi khi kết nối đến máy chủ.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    void fetch('/api/v1/iam/auth/logout', {
      method: 'POST',
      headers: {
        'X-Correlation-Id': crypto.randomUUID ? crypto.randomUUID() : 'auth-logout-correlation-id'
      }
    });
    setIsLoggedIn(false);
    setView('login');
    setPassword('');
    setUserId('');
    setWarehouses([]);
    setSelectedWarehouseId('');
    setSelectedWarehouseCode('');
    setSelectedWarehouse('');
  };

  return {
    view,
    setView,
    isLoggedIn,
    selectedWarehouse,
    setSelectedWarehouse,
    selectedWarehouseId,
    setSelectedWarehouseId,
    selectedWarehouseCode,
    setSelectedWarehouseCode,
    warehouses,
    userId,
    username,
    setUsername,
    password,
    setPassword,
    userRole,
    loginError,
    isLoading,
    handleLogin,
    handleLogout
  };
}
