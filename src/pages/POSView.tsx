import { useEffect, useState } from 'react';
import { getDatabase } from '../database/db';

interface Product {
  productId: string; name: string; price: number; category: string; image?: string; modifierGroups: any[];
}
interface CartItem {
  cartItemId: string; product: Product; modifiers: any[];
}

export default function POSView() {
  const [menuItems, setMenuItems] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTickets, setOpenTickets] = useState<any[]>([]);

  const [settings] = useState(() => {
    const saved = localStorage.getItem('pos_settings');
    return saved ? JSON.parse(saved) : { storeName: 'BYRON BLISS', branchName: 'Khulna', cashierName: 'Nirvik', currencySymbol: '৳', taxRate: 10, categories: 'Hot Coffee', tables: [] };
  });
  
  const categoryList = ['All', ...settings.categories.split(',').map((c: string) => c.trim())];

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  
  const [mainView, setMainView] = useState<'menu' | 'floorplan'>('menu');
  const [mobileTab, setMobileTab] = useState<'main' | 'cart'>('main');

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedMods, setSelectedMods] = useState<any[]>([]);
  const [receiptData, setReceiptData] = useState<any>(null);

  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [orderType, setOrderType] = useState('Dine In');
  const [selectedTable, setSelectedTable] = useState<string>('');

  useEffect(() => {
    let sub: any;
    const loadPOS = async () => {
      const db = await getDatabase();
      const items = await db.menu.find().exec();
      setMenuItems(items.map((item: any) => item.toJSON()));
      
      sub = db.tickets.find({ selector: { status: 'OPEN' } }).$.subscribe((tickets: any[]) => {
        setOpenTickets(tickets.map((t: any) => t.toJSON()));
      });
      setLoading(false);
    };
    loadPOS();
    return () => { if(sub) sub.unsubscribe(); };
  }, []);

  const handleItemClick = (product: Product) => {
    if (product.modifierGroups && product.modifierGroups.length > 0) {
      setSelectedProduct(product); setSelectedMods([]);
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

  const removeFromCart = (cartItemId: string) => {
    setCart(prev => prev.filter(item => item.cartItemId !== cartItemId));
  };

  const resetOrderSession = () => {
    setCart([]); setCustomerName(''); setSelectedTable(''); setActiveTicketId(null);
  };

  const processOrder = async (isPaid: boolean) => {
    if (cart.length === 0) return;
    
    // ENFORCING TABLE SELECTION FOR ACTIVE/HOLD ORDERS
    if (!isPaid && !selectedTable) {
      alert("⚠️ You must select a table before holding an active order!");
      setMainView('floorplan');
      return;
    }

    try {
      const db = await getDatabase();
      const formattedItems = cart.map(item => {
        const itemModTotal = item.modifiers.reduce((mSum, m) => mSum + m.priceDelta, 0);
        return { productId: item.product.productId, name: item.product.name, modifiers: item.modifiers, lineTotal: item.product.price + itemModTotal };
      });

      const payload = {
        ticketId: activeTicketId || crypto.randomUUID(),
        status: isPaid ? 'PAID' : 'OPEN',
        createdAt: Date.now(),
        customerName: customerName || 'Walk-in Customer',
        orderType,
        tableNumber: selectedTable,
        items: formattedItems,
        grossTotal: parseFloat(totalWithTax)
      };

      if (activeTicketId) {
        const existing = await db.tickets.findOne(activeTicketId).exec();
        await existing.patch(payload);
      } else {
        await db.tickets.insert(payload);
      }

      if (isPaid) setReceiptData(payload);
      resetOrderSession();
      setMainView('floorplan');
    } catch (err: any) { alert(`Action Failed: ${err.message}`); }
  };

  const loadActiveTable = (tableId: string) => {
    const activeTicket = openTickets.find(t => t.tableNumber === tableId);
    if (activeTicket) {
      const reconstructedCart = activeTicket.items.map((tItem: any) => {
        const menuProduct = menuItems.find(p => p.productId === tItem.productId);
        return {
          cartItemId: crypto.randomUUID(),
          product: menuProduct || { productId: tItem.productId, name: tItem.name, price: tItem.lineTotal - tItem.modifiers.reduce((m:any, x:any) => m + x.priceDelta, 0), category: '', modifierGroups: [] },
          modifiers: tItem.modifiers
        };
      });
      setCart(reconstructedCart);
      setCustomerName(activeTicket.customerName);
      setOrderType(activeTicket.orderType);
      setSelectedTable(activeTicket.tableNumber);
      setActiveTicketId(activeTicket.ticketId);
    } else {
      resetOrderSession();
      setSelectedTable(tableId);
      setMainView('menu');
    }
  };

  const subtotal = cart.reduce((sum, item) => sum + item.product.price + item.modifiers.reduce((mSum, m) => mSum + m.priceDelta, 0), 0);
  const tax = subtotal * (settings.taxRate / 100);
  const totalWithTax = (subtotal + tax).toFixed(2);
  const filteredItems = menuItems.filter(item => (selectedCategory === 'All' || item.category === selectedCategory) && item.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex h-screen bg-[#f4f5f7] text-gray-800 font-sans flex-col print:hidden select-none overflow-hidden">
      
      <div className="bg-white px-4 md:px-6 py-3 flex justify-between items-center border-b border-gray-200 shadow-sm shrink-0">
        <div className="flex items-center gap-4 md:gap-8">
          <h1 className="text-lg md:text-xl font-black tracking-tight text-emerald-800 flex items-center gap-2 uppercase">
            ☕ {settings.storeName.split(' ')[0]} <span className="text-gray-400 font-light hidden sm:inline">{settings.storeName.split(' ').slice(1).join(' ')}</span>
          </h1>
          {mainView === 'menu' && (
            <div className="relative w-44 sm:w-60 md:w-72">
              <input type="text" placeholder="Search menu..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-gray-100 border border-gray-200 rounded-lg py-1.5 md:py-2 pl-9 pr-4 text-xs md:text-sm focus:outline-none focus:border-emerald-600 transition" />
              <span className="absolute left-3 top-2 text-gray-400 text-xs md:text-sm">🔍</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 mr-2">
            <button onClick={() => setMainView('menu')} className={`px-4 py-1.5 rounded text-xs md:text-sm font-bold transition ${mainView === 'menu' ? 'bg-white shadow-sm text-emerald-800' : 'text-gray-500 hover:text-gray-700'}`}>🍔 Menu</button>
            <button onClick={() => setMainView('floorplan')} className={`px-4 py-1.5 rounded text-xs md:text-sm font-bold transition flex items-center gap-2 ${mainView === 'floorplan' ? 'bg-white shadow-sm text-emerald-800' : 'text-gray-500 hover:text-gray-700'}`}>
              🗺️ Tables
              {openTickets.length > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{openTickets.length}</span>}
            </button>
          </div>
          <a href="#/admin" className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 md:px-4 py-2 rounded-lg font-bold text-xs md:text-sm transition border border-gray-200 hidden sm:block">Admin ⚙️</a>
        </div>
      </div>

      <div className="lg:hidden flex border-b border-gray-200 bg-white shrink-0">
        <button onClick={() => setMobileTab('main')} className={`flex-1 py-3 text-sm font-bold border-b-2 transition ${mobileTab === 'main' ? 'border-emerald-800 text-emerald-900 bg-emerald-50/50' : 'border-transparent text-gray-500'}`}>🏠 View</button>
        <button onClick={() => setMobileTab('cart')} className={`flex-1 py-3 text-sm font-bold border-b-2 transition relative ${mobileTab === 'cart' ? 'border-emerald-800 text-emerald-900 bg-emerald-50/50' : 'border-transparent text-gray-500'}`}>🛒 Current Order ({cart.length})</button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className={`flex-1 flex-col p-4 md:p-6 overflow-hidden ${mobileTab === 'main' ? 'flex' : 'hidden lg:flex'}`}>
          {mainView === 'menu' ? (
            <>
              <div className="flex gap-2 md:gap-3 overflow-x-auto pb-4 scrollbar-none shrink-0">
                {categoryList.map(cat => (
                  <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-4 md:px-5 py-2 rounded-full text-xs md:text-sm font-bold transition shadow-sm whitespace-nowrap ${selectedCategory === cat ? 'bg-emerald-800 text-white shadow-emerald-800/20' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`}>
                    {cat}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto pr-1 pt-1">
                {loading ? <div className="h-full flex items-center justify-center text-gray-400 font-medium">Loading Menu...</div> : filteredItems.length === 0 ? <div className="h-full flex items-center justify-center text-gray-400 font-medium">No items found.</div> : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
                    {filteredItems.map(item => (
                      <button key={item.productId} onClick={() => handleItemClick(item)} className="aspect-square bg-white p-3 md:p-4 rounded-2xl shadow-sm hover:shadow-md border border-gray-200/80 transition flex flex-col text-left group relative overflow-hidden">
                        <div className="w-full flex-1 bg-emerald-50 rounded-xl mb-2 flex items-center justify-center text-2xl md:text-3xl group-hover:scale-105 transition duration-300 overflow-hidden">
                          {item.image ? <img src={item.image} alt={item.name} className="w-full h-full object-cover" /> : "☕"}
                        </div>
                        <div className="shrink-0">
                          <span className="font-bold text-gray-900 block text-sm mb-0.5 truncate">{item.name}</span>
                          <span className="text-emerald-700 font-extrabold text-xs md:text-sm">{settings.currencySymbol}{item.price.toFixed(2)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="h-full bg-gray-200 rounded-3xl p-8 border-4 border-gray-300 overflow-hidden shadow-inner relative flex-1">
              <h2 className="text-2xl font-black text-gray-400 uppercase tracking-widest absolute top-6 left-6 z-10 pointer-events-none">Live Floor Plan</h2>
              <div className="absolute inset-0 m-6 pt-16">
                  {(settings.tables || []).map((table: any) => {
                    const isOccupied = openTickets.some(t => t.tableNumber === table.name);
                    const isSelected = selectedTable === table.name;
                    return (
                      <button 
                        key={table.id}
                        onClick={() => loadActiveTable(table.name)}
                        style={{ left: `${table.x}%`, top: `${table.y}%` }}
                        className={`
                          absolute flex flex-col items-center justify-center shadow-lg transition-transform transform hover:scale-105 border-4
                          ${table.shape === 'circle' ? 'rounded-full w-20 h-20 sm:w-24 sm:h-24' : 'rounded-2xl w-24 h-16 sm:w-32 sm:h-20'}
                          ${isOccupied ? 'bg-red-500 border-red-700 text-white shadow-red-500/50' : 'bg-emerald-500 border-emerald-700 text-white shadow-emerald-500/50'}
                          ${isSelected ? 'ring-4 ring-offset-4 ring-blue-500 z-10' : ''}
                        `}
                      >
                        <span className="text-base sm:text-lg font-black">{table.name}</span>
                        <span className="text-[10px] font-bold mt-1 opacity-80 uppercase tracking-wider">{isOccupied ? 'Active' : 'Free'}</span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        <div className={`w-full lg:w-[380px] xl:w-[420px] bg-white border-l border-gray-200 flex-col shadow-lg shrink-0 ${mobileTab === 'cart' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="p-4 md:p-5 border-b border-gray-200 flex flex-col gap-3 relative">
            <div className="flex justify-between items-end mb-1">
              <h2 className="text-base md:text-lg font-extrabold text-gray-900 hidden lg:block">
                {activeTicketId ? <span className="text-red-600">Editing Order</span> : 'Current Order'}
              </h2>
              {selectedTable && <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full shadow-sm">Table: {selectedTable}</span>}
            </div>
            <div className="flex flex-col gap-2">
              <input type="text" placeholder="Customer Name" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 md:p-2.5 text-xs md:text-sm focus:outline-none focus:border-emerald-600 font-medium" />
              <select value={orderType} onChange={e => setOrderType(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 md:p-2.5 text-xs md:text-sm focus:outline-none focus:border-emerald-600 font-medium text-gray-700">
                <option value="Dine In">Dine In</option>
                <option value="Takeaway">Takeaway</option>
                <option value="Delivery">Delivery</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-5 flex flex-col gap-3">
            {cart.length === 0 ? <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2"><span className="text-3xl md:text-4xl">🛒</span><span className="text-xs md:text-sm font-medium">Cart is empty</span></div> : (
              cart.map(item => (
                <div key={item.cartItemId} className="bg-gray-50 p-3 rounded-xl border border-gray-200/60 flex flex-col gap-1 group">
                  <div className="flex justify-between font-bold text-xs md:text-sm text-gray-900 items-start">
                    <span className="pr-2">{item.product.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span>{settings.currencySymbol}{(item.product.price + item.modifiers.reduce((m, x) => m + x.priceDelta, 0)).toFixed(2)}</span>
                      <button onClick={() => removeFromCart(item.cartItemId)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1 rounded transition flex items-center justify-center h-6 w-6" title="Remove from cart">✕</button>
                    </div>
                  </div>
                  {item.modifiers.map(mod => (
                    <div key={mod.modId} className="flex justify-between text-[11px] md:text-xs text-gray-500 pl-2">
                      <span>+ {mod.name}</span>
                      <span>{settings.currencySymbol}{mod.priceDelta.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          <div className="p-4 md:p-5 border-t border-gray-200 bg-gray-50/50 flex flex-col gap-2.5">
            <div className="flex justify-between text-xs md:text-sm text-gray-600 font-medium"><span>Sub Total</span><span>{settings.currencySymbol}{subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between text-xs md:text-sm text-gray-600 font-medium"><span>Tax ({settings.taxRate}%)</span><span>{settings.currencySymbol}{tax.toFixed(2)}</span></div>
            <div className="flex justify-between text-base md:text-lg font-black text-gray-900 pt-2 border-t border-gray-200"><span>Total</span><span className="text-emerald-800">{settings.currencySymbol}{totalWithTax}</span></div>
            
            <div className="flex gap-2 mt-1">
              <button onClick={() => processOrder(false)} disabled={cart.length === 0} className="w-1/3 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-3.5 md:py-4 rounded-xl text-sm font-extrabold shadow-md transition duration-200">
                Hold (Save)
              </button>
              <button onClick={() => processOrder(true)} disabled={cart.length === 0} className="w-2/3 bg-emerald-800 hover:bg-emerald-900 disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-3.5 md:py-4 rounded-xl text-sm md:text-base font-extrabold shadow-lg shadow-emerald-800/20 transition duration-200">
                Charge {settings.currencySymbol}{totalWithTax}
              </button>
            </div>
            {cart.length > 0 && <button onClick={resetOrderSession} className="text-gray-500 hover:text-red-600 text-xs font-bold pt-1 transition">Clear Cart</button>}
          </div>
        </div>
      </div>

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
                        <button key={opt.modId} onClick={() => toggleMod(opt)} className={`p-3 rounded-xl text-left flex justify-between items-center transition border ${isSelected ? 'bg-emerald-50 border-emerald-600 text-emerald-900 font-bold' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100 font-medium'}`}>
                          <span className="text-sm">{opt.name}</span>
                          {opt.priceDelta > 0 && <span className="text-xs text-emerald-700 font-bold">+{settings.currencySymbol}{opt.priceDelta.toFixed(2)}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setSelectedProduct(null)} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition text-sm">Cancel</button>
              <button onClick={() => addToCart(selectedProduct, selectedMods)} className="flex-1 py-3 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl font-bold transition text-sm shadow-md">Add to Order</button>
            </div>
          </div>
        </div>
      )}

      {receiptData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] print:absolute print:inset-0 print:bg-transparent">
          <div className="bg-white text-gray-800 p-6 md:p-8 rounded-2xl w-full max-w-sm shadow-2xl font-mono border border-gray-100">
            <div className="text-center mb-6 border-b-2 border-dashed border-gray-200 pb-4">
              <h2 className="text-xl font-black uppercase tracking-wider text-emerald-900">{settings.storeName}</h2>
              <p className="text-xs mt-1 text-gray-500">{settings.branchName}</p>
              <p className="text-xs mt-2 text-gray-400">{new Date(receiptData.createdAt).toLocaleString()}</p>
              <p className="text-xs mt-1 text-gray-600 font-bold">Customer: {receiptData.customerName} ({receiptData.orderType})</p>
              {receiptData.tableNumber && <p className="text-xs mt-1 text-gray-600 font-bold">Table: {receiptData.tableNumber}</p>}
            </div>
            <div className="flex flex-col gap-3 mb-6 max-h-48 overflow-y-auto">
              {receiptData.items.map((item: any, idx: number) => (
                <div key={idx} className="flex flex-col text-xs">
                  <div className="flex justify-between font-bold text-gray-900">
                    <span>{item.name}</span>
                    <span>{settings.currencySymbol}{item.lineTotal.toFixed(2)}</span>
                  </div>
                  {item.modifiers.map((mod: any) => (
                    <div key={mod.modId} className="flex justify-between text-gray-500 pl-2 mt-0.5">
                      <span>+ {mod.name}</span>
                      <span>{settings.currencySymbol}{mod.priceDelta.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="border-t-2 border-dashed border-gray-200 pt-4 flex justify-between text-base font-black text-gray-900">
              <span>TOTAL</span>
              <span className="text-emerald-800">{settings.currencySymbol}{receiptData.grossTotal.toFixed(2)}</span>
            </div>
            <div className="mt-6 flex gap-3 print:hidden">
              <button onClick={() => setReceiptData(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-sans font-bold transition text-sm">New Order</button>
              <button onClick={() => window.print()} className="flex-1 bg-emerald-800 hover:bg-emerald-900 text-white py-3 rounded-xl font-sans font-bold transition text-sm shadow-md">🖨️ Print</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}