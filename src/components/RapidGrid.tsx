// src/components/RapidGrid.tsx
import { useEffect, useState } from 'react';
import { getDatabase } from '../database/db';

export interface MenuItem {
  productId: string;
  name: string;
  price: number;
  category: string;
}

interface RapidGridProps {
  onAddItem: (item: MenuItem) => void;
}

export default function RapidGrid({ onAddItem }: RapidGridProps) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let subscription: any;
    const loadData = async () => {
      const db = await getDatabase();
      subscription = db.menu.find().$.subscribe((menuDocs: any[]) => {
        setItems(menuDocs.map(doc => doc.toJSON()));
        setLoading(false);
      });
    };
    loadData();
    return () => { if (subscription) subscription.unsubscribe(); };
  }, []);

  if (loading) return <div style={{padding: '20px'}}>Loading Menu...</div>;

  return (
    <div className="menu-grid">
      {items.map((item) => (
        <button 
          key={item.productId} 
          className="menu-item-btn"
          onClick={() => onAddItem(item)}
        >
          <span className="item-name">{item.name}</span>
          <span className="item-price">৳{item.price.toFixed(2)}</span>
        </button>
      ))}
    </div>
  );
}