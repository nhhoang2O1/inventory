import { useState } from 'react';
import { UserRole, ViewType } from '../types';

export function useAuth() {
  const [view, setView] = useState<ViewType>('login');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState('Warehouse Alpha');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [selectedWarehouseCode, setSelectedWarehouseCode] = useState('');
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [userId, setUserId] = useState('');
  const [username, setUsername] = useState('manager');
  const [password, setPassword] = useState('');
  const [userRole, setUserRole] = useState<UserRole>('Manager');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/v1/iam/auth/login', {
        method: 'POST',
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
    setUserRole,
    loginError,
    isLoading,
    handleLogin,
    handleLogout
  };
}
