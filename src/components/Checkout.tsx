import React, { useState, useMemo, useRef } from 'react';
import { ArrowLeft, Upload, Copy, Check, MousePointerClick, Download, Trash2 } from 'lucide-react';
import { CartItem, CustomField } from '../types';
import { usePaymentMethods, PaymentMethod } from '../hooks/usePaymentMethods';
import { useImageUpload } from '../hooks/useImageUpload';
import { useOrders } from '../hooks/useOrders';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { useMemberAuth } from '../hooks/useMemberAuth';
import { supabase } from '../lib/supabase';
import OrderStatusModal from './OrderStatusModal';

interface CheckoutProps {
  cartItems: CartItem[];
  totalPrice: number;
  onBack: () => void;
  onNavigateToMenu?: () => void; // Callback to navigate to menu (e.g., after order succeeded)
}

const Checkout: React.FC<CheckoutProps> = ({ cartItems, totalPrice, onBack, onNavigateToMenu }) => {
  const { paymentMethods } = usePaymentMethods();
  const { uploadImage, uploading: uploadingReceipt } = useImageUpload();
  const { createOrder } = useOrders();
  const { siteSettings } = useSiteSettings();
  const { currentMember } = useMemberAuth();
  const orderOption = siteSettings?.order_option || 'order_via_messenger';
  
  // Load saved state from localStorage
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(() => {
    return localStorage.getItem('amber_checkout_paymentMethodId');
  });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const paymentDetailsRef = useRef<HTMLDivElement>(null);
  const buttonsRef = useRef<HTMLDivElement>(null);
  /** On iOS, window.open must run in the same user gesture; we use the last copied message so we can open without awaiting. */
  const lastCopiedOrderMessageRef = useRef<string | null>(null);
  /** Current invoice count from DB (or last used); used so optimistic invoice number uses real count, not always 1. */
  const currentInvoiceCountRef = useRef<{ count: number; date: string } | null>(null);
  const [showScrollIndicator, setShowScrollIndicator] = useState(true);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('amber_checkout_customFieldValues');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptImageUrl, setReceiptImageUrl] = useState<string | null>(() => {
    return localStorage.getItem('amber_checkout_receiptImageUrl');
  });
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [hasCopiedMessage, setHasCopiedMessage] = useState(false);
  const [copiedAccountNumber, setCopiedAccountNumber] = useState(false);
  const [copiedAccountName, setCopiedAccountName] = useState(false);
  const [bulkInputValues, setBulkInputValues] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('amber_checkout_bulkInputValues');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [bulkSelectedGames, setBulkSelectedGames] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('amber_checkout_bulkSelectedGames');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [useBulkInput, setUseBulkInput] = useState(() => {
    return localStorage.getItem('amber_checkout_useBulkInput') === 'true';
  });
  const [useMultipleAccounts, setUseMultipleAccounts] = useState(() => {
    return localStorage.getItem('amber_checkout_useMultipleAccounts') === 'true';
  });
  // Extra account slots per game (for "Add USERID" etc.) - key: originalId, value: count of extra accounts (0=1 account, 1=2 accounts)
  const [extraAccountCount, setExtraAccountCount] = useState<Record<string, number>>({});

  // Restore payment method from saved ID
  React.useEffect(() => {
    if (paymentMethodId && paymentMethods.length > 0) {
      const savedMethod = paymentMethods.find(m => m.id === paymentMethodId);
      if (savedMethod) {
        // Check if payment method is still available based on order total
        if (savedMethod.max_order_amount !== null && savedMethod.max_order_amount !== undefined) {
          if (totalPrice >= savedMethod.max_order_amount) {
            // Payment method is hidden due to order total, clear selection
            setPaymentMethod(null);
            setPaymentMethodId(null);
            localStorage.removeItem('amber_checkout_paymentMethodId');
            return;
          }
        }
        setPaymentMethod(savedMethod);
      }
    }
  }, [paymentMethodId, paymentMethods, totalPrice]);

  // Update paymentMethodId when paymentMethod changes
  React.useEffect(() => {
    if (paymentMethod) {
      setPaymentMethodId(paymentMethod.id);
      try {
        localStorage.setItem('amber_checkout_paymentMethodId', paymentMethod.id);
      } catch (e) {
        if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)) {
          console.warn('localStorage quota exceeded');
        }
      }
    } else {
      setPaymentMethodId(null);
      localStorage.removeItem('amber_checkout_paymentMethodId');
    }
  }, [paymentMethod]);

  // Clear selected payment method if it becomes unavailable due to order total
  React.useEffect(() => {
    if (paymentMethod && paymentMethod.max_order_amount !== null && paymentMethod.max_order_amount !== undefined) {
      if (totalPrice >= paymentMethod.max_order_amount) {
        setPaymentMethod(null);
        setPaymentMethodId(null);
        localStorage.removeItem('amber_checkout_paymentMethodId');
      }
    }
  }, [totalPrice, paymentMethod]);

  // Save state to localStorage whenever it changes (catch quota errors so app doesn't crash)
  const safeSetItem = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)) {
        console.warn('localStorage quota exceeded, skipping save for', key);
      } else {
        throw e;
      }
    }
  };

  React.useEffect(() => {
    safeSetItem('amber_checkout_customFieldValues', JSON.stringify(customFieldValues));
  }, [customFieldValues]);

  React.useEffect(() => {
    if (receiptImageUrl) {
      safeSetItem('amber_checkout_receiptImageUrl', receiptImageUrl);
    } else {
      localStorage.removeItem('amber_checkout_receiptImageUrl');
    }
  }, [receiptImageUrl]);

  // Do not persist receiptPreview to localStorage - base64 images exceed quota

  React.useEffect(() => {
    safeSetItem('amber_checkout_bulkInputValues', JSON.stringify(bulkInputValues));
  }, [bulkInputValues]);

  React.useEffect(() => {
    safeSetItem('amber_checkout_bulkSelectedGames', JSON.stringify(bulkSelectedGames));
  }, [bulkSelectedGames]);

  React.useEffect(() => {
    safeSetItem('amber_checkout_useBulkInput', useBulkInput.toString());
  }, [useBulkInput]);

  React.useEffect(() => {
    safeSetItem('amber_checkout_useMultipleAccounts', useMultipleAccounts.toString());
  }, [useMultipleAccounts]);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [generatedInvoiceNumber, setGeneratedInvoiceNumber] = useState<string | null>(null);
  const [invoiceNumberDate, setInvoiceNumberDate] = useState<string | null>(null);

  // Load current invoice count from DB on mount so optimistic number (iOS/Mac) uses real count
  React.useEffect(() => {
    const load = async () => {
      const { data: countData } = await supabase.from('site_settings').select('value').eq('id', 'invoice_count').maybeSingle();
      const { data: dateData } = await supabase.from('site_settings').select('value').eq('id', 'invoice_count_date').maybeSingle();
      const lastDate = dateData?.value || '';
      const count = countData?.value ? parseInt(countData.value, 10) : 0;
      currentInvoiceCountRef.current = { count: isNaN(count) ? 0 : count, date: lastDate };
    };
    load();
  }, []);

  // Extract original menu item ID from cart item ID (format: "menuItemId:::CART:::timestamp-random")
  // This allows us to group all packages from the same game together
  const getOriginalMenuItemId = (cartItemId: string): string => {
    const parts = cartItemId.split(':::CART:::');
    return parts.length > 1 ? parts[0] : cartItemId;
  };

  // Group custom fields by item/game
  // If any game has custom fields, show those grouped by game. Otherwise, show default "IGN" field
  // Deduplicate by original menu item ID to avoid showing the same fields multiple times for the same game
  // (even if different packages/variations are selected)
  const itemsWithCustomFields = useMemo(() => {
    const itemsWithFields = cartItems.filter(item => item.customFields && item.customFields.length > 0);
    // Deduplicate by original menu item ID
    const uniqueItems = new Map<string, typeof cartItems[0]>();
    itemsWithFields.forEach(item => {
      const originalId = getOriginalMenuItemId(item.id);
      if (!uniqueItems.has(originalId)) {
        uniqueItems.set(originalId, item);
      }
    });
    return Array.from(uniqueItems.values());
  }, [cartItems]);

  const hasAnyCustomFields = itemsWithCustomFields.length > 0;

  // Detect if we can use multiple accounts (same game with different packages)
  const canUseMultipleAccounts = useMemo(() => {
    if (!hasAnyCustomFields) return false;
    
    // Group cart items by original menu item ID (game)
    const itemsByGame = new Map<string, typeof cartItems>();
    cartItems.forEach(item => {
      const originalId = getOriginalMenuItemId(item.id);
      if (!itemsByGame.has(originalId)) {
        itemsByGame.set(originalId, []);
      }
      itemsByGame.get(originalId)!.push(item);
    });
    
    // Check if any game has multiple different packages/variations
    for (const [gameId, items] of itemsByGame.entries()) {
      if (items.length > 1) {
        // Check if they have different variations
        const variationIds = new Set(items.map(item => item.selectedVariation?.id || 'none'));
        if (variationIds.size > 1) {
          return true;
        }
      }
    }
    
    return false;
  }, [cartItems, hasAnyCustomFields]);

  // Get items grouped by game and variation for multiple accounts
  const itemsByGameAndVariation = useMemo(() => {
    if (!canUseMultipleAccounts) return [];
    
    const grouped = new Map<string, Map<string, typeof cartItems[0][]>>();
    
    cartItems.forEach(item => {
      const originalId = getOriginalMenuItemId(item.id);
      const variationId = item.selectedVariation?.id || 'none';
      
      if (!grouped.has(originalId)) {
        grouped.set(originalId, new Map());
      }
      const gameGroup = grouped.get(originalId)!;
      
      if (!gameGroup.has(variationId)) {
        gameGroup.set(variationId, []);
      }
      gameGroup.get(variationId)!.push(item);
    });
    
    // Convert to array format
    const result: Array<{
      gameId: string;
      gameName: string;
      variationId: string;
      variationName: string;
      items: typeof cartItems[0][];
    }> = [];
    
    grouped.forEach((variations, gameId) => {
      const firstItem = Array.from(variations.values())[0][0];
      const gameName = firstItem.name;
      
      variations.forEach((items, variationId) => {
        const variationName = items[0].selectedVariation?.name || 'Default';
        result.push({
          gameId,
          gameName,
          variationId,
          variationName,
          items
        });
      });
    });
    
    return result;
  }, [cartItems, canUseMultipleAccounts]);

  // Get bulk input fields based on selected games - position-based
  // If selected games have N fields, show N bulk input fields
  const bulkInputFields = useMemo(() => {
    if (bulkSelectedGames.length === 0) return [];
    
    // Get all selected items (bulkSelectedGames contains original menu item IDs)
    const selectedItems = itemsWithCustomFields.filter(item => 
      bulkSelectedGames.includes(getOriginalMenuItemId(item.id))
    );
    
    if (selectedItems.length === 0) return [];
    
    // Find the maximum number of fields across all selected games
    const maxFields = Math.max(...selectedItems.map(item => item.customFields?.length || 0));
    
    if (maxFields === 0) return [];
    
    // Create fields array based on position (index)
    // Use the first selected item's fields as reference for labels
    const referenceItem = selectedItems[0];
    const fields: Array<{ index: number, field: CustomField | null }> = [];
    
    for (let i = 0; i < maxFields; i++) {
      // Try to get field from reference item, or use a placeholder
      const field = referenceItem.customFields?.[i] || null;
      fields.push({ index: i, field });
    }
    
    return fields;
  }, [bulkSelectedGames, itemsWithCustomFields]);

  // Sync bulk input values to selected games by position (including extra accounts)
  React.useEffect(() => {
    if (bulkSelectedGames.length === 0) return;
    
    const updates: Record<string, string> = {};
    
    // Get selected items (bulkSelectedGames contains original menu item IDs)
    const selectedItems = itemsWithCustomFields.filter(item => 
      bulkSelectedGames.includes(getOriginalMenuItemId(item.id))
    );
    
    // For each bulk input field (by index)
    Object.entries(bulkInputValues).forEach(([fieldIndexStr, value]) => {
      const fieldIndex = parseInt(fieldIndexStr, 10);
      
      // Apply to all selected games at the same field position
      selectedItems.forEach(item => {
        if (item.customFields && item.customFields[fieldIndex]) {
          const field = item.customFields[fieldIndex];
          const originalId = getOriginalMenuItemId(item.id);
          const extraCount = extraAccountCount[originalId] ?? 0;
          const totalAccounts = 1 + extraCount;
          
          // Apply to Account 1 and all extra accounts (Account 2, 3, 4, ...)
          for (let accIdx = 0; accIdx < totalAccounts; accIdx++) {
            const valueKey = accIdx === 0
              ? `${originalId}_${field.key}`
              : `${originalId}_acc${accIdx}_${field.key}`;
            updates[valueKey] = value;
          }
        }
      });
    });
    
    if (Object.keys(updates).length > 0) {
      setCustomFieldValues(prev => ({ ...prev, ...updates }));
    }
  }, [bulkInputValues, bulkSelectedGames, itemsWithCustomFields, extraAccountCount]);

  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Scroll to payment details when payment method is selected
  React.useEffect(() => {
    if (paymentMethod && paymentDetailsRef.current) {
      setTimeout(() => {
        paymentDetailsRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start'
        });
      }, 100);
    }
  }, [paymentMethod]);

  // Check if buttons section is visible to hide scroll indicator
  React.useEffect(() => {
    if (!buttonsRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // If buttons are visible, hide the scroll indicator
          if (entry.isIntersecting) {
            setShowScrollIndicator(false);
          } else {
            setShowScrollIndicator(true);
          }
        });
      },
      {
        threshold: 0.1, // Trigger when 10% of the element is visible
        rootMargin: '-50px 0px' // Add some margin to trigger earlier
      }
    );

    observer.observe(buttonsRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  const selectedPaymentMethod = paymentMethod;
  
  const handleBulkInputChange = (fieldKey: string, value: string) => {
    setBulkInputValues(prev => ({ ...prev, [fieldKey]: value }));
  };

  const handleBulkGameSelectionChange = (itemId: string, checked: boolean) => {
    const originalId = getOriginalMenuItemId(itemId);
    if (checked) {
      setBulkSelectedGames(prev => [...prev, originalId]);
    } else {
      setBulkSelectedGames(prev => prev.filter(id => id !== originalId));
    }
  };

  const removeExtraAccount = (originalId: string, accIdxToRemove: number, fieldKeys: string[]) => {
    const currentExtra = extraAccountCount[originalId] ?? 0;
    if (currentExtra <= 0 || accIdxToRemove < 1) return;
    setExtraAccountCount(prev => ({ ...prev, [originalId]: currentExtra - 1 }));
    setCustomFieldValues(prev => {
      const next = { ...prev };
      const totalAccounts = 1 + currentExtra;
      fieldKeys.forEach(fieldKey => {
        delete next[`${originalId}_acc${accIdxToRemove}_${fieldKey}`];
        for (let j = accIdxToRemove + 1; j < totalAccounts; j++) {
          const fromKey = `${originalId}_acc${j}_${fieldKey}`;
          const toKey = `${originalId}_acc${j - 1}_${fieldKey}`;
          if (prev[fromKey] !== undefined) next[toKey] = prev[fromKey];
          delete next[fromKey];
        }
      });
      return next;
    });
  };


  const handleReceiptUpload = async (file: File) => {
    try {
      setReceiptError(null);
      setReceiptFile(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setReceiptPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      // Upload to Supabase
      const url = await uploadImage(file, 'payment-receipts');
      setReceiptImageUrl(url);
    } catch (error) {
      console.error('Error uploading receipt:', error);
      setReceiptError(error instanceof Error ? error.message : 'Failed to upload receipt');
      setReceiptFile(null);
      setReceiptPreview(null);
    }
  };

  const handleReceiptRemove = () => {
    setReceiptFile(null);
    setReceiptImageUrl(null);
    setReceiptPreview(null);
    setReceiptError(null);
    setHasCopiedMessage(false); // Reset copy state when receipt is removed
    setGeneratedInvoiceNumber(null); // Reset invoice number when receipt is removed
    setInvoiceNumberDate(null);
  };

  // Helper function to get current date in Philippine timezone (Asia/Manila, UTC+8)
  const getPhilippineDate = () => {
    const now = new Date();
    // Convert to Philippine time (UTC+8)
    const philippineTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
    // Get date components
    const year = philippineTime.getFullYear();
    const monthNum = philippineTime.getMonth() + 1; // 1-12
    const monthStr = String(monthNum).padStart(2, '0');
    const day = String(philippineTime.getDate()).padStart(2, '0');
    return {
      dateString: `${year}-${monthStr}-${day}`, // YYYY-MM-DD
      dayOfMonth: philippineTime.getDate(),
      month: monthNum // 1-12 for invoice format (e.g. 2 for February)
    };
  };

  // Generate invoice number (format: AKGXT{month}M{day}D{orderNumber})
  // Example: AKGXT2M17D1 = 1st order on Feb 17
  //          AKGXT2M17D2 = 2nd order on Feb 17
  // Resets daily at 12:00 AM Philippine time (Asia/Manila, UTC+8)
  // The invoice number increments each time "Copy Invoice Order" is clicked (forceNew = true)
  // Subsequent calls (like "Order via Messenger") will reuse the same invoice number (forceNew = false)
  // Uses database (site_settings) to track invoice count with proper locking to prevent race conditions
  const generateInvoiceNumber = async (forceNew: boolean = false): Promise<string> => {
    const { dateString: todayStr, dayOfMonth, month } = getPhilippineDate();
    
    // Check if we already generated an invoice number for today and forceNew is false
    // If forceNew is false, reuse the existing number from state
    if (!forceNew && generatedInvoiceNumber && invoiceNumberDate === todayStr) {
      return generatedInvoiceNumber;
    }

    try {
      // Get invoice count from database (site_settings table)
      const countSettingId = 'invoice_count';
      const dateSettingId = 'invoice_count_date';
      
      // Fetch current invoice count and date from database
      // Use a transaction-like approach: fetch, check, update
      const { data: countData, error: countError } = await supabase
        .from('site_settings')
        .select('value')
        .eq('id', countSettingId)
        .maybeSingle();
      
      if (countError) {
        console.error('Error fetching invoice count:', countError);
        // Continue with default value
      }
      
      const { data: dateData, error: dateError } = await supabase
        .from('site_settings')
        .select('value')
        .eq('id', dateSettingId)
        .maybeSingle();
      
      if (dateError) {
        console.error('Error fetching invoice count date:', dateError);
        // Continue with default value
      }
      
      let currentCount = 0;
      const lastDate = dateData?.value || null;
      
      // Check if we need to reset (new day)
      if (lastDate !== todayStr) {
        // New day - reset the count to 0
        currentCount = 0;
        
        // Update both count and date in database atomically
        const { error: updateCountError } = await supabase
          .from('site_settings')
          .upsert({ id: countSettingId, value: '0', type: 'number', description: 'Current invoice count for the day' }, { onConflict: 'id' });
        
        if (updateCountError) {
          console.error('Error updating invoice count:', updateCountError);
        }
        
        const { error: updateDateError } = await supabase
          .from('site_settings')
          .upsert({ id: dateSettingId, value: todayStr, type: 'text', description: 'Date of the current invoice count' }, { onConflict: 'id' });
        
        if (updateDateError) {
          console.error('Error updating invoice date:', updateDateError);
        }
      } else {
        // Same day - get current count from database
        currentCount = countData?.value ? parseInt(countData.value, 10) : 0;
      }
      
      // If forceNew is true (Copy button clicked), always increment the count
      // This ensures each new order gets a new invoice number
      if (forceNew) {
        currentCount += 1;
        
        // Update count in database - ensure this completes before returning
        const { error: updateError } = await supabase
          .from('site_settings')
          .upsert({ id: countSettingId, value: currentCount.toString(), type: 'number', description: 'Current invoice count for the day' }, { onConflict: 'id' });
        
        if (updateError) {
          console.error('Error updating invoice count:', updateError);
          // Still use the incremented count even if update fails
        }
      } else {
        // If forceNew is false and no count exists, start at 1
        if (currentCount === 0) {
          currentCount = 1;
          const { error: updateError } = await supabase
            .from('site_settings')
            .upsert({ id: countSettingId, value: currentCount.toString(), type: 'number', description: 'Current invoice count for the day' }, { onConflict: 'id' });
          
          if (updateError) {
            console.error('Error updating invoice count:', updateError);
          }
        }
      }

      const orderNumber = currentCount;

      // Format: AKGXT{month}M{day}D{orderNumber}
      // Example: AKGXT2M17D1 (1st order on Feb 17), AKGXT2M17D2 (2nd order on Feb 17), etc.
      const invoiceNumber = `AKGXT${month}M${dayOfMonth}D${orderNumber}`;
      
      setGeneratedInvoiceNumber(invoiceNumber);
      setInvoiceNumberDate(todayStr);
      currentInvoiceCountRef.current = { count: orderNumber, date: todayStr };
      
      return invoiceNumber;
    } catch (error) {
      console.error('Error generating invoice number:', error);
      // Fallback to a simple format if there's an error
      const { dayOfMonth, month } = getPhilippineDate();
      return `AKGXT${month}M${dayOfMonth}D1`;
    }
  };

  /** Convert label text to Unicode Mathematical Bold for plain-text message (Messenger/copy). */
  const toBold = (s: string): string => {
    let r = '';
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c >= 65 && c <= 90) r += String.fromCodePoint(0x1D400 + c - 65);       // A-Z
      else if (c >= 97 && c <= 122) r += String.fromCodePoint(0x1D41A + c - 97); // a-z
      else if (c >= 48 && c <= 57) r += String.fromCodePoint(0x1D7CE + c - 48);  // 0-9
      else r += s[i];
    }
    return r;
  };

  // Generate the order message text
  const generateOrderMessage = async (forceNewInvoice: boolean = false): Promise<string> => {
    // Generate invoice number first
    // forceNewInvoice is true when "Copy Invoice Order" is clicked to generate a new number
    // forceNewInvoice is false when "Order via Messenger" is clicked to reuse existing number
    const invoiceNumber = await generateInvoiceNumber(forceNewInvoice);
    
    // Build message lines
    const lines: string[] = [];
    
    // Invoice number
    lines.push(`${toBold('INVOICE')} # ${invoiceNumber}`);
    lines.push(''); // Break after invoice
    
    if (hasAnyCustomFields) {
      const hasExtraAccounts = useMultipleAccounts && Object.values(extraAccountCount).some(c => c > 0);
      if (hasExtraAccounts) {
        itemsWithCustomFields.forEach(item => {
          const originalId = getOriginalMenuItemId(item.id);
          const extraCount = extraAccountCount[originalId] ?? 0;
          if (extraCount === 0) return;
          const totalAccounts = 1 + extraCount;
          const cartItemsForGame = cartItems.filter(c => getOriginalMenuItemId(c.id) === originalId);
          lines.push(`${toBold('GAME')}: ${item.name}`);
          for (let accIdx = 0; accIdx < totalAccounts; accIdx++) {
            const fields = (item.customFields ?? []).map(field => {
              const valueKey = accIdx === 0 ? `${originalId}_${field.key}` : `${originalId}_acc${accIdx}_${field.key}`;
              const value = customFieldValues[valueKey] || '';
              return value ? { label: field.label, value } : null;
            }).filter(Boolean) as Array<{ label: string, value: string }>;
            if (fields.length > 0) {
              if (totalAccounts > 1) lines.push(`${toBold(`Account ${accIdx + 1}`)}:`);
              fields.forEach(f => lines.push(`  ${toBold(f.label)}: ${f.value}`));
            }
          }
          cartItemsForGame.forEach(cItem => {
            let orderLine = `${toBold('ORDER')}: ${cItem.selectedVariation?.name || cItem.name}`;
            if (cItem.quantity > 1) orderLine += ` x${cItem.quantity}`;
            orderLine += ` - ₱${cItem.totalPrice * cItem.quantity}`;
            lines.push(orderLine);
          });
        });
        const gamesWithExtraIds = new Set(
          itemsWithCustomFields.filter(i => (extraAccountCount[getOriginalMenuItemId(i.id)] ?? 0) > 0).map(i => getOriginalMenuItemId(i.id))
        );
        const itemsWithoutFields = cartItems.filter(c => !c.customFields || c.customFields.length === 0);
        cartItems.filter(c => !gamesWithExtraIds.has(getOriginalMenuItemId(c.id))).forEach(cartItem => {
          const originalId = getOriginalMenuItemId(cartItem.id);
          const item = itemsWithCustomFields.find(i => getOriginalMenuItemId(i.id) === originalId);
          if (!item?.customFields?.length) return;
          const fields = item.customFields.map(field => {
            const valueKey = `${originalId}_${field.key}`;
            const value = customFieldValues[valueKey] || '';
            return value ? { label: field.label, value } : null;
          }).filter(Boolean) as Array<{ label: string, value: string }>;
          if (fields.length > 0) {
            lines.push(`${toBold('GAME')}: ${item.name}`);
            fields.forEach(f => lines.push(`${toBold(f.label)}: ${f.value}`));
            let orderLine = `${toBold('ORDER')}: ${cartItem.selectedVariation?.name || cartItem.name}`;
            if (cartItem.quantity > 1) orderLine += ` x${cartItem.quantity}`;
            orderLine += ` - ₱${cartItem.totalPrice * cartItem.quantity}`;
            lines.push(orderLine);
          }
        });
        if (itemsWithoutFields.length > 0) {
          const uniqueGames = [...new Set(itemsWithoutFields.map(c => c.name))];
          lines.push(`${toBold('GAME')}: ${uniqueGames.join(', ')}`);
          itemsWithoutFields.forEach(c => {
            let orderLine = `${toBold('ORDER')}: ${c.selectedVariation?.name || c.name}`;
            if (c.quantity > 1) orderLine += ` x${c.quantity}`;
            orderLine += ` - ₱${c.totalPrice * c.quantity}`;
            lines.push(orderLine);
          });
        }
      } else {
        // Build game/order sections (single account or bulk mode)
        const gamesByFieldValues = new Map<string, { games: string[], items: CartItem[], fields: Array<{ label: string, value: string }> }>();
      const itemsWithoutFields: CartItem[] = [];
      
      cartItems.forEach(cartItem => {
        const originalId = getOriginalMenuItemId(cartItem.id);
        const item = itemsWithCustomFields.find(i => getOriginalMenuItemId(i.id) === originalId);
        
        if (!item || !item.customFields || item.customFields.length === 0) {
          // Item without custom fields, handle separately
          itemsWithoutFields.push(cartItem);
          return;
        }
        
        const fields = item.customFields.map(field => {
          const valueKey = `${originalId}_${field.key}`;
          const value = customFieldValues[valueKey] || '';
          return value ? { label: field.label, value } : null;
        }).filter(Boolean) as Array<{ label: string, value: string }> || [];
        
        if (fields.length === 0) {
          // No field values, treat as item without fields
          itemsWithoutFields.push(cartItem);
          return;
        }
        
        // Create a key based on field values (to group games with same values)
        const valueKey = fields.map(f => `${f.label}:${f.value}`).join('|');
        
        if (!gamesByFieldValues.has(valueKey)) {
          gamesByFieldValues.set(valueKey, { games: [], items: [], fields });
        }
        const group = gamesByFieldValues.get(valueKey)!;
        if (!group.games.includes(item.name)) {
          group.games.push(item.name);
        }
        group.items.push(cartItem);
        group.fields = fields; // Use the fields from this item
      });
      
      // Build sections for each group
      gamesByFieldValues.forEach(({ games, items, fields }) => {
        // Game name (only once if multiple games share same fields)
        lines.push(`${toBold('GAME')}: ${games.join(', ')}`);
        
        // ID & SERVER or other fields
        if (fields.length === 1) {
          lines.push(`${toBold(fields[0].label)}: ${fields[0].value}`);
        } else if (fields.length > 1) {
          // Combine fields with & if multiple
          const allValuesSame = fields.every(f => f.value === fields[0].value);
          if (allValuesSame) {
            // All values same, combine labels with &
            const labels = fields.map(f => f.label);
            if (labels.length === 2) {
              lines.push(`${toBold(labels[0])} & ${toBold(labels[1])}: ${fields[0].value}`);
            } else {
              const allButLast = labels.slice(0, -1).map(l => toBold(l)).join(', ');
              const lastLabel = toBold(labels[labels.length - 1]);
              lines.push(`${allButLast} & ${lastLabel}: ${fields[0].value}`);
            }
          } else {
            // Different values, show each field separately
            const fieldPairs = fields.map(f => `${toBold(f.label)}: ${f.value}`);
            lines.push(fieldPairs.join(', '));
          }
        }
        
        // Order items
        items.forEach(item => {
          let orderLine = `${toBold('ORDER')}: ${item.selectedVariation?.name || item.name}`;
          if (item.quantity > 1) {
            orderLine += ` x${item.quantity}`;
          }
          orderLine += ` - ₱${item.totalPrice * item.quantity}`;
          lines.push(orderLine);
        });
      });
      
      // Handle items without custom fields
      if (itemsWithoutFields.length > 0) {
        const uniqueGames = [...new Set(itemsWithoutFields.map((it: CartItem) => it.name))];
        lines.push(`${toBold('GAME')}: ${uniqueGames.join(', ')}`);
        
        itemsWithoutFields.forEach((it: CartItem) => {
          let orderLine = `${toBold('ORDER')}: ${it.selectedVariation?.name || it.name}`;
          if (it.quantity > 1) {
            orderLine += ` x${it.quantity}`;
          }
          orderLine += ` - ₱${it.totalPrice * it.quantity}`;
          lines.push(orderLine);
        });
      }
      }
    } else {
      // No custom fields, single account mode
      const uniqueGames = [...new Set(cartItems.map(item => item.name))];
      lines.push(`${toBold('GAME')}: ${uniqueGames.join(', ')}`);
      
      // Default IGN field
      const ign = customFieldValues['default_ign'] || '';
      if (ign) {
        lines.push(`${toBold('IGN')}: ${ign}`);
      }
      
      // Order items
      cartItems.forEach(item => {
        let orderLine = `${toBold('ORDER')}: ${item.selectedVariation?.name || item.name}`;
        if (item.quantity > 1) {
          orderLine += ` x${item.quantity}`;
        }
        orderLine += ` - ₱${item.totalPrice * item.quantity}`;
        lines.push(orderLine);
      });
    }
    
    // Payment
    const paymentLine = `${toBold('PAYMENT')}: ${selectedPaymentMethod?.name || ''}${selectedPaymentMethod?.account_name ? ` - ${selectedPaymentMethod.account_name}` : ''}`;
    lines.push(paymentLine);
    
    // Total
    lines.push(`${toBold('TOTAL')}: ₱${totalPrice}`);
    
    return lines.join('\n');
  };

  const isSavingOrder = useRef(false);

  const saveOrderToDb = async () => {
    if (orderId || isSavingOrder.current) return orderId;
    
    try {
      isSavingOrder.current = true;
      const customerInfo = getCustomerInfo();
      
      // Generate invoice number if not already generated
      // This ensures each order has a unique invoice number
      let invoiceNum = generatedInvoiceNumber;
      if (!invoiceNum || invoiceNumberDate !== getPhilippineDate().dateString) {
        // Generate new invoice number (forceNew = true to ensure increment)
        invoiceNum = await generateInvoiceNumber(true);
      }
      
      const newOrder = await createOrder({
        order_items: cartItems,
        customer_info: customerInfo as Record<string, string> | Array<{ game: string; package: string; fields: Record<string, string> }>,
          payment_method_id: paymentMethod!.id,
        receipt_url: receiptImageUrl ?? null,
        total_price: totalPrice,
        member_id: currentMember?.id,
        order_option: orderOption,
        invoice_number: invoiceNum,
      });
      
      if (newOrder) {
        setOrderId(newOrder.id);
        return newOrder.id;
      }
    } catch (error) {
      console.error('Error saving order to database:', error);
    } finally {
      isSavingOrder.current = false;
    }
    return null;
  };

  const handleCopyMessage = async () => {
    try {
      // Save order to database if not already saved
      saveOrderToDb();

      // Detect iOS and Mac - use execCommand directly for better compatibility
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isMac = /Mac/.test(navigator.platform) || /MacIntel|MacPPC|Mac68K/.test(navigator.platform);
      const needsSyncCopy = isIOS || isMac;
      
      // For iOS and Mac, we need to copy synchronously within user gesture
      // So we generate message first, then copy immediately
      let message: string;
      
      if (needsSyncCopy) {
        // On iOS/Mac, we MUST copy synchronously within the user gesture
        // Use current count from DB (loaded on mount) or state so invoice number increments correctly
        const { dateString: todayStr, dayOfMonth, month } = getPhilippineDate();
        
        let optimisticCount = 1;
        const ref = currentInvoiceCountRef.current;
        if (ref && ref.date === todayStr) {
          // Use DB-backed count so we get D88, not stuck at D1
          optimisticCount = ref.count + 1;
        } else if (generatedInvoiceNumber && invoiceNumberDate === todayStr) {
          const match = generatedInvoiceNumber.match(/AKGXT\d+M\d+D(\d+)/);
          if (match) optimisticCount = parseInt(match[1], 10) + 1;
        }
        currentInvoiceCountRef.current = { count: optimisticCount, date: todayStr };
        
        const optimisticInvoiceNumber = `AKGXT${month}M${dayOfMonth}D${optimisticCount}`;
        
        // Generate message synchronously (this function is async but doesn't do DB calls)
        message = await generateOrderMessageSync(optimisticInvoiceNumber);
        
        // Copy immediately (synchronously) - MUST happen within user gesture
        const textarea = document.createElement('textarea');
        textarea.value = message;
        textarea.style.position = 'fixed';
        textarea.style.left = '0';
        textarea.style.top = '0';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        textarea.setAttribute('readonly', '');
        textarea.setAttribute('contenteditable', 'true');
        document.body.appendChild(textarea);
        
        // Focus and select for iOS/Mac
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, message.length);
        
        // Try execCommand first (works better on iOS/Mac)
        let successful = false;
        try {
          successful = document.execCommand('copy');
        } catch (e) {
          console.error('execCommand failed:', e);
        }
        
        // Clean up
        document.body.removeChild(textarea);
        
        if (successful) {
          lastCopiedOrderMessageRef.current = message;
          setCopied(true);
          setHasCopiedMessage(true);
          setTimeout(() => setCopied(false), 2000);
          
          // Update database in background (async, doesn't block)
          // This ensures the count is properly saved for the next order
          generateInvoiceNumber(true).then((actualInvoiceNumber) => {
            setGeneratedInvoiceNumber(actualInvoiceNumber);
            setInvoiceNumberDate(todayStr);
            const m = actualInvoiceNumber.match(/AKGXT\d+M\d+D(\d+)/);
            if (m) currentInvoiceCountRef.current = { count: parseInt(m[1], 10), date: todayStr };
          }).catch(console.error);
        } else {
          // Fallback: try clipboard API (may not work on older iOS/Mac)
          try {
            await navigator.clipboard.writeText(message);
            lastCopiedOrderMessageRef.current = message;
            setCopied(true);
            setHasCopiedMessage(true);
            setTimeout(() => setCopied(false), 2000);
            
            // Update database in background
            generateInvoiceNumber(true).then((actualInvoiceNumber) => {
              setGeneratedInvoiceNumber(actualInvoiceNumber);
              setInvoiceNumberDate(todayStr);
              const m = actualInvoiceNumber.match(/AKGXT\d+M\d+D(\d+)/);
              if (m) currentInvoiceCountRef.current = { count: parseInt(m[1], 10), date: todayStr };
            }).catch(console.error);
          } catch (clipboardError) {
            console.error('Failed to copy message on iOS/Mac:', clipboardError);
            alert('Failed to copy. Please try again or copy manually.');
          }
        }
      } else {
        // For non-iOS/Mac, use async approach
        message = await generateOrderMessage(true);
        lastCopiedOrderMessageRef.current = message;
        
        try {
          await navigator.clipboard.writeText(message);
          setCopied(true);
          setHasCopiedMessage(true);
          setTimeout(() => setCopied(false), 2000);
        } catch (clipboardError) {
          // Fallback for older browsers
          const textarea = document.createElement('textarea');
          textarea.value = message;
          textarea.style.position = 'fixed';
          textarea.style.left = '-999999px';
          textarea.style.top = '-999999px';
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          
          const successful = document.execCommand('copy');
          document.body.removeChild(textarea);
          
          if (successful) {
            setCopied(true);
            setHasCopiedMessage(true);
            setTimeout(() => setCopied(false), 2000);
          } else {
            console.error('Failed to copy message');
          }
        }
      }
    } catch (error) {
      console.error('Failed to copy message:', error);
    }
  };
  
  // Synchronous version of generateOrderMessage that uses a provided invoice number
  const generateOrderMessageSync = async (invoiceNumber: string): Promise<string> => {
    // Build message lines (same logic as generateOrderMessage but without invoice generation)
    const lines: string[] = [];
    
    // Invoice number
    lines.push(`${toBold('INVOICE')} # ${invoiceNumber}`);
    lines.push(''); // Break after invoice
    
    if (hasAnyCustomFields) {
      const hasExtraAccounts = useMultipleAccounts && Object.values(extraAccountCount).some(c => c > 0);
      if (hasExtraAccounts) {
        itemsWithCustomFields.forEach(item => {
          const originalId = getOriginalMenuItemId(item.id);
          const extraCount = extraAccountCount[originalId] ?? 0;
          if (extraCount === 0) return;
          const totalAccounts = 1 + extraCount;
          const cartItemsForGame = cartItems.filter(c => getOriginalMenuItemId(c.id) === originalId);
          lines.push(`${toBold('GAME')}: ${item.name}`);
          for (let accIdx = 0; accIdx < totalAccounts; accIdx++) {
            const fields = (item.customFields ?? []).map(field => {
              const valueKey = accIdx === 0 ? `${originalId}_${field.key}` : `${originalId}_acc${accIdx}_${field.key}`;
              const value = customFieldValues[valueKey] || '';
              return value ? { label: field.label, value } : null;
            }).filter(Boolean) as Array<{ label: string, value: string }>;
            if (fields.length > 0) {
              if (totalAccounts > 1) lines.push(`${toBold(`Account ${accIdx + 1}`)}:`);
              fields.forEach(f => lines.push(`  ${toBold(f.label)}: ${f.value}`));
            }
          }
          cartItemsForGame.forEach(cItem => {
            let orderLine = `${toBold('ORDER')}: ${cItem.selectedVariation?.name || cItem.name}`;
            if (cItem.quantity > 1) orderLine += ` x${cItem.quantity}`;
            orderLine += ` - ₱${cItem.totalPrice * cItem.quantity}`;
            lines.push(orderLine);
          });
        });
        const gamesWithExtraIds = new Set(
          itemsWithCustomFields.filter(i => (extraAccountCount[getOriginalMenuItemId(i.id)] ?? 0) > 0).map(i => getOriginalMenuItemId(i.id))
        );
        const itemsWithoutFields = cartItems.filter(c => !c.customFields || c.customFields.length === 0);
        cartItems.filter(c => !gamesWithExtraIds.has(getOriginalMenuItemId(c.id))).forEach(cartItem => {
          const originalId = getOriginalMenuItemId(cartItem.id);
          const item = itemsWithCustomFields.find(i => getOriginalMenuItemId(i.id) === originalId);
          if (!item?.customFields?.length) return;
          const fields = item.customFields.map(field => {
            const valueKey = `${originalId}_${field.key}`;
            const value = customFieldValues[valueKey] || '';
            return value ? { label: field.label, value } : null;
          }).filter(Boolean) as Array<{ label: string, value: string }>;
          if (fields.length > 0) {
            lines.push(`${toBold('GAME')}: ${item.name}`);
            fields.forEach(f => lines.push(`${toBold(f.label)}: ${f.value}`));
            let orderLine = `${toBold('ORDER')}: ${cartItem.selectedVariation?.name || cartItem.name}`;
            if (cartItem.quantity > 1) orderLine += ` x${cartItem.quantity}`;
            orderLine += ` - ₱${cartItem.totalPrice * cartItem.quantity}`;
            lines.push(orderLine);
          }
        });
        if (itemsWithoutFields.length > 0) {
          const uniqueGames = [...new Set(itemsWithoutFields.map(c => c.name))];
          lines.push(`${toBold('GAME')}: ${uniqueGames.join(', ')}`);
          itemsWithoutFields.forEach(c => {
            let orderLine = `${toBold('ORDER')}: ${c.selectedVariation?.name || c.name}`;
            if (c.quantity > 1) orderLine += ` x${c.quantity}`;
            orderLine += ` - ₱${c.totalPrice * c.quantity}`;
            lines.push(orderLine);
          });
        }
      } else {
        // Build game/order sections (single account or bulk mode)
        const gamesByFieldValues = new Map<string, { games: string[], items: CartItem[], fields: Array<{ label: string, value: string }> }>();
      const itemsWithoutFields: CartItem[] = [];
      
      cartItems.forEach(cartItem => {
        const originalId = getOriginalMenuItemId(cartItem.id);
        const item = itemsWithCustomFields.find(i => getOriginalMenuItemId(i.id) === originalId);
        
        if (!item || !item.customFields || item.customFields.length === 0) {
          // Item without custom fields, handle separately
          itemsWithoutFields.push(cartItem);
          return;
        }
        
        const fields = item.customFields.map(field => {
          const valueKey = `${originalId}_${field.key}`;
          const value = customFieldValues[valueKey] || '';
          return value ? { label: field.label, value } : null;
        }).filter(Boolean) as Array<{ label: string, value: string }> || [];
        
        if (fields.length === 0) {
          // No field values, treat as item without fields
          itemsWithoutFields.push(cartItem);
          return;
        }
        
        // Create a key based on field values (to group games with same values)
        const valueKey = fields.map(f => `${f.label}:${f.value}`).join('|');
        
        if (!gamesByFieldValues.has(valueKey)) {
          gamesByFieldValues.set(valueKey, { games: [], items: [], fields });
        }
        const group = gamesByFieldValues.get(valueKey)!;
        if (!group.games.includes(item.name)) {
          group.games.push(item.name);
        }
        group.items.push(cartItem);
        group.fields = fields; // Use the fields from this item
      });
      
      // Build sections for each group
      gamesByFieldValues.forEach(({ games, items, fields }) => {
        // Game name (only once if multiple games share same fields)
        lines.push(`${toBold('GAME')}: ${games.join(', ')}`);
        
        // ID & SERVER or other fields
        if (fields.length === 1) {
          lines.push(`${toBold(fields[0].label)}: ${fields[0].value}`);
        } else if (fields.length > 1) {
          // Combine fields with & if multiple
          const allValuesSame = fields.every(f => f.value === fields[0].value);
          if (allValuesSame) {
            // All values same, combine labels with &
            const labels = fields.map(f => f.label);
            if (labels.length === 2) {
              lines.push(`${toBold(labels[0])} & ${toBold(labels[1])}: ${fields[0].value}`);
            } else {
              const allButLast = labels.slice(0, -1).map(l => toBold(l)).join(', ');
              const lastLabel = toBold(labels[labels.length - 1]);
              lines.push(`${allButLast} & ${lastLabel}: ${fields[0].value}`);
            }
          } else {
            // Different values, show each field separately
            const fieldPairs = fields.map(f => `${toBold(f.label)}: ${f.value}`);
            lines.push(fieldPairs.join(', '));
          }
        }
        
        // Order items
        items.forEach(item => {
          let orderLine = `${toBold('ORDER')}: ${item.selectedVariation?.name || item.name}`;
          if (item.quantity > 1) {
            orderLine += ` x${item.quantity}`;
          }
          orderLine += ` - ₱${item.totalPrice * item.quantity}`;
          lines.push(orderLine);
        });
      });
      
      // Handle items without custom fields
      if (itemsWithoutFields.length > 0) {
        const uniqueGames = [...new Set(itemsWithoutFields.map((it: CartItem) => it.name))];
        lines.push(`${toBold('GAME')}: ${uniqueGames.join(', ')}`);
        
        itemsWithoutFields.forEach((it: CartItem) => {
          let orderLine = `${toBold('ORDER')}: ${it.selectedVariation?.name || it.name}`;
          if (it.quantity > 1) {
            orderLine += ` x${it.quantity}`;
          }
          orderLine += ` - ₱${it.totalPrice * it.quantity}`;
          lines.push(orderLine);
        });
      }
      }
    } else {
      // No custom fields, single account mode
      const uniqueGames = [...new Set(cartItems.map(item => item.name))];
      lines.push(`${toBold('GAME')}: ${uniqueGames.join(', ')}`);
      
      // Default IGN field
      const ign = customFieldValues['default_ign'] || '';
      if (ign) {
        lines.push(`${toBold('IGN')}: ${ign}`);
      }
      
      // Order items
      cartItems.forEach(item => {
        let orderLine = `${toBold('ORDER')}: ${item.selectedVariation?.name || item.name}`;
        if (item.quantity > 1) {
          orderLine += ` x${item.quantity}`;
        }
        orderLine += ` - ₱${item.totalPrice * item.quantity}`;
        lines.push(orderLine);
      });
    }
    
    // Payment
    const paymentLine = `${toBold('PAYMENT')}: ${selectedPaymentMethod?.name || ''}${selectedPaymentMethod?.account_name ? ` - ${selectedPaymentMethod.account_name}` : ''}`;
    lines.push(paymentLine);
    
    // Total
    lines.push(`${toBold('TOTAL')}: ₱${totalPrice}`);
    
    return lines.join('\n');
  };

  const handleCopyAccountNumber = async (accountNumber: string) => {
    try {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      
      if (isIOS) {
        const textarea = document.createElement('textarea');
        textarea.value = accountNumber;
        textarea.style.position = 'fixed';
        textarea.style.left = '0';
        textarea.style.top = '0';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        textarea.setAttribute('readonly', '');
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, accountNumber.length);
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (successful) {
          setCopiedAccountNumber(true);
          setTimeout(() => setCopiedAccountNumber(false), 2000);
        }
      } else {
        try {
          await navigator.clipboard.writeText(accountNumber);
          setCopiedAccountNumber(true);
          setTimeout(() => setCopiedAccountNumber(false), 2000);
        } catch (clipboardError) {
          const textarea = document.createElement('textarea');
          textarea.value = accountNumber;
          textarea.style.position = 'fixed';
          textarea.style.left = '-999999px';
          textarea.style.top = '-999999px';
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          const successful = document.execCommand('copy');
          document.body.removeChild(textarea);
          if (successful) {
            setCopiedAccountNumber(true);
            setTimeout(() => setCopiedAccountNumber(false), 2000);
          }
        }
      }
    } catch (error) {
      console.error('Failed to copy account number:', error);
    }
  };

  const handleCopyAccountName = async (accountName: string) => {
    try {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      
      if (isIOS) {
        const textarea = document.createElement('textarea');
        textarea.value = accountName;
        textarea.style.position = 'fixed';
        textarea.style.left = '0';
        textarea.style.top = '0';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        textarea.setAttribute('readonly', '');
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, accountName.length);
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (successful) {
          setCopiedAccountName(true);
          setTimeout(() => setCopiedAccountName(false), 2000);
        }
      } else {
        try {
          await navigator.clipboard.writeText(accountName);
          setCopiedAccountName(true);
          setTimeout(() => setCopiedAccountName(false), 2000);
        } catch (clipboardError) {
          const textarea = document.createElement('textarea');
          textarea.value = accountName;
          textarea.style.position = 'fixed';
          textarea.style.left = '-999999px';
          textarea.style.top = '-999999px';
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          const successful = document.execCommand('copy');
          document.body.removeChild(textarea);
          if (successful) {
            setCopiedAccountName(true);
            setTimeout(() => setCopiedAccountName(false), 2000);
          }
        }
      }
    } catch (error) {
      console.error('Failed to copy account name:', error);
    }
  };

  // Detect if we're in Messenger's in-app browser
  const isMessengerBrowser = useMemo(() => {
    return /FBAN|FBAV/i.test(navigator.userAgent) || 
           /FB_IAB/i.test(navigator.userAgent);
  }, []);

  const handleDownloadQRCode = async (qrCodeUrl: string | null | undefined, paymentMethodName: string) => {
    // Only disable in Messenger's in-app browser
    // All external browsers (Chrome, Safari, Firefox, Edge, etc.) should work
    if (isMessengerBrowser || !qrCodeUrl) {
      // In Messenger, downloads don't work - users can long-press the QR code image
      // Also return early if no QR code URL is provided
      return;
    }
    
    // For all external browsers, fetch and download as blob to force download
    // This approach works in Chrome, Safari, Firefox, Edge, Opera, and other modern browsers
    try {
      const response = await fetch(qrCodeUrl, {
        mode: 'cors',
        cache: 'no-cache'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `qr-code-${paymentMethodName.toLowerCase().replace(/\s+/g, '-')}.png`;
      link.style.display = 'none';
      
      // Append to body, click, then remove
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (error) {
      console.error('Download failed:', error);
      // Fallback: try direct link with download attribute
      // This works in most browsers but may open instead of download in some cases
      try {
        const link = document.createElement('a');
        link.href = qrCodeUrl;
        link.download = `qr-code-${paymentMethodName.toLowerCase().replace(/\s+/g, '-')}.png`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
        }, 100);
      } catch (fallbackError) {
        console.error('Fallback download also failed:', fallbackError);
      }
    }
  };

  const getCustomerInfo = () => {
    let customerInfo: Record<string, string> | Array<{ game: string; package: string; fields: Record<string, string> }>;
    
    // Single account mode: store as flat object, or array if extra accounts (Multiple Accounts on + Add used)
      const hasExtraAccounts = useMultipleAccounts && Object.values(extraAccountCount).some(c => c > 0);
      
      if (hasExtraAccounts && hasAnyCustomFields) {
        // Multiple accounts via "Add [field]" - use array format
        const accountsData: Array<{ game: string; package: string; fields: Record<string, string> }> = [];
        itemsWithCustomFields.forEach((item) => {
          const originalId = getOriginalMenuItemId(item.id);
          const extraCount = extraAccountCount[originalId] ?? 0;
          const totalAccounts = 1 + extraCount;
          const packageName = item.selectedVariation?.name || item.name;
          
          for (let accIdx = 0; accIdx < totalAccounts; accIdx++) {
            const fields: Record<string, string> = {};
            item.customFields?.forEach(field => {
              const valueKey = accIdx === 0
                ? `${originalId}_${field.key}`
                : `${originalId}_acc${accIdx}_${field.key}`;
              const value = customFieldValues[valueKey];
              if (value) {
                fields[field.label] = value;
              }
            });
            if (Object.keys(fields).length > 0) {
              accountsData.push({
                game: item.name,
                package: packageName,
                fields
              });
            }
          }
        });
        customerInfo = accountsData.length > 0 ? accountsData : {};
      } else if (hasAnyCustomFields) {
        // Single account - flat object
        const singleAccountInfo: Record<string, string> = {};
        if (selectedPaymentMethod) {
          singleAccountInfo['Payment Method'] = selectedPaymentMethod.name;
        }
        itemsWithCustomFields.forEach((item) => {
          const originalId = getOriginalMenuItemId(item.id);
          item.customFields?.forEach(field => {
            const valueKey = `${originalId}_${field.key}`;
            const value = customFieldValues[valueKey];
            if (value) {
              singleAccountInfo[field.label] = value;
            }
          });
        });
        customerInfo = singleAccountInfo;
      } else {
        const singleAccountInfo: Record<string, string> = {};
        if (selectedPaymentMethod) {
          singleAccountInfo['Payment Method'] = selectedPaymentMethod.name;
        }
        // Default IGN field
        if (customFieldValues['default_ign']) {
          singleAccountInfo['IGN'] = customFieldValues['default_ign'];
        }
        customerInfo = singleAccountInfo;
      }
    return customerInfo;
  };

  const handlePlaceOrder = async () => {
    if (!paymentMethod) {
      setReceiptError('Please select a payment method');
      return;
    }

    // On iOS, window.open() must run synchronously in the user gesture or the pre-filled
    // message is often dropped. Use the last copied message and open immediately (no await).
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const cachedMessage = lastCopiedOrderMessageRef.current;

    if (isIOS && cachedMessage) {
      const encodedMessage = encodeURIComponent(cachedMessage);
      const messengerUrl = `https://m.me/AmberKinGamerXtream?text=${encodedMessage}`;
      window.open(messengerUrl, '_blank');
      // Save order in background (don't block; user already left to Messenger)
      saveOrderToDb().catch(console.error);
      return;
    }

    // Save order to database if not already saved
    await saveOrderToDb();

    // Reuse the existing invoice number (don't generate a new one)
    // If no invoice number exists yet, it will generate one, but ideally Copy should be clicked first
    const orderDetails = await generateOrderMessage(false);
    const encodedMessage = encodeURIComponent(orderDetails);
    const messengerUrl = `https://m.me/AmberKinGamerXtream?text=${encodedMessage}`;
    
    window.open(messengerUrl, '_blank');
    
  };

  const handlePlaceOrderDirect = async () => {
    if (!paymentMethod) {
      setReceiptError('Please select a payment method');
      return;
    }

    setIsPlacingOrder(true);
    setReceiptError(null);

    try {
      const savedOrderId = await saveOrderToDb();

      if (savedOrderId) {
        // Store order ID in localStorage for "place_order" option so it can be shown when user returns
        localStorage.setItem('pendingPlaceOrderId', savedOrderId);
        setIsOrderModalOpen(true);
      } else {
        setReceiptError('Failed to create order. Please try again.');
      }
    } catch (error) {
      console.error('Error placing order:', error);
      setReceiptError('Failed to create order. Please try again.');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const isDetailsValid = useMemo(() => {
    if (!hasAnyCustomFields) {
      return customFieldValues['default_ign']?.trim() || false;
    }
    
    // Check all required fields for all items and all accounts (Account 1 + extra when Multiple Accounts on)
    return itemsWithCustomFields.every(item => {
      if (!item.customFields) return true;
      const originalId = getOriginalMenuItemId(item.id);
      const extraCount = useMultipleAccounts ? (extraAccountCount[originalId] ?? 0) : 0;
      const totalAccounts = 1 + extraCount;
      
      for (let accIdx = 0; accIdx < totalAccounts; accIdx++) {
        const valueKeyPrefix = accIdx === 0 ? `${originalId}_` : `${originalId}_acc${accIdx}_`;
        const allRequired = item.customFields.every(field => {
          if (!field.required) return true;
          return customFieldValues[valueKeyPrefix + field.key]?.trim() || false;
        });
        if (!allRequired) return false;
      }
      return true;
    });
  }, [hasAnyCustomFields, itemsWithCustomFields, customFieldValues, useMultipleAccounts, extraAccountCount]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-center mb-8 relative">
        <button
          onClick={onBack}
          className="flex items-center text-cafe-textMuted hover:text-cafe-primary transition-colors duration-200 absolute left-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-3xl font-semibold text-cafe-text">Top Up</h1>
      </div>

        <div className="space-y-6">
          {/* Customer Details Form */}
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-6 h-6 rounded-full bg-cafe-primary text-neutral-800 flex items-center justify-center text-xs font-bold flex-shrink-0">
                1
              </div>
              <h2 className="text-sm font-medium text-cafe-text">Customer Information</h2>
            </div>
            
            <form className="space-y-6">
              {/* Bulk Input Toggle */}
              {itemsWithCustomFields.length >= 2 && (
                <div className="mb-6 p-4 glass-strong border border-cafe-primary/30 rounded-lg">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useBulkInput}
                      onChange={(e) => setUseBulkInput(e.target.checked)}
                      className="w-5 h-5 text-cafe-primary border-cafe-primary/30 rounded focus:ring-cafe-primary"
                    />
                    <div>
                      <p className="text-sm font-medium text-cafe-text">Bulk Input</p>
                      <p className="text-xs text-cafe-textMuted">Select games and fill fields once for all selected games.</p>
                    </div>
                  </label>
                  {useBulkInput && (
                    <div className="mt-4 pt-4 border-t border-cafe-primary/20 space-y-4">
                      {/* Game Selection Checkboxes */}
                      <div className="space-y-2">
                        {itemsWithCustomFields.map((item) => {
                          const originalId = getOriginalMenuItemId(item.id);
                          const isSelected = bulkSelectedGames.includes(originalId);
                          return (
                            <label
                              key={item.id}
                              className="flex items-center space-x-2 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => handleBulkGameSelectionChange(item.id, e.target.checked)}
                                className="w-4 h-4 text-cafe-primary border-cafe-primary/30 rounded focus:ring-cafe-primary"
                              />
                              <span className="text-sm text-cafe-text">{item.name}</span>
                            </label>
                          );
                        })}
                      </div>

                      {/* Input Fields - Only show if games are selected */}
                      {bulkSelectedGames.length > 0 && bulkInputFields.length > 0 && (
                        <div className="space-y-4">
                          {bulkInputFields.map(({ index, field }) => (
                            <div key={index}>
                              <label className="block text-sm font-medium text-cafe-text mb-2">
                                {field ? field.label : `Field ${index + 1}`} <span className="text-cafe-textMuted">(Bulk)</span> {field?.required && <span className="text-red-500">*</span>}
                              </label>
                              <input
                                type="text"
                                value={bulkInputValues[index.toString()] || ''}
                                onChange={(e) => handleBulkInputChange(index.toString(), e.target.value)}
                                className="w-full px-4 py-3 glass border border-cafe-primary/30 rounded-lg focus:ring-2 focus:ring-cafe-primary focus:border-cafe-primary transition-all duration-200 text-sm text-cafe-text placeholder-cafe-textMuted"
                                placeholder={field?.placeholder || field?.label || `Field ${index + 1}`}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Multiple Accounts Toggle - show always when there are cart items (single or multiple packages) */}
              {cartItems.length > 0 && (
                <div className="mb-6 p-4 glass-strong border border-cafe-primary/30 rounded-lg">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useMultipleAccounts}
                      onChange={(e) => setUseMultipleAccounts(e.target.checked)}
                      className="w-5 h-5 text-cafe-primary border-cafe-primary/30 rounded focus:ring-cafe-primary"
                    />
                    <div>
                      <p className="text-sm font-medium text-cafe-text">Multiple Accounts</p>
                      <p className="text-xs text-cafe-textMuted">Add a second account (or more) for the same order.</p>
                    </div>
                  </label>
                  {/* Add account button(s) inside this card - one per game when Multiple Accounts is on (only for games with custom fields) */}
                  {useMultipleAccounts && hasAnyCustomFields && (
                    <div className="mt-4 pt-4 border-t border-cafe-primary/20 space-y-2">
                      {itemsWithCustomFields.map((item) => {
                        const originalId = getOriginalMenuItemId(item.id);
                        const firstFieldLabel = item.customFields?.[0]?.label || 'Account';
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setExtraAccountCount(prev => ({
                              ...prev,
                              [originalId]: (prev[originalId] ?? 0) + 1
                            }))}
                            className="w-full px-3 py-2 text-sm font-medium text-cafe-primary border border-cafe-primary/50 rounded-lg hover:bg-cafe-primary/10 transition-colors text-left flex items-center gap-2"
                          >
                            <span>+ Add {firstFieldLabel}</span>
                            <span className="text-cafe-textMuted text-xs">({item.name})</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Dynamic Custom Fields grouped by game */}
              {hasAnyCustomFields ? (
                  // Single account mode: show fields grouped by game; extra accounts and Add button only when Multiple Accounts is on
                  itemsWithCustomFields.map((item) => {
                    const originalId = getOriginalMenuItemId(item.id);
                    const extraCount = useMultipleAccounts ? (extraAccountCount[originalId] ?? 0) : 0;
                    const totalAccounts = 1 + extraCount;
                    return (
                    <div key={item.id} className="space-y-4 pb-6 border-b border-cafe-primary/20 last:border-b-0 last:pb-0">
                      <div className="mb-4 flex items-center gap-4">
                        {/* Game Icon */}
                        <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gradient-to-br from-cafe-darkCard to-cafe-darkBg">
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={item.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.nextElementSibling?.classList.remove('hidden');
                              }}
                            />
                          ) : null}
                          <div className={`w-full h-full flex items-center justify-center ${item.image ? 'hidden' : ''}`}>
                            <div className="text-2xl opacity-20 text-gray-400">🎮</div>
                          </div>
                        </div>
                        
                        {/* Game Title and Description */}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-semibold text-cafe-text">{item.name}</h3>
                          <p className="text-xs text-cafe-textMuted">Please provide the following information for this game</p>
                        </div>
                      </div>
                      {Array.from({ length: totalAccounts }, (_, accIdx) => (
                        <div key={`${originalId}_acc${accIdx}`} className="space-y-4">
                          {accIdx > 0 && (
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="text-sm font-medium text-cafe-primary">{item.name} – Account {accIdx + 1}</h4>
                              <button
                                type="button"
                                onClick={() => removeExtraAccount(originalId, accIdx, item.customFields?.map(f => f.key) ?? [])}
                                className="p-1.5 rounded-lg text-red-400 hover:bg-red-400/20 transition-colors"
                                title="Remove this account"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                          {item.customFields?.map((field, fieldIndex) => {
                            const valueKey = accIdx === 0
                              ? `${originalId}_${field.key}`
                              : `${originalId}_acc${accIdx}_${field.key}`;
                            return (
                              <div key={`${originalId}_acc${accIdx}_field_${fieldIndex}`}>
                                <label className="block text-sm font-medium text-cafe-text mb-2">
                                  {field.label} {field.required && <span className="text-red-500">*</span>}
                                </label>
                                <input
                                  type="text"
                                  value={customFieldValues[valueKey] || ''}
                                  onChange={(e) => setCustomFieldValues(prev => ({
                                    ...prev,
                                    [valueKey]: e.target.value
                                  }))}
                                  className="w-full px-3 py-2 glass border border-cafe-primary/30 rounded-lg focus:ring-2 focus:ring-cafe-primary focus:border-cafe-primary transition-all duration-200 text-sm text-cafe-text placeholder-cafe-textMuted"
                                  placeholder={field.placeholder || field.label}
                                  required={field.required}
                                />
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                    );
                  })
              ) : (
                <div>
                  <label className="block text-sm font-medium text-cafe-text mb-2">
                    IGN <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={customFieldValues['default_ign'] || ''}
                    onChange={(e) => setCustomFieldValues({
                      ...customFieldValues,
                      ['default_ign']: e.target.value
                    })}
                    className="w-full px-3 py-2 glass border border-cafe-primary/30 rounded-lg focus:ring-2 focus:ring-cafe-primary focus:border-cafe-primary transition-all duration-200 text-sm text-cafe-text placeholder-cafe-textMuted"
                    placeholder="In game name"
                    required
                  />
                </div>
              )}

            </form>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-cafe-primary/30 my-6"></div>

        {/* Payment Section */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-6 h-6 rounded-full bg-cafe-primary text-neutral-800 flex items-center justify-center text-xs font-bold flex-shrink-0">
              2
            </div>
            <h2 className="text-sm font-medium text-cafe-text">Choose Payment Method</h2>
          </div>
          {paymentMethod && (
            <div className="flex items-center gap-3 mb-4">
              <div className="w-6 flex-shrink-0" aria-hidden />
              <p className="text-sm text-cafe-text">{paymentMethod.name} Selected</p>
            </div>
          )}
          <div className="grid grid-cols-6 gap-1 md:gap-2 mb-6">
            {paymentMethods
              .filter((method) => {
                // Filter payment methods based on max_order_amount
                // If max_order_amount is set (e.g., 6000), only show if order total is less than that amount
                if (method.max_order_amount !== null && method.max_order_amount !== undefined) {
                  return totalPrice < method.max_order_amount;
                }
                // If no max_order_amount is set, show for all orders
                return true;
              })
              .map((method) => (
              <button
                key={method.id}
                type="button"
                onClick={() => {
                  setPaymentMethod(method);
                }}
                className={`rounded-lg border-2 transition-all duration-200 flex flex-col overflow-hidden ${
                  paymentMethod?.id === method.id
                    ? 'border-transparent'
                    : 'glass border-cafe-primary/30 hover:border-cafe-primary hover:glass-strong'
                }`}
                style={paymentMethod?.id === method.id ? { backgroundColor: '#F5F0E6' } : {}}
              >
                {/* Icon fills the card */}
                <div className="relative w-full aspect-square flex-shrink-0 overflow-hidden bg-gradient-to-br from-cafe-darkCard to-cafe-darkBg rounded-lg">
                  {method.icon_url ? (
                    <img
                      src={method.icon_url}
                      alt={method.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-2xl md:text-4xl">💳</span>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Payment Details Section - shown when payment method is selected */}
          {selectedPaymentMethod && (
            <div ref={paymentDetailsRef} className="glass-card rounded-xl p-4 mb-4">
              <h3 className="text-lg font-semibold text-cafe-text mb-4">Payment Details</h3>

              <p className="text-xs text-cafe-textMuted mb-4">
                Press the copy button to copy the number or download the QR code, then make your payment and proceed to messenger.
              </p>

              <div className="space-y-4">
                {/* Payment Method Name and Amount */}
                <div className="flex items-center justify-between">
                  <p className="text-lg font-semibold text-cafe-text">{selectedPaymentMethod.name}</p>
                  <p className="text-xl font-semibold text-white">₱{totalPrice}</p>
                </div>
                
                {/* Account Number and Account Name in one row */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Account Number with Copy Button */}
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm text-cafe-textMuted">Number:</p>
                      <button
                        onClick={() => handleCopyAccountNumber(selectedPaymentMethod.account_number)}
                        className="p-1.5 glass-strong rounded-lg hover:bg-cafe-primary/20 transition-colors duration-200 flex-shrink-0"
                        title="Copy account number"
                      >
                        {copiedAccountNumber ? (
                          <Check className="h-3.5 w-3.5 text-green-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-cafe-text" />
                        )}
                      </button>
                    </div>
                    <p className="font-mono text-cafe-text font-medium text-sm">{selectedPaymentMethod.account_number}</p>
                  </div>
                  
                  {/* Account Name with Copy Button */}
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm text-cafe-textMuted">Name:</p>
                      <button
                        onClick={() => handleCopyAccountName(selectedPaymentMethod.account_name)}
                        className="p-1.5 glass-strong rounded-lg hover:bg-cafe-primary/20 transition-colors duration-200 flex-shrink-0"
                        title="Copy account name"
                      >
                        {copiedAccountName ? (
                          <Check className="h-3.5 w-3.5 text-green-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-cafe-text" />
                        )}
                      </button>
                    </div>
                    <p className="text-cafe-text font-medium text-sm">{selectedPaymentMethod.account_name}</p>
                  </div>
                </div>
                
                {/* Other Option */}
                <div>
                  <h3 className="font-medium text-cafe-text text-center">Other Option</h3>
                </div>
                
                {/* Download QR Button and QR Image */}
                {selectedPaymentMethod.qr_code_url ? (
                <div className="flex flex-col items-center gap-3">
                  {!isMessengerBrowser && (
                    <button
                      onClick={() => handleDownloadQRCode(selectedPaymentMethod.qr_code_url, selectedPaymentMethod.name)}
                      className="px-3 py-1.5 glass-strong rounded-lg hover:bg-cafe-primary/20 transition-colors duration-200 text-sm font-medium text-cafe-text flex items-center gap-2"
                      title="Download QR code"
                    >
                      <Download className="h-4 w-4" />
                      <span>Download QR</span>
                    </button>
                  )}
                  {isMessengerBrowser && (
                    <p className="text-xs text-cafe-textMuted text-center">Long-press the QR code to save</p>
                  )}
                  <img 
                    src={selectedPaymentMethod.qr_code_url} 
                    alt={`${selectedPaymentMethod.name} QR Code`}
                    className="w-32 h-32 rounded-lg border-2 border-cafe-primary/30 shadow-sm"
                    onError={(e) => {
                      e.currentTarget.src = 'https://images.pexels.com/photos/8867482/pexels-photo-8867482.jpeg?auto=compress&cs=tinysrgb&w=300&h=300&fit=crop';
                    }}
                  />
                </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-32 h-32 rounded-lg border-2 border-cafe-primary/30 shadow-sm bg-cafe-darkCard flex items-center justify-center">
                      <p className="text-xs text-cafe-textMuted text-center">No QR Code Available</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Payment instruction - styled as required reading */}
          <div className="rounded-xl border-l-2 border-cafe-primary border border-cafe-primary/20 bg-cafe-primary/10 p-3">
            <p className="text-sm font-semibold text-cafe-primary mb-1">Please read</p>
            <p className="text-sm text-cafe-text leading-snug">
              Pay using any of the methods above → screenshot the receipt → then send to our Messenger after submitting your order.
            </p>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-cafe-primary/30 my-6"></div>

      {/* Checkout error message */}
      {receiptError && (
        <p className="text-sm text-red-400 mb-4 text-center">{receiptError}</p>
      )}

      {/* Place Order Section */}
      <div>
        <div ref={buttonsRef}>
          {orderOption === 'order_via_messenger' ? (
            <>
              {/* Copy button - must be clicked before proceeding */}
              <button
                onClick={handleCopyMessage}
                disabled={!paymentMethod}
                className={`relative w-full py-3 rounded-xl font-medium transition-all duration-200 transform mb-3 flex items-center justify-center space-x-2 ${
                  paymentMethod
                    ? 'glass border border-cafe-primary/30 text-cafe-text hover:border-cafe-primary hover:glass-strong'
                    : 'glass border border-cafe-primary/20 text-cafe-textMuted cursor-not-allowed'
                }`}
              >
                <div className={`absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  paymentMethod
                    ? 'bg-cafe-primary text-neutral-800'
                    : 'bg-cafe-textMuted/30 text-cafe-textMuted'
                }`}>
                  3
                </div>
                {copied ? (
                  <>
                    <Check className="h-5 w-5" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-5 w-5" />
                    <span>Copy Invoice Order</span>
                  </>
                )}
              </button>

              {/* Proceed to Messenger button - requires payment method and copy to be clicked */}
              <button
                onClick={handlePlaceOrder}
                disabled={!paymentMethod || !hasCopiedMessage}
                className={`relative w-full py-4 rounded-xl font-medium text-sm md:text-lg transition-all duration-200 transform ${
                  paymentMethod && hasCopiedMessage
                    ? 'text-neutral-800 hover:opacity-90 hover:scale-[1.02]'
                    : 'glass text-cafe-textMuted cursor-not-allowed'
                }`}
                style={paymentMethod && hasCopiedMessage ? { backgroundColor: '#F5F0E6' } : {}}
              >
                <div className={`absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  paymentMethod && hasCopiedMessage
                    ? 'bg-cafe-primary text-neutral-800'
                    : 'bg-cafe-textMuted/30 text-cafe-textMuted'
                }`}>
                  4
                </div>
                SUBMIT ORDER
              </button>
              
              <p className="text-xs text-cafe-textMuted text-center mt-3">
                You'll be redirected to Facebook Messenger to confirm your order.
              </p>
            </>
          ) : (
            <>
              {/* Place Order button - for place_order option */}
              <button
                onClick={handlePlaceOrderDirect}
                disabled={!paymentMethod || isPlacingOrder}
                className={`relative w-full py-4 rounded-xl font-medium text-lg transition-all duration-200 transform ${
                  paymentMethod && !isPlacingOrder
                    ? 'text-neutral-800 hover:opacity-90 hover:scale-[1.02]'
                    : 'glass text-cafe-textMuted cursor-not-allowed'
                }`}
                style={paymentMethod && !isPlacingOrder ? { backgroundColor: '#F5F0E6' } : {}}
              >
                <div className={`absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  paymentMethod && !isPlacingOrder
                    ? 'bg-cafe-primary text-neutral-800'
                    : 'bg-cafe-textMuted/30 text-cafe-textMuted'
                }`}>
                  3
                </div>
                {isPlacingOrder ? 'Placing Order...' : 'Place Order'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Order Status Modal */}
      <OrderStatusModal
        orderId={orderId}
        isOpen={isOrderModalOpen}
        onClose={() => setIsOrderModalOpen(false)}
        onSucceededClose={onNavigateToMenu}
      />
    </div>
  );
};

export default Checkout;