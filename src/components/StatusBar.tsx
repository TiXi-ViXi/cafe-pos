// src/components/StatusBar.tsx
import { useEffect, useState } from 'react';
import { getDatabase } from '../database/db';

export default function StatusBar() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    let subscription: any;
    const watchUnsynced = async () => {
      const db = await getDatabase();
      // Subscribe specifically to tickets that haven't been synced yet
      subscription = db.tickets.find({
        selector: { status: 'PAID' }
      }).$.subscribe((tickets: any[]) => {
        setPendingCount(tickets.length);
      });
    };
    
    watchUnsynced();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (subscription) subscription.unsubscribe();
    };
  }, []);

  return (
    <div className={`status-bar ${!isOnline ? 'offline' : pendingCount > 0 ? 'syncing' : 'synced'}`}>
      <span>{isOnline ? '🟢 ONLINE' : '🔴 OFFLINE'}</span>
      <span>
        {!isOnline 
          ? `${pendingCount} Tickets Saved Locally` 
          : pendingCount > 0 
            ? `⏳ Syncing ${pendingCount} Tickets...` 
            : '✅ Cloud Synced'}
      </span>
    </div>
  );
}