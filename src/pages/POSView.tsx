import { useEffect, useState, useMemo } from 'react';
import { getDatabase } from '../database/db';

interface Product {
  productId: string; name: string; price: number; cost?: number; category: string; image?: string; modifierGroups: any[];
}
interface CartItem {
  cartItemId: string; product: Product; modifiers: any[];
}

export default function POSView() {
  const currentUser = JSON.parse(localStorage.getItem('pos_user') || '{}');
  
  const [menuItems, setMenuItems] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTickets, setOpenTickets] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);

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
  const [waiterName, setWaiterName] = useState('');
  const [orderType, setOrderType] = useState('Dine In');
  const [selectedTable, setSelectedTable] = useState<string>('');
  
  const [paymentMethod, setPaymentMethod] = useState('Cash');

  useEffect(() => {
    let sub: any;
    const loadPOS = async () => {
      const db = await getDatabase();
      const items = await db.menu.find().exec();
      setMenuItems(items.map((item: any) => item.toJSON()));

      const users = await db.users.find().exec();
      const staff = users.map((u: any) => u.toJSON());
      setStaffList(staff);
      if (staff.length > 0) setWaiterName(staff[0].username);
      
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
    setCart(prev => {
      const existingIdx = prev.findIndex(item => 
        item.product.productId === product.productId && 
        JSON.stringify(item.modifiers) === JSON.stringify(modifiers)
      );
      if(existingIdx >= 0) {
         const newCart = [...prev];
         newCart.push({ cartItemId: crypto.randomUUID(), product, modifiers });
         return newCart;
      }
      return [...prev, { cartItemId: crypto.randomUUID(), product, modifiers }];
    });
    setSelectedProduct(null);
  };

  const removeFromCart = (cartItemId: string) => {
    setCart(prev => prev.filter(item => item.cartItemId !== cartItemId));
  };

  const resetOrderSession = () => {
    setCart([]); setCustomerName(''); setSelectedTable(''); setActiveTicketId(null); setPaymentMethod('Cash');
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
        cashierId: currentUser.userId,
        cashierName: currentUser.username,
        waiterName: waiterName || currentUser.username,
        orderType,
        tableNumber: selectedTable,
        paymentMethod: isPaid ? paymentMethod : null,
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
      if (currentUser.role !== 'admin' && activeTicket.cashierId !== currentUser.userId) {
        alert(`ACCESS DENIED: Table ${tableId} is actively being served by ${activeTicket.cashierName}.`);
        return;
      }

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
      if (activeTicket.waiterName) setWaiterName(activeTicket.waiterName);
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

  const handleLogout = () => {
    localStorage.removeItem('pos_user');
    window.location.reload();
  };

  const subtotal = cart.reduce((sum, item) => sum + item.product.price + item.modifiers.reduce((mSum, m) => mSum + m.priceDelta, 0), 0);
  const tax = subtotal * (settings.taxRate / 100);
  const totalWithTax = (subtotal + tax).toFixed(2);
  const filteredItems = menuItems.filter(item => (selectedCategory === 'All' || item.category === selectedCategory) && item.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const myActiveTickets = openTickets.filter(t => currentUser.role === 'admin' || t.cashierId === currentUser.userId);

  return (
    <>
      <div className="flex h-[100dvh] bg-[#f4f7f6] text-gray-800 font-sans flex-col print:hidden select-none overflow-hidden">
        
        {/* ================= TOP NAVBAR ================= */}
        <header className="h-[70px] bg-white border-b border-gray-200 px-4 md:px-6 flex items-center justify-between shrink-0 z-10 shadow-sm">
          <div className="flex items-center gap-4 md:gap-8 flex-1">
            <div className="flex items-center gap-2 shrink-0">
              <svg className="w-8 h-8 text-[#ff9f43]" viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h16v2H4zm2 4h12v10H6zm3 2v6h2v-6zm4 0v6h2v-6z"/></svg>
              <span className="font-black text-xl md:text-2xl tracking-tight text-[#0f172a] uppercase truncate max-w-[120px] sm:max-w-none">{settings.storeName.split(' ')[0]}</span>
            </div>
            
            {mainView === 'menu' && (
              <div className="relative w-32 sm:w-60 md:w-72 hidden sm:block">
                <svg className="w-4 h-4 absolute left-3 top-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                <input 
                  type="text" 
                  placeholder="Search products..." 
                  value={searchQuery} 
                  onChange={e => setSearchQuery(e.target.value)} 
                  className="w-full bg-[#f8f9fa] border border-gray-200 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-[#ff9f43] transition" 
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
              <button onClick={() => setMainView('menu')} className={`px-3 sm:px-5 py-1.5 rounded-md text-[10px] sm:text-sm font-bold transition ${mainView === 'menu' ? 'bg-white shadow-sm text-[#ff9f43]' : 'text-gray-500 hover:text-gray-700'}`}>Menu</button>
              <button onClick={() => setMainView('floorplan')} className={`px-3 sm:px-5 py-1.5 rounded-md text-[10px] sm:text-sm font-bold transition flex items-center gap-1 sm:gap-2 ${mainView === 'floorplan' ? 'bg-white shadow-sm text-[#ff9f43]' : 'text-gray-500 hover:text-gray-700'}`}>
                Map {myActiveTickets.length > 0 && <span className="bg-red-500 text-white text-[8px] sm:text-[10px] px-1.5 py-0.5 rounded-full">{myActiveTickets.length}</span>}
              </button>
            </div>
            
            <div className="w-px h-6 bg-gray-200 hidden md:block mx-1"></div>
            
            {currentUser.role === 'admin' && (
              <a href="#/admin" className="p-2 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-[#ff9f43] hover:border-[#ff9f43] transition group" title="Admin Dashboard">
                <svg className="w-5 h-5 group-hover:rotate-45 transition duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
              </a>
            )}
            <button onClick={handleLogout} className="px-3 sm:px-5 py-2 rounded-lg text-[10px] sm:text-sm font-bold bg-white text-red-500 border border-red-200 hover:bg-red-50 transition">Logout</button>
          </div>
        </header>

        {/* Mobile Tabs */}
        <div className="lg:hidden flex border-b border-gray-200 bg-white shrink-0 shadow-sm">
          <button onClick={() => setMobileTab('main')} className={`flex-1 py-3 text-xs font-bold border-b-2 transition ${mobileTab === 'main' ? 'border-[#ff9f43] text-[#ff9f43] bg-[#fff5ec]' : 'border-transparent text-gray-500'}`}>🏠 View</button>
          <button onClick={() => setMobileTab('cart')} className={`flex-1 py-3 text-xs font-bold border-b-2 transition relative ${mobileTab === 'cart' ? 'border-[#ff9f43] text-[#ff9f43] bg-[#fff5ec]' : 'border-transparent text-gray-500'}`}>🛒 Cart ({cart.length})</button>
        </div>

        <div className="flex flex-1 overflow-hidden h-full">
          
          {/* ================= LEFT CONTENT PANEL ================= */}
          <div className={`flex-1 flex-col p-3 md:p-6 overflow-hidden ${mobileTab === 'main' ? 'flex' : 'hidden lg:flex'}`}>
            {mainView === 'menu' ? (
              <>
                {/* Categories */}
                <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-none shrink-0">
                  {categoryList.map(cat => (
                    <button 
                      key={cat} 
                      onClick={() => setSelectedCategory(cat)} 
                      className={`px-4 sm:px-6 py-2 sm:py-2.5 rounded-[12px] text-[11px] sm:text-[13px] font-bold transition-all duration-200 shadow-sm whitespace-nowrap border ${
                        selectedCategory === cat 
                          ? 'bg-[#ff9f43] text-white shadow-[0_4px_10px_rgba(255,159,67,0.3)] border-[#ff9f43]' 
                          : 'bg-white text-gray-600 border-gray-200 hover:border-[#ff9f43] hover:text-[#ff9f43]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                
                {/* Product Grid */}
                <div className="flex-1 overflow-y-auto pr-1 pt-1 pb-16 lg:pb-0 custom-scrollbar">
                  {loading ? <div className="h-full flex items-center justify-center text-gray-400 font-medium text-sm">Loading Menu...</div> : filteredItems.length === 0 ? <div className="h-full flex items-center justify-center text-gray-400 font-medium text-sm">No items.</div> : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
                      {filteredItems.map(item => (
                        <button 
                          key={item.productId} 
                          onClick={() => handleItemClick(item)} 
                          className="bg-white p-3 md:p-4 rounded-[14px] shadow-sm hover:shadow-[0_4px_15px_rgba(255,159,67,0.15)] border border-gray-100 hover:border-[#ff9f43] transition-all duration-200 flex flex-col text-left group relative overflow-hidden active:scale-95 h-44 sm:h-48"
                        >
                          <div className="w-full flex-1 bg-[#f8f9fa] rounded-[10px] mb-3 flex items-center justify-center text-3xl overflow-hidden group-hover:bg-[#fff5ec] transition-colors border border-gray-50 group-hover:border-[#ffecd9]">
                            {item.image ? <img src={item.image} alt={item.name} className="w-full h-full object-cover mix-blend-multiply" /> : "☕"}
                          </div>
                          <div className="shrink-0 flex flex-col">
                            <span className="font-bold text-[#0f172a] block text-[11px] sm:text-[13px] leading-tight mb-0.5 line-clamp-2">{item.name}</span>
                            <span className="text-[#ff9f43] font-black text-[11px] sm:text-sm mt-auto">{settings.currencySymbol}{item.price.toFixed(2)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Floorplan */
              <div className="h-full bg-[#f8f9fa] rounded-2xl p-4 sm:p-8 border-4 border-gray-200 overflow-hidden shadow-inner relative flex-1">
                <h2 className="text-lg sm:text-2xl font-black text-gray-300 uppercase tracking-widest absolute top-4 left-4 z-10 pointer-events-none">Floor Plan</h2>
                <div className="absolute inset-0 m-4 sm:m-6 pt-12">
                    {(settings.tables || []).map((table: any) => {
                      const occupiedTicket = openTickets.find(t => t.tableNumber === table.name);
                      const isOccupied = !!occupiedTicket;
                      const isMine = isOccupied && (occupiedTicket.cashierId === currentUser.userId || currentUser.role === 'admin');
                      const isSelected = selectedTable === table.name;
                      
                      return (
                        <button 
                          key={table.id} onClick={() => loadActiveTable(table.name)} style={{ left: `${table.x}%`, top: `${table.y}%` }}
                          className={`
                            absolute flex flex-col items-center justify-center shadow-md transition-transform transform hover:scale-105 border-2 sm:border-4
                            ${table.shape === 'circle' ? 'rounded-full w-14 h-14 sm:w-24 sm:h-24' : 'rounded-2xl w-16 h-12 sm:w-32 sm:h-20'}
                            ${isOccupied ? (isMine ? 'bg-[#ff9f43] border-[#ea862a] text-white' : 'bg-[#94a3b8] border-[#64748b] text-white') : 'bg-[#10b981] border-[#059669] text-white'}
                            ${isSelected ? 'ring-4 ring-offset-4 ring-blue-400 z-10 scale-105' : ''}
                          `}
                        >
                          <span className="text-xs sm:text-lg font-black">{table.name}</span>
                          <span className="text-[8px] sm:text-[10px] font-bold sm:mt-1 opacity-90 uppercase">{isOccupied ? (isMine ? 'Active' : 'Locked') : 'Free'}</span>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          {/* ================= RIGHT CART PANEL ================= */}
          <div className={`w-full lg:w-[380px] xl:w-[400px] bg-white border-l border-gray-200 flex-col shadow-[-4px_0_20px_rgba(0,0,0,0.03)] shrink-0 h-full z-10 ${mobileTab === 'cart' ? 'flex' : 'hidden lg:flex'}`}>
            <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col gap-3 relative shrink-0">
              <div className="flex justify-between items-center mb-1">
                <h2 className="text-sm sm:text-[16px] font-black text-[#0f172a]">
                  {activeTicketId ? <span className="text-[#ff9f43]">Editing Order</span> : 'Current Order'}
                </h2>
                <div className="flex items-center gap-2">
                  {selectedTable && <span className="bg-blue-50 text-blue-600 border border-blue-100 text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-md">Table {selectedTable}</span>}
                  {cart.length > 0 && <button onClick={resetOrderSession} className="text-[10px] font-bold text-red-500 bg-red-50 hover:bg-red-100 px-2 py-1 rounded transition">Clear All</button>}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <input type="text" placeholder="Customer Name" value={customerName} onChange={e => setCustomerName(e.target.value)} className="bg-[#f8f9fa] border border-gray-200 rounded-lg px-3 py-2.5 text-[12px] font-bold text-gray-700 placeholder-gray-400 focus:outline-none focus:border-[#ff9f43] transition" />
                <select value={waiterName} onChange={e => setWaiterName(e.target.value)} className="bg-[#f8f9fa] border border-gray-200 rounded-lg px-3 py-2.5 text-[12px] font-bold text-gray-700 focus:outline-none focus:border-[#ff9f43] transition cursor-pointer">
                  <option value="" disabled>Select Waiter</option>
                  {staffList.map(s => <option key={s.userId} value={s.username}>{s.username}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select value={orderType} onChange={e => setOrderType(e.target.value)} className="bg-[#f8f9fa] border border-gray-200 rounded-lg px-3 py-2.5 text-[12px] font-bold text-gray-700 focus:outline-none focus:border-[#ff9f43] transition cursor-pointer">
                  <option value="Dine In">Dine In</option>
                  <option value="Takeaway">Takeaway</option>
                  <option value="Delivery">Delivery</option>
                </select>
                {orderType === 'Dine In' && (
                  <input type="text" placeholder="Table No." value={selectedTable} onChange={e => setSelectedTable(e.target.value)} className="bg-[#f8f9fa] border border-gray-200 rounded-lg px-3 py-2.5 text-[12px] font-bold text-gray-700 placeholder-gray-400 focus:outline-none focus:border-[#ff9f43] transition" />
                )}
              </div>

              {/* PAYMENT METHOD DROPDOWN */}
              <div>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full bg-[#f8f9fa] border border-gray-200 rounded-lg px-3 py-2.5 text-[12px] font-bold text-gray-700 focus:outline-none focus:border-[#ff9f43] transition cursor-pointer">
                  <option value="Cash">💵 Cash</option>
                  <option value="Visa">💳 Visa</option>
                  <option value="Amex">💳 Amex</option>
                  <option value="bKash">📱 bKash</option>
                </select>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5 bg-[#f8f9fa]/50 custom-scrollbar">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-3">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider">Cart is empty</span>
                </div>
              ) : (
                cart.map(item => (
                  <div key={item.cartItemId} className="bg-white p-3 rounded-xl border border-gray-100 flex flex-col gap-1 shadow-sm">
                    <div className="flex justify-between font-bold text-[13px] text-[#0f172a] items-start">
                      <span className="pr-2 leading-tight">{item.product.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[#ff9f43]">{settings.currencySymbol}{(item.product.price + item.modifiers.reduce((m, x) => m + x.priceDelta, 0)).toFixed(2)}</span>
                        <button onClick={() => removeFromCart(item.cartItemId)} className="text-gray-300 hover:text-red-500 hover:bg-red-50 p-1 rounded transition">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                      </div>
                    </div>
                    {item.modifiers.map(mod => (
                      <div key={mod.modId} className="flex justify-between text-[11px] text-gray-500 font-medium pl-1">
                        <span>+ {mod.name}</span>
                        <span>{settings.currencySymbol}{mod.priceDelta.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>

            <div className="p-4 sm:p-5 border-t border-gray-100 bg-white flex flex-col gap-2 shadow-[0_-4px_10px_rgba(0,0,0,0.02)] shrink-0">
              <div className="flex justify-between text-[12px] text-gray-500 font-bold"><span>Sub Total</span><span>{settings.currencySymbol}{subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between text-[12px] text-gray-500 font-bold"><span>Tax ({settings.taxRate}%)</span><span>{settings.currencySymbol}{tax.toFixed(2)}</span></div>
              <div className="flex justify-between text-[18px] sm:text-[22px] font-black text-[#0f172a] pt-2 border-t border-gray-100 border-dashed mt-1">
                <span>Total</span><span className="text-[#10b981]">{settings.currencySymbol}{totalWithTax}</span>
              </div>
              
              <div className="flex gap-3 mt-2 sm:mt-3">
                <button onClick={() => processOrder(false)} disabled={cart.length === 0} className="flex-1 bg-white border-2 border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50 py-3.5 rounded-xl text-sm font-bold transition disabled:opacity-50">
                  Hold Order
                </button>
                <button onClick={() => processOrder(true)} disabled={cart.length === 0} className="flex-[2] bg-[#ff9f43] hover:bg-orange-500 disabled:bg-gray-300 text-white py-3.5 rounded-xl text-sm font-black shadow-[0_4px_15px_rgba(255,159,67,0.3)] transition disabled:shadow-none disabled:text-gray-500">
                  Charge {settings.currencySymbol}{totalWithTax}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div> {/* CLOSES MAIN APP HIDDEN-ON-PRINT WRAPPER */}

      {/* ================= OUTSIDE MODALS (PRINT VISIBLE WHEN ACTIVE) ================= */}

      {/* MODIFIER SELECTION MODAL */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-50 print:hidden">
          <div className="bg-white p-5 sm:p-6 rounded-t-2xl sm:rounded-[14px] w-full max-w-md shadow-2xl border border-gray-100">
            <h2 className="text-lg sm:text-xl font-black text-[#0f172a] mb-4">Customize {selectedProduct.name}</h2>
            <div className="mb-6 max-h-60 overflow-y-auto flex flex-col gap-4 custom-scrollbar pr-2">
              {selectedProduct.modifierGroups.map(group => (
                <div key={group.groupId}>
                  <h3 className="font-bold text-gray-400 mb-2 uppercase text-[10px] sm:text-xs tracking-wider">{group.name}</h3>
                  <div className="flex flex-col gap-2">
                    {group.options.map((opt: any) => {
                      const isSelected = selectedMods.some(m => m.modId === opt.modId);
                      return (
                        <button key={opt.modId} onClick={() => toggleMod(opt)} className={`p-3 rounded-xl text-left flex justify-between items-center transition border ${isSelected ? 'bg-[#fff5ec] border-[#ff9f43] text-[#ff9f43] font-bold' : 'bg-[#f8f9fa] border-gray-200 text-gray-700 font-medium hover:border-gray-300'}`}>
                          <span className="text-xs sm:text-sm">{opt.name}</span>
                          {opt.priceDelta > 0 && <span className={`text-[10px] sm:text-xs font-black ${isSelected ? 'text-[#ff9f43]' : 'text-[#10b981]'}`}>+{settings.currencySymbol}{opt.priceDelta.toFixed(2)}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setSelectedProduct(null)} className="flex-1 py-3 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-xl font-bold text-sm transition">Cancel</button>
              <button onClick={() => addToCart(selectedProduct, selectedMods)} className="flex-1 py-3 bg-[#ff9f43] hover:bg-orange-500 text-white rounded-xl font-black text-sm shadow-md transition">Add to Order</button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT RECEIPT OVERLAY */}
      {receiptData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] print:static print:bg-white print:p-0 print:flex print:items-start print:justify-start">
          <div className="bg-white text-gray-800 p-6 md:p-8 rounded-2xl w-full max-w-sm shadow-2xl font-mono border border-gray-100 print:shadow-none print:border-none print:max-w-none print:w-full print:m-0 print:p-0">
            <div className="text-center mb-6 border-b-2 border-dashed border-gray-200 pb-4">
              <h2 className="text-xl font-black uppercase tracking-wider text-[#0f172a]">{settings.storeName}</h2>
              <p className="text-xs mt-1 text-gray-500">{settings.branchName}</p>
              <p className="text-xs mt-2 text-gray-400">{new Date(receiptData.createdAt).toLocaleString()}</p>
              <p className="text-xs mt-2 text-gray-600 font-bold">Cashier: {currentUser.username} | Waiter: {receiptData.waiterName || 'N/A'}</p>
              <p className="text-xs mt-1 text-gray-600 font-bold">Customer: {receiptData.customerName} ({receiptData.orderType})</p>
              {receiptData.tableNumber && <p className="text-xs mt-1 text-gray-600 font-bold">Table: {receiptData.tableNumber}</p>}
              <p className="text-xs mt-1 text-[#10b981] font-black uppercase">Paid via {receiptData.paymentMethod}</p>
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
              <span className="text-[#10b981]">{settings.currencySymbol}{receiptData.grossTotal.toFixed(2)}</span>
            </div>
            <div className="mt-6 flex gap-3 print:hidden">
              <button onClick={() => setReceiptData(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-sans font-bold transition text-sm">New Order</button>
              <button onClick={() => window.print()} className="flex-1 bg-[#ff9f43] hover:bg-orange-500 text-white py-3 rounded-xl font-sans font-bold transition text-sm shadow-md">🖨️ Print</button>
            </div>
          </div>
        </div>
      )}
      
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #e2e8f0; border-radius: 10px; }
        .scrollbar-none::-webkit-scrollbar { display: none; }
      `}} />
    </>
  );
}