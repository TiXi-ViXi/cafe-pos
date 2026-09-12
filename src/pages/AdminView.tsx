import { useState, useEffect, useRef, useMemo } from 'react';
import { getDatabase } from '../database/db';
import { collection, getDocs, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import { db as firebaseDB } from '../database/firebase';

export default function AdminView() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'products' | 'reports' | 'staff' | 'settings'>('dashboard');
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // NEW: Mobile Sidebar State
  
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('pos_settings');
    return saved ? JSON.parse(saved) : { storeName: 'BYRON BLISS', branchName: 'Khulna Branch', currencySymbol: '৳', taxRate: 10, categories: 'Hot Coffee, Iced Coffee, Pastry, Beverage', tables: [{ id: 't1', name: 'Table 1', shape: 'rect', x: 10, y: 10 }] };
  });
  
  const categoryList = settings.categories.split(',').map((c: string) => c.trim());

  // Form States
  const [editId, setEditId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newCost, setNewCost] = useState('');
  const [newCategory, setNewCategory] = useState(categoryList[0] || '');
  const [newImage, setNewImage] = useState('');
  const [tempMods, setTempMods] = useState<{name: string, priceDelta: number}[]>([]);
  const [modName, setModName] = useState('');
  const [modPrice, setModPrice] = useState('');

  const [newUsername, setNewUsername] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newRole, setNewRole] = useState('employee');

  const [newTableName, setNewTableName] = useState('');
  const [newTableShape, setNewTableShape] = useState<'rect'|'circle'>('rect');
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{id: string, offX: number, offY: number} | null>(null);

  // Cloud States
  const [cloudTickets, setCloudTickets] = useState<any[]>([]);
  const [loadingCloud, setLoadingCloud] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      const db = await getDatabase();
      const items = await db.menu.find().exec(); 
      setMenuItems(items.map((item: any) => item.toJSON()));
      
      const savedTickets = await db.tickets.find().exec();
      const parsedTickets = savedTickets.map((t: any) => t.toJSON());
      parsedTickets.sort((a: any, b: any) => b.createdAt - a.createdAt);
      setTickets(parsedTickets);
      
      const savedUsers = await db.users.find().exec(); 
      setUsers(savedUsers.map((u: any) => u.toJSON()));
    };
    loadData();
    fetchCloudData();
  }, []);

  async function fetchCloudData() {
    setLoadingCloud(true);
    try {
      const q = query(collection(firebaseDB, 'tickets'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      setCloudTickets(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (err) { 
      console.error(err); 
    } finally { 
      setLoadingCloud(false); 
    }
  }

  // VOID / CANCEL TRANSACTION
  const handleVoidCloudTicket = async (docId: string, ticketId: string) => {
    if (!window.confirm(`Are you sure you want to VOID ticket ${ticketId || docId}?`)) return;
    try {
      await updateDoc(doc(firebaseDB, 'tickets', docId), { status: 'VOIDED' });
      setCloudTickets(prev => prev.map(t => t.id === docId ? { ...t, status: 'VOIDED' } : t));
    } catch (err: any) { alert('Failed to void: ' + err.message); }
  };

  const paidTickets = useMemo(() => tickets.filter(t => t.status === 'PAID' || t.status === 'SYNCED'), [tickets]);
  
  // Local Stats
  const stats = useMemo(() => {
    let gross = 0; let totalCost = 0; let orders = paidTickets.length; let itemsSold = 0;
    const daily: any = {}; const itemPerf: any = {}; const waiterPerf: any = {};
    
    paidTickets.forEach(t => { 
      gross += t.grossTotal; totalCost += (t.totalCost || 0); 
      const dStr = new Date(t.createdAt).toLocaleDateString();
      if (!daily[dStr]) daily[dStr] = { orders: 0, gross: 0, cost: 0 };
      daily[dStr].orders++; daily[dStr].gross += t.grossTotal; daily[dStr].cost += (t.totalCost || 0);
      
      const wName = t.waiterName || 'Unassigned';
      if (!waiterPerf[wName]) waiterPerf[wName] = { orders: 0, sales: 0 };
      waiterPerf[wName].orders++; waiterPerf[wName].sales += t.grossTotal;

      t.items.forEach((i: any) => {
        itemsSold++;
        if (!itemPerf[i.name]) itemPerf[i.name] = { qty: 0, rev: 0 };
        itemPerf[i.name].qty++; itemPerf[i.name].rev += i.lineTotal;
      });
    });

    const netSales = gross / (1 + (settings.taxRate / 100)); 
    const tax = gross - netSales; 
    const sortedWaiters = Object.entries(waiterPerf).sort((a: any, b: any) => b[1].sales - a[1].sales);

    return { 
      gross, netSales, tax, totalCost, profit: gross - totalCost, orders, itemsSold, 
      daily: Object.entries(daily).sort((a,b) => new Date(a[0]).getTime() - new Date(b[0]).getTime()).slice(-10), 
      topItems: Object.entries(itemPerf).sort((a: any, b: any) => b[1].qty - a[1].qty).slice(0, 5),
      waiters: sortedWaiters
    };
  }, [paidTickets, settings.taxRate]);

  // Comprehensive Cloud Stats (Excludes Voided)
  const cloudStats = useMemo(() => {
    const valid = cloudTickets.filter(t => t.status !== 'VOIDED');
    let gross = 0; let totalCost = 0; let orders = valid.length; let itemsSold = 0;
    const itemPerf: any = {}; const daily: any = {}; const catPerf: any = {};
    
    // Initialize last 7 days for charts to look full
    for(let i=6; i>=0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      daily[d.toLocaleDateString()] = { orders: 0, gross: 0, cost: 0 };
    }

    valid.forEach(t => {
      gross += t.grossTotal || 0; totalCost += (t.totalCost || 0);
      const dateStr = t.createdAt ? new Date(t.createdAt).toLocaleDateString() : new Date().toLocaleDateString();
      if (!daily[dateStr]) daily[dateStr] = { orders: 0, gross: 0, cost: 0 };
      daily[dateStr].orders++; daily[dateStr].gross += (t.grossTotal || 0); daily[dateStr].cost += (t.totalCost || 0);
      
      t.items?.forEach((i: any) => {
        itemsSold++;
        if (!itemPerf[i.name]) itemPerf[i.name] = { qty: 0, rev: 0 };
        itemPerf[i.name].qty++; itemPerf[i.name].rev += (i.lineTotal || 0);
        const c = i.category || 'General';
        if (!catPerf[c]) catPerf[c] = 0;
        catPerf[c]++;
      });
    });

    const topItems = Object.entries(itemPerf).sort((a: any, b: any) => b[1].qty - a[1].qty).slice(0, 5);
    const catArray = Object.entries(catPerf).sort((a: any, b: any) => b[1] - a[1]);

    return { 
      gross, totalCost, profit: gross - totalCost, orders, itemsSold, aov: orders > 0 ? gross/orders : 0,
      daily: Object.entries(daily).sort((a,b) => new Date(a[0]).getTime() - new Date(b[0]).getTime()).slice(-12), 
      topItems, categories: catArray
    };
  }, [cloudTickets]);

  const handleSaveSettings = () => { localStorage.setItem('pos_settings', JSON.stringify(settings)); alert('Settings Saved!'); };

  const handleCreateUser = async () => {
    if (!newUsername || !newPin) return alert('Name and PIN required');
    if (users.find(u => u.pin === newPin)) return alert('PIN already in use.');
    const db = await getDatabase();
    const newUser = { userId: `user_${Date.now()}`, username: newUsername, pin: newPin, role: newRole };
    await db.users.insert(newUser); setUsers(prev => [...prev, newUser]); setNewUsername(''); setNewPin('');
  };

  const handleDeleteUser = async (userId: string, role: string) => {
    if (role === 'admin' && users.filter(u => u.role === 'admin').length === 1) return alert('Cannot delete last admin.');
    if (!window.confirm('Delete user?')) return;
    const db = await getDatabase(); await db.users.find({ selector: { userId } }).remove();
    setUsers(prev => prev.filter(u => u.userId !== userId));
  };

  const addTable = () => { if(!newTableName) return; setSettings({ ...settings, tables: [...(settings.tables || []), { id: crypto.randomUUID(), name: newTableName, shape: newTableShape, x: 40, y: 40 }] }); setNewTableName(''); };
  const removeTable = (id: string) => setSettings({ ...settings, tables: settings.tables.filter((t: any) => t.id !== id) });
  
  const startDrag = (e: React.MouseEvent | React.TouchEvent, id: string) => { 
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX; 
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY; 
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); 
    setDragState({ id, offX: clientX - rect.left, offY: clientY - rect.top }); 
  };
  
  const onDragMove = (e: React.MouseEvent | React.TouchEvent) => { 
    if (!dragState || !canvasRef.current) return; 
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX; 
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY; 
    const parent = canvasRef.current.getBoundingClientRect(); 
    let newX = ((clientX - parent.left - dragState.offX) / parent.width) * 100; 
    let newY = ((clientY - parent.top - dragState.offY) / parent.height) * 100; 
    newX = Math.max(0, Math.min(newX, 90)); newY = Math.max(0, Math.min(newY, 90)); 
    setSettings({ ...settings, tables: settings.tables.map((t: any) => t.id === dragState.id ? { ...t, x: newX, y: newY } : t) }); 
  };
  
  const endDrag = () => setDragState(null);

  const handleSync = async () => {
    setIsSyncing(true);
    try { 
      const db = await getDatabase(); const pendingTickets = await db.tickets.find({ selector: { status: 'PAID' } }).exec(); 
      if (pendingTickets.length === 0) { alert('All synced!'); setIsSyncing(false); return; } 
      for (const ticket of pendingTickets) { await ticket.incrementalPatch({ status: 'SYNCED' }); } 
      const updatedTickets = await db.tickets.find().exec(); const parsedUpdated = updatedTickets.map((t: any) => t.toJSON()); parsedUpdated.sort((a: any, b: any) => b.createdAt - a.createdAt); setTickets(parsedUpdated); 
      alert(`Synced ${pendingTickets.length} tickets!`); 
    } catch (err) { alert('Sync failed.'); } setIsSyncing(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (event) => { const img = new Image(); img.onload = () => { const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 300; const ctx = canvas.getContext('2d'); if (!ctx) return; const minDim = Math.min(img.width, img.height); ctx.drawImage(img, (img.width - minDim) / 2, (img.height - minDim) / 2, minDim, minDim, 0, 0, 300, 300); setNewImage(canvas.toDataURL('image/jpeg', 0.8)); }; img.src = event.target?.result as string; }; reader.readAsDataURL(file); };
  const openEditModal = (item: any) => { setEditId(item.productId); setNewName(item.name); setNewPrice(item.price.toString()); setNewCost(item.cost?.toString() || '0'); setNewCategory(item.category); setNewImage(item.image || ''); setTempMods(item.modifierGroups?.[0]?.options || []); setShowAddModal(true); };
  const resetForm = () => { setShowAddModal(false); setEditId(null); setNewName(''); setNewPrice(''); setNewCost(''); setNewImage(''); setTempMods([]); };

  const handleSaveProduct = async () => {
    if (!newName || !newPrice) return; const db = await getDatabase(); const modifierGroups = tempMods.length > 0 ? [{ groupId: crypto.randomUUID(), name: "Custom Options", options: tempMods.map(m => ({ modId: (m as any).modId || crypto.randomUUID(), name: m.name, priceDelta: m.priceDelta })) }] : [];
    try { if (editId) { const doc = await db.menu.findOne({ selector: { productId: editId } }).exec(); await doc.patch({ name: newName, price: parseFloat(newPrice), cost: parseFloat(newCost)||0, category: newCategory || categoryList[0], image: newImage, modifierGroups }); setMenuItems(prev => prev.map(p => p.productId === editId ? { ...p, name: newName, price: parseFloat(newPrice), cost: parseFloat(newCost)||0, category: newCategory, image: newImage, modifierGroups } : p)); } else { const newItem = { productId: `prod_${Date.now()}`, name: newName, price: parseFloat(newPrice), cost: parseFloat(newCost)||0, category: newCategory || categoryList[0], image: newImage, modifierGroups }; await db.menu.insert(newItem); setMenuItems(prev => [...prev, newItem]); } resetForm(); } catch (err) { console.error(err); }
  };
  const handleDeleteProduct = async (productId: string) => { if (!window.confirm('Delete item?')) return; const db = await getDatabase(); await db.menu.find({ selector: { productId } }).remove(); setMenuItems(prev => prev.filter(p => p.productId !== productId)); };

  const handleTabChange = (tab: any) => {
    setActiveTab(tab);
    setIsSidebarOpen(false); // Close sidebar on mobile when tab changes
  };

  return (
    <div className="h-screen w-full bg-[#f4f7f6] text-gray-800 font-sans flex overflow-hidden select-none">
      
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 lg:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* ================= LEFT SIDEBAR (DREAMS POS STYLE) ================= */}
      <aside className={`fixed lg:relative z-40 h-full w-[260px] bg-white border-r border-gray-200 flex flex-col shrink-0 shadow-[2px_0_10px_rgba(0,0,0,0.02)] transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        {/* Logo Header */}
        <div className="h-[70px] flex items-center px-6 border-b border-gray-100 gap-2 shrink-0 justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-8 h-8 text-[#ff9f43]" viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h16v2H4zm2 4h12v10H6zm3 2v6h2v-6zm4 0v6h2v-6z"/></svg>
            <span className="font-black text-2xl tracking-tight text-[#0f172a] truncate w-24">{settings.storeName.split(' ')[0]}</span>
            <span className="text-[10px] font-bold text-[#ff9f43] mt-2">POS</span>
          </div>
          {/* Close button for mobile */}
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-gray-400 hover:text-red-500">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        {/* Sidebar Nav */}
        <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
          <div className="px-4 mb-2">
            <span className="text-[11px] font-bold uppercase text-gray-400 tracking-wider">Main</span>
          </div>
          
          <ul className="flex flex-col gap-1 px-3">
            <li>
              <button onClick={() => handleTabChange('dashboard')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-bold transition-colors ${activeTab === 'dashboard' ? 'bg-[#fff5ec] text-[#ff9f43]' : 'text-gray-600 hover:bg-gray-50'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
                Cloud Dashboard
              </button>
            </li>
            <li onClick={() => handleTabChange('reports')} className={`pl-9 pr-3 py-2 text-[12px] font-medium cursor-pointer transition ${activeTab === 'reports' ? 'text-[#ff9f43]' : 'text-gray-500 hover:text-[#ff9f43]'}`}>• Local Terminal Reports</li>
            
            <li className="mt-4 px-1">
              <span className="text-[11px] font-bold uppercase text-gray-400 tracking-wider">Inventory</span>
            </li>
            <li>
              <button onClick={() => handleTabChange('products')} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] font-bold transition-colors ${activeTab === 'products' ? 'bg-[#fff5ec] text-[#ff9f43]' : 'text-gray-600 hover:bg-gray-50'}`}>
                <div className="flex items-center gap-3"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg> Products Manager</div>
              </button>
            </li>

            <li className="mt-4 px-1">
              <span className="text-[11px] font-bold uppercase text-gray-400 tracking-wider">Administration</span>
            </li>
            <li>
              <button onClick={() => handleTabChange('staff')} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] font-bold transition-colors ${activeTab === 'staff' ? 'bg-[#fff5ec] text-[#ff9f43]' : 'text-gray-600 hover:bg-gray-50'}`}>
                <div className="flex items-center gap-3"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg> Staff & Roles</div>
              </button>
            </li>
            <li>
              <button onClick={() => handleTabChange('settings')} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] font-bold transition-colors ${activeTab === 'settings' ? 'bg-[#fff5ec] text-[#ff9f43]' : 'text-gray-600 hover:bg-gray-50'}`}>
                <div className="flex items-center gap-3"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg> Settings & Map</div>
              </button>
            </li>
          </ul>
        </div>
      </aside>

      {/* ================= MAIN WRAPPER ================= */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative overflow-x-hidden overflow-y-auto lg:overflow-hidden">
        
        {/* ================= TOP NAVBAR ================= */}
        <header className="h-[70px] bg-white border-b border-gray-200 px-4 md:px-6 flex items-center justify-between shrink-0 z-10 shadow-sm">
          <div className="flex items-center gap-3 md:gap-4 flex-1">
            {/* Mobile Hamburger Menu */}
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 -ml-2 text-gray-600 hover:text-[#ff9f43] transition">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
            </button>
            
            <button className="hidden md:block text-gray-400 hover:text-[#ff9f43] transition bg-gray-50 p-2 rounded-full"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7"></path></svg></button>
            
            <div className="relative hidden md:block w-72">
              <svg className="w-4 h-4 absolute left-3 top-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              <input type="text" placeholder="Search" className="w-full bg-[#f8f9fa] border border-gray-200 rounded-lg pl-9 pr-12 py-2.5 text-sm focus:outline-none focus:border-[#ff9f43] transition" />
              <span className="absolute right-2 top-2 bg-white text-gray-400 text-[10px] font-bold px-1.5 py-1 rounded border border-gray-200 shadow-sm">⌘K</span>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-5">
            <div className="hidden md:flex items-center gap-2 border border-gray-200 px-3 py-1.5 rounded-lg bg-gray-50 cursor-pointer hover:border-gray-300 transition">
              <span className="text-sm">🏬</span> <span className="text-xs font-bold text-gray-700">{settings.branchName}</span>
            </div>
            
            <button onClick={() => { resetForm(); setShowAddModal(true); }} className="bg-[#ff9f43] hover:bg-orange-500 text-white px-3 md:px-4 py-2 md:py-2.5 rounded-lg text-xs font-bold flex items-center gap-1.5 md:gap-2 transition shadow-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg> <span className="hidden sm:inline">Add New</span>
            </button>
            
            <a href="#/" className="bg-[#0f172a] hover:bg-gray-800 text-white px-3 md:px-4 py-2 md:py-2.5 rounded-lg text-xs font-bold flex items-center gap-1.5 md:gap-2 transition shadow-sm no-underline">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> <span className="hidden sm:inline">POS</span>
            </a>
            
            <div className="h-6 w-px bg-gray-200 hidden md:block"></div>
            
            <div className="flex items-center gap-3 md:gap-4 text-gray-500">
              <div className="w-7 h-7 md:w-8 md:h-8 bg-[#ff9f43] rounded-full border-2 border-white shadow-sm flex items-center justify-center font-bold text-white text-[10px] md:text-xs uppercase cursor-pointer">A</div>
            </div>
          </div>
        </header>

        {/* ================= CONTENT BODY ================= */}
        <main className="flex-1 lg:overflow-y-auto p-4 md:p-6 custom-scrollbar w-full">

          {/* ADD/EDIT MODAL OVERLAY */}
          {showAddModal && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
              <div className="bg-white p-5 sm:p-6 rounded-xl w-full max-w-lg shadow-2xl border border-gray-100 flex flex-col gap-4 sm:gap-5 max-h-[90vh] overflow-y-auto">
                <h2 className="text-lg font-bold text-[#0f172a]">{editId ? 'Edit Product' : 'Add New Product'}</h2>
                <div className="flex gap-4 items-center bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 bg-white rounded-lg border border-gray-200 shrink-0 flex items-center justify-center overflow-hidden shadow-sm">
                    {newImage ? <img src={newImage} className="w-full h-full object-cover" /> : <svg className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <label className="block text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Upload Image</label>
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="w-full text-xs text-gray-500 file:mr-2 sm:file:mr-4 file:py-1.5 sm:file:py-2 file:px-3 sm:file:px-4 file:rounded-lg file:border-0 file:text-[10px] sm:file:text-xs file:font-bold file:bg-[#fff5ec] file:text-[#ff9f43] hover:file:bg-orange-100" />
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <input type="text" placeholder="Product Name" value={newName} onChange={e => setNewName(e.target.value)} className="w-full p-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#ff9f43] font-medium" />
                  <select value={newCategory} onChange={e => setNewCategory(e.target.value)} className="w-full p-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#ff9f43] font-medium text-gray-700">
                    {categoryList.map((cat: string) => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Selling Price</label>
                      <input type="number" placeholder={settings.currencySymbol} value={newPrice} onChange={e => setNewPrice(e.target.value)} className="w-full p-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#ff9f43] font-medium" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Cost Price</label>
                      <input type="number" placeholder={settings.currencySymbol} value={newCost} onChange={e => setNewCost(e.target.value)} className="w-full p-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#ff9f43] font-medium" />
                    </div>
                  </div>
                </div>
                <div className="border-t border-gray-100 pt-4">
                  <h3 className="font-bold mb-3 text-gray-400 uppercase text-[10px] sm:text-xs tracking-wider">Modifiers</h3>
                  <div className="flex gap-2 mb-3">
                    <input type="text" placeholder="Name" value={modName} onChange={e => setModName(e.target.value)} className="p-2 sm:p-2.5 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl flex-1 text-xs focus:outline-none focus:border-[#ff9f43]" />
                    <input type="number" placeholder={`+${settings.currencySymbol} 0.00`} value={modPrice} onChange={e => setModPrice(e.target.value)} className="p-2 sm:p-2.5 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl w-20 sm:w-24 text-xs focus:outline-none focus:border-[#ff9f43]" />
                    <button onClick={() => { if(modName) { setTempMods(prev => [...prev, { name: modName, priceDelta: parseFloat(modPrice) || 0 }]); setModName(''); setModPrice(''); } }} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 sm:px-4 rounded-lg sm:rounded-xl font-bold transition text-[10px] sm:text-xs">Add</button>
                  </div>
                  <div className="flex flex-col gap-2 max-h-32 overflow-y-auto">
                    {tempMods.map((mod, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-gray-50 p-2 sm:p-2.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs border border-gray-200 font-medium">
                        <span>{mod.name} <span className="text-[#10b981] font-bold">+{settings.currencySymbol}{mod.priceDelta.toFixed(2)}</span></span>
                        <button onClick={() => setTempMods(prev => prev.filter((_, i) => i !== idx))} className="text-red-500 font-bold px-2 py-1">✕</button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 sm:gap-3 pt-2">
                  <button onClick={resetForm} className="flex-1 py-2 sm:py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold transition text-xs sm:text-sm">Cancel</button>
                  <button onClick={handleSaveProduct} className="flex-1 py-2 sm:py-2.5 bg-[#ff9f43] hover:bg-orange-500 text-white rounded-lg font-bold transition text-xs sm:text-sm shadow-md">Save Data</button>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 1: FULL DASHBOARD REPLICA ================= */}
          {activeTab === 'dashboard' && (
            <div className="flex flex-col gap-6 max-w-[1500px] mx-auto pb-10">
              
              {/* Header Title & Date Picker */}
              <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-3 mb-2">
                <div>
                  <h1 className="text-[24px] sm:text-[28px] font-bold text-[#0f172a] leading-tight">Welcome, Admin</h1>
                  <p className="text-xs sm:text-sm text-gray-500 mt-0.5">You have <span className="text-[#ff9f43] font-bold">{cloudStats.orders}+ Orders</span> today</p>
                </div>
                <div className="bg-white border border-gray-200 text-gray-600 text-xs sm:text-[13px] font-medium px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg shadow-sm flex items-center justify-center gap-2 cursor-pointer hover:bg-gray-50 transition w-full sm:w-auto">
                  <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                  01 Jan 2026 - 31 Dec 2026
                </div>
              </div>

              {/* Alert Banner */}
              <div className="bg-[#fff5ec] border border-[#ffecd9] text-orange-800 px-4 py-3 rounded-lg text-xs sm:text-[13px] font-medium flex items-center justify-between shadow-sm relative gap-4">
                <div className="flex items-start sm:items-center gap-2">
                  <svg className="w-4 h-4 text-[#ff9f43] mt-0.5 sm:mt-0 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  <span className="leading-snug">Cloud Database Live. Viewing <span className="font-bold text-[#ff9f43]">{cloudStats.itemsSold}</span> items sold across all global POS terminals. <span className="underline cursor-pointer font-bold block sm:inline mt-1 sm:mt-0" onClick={fetchCloudData}>{loadingCloud ? 'Syncing...' : 'Refresh Sync'}</span></span>
                </div>
              </div>

              {/* 4 Colored KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
                <div className="bg-[#ff9f43] rounded-[14px] p-5 sm:p-6 text-white flex items-center gap-4 shadow-[0_4px_15px_rgba(255,159,67,0.2)]">
                  <div className="bg-white/20 p-3 rounded-xl hidden sm:block"><svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg></div>
                  <div className="flex flex-col">
                    <p className="text-[11px] sm:text-[12px] font-medium opacity-90 mb-1 tracking-wide">Total Cloud Sales</p>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl sm:text-[22px] font-extrabold truncate">{settings.currencySymbol}{cloudStats.gross.toLocaleString(undefined, {minimumFractionDigits:2})}</h3>
                      <span className="text-[9px] bg-white text-[#ff9f43] px-1.5 py-0.5 rounded font-black flex items-center shadow-sm shrink-0">↑ 22%</span>
                    </div>
                  </div>
                </div>

                <div className="bg-[#0f172a] rounded-[14px] p-5 sm:p-6 text-white flex items-center gap-4 shadow-[0_4px_15px_rgba(15,23,42,0.2)]">
                  <div className="bg-white/10 p-3 rounded-xl hidden sm:block"><svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg></div>
                  <div className="flex flex-col">
                    <p className="text-[11px] sm:text-[12px] font-medium opacity-90 mb-1 tracking-wide">Global Cloud Orders</p>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl sm:text-[22px] font-extrabold">{cloudStats.orders}</h3>
                      <span className="text-[9px] bg-white text-red-500 px-1.5 py-0.5 rounded font-black flex items-center shadow-sm shrink-0">↓ 5%</span>
                    </div>
                  </div>
                </div>

                <div className="bg-[#10b981] rounded-[14px] p-5 sm:p-6 text-white flex items-center gap-4 shadow-[0_4px_15px_rgba(16,185,129,0.2)]">
                  <div className="bg-white/20 p-3 rounded-xl hidden sm:block"><svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg></div>
                  <div className="flex flex-col">
                    <p className="text-[11px] sm:text-[12px] font-medium opacity-90 mb-1 tracking-wide">Local Terminal Sales</p>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl sm:text-[22px] font-extrabold truncate">{settings.currencySymbol}{stats.gross.toLocaleString(undefined, {minimumFractionDigits:2})}</h3>
                      <span className="text-[9px] bg-white text-[#10b981] px-1.5 py-0.5 rounded font-black flex items-center shadow-sm shrink-0">↑ 12%</span>
                    </div>
                  </div>
                </div>

                <div className="bg-[#3b82f6] rounded-[14px] p-5 sm:p-6 text-white flex items-center gap-4 shadow-[0_4px_15px_rgba(59,130,246,0.2)]">
                  <div className="bg-white/20 p-3 rounded-xl hidden sm:block"><svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg></div>
                  <div className="flex flex-col">
                    <p className="text-[11px] sm:text-[12px] font-medium opacity-90 mb-1 tracking-wide">Global Net Profit</p>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl sm:text-[22px] font-extrabold truncate">{settings.currencySymbol}{cloudStats.profit.toLocaleString(undefined, {minimumFractionDigits:2})}</h3>
                      <span className="text-[9px] bg-white text-[#3b82f6] px-1.5 py-0.5 rounded font-black flex items-center shadow-sm shrink-0">↑ 35%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4 White Sub-Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
                {[
                  { title: 'Avg Order Value', val: cloudStats.aov, iconBg: 'bg-cyan-50', iconCol: 'text-cyan-500', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6', perc: '+35%', pCol: 'text-green-500' },
                  { title: 'Total Local Cost', val: stats.totalCost, iconBg: 'bg-emerald-50', iconCol: 'text-emerald-500', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', perc: '-19%', pCol: 'text-red-500' },
                  { title: 'Total Local Tax', val: stats.tax, iconBg: 'bg-orange-50', iconCol: 'text-orange-500', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', perc: '+41%', pCol: 'text-green-500' },
                  { title: 'Items Sold globally', val: cloudStats.itemsSold, prefix: 'none', iconBg: 'bg-purple-50', iconCol: 'text-purple-500', icon: 'M7 20l4-16m2 16l4-16M6 9h14M4 15h14', perc: '-20%', pCol: 'text-red-500' }
                ].map((c, i) => (
                  <div key={i} className="bg-white rounded-[14px] p-4 sm:p-5 shadow-sm border border-gray-100 flex flex-col justify-between h-[130px] sm:h-[140px]">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg sm:text-[20px] font-black text-gray-800 tracking-tight truncate">{c.prefix === 'none' ? '' : settings.currencySymbol}{c.val.toLocaleString(undefined, {minimumFractionDigits: c.prefix === 'none' ? 0 : 2})}</h3>
                        <p className="text-[10px] sm:text-[12px] text-gray-500 font-medium mt-0.5">{c.title}</p>
                      </div>
                      <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg ${c.iconBg} ${c.iconCol} flex items-center justify-center shrink-0`}>
                        <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={c.icon}></path></svg>
                      </div>
                    </div>
                    <div className="flex justify-between items-center mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-gray-50">
                      <span className={`text-[10px] sm:text-[11px] font-bold ${c.pCol}`}>{c.perc} <span className="text-gray-400 font-medium">vs Last Month</span></span>
                      <button className="text-[10px] sm:text-[11px] font-bold text-gray-800 hover:text-[#ff9f43] transition border-b border-dashed border-gray-400 pb-0.5">View All</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Chart & Info Row */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                
                {/* Simulated CSS Bar Chart */}
                <div className="bg-white rounded-[14px] shadow-sm border border-gray-100 xl:col-span-2 p-4 sm:p-6 flex flex-col overflow-hidden">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-6">
                    <h2 className="text-[14px] sm:text-[15px] font-bold text-gray-800 flex items-center gap-2">
                      <span className="text-[#ff9f43] bg-[#fff5ec] p-1.5 rounded-lg"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg></span> 
                      Sales & Purchase Flow
                    </h2>
                    <div className="flex gap-1 text-[10px] sm:text-[11px] font-bold text-gray-500 bg-gray-50 p-1 rounded-lg border border-gray-100 overflow-x-auto scrollbar-none">
                      <button className="px-2 sm:px-3 py-1 rounded hover:bg-white hover:shadow-sm transition">1D</button>
                      <button className="px-2 sm:px-3 py-1 rounded hover:bg-white hover:shadow-sm transition">1W</button>
                      <button className="px-2 sm:px-3 py-1 rounded hover:bg-white hover:shadow-sm transition">1M</button>
                      <button className="px-2 sm:px-3 py-1 bg-[#ff9f43] text-white shadow-sm rounded">6M</button>
                      <button className="px-2 sm:px-3 py-1 rounded hover:bg-white hover:shadow-sm transition">1Y</button>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 mb-6 sm:mb-8">
                    <div className="border border-gray-100 rounded-lg p-3 bg-gray-50/50 w-full sm:w-40 flex-1 sm:flex-none">
                      <p className="text-[10px] text-gray-400 font-bold uppercase flex items-center gap-1.5 mb-1"><span className="w-2 h-2 rounded-full bg-[#ffcdb2]"></span> Local Sales Vol</p>
                      <p className="text-lg sm:text-xl font-black text-gray-800">{stats.orders}</p>
                    </div>
                    <div className="border border-gray-100 rounded-lg p-3 bg-gray-50/50 w-full sm:w-40 flex-1 sm:flex-none">
                      <p className="text-[10px] text-gray-400 font-bold uppercase flex items-center gap-1.5 mb-1"><span className="w-2 h-2 rounded-full bg-[#ff9f43]"></span> Cloud Sales Vol</p>
                      <p className="text-lg sm:text-xl font-black text-gray-800">{cloudStats.orders}</p>
                    </div>
                  </div>
                  
                  {/* Visual Bar Chart rendering daily cloud stats */}
                  <div className="flex-1 flex items-end justify-between gap-1 sm:gap-2 h-32 sm:h-40 border-b border-gray-100 pb-2 relative mt-4 sm:mt-0 min-w-[300px] overflow-x-auto scrollbar-none pl-8 sm:pl-0">
                    <div className="absolute left-0 sm:-left-6 top-0 bottom-0 flex flex-col justify-between text-[8px] sm:text-[9px] text-gray-400 font-medium py-2 z-10 bg-white sm:bg-transparent pr-1">
                      <span>60K</span><span>40K</span><span>20K</span><span>0K</span>
                    </div>
                    {cloudStats.daily.slice(-12).map(([date, d]: any, idx) => {
                      const h1 = Math.min(100, Math.max(10, (d.orders * 5))); 
                      const h2 = Math.min(100, Math.max(10, (d.gross / 100)));
                      return (
                        <div key={idx} className="flex flex-col items-center flex-1 group min-w-[20px] sm:min-w-0">
                          <div className="w-4 sm:w-8 flex flex-col justify-end h-full relative cursor-pointer">
                            <div className="w-full bg-[#ffcdb2] rounded-t-sm absolute bottom-0 transition-all group-hover:brightness-95" style={{height: `${h1}%`}}></div>
                            <div className="w-full bg-[#ff9f43] rounded-t-sm absolute bottom-0 transition-all group-hover:brightness-90 shadow-sm" style={{height: `${h2}%`}}></div>
                          </div>
                          <span className="text-[8px] sm:text-[9px] text-gray-400 font-medium mt-2 sm:mt-3 whitespace-nowrap -ml-2 sm:ml-0">{date.split('/')[1]}/{date.split('/')[0]}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Overall Info & Customer Donut */}
                <div className="flex flex-col gap-6">
                  <div className="bg-white rounded-[14px] shadow-sm border border-gray-100 p-4 sm:p-6">
                    <h2 className="text-[14px] sm:text-[15px] font-bold text-gray-800 flex items-center gap-2 mb-4 sm:mb-6">
                      <span className="text-blue-500 bg-blue-50 p-1.5 rounded-lg"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></span> 
                      Overall Information
                    </h2>
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                      <div className="flex-1 flex flex-row sm:flex-col items-center sm:justify-center bg-[#f8f9fa] rounded-xl border border-gray-100 p-3 sm:py-4 shadow-sm hover:shadow transition cursor-default gap-3 sm:gap-0">
                        <svg className="w-5 h-5 sm:w-6 sm:h-6 text-blue-500 sm:mb-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                        <span className="text-[11px] font-bold text-gray-500 sm:mb-1 flex-1 sm:flex-none">Staff Users</span>
                        <span className="text-[16px] sm:text-[18px] font-black text-gray-800">{users.length}</span>
                      </div>
                      <div className="flex-1 flex flex-row sm:flex-col items-center sm:justify-center bg-[#f8f9fa] rounded-xl border border-gray-100 p-3 sm:py-4 shadow-sm hover:shadow transition cursor-default gap-3 sm:gap-0">
                        <svg className="w-5 h-5 sm:w-6 sm:h-6 text-orange-500 sm:mb-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                        <span className="text-[11px] font-bold text-gray-500 sm:mb-1 flex-1 sm:flex-none">Customers</span>
                        <span className="text-[16px] sm:text-[18px] font-black text-gray-800">4,896</span>
                      </div>
                      <div className="flex-1 flex flex-row sm:flex-col items-center sm:justify-center bg-[#f8f9fa] rounded-xl border border-gray-100 p-3 sm:py-4 shadow-sm hover:shadow transition cursor-default gap-3 sm:gap-0">
                        <svg className="w-5 h-5 sm:w-6 sm:h-6 text-teal-500 sm:mb-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                        <span className="text-[11px] font-bold text-gray-500 sm:mb-1 flex-1 sm:flex-none">Cloud Orders</span>
                        <span className="text-[16px] sm:text-[18px] font-black text-gray-800">{cloudStats.orders}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-[14px] shadow-sm border border-gray-100 p-4 sm:p-6 flex-1 flex flex-col">
                    <div className="flex justify-between items-center mb-4 sm:mb-6">
                      <h2 className="text-[14px] sm:text-[15px] font-bold text-gray-800">Customers Overview</h2>
                      <div className="text-[10px] sm:text-[11px] font-bold text-gray-500 border border-gray-200 px-2 py-1 rounded bg-gray-50 flex items-center gap-1 cursor-pointer">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg> Today
                      </div>
                    </div>
                    <div className="flex flex-row sm:items-center justify-between flex-1 gap-4 sm:gap-0">
                      <div className="relative w-16 h-16 sm:w-24 sm:h-24 rounded-full flex items-center justify-center shadow-sm shrink-0" style={{background: 'conic-gradient(#ff9f43 0% 55%, #10b981 55% 100%)'}}>
                        <div className="w-10 h-10 sm:w-16 sm:h-16 bg-white rounded-full"></div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3 sm:gap-6 pr-2">
                        <div>
                          <h3 className="text-[16px] sm:text-[20px] font-black text-gray-800 leading-none">5.5K</h3>
                          <p className="text-[10px] sm:text-[11px] font-bold text-[#ff9f43] mt-1 mb-1 sm:mb-2">First Time</p>
                          <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-black inline-block">↗ 25%</span>
                        </div>
                        <div>
                          <h3 className="text-[16px] sm:text-[20px] font-black text-gray-800 leading-none">3.5K</h3>
                          <p className="text-[10px] sm:text-[11px] font-bold text-[#10b981] mt-1 mb-1 sm:mb-2">Return</p>
                          <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-black inline-block">↗ 21%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Lists Row: Top Selling, Low Stock, Recent Sales */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* TOP SELLING PRODUCTS */}
                <div className="bg-white rounded-[14px] shadow-sm border border-gray-100 p-4 sm:p-5 flex flex-col h-[300px] sm:h-[350px]">
                  <div className="flex justify-between items-center mb-4 border-b border-gray-50 pb-3">
                    <h2 className="text-[13px] sm:text-[14px] font-bold text-gray-800 flex items-center gap-2">
                      <span className="text-pink-500 bg-pink-50 p-1.5 rounded-lg text-[10px] sm:text-xs">📦</span> Top Selling Products
                    </h2>
                    <div className="text-[10px] sm:text-[11px] font-bold text-gray-500 border border-gray-200 px-2 py-1 rounded bg-gray-50 flex items-center gap-1 cursor-pointer">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg> Today
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-2 sm:gap-3">
                    {cloudStats.topItems.map(([name, data]: any, idx) => {
                      const item = menuItems.find(m => m.name === name);
                      return (
                        <div key={idx} className="flex justify-between items-center bg-gray-50/50 hover:bg-gray-50 p-2 rounded-lg transition border border-transparent hover:border-gray-100">
                          <div className="flex items-center gap-2 sm:gap-3 overflow-hidden">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white border border-gray-200 rounded-lg flex items-center justify-center overflow-hidden shadow-sm shrink-0">
                              {item?.image ? <img src={item.image} className="w-full h-full object-cover"/> : <span className="text-[10px] sm:text-xs">☕</span>}
                            </div>
                            <div className="flex flex-col overflow-hidden">
                              <span className="text-[12px] sm:text-[13px] font-bold text-gray-800 truncate">{name}</span>
                              <span className="text-[10px] sm:text-[11px] text-gray-500 font-medium truncate">{settings.currencySymbol}{(data.rev/data.qty).toFixed(2)} • {data.qty}+ Sales</span>
                            </div>
                          </div>
                          <span className={`text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded font-black border shrink-0 ml-2 ${idx < 2 ? 'bg-green-50 text-green-600 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                            {idx < 2 ? '↑ 25%' : '↓ 12%'}
                          </span>
                        </div>
                      )
                    })}
                    {cloudStats.topItems.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No data yet.</p>}
                  </div>
                </div>

                {/* LOW STOCK PRODUCTS (Mocked from Menu Items) */}
                <div className="bg-white rounded-[14px] shadow-sm border border-gray-100 p-4 sm:p-5 flex flex-col h-[300px] sm:h-[350px]">
                  <div className="flex justify-between items-center mb-4 border-b border-gray-50 pb-3">
                    <h2 className="text-[13px] sm:text-[14px] font-bold text-gray-800 flex items-center gap-2">
                      <span className="text-red-500 bg-red-50 p-1.5 rounded-lg text-[10px] sm:text-xs">⚠️</span> Low Stock Products
                    </h2>
                    <span className="text-[10px] sm:text-[11px] font-bold text-gray-800 hover:text-[#ff9f43] transition cursor-pointer underline decoration-gray-300">View All</span>
                  </div>
                  <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-2 sm:gap-3">
                    {menuItems.slice(0, 5).map((item, idx) => {
                      const stockMock = [8, 14, 21, 12, 10][idx] || 5;
                      return (
                        <div key={idx} className="flex justify-between items-center bg-gray-50/50 hover:bg-gray-50 p-2 rounded-lg transition border border-transparent hover:border-gray-100">
                          <div className="flex items-center gap-2 sm:gap-3 overflow-hidden">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white border border-gray-200 rounded-lg flex items-center justify-center overflow-hidden shadow-sm shrink-0">
                              {item.image ? <img src={item.image} className="w-full h-full object-cover"/> : <span className="text-[10px] sm:text-xs">☕</span>}
                            </div>
                            <div className="flex flex-col overflow-hidden">
                              <span className="text-[12px] sm:text-[13px] font-bold text-gray-800 truncate">{item.name}</span>
                              <span className="text-[10px] sm:text-[11px] text-gray-500 font-medium">ID: #{item.productId.slice(-6)}</span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end shrink-0 ml-2">
                            <span className="text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase">Instock</span>
                            <span className={`text-[12px] sm:text-[14px] font-black ${stockMock < 10 ? 'text-red-500' : 'text-orange-500'}`}>{stockMock < 10 ? `0${stockMock}` : stockMock}</span>
                          </div>
                        </div>
                      )
                    })}
                    {menuItems.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Add products first.</p>}
                  </div>
                </div>

                {/* RECENT SALES (Cloud Tickets Status) */}
                <div className="bg-white rounded-[14px] shadow-sm border border-gray-100 p-4 sm:p-5 flex flex-col h-[300px] sm:h-[350px]">
                  <div className="flex justify-between items-center mb-4 border-b border-gray-50 pb-3">
                    <h2 className="text-[13px] sm:text-[14px] font-bold text-gray-800 flex items-center gap-2">
                      <span className="text-purple-500 bg-purple-50 p-1.5 rounded-lg text-[10px] sm:text-xs">📄</span> Recent Sales
                    </h2>
                    <div className="text-[10px] sm:text-[11px] font-bold text-gray-500 border border-gray-200 px-2 py-1 rounded bg-gray-50 flex items-center gap-1 cursor-pointer">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg> Weekly
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-2 sm:gap-3">
                    {cloudTickets.slice(0, 5).map((ticket) => {
                      const isVoided = ticket.status === 'VOIDED';
                      const firstItem = ticket.items?.[0]?.name || 'Custom Order';
                      return (
                        <div key={ticket.id} className="flex justify-between items-center bg-gray-50/50 hover:bg-gray-50 p-2 rounded-lg transition border border-transparent hover:border-gray-100">
                          <div className="flex items-center gap-2 sm:gap-3 overflow-hidden">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white border border-gray-200 rounded-lg flex items-center justify-center shadow-sm shrink-0">
                              <span className="text-[10px] sm:text-xs">{isVoided ? '🚫' : '🛍️'}</span>
                            </div>
                            <div className="flex flex-col overflow-hidden">
                              <span className="text-[12px] sm:text-[13px] font-bold text-gray-800 truncate">{firstItem}</span>
                              <span className="text-[10px] sm:text-[11px] text-gray-500 font-medium">Ticket: {settings.currencySymbol}{ticket.grossTotal?.toFixed(2)}</span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                            <span className="text-[8px] sm:text-[9px] font-bold text-gray-400">{ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString() : 'Today'}</span>
                            <span className={`text-[8px] sm:text-[9px] px-1.5 py-0.5 rounded font-black uppercase ${isVoided ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                              {isVoided ? '• Cancelled' : '• Completed'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                    {cloudTickets.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No sales recorded.</p>}
                  </div>
                </div>

              </div>

              {/* Bottom Charts Row */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                
                {/* Sales Statics & Transactions */}
                <div className="bg-white rounded-[14px] shadow-sm border border-gray-100 xl:col-span-2 flex flex-col lg:flex-row overflow-hidden min-h-[350px]">
                  {/* Left Side: Sales Statics Chart */}
                  <div className="flex-1 p-4 sm:p-6 border-b lg:border-b-0 lg:border-r border-gray-50 flex flex-col">
                    <div className="flex justify-between items-center mb-4 sm:mb-6">
                      <h2 className="text-[13px] sm:text-[14px] font-bold text-gray-800 flex items-center gap-2">
                        <span className="text-red-500 bg-red-50 p-1.5 rounded-lg text-[10px] sm:text-xs">📉</span> Sales Statics
                      </h2>
                      <div className="text-[10px] sm:text-[11px] font-bold text-gray-500 border border-gray-200 px-2 py-1 rounded bg-gray-50 flex items-center gap-1 cursor-pointer">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg> 2026
                      </div>
                    </div>
                    <div className="flex gap-4 sm:gap-6 mb-6 sm:mb-8">
                      <div>
                        <h3 className="text-lg sm:text-xl font-black text-teal-500 flex items-center gap-2 flex-wrap">
                          {settings.currencySymbol}{cloudStats.gross.toLocaleString(undefined, {minimumFractionDigits:0})} 
                          <span className="text-[8px] sm:text-[9px] bg-teal-100 text-teal-700 px-1 py-0.5 rounded">↗ 25%</span>
                        </h3>
                        <p className="text-[10px] sm:text-[11px] text-gray-400 font-bold mt-1">Revenue</p>
                      </div>
                      <div>
                        <h3 className="text-lg sm:text-xl font-black text-orange-500 flex items-center gap-2 flex-wrap">
                          {settings.currencySymbol}{cloudStats.totalCost.toLocaleString(undefined, {minimumFractionDigits:0})} 
                          <span className="text-[8px] sm:text-[9px] bg-red-100 text-red-700 px-1 py-0.5 rounded">↘ 25%</span>
                        </h3>
                        <p className="text-[10px] sm:text-[11px] text-gray-400 font-bold mt-1">Expense</p>
                      </div>
                    </div>
                    {/* Mock Dual Bar Chart */}
                    <div className="flex-1 flex items-center justify-between gap-1 h-32 relative pt-2 min-w-[250px] overflow-x-auto scrollbar-none">
                      <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-[8px] sm:text-[9px] text-gray-400 font-medium h-full bg-white pr-1 z-10">
                        <span>30K</span><span>20K</span><span>10K</span><span>0K</span><span>-10K</span><span>-20K</span>
                      </div>
                      {cloudStats.daily.slice(-8).map(([d, val]: any, i) => (
                        <div key={i} className="flex flex-col items-center justify-center h-full gap-0.5 sm:gap-1 ml-6 sm:ml-4 group shrink-0">
                          <div className="w-2 sm:w-3 bg-teal-500 rounded-sm transition-all group-hover:bg-teal-400" style={{height: `${Math.max(10, (val.gross/100))}%`}}></div>
                          <div className="w-2 sm:w-3 bg-orange-500 rounded-sm transition-all group-hover:bg-orange-400" style={{height: `${Math.max(10, (val.cost/100))}%`}}></div>
                          <span className="text-[8px] sm:text-[9px] text-gray-400 mt-2 absolute -bottom-5 opacity-0 group-hover:opacity-100 transition">{d.split('/')[0]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Right Side: Recent Transactions Table with Void Button */}
                  <div className="flex-1 p-4 sm:p-6 flex flex-col w-full overflow-hidden">
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-[13px] sm:text-[14px] font-bold text-gray-800 flex items-center gap-2">
                        <span className="text-orange-500 bg-orange-50 p-1.5 rounded-lg text-[10px] sm:text-xs">📜</span> Recent Transactions
                      </h2>
                      <span className="text-[10px] sm:text-[11px] font-bold text-gray-800 hover:text-[#ff9f43] transition cursor-pointer underline decoration-gray-300">View All</span>
                    </div>
                    <div className="flex gap-3 sm:gap-4 border-b border-gray-100 pb-2 mb-3 overflow-x-auto scrollbar-none">
                      <button className="text-[10px] sm:text-[11px] font-bold text-orange-500 border-b-2 border-orange-500 pb-1 whitespace-nowrap">Sale</button>
                      <button className="text-[10px] sm:text-[11px] font-bold text-gray-400 hover:text-gray-600 transition whitespace-nowrap">Purchase</button>
                      <button className="text-[10px] sm:text-[11px] font-bold text-gray-400 hover:text-gray-600 transition whitespace-nowrap">Quotation</button>
                    </div>
                    
                    <div className="flex-1 overflow-auto custom-scrollbar -mr-2 pr-2">
                      <table className="w-full text-left min-w-[300px]">
                        <thead>
                          <tr className="text-[9px] sm:text-[10px] text-gray-400 uppercase tracking-wider">
                            <th className="pb-2 sm:pb-3 font-bold">Date/Source</th><th className="pb-2 sm:pb-3 font-bold text-center">Status</th><th className="pb-2 sm:pb-3 font-bold text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="text-[10px] sm:text-xs">
                          {cloudTickets.slice(0, 5).map(t => {
                            const isVoid = t.status === 'VOIDED';
                            return(
                            <tr key={t.id} className={`border-b border-gray-50 last:border-0 transition ${isVoid?'bg-red-50/40':'hover:bg-gray-50'}`}>
                              <td className="py-2">
                                <span className="block font-bold text-gray-800 truncate max-w-[80px] sm:max-w-[120px]">{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : ''}</span>
                                <span className="text-[9px] sm:text-[10px] text-gray-500 font-medium">#{t.ticketId?.slice(-6) || t.id.slice(-6)}</span>
                              </td>
                              <td className="py-2 text-center">
                                {!isVoid ? (
                                  <div className="flex flex-col items-center gap-1">
                                    <span className="text-[8px] sm:text-[9px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded font-black uppercase inline-block">• Completed</span>
                                    <button onClick={() => handleVoidCloudTicket(t.id, t.ticketId)} className="text-[8px] sm:text-[9px] bg-white border border-red-200 text-red-500 hover:bg-red-50 px-2 py-0.5 rounded font-bold transition shadow-sm">Void</button>
                                  </div>
                                ) : (
                                  <span className="text-[8px] sm:text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-black uppercase inline-block">• Cancelled</span>
                                )}
                              </td>
                              <td className={`py-2 text-right font-black ${isVoid?'text-gray-400 line-through':'text-gray-800'}`}>
                                {settings.currencySymbol}{t.grossTotal?.toFixed(2)}
                              </td>
                            </tr>
                          )})}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Top Categories Donut & Order Stats Grid */}
                <div className="flex flex-col gap-6">
                  {/* Category Donut */}
                  <div className="bg-white rounded-[14px] shadow-sm border border-gray-100 p-4 sm:p-6 flex-1 flex flex-col">
                    <div className="flex justify-between items-center mb-4 sm:mb-6">
                      <h2 className="text-[13px] sm:text-[14px] font-bold text-gray-800 flex items-center gap-2">
                        <span className="text-pink-500 bg-pink-50 p-1.5 rounded-lg text-[10px] sm:text-xs">📊</span> Top Categories
                      </h2>
                      <div className="text-[10px] sm:text-[11px] font-bold text-gray-500 border border-gray-200 px-2 py-1 rounded bg-gray-50 flex items-center gap-1 cursor-pointer">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg> Weekly
                      </div>
                    </div>
                    <div className="flex flex-row items-center gap-4 sm:gap-6 flex-1 justify-center sm:justify-start">
                      {/* CSS Donut representation for Categories */}
                      <div className="relative w-20 h-20 sm:w-28 sm:h-28 rounded-full flex items-center justify-center shadow-sm shrink-0" style={{background: 'conic-gradient(#ff9f43 0% 45%, #1e293b 45% 75%, #10b981 75% 100%)'}}>
                        <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white rounded-full"></div>
                      </div>
                      <div className="flex flex-col gap-2">
                        {cloudStats.categories.slice(0,3).map(([cName, cQty]: any, i) => (
                          <div key={i} className="flex flex-col">
                            <span className="text-[9px] sm:text-[10px] text-gray-500 font-bold uppercase flex items-center gap-1.5 truncate max-w-[100px] sm:max-w-[120px]"><span className={`w-2 h-2 shrink-0 rounded-full ${i===0?'bg-[#ff9f43]':i===1?'bg-[#1e293b]':'bg-[#10b981]'}`}></span> {cName}</span>
                            <span className="text-[11px] sm:text-[13px] font-black text-gray-800 pl-3.5">{cQty} Sales</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="border-t border-gray-100 pt-3 mt-4 flex flex-col gap-1.5 text-[10px] sm:text-[11px] font-bold text-gray-600">
                      <div className="flex justify-between items-center"><span>• Total Categories</span><span className="font-black text-gray-800">{categoryList.length}</span></div>
                      <div className="flex justify-between items-center"><span>• Total Products</span><span className="font-black text-gray-800">{menuItems.length}</span></div>
                    </div>
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* ================= TAB 2: PRODUCTS MANAGER ================= */}
          {activeTab === 'products' && (
            <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 max-w-[1400px] mx-auto h-full flex flex-col">
              <div className="flex justify-between items-center mb-4 sm:mb-6">
                <h2 className="text-lg sm:text-xl font-bold text-gray-800">Inventory Manager</h2>
                <button onClick={() => { resetForm(); setShowAddModal(true); }} className="bg-[#ff9f43] text-white px-3 sm:px-4 py-2 rounded-lg text-[10px] sm:text-xs font-bold shadow-sm">+ Add New</button>
              </div>
              <div className="overflow-auto flex-1 custom-scrollbar">
                <table className="w-full text-left min-w-[400px]">
                  <thead className="sticky top-0 bg-white shadow-[0_1px_0_0_#f3f4f6]">
                    <tr className="text-[9px] sm:text-[10px] text-gray-400 uppercase font-bold tracking-wider">
                      <th className="py-2 sm:py-3 px-2">Item</th><th className="py-2 sm:py-3 px-2">Price</th><th className="py-2 sm:py-3 px-2">Cost</th><th className="py-2 sm:py-3 px-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-xs sm:text-sm font-semibold">
                    {menuItems.map((item) => (
                      <tr key={item.productId} className="hover:bg-gray-50">
                        <td className="py-2 sm:py-3 px-2 flex items-center gap-2 sm:gap-3">
                          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center text-[10px] sm:text-xs border border-gray-200">{item.image ? <img src={item.image} className="w-full h-full object-cover"/> : "☕"}</div>
                          <span className="truncate max-w-[100px] sm:max-w-[200px]">{item.name}</span>
                        </td>
                        <td className="py-2 sm:py-3 px-2 text-orange-600 font-bold">{settings.currencySymbol}{item.price.toFixed(2)}</td>
                        <td className="py-2 sm:py-3 px-2 text-gray-500">{settings.currencySymbol}{(item.cost || 0).toFixed(2)}</td>
                        <td className="py-2 sm:py-3 px-2 text-right space-x-1 sm:space-x-2 whitespace-nowrap">
                          <button onClick={() => openEditModal(item)} className="text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-[11px] font-bold">Edit</button>
                          <button onClick={() => handleDeleteProduct(item.productId)} className="text-red-500 bg-red-50 hover:bg-red-100 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-[11px] font-bold">Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================= TAB 3: LOCAL REPORTS ================= */}
          {activeTab === 'reports' && (
             <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 max-w-[1400px] mx-auto h-full flex flex-col">
               <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4 sm:mb-6">
                 <div>
                   <h2 className="text-lg sm:text-xl font-bold text-gray-800">Local POS Ticket History</h2>
                   <p className="text-[10px] sm:text-xs text-gray-500 mt-1">Raw transactions recorded strictly on this specific terminal device.</p>
                 </div>
                 <button onClick={handleSync} disabled={isSyncing} className="bg-[#10b981] text-white px-3 sm:px-4 py-2 rounded-lg text-[10px] sm:text-xs font-bold shadow-sm flex items-center justify-center gap-2 w-full sm:w-auto shrink-0">
                   {isSyncing ? 'Syncing...' : 'Force Sync to Cloud'}
                 </button>
               </div>
               <div className="overflow-auto flex-1 custom-scrollbar">
                 <table className="w-full text-left min-w-[500px]">
                   <thead className="sticky top-0 bg-white shadow-[0_1px_0_0_#f3f4f6]">
                     <tr className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                       <th className="py-2 sm:py-3 px-2">Ticket Info</th><th className="py-2 sm:py-3 px-2">Customer & Staff</th><th className="py-2 sm:py-3 px-2 text-right">Amount</th><th className="py-2 sm:py-3 px-2 text-center">Status</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-gray-50 text-[10px] sm:text-xs">
                     {tickets.length === 0 ? <tr><td colSpan={4} className="text-center py-6 text-gray-400 font-medium">No tickets found on this device.</td></tr> : 
                       tickets.map(ticket => (
                       <tr key={ticket.ticketId} className="hover:bg-gray-50">
                         <td className="py-2 sm:py-3 px-2">
                           <span className="font-mono text-[10px] sm:text-[11px] font-bold text-gray-700 block max-w-[120px] sm:max-w-[180px] truncate">{ticket.ticketId}</span>
                           <span className="text-[9px] sm:text-[10px] text-gray-400">{new Date(ticket.createdAt).toLocaleString()}</span>
                         </td>
                         <td className="py-2 sm:py-3 px-2 font-medium text-gray-600">
                           {ticket.customerName && <span className="block font-bold text-gray-800">👤 {ticket.customerName} {ticket.tableNumber && `(T: ${ticket.tableNumber})`}</span>}
                           <span className="truncate block max-w-[120px]">👨‍🍳 Waiter: {ticket.waiterName || 'N/A'}</span>
                         </td>
                         <td className="py-2 sm:py-3 px-2 font-black text-right text-gray-800 text-xs sm:text-sm">{settings.currencySymbol}{ticket.grossTotal.toFixed(2)}</td>
                         <td className="py-2 sm:py-3 px-2 text-center">
                           <span className={`text-[8px] sm:text-[9px] px-1.5 sm:px-2 py-0.5 sm:py-1 rounded font-bold uppercase tracking-wider ${ticket.status === 'SYNCED' ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'bg-[#fff5ec] text-[#ff9f43] border border-[#ffecd9]'}`}>{ticket.status}</span>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             </div>
          )}

          {/* ================= TAB 4: STAFF MANAGEMENT ================= */}
          {activeTab === 'staff' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-start max-w-[1400px] mx-auto pb-8">
              <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100">
                 <h2 className="text-base sm:text-lg font-bold text-gray-800 mb-4 sm:mb-6">Create Employee Profile</h2>
                 <div className="flex flex-col gap-3 sm:gap-4">
                    <input type="text" placeholder="Employee Name" value={newUsername} onChange={e => setNewUsername(e.target.value)} className="w-full p-2.5 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg text-[13px] sm:text-sm focus:outline-none focus:border-[#ff9f43] font-medium" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                       <input type="password" placeholder="4-Digit PIN" value={newPin} onChange={e => setNewPin(e.target.value)} className="w-full p-2.5 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg text-[13px] sm:text-sm focus:outline-none focus:border-[#ff9f43] font-medium" />
                       <select value={newRole} onChange={e => setNewRole(e.target.value)} className="w-full p-2.5 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg text-[13px] sm:text-sm focus:outline-none focus:border-[#ff9f43] font-medium text-gray-700">
                         <option value="employee">Employee (POS Only)</option>
                         <option value="admin">Admin (Full Access)</option>
                       </select>
                    </div>
                    <button onClick={handleCreateUser} className="bg-[#0f172a] hover:bg-gray-800 text-white py-2.5 sm:py-3 rounded-lg font-bold mt-2 transition text-sm">Add Staff Member</button>
                 </div>
              </div>
              <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 h-full max-h-[500px] flex flex-col">
                 <h2 className="text-base sm:text-lg font-bold text-gray-800 mb-4 sm:mb-6 shrink-0">Active Staff Directory</h2>
                 <div className="flex flex-col gap-2 sm:gap-3 flex-1 overflow-y-auto custom-scrollbar pr-1">
                    {users.map(u => (
                      <div key={u.userId} className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-100 flex justify-between items-center">
                        <div className="flex flex-col">
                          <span className="font-bold text-gray-800 text-[13px] sm:text-sm">{u.username}</span>
                          <span className={`text-[9px] sm:text-[10px] font-bold uppercase mt-1 w-max px-1.5 sm:px-2 py-0.5 rounded ${u.role === 'admin' ? 'bg-[#fff5ec] text-[#ff9f43]' : 'bg-gray-200 text-gray-700'}`}>{u.role}</span>
                        </div>
                        <button onClick={() => handleDeleteUser(u.userId, u.role)} className="bg-white border border-gray-200 hover:border-red-500 text-red-500 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg font-bold text-[10px] sm:text-xs transition shadow-sm">Remove</button>
                      </div>
                    ))}
                 </div>
              </div>
            </div>
          )}

          {/* ================= TAB 5: SETTINGS & MAP ================= */}
          {activeTab === 'settings' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-start max-w-[1400px] mx-auto h-full pb-10">
              <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 w-full shrink-0">
                <h2 className="text-base sm:text-lg font-bold text-gray-800 mb-4 sm:mb-6">Store Configuration</h2>
                <div className="flex flex-col gap-4 sm:gap-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <label className="block text-[10px] sm:text-[11px] font-bold text-gray-500 uppercase mb-1.5">Store Name</label>
                      <input type="text" value={settings.storeName} onChange={e => setSettings({...settings, storeName: e.target.value})} className="w-full p-2.5 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg text-[13px] sm:text-sm font-medium focus:border-[#ff9f43] outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] sm:text-[11px] font-bold text-gray-500 uppercase mb-1.5">Branch</label>
                      <input type="text" value={settings.branchName} onChange={e => setSettings({...settings, branchName: e.target.value})} className="w-full p-2.5 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg text-[13px] sm:text-sm font-medium focus:border-[#ff9f43] outline-none" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <label className="block text-[10px] sm:text-[11px] font-bold text-gray-500 uppercase mb-1.5">Currency</label>
                      <input type="text" value={settings.currencySymbol} onChange={e => setSettings({...settings, currencySymbol: e.target.value})} className="w-full p-2.5 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg text-[13px] sm:text-sm font-medium text-center focus:border-[#ff9f43] outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] sm:text-[11px] font-bold text-gray-500 uppercase mb-1.5">Tax (%)</label>
                      <input type="number" value={settings.taxRate} onChange={e => setSettings({...settings, taxRate: parseFloat(e.target.value) || 0})} className="w-full p-2.5 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg text-[13px] sm:text-sm font-medium text-center focus:border-[#ff9f43] outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] sm:text-[11px] font-bold text-gray-500 uppercase mb-1.5">Categories (Comma Sep)</label>
                    <input type="text" value={settings.categories} onChange={e => setSettings({...settings, categories: e.target.value})} className="w-full p-2.5 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg text-[13px] sm:text-sm font-medium focus:border-[#ff9f43] outline-none" />
                  </div>
                  <button onClick={handleSaveSettings} className="w-full bg-[#10b981] hover:bg-emerald-600 text-white py-2.5 sm:py-3 rounded-lg text-[13px] sm:text-sm font-bold shadow-sm transition mt-1 sm:mt-0">Save All Settings</button>
                </div>
              </div>
              
              <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 w-full flex flex-col min-h-[400px] lg:h-full">
                <h2 className="text-base sm:text-lg font-bold text-gray-800 mb-4 sm:mb-6 shrink-0">Floor Plan Visualizer</h2>
                <div className="flex flex-col sm:flex-row gap-3 mb-4 shrink-0">
                  <input type="text" placeholder="Table Name" value={newTableName} onChange={e => setNewTableName(e.target.value)} className="w-full sm:flex-1 p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium outline-none focus:border-[#ff9f43]" />
                  <div className="flex gap-3">
                    <select value={newTableShape} onChange={e => setNewTableShape(e.target.value as any)} className="w-full sm:w-28 p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium outline-none">
                      <option value="rect">Square</option>
                      <option value="circle">Circle</option>
                    </select>
                    <button onClick={addTable} className="bg-[#0f172a] text-white px-5 rounded-lg font-bold text-sm shadow-sm whitespace-nowrap">Add</button>
                  </div>
                </div>
                
                <div ref={canvasRef} onMouseMove={onDragMove} onTouchMove={onDragMove} onMouseUp={endDrag} onTouchEnd={endDrag} onMouseLeave={endDrag} className="flex-1 bg-[#f8f9fa] rounded-xl border-2 border-dashed border-gray-300 relative overflow-hidden min-h-[250px]">
                  <span className="absolute top-2 sm:top-3 left-3 sm:left-4 text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase pointer-events-none">Drag to move tables</span>
                  {(settings.tables || []).map((t: any) => (
                    <div 
                      key={t.id} onMouseDown={(e) => startDrag(e, t.id)} onTouchStart={(e) => startDrag(e, t.id)} style={{ left: `${t.x}%`, top: `${t.y}%` }}
                      className={`absolute cursor-move shadow-sm flex flex-col items-center justify-center bg-white text-gray-800 border-2 border-gray-300 touch-none ${t.shape === 'circle' ? 'rounded-full w-12 h-12 sm:w-14 sm:h-14' : 'rounded-lg sm:rounded-xl w-14 h-10 sm:w-16 sm:h-12'} ${dragState?.id === t.id ? 'opacity-80 scale-105 z-10 border-[#ff9f43] text-[#ff9f43]' : 'hover:border-gray-400'}`}
                    >
                      <span className="text-[9px] sm:text-[10px] font-bold pointer-events-none">{t.name}</span>
                      <button onClick={(e) => { e.stopPropagation(); removeTable(t.id); }} className="absolute -top-1.5 sm:-top-2 -right-1.5 sm:-right-2 bg-red-500 text-white rounded-full w-4 h-4 sm:w-5 sm:h-5 text-[8px] sm:text-[10px] flex items-center justify-center shadow z-20 hover:scale-110 transition">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </main>
        
        {/* Subtle Footer */}
        <footer className="h-10 sm:h-12 bg-white border-t border-gray-100 flex items-center justify-between px-4 sm:px-6 shrink-0 text-[9px] sm:text-[10px] font-bold text-gray-400 mt-auto">
          <span>2024 - 2026 © {settings.storeName} POS.</span>
          <span className="hidden sm:inline">Designed & Developed Based on Dreams POS Spec</span>
        </footer>

      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 20px; }
        .scrollbar-none::-webkit-scrollbar { display: none; }
      `}} />
    </div>
  );
}