// src/components/ActiveCart.tsx

export interface CartItem {
  id: string;
  productId: string;
  name: string;
  price: number;
  modifiers: any[];
  lineTotal: number;
}

interface ActiveCartProps {
  items: CartItem[];
  onRemoveItem: (id: string) => void;
}

export default function ActiveCart({ items, onRemoveItem }: ActiveCartProps) {
  if (items.length === 0) {
    return (
      <div className="cart-placeholder">
        <p>Cart is empty</p>
      </div>
    );
  }

  return (
    <div className="cart-item-list">
      {items.map((item) => (
        <div key={item.id} className="cart-item">
          <div className="cart-item-details">
            <span className="cart-item-name">{item.name}</span>
          </div>
          <div className="cart-item-price-actions">
            <span className="cart-item-price">৳{item.lineTotal.toFixed(2)}</span>
            <button className="remove-btn" onClick={() => onRemoveItem(item.id)}>✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}