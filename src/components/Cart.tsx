import React, { useState, useEffect, useRef } from 'react';
import { Trash2, ArrowLeft, Check, X } from 'lucide-react';
import { CartItem } from '../types';

interface CartProps {
  cartItems: CartItem[];
  updateQuantity: (id: string, quantity: number) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  getTotalPrice: () => number;
  onContinueShopping: () => void;
  onCheckout: () => void;
}

const Cart: React.FC<CartProps> = ({
  cartItems,
  updateQuantity,
  removeFromCart,
  clearCart,
  getTotalPrice,
  onContinueShopping,
  onCheckout
}) => {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [editingQuantity, setEditingQuantity] = useState<{ id: string; value: string } | null>(null);
  const cartScrollRef = useRef<HTMLDivElement>(null);
  const previousCartItemsLengthRef = useRef<number>(cartItems.length);

  const commitQuantity = (itemId: string, raw: string) => {
    setEditingQuantity(null);
    const n = parseInt(raw.trim(), 10);
    if (!Number.isNaN(n) && n >= 1) {
      updateQuantity(itemId, n);
    }
  };

  // Restore scroll position when cart opens (unless coming from item added)
  useEffect(() => {
    const skipRestore = localStorage.getItem('amber_skipScrollRestore');
    if (!skipRestore && cartScrollRef.current) {
      const savedCartScroll = localStorage.getItem('amber_cartContainerScrollPos');
      if (savedCartScroll) {
        setTimeout(() => {
          if (cartScrollRef.current) {
            cartScrollRef.current.scrollTop = parseInt(savedCartScroll);
          }
        }, 100);
      }
    } else if (skipRestore) {
      // New item added, scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (cartScrollRef.current) {
        cartScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
      localStorage.removeItem('amber_skipScrollRestore');
    }
  }, []);

  // Save cart container scroll position
  useEffect(() => {
    if (!cartScrollRef.current) return;

    const handleScroll = () => {
      if (cartScrollRef.current) {
        localStorage.setItem('amber_cartContainerScrollPos', cartScrollRef.current.scrollTop.toString());
      }
    };

    const container = cartScrollRef.current;
    container.addEventListener('scroll', handleScroll, { passive: true });
    
    // Save on unmount
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (cartScrollRef.current) {
        localStorage.setItem('amber_cartContainerScrollPos', cartScrollRef.current.scrollTop.toString());
      }
    };
  }, []);

  // Scroll cart container to top when new items are added
  useEffect(() => {
    // If cart items length increased, scroll cart container to top
    if (cartItems.length > previousCartItemsLengthRef.current && cartScrollRef.current) {
      cartScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    previousCartItemsLengthRef.current = cartItems.length;
  }, [cartItems.length]);

  const toggleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    if (selectionMode) {
      setSelectedItems(new Set());
    }
  };

  const toggleItemSelection = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const selectAll = () => {
    if (selectedItems.size === cartItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(cartItems.map(item => item.id)));
    }
  };

  const deleteSelected = () => {
    selectedItems.forEach(itemId => {
      removeFromCart(itemId);
    });
    setSelectedItems(new Set());
    setSelectionMode(false);
  };
  if (cartItems.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center py-16">
          <div className="mb-4 flex justify-center">
            <img src="/logo.png" alt="Logo" className="h-24 w-24 md:h-32 md:w-32 object-contain" />
          </div>
          <h2 className="text-2xl font-medium text-cafe-text mb-2">Your cart is empty</h2>
          <p className="text-cafe-textMuted mb-6">Add some currency packages to get started!</p>
          <button
            onClick={onContinueShopping}
            className="text-neutral-800 font-medium px-6 py-3 rounded-full hover:opacity-90 transition-all duration-200"
            style={{ backgroundColor: '#F5F0E6' }}
          >
            Browse Games
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col max-w-4xl mx-auto px-4 py-8" style={{ maxHeight: 'calc(100vh - 120px)', height: 'calc(100vh - 120px)', minHeight: 0 }}>
      <div className="flex items-center justify-center mb-6 flex-shrink-0 relative">
        <button
          onClick={onContinueShopping}
          aria-label="Back"
          className="flex items-center text-cafe-textMuted hover:text-cafe-primary transition-colors duration-200 absolute left-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-3xl font-semibold text-cafe-text whitespace-nowrap">Cart</h1>
        <button
          onClick={toggleSelectionMode}
          className="p-2 text-cafe-primary hover:text-cafe-secondary hover:bg-cafe-primary/20 rounded-full transition-all duration-200 absolute right-0"
          aria-label={selectionMode ? "Cancel selection" : "Delete items"}
        >
          {selectionMode ? (
            <X className="h-5 w-5" />
          ) : (
            <Trash2 className="h-5 w-5" />
          )}
        </button>
      </div>

      {selectionMode && (
        <div className="flex items-center justify-between mb-4 px-2">
          <button
            onClick={selectAll}
            className="text-sm text-cafe-primary hover:text-cafe-secondary transition-colors duration-200"
          >
            {selectedItems.size === cartItems.length ? 'Deselect All' : 'Select All'}
          </button>
          {selectedItems.size > 0 && (
            <button
              onClick={deleteSelected}
              className="text-sm text-red-400 hover:text-red-300 transition-colors duration-200 flex items-center gap-1"
            >
              <Trash2 className="h-4 w-4" />
              Delete ({selectedItems.size})
            </button>
          )}
        </div>
      )}

      <div 
        ref={cartScrollRef}
        className="flex-1 overflow-y-auto mb-6 min-h-0"
        style={{ 
          WebkitOverflowScrolling: 'touch', 
          overscrollBehavior: 'contain'
        }}
      >
        <div className="space-y-0">
          {cartItems.map((item, index) => (
            <div 
              key={item.id} 
              className={`px-4 py-4 ${index !== cartItems.length - 1 ? 'border-b border-cafe-primary/30' : ''} ${
                selectionMode ? 'cursor-pointer hover:bg-cafe-primary/5' : ''
              }`}
              onClick={selectionMode ? () => toggleItemSelection(item.id) : undefined}
            >
              <div className="flex flex-col">
                {selectionMode && (
                  <div className="flex items-center mb-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => toggleItemSelection(item.id)}
                      className={`flex items-center justify-center w-5 h-5 rounded border-2 transition-all duration-200 ${
                        selectedItems.has(item.id)
                          ? 'bg-cafe-primary border-cafe-primary'
                          : 'border-cafe-primary/50 bg-transparent'
                      }`}
                    >
                      {selectedItems.has(item.id) && (
                        <Check className="h-3 w-3 text-white" />
                      )}
                    </button>
                  </div>
                )}
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-base font-medium text-cafe-text">{item.name}</h3>
                    <p className="text-sm font-semibold text-cafe-text">₱{item.totalPrice} each</p>
                  </div>
                  {item.selectedVariation && (
                    <p className="text-xs text-cafe-textMuted mb-1">Package: {item.selectedVariation.name}</p>
                  )}
                  {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                    <p className="text-xs text-cafe-textMuted mb-1">
                      Add-ons: {item.selectedAddOns.map(addOn => 
                        addOn.quantity && addOn.quantity > 1 
                          ? `${addOn.name} x${addOn.quantity}`
                          : addOn.name
                      ).join(', ')}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between flex-wrap gap-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-cafe-textMuted whitespace-nowrap">Quantity</label>
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={editingQuantity?.id === item.id ? editingQuantity.value : item.quantity}
                    onChange={(e) => setEditingQuantity({ id: item.id, value: e.target.value })}
                    onFocus={() => setEditingQuantity({ id: item.id, value: String(item.quantity) })}
                    onBlur={() => commitQuantity(item.id, editingQuantity?.id === item.id ? editingQuantity.value : String(item.quantity))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      }
                    }}
                    className="font-semibold text-cafe-text w-14 px-2 py-1.5 rounded-lg bg-white/10 border border-cafe-primary/30 focus:outline-none focus:ring-2 focus:ring-cafe-primary/50 focus:border-cafe-primary text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>

                <div className="flex items-center ml-auto">
                  <p className="text-sm font-semibold text-cafe-text">₱{item.totalPrice * item.quantity}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-card rounded-xl p-4 flex-shrink-0" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center justify-between text-sm font-semibold text-cafe-text mb-4">
          <span>Total:</span>
          <span className="text-white">₱{(getTotalPrice() || 0).toFixed(2)}</span>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={onContinueShopping}
            className="flex-1 text-white py-2 rounded-xl hover:opacity-90 transition-all duration-200 transform hover:scale-[1.02] font-medium text-sm border border-white/30"
            style={{ backgroundColor: 'transparent' }}
          >
            Add More
          </button>
          <button
            onClick={onCheckout}
            className="flex-1 text-neutral-800 py-2 rounded-xl hover:opacity-90 transition-all duration-200 transform hover:scale-[1.02] font-medium text-sm"
            style={{ backgroundColor: '#F5F0E6' }}
          >
            Checkout
          </button>
        </div>
      </div>
    </div>
  );
};

export default Cart;