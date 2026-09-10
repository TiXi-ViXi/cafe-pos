import { useEffect, useState } from 'react';
import { getDatabase } from '../database/db';

interface Product {
  productId: string;
  name: string;
  price: number;
  category: string;
  modifierGroups: any[];
}

interface CartItem {
  cartItemId: string;
  product: Product;
}

export default function POSView() {
  const [menuItems, setMenuItems] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMenu = async () => {
      const db = await getDatabase();
      const items = await db.menu.find().exec();
      setMenuItems(items.map((item: any) => item.toJSON()));
      setLoading(false);
    };
    fetchMenu();
  }, []);

  const addToCart = (product: Product) => {
    // Generate a unique ID for this specific row so we can remove duplicates easily later
    const newItem: CartItem = {
      cartItemId: crypto.randomUUID(), 
      product: product
    };
    setCart(prev => [...prev, newItem]);
  };

  const currentTotal = cart.reduce((sum, item) => sum + item.product.price, 0).toFixed(2);

  return (
    <div className="flex h-screen bg-[#1a1a1a] text-gray-200 font-sans">
      
      {/* Left Column: Menu */}
      <div className="flex-1 flex flex-col border-r border-gray-700">
        <div className="p-4 bg-[#222] border-b border-gray-700 font-bold text-lg">
          Menu Categories
        </div>
        <div className="p-4 flex-1 overflow-y-auto">
          {loading ? (
            <p>Loading Menu...</p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {menuItems.map(item => (
                <button
                  key={item.productId}
                  onClick={() => addToCart(item)}
                  className="bg-[#333] p-6 rounded shadow hover:bg-[#444] transition flex flex-col items-center justify-center gap-2"
                >
                  <span className="font-bold">{item.name}</span>
                  <span className="text-green-500 text-sm">৳{item.price.toFixed(2)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Ticket */}
      <div className="w-96 flex flex-col bg-[#1a1a1a]">
        <div className="p-4 bg-[#222] border-b border-gray-700 font-bold text-lg">
          Current Ticket
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          {cart.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-500">
              Cart is empty
            </div>
          ) : (
            cart.map(item => (
              <div key={item.cartItemId} className="flex justify-between bg-[#2a2a2a] p-3 rounded">
                <span>{item.product.name}</span>
                <span>৳{item.product.price.toFixed(2)}</span>
              </div>
            ))
          )}
        </div>

        {/* Pay Button */}
        <button className="bg-[#3b7a42] hover:bg-[#46924e] text-white p-6 text-xl font-bold transition">
          Pay ৳{currentTotal}
        </button>
      </div>
      
    </div>
  );
}