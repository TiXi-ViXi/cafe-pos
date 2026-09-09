// src/App.tsx
import { HashRouter, Routes, Route } from 'react-router-dom'; // <-- Change to HashRouter
import POSView from './pages/POSView';
import AdminView from './pages/AdminView';

export default function App() {
  return (
    <HashRouter> {/* <-- Change to HashRouter */}
      <Routes>
        <Route path="/" element={<POSView />} />
        <Route path="/admin" element={<AdminView />} />
      </Routes>
    </HashRouter>
  );
}