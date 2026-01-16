'use client';

import { useEffect, useState } from 'react';
import AdminApp from './AdminApp';

export default function AdminPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div style={{ padding: 24 }}>
        <h2 style={{ margin: 0 }}>Loading admin…</h2>
      </div>
    );
  }

  return <AdminApp />;
}
