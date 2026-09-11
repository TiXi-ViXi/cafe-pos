import { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import POSView from './pages/POSView';
import AdminView from './pages/AdminView';
import { getDatabase } from './database/db';

export default function App() {
  const [user, setUser] = useState<any>(() => {
    const saved = localStorage.getItem('pos_user');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const db = await getDatabase();
    const foundUser = await db.users.findOne({ selector: { pin } }).exec();
    
    if (foundUser) {
      const userData = foundUser.toJSON();
      localStorage.setItem('pos_user', JSON.stringify(userData));
      setUser(userData);
      setError('');
    } else {
      setError('Invalid PIN code');
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#f4f5f7] flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-xl border border-gray-200 w-full max-w-sm flex flex-col gap-6">
          <div className="text-center">
            <h1 className="text-2xl font-black text-emerald-800 uppercase tracking-widest">Cafe POS</h1>
            <p className="text-xs text-gray-400 font-bold mt-1">SYSTEM LOGIN</p>
          </div>
          
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Enter Access PIN</label>
            <input type="password" autoFocus value={pin} onChange={e => setPin(e.target.value)} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-center text-2xl tracking-[0.5em] focus:outline-none focus:border-emerald-600 font-black transition" placeholder="••••" />
            {error && <p className="text-red-500 text-xs font-bold mt-2 text-center">{error}</p>}
          </div>
          
          <button type="submit" className="w-full bg-emerald-800 hover:bg-emerald-900 text-white py-4 rounded-xl font-extrabold shadow-md transition">Unlock</button>
        </form>
      </div>
    );
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<POSView />} />
        <Route path="/admin" element={user.role === 'admin' ? <AdminView /> : <Navigate to="/" />} />
      </Routes>
    </HashRouter>
  );
}