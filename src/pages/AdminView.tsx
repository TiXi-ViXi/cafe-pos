import { useState, useEffect } from 'react';
import { getDatabase } from '../database/db';

export default function AdminView() {
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Base Form State
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newCategory, setNewCategory] = useState('Hot Coffee');

  // Modifier Form State
  const [tempMods, setTempMods] = useState<{name: string, priceDelta: number}[]>([]);
  const [modName, setModName] = useState('');
  const [modPrice, setModPrice] = useState('');

  useEffect(() => {
    const loadData = async () => {
      const db = await getDatabase();
      
      const items = await db.menu.find().exec();
      setMenuItems(items.map((item: any) => item.toJSON()));

      const savedTickets = await db.tickets.find().exec();
      const parsedTickets = savedTickets.map((t: any) => t.toJSON());
      parsedTickets.sort((a: any, b: any) => b.createdAt - a.createdAt);
      setTickets(parsedTickets);
    };
    loadData();
  }, []);

  const handleDeleteProduct = async (productId: string) => {
    if (!window.confirm('Are you sure you want to delete this item?')) return;
    
    try {
      const db = await getDatabase();
      const query = db.menu.find({ selector: { productId } });
      await query.remove();
      setMenuItems(prev => prev.filter(p => p.productId !== productId));
    } catch (err) {
      console.error('Failed to delete product:', err);
    }
  };

  const handleAddTempMod = () => {
    if (!modName) return;
    setTempMods(prev => [...prev, { name: modName, priceDelta: parseFloat(modPrice) || 0 }]);
    setModName('');
    setModPrice('');
  };

  const handleRemoveTempMod = (index: number) => {
    setTempMods(prev => prev.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setShowAddModal(false);
    setNewName('');
    setNewPrice('');
    setTempMods([]);
  };

  const handleSaveProduct = async () => {
    if (!newName || !newPrice) return;
    const db = await getDatabase();
    
    const nextId = `prod_${Date.now()}`;

    const modifierGroups = tempMods.length > 0 ? [{
      groupId: crypto.randomUUID(),
      name: "Custom Options",
      options: tempMods.map(m => ({
        modId: crypto.randomUUID(),
        name: m.name,
        priceDelta: m.priceDelta
      }))
    }] : [];

    const newItem = {
      productId: nextId,
      name: newName,
      price: parseFloat(newPrice),
      category: newCategory,
      modifierGroups
    };

    try {
      await db.menu.insert(newItem);
      setMenuItems(prev => [...prev, newItem]);
      resetForm();
    } catch (err) {
      console.error('Failed to save product:', err);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const db = await getDatabase();
      const pendingTickets = await db.tickets.find({ selector: { status: 'PAID' } }).exec();

      if (pendingTickets.length === 0) {
        alert('All tickets are already synced to the cloud!');
        setIsSyncing(false);
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 1500));

      for (const ticket of pendingTickets) {
        await ticket.incrementalPatch({ status: 'SYNCED' });
      }

      const updatedTickets = await db.tickets.find().exec();
      const parsedUpdated = updatedTickets.map((t: any) => t.toJSON());
      parsedUpdated.sort((a: any, b: any) => b.createdAt - a.createdAt);
      setTickets(parsedUpdated);
      
      alert(`Successfully synced ${pendingTickets.length} tickets!`);
    } catch (err) {
      console.error('Sync failed:', err);
      alert('Cloud sync failed. Please try again.');
    }
    setIsSyncing(false);
  };

  return (
    <div className="p-4 md:p-8 bg-[#f4f5f7] min-h-screen text-gray-800 font-sans flex flex-col gap-6 select-none">
      
      {/* ADD PRODUCT MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-2xl w-full max-w-lg shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-extrabold text-gray-900 mb-4">Add New Product</h2>
            
            <div className="flex flex-col gap-3 mb-6">
              <input 
                type="text" 
                placeholder="Product Name" 
                value={newName} 
                onChange={e => setNewName(e.target.value)} 
                className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-600 font-medium" 
              />
              <div className="flex gap-3">
                <input 
                  type="number" 
                  placeholder="Base Price (৳)" 
                  value={newPrice} 
                  onChange={e => setNewPrice(e.target.value)} 
                  className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-600 font-medium flex-1" 
                />
                <select 
                  value={newCategory} 
                  onChange={e => setNewCategory(e.target.value)} 
                  className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-600 font-medium text-gray-700 flex-1"
                >
                  <option value="Hot Coffee">Hot Coffee</option>
                  <option value="Iced Coffee">Iced Coffee</option>
                  <option value="Pastry">Pastry</option>
                  <option value="Beverage">Beverage</option>
                </select>
              </div>
            </div>

            <div className="mb-6 border-t border-gray-100 pt-4">
              <h3 className="font-bold mb-3 text-gray-400 uppercase text-xs tracking-wider">Add Modifiers (Optional)</h3>
              <div className="flex gap-2 mb-3">
                <input 
                  type="text" 
                  placeholder="Name (e.g. Soy Milk)" 
                  value={modName} 
                  onChange={e => setModName(e.target.value)} 
                  className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl flex-1 text-xs focus:outline-none focus:border-emerald-600" 
                />
                <input 
                  type="number" 
                  placeholder="+৳ 0.00" 
                  value={modPrice} 
                  onChange={e => setModPrice(e.target.value)} 
                  className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl w-24 text-xs focus:outline-none focus:border-emerald-600" 
                />
                <button 
                  onClick={handleAddTempMod} 
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 rounded-xl font-bold transition text-xs"
                >
                  Add
                </button>
              </div>
              
              <div className="flex flex-col gap-2 max-h-32 overflow-y-auto">
                {tempMods.map((mod, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-gray-50 p-2.5 rounded-xl text-xs border border-gray-200 font-medium">
                    <span>{mod.name} <span className="text-emerald-700 font-bold">+৳{mod.priceDelta.toFixed(2)}</span></span>
                    <button onClick={() => handleRemoveTempMod(idx)} className="text-red-500 hover:text-red-700 font-bold px-2">✕</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-gray-100">
              <button onClick={resetForm} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition text-sm">Cancel</button>
              <button onClick={handleSaveProduct} className="flex-1 py-3 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl font-bold transition text-sm shadow-md">Save Product</button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header className="bg-white px-6 py-4 rounded-2xl flex justify-between items-center border border-gray-200 shadow-sm">
        <h1 className="text-lg md:text-xl font-black text-gray-900">Admin Dashboard</h1>
        <a href="#/" className="bg-emerald-800 hover:bg-emerald-900 px-4 py-2 rounded-xl font-bold transition text-white text-xs md:text-sm no-underline shadow-sm">
          ← Back to POS
        </a>
      </header>
      
      {/* DASHBOARD GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        
        {/* TICKET HISTORY SECTION */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
            <h2 className="text-base md:text-lg font-extrabold text-gray-900">Offline Ticket History</h2>
            <button 
              onClick={handleSync} 
              disabled={isSyncing} 
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-3 py-1.5 rounded-xl font-bold transition text-xs flex items-center gap-1.5 shadow-sm"
            >
              {isSyncing ? 'Syncing...' : '🔄 Sync Now'}
            </button>
          </div>

          <div className="flex flex-col gap-3 max-h-[450px] overflow-y-auto pr-1">
            {tickets.length === 0 ? <p className="text-gray-400 italic text-sm">No tickets saved yet.</p> : (
              tickets.map(ticket => (
                <div key={ticket.ticketId} className="bg-gray-50 p-4 rounded-xl border border-gray-200/60 flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="font-extrabold text-emerald-800 text-base">৳{ticket.grossTotal.toFixed(2)}</span>
                    <span className="text-gray-400 text-xs mt-0.5">{new Date(ticket.createdAt).toLocaleString()}</span>
                    {ticket.customerName && <span className="text-xs text-gray-600 font-medium mt-1">👤 {ticket.customerName} ({ticket.orderType})</span>}
                  </div>
                  <div className={`text-xs px-3 py-1 rounded-full font-bold tracking-wide ${
                    ticket.status === 'SYNCED' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {ticket.status}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* PRODUCT DATABASE SECTION */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
            <h2 className="text-base md:text-lg font-extrabold text-gray-900">Product Database</h2>
            <button 
              onClick={() => setShowAddModal(true)} 
              className="bg-emerald-800 hover:bg-emerald-900 text-white px-3.5 py-1.5 rounded-xl font-bold transition text-xs shadow-sm"
            >
              + Add Product
            </button>
          </div>

          <div className="overflow-x-auto max-h-[450px] overflow-y-auto pr-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-gray-400 text-xs uppercase tracking-wider">
                  <th className="py-3 px-2">Name</th>
                  <th className="py-3 px-2">Category</th>
                  <th className="py-3 px-2">Price</th>
                  <th className="py-3 px-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {menuItems.map((item) => (
                  <tr key={item.productId} className="border-b border-gray-100 hover:bg-gray-50 transition">
                    <td className="py-3.5 px-2 font-bold text-sm text-gray-900">
                      {item.name}
                      {item.modifierGroups?.length > 0 && <span className="block text-[11px] text-emerald-600 font-medium mt-0.5">{item.modifierGroups[0].options.length} Modifiers</span>}
                    </td>
                    <td className="py-3.5 px-2 text-gray-500 text-xs">{item.category}</td>
                    <td className="py-3.5 px-2 text-emerald-700 font-extrabold text-sm">৳{item.price.toFixed(2)}</td>
                    <td className="py-3.5 px-2 text-right">
                      <button onClick={() => handleDeleteProduct(item.productId)} className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2.5 py-1.5 rounded-lg text-xs font-bold transition">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}