// src/POSView.tsx
import { useState, useEffect } from 'react'; // <-- Added useEffect
import RapidGrid from '../components/RapidGrid';
import ActiveCart, { type CartItem } from '../components/ActiveCart';
import ModifierModal, { type ModifierOption } from '../components/ModifierModal';
import StatusBar from '../components/StatusBar'; // <-- Added StatusBar import
import { getDatabase } from '../database/db';
import '../App.css';

export default function POSView() {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [activeModItem, setActiveModItem] = useState<any | null>(null);

  const grossTotal = cartItems.reduce((sum, item) => sum + item.lineTotal, 0);

  
  useEffect(() => {
    const syncInterval = setInterval(async () => {
      if (!navigator.onLine) return; // Don't try if Wi-Fi is down

      const db = await getDatabase();
      // Find all tickets waiting to be sent to the server
      const pendingTickets = await db.tickets.find({ selector: { status: 'PAID' } }).exec();
      
      for (const ticket of pendingTickets) {
        try {
          // In the future, this is where you run: await fetch('https://your-api.com/sync', {...})
          console.log(`Cloud Sync Successful: ${ticket.ticketId}`);
          
          // Update the local database to mark it as synced so we don't send it again
          await ticket.patch({ status: 'SYNCED' }); 
        } catch (error) {
          console.error(`Sync failed for ${ticket.ticketId}`);
        }
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(syncInterval);
  }, []);
  

  const handleGridClick = (menuItem: any) => {
    if (menuItem.modifierGroups && menuItem.modifierGroups.length > 0) {
      setActiveModItem(menuItem);
    } else {
      finalizeAddItem(menuItem, []);
    }
  };

  const finalizeAddItem = (menuItem: any, selectedMods: ModifierOption[]) => {
    const modTotal = selectedMods.reduce((sum, mod) => sum + mod.priceDelta, 0);
    
    const newItem: CartItem = {
      id: Date.now().toString() + Math.random().toString(),
      productId: menuItem.productId,
      name: menuItem.name,
      price: menuItem.price,
      modifiers: selectedMods,
      lineTotal: menuItem.price + modTotal
    };
    
    setCartItems(prev => [...prev, newItem]);
    setActiveModItem(null);
  };

  const handleRemoveItem = (id: string) => {
    setCartItems(prev => prev.filter(item => item.id !== id));
  };

  const handlePay = async () => {
    if (cartItems.length === 0) return;

    const db = await getDatabase();
    const newTicket = {
      ticketId: `tkt_${Date.now()}`,
      status: 'PAID',
      createdAt: Date.now(),
      items: cartItems.map(item => ({
        productId: item.productId,
        modifiers: item.modifiers,
        lineTotal: item.lineTotal
      })),
      grossTotal: grossTotal
    };

    try {
      await db.tickets.insert(newTicket);
      console.log('Ticket saved locally:', newTicket.ticketId);
      setCartItems([]);
    } catch (err) {
      console.error('Failed to save ticket:', err);
    }
  };

  return (
    <div className="pos-container">
      {/* <-- NEW: StatusBar goes at the absolute top inside pos-container */}
      <StatusBar />

      {activeModItem && (
        <ModifierModal 
          item={activeModItem} 
          onConfirm={finalizeAddItem} 
          onCancel={() => setActiveModItem(null)} 
        />
      )}

      <main className="pos-left-pane">
        <header className="pane-header">
          <h2>Menu Categories</h2>
        </header>
        <RapidGrid onAddItem={handleGridClick} />
      </main>

      <aside className="pos-right-pane">
        <header className="pane-header">
          <h2>Current Ticket</h2>
        </header>
        
        <ActiveCart items={cartItems} onRemoveItem={handleRemoveItem} />
        
        <button 
          className="pay-button" 
          onClick={handlePay}
          disabled={cartItems.length === 0}
          style={{ opacity: cartItems.length === 0 ? 0.5 : 1 }}
        >
          Pay ৳{grossTotal.toFixed(2)}
        </button>
      </aside>
    </div>
  );
}