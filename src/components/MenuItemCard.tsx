import React, { useState, useRef, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { MenuItem, Variation } from '../types';
import { useMemberAuth } from '../hooks/useMemberAuth';
import { useMemberDiscounts } from '../hooks/useMemberDiscounts';

interface MenuItemCardProps {
  item: MenuItem;
  onAddToCart: (item: MenuItem, quantity?: number, variation?: Variation) => void;
  quantity: number;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onItemAdded?: () => void; // Callback when item is added to cart
}

const MenuItemCard: React.FC<MenuItemCardProps> = ({ 
  item, 
  onAddToCart, 
  quantity, 
  onUpdateQuantity,
  onItemAdded
}) => {
  const [showCustomization, setShowCustomization] = useState(false);
  const [selectedVariation, setSelectedVariation] = useState<Variation | undefined>(
    item.variations?.[0]
  );
  const nameRef = useRef<HTMLHeadingElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  const { currentMember, isReseller } = useMemberAuth();
  const { getDiscountForItem } = useMemberDiscounts();
  const [memberDiscounts, setMemberDiscounts] = useState<Record<string, number>>({});
  const [priceUpdateKey, setPriceUpdateKey] = useState(0); // Force re-render when member changes
  const [tappedVariationId, setTappedVariationId] = useState<string | null>(null);
  const [descriptionVisible, setDescriptionVisible] = useState(true);

  // Reset description visible when modal closes
  useEffect(() => {
    if (!showCustomization) setDescriptionVisible(true);
  }, [showCustomization]);

  // Force price update when member changes (login/logout)
  useEffect(() => {
    setPriceUpdateKey(prev => prev + 1);
  }, [currentMember?.id, currentMember?.user_type]);

  // Fetch member discounts for all variations when component mounts or member changes
  useEffect(() => {
    const fetchDiscounts = async () => {
      if (isReseller() && currentMember && item.variations) {
        const discounts: Record<string, number> = {};
        for (const variation of item.variations) {
          const discount = await getDiscountForItem(currentMember.id, item.id, variation.id);
          if (discount) {
            discounts[variation.id] = discount.selling_price;
          }
        }
        setMemberDiscounts(discounts);
      } else {
        setMemberDiscounts({});
      }
    };
    fetchDiscounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReseller(), currentMember?.id, item.id, priceUpdateKey]);

  // Calculate discounted price for a variation/currency package
  const getDiscountedPrice = async (basePrice: number, variationId?: string): Promise<number> => {
    // If user is reseller and has member discount for this variation, use it
    if (isReseller() && currentMember && variationId && memberDiscounts[variationId]) {
      return memberDiscounts[variationId];
    }
    
    // Otherwise, use regular discount logic
    if (item.isOnDiscount && item.discountPercentage !== undefined) {
      const discountAmount = basePrice * item.discountPercentage;
      return basePrice - discountAmount;
    }
    return basePrice;
  };

  // Get the variation object by ID
  const getVariationById = (variationId?: string): Variation | undefined => {
    if (!variationId || !item.variations) return undefined;
    return item.variations.find(v => v.id === variationId);
  };

  // Synchronous version for immediate display (uses cached discounts)
  const getDiscountedPriceSync = (basePrice: number, variationId?: string): number => {
    const variation = getVariationById(variationId);
    
    // Priority 1: If user is reseller and variation has reseller_price, use it
    if (isReseller() && currentMember && variation?.reseller_price !== undefined) {
      return variation.reseller_price;
    }
    
    // Priority 2: If user is a member (end_user, not reseller) and variation has member_price, use it
    if (currentMember && !isReseller() && currentMember.user_type === 'end_user' && variation?.member_price !== undefined) {
      return variation.member_price;
    }
    
    // Priority 3: If user is reseller and has member discount for this variation, use it
    if (isReseller() && currentMember && variationId && memberDiscounts[variationId]) {
      return memberDiscounts[variationId];
    }
    
    // Priority 4: Otherwise, use regular discount logic
    if (item.isOnDiscount && item.discountPercentage !== undefined) {
      const discountAmount = basePrice * item.discountPercentage;
      return basePrice - discountAmount;
    }
    
    // Priority 5: Default to base price
    return basePrice;
  };

  const handleCardClick = () => {
    if (!item.available) return;
    setShowCustomization(true);
  };

  const handleItemSelect = (variation?: Variation) => {
    onAddToCart(item, 1, variation || selectedVariation);
    setShowCustomization(false);
    setSelectedVariation(item.variations?.[0]);
    // Call the callback to redirect to cart after adding item
    if (onItemAdded) {
      onItemAdded();
    }
  };

  // Show check icon briefly after tap, then add to cart (works on mobile and desktop)
  const handlePackageTap = (variation: Variation) => {
    setTappedVariationId(variation.id);
    setTimeout(() => {
      handleItemSelect(variation);
      setTappedVariationId(null);
    }, 400);
  };

  // Check if text overflows and needs scrolling
  useEffect(() => {
    const checkOverflow = () => {
      if (!nameRef.current) return;
      
      const element = nameRef.current;
      const isOverflowing = element.scrollWidth > element.clientWidth;
      setShouldScroll(isOverflowing);
    };

    // Use setTimeout to ensure DOM is fully rendered
    const timeoutId = setTimeout(() => {
      checkOverflow();
    }, 100);

    window.addEventListener('resize', checkOverflow);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', checkOverflow);
    };
  }, [item.name]);

  return (
    <>
      <div 
        onClick={handleCardClick}
        className={`relative flex flex-row items-center transition-all duration-300 group rounded-lg p-2 sm:p-2.5 gap-2 ${!item.available ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer menu-game-card'}`}
        style={{
          background: '#F5F0E6',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          minHeight: '72px'
        }}
        onMouseEnter={(e) => {
          if (item.available) {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
            e.currentTarget.style.backdropFilter = 'blur(16px)';
            e.currentTarget.style.webkitBackdropFilter = 'blur(16px)';
            e.currentTarget.style.boxShadow = '0 8px 32px 0 rgba(0, 0, 0, 0.37)';
          }
        }}
        onMouseLeave={(e) => {
          if (item.available) {
            e.currentTarget.style.background = '#F5F0E6';
            e.currentTarget.style.backdropFilter = 'none';
            e.currentTarget.style.webkitBackdropFilter = 'none';
            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
          }
        }}
      >
        {/* Closed Text Overlay for unavailable items */}
        {!item.available && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-xl z-10">
            <span className="text-white font-bold text-lg sm:text-xl opacity-90 font-anton italic">Closed</span>
          </div>
        )}
        {/* Square Game Icon on Left - smaller for single-line text fit */}
        <div className="relative w-14 h-14 sm:w-16 sm:h-16 flex-shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-cafe-darkCard to-cafe-darkBg transition-transform duration-300 group-hover:scale-105">
          {item.image ? (
            <img
              src={item.image}
              alt={item.name}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          <div className={`absolute inset-0 flex items-center justify-center ${item.image ? 'hidden' : ''}`}>
            <div className="text-2xl sm:text-3xl opacity-20 text-gray-400">🎮</div>
          </div>
        </div>
        
        {/* Game Name and Info on Right - single line each with ellipsis */}
        <div className="flex-1 overflow-hidden min-w-0">
          <h4 
            ref={nameRef}
            className={`text-neutral-800 font-bold text-[10px] sm:text-xs mb-0.5 ${
              shouldScroll ? 'animate-scroll-text' : 'truncate'
            }`}
            style={shouldScroll ? {
              display: 'inline-block',
              whiteSpace: 'nowrap',
            } : {}}
            title={item.name}
          >
            {shouldScroll ? (
              <>
                <span>{item.name}</span>
                <span className="mx-4">•</span>
                <span>{item.name}</span>
              </>
            ) : (
              item.name
            )}
          </h4>
          {item.subtitle && (
            <p className="text-[9px] sm:text-[10px] text-neutral-700 truncate" title={item.subtitle}>
              {item.subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Item Selection Modal */}
      {showCustomization && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowCustomization(false)}>
          <div className="flex flex-col rounded-2xl max-w-2xl w-full max-h-[90vh] shadow-2xl overflow-hidden bg-cafe-darkBg border border-cafe-primary/20" onClick={(e) => e.stopPropagation()}>
            <div 
              className="flex-shrink-0 p-6 rounded-t-2xl relative overflow-hidden" 
              style={{ 
                backgroundImage: item.image ? `url(${item.image})` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                zIndex: 20,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                minHeight: '120px'
              }}
            >
              {/* Dark overlay for text readability - covers entire header including edges */}
              <div 
                className="absolute inset-0 bg-black/60 rounded-t-2xl"
                style={{
                  zIndex: 1,
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0
                }}
              />
              
              {/* Border on top of overlay */}
              <div 
                className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/20 rounded-b-2xl"
                style={{
                  zIndex: 2
                }}
              />
              
              {/* Content uses full width; only minimal right padding so X doesn't overlap text */}
              <div className="relative z-10 w-full max-w-full pr-12 min-w-0">
                <h3 className="text-xl font-bold text-white drop-shadow-lg">{item.name}</h3>
                {item.subtitle && (
                  <p className="text-sm text-white/95 mt-1 drop-shadow-md">{item.subtitle}</p>
                )}
                {item.description && (
                  <div className="mt-2">
                    {descriptionVisible ? (
                      <>
                        <p className="text-[10px] sm:text-xs text-white/90 drop-shadow-md whitespace-pre-line break-words max-w-full">{item.description}</p>
                        <div className="flex justify-end mt-1">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setDescriptionVisible(false); }}
                            className="text-xs text-white/80 hover:text-white underline drop-shadow-md"
                          >
                            Show less
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setDescriptionVisible(true); }}
                          className="text-xs text-white/80 hover:text-white underline drop-shadow-md"
                        >
                          Show more
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowCustomization(false)}
                className="absolute top-4 right-4 z-20 p-1.5 hover:bg-white/20 rounded-full transition-colors duration-200 flex-shrink-0"
                aria-label="Close"
              >
                <X className="h-5 w-5 text-white drop-shadow-lg" />
              </button>
            </div>

            <div 
              className="flex-1 overflow-y-auto min-h-0 relative bg-cafe-darkBg" 
              style={{ 
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain'
              }}
            >
              {/* Fade-out gradient overlay at top - items fade as they approach header */}
              <div
                className="sticky top-0 left-0 right-0 z-10 pointer-events-none"
                style={{
                  height: '32px',
                  background: 'linear-gradient(to bottom, #0F0F0F 0%, rgba(15, 15, 15, 0.98) 20%, rgba(15, 15, 15, 0.7) 50%, rgba(15, 15, 15, 0.2) 80%, transparent 100%)',
                  marginBottom: '-32px'
                }}
              />
              
              <div className="p-6 pt-4">
                {/* Show currency packages grouped by category */}
                {item.variations && item.variations.length > 0 ? (
                  (() => {
                    // Group variations by category and track category sort order
                    const groupedByCategory: Record<string, { variations: Variation[], categorySort: number }> = {};
                    item.variations.forEach((variation) => {
                      const category = variation.category || 'Uncategorized';
                      const categorySort = variation.sort !== null && variation.sort !== undefined ? variation.sort : 999;
                      
                      if (!groupedByCategory[category]) {
                        groupedByCategory[category] = { variations: [], categorySort: 999 };
                      }
                      groupedByCategory[category].variations.push(variation);
                      // Use the minimum sort value as the category sort order
                      if (categorySort < groupedByCategory[category].categorySort) {
                        groupedByCategory[category].categorySort = categorySort;
                      }
                    });

                    // Sort categories by category sort order (sort field), then alphabetically
                    const sortedCategories = Object.keys(groupedByCategory).sort((a, b) => {
                      const sortA = groupedByCategory[a].categorySort;
                      const sortB = groupedByCategory[b].categorySort;
                      if (sortA !== sortB) {
                        return sortA - sortB;
                      }
                      return a.localeCompare(b);
                    });

                    // Sort variations within each category by sort_order, then by price
                    sortedCategories.forEach((category) => {
                      groupedByCategory[category].variations.sort((a, b) => {
                        const sortOrderA = a.sort_order || 0;
                        const sortOrderB = b.sort_order || 0;
                        if (sortOrderA !== sortOrderB) {
                          return sortOrderA - sortOrderB;
                        }
                        return a.price - b.price;
                      });
                    });

                    return (
                      <div className="space-y-6">
                        {sortedCategories.map((category, categoryIndex) => (
                          <div key={category}>
                            {/* Category Header */}
                            <h4 className="text-lg font-bold text-white mb-3 font-anton italic">{category}</h4>
                            
                            {/* Packages Grid */}
                            <div className="grid grid-cols-2 gap-3">
                              {groupedByCategory[category].variations.map((variation) => {
                                const originalPrice = variation.price;
                                // Recalculate price on every render to ensure it updates immediately on login/logout
                                const discountedPrice = getDiscountedPriceSync(originalPrice, variation.id);
                                const hasMemberDiscount = isReseller() && currentMember && memberDiscounts[variation.id];
                                const isDiscounted = hasMemberDiscount || (item.isOnDiscount && item.discountPercentage !== undefined);
                                
                                return (
                                  <button
                                    key={variation.id}
                                    onClick={() => handlePackageTap(variation)}
                                    className="bg-white rounded-lg p-3 text-left group shadow-md relative overflow-hidden package-card-hover"
                                    style={{
                                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                                    }}
                                  >
                                    {/* Check icon: visible on hover (desktop) and after tap (mobile) */}
                                    <div className={`absolute top-2 right-2 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center transition-opacity ${tappedVariationId === variation.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                      <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                                    </div>
                                    <div className="flex flex-col">
                                      <div className="font-semibold text-gray-900 text-[10px] sm:text-xs mb-1">
                                        {variation.name}
                                      </div>
                                      {variation.description && (
                                        <div className="text-[10px] sm:text-xs text-gray-600 mb-2 whitespace-pre-line break-words">
                                          {variation.description}
                                        </div>
                                      )}
                                      <div className="mt-auto">
                                        <div className="text-[10px] sm:text-xs font-bold text-gray-900">
                                          ₱{discountedPrice.toFixed(2)}
                                        </div>
                                        {isDiscounted && (
                                          <div className="flex items-center gap-2 mt-1">
                                            <div className="text-xs text-gray-500 line-through">
                                              ₱{originalPrice.toFixed(2)}
                                            </div>
                                            {hasMemberDiscount ? (
                                              <div className="text-xs text-green-600 font-semibold">
                                                Member Price
                                              </div>
                                            ) : (
                                              <div className="text-xs text-gray-900 font-semibold">
                                                -{(item.discountPercentage * 100).toFixed(0)}%
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>

                            {/* Divider between categories */}
                            {categoryIndex < sortedCategories.length - 1 && (
                              <div className="border-t border-white/20 my-4"></div>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()
                ) : (
                  <div className="text-center py-8 text-white/80">
                    No currency packages available
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MenuItemCard;