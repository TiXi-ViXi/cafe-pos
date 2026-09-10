import { useEffect, useState } from 'react';
import { getDatabase } from '../database/db';

interface Product {
  productId: string;
  name: string;
  price: number;
  category: string;
  modifierGroups: any[];
}

interface CartItem {
  cartItemId: string;
  product: Product;
  modifiers: any[]; // Stores selected options
}

export default function POSView() {
  const [menuItems, setMenuItems] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modifier Modal State
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedMods, setSelectedMods] = useState<any[]>([]);

  useEffect(() => {
    const fetchMenu = async () => {
      const db = await getDatabase();
      const items = await db.menu.find().exec();
      setMenuItems(items.map((item: any) => item.toJSON()));
      setLoading(false);
    };
    fetchMenu();
  }, []);

  // 1. Handle Item Clicks (Check for Modifiers)
  const handleItemClick = (product: Product) => {
    if (product.modifierGroups && product.modifierGroups.length > 0) {
      setSelectedProduct(product); // Open modifier modal
      setSelectedMods([]); // Reset selections
    } else {
      addToCart(product, []); // Add directly if no modifiers
    }
  };

  const toggleMod = (option: any) => {
    setSelectedMods(prev => {
      const exists = prev.find(m => m.modId === option.modId);
      if (exists) return prev.filter(m => m.modId !== option.modId);
      return [...prev, option];
    });
  };

  const addToCart = (product: Product, modifiers: any[]) => {
    setCart(prev => [...prev, { cartItemId: crypto.randomUUID(), product, modifiers }]);
    setSelectedProduct(null); // Close modal
  };

  // 2. Process Payment (Save Ticket)
  const handlePay = async () => {
    if (cart.length === 0) return;
    
    try {
      const db = await getDatabase();
      
      // Format the cart items to match the strict schema requirements
      const formattedItems = cart.map(item => {
        const itemModTotal = item.modifiers.reduce((mSum, m) => mSum + m.priceDelta, 0);
        return {
          productId: item.product.productId,
          modifiers: item.modifiers,
          lineTotal: item.product.price + itemModTotal
        };
      });

      // Insert matching exact schema fields
      await db.tickets.insert({
        ticketId: crypto.randomUUID(),
        status: 'PAID',
        createdAt: Date.now(),
        items: formattedItems,
        grossTotal: parseFloat(currentTotal)
      });
      
      setCart([]);
      alert('Payment Successful & Ticket Saved offline!');
    } catch (err: any) {
      console.error("Ticket save error:", err);
      alert(`Payment Failed: ${err.message}`);
    }
  };

  // 3. Calculate Dynamic Total
  const currentTotal = cart.reduce((sum, item) => {
    const itemModTotal = item.modifiers.reduce((mSum, m) => mSum + m.priceDelta, 0);
    return sum + item.product.price + itemModTotal;
  }, 0).toFixed(2);

  return (
    <div className="flex h-screen bg-[#1a1a1a] text-gray-200 font-sans flex-col">
      
      {/* Top Status Bar Restored */}
      <div className="bg-[#2a7a2a] text-white px-4 py-2 flex justify-between items-center text-sm font-bold shadow-md">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
          ONLINE
        </div>
        <div className="flex items-center gap-4">
          <span>✓ Cloud Synced</span>
          <a href="#/admin" className="bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded border border-gray-600 transition">
            Admin Panel ⚙️
          </a>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Column: Menu */}
        <div className="flex-1 flex flex-col border-r border-gray-700">
          <div className="p-4 bg-[#222] border-b border-gray-700 font-bold text-lg">
            Menu Categories
          </div>
          <div className="p-4 flex-1 overflow-y-auto">
            {loading ? (
              <p>Loading Menu...</p>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {menuItems.map(item => (
                  <button
                    key={item.productId}
                    onClick={() => handleItemClick(item)}
                    className="bg-[#333] p-6 rounded shadow hover:bg-[#444] transition flex flex-col items-center justify-center gap-2"
                  >
                    <span className="font-bold">{item.name}</span>
                    <span className="text-green-500 text-sm">৳{item.price.toFixed(2)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Ticket */}
        <div className="w-96 flex flex-col bg-[#1a1a1a]">
          <div className="p-4 bg-[#222] border-b border-gray-700 font-bold text-lg">
            Current Ticket
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
            {cart.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500">
                Cart is empty
              </div>
            ) : (
              cart.map(item => (
                <div key={item.cartItemId} className="flex flex-col bg-[#2a2a2a] p-3 rounded">
                  <div className="flex justify-between font-bold">
                    <span>{item.product.name}</span>
                    <span>৳{item.product.price.toFixed(2)}</span>
                  </div>
                  {/* Display selected modifiers */}
                  {item.modifiers.map(mod => (
                    <div key={mod.modId} className="flex justify-between text-sm text-gray-400 pl-4 mt-1">
                      <span>+ {mod.name}</span>
                      <span>৳{mod.priceDelta.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          <button 
            onClick={handlePay}
            disabled={cart.length === 0}
            className="bg-[#3b7a42] hover:bg-[#46924e] disabled:bg-gray-600 disabled:cursor-not-allowed text-white p-6 text-xl font-bold transition"
          >
            Pay ৳{currentTotal}
          </button>
        </div>
      </div>

      {/* Modifier Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-[#222] p-6 rounded-lg w-full max-w-md shadow-2xl border border-gray-700">
            <h2 className="text-2xl font-bold mb-4">Customize {selectedProduct.name}</h2>
            
            <div className="mb-6 max-h-64 overflow-y-auto">
              {selectedProduct.modifierGroups.map(group => (
                <div key={group.groupId} className="mb-4">
                  <h3 className="font-bold text-gray-400 mb-2 uppercase text-sm tracking-wider">{group.name}</h3>
                  <div className="flex flex-col gap-2">
                    {group.options.map((opt: any) => {
                      const isSelected = selectedMods.some(m => m.modId === opt.modId);
                      return (
                        <button
                          key={opt.modId}
                          onClick={() => toggleMod(opt)}
                          className={`p-3 rounded text-left flex justify-between transition ${
                            isSelected ? 'bg-green-700 text-white' : 'bg-[#333] hover:bg-[#444]'
                          }`}
                        >
                          <span>{opt.name}</span>
                          {opt.priceDelta > 0 && <span className="text-green-400">+৳{opt.priceDelta.toFixed(2)}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-4">
              <button 
                onClick={() => setSelectedProduct(null)}
                className="flex-1 p-3 bg-gray-600 hover:bg-gray-500 rounded font-bold transition"
              >
                Cancel
              </button>
              <button 
                onClick={() => addToCart(selectedProduct, selectedMods)}
                className="flex-1 p-3 bg-green-600 hover:bg-green-500 rounded font-bold transition"
              >
                Add to Ticket
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}