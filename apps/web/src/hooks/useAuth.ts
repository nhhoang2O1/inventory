import { useState, useEffect } from 'react';
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
  const [password, setPassword] = useState('WmsDemo2026!');
  const [userRole, setUserRole] = useState<UserRole>('Manager');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Restore session from localStorage on initial load
  useEffect(() => {
    const savedToken = localStorage.getItem('sessionToken');
    const savedUserId = localStorage.getItem('userId');
    const savedRole = localStorage.getItem('userRole');
    const savedWarehouses = localStorage.getItem('warehouses');
    const savedWarehouseId = localStorage.getItem('selectedWarehouseId');
    const savedWarehouseCode = localStorage.getItem('selectedWarehouseCode');
    const savedWarehouseName = localStorage.getItem('selectedWarehouse');
    const savedUsername = localStorage.getItem('username');

    if (savedToken && savedUserId) {
      setIsLoggedIn(true);
      setUserId(savedUserId);
      if (savedUsername) setUsername(savedUsername);
      if (savedRole) setUserRole(savedRole as UserRole);
      if (savedWarehouses) {
        try {
          setWarehouses(JSON.parse(savedWarehouses));
        } catch (e) {}
      }
      if (savedWarehouseId) setSelectedWarehouseId(savedWarehouseId);
      if (savedWarehouseCode) setSelectedWarehouseCode(savedWarehouseCode);
      if (savedWarehouseName) setSelectedWarehouse(savedWarehouseName);
      setView('dashboard');
    }
  }, []);

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
        throw new Error(data.detail || data.message || 'Tên đăng nhập hoặc mật khẩu không chính xác.');
      }

      // Save session tokens & user metadata to localStorage
      if (data.sessionToken) localStorage.setItem('sessionToken', data.sessionToken);
      if (data.userId) {
        localStorage.setItem('actorId', data.userId);
        localStorage.setItem('userId', data.userId);
      }
      if (username) localStorage.setItem('username', username);
      if (data.userRole) localStorage.setItem('userRole', data.userRole);
      if (data.warehouses) localStorage.setItem('warehouses', JSON.stringify(data.warehouses));

      // Login successful
      setIsLoggedIn(true);
      setUserRole(data.userRole as UserRole);
      setUserId(data.userId || '');
      setWarehouses(data.warehouses || []);

      // Select first warehouse if returned, otherwise default
      if (data.warehouses && data.warehouses.length > 0) {
        const whName = data.warehouses[0].name;
        const whId = data.warehouses[0].id;
        const whCode = data.warehouses[0].code;
        setSelectedWarehouse(whName);
        setSelectedWarehouseId(whId);
        setSelectedWarehouseCode(whCode);
        localStorage.setItem('selectedWarehouse', whName);
        localStorage.setItem('selectedWarehouseId', whId);
        localStorage.setItem('selectedWarehouseCode', whCode);
      }
      setView('dashboard');
    } catch (err: any) {
      setLoginError(err.message || 'Đã xảy ra lỗi khi kết nối đến máy chủ.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      const sessionToken = localStorage.getItem('sessionToken');
      if (sessionToken) {
        await fetch('/api/v1/iam/auth/logout', {
          method: 'POST',
          headers: {
            'X-Session-Token': sessionToken
          }
        }).catch(() => {});
      }
    } finally {
      localStorage.removeItem('sessionToken');
      localStorage.removeItem('actorId');
      localStorage.removeItem('userId');
      localStorage.removeItem('username');
      localStorage.removeItem('userRole');
      localStorage.removeItem('warehouses');
      localStorage.removeItem('selectedWarehouse');
      localStorage.removeItem('selectedWarehouseId');
      localStorage.removeItem('selectedWarehouseCode');
      setIsLoggedIn(false);
      setView('login');
      setPassword('');
      setUserId('');
      setWarehouses([]);
      setSelectedWarehouseId('');
      setSelectedWarehouseCode('');
    }
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
