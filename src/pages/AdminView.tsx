import { useState, useEffect, useRef, useMemo } from 'react';
import { getDatabase } from '../database/db';

export default function AdminView() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'reports' | 'settings' | 'staff'>('dashboard');
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('pos_settings');
    return saved ? JSON.parse(saved) : { storeName: 'BYRON BLISS', branchName: 'Khulna Branch', currencySymbol: '৳', taxRate: 10, categories: 'Hot Coffee, Iced Coffee, Pastry, Beverage', tables: [{ id: 't1', name: 'Table 1', shape: 'rect', x: 10, y: 10 }] };
  });
  
  const categoryList = settings.categories.split(',').map((c: string) => c.trim());

  // Product Form States
  const [editId, setEditId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newCost, setNewCost] = useState('');
  const [newCategory, setNewCategory] = useState(categoryList[0] || '');
  const [newImage, setNewImage] = useState('');
  const [tempMods, setTempMods] = useState<{name: string, priceDelta: number}[]>([]);
  const [modName, setModName] = useState('');
  const [modPrice, setModPrice] = useState('');

  // Staff Form States
  const [newUsername, setNewUsername] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newRole, setNewRole] = useState('employee');

  // Map States
  const [newTableName, setNewTableName] = useState('');
  const [newTableShape, setNewTableShape] = useState<'rect'|'circle'>('rect');
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{id: string, offX: number, offY: number} | null>(null);

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
  }, []);

  const paidTickets = useMemo(() => tickets.filter(t => t.status === 'PAID' || t.status === 'SYNCED'), [tickets]);
  
  const stats = useMemo(() => {
    let gross = 0; let totalCost = 0; let orders = paidTickets.length;
    const itemPerf: any = {}; const daily: any = {};
    
    paidTickets.forEach(t => {
      gross += t.grossTotal; totalCost += (t.totalCost || 0);
      const dateStr = new Date(t.createdAt).toLocaleDateString();
      if (!daily[dateStr]) daily[dateStr] = { orders: 0, gross: 0, cost: 0 };
      daily[dateStr].orders += 1; daily[dateStr].gross += t.grossTotal; daily[dateStr].cost += (t.totalCost || 0);
      
      t.items.forEach((i: any) => {
        if (!itemPerf[i.name]) itemPerf[i.name] = { qty: 0, rev: 0 };
        itemPerf[i.name].qty += 1; itemPerf[i.name].rev += i.lineTotal;
      });
    });
    
    const netSales = gross / (1 + (settings.taxRate / 100)); 
    const tax = gross - netSales; 
    const profit = netSales - totalCost;
    
    return { 
      gross, netSales, tax, totalCost, profit, orders, 
      daily: Object.entries(daily).sort((a,b) => new Date(b[0]).getTime() - new Date(a[0]).getTime()), 
      topItems: Object.entries(itemPerf).sort((a: any, b: any) => b[1].qty - a[1].qty).slice(0, 5) 
    };
  }, [paidTickets, settings.taxRate]);

  const handleSaveSettings = () => { 
    localStorage.setItem('pos_settings', JSON.stringify(settings)); 
    alert('Settings Saved!'); 
  };

  const handleCreateUser = async () => {
    if (!newUsername || !newPin) return alert('Name and PIN required');
    if (users.find(u => u.pin === newPin)) return alert('PIN already in use. Must be unique.');
    const db = await getDatabase();
    const newUser = { userId: `user_${Date.now()}`, username: newUsername, pin: newPin, role: newRole };
    await db.users.insert(newUser);
    setUsers(prev => [...prev, newUser]);
    setNewUsername(''); setNewPin('');
  };

  const handleDeleteUser = async (userId: string, role: string) => {
    if (role === 'admin' && users.filter(u => u.role === 'admin').length === 1) return alert('Cannot delete the last admin account.');
    if (!window.confirm('Delete user?')) return;
    const db = await getDatabase(); await db.users.find({ selector: { userId } }).remove();
    setUsers(prev => prev.filter(u => u.userId !== userId));
  };

  const addTable = () => { if(!newTableName) return; setSettings({ ...settings, tables: [...(settings.tables || []), { id: crypto.randomUUID(), name: newTableName, shape: newTableShape, x: 40, y: 40 }] }); setNewTableName(''); };
  const removeTable = (id: string) => setSettings({ ...settings, tables: settings.tables.filter((t: any) => t.id !== id) });
  
  const startDrag = (e: React.MouseEvent | React.TouchEvent, id: string) => { const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX; const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY; const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); setDragState({ id, offX: clientX - rect.left, offY: clientY - rect.top }); };
  const onDragMove = (e: React.MouseEvent | React.TouchEvent) => { if (!dragState || !canvasRef.current) return; const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX; const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY; const parent = canvasRef.current.getBoundingClientRect(); let newX = ((clientX - parent.left - dragState.offX) / parent.width) * 100; let newY = ((clientY - parent.top - dragState.offY) / parent.height) * 100; newX = Math.max(0, Math.min(newX, 90)); newY = Math.max(0, Math.min(newY, 90)); setSettings({ ...settings, tables: settings.tables.map((t: any) => t.id === dragState.id ? { ...t, x: newX, y: newY } : t) }); };
  const endDrag = () => setDragState(null);

  const handleSync = async () => {
    setIsSyncing(true);
    try { const db = await getDatabase(); const pendingTickets = await db.tickets.find({ selector: { status: 'PAID' } }).exec(); if (pendingTickets.length === 0) { alert('All synced!'); setIsSyncing(false); return; } for (const ticket of pendingTickets) { await ticket.incrementalPatch({ status: 'SYNCED' }); } const updatedTickets = await db.tickets.find().exec(); const parsedUpdated = updatedTickets.map((t: any) => t.toJSON()); parsedUpdated.sort((a: any, b: any) => b.createdAt - a.createdAt); setTickets(parsedUpdated); alert(`Synced ${pendingTickets.length} tickets!`); } catch (err) { alert('Sync failed.'); } setIsSyncing(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (event) => { const img = new Image(); img.onload = () => { const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 300; const ctx = canvas.getContext('2d'); if (!ctx) return; const minDim = Math.min(img.width, img.height); ctx.drawImage(img, (img.width - minDim) / 2, (img.height - minDim) / 2, minDim, minDim, 0, 0, 300, 300); setNewImage(canvas.toDataURL('image/jpeg', 0.8)); }; img.src = event.target?.result as string; }; reader.readAsDataURL(file); };
  const openEditModal = (item: any) => { setEditId(item.productId); setNewName(item.name); setNewPrice(item.price.toString()); setNewCost(item.cost?.toString() || '0'); setNewCategory(item.category); setNewImage(item.image || ''); setTempMods(item.modifierGroups?.[0]?.options || []); setShowAddModal(true); };
  const resetForm = () => { setShowAddModal(false); setEditId(null); setNewName(''); setNewPrice(''); setNewCost(''); setNewImage(''); setTempMods([]); };

  const handleSaveProduct = async () => {
    if (!newName || !newPrice) return; const db = await getDatabase(); const modifierGroups = tempMods.length > 0 ? [{ groupId: crypto.randomUUID(), name: "Custom Options", options: tempMods.map(m => ({ modId: (m as any).modId || crypto.randomUUID(), name: m.name, priceDelta: m.priceDelta })) }] : [];
    try { if (editId) { const doc = await db.menu.findOne({ selector: { productId: editId } }).exec(); await doc.patch({ name: newName, price: parseFloat(newPrice), cost: parseFloat(newCost)||0, category: newCategory || categoryList[0], image: newImage, modifierGroups }); setMenuItems(prev => prev.map(p => p.productId === editId ? { ...p, name: newName, price: parseFloat(newPrice), cost: parseFloat(newCost)||0, category: newCategory, image: newImage, modifierGroups } : p)); } else { const newItem = { productId: `prod_${Date.now()}`, name: newName, price: parseFloat(newPrice), cost: parseFloat(newCost)||0, category: newCategory || categoryList[0], image: newImage, modifierGroups }; await db.menu.insert(newItem); setMenuItems(prev => [...prev, newItem]); } resetForm(); } catch (err) { console.error(err); }
  };
  const handleDeleteProduct = async (productId: string) => { if (!window.confirm('Delete item?')) return; const db = await getDatabase(); await db.menu.find({ selector: { productId } }).remove(); setMenuItems(prev => prev.filter(p => p.productId !== productId)); };

  return (
    <div className="p-4 md:p-8 bg-[#f4f5f7] min-h-screen text-gray-800 font-sans flex flex-col gap-6 select-none">
      
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-2xl w-full max-w-lg shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto flex flex-col gap-5">
            <h2 className="text-xl font-extrabold text-gray-900">{editId ? 'Edit Product' : 'Add Product'}</h2>
            <div className="flex gap-4 items-center bg-gray-50 p-4 rounded-xl border border-gray-200">
              <div className="w-20 h-20 bg-gray-200 rounded-lg overflow-hidden flex items-center justify-center border border-gray-300 shrink-0">
                {newImage ? <img src={newImage} alt="Preview" className="w-full h-full object-cover" /> : <span className="text-2xl">📷</span>}
              </div>
              <div className="flex-1">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Image</label>
                <input type="file" accept="image/*" onChange={handleImageUpload} className="w-full text-sm text-gray-500" />
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <input type="text" placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)} className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-600 font-medium" />
              <select value={newCategory} onChange={e => setNewCategory(e.target.value)} className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-600 font-medium text-gray-700 w-full">
                {categoryList.map((cat: string) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Selling Price</label>
                  <input type="number" placeholder={settings.currencySymbol} value={newPrice} onChange={e => setNewPrice(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-600 font-medium" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Cost Price (For Profit Calc)</label>
                  <input type="number" placeholder={settings.currencySymbol} value={newCost} onChange={e => setNewCost(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-600 font-medium" />
                </div>
              </div>
            </div>
            <div className="border-t border-gray-100 pt-4">
              <h3 className="font-bold mb-3 text-gray-400 uppercase text-xs tracking-wider">Modifiers</h3>
              <div className="flex gap-2 mb-3">
                <input type="text" placeholder="Name" value={modName} onChange={e => setModName(e.target.value)} className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl flex-1 text-xs focus:outline-none focus:border-emerald-600" />
                <input type="number" placeholder={`+${settings.currencySymbol} 0.00`} value={modPrice} onChange={e => setModPrice(e.target.value)} className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl w-24 text-xs focus:outline-none focus:border-emerald-600" />
                <button onClick={() => { if(modName) { setTempMods(prev => [...prev, { name: modName, priceDelta: parseFloat(modPrice) || 0 }]); setModName(''); setModPrice(''); } }} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 rounded-xl font-bold transition text-xs">Add</button>
              </div>
              <div className="flex flex-col gap-2 max-h-32 overflow-y-auto">
                {tempMods.map((mod, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-gray-50 p-2.5 rounded-xl text-xs border border-gray-200 font-medium">
                    <span>{mod.name} <span className="text-emerald-700 font-bold">+{settings.currencySymbol}{mod.priceDelta.toFixed(2)}</span></span>
                    <button onClick={() => setTempMods(prev => prev.filter((_, i) => i !== idx))} className="text-red-500 font-bold px-2">✕</button>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={resetForm} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition text-sm">Cancel</button>
              <button onClick={handleSaveProduct} className="flex-1 py-3 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl font-bold transition text-sm shadow-md">Save Product</button>
            </div>
          </div>
        </div>
      )}

      <header className="bg-white px-4 py-4 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center border border-gray-200 shadow-sm gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 w-full md:w-auto">
          <h1 className="text-lg font-black text-gray-900">Admin</h1>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-full sm:w-auto overflow-x-auto">
            <button onClick={() => setActiveTab('dashboard')} className={`flex-1 px-4 py-1.5 rounded-md text-xs font-bold transition ${activeTab === 'dashboard' ? 'bg-white text-emerald-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Database</button>
            <button onClick={() => setActiveTab('reports')} className={`flex-1 px-4 py-1.5 rounded-md text-xs font-bold transition ${activeTab === 'reports' ? 'bg-white text-emerald-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Reports</button>
            <button onClick={() => setActiveTab('staff')} className={`flex-1 px-4 py-1.5 rounded-md text-xs font-bold transition ${activeTab === 'staff' ? 'bg-white text-emerald-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Staff</button>
            <button onClick={() => setActiveTab('settings')} className={`flex-1 px-4 py-1.5 rounded-md text-xs font-bold transition ${activeTab === 'settings' ? 'bg-white text-emerald-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Settings</button>
          </div>
        </div>
        <a href="#/" className="bg-emerald-800 hover:bg-emerald-900 px-4 py-2 rounded-xl font-bold transition text-white text-xs no-underline shadow-sm self-end md:self-auto">← POS</a>
      </header>
      
      {activeTab === 'reports' ? (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex flex-col">
              <span className="text-[10px] uppercase font-bold text-gray-400">Gross Sales</span>
              <span className="text-lg md:text-xl font-black text-gray-900 mt-1">{settings.currencySymbol}{stats.gross.toFixed(2)}</span>
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex flex-col">
              <span className="text-[10px] uppercase font-bold text-gray-400">Net Sales</span>
              <span className="text-lg md:text-xl font-black text-gray-900 mt-1">{settings.currencySymbol}{stats.netSales.toFixed(2)}</span>
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex flex-col">
              <span className="text-[10px] uppercase font-bold text-gray-400">Total Tax</span>
              <span className="text-lg md:text-xl font-black text-amber-600 mt-1">{settings.currencySymbol}{stats.tax.toFixed(2)}</span>
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex flex-col">
              <span className="text-[10px] uppercase font-bold text-gray-400">Total Cost</span>
              <span className="text-lg md:text-xl font-black text-red-600 mt-1">{settings.currencySymbol}{stats.totalCost.toFixed(2)}</span>
            </div>
            <div className="bg-emerald-800 p-4 rounded-2xl shadow-md flex flex-col col-span-2 md:col-span-1">
              <span className="text-[10px] uppercase font-bold text-emerald-200">Net Profit</span>
              <span className="text-xl md:text-2xl font-black text-white mt-1">{settings.currencySymbol}{stats.profit.toFixed(2)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 lg:col-span-2">
              <h2 className="text-base font-extrabold text-gray-900 mb-4">Daily Sales Log</h2>
              <div className="overflow-x-auto max-h-[300px] overflow-y-auto pr-1">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-400 text-[10px] uppercase tracking-wider sticky top-0 bg-white">
                      <th className="py-2 px-2">Date</th><th className="py-2 px-2">Orders</th><th className="py-2 px-2">Gross</th><th className="py-2 px-2">Cost</th><th className="py-2 px-2">Profit (Pre-Tax)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.daily.map(([date, d]: any) => (
                      <tr key={date} className="border-b border-gray-100 hover:bg-gray-50 transition text-xs">
                        <td className="py-3 px-2 font-bold">{date}</td>
                        <td className="py-3 px-2 text-gray-600 font-medium">{d.orders}</td>
                        <td className="py-3 px-2 text-emerald-700 font-bold">{settings.currencySymbol}{d.gross.toFixed(2)}</td>
                        <td className="py-3 px-2 text-red-600 font-medium">{settings.currencySymbol}{d.cost.toFixed(2)}</td>
                        <td className="py-3 px-2 text-blue-700 font-bold">{settings.currencySymbol}{(d.gross - d.cost).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
              <h2 className="text-base font-extrabold text-gray-900 mb-4">Top 5 Items</h2>
              <div className="flex flex-col gap-3">
                {stats.topItems.map(([name, data]: any, idx) => (
                  <div key={name} className="bg-gray-50 p-3 rounded-xl border border-gray-200/60 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400 font-black text-sm">#{idx+1}</span>
                      <div className="flex flex-col">
                        <span className="font-bold text-xs text-gray-900">{name}</span>
                        <span className="text-[10px] text-gray-500 font-medium">{data.qty} sold</span>
                      </div>
                    </div>
                    <span className="text-emerald-700 font-extrabold text-xs">{settings.currencySymbol}{data.rev.toFixed(2)}</span>
                  </div>
                ))}
                {stats.topItems.length === 0 && <p className="text-xs text-gray-400 italic text-center py-4">No sales data yet.</p>}
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'staff' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
             <h2 className="text-lg font-extrabold text-gray-900 mb-4">Create Employee PIN</h2>
             <div className="flex flex-col gap-4">
                <input type="text" placeholder="Employee Name" value={newUsername} onChange={e => setNewUsername(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-600 font-medium" />
                <div className="grid grid-cols-2 gap-3">
                   <input type="password" placeholder="4-Digit Login PIN" value={newPin} onChange={e => setNewPin(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-600 font-medium" />
                   <select value={newRole} onChange={e => setNewRole(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-600 font-medium text-gray-700">
                     <option value="employee">Employee (POS Only)</option>
                     <option value="admin">Admin (Full Access)</option>
                   </select>
                </div>
                <button onClick={handleCreateUser} className="bg-emerald-800 text-white py-3 rounded-xl font-extrabold shadow-md transition">Create Account</button>
             </div>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
             <h2 className="text-lg font-extrabold text-gray-900 mb-4">Active Staff</h2>
             <div className="flex flex-col gap-3">
                {users.map(u => (
                  <div key={u.userId} className="bg-gray-50 p-4 rounded-xl border border-gray-200/60 flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="font-extrabold text-gray-900 text-sm">{u.username}</span>
                      <span className={`text-[10px] font-bold uppercase mt-1 w-max px-2 py-0.5 rounded ${u.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{u.role}</span>
                    </div>
                    <button onClick={() => handleDeleteUser(u.userId, u.role)} className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg font-bold text-xs border border-red-200 transition">Remove</button>
                  </div>
                ))}
             </div>
          </div>
        </div>
      ) : activeTab === 'dashboard' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
              <h2 className="text-base font-extrabold text-gray-900">Ticket History</h2>
              <button onClick={handleSync} disabled={isSyncing} className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-3 py-1.5 rounded-xl font-bold transition text-xs shadow-sm">
                {isSyncing ? 'Syncing...' : '🔄 Sync'}
              </button>
            </div>
            <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto pr-1">
              {tickets.length === 0 ? <p className="text-gray-400 italic text-sm">No tickets saved yet.</p> : (
                tickets.map(ticket => (
                  <div key={ticket.ticketId} className="bg-gray-50 p-3 rounded-xl border border-gray-200/60 flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="font-extrabold text-emerald-800 text-sm">{settings.currencySymbol}{ticket.grossTotal.toFixed(2)}</span>
                      <span className="text-gray-400 text-[10px] mt-0.5">{new Date(ticket.createdAt).toLocaleString()}</span>
                      {ticket.customerName && <span className="text-xs text-gray-600 font-medium mt-1">👤 {ticket.customerName} {ticket.tableNumber && `| T: ${ticket.tableNumber}`}</span>}
                    </div>
                    <div className={`text-[10px] px-2 py-1 rounded-full font-bold ${ticket.status === 'SYNCED' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                      {ticket.status}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
              <h2 className="text-base font-extrabold text-gray-900">Products</h2>
              <button onClick={() => { resetForm(); setShowAddModal(true); }} className="bg-emerald-800 text-white px-3 py-1.5 rounded-xl font-bold text-xs shadow-sm">+ Add</button>
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto pr-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-400 text-[10px] uppercase">
                    <th className="py-2 px-1">Item</th><th className="py-2 px-1">Price</th><th className="py-2 px-1">Cost</th><th className="py-2 px-1 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {menuItems.map((item) => (
                    <tr key={item.productId} className="border-b border-gray-100 hover:bg-gray-50 transition">
                      <td className="py-2 px-1 flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center text-xs">
                          {item.image ? <img src={item.image} className="w-full h-full object-cover"/> : "☕"}
                        </div>
                        <div>
                          <p className="font-bold text-xs text-gray-900 truncate w-24 sm:w-auto">{item.name}</p>
                        </div>
                      </td>
                      <td className="py-2 px-1 text-emerald-700 font-extrabold text-xs">{settings.currencySymbol}{item.price.toFixed(2)}</td>
                      <td className="py-2 px-1 text-red-500 font-medium text-xs">{settings.currencySymbol}{(item.cost || 0).toFixed(2)}</td>
                      <td className="py-2 px-1 text-right space-x-1">
                        <button onClick={() => openEditModal(item)} className="text-blue-600 px-2 py-1 bg-blue-50 rounded text-[10px] font-bold">Edit</button>
                        <button onClick={() => handleDeleteProduct(item.productId)} className="text-red-500 px-2 py-1 bg-red-50 rounded text-[10px] font-bold">Del</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 w-full">
            <h2 className="text-lg font-extrabold text-gray-900 mb-4">Configuration</h2>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Store Name</label>
                  <input type="text" value={settings.storeName} onChange={e => setSettings({...settings, storeName: e.target.value})} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Branch</label>
                  <input type="text" value={settings.branchName} onChange={e => setSettings({...settings, branchName: e.target.value})} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Currency</label>
                  <input type="text" value={settings.currencySymbol} onChange={e => setSettings({...settings, currencySymbol: e.target.value})} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium text-center" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Tax (%)</label>
                  <input type="number" value={settings.taxRate} onChange={e => setSettings({...settings, taxRate: parseFloat(e.target.value) || 0})} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium text-center" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Categories (Comma Sep)</label>
                <input type="text" value={settings.categories} onChange={e => setSettings({...settings, categories: e.target.value})} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium" />
              </div>
              <button onClick={handleSaveSettings} className="mt-2 w-full bg-emerald-800 text-white py-3 rounded-lg text-xs font-extrabold shadow-md transition">Save Settings</button>
            </div>
          </div>
          
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 w-full flex flex-col h-full">
            <h2 className="text-lg font-extrabold text-gray-900 mb-4">Floor Plan</h2>
            <div className="flex gap-2 mb-3 shrink-0">
              <input type="text" placeholder="Name" value={newTableName} onChange={e => setNewTableName(e.target.value)} className="flex-1 p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium" />
              <select value={newTableShape} onChange={e => setNewTableShape(e.target.value as any)} className="w-24 p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium">
                <option value="rect">Square</option>
                <option value="circle">Circle</option>
              </select>
              <button onClick={addTable} className="bg-emerald-800 text-white px-4 rounded-lg font-bold text-xs shadow-sm">Add</button>
            </div>
            
            <div 
              ref={canvasRef}
              onMouseMove={onDragMove}
              onTouchMove={onDragMove}
              onMouseUp={endDrag}
              onTouchEnd={endDrag}
              onMouseLeave={endDrag}
              className="flex-1 min-h-[300px] sm:min-h-[400px] bg-gray-100 rounded-xl border-4 border-dashed border-gray-300 relative overflow-hidden"
            >
              <span className="absolute top-2 left-3 text-[10px] font-bold text-gray-400 uppercase pointer-events-none">Drag to move</span>
              {(settings.tables || []).map((t: any) => (
                <div 
                  key={t.id}
                  onMouseDown={(e) => startDrag(e, t.id)}
                  onTouchStart={(e) => startDrag(e, t.id)}
                  style={{ left: `${t.x}%`, top: `${t.y}%` }}
                  className={`
                    absolute cursor-move shadow-md flex flex-col items-center justify-center bg-gray-800 text-white border-2 border-gray-600 touch-none
                    ${t.shape === 'circle' ? 'rounded-full w-12 h-12 sm:w-16 sm:h-16' : 'rounded-lg w-14 h-10 sm:w-20 sm:h-14'}
                    ${dragState?.id === t.id ? 'opacity-70 scale-105 z-10' : 'hover:scale-105'}
                  `}
                >
                  <span className="text-[10px] sm:text-xs font-bold pointer-events-none">{t.name}</span>
                  <button onClick={(e) => { e.stopPropagation(); removeTable(t.id); }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-4 h-4 text-[8px] flex items-center justify-center shadow z-20">✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}