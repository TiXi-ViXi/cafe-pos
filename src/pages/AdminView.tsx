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

  // --- DELETE PRODUCT LOGIC ---
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

  // --- MODIFIER BUILDER LOGIC ---
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
    const nextId = `prod_${Date.now()}`; // Switched to timestamp for safer unique IDs after deletions

    // Structure modifiers into the schema format if any were added
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
    <div className="p-8 bg-[#1a1a1a] min-h-screen text-gray-200 font-sans flex flex-col gap-8">
      
      {/* ADVANCED ADD PRODUCT MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-[#222] p-6 rounded-lg w-full max-w-lg shadow-2xl border border-gray-700 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4">Add New Product</h2>
            
            {/* Base Details */}
            <div className="flex flex-col gap-4 mb-6">
              <input type="text" placeholder="Product Name" value={newName} onChange={e => setNewName(e.target.value)} className="p-3 rounded bg-[#333] border border-gray-600 text-white focus:border-green-500" />
              <div className="flex gap-4">
                <input type="number" placeholder="Base Price (৳)" value={newPrice} onChange={e => setNewPrice(e.target.value)} className="p-3 rounded bg-[#333] border border-gray-600 text-white focus:border-green-500 flex-1" />
                <select value={newCategory} onChange={e => setNewCategory(e.target.value)} className="p-3 rounded bg-[#333] border border-gray-600 text-white focus:border-green-500 flex-1">
                  <option value="Hot Coffee">Hot Coffee</option>
                  <option value="Iced Coffee">Iced Coffee</option>
                  <option value="Pastry">Pastry</option>
                  <option value="Beverage">Beverage</option>
                </select>
              </div>
            </div>

            {/* Modifier Builder */}
            <div className="mb-6 border-t border-gray-700 pt-4">
              <h3 className="font-bold mb-3 text-gray-400 uppercase text-sm">Add Modifiers (Optional)</h3>
              <div className="flex gap-2 mb-3">
                <input type="text" placeholder="Name (e.g. Soy Milk)" value={modName} onChange={e => setModName(e.target.value)} className="p-2 rounded bg-[#333] border border-gray-600 text-white flex-1 text-sm" />
                <input type="number" placeholder="+৳ 0.00" value={modPrice} onChange={e => setModPrice(e.target.value)} className="p-2 rounded bg-[#333] border border-gray-600 text-white w-24 text-sm" />
                <button onClick={handleAddTempMod} className="bg-gray-600 hover:bg-gray-500 px-4 rounded font-bold transition text-sm">Add</button>
              </div>
              
              <div className="flex flex-col gap-2 max-h-32 overflow-y-auto">
                {tempMods.map((mod, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-[#2a2a2a] p-2 rounded text-sm border border-gray-600">
                    <span>{mod.name} <span className="text-green-400">+৳{mod.priceDelta.toFixed(2)}</span></span>
                    <button onClick={() => handleRemoveTempMod(idx)} className="text-red-400 hover:text-red-300 font-bold px-2">✕</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-4 pt-4 border-t border-gray-700">
              <button onClick={resetForm} className="flex-1 p-3 bg-gray-600 hover:bg-gray-500 rounded font-bold transition">Cancel</button>
              <button onClick={handleSaveProduct} className="flex-1 p-3 bg-green-600 hover:bg-green-500 rounded font-bold transition">Save Product</button>
            </div>
          </div>
        </div>
      )}

      <header className="flex justify-between items-center pb-4 border-b border-gray-700">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <a href="#/" className="bg-green-700 hover:bg-green-600 px-4 py-2 rounded font-bold transition text-white no-underline">
          ← Back to Terminal
        </a>
      </header>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <div className="bg-[#222] p-6 rounded-lg shadow border border-gray-700">
          <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-3">
            <h2 className="text-xl font-bold">Offline Ticket History</h2>
            <button onClick={handleSync} disabled={isSyncing} className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white px-3 py-1 rounded font-bold transition text-sm flex items-center gap-2">
              {isSyncing ? 'Syncing...' : '🔄 Sync Now'}
            </button>
          </div>
          <div className="flex flex-col gap-3 max-h-[500px] overflow-y-auto pr-2">
            {tickets.length === 0 ? <p className="text-gray-500 italic">No tickets saved yet.</p> : (
              tickets.map(ticket => (
                <div key={ticket.ticketId} className="bg-[#2a2a2a] p-4 rounded flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="font-bold text-green-400 text-lg">৳{ticket.grossTotal.toFixed(2)}</span>
                    <span className="text-gray-400 text-sm">{new Date(ticket.createdAt).toLocaleString()}</span>
                  </div>
                  <div className={`text-sm px-3 py-1 rounded tracking-wide font-bold ${ticket.status === 'SYNCED' ? 'bg-blue-900/50 text-blue-300' : 'bg-gray-700'}`}>
                    {ticket.status}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-[#222] p-6 rounded-lg shadow border border-gray-700">
          <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-3">
            <h2 className="text-xl font-bold">Product Database</h2>
            <button onClick={() => setShowAddModal(true)} className="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded font-bold transition text-sm">
              + Add Product
            </button>
          </div>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto pr-2">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-700 text-gray-400 text-sm">
                  <th className="p-3">Name</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Base Price</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {menuItems.map((item) => (
                  <tr key={item.productId} className="border-b border-gray-700 hover:bg-[#2a2a2a] transition">
                    <td className="p-3 font-bold">
                      {item.name}
                      {item.modifierGroups?.length > 0 && <span className="block text-xs text-blue-400 font-normal mt-1">{item.modifierGroups[0].options.length} Mods attached</span>}
                    </td>
                    <td className="p-3 text-gray-400 text-sm">{item.category}</td>
                    <td className="p-3 text-green-400">৳{item.price.toFixed(2)}</td>
                    <td className="p-3 text-right">
                      <button onClick={() => handleDeleteProduct(item.productId)} className="text-red-500 hover:text-red-400 hover:bg-red-900/30 p-2 rounded transition">
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