import { useState, useEffect } from 'react';
import { getDatabase } from '../database/db';

export default function AdminView() {
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  
  // Form State
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newCategory, setNewCategory] = useState('Hot Coffee');

  useEffect(() => {
    const loadData = async () => {
      const db = await getDatabase();
      
      // Load Menu
      const items = await db.menu.find().exec();
      setMenuItems(items.map((item: any) => item.toJSON()));

      // Load Tickets
      const savedTickets = await db.tickets.find().exec();
      setTickets(savedTickets.map((t: any) => t.toJSON()));
    };
    loadData();
  }, []);

  const handleSaveProduct = async () => {
    if (!newName || !newPrice) return;

    const db = await getDatabase();
    
    // Automatically count existing items to generate a clean sequence like prod_4
    const currentCount = await db.menu.find().exec();
    const nextId = `prod_${currentCount.length + 1}`;

    const newItem = {
      productId: nextId,
      name: newName,
      price: parseFloat(newPrice),
      category: newCategory,
      modifierGroups: []
    };

    try {
      await db.menu.insert(newItem);
      setMenuItems(prev => [...prev, newItem]);
      
      setShowAddModal(false);
      setNewName('');
      setNewPrice('');
    } catch (err) {
      console.error('Failed to save product:', err);
    }
  };

  return (
    <div className="p-8 bg-[#1a1a1a] min-h-screen text-gray-200 font-sans flex flex-col gap-8">
      
      {/* ADD PRODUCT MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-[#222] p-6 rounded-lg w-full max-w-md shadow-2xl border border-gray-700">
            <h2 className="text-2xl font-bold mb-4">Add New Product</h2>
            <div className="flex flex-col gap-4 mb-6">
              <input 
                type="text" 
                placeholder="Product Name (e.g. Mocha)" 
                value={newName} 
                onChange={e => setNewName(e.target.value)}
                className="p-3 rounded bg-[#333] border border-gray-600 text-white focus:outline-none focus:border-green-500"
              />
              <input 
                type="number" 
                placeholder="Price (e.g. 4.50)" 
                value={newPrice} 
                onChange={e => setNewPrice(e.target.value)}
                className="p-3 rounded bg-[#333] border border-gray-600 text-white focus:outline-none focus:border-green-500"
              />
              <select 
                value={newCategory} 
                onChange={e => setNewCategory(e.target.value)}
                className="p-3 rounded bg-[#333] border border-gray-600 text-white focus:outline-none focus:border-green-500"
              >
                <option value="Hot Coffee">Hot Coffee</option>
                <option value="Iced Coffee">Iced Coffee</option>
                <option value="Pastry">Pastry</option>
                <option value="Beverage">Beverage</option>
              </select>
            </div>
            <div className="flex gap-4">
              <button 
                className="flex-1 p-3 bg-gray-600 hover:bg-gray-500 rounded font-bold transition" 
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </button>
              <button 
                className="flex-1 p-3 bg-green-600 hover:bg-green-500 rounded font-bold transition" 
                onClick={handleSaveProduct}
              >
                Save Product
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header className="flex justify-between items-center pb-4 border-b border-gray-700">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        {/* Swapped React Router Link for Hash Link to prevent GitHub Pages routing errors */}
        <a href="#/" className="bg-green-700 hover:bg-green-600 px-4 py-2 rounded font-bold transition text-white no-underline">
          ← Back to Terminal
        </a>
      </header>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        
        {/* TICKET HISTORY SECTION */}
        <div className="bg-[#222] p-6 rounded-lg shadow border border-gray-700">
          <h2 className="text-xl mb-4 font-bold border-b border-gray-700 pb-3">Offline Ticket History</h2>
          <div className="flex flex-col gap-3 max-h-[500px] overflow-y-auto pr-2">
            {tickets.length === 0 ? (
              <p className="text-gray-500 italic">No tickets saved yet.</p>
            ) : (
              tickets.map(ticket => (
                <div key={ticket.ticketId} className="bg-[#2a2a2a] p-4 rounded flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="font-bold text-green-400 text-lg">৳{ticket.grossTotal.toFixed(2)}</span>
                    <span className="text-gray-400 text-sm">{new Date(ticket.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="text-sm bg-gray-700 px-3 py-1 rounded tracking-wide font-bold">
                    {ticket.status}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* PRODUCT DATABASE SECTION */}
        <div className="bg-[#222] p-6 rounded-lg shadow border border-gray-700">
          <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-3">
            <h2 className="text-xl font-bold">Product Database</h2>
            <button 
              onClick={() => setShowAddModal(true)}
              className="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded font-bold transition text-sm"
            >
              + Add Product
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-700 text-gray-400 text-sm">
                  <th className="p-3">Product ID</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Base Price</th>
                </tr>
              </thead>
              <tbody>
                {menuItems.map((item) => (
                  <tr key={item.productId} className="border-b border-gray-700 hover:bg-[#2a2a2a] transition">
                    <td className="p-3 text-gray-500 text-sm">{item.productId}</td>
                    <td className="p-3 font-bold">{item.name}</td>
                    <td className="p-3 text-gray-400">{item.category}</td>
                    <td className="p-3 text-green-400">৳{item.price.toFixed(2)}</td>
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