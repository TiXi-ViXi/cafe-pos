import { useEffect, useState } from 'react';
import { getDatabase } from '../database/db';

interface Product {
  productId: string; name: string; price: number; cost?: number; category: string; image?: string; modifierGroups: any[];
}
interface CartItem {
  cartItemId: string; product: Product; modifiers: any[];
}

export default function POSView() {
  // 1. Get the currently logged in user
  const currentUser = JSON.parse(localStorage.getItem('pos_user') || '{}');
  
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
    if (!isPaid && !selectedTable) {
      alert("⚠️ Select a table before holding an order!");
      setMainView('floorplan');
      if (window.innerWidth < 1024) setMobileTab('main');
      return;
    }

    try {
      const db = await getDatabase();
      const totalCost = cart.reduce((sum, item) => sum + (item.product.cost || 0), 0);
      
      const formattedItems = cart.map(item => {
        const itemModTotal = item.modifiers.reduce((mSum, m) => mSum + m.priceDelta, 0);
        return { 
          productId: item.product.productId, 
          name: item.product.name, 
          modifiers: item.modifiers, 
          lineTotal: item.product.price + itemModTotal,
          cost: item.product.cost || 0
        };
      });

      const payload = {
        ticketId: activeTicketId || crypto.randomUUID(),
        status: isPaid ? 'PAID' : 'OPEN',
        createdAt: Date.now(),
        customerName: customerName || 'Walk-in Customer',
        orderType,
        tableNumber: selectedTable,
        items: formattedItems,
        grossTotal: parseFloat(totalWithTax),
        totalCost: parseFloat(totalCost.toFixed(2))
      };

      if (activeTicketId) {
        const existing = await db.tickets.findOne(activeTicketId).exec();
        const { ticketId, ...updateData } = payload;
        await existing.patch(updateData);
      } else {
        await db.tickets.insert(payload);
      }

      if (isPaid) setReceiptData(payload);
      resetOrderSession();
      setMainView('floorplan');
      if (window.innerWidth < 1024) setMobileTab('main');
    } catch (err: any) { alert(`Action Failed: ${err.message}`); }
  };

  const loadActiveTable = (tableId: string) => {
    const activeTicket = openTickets.find(t => t.tableNumber === tableId);
    if (activeTicket) {
      const reconstructedCart = activeTicket.items.map((tItem: any) => {
        const menuProduct = menuItems.find(p => p.productId === tItem.productId);
        return {
          cartItemId: crypto.randomUUID(),
          product: menuProduct || { productId: tItem.productId, name: tItem.name, price: tItem.lineTotal - tItem.modifiers.reduce((m:any, x:any) => m + x.priceDelta, 0), cost: tItem.cost || 0, category: '', modifierGroups: [] },
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
    if (window.innerWidth < 1024) setMobileTab('cart');
  };

  // 2. Add Logout function
  const handleLogout = () => {
    localStorage.removeItem('pos_user');
    window.location.reload();
  };

  const subtotal = cart.reduce((sum, item) => sum + item.product.price + item.modifiers.reduce((mSum, m) => mSum + m.priceDelta, 0), 0);
  const tax = subtotal * (settings.taxRate / 100);
  const totalWithTax = (subtotal + tax).toFixed(2);
  const filteredItems = menuItems.filter(item => (selectedCategory === 'All' || item.category === selectedCategory) && item.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <>
      <div className="flex h-[100dvh] bg-[#f4f5f7] text-gray-800 font-sans flex-col print:hidden select-none overflow-hidden">
        <div className="bg-white px-3 md:px-6 py-2 md:py-3 flex justify-between items-center border-b border-gray-200 shadow-sm shrink-0">
          <div className="flex items-center gap-3 md:gap-8">
            <h1 className="text-base md:text-xl font-black tracking-tight text-emerald-800 flex items-center uppercase truncate max-w-[120px] sm:max-w-none">
              ☕ {settings.storeName.split(' ')[0]}
            </h1>
            {mainView === 'menu' && (
              <div className="relative w-32 sm:w-60 md:w-72 hidden sm:block">
                <input type="text" placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-gray-100 border border-gray-200 rounded-lg py-1.5 pl-8 pr-3 text-xs md:text-sm focus:outline-none focus:border-emerald-600" />
                <span className="absolute left-2.5 top-1.5 text-gray-400 text-xs">🔍</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
              <button onClick={() => setMainView('menu')} className={`px-2 sm:px-4 py-1 sm:py-1.5 rounded text-[10px] sm:text-sm font-bold transition ${mainView === 'menu' ? 'bg-white shadow-sm text-emerald-800' : 'text-gray-500'}`}>Menu</button>
              <button onClick={() => setMainView('floorplan')} className={`px-2 sm:px-4 py-1 sm:py-1.5 rounded text-[10px] sm:text-sm font-bold transition flex items-center gap-1 sm:gap-2 ${mainView === 'floorplan' ? 'bg-white shadow-sm text-emerald-800' : 'text-gray-500'}`}>
                Map {openTickets.length > 0 && <span className="bg-red-500 text-white text-[8px] sm:text-[10px] px-1.5 py-0.5 rounded-full">{openTickets.length}</span>}
              </button>
            </div>
            
            {/* 3. Hide Admin Button if Employee, Show Logout */}
            {currentUser.role === 'admin' && (
              <a href="#/admin" className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 sm:px-4 py-1.5 rounded-lg font-bold text-[10px] sm:text-sm border border-gray-200">⚙️</a>
            )}
            <button onClick={handleLogout} className="bg-red-50 hover:bg-red-100 text-red-600 px-2 sm:px-4 py-1.5 rounded-lg font-bold text-[10px] sm:text-sm border border-red-200 transition">Logout</button>
            
          </div>
        </div>

        <div className="lg:hidden flex border-b border-gray-200 bg-white shrink-0">
          <button onClick={() => setMobileTab('main')} className={`flex-1 py-2.5 text-xs font-bold border-b-2 transition ${mobileTab === 'main' ? 'border-emerald-800 text-emerald-900 bg-emerald-50/50' : 'border-transparent text-gray-500'}`}>🏠 View</button>
          <button onClick={() => setMobileTab('cart')} className={`flex-1 py-2.5 text-xs font-bold border-b-2 transition relative ${mobileTab === 'cart' ? 'border-emerald-800 text-emerald-900 bg-emerald-50/50' : 'border-transparent text-gray-500'}`}>🛒 Cart ({cart.length})</button>
        </div>

        <div className="flex flex-1 overflow-hidden h-full">
          <div className={`flex-1 flex-col p-3 md:p-6 overflow-hidden ${mobileTab === 'main' ? 'flex' : 'hidden lg:flex'}`}>
            {mainView === 'menu' ? (
              <>
                <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-none shrink-0">
                  {categoryList.map(cat => (
                    <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-3 sm:px-5 py-1.5 sm:py-2 rounded-full text-[10px] sm:text-sm font-bold transition shadow-sm whitespace-nowrap ${selectedCategory === cat ? 'bg-emerald-800 text-white shadow-emerald-800/20' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`}>
                      {cat}
                    </button>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto pr-1 pt-1 pb-16 lg:pb-0">
                  {loading ? <div className="h-full flex items-center justify-center text-gray-400 font-medium text-sm">Loading Menu...</div> : filteredItems.length === 0 ? <div className="h-full flex items-center justify-center text-gray-400 font-medium text-sm">No items.</div> : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
                      {filteredItems.map(item => (
                        <button key={item.productId} onClick={() => handleItemClick(item)} className="aspect-square bg-white p-2.5 md:p-4 rounded-xl shadow-sm hover:shadow-md border border-gray-200/80 transition flex flex-col text-left group relative overflow-hidden">
                          <div className="w-full flex-1 bg-emerald-50 rounded-lg mb-2 flex items-center justify-center text-2xl md:text-3xl overflow-hidden">
                            {item.image ? <img src={item.image} alt={item.name} className="w-full h-full object-cover" /> : "☕"}
                          </div>
                          <div className="shrink-0">
                            <span className="font-bold text-gray-900 block text-[11px] sm:text-sm mb-0.5 truncate">{item.name}</span>
                            <span className="text-emerald-700 font-extrabold text-[10px] sm:text-sm">{settings.currencySymbol}{item.price.toFixed(2)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="h-full bg-gray-200 rounded-2xl p-4 sm:p-8 border-4 border-gray-300 overflow-hidden shadow-inner relative flex-1">
                <h2 className="text-lg sm:text-2xl font-black text-gray-400 uppercase tracking-widest absolute top-4 left-4 z-10 pointer-events-none">Floor Plan</h2>
                <div className="absolute inset-0 m-4 sm:m-6 pt-12">
                    {(settings.tables || []).map((table: any) => {
                      const isOccupied = openTickets.some(t => t.tableNumber === table.name);
                      const isSelected = selectedTable === table.name;
                      return (
                        <button 
                          key={table.id} onClick={() => loadActiveTable(table.name)} style={{ left: `${table.x}%`, top: `${table.y}%` }}
                          className={`
                            absolute flex flex-col items-center justify-center shadow-lg transition-transform transform hover:scale-105 border-2 sm:border-4
                            ${table.shape === 'circle' ? 'rounded-full w-14 h-14 sm:w-24 sm:h-24' : 'rounded-xl w-16 h-12 sm:w-32 sm:h-20'}
                            ${isOccupied ? 'bg-red-500 border-red-700 text-white' : 'bg-emerald-500 border-emerald-700 text-white'}
                            ${isSelected ? 'ring-2 sm:ring-4 ring-offset-2 sm:ring-offset-4 ring-blue-500 z-10' : ''}
                          `}
                        >
                          <span className="text-xs sm:text-lg font-black">{table.name}</span>
                          <span className="text-[8px] sm:text-[10px] font-bold sm:mt-1 opacity-80 uppercase">{isOccupied ? 'Active' : 'Free'}</span>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          <div className={`w-full lg:w-[380px] xl:w-[420px] bg-white border-l border-gray-200 flex-col shadow-lg shrink-0 h-full ${mobileTab === 'cart' ? 'flex' : 'hidden lg:flex'}`}>
            <div className="p-3 sm:p-5 border-b border-gray-200 flex flex-col gap-2 relative shrink-0">
              <div className="flex justify-between items-end">
                <h2 className="text-sm sm:text-lg font-extrabold text-gray-900 hidden lg:block">
                  {activeTicketId ? <span className="text-red-600">Editing Order</span> : 'Current Order'}
                </h2>
                {selectedTable && <span className="bg-blue-100 text-blue-800 text-[10px] sm:text-xs font-bold px-2 py-1 rounded-full w-full lg:w-auto text-center">Table {selectedTable}</span>}
              </div>
              <div className="flex gap-2">
                <input type="text" placeholder="Customer" value={customerName} onChange={e => setCustomerName(e.target.value)} className="flex-1 bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs focus:outline-none focus:border-emerald-600 font-medium" />
                <select value={orderType} onChange={e => setOrderType(e.target.value)} className="w-24 sm:w-32 bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs focus:outline-none focus:border-emerald-600 font-medium">
                  <option value="Dine In">Dine In</option>
                  <option value="Takeaway">Takeaway</option>
                  <option value="Delivery">Delivery</option>
                </select>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 sm:p-5 flex flex-col gap-2 bg-gray-50 lg:bg-white">
              {cart.length === 0 ? <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2"><span className="text-3xl">🛒</span><span className="text-xs font-medium">Cart is empty</span></div> : (
                cart.map(item => (
                  <div key={item.cartItemId} className="bg-white lg:bg-gray-50 p-2 sm:p-3 rounded-xl border border-gray-200/60 flex flex-col gap-1 shadow-sm lg:shadow-none">
                    <div className="flex justify-between font-bold text-xs sm:text-sm text-gray-900 items-start">
                      <span className="pr-2">{item.product.name}</span>
                      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                        <span>{settings.currencySymbol}{(item.product.price + item.modifiers.reduce((m, x) => m + x.priceDelta, 0)).toFixed(2)}</span>
                        <button onClick={() => removeFromCart(item.cartItemId)} className="text-red-400 hover:bg-red-50 p-1 rounded h-5 w-5 flex items-center justify-center text-[10px] sm:text-xs">✕</button>
                      </div>
                    </div>
                    {item.modifiers.map(mod => (
                      <div key={mod.modId} className="flex justify-between text-[10px] sm:text-xs text-gray-500 pl-2">
                        <span>+ {mod.name}</span>
                        <span>{settings.currencySymbol}{mod.priceDelta.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>

            <div className="p-3 sm:p-5 border-t border-gray-200 bg-white lg:bg-gray-50/50 flex flex-col gap-1.5 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] lg:shadow-none">
              <div className="flex justify-between text-[11px] sm:text-sm text-gray-600 font-medium"><span>Sub Total</span><span>{settings.currencySymbol}{subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between text-[11px] sm:text-sm text-gray-600 font-medium"><span>Tax ({settings.taxRate}%)</span><span>{settings.currencySymbol}{tax.toFixed(2)}</span></div>
              <div className="flex justify-between text-sm sm:text-lg font-black text-gray-900 pt-1 sm:pt-2 border-t border-gray-200"><span>Total</span><span className="text-emerald-800">{settings.currencySymbol}{totalWithTax}</span></div>
              
              <div className="flex flex-col sm:flex-row gap-2 mt-1 sm:mt-2">
                <button onClick={() => processOrder(false)} disabled={cart.length === 0} className="w-full sm:w-1/3 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 text-white py-2.5 sm:py-4 rounded-lg sm:rounded-xl text-xs sm:text-sm font-extrabold shadow-sm transition">
                  Hold
                </button>
                <button onClick={() => processOrder(true)} disabled={cart.length === 0} className="w-full sm:w-2/3 bg-emerald-800 hover:bg-emerald-900 disabled:bg-gray-300 text-white py-2.5 sm:py-4 rounded-lg sm:rounded-xl text-xs sm:text-base font-extrabold shadow-sm transition">
                  Charge {settings.currencySymbol}{totalWithTax}
                </button>
              </div>
              {cart.length > 0 && <button onClick={resetOrderSession} className="text-gray-400 hover:text-red-500 text-[10px] sm:text-xs font-bold pt-1 pb-1 transition">Clear Cart</button>}
            </div>
          </div>
        </div>

        {selectedProduct && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-50">
            <div className="bg-white p-5 sm:p-6 rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-2xl">
              <h2 className="text-base sm:text-xl font-extrabold text-gray-900 mb-3 sm:mb-4">Customize {selectedProduct.name}</h2>
              <div className="mb-4 sm:mb-6 max-h-60 overflow-y-auto flex flex-col gap-3">
                {selectedProduct.modifierGroups.map(group => (
                  <div key={group.groupId}>
                    <h3 className="font-bold text-gray-400 mb-2 uppercase text-[10px] sm:text-xs">{group.name}</h3>
                    <div className="flex flex-col gap-2">
                      {group.options.map((opt: any) => {
                        const isSelected = selectedMods.some(m => m.modId === opt.modId);
                        return (
                          <button key={opt.modId} onClick={() => toggleMod(opt)} className={`p-2.5 sm:p-3 rounded-lg sm:rounded-xl text-left flex justify-between items-center transition border ${isSelected ? 'bg-emerald-50 border-emerald-600 text-emerald-900 font-bold' : 'bg-gray-50 border-gray-200 text-gray-700 font-medium'}`}>
                            <span className="text-xs sm:text-sm">{opt.name}</span>
                            {opt.priceDelta > 0 && <span className="text-[10px] sm:text-xs text-emerald-700 font-bold">+{settings.currencySymbol}{opt.priceDelta.toFixed(2)}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 sm:gap-3">
                <button onClick={() => setSelectedProduct(null)} className="flex-1 py-2.5 sm:py-3 bg-gray-100 text-gray-700 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm">Cancel</button>
                <button onClick={() => addToCart(selectedProduct, selectedMods)} className="flex-1 py-2.5 sm:py-3 bg-emerald-800 text-white rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm">Add to Order</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {receiptData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] print:static print:bg-white print:p-0 print:block">
          <div className="bg-white text-gray-800 p-6 md:p-8 rounded-2xl w-full max-w-sm shadow-2xl font-mono border border-gray-100 print:shadow-none print:border-none print:max-w-none print:w-full print:m-0 print:p-0">
            <div className="text-center mb-6 border-b-2 border-dashed border-gray-200 pb-4">
              <h2 className="text-xl font-black uppercase tracking-wider text-emerald-900">{settings.storeName}</h2>
              <p className="text-xs mt-1 text-gray-500">{settings.branchName}</p>
              <p className="text-xs mt-2 text-gray-400">{new Date(receiptData.createdAt).toLocaleString()}</p>
              
              {/* 4. Display Cashier Name */}
              <p className="text-xs mt-1 text-gray-600 font-bold">Cashier: {currentUser.username} | {receiptData.customerName} ({receiptData.orderType})</p>
              
              {receiptData.tableNumber && <p className="text-xs mt-1 text-gray-600 font-bold">Table: {receiptData.tableNumber}</p>}
            </div>
            <div className="flex flex-col gap-3 mb-6 max-h-48 overflow-y-auto print:max-h-none print:overflow-visible">
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
    </>
  );
}