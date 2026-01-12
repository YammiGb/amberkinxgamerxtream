import React from 'react';
import { ShoppingCart } from 'lucide-react';
import { useSiteSettings } from '../hooks/useSiteSettings';

interface HeaderProps {
  cartItemsCount: number;
  onCartClick: () => void;
  onMenuClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ cartItemsCount, onCartClick, onMenuClick }) => {
  const { siteSettings } = useSiteSettings();

  return (
    <header className="sticky top-0 z-50 shadow-sm" style={{ 
      border: 'none',
      background: 'rgba(255, 255, 255, 0.1)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)'
    }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 md:py-3">
        <div className="flex items-center justify-between min-h-12 md:min-h-16">
          <button 
            onClick={onMenuClick}
            className="text-cafe-text hover:text-cafe-primary transition-colors duration-200 flex items-center"
          >
            <img 
              src="/image.png" 
              alt={siteSettings?.site_name || "AmberKin x GamerXtream"}
              className="h-10 sm:h-12 md:h-16 w-auto object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </button>

          <div className="flex items-center space-x-2">
            <button 
              onClick={onCartClick}
              className="relative p-2 text-cafe-text hover:text-cafe-primary hover:bg-cafe-primary/20 rounded-full transition-all duration-200"
            >
              <ShoppingCart className="h-6 w-6" />
              {cartItemsCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-gradient-to-r from-cafe-primary to-cafe-secondary text-white text-xs rounded-full h-5 w-5 flex items-center justify-center animate-bounce-gentle glow-blue">
                  {cartItemsCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;