import { useState } from 'react';
import { UserRole, ViewType } from '../types';

export function useAuth() {
  const [view, setView] = useState<ViewType>('login');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState('Warehouse Alpha');
  const [username, setUsername] = useState('manager');
  const [password, setPassword] = useState('123456');
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

      // Select first warehouse if returned, otherwise default
      if (data.warehouses && data.warehouses.length > 0) {
        setSelectedWarehouse(data.warehouses[0].name);
      }

      setView('dashboard');
    } catch (err: any) {
      setLoginError(err.message || 'Đã xảy ra lỗi khi kết nối đến máy chủ.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setView('login');
    setPassword('');
  };

  return {
    view,
    setView,
    isLoggedIn,
    selectedWarehouse,
    setSelectedWarehouse,
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
