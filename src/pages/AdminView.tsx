// src/pages/AdminView.tsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getDatabase } from '../database/db';

export default function AdminView() {
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  
  // Form State
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newCategory, setNewCategory] = useState('Hot Coffee');

  useEffect(() => {
    const loadMenu = async () => {
      const db = await getDatabase();
      const items = await db.menu.find().exec();
      setMenuItems(items.map((item: any) => item.toJSON()));
    };
    loadMenu();
  }, []);

  const handleSaveProduct = async () => {
    if (!newName || !newPrice) return;

    const db = await getDatabase();
    
    // Automatically count existing items to generate a clean sequence like prod_4, prod_5, etc.
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
    <div style={{ padding: '30px', color: '#fff', width: '100%' }}>
      {/* ADD PRODUCT MODAL */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Add New Product</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
              <input 
                type="text" 
                placeholder="Product Name (e.g. Mocha)" 
                value={newName} 
                onChange={e => setNewName(e.target.value)}
                style={{ padding: '10px', borderRadius: '4px', border: '1px solid #444', backgroundColor: '#333', color: '#fff' }}
              />
              <input 
                type="number" 
                placeholder="Price (e.g. 4.50)" 
                value={newPrice} 
                onChange={e => setNewPrice(e.target.value)}
                style={{ padding: '10px', borderRadius: '4px', border: '1px solid #444', backgroundColor: '#333', color: '#fff' }}
              />
              <select 
                value={newCategory} 
                onChange={e => setNewCategory(e.target.value)}
                style={{ padding: '10px', borderRadius: '4px', border: '1px solid #444', backgroundColor: '#333', color: '#fff' }}
              >
                <option value="Hot Coffee">Hot Coffee</option>
                <option value="Iced Coffee">Iced Coffee</option>
                <option value="Pastry">Pastry</option>
                <option value="Beverage">Beverage</option>
              </select>
            </div>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="confirm-btn" onClick={handleSaveProduct}>Save Product</button>
            </div>
          </div>
        </div>
      )}

      <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px' }}>
        <h2>Admin Dashboard</h2>
        <Link to="/" style={{ color: '#4CAF50', textDecoration: 'none', fontSize: '1.1rem' }}>
          ← Back to Terminal
        </Link>
      </header>
      
      <div style={{ backgroundColor: '#1e1e1e', padding: '20px', borderRadius: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
          <h3>Product Database</h3>
          <button 
            onClick={() => setShowAddModal(true)}
            style={{ backgroundColor: '#4CAF50', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '4px', cursor: 'pointer' }}
          >
            + Add Product
          </button>
        </div>
        
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #333' }}>
              <th style={{ padding: '10px 0' }}>Product ID</th>
              <th>Name</th>
              <th>Category</th>
              <th>Base Price</th>
              <th>Modifiers</th>
            </tr>
          </thead>
          <tbody>
            {menuItems.map((item) => (
              <tr key={item.productId} style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '10px 0', color: '#888' }}>{item.productId}</td>
                <td style={{ fontWeight: 'bold' }}>{item.name}</td>
                <td>{item.category}</td>
                <td>৳{item.price.toFixed(2)}</td>
                <td>{item.modifierGroups?.length || 0} Groups</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}