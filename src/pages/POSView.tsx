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
  modifiers: any[];
}

export default function POSView() {
  const [menuItems, setMenuItems] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedMods, setSelectedMods] = useState<any[]>([]);
  
  const [receiptData, setReceiptData] = useState<any>(null);

  useEffect(() => {
    const fetchMenu = async () => {
      const db = await getDatabase();
      const items = await db.menu.find().exec();
      setMenuItems(items.map((item: any) => item.toJSON()));
      setLoading(false);
    };
    fetchMenu();
  }, []);

  const handleItemClick = (product: Product) => {
    if (product.modifierGroups && product.modifierGroups.length > 0) {
      setSelectedProduct(product);
      setSelectedMods([]);
    } else {
      addToCart(product, []);
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
    setSelectedProduct(null);
  };

  const handlePay = async () => {
    if (cart.length === 0) return;
    
    try {
      const db = await getDatabase();
      
      const formattedItems = cart.map(item => {
        const itemModTotal = item.modifiers.reduce((mSum, m) => mSum + m.priceDelta, 0);
        return {
          productId: item.product.productId,
          name: item.product.name,
          modifiers: item.modifiers,
          lineTotal: item.product.price + itemModTotal
        };
      });

      const ticketPayload = {
        ticketId: crypto.randomUUID(),
        status: 'PAID',
        createdAt: Date.now(),
        items: formattedItems,
        grossTotal: parseFloat(currentTotal)
      };

      await db.tickets.insert(ticketPayload);
      
      setReceiptData(ticketPayload);
      setCart([]);
    } catch (err: any) {
      console.error("Ticket save error:", err);
      alert(`Payment Failed: ${err.message}`);
    }
  };

  const currentTotal = cart.reduce((sum, item) => {
    const itemModTotal = item.modifiers.reduce((mSum, m) => mSum + m.priceDelta, 0);
    return sum + item.product.price + itemModTotal;
  }, 0).toFixed(2);

  return (
    <>
      {/* Main POS UI - Hidden on Print */}
      <div className="flex h-screen bg-[#1a1a1a] text-gray-200 font-sans flex-col print:hidden">
        
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
      </div>

      {/* Modifier Modal - Hidden on Print */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 print:hidden">
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

      {/* Receipt Modal - Formatted to take over on Print */}
      {receiptData && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] print:absolute print:inset-0 print:bg-transparent print:items-start print:pt-0">
          <div className="bg-white text-black p-8 rounded-lg w-96 shadow-2xl font-mono print:shadow-none print:w-full print:p-0">
            
            <div className="text-center mb-6 border-b-2 border-dashed border-gray-400 pb-4">
              <h2 className="text-2xl font-bold uppercase tracking-wider">Byron Bay Bliss</h2>
              <p className="text-sm mt-1">Khulna Branch</p>
              <p className="text-xs mt-2 text-gray-500">{new Date(receiptData.createdAt).toLocaleString()}</p>
              <p className="text-xs mt-1 text-gray-500">Ticket ID: {receiptData.ticketId.substring(0, 8)}</p>
            </div>

            <div className="flex flex-col gap-3 mb-6 min-h-[150px]">
              {receiptData.items.map((item: any, idx: number) => (
                <div key={idx} className="flex flex-col text-sm">
                  <div className="flex justify-between font-bold">
                    <span>{item.name}</span>
                    <span>৳{item.lineTotal.toFixed(2)}</span>
                  </div>
                  {item.modifiers.map((mod: any) => (
                    <div key={mod.modId} className="flex justify-between text-xs text-gray-600 pl-2 mt-1">
                      <span>+ {mod.name}</span>
                      <span>৳{mod.priceDelta.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="border-t-2 border-dashed border-gray-400 pt-4 flex justify-between text-lg font-bold">
              <span>TOTAL</span>
              <span>৳{receiptData.grossTotal.toFixed(2)}</span>
            </div>

            <div className="mt-8 flex gap-4 print:hidden">
              <button 
                onClick={() => setReceiptData(null)} 
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-black p-3 rounded font-sans font-bold transition"
              >
                New Order
              </button>
              <button 
                onClick={() => window.print()} 
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white p-3 rounded font-sans font-bold transition"
              >
                🖨️ Print
              </button>
            </div>
            
          </div>
        </div>
      )}
    </>
  );
}