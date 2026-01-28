import React from 'react';
import { ShoppingCart } from 'lucide-react';

interface FloatingCartButtonProps {
  itemCount: number;
  onCartClick: () => void;
}

const FloatingCartButton: React.FC<FloatingCartButtonProps> = ({ itemCount, onCartClick }) => {
  if (itemCount === 0) return null;

  return (
    <button
      onClick={onCartClick}
      className="fixed bottom-6 right-6 bg-gradient-to-r from-cafe-primary to-cafe-secondary text-neutral-800 p-4 rounded-full shadow-lg hover:from-cafe-secondary hover:to-cafe-primary transition-all duration-200 transform hover:scale-110 z-40 md:hidden glow-blue hover:glow-blue-strong"
    >
      <div className="relative">
        <ShoppingCart className="h-6 w-6" />
        <span className="absolute -top-2 -right-2 glass-strong text-neutral-800 text-xs font-semibold rounded-full h-5 w-5 flex items-center justify-center border border-cafe-primary glow-blue">
          {itemCount}
        </span>
      </div>
    </button>
  );
};

export default FloatingCartButton;