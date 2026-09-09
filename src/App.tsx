// src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import POSView from './pages/POSView';
import AdminView from './pages/AdminView';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<POSView />} />
        <Route path="/admin" element={<AdminView />} />
      </Routes>
    </BrowserRouter>
  );
}