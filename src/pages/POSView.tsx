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
  
  // UI Filters & Mobile View Toggle ('menu' or 'cart')
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [mobileTab, setMobileTab] = useState<'menu' | 'cart'>('menu');
  const categories = ['All', 'Hot Coffee', 'Iced Coffee', 'Pastry', 'Beverage'];

  // Modal State
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedMods, setSelectedMods] = useState<any[]>([]);
  const [receiptData, setReceiptData] = useState<any>(null);

  // Customer & Order Info
  const [customerName, setCustomerName] = useState('');
  const [orderType, setOrderType] = useState('Dine In');

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
        customerName: customerName || 'Walk-in Customer',
        orderType,
        items: formattedItems,
        grossTotal: parseFloat(totalWithTax)
      };

      await db.tickets.insert(ticketPayload);
      setReceiptData(ticketPayload);
      setCart([]);
      setCustomerName('');
    } catch (err: any) {
      console.error("Ticket save error:", err);
      alert(`Payment Failed: ${err.message}`);
    }
  };

  const subtotal = cart.reduce((sum, item) => {
    const itemModTotal = item.modifiers.reduce((mSum, m) => mSum + m.priceDelta, 0);
    return sum + item.product.price + itemModTotal;
  }, 0);

  const tax = subtotal * 0.10;
  const totalWithTax = (subtotal + tax).toFixed(2);

  const filteredItems = menuItems.filter(item => {
    const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="flex h-screen bg-[#f4f5f7] text-gray-800 font-sans flex-col print:hidden select-none overflow-hidden">
      
      {/* TOP HEADER */}
      <div className="bg-white px-4 md:px-6 py-3 flex justify-between items-center border-b border-gray-200 shadow-sm shrink-0">
        <div className="flex items-center gap-4 md:gap-8">
          <h1 className="text-lg md:text-xl font-black tracking-tight text-emerald-800 flex items-center gap-2">
            ☕ BYRON <span className="text-gray-400 font-light hidden sm:inline">BLISS</span>
          </h1>
          <div className="relative w-44 sm:w-60 md:w-72">
            <input 
              type="text" 
              placeholder="Search menu..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-gray-100 border border-gray-200 rounded-lg py-1.5 md:py-2 pl-9 pr-4 text-xs md:text-sm focus:outline-none focus:border-emerald-600 transition"
            />
            <span className="absolute left-3 top-2 text-gray-400 text-xs md:text-sm">🔍</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a href="#/admin" className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 md:px-4 py-2 rounded-lg font-bold text-xs md:text-sm transition border border-gray-200">
            Admin ⚙️
          </a>
          <div className="hidden sm:flex items-center gap-3 pl-3 border-l border-gray-200">
            <div className="w-8 h-8 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-xs">
              N
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs font-bold leading-tight">Nirvik</span>
              <span className="text-[10px] text-emerald-600 font-medium">Cashier</span>
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE TAB TOGGLE BAR */}
      <div className="lg:hidden flex border-b border-gray-200 bg-white shrink-0">
        <button 
          onClick={() => setMobileTab('menu')}
          className={`flex-1 py-3 text-sm font-bold border-b-2 transition ${
            mobileTab === 'menu' ? 'border-emerald-800 text-emerald-900 bg-emerald-50/50' : 'border-transparent text-gray-500'
          }`}
        >
          ☕ Menu
        </button>
        <button 
          onClick={() => setMobileTab('cart')}
          className={`flex-1 py-3 text-sm font-bold border-b-2 transition relative ${
            mobileTab === 'cart' ? 'border-emerald-800 text-emerald-900 bg-emerald-50/50' : 'border-transparent text-gray-500'
          }`}
        >
          🛒 Current Order ({cart.length})
        </button>
      </div>

      {/* MAIN RESPONSIVE LAYOUT */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* LEFT MENU SECTION (Hidden on mobile if 'cart' tab active) */}
        <div className={`flex-1 flex-col p-4 md:p-6 overflow-hidden ${mobileTab === 'menu' ? 'flex' : 'hidden lg:flex'}`}>
          
          <div className="flex gap-2 md:gap-3 overflow-x-auto pb-4 scrollbar-none shrink-0">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 md:px-5 py-2 rounded-full text-xs md:text-sm font-bold transition shadow-sm whitespace-nowrap ${
                  selectedCategory === cat 
                    ? 'bg-emerald-800 text-white shadow-emerald-800/20' 
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto pr-1 pt-1">
            {loading ? (
              <div className="h-full flex items-center justify-center text-gray-400 font-medium">Loading Menu...</div>
            ) : filteredItems.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400 font-medium">No menu items found.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-5">
                {filteredItems.map(item => (
                  <button
                    key={item.productId}
                    onClick={() => handleItemClick(item)}
                    className="bg-white p-4 md:p-5 rounded-2xl shadow-sm hover:shadow-md border border-gray-200/80 transition flex flex-col justify-between text-left group relative overflow-hidden"
                  >
                    <div className="w-full h-20 sm:h-28 bg-emerald-50 rounded-xl mb-3 flex items-center justify-center text-2xl md:text-3xl group-hover:scale-105 transition duration-300">
                      ☕
                    </div>
                    <div>
                      <span className="font-bold text-gray-900 block text-sm md:text-base mb-1 truncate">{item.name}</span>
                      <span className="text-emerald-700 font-extrabold text-xs md:text-sm">৳{item.price.toFixed(2)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT ORDER SIDEBAR (Hidden on mobile if 'menu' tab active) */}
        <div className={`w-full lg:w-[380px] xl:w-[420px] bg-white border-l border-gray-200 flex-col shadow-lg shrink-0 ${mobileTab === 'cart' ? 'flex' : 'hidden lg:flex'}`}>
          
          <div className="p-4 md:p-5 border-b border-gray-200 flex flex-col gap-3">
            <h2 className="text-base md:text-lg font-extrabold text-gray-900 hidden lg:block">Current Order</h2>
            
            <div className="flex flex-col gap-2">
              <input 
                type="text" 
                placeholder="Customer Name" 
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 md:p-2.5 text-xs md:text-sm focus:outline-none focus:border-emerald-600 font-medium"
              />
              <select 
                value={orderType}
                onChange={e => setOrderType(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 md:p-2.5 text-xs md:text-sm focus:outline-none focus:border-emerald-600 font-medium text-gray-700"
              >
                <option value="Dine In">Dine In</option>
                <option value="Takeaway">Takeaway</option>
                <option value="Delivery">Delivery</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-5 flex flex-col gap-3">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                <span className="text-3xl md:text-4xl">🛒</span>
                <span className="text-xs md:text-sm font-medium">Cart is empty</span>
              </div>
            ) : (
              cart.map(item => (
                <div key={item.cartItemId} className="bg-gray-50 p-3 rounded-xl border border-gray-200/60 flex flex-col gap-1">
                  <div className="flex justify-between font-bold text-xs md:text-sm text-gray-900">
                    <span>{item.product.name}</span>
                    <span>৳{(item.product.price + item.modifiers.reduce((m, x) => m + x.priceDelta, 0)).toFixed(2)}</span>
                  </div>
                  {item.modifiers.map(mod => (
                    <div key={mod.modId} className="flex justify-between text-[11px] md:text-xs text-gray-500 pl-2">
                      <span>+ {mod.name}</span>
                      <span>৳{mod.priceDelta.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          <div className="p-4 md:p-5 border-t border-gray-200 bg-gray-50/50 flex flex-col gap-2.5">
            <div className="flex justify-between text-xs md:text-sm text-gray-600 font-medium">
              <span>Sub Total</span>
              <span>৳{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs md:text-sm text-gray-600 font-medium">
              <span>Tax (10%)</span>
              <span>৳{tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-base md:text-lg font-black text-gray-900 pt-2 border-t border-gray-200">
              <span>Total</span>
              <span className="text-emerald-800">৳{totalWithTax}</span>
            </div>

            <button 
              onClick={handlePay}
              disabled={cart.length === 0}
              className="mt-1 w-full bg-emerald-800 hover:bg-emerald-900 disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-3.5 md:py-4 rounded-xl text-sm md:text-base font-extrabold shadow-lg shadow-emerald-800/20 transition duration-200"
            >
              Charge ৳{totalWithTax}
            </button>
          </div>

        </div>
      </div>

      {/* MODIFIER MODAL */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-2xl w-full max-w-md shadow-2xl border border-gray-100">
            <h2 className="text-lg md:text-xl font-extrabold text-gray-900 mb-4">Customize {selectedProduct.name}</h2>
            
            <div className="mb-6 max-h-60 overflow-y-auto flex flex-col gap-4 pr-1">
              {selectedProduct.modifierGroups.map(group => (
                <div key={group.groupId}>
                  <h3 className="font-bold text-gray-400 mb-2 uppercase text-xs tracking-wider">{group.name}</h3>
                  <div className="flex flex-col gap-2">
                    {group.options.map((opt: any) => {
                      const isSelected = selectedMods.some(m => m.modId === opt.modId);
                      return (
                        <button
                          key={opt.modId}
                          onClick={() => toggleMod(opt)}
                          className={`p-3 rounded-xl text-left flex justify-between items-center transition border ${
                            isSelected 
                              ? 'bg-emerald-50 border-emerald-600 text-emerald-900 font-bold' 
                              : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100 font-medium'
                          }`}
                        >
                          <span className="text-sm">{opt.name}</span>
                          {opt.priceDelta > 0 && <span className="text-xs text-emerald-700 font-bold">+৳{opt.priceDelta.toFixed(2)}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setSelectedProduct(null)}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition text-sm"
              >
                Cancel
              </button>
              <button 
                onClick={() => addToCart(selectedProduct, selectedMods)}
                className="flex-1 py-3 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl font-bold transition text-sm shadow-md"
              >
                Add to Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECEIPT MODAL */}
      {receiptData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] print:absolute print:inset-0 print:bg-transparent">
          <div className="bg-white text-gray-800 p-6 md:p-8 rounded-2xl w-full max-w-sm shadow-2xl font-mono border border-gray-100">
            <div className="text-center mb-6 border-b-2 border-dashed border-gray-200 pb-4">
              <h2 className="text-xl font-black uppercase tracking-wider text-emerald-900">Byron Bay Bliss</h2>
              <p className="text-xs mt-1 text-gray-500">Khulna Branch</p>
              <p className="text-xs mt-2 text-gray-400">{new Date(receiptData.createdAt).toLocaleString()}</p>
              <p className="text-xs mt-1 text-gray-600 font-bold">Customer: {receiptData.customerName} ({receiptData.orderType})</p>
            </div>

            <div className="flex flex-col gap-3 mb-6 max-h-48 overflow-y-auto">
              {receiptData.items.map((item: any, idx: number) => (
                <div key={idx} className="flex flex-col text-xs">
                  <div className="flex justify-between font-bold text-gray-900">
                    <span>{item.name}</span>
                    <span>৳{item.lineTotal.toFixed(2)}</span>
                  </div>
                  {item.modifiers.map((mod: any) => (
                    <div key={mod.modId} className="flex justify-between text-gray-500 pl-2 mt-0.5">
                      <span>+ {mod.name}</span>
                      <span>৳{mod.priceDelta.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="border-t-2 border-dashed border-gray-200 pt-4 flex justify-between text-base font-black text-gray-900">
              <span>TOTAL</span>
              <span className="text-emerald-800">৳{receiptData.grossTotal.toFixed(2)}</span>
            </div>

            <div className="mt-6 flex gap-3 print:hidden">
              <button 
                onClick={() => setReceiptData(null)} 
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-sans font-bold transition text-sm"
              >
                New Order
              </button>
              <button 
                onClick={() => window.print()} 
                className="flex-1 bg-emerald-800 hover:bg-emerald-900 text-white py-3 rounded-xl font-sans font-bold transition text-sm shadow-md"
              >
                🖨️ Print
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}