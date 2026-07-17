import { useEffect, useState } from 'react';

type HealthState = 'loading' | 'online' | 'offline';

export function App() {
  const [health, setHealth] = useState<HealthState>('loading');

  useEffect(() => {
    fetch('/api/v1/health')
      .then((response) => {
        if (!response.ok) throw new Error('API unavailable');
        setHealth('online');
      })
      .catch(() => setHealth('offline'));
  }, []);

  return (
    <main>
      <section className="hero">
        <p className="eyebrow">PHASE 2 · ARCHITECTURE FOUNDATION</p>
        <h1>Quản lý kho bán sỉ nguyên kiện</h1>
        <p>Thùng, két và keg. Không xé lẻ chai/lon. Mọi thay đổi tồn đi qua Inventory Core.</p>
        <div className={`status ${health}`}>API: {health}</div>
      </section>
      <section className="cards" aria-label="Các module nền">
        {['IAM & Approval', 'Catalog & Warehouse', 'Inventory Core', 'Operations', 'Quality & Recall', 'Reporting'].map((module) => (
          <article key={module}><h2>{module}</h2><p>Module boundary đã được xác định; implementation theo phase.</p></article>
        ))}
      </section>
    </main>
  );
}
