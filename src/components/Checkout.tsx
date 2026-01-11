import React, { useState, useMemo } from 'react';
import { ArrowLeft, Upload, X, Copy, Check } from 'lucide-react';
import { CartItem, PaymentMethod } from '../types';
import { usePaymentMethods } from '../hooks/usePaymentMethods';
import { useImageUpload } from '../hooks/useImageUpload';

interface CheckoutProps {
  cartItems: CartItem[];
  totalPrice: number;
  onBack: () => void;
}

const Checkout: React.FC<CheckoutProps> = ({ cartItems, totalPrice, onBack }) => {
  const { paymentMethods } = usePaymentMethods();
  const { uploadImage, uploading: uploadingReceipt } = useImageUpload();
  const [step, setStep] = useState<'details' | 'payment'>('details');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('gcash');
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptImageUrl, setReceiptImageUrl] = useState<string | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Group custom fields by item/game
  // If any game has custom fields, show those grouped by game. Otherwise, show default "IGN" field
  // Deduplicate by item ID to avoid showing the same fields multiple times for the same item
  const itemsWithCustomFields = useMemo(() => {
    const itemsWithFields = cartItems.filter(item => item.customFields && item.customFields.length > 0);
    // Deduplicate by item ID
    const uniqueItems = new Map<string, typeof cartItems[0]>();
    itemsWithFields.forEach(item => {
      if (!uniqueItems.has(item.id)) {
        uniqueItems.set(item.id, item);
      }
    });
    return Array.from(uniqueItems.values());
  }, [cartItems]);

  const hasAnyCustomFields = itemsWithCustomFields.length > 0;

  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  // Set default payment method when payment methods are loaded
  React.useEffect(() => {
    if (paymentMethods.length > 0 && !paymentMethod) {
      setPaymentMethod((paymentMethods[0].id as PaymentMethod) || 'gcash');
    }
  }, [paymentMethods, paymentMethod]);

  const selectedPaymentMethod = paymentMethods.find(method => method.id === paymentMethod);
  
  const handleProceedToPayment = () => {
    setStep('payment');
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
  };

  // Generate the order message text
  const generateOrderMessage = (): string => {
    // Build custom fields section grouped by game
    let customFieldsSection = '';
    if (hasAnyCustomFields) {
      const fieldsByGame = itemsWithCustomFields.map(item => {
        const fields = item.customFields?.map(field => {
          const valueKey = `${item.id}_${field.key}`;
          const value = customFieldValues[valueKey] || '';
          return value ? `${field.label}: ${value}` : null;
        }).filter(Boolean).join('\n');
        return fields ? `${item.name}\n${fields}` : null;
      }).filter(Boolean).join('\n\n');
      
      if (fieldsByGame) {
        customFieldsSection = fieldsByGame;
      }
    } else {
      customFieldsSection = `🎮 IGN: ${customFieldValues['default_ign'] || ''}`;
    }

    const orderDetails = `
🛒 AmberKin ORDER

${customFieldsSection}

📋 ORDER DETAILS:
${cartItems.map(item => {
  let itemDetails = `• ${item.name}`;
  if (item.selectedVariation) {
    itemDetails += ` (${item.selectedVariation.name})`;
  }
  itemDetails += ` x${item.quantity} - ₱${item.totalPrice * item.quantity}`;
  return itemDetails;
}).join('\n')}

💰 TOTAL: ₱${totalPrice}

💳 Payment: ${selectedPaymentMethod?.name || paymentMethod}

📸 Payment Receipt: ${receiptImageUrl || ''}

Please confirm this order to proceed. Thank you for choosing AmberKin! 🎮
    `.trim();

    return orderDetails;
  };

  const handleCopyMessage = async () => {
    try {
      const message = generateOrderMessage();
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy message:', error);
    }
  };

  const handlePlaceOrder = () => {
    if (!receiptImageUrl) {
      setReceiptError('Please upload your payment receipt before placing the order');
      return;
    }

    const orderDetails = generateOrderMessage();
    const encodedMessage = encodeURIComponent(orderDetails);
    const messengerUrl = `https://m.me/AmberKinGamerXtream?text=${encodedMessage}`;
    
    window.open(messengerUrl, '_blank');
    
  };

  const isDetailsValid = useMemo(() => {
    if (!hasAnyCustomFields) {
      // Default IGN field
      return customFieldValues['default_ign']?.trim() || false;
    }
    
    // Check all required fields for all items
    return itemsWithCustomFields.every(item => {
      if (!item.customFields) return true;
      return item.customFields.every(field => {
        if (!field.required) return true;
        const valueKey = `${item.id}_${field.key}`;
        return customFieldValues[valueKey]?.trim() || false;
      });
    });
  }, [hasAnyCustomFields, itemsWithCustomFields, customFieldValues]);

  if (step === 'details') {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center mb-8">
          <button
            onClick={onBack}
            className="flex items-center space-x-2 text-cafe-textMuted hover:text-cafe-primary transition-colors duration-200"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>Back to Cart</span>
          </button>
          <h1 className="text-3xl font-semibold text-cafe-text ml-8">Order Details</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Customer Details Form */}
          <div className="glass-card rounded-xl p-6">
            <h2 className="text-2xl font-medium text-cafe-text mb-6">Customer Information</h2>
            
            <form className="space-y-6">
              {/* Show count of items with custom fields */}
              {hasAnyCustomFields && itemsWithCustomFields.length > 0 && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <span className="font-semibold">{itemsWithCustomFields.length}</span> game{itemsWithCustomFields.length > 1 ? 's' : ''} require{itemsWithCustomFields.length === 1 ? 's' : ''} additional information
                  </p>
                </div>
              )}

              {/* Dynamic Custom Fields grouped by game */}
              {hasAnyCustomFields ? (
                itemsWithCustomFields.map((item) => (
                  <div key={item.id} className="space-y-4 pb-6 border-b border-cafe-primary/20 last:border-b-0 last:pb-0">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-cafe-text">{item.name}</h3>
                      <p className="text-sm text-cafe-textMuted">Please provide the following information for this game</p>
                    </div>
                    {item.customFields?.map((field) => {
                      const valueKey = `${item.id}_${field.key}`;
                      return (
                        <div key={valueKey}>
                          <label className="block text-sm font-medium text-cafe-text mb-2">
                            {field.label} {field.required && <span className="text-red-500">*</span>}
                          </label>
                          <input
                            type="text"
                            value={customFieldValues[valueKey] || ''}
                            onChange={(e) => setCustomFieldValues({
                              ...customFieldValues,
                              [valueKey]: e.target.value
                            })}
                            className="w-full px-4 py-3 glass border border-cafe-primary/30 rounded-lg focus:ring-2 focus:ring-cafe-primary focus:border-cafe-primary transition-all duration-200 text-cafe-text placeholder-cafe-textMuted"
                            placeholder={field.placeholder || field.label}
                            required={field.required}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))
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
                    className="w-full px-4 py-3 glass border border-cafe-primary/30 rounded-lg focus:ring-2 focus:ring-cafe-primary focus:border-cafe-primary transition-all duration-200 text-cafe-text placeholder-cafe-textMuted"
                    placeholder="In game name"
                    required
                  />
                </div>
              )}

              <button
                onClick={handleProceedToPayment}
                disabled={!isDetailsValid}
                className={`w-full py-4 rounded-xl font-medium text-lg transition-all duration-200 transform ${
                  isDetailsValid
                    ? 'text-white hover:opacity-90 hover:scale-[1.02]'
                    : 'glass text-cafe-textMuted cursor-not-allowed'
                }`}
                style={isDetailsValid ? { backgroundColor: '#1E7ACB' } : {}}
              >
                Proceed to Payment
              </button>
            </form>
          </div>

          {/* Order Summary */}
          <div className="glass-card rounded-xl p-6">
            <h2 className="text-2xl font-medium text-cafe-text mb-6">Order Summary</h2>
            
            <div className="space-y-4 mb-6">
              {cartItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-2 border-b border-cafe-primary/30">
                  <div>
                    <h4 className="font-medium text-cafe-text">{item.name}</h4>
                    {item.selectedVariation && (
                      <p className="text-sm text-cafe-textMuted">Package: {item.selectedVariation.name}</p>
                    )}
                    {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                      <p className="text-sm text-cafe-textMuted">
                        Add-ons: {item.selectedAddOns.map(addOn => addOn.name).join(', ')}
                      </p>
                    )}
                    <p className="text-sm text-cafe-textMuted">₱{item.totalPrice} x {item.quantity}</p>
                  </div>
                  <span className="font-semibold text-cafe-text">₱{item.totalPrice * item.quantity}</span>
                </div>
              ))}
            </div>
            
            <div className="border-t border-cafe-primary/30 pt-4">
              <div className="flex items-center justify-between text-2xl font-semibold text-cafe-text">
                <span>Total:</span>
                <span className="text-white">₱{totalPrice}</span>
              </div>
            </div>
            
          </div>
        </div>
      </div>
    );
  }

  // Payment Step
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center mb-8">
        <button
          onClick={() => setStep('details')}
          className="flex items-center space-x-2 text-cafe-textMuted hover:text-cafe-primary transition-colors duration-200"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Back to Details</span>
        </button>
        <h1 className="text-3xl font-semibold text-cafe-text ml-8">Payment</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Payment Method Selection */}
        <div className="glass-card rounded-xl p-6">
          <h2 className="text-2xl font-medium text-cafe-text mb-6">Choose Payment Method</h2>
          
          <div className="grid grid-cols-1 gap-4 mb-6">
            {paymentMethods.map((method) => (
              <button
                key={method.id}
                type="button"
                onClick={() => setPaymentMethod(method.id as PaymentMethod)}
                className={`p-4 rounded-lg border-2 transition-all duration-200 flex items-center space-x-3 ${
                  paymentMethod === method.id
                    ? 'border-transparent text-white'
                    : 'glass border-cafe-primary/30 text-cafe-text hover:border-cafe-primary hover:glass-strong'
                }`}
                style={paymentMethod === method.id ? { backgroundColor: '#1E7ACB' } : {}}
              >
                <span className="text-2xl">💳</span>
                <span className="font-medium">{method.name}</span>
              </button>
            ))}
          </div>

          {/* Payment Details with QR Code */}
          {selectedPaymentMethod && (
            <div className="glass-strong rounded-lg p-6 mb-6 border border-cafe-primary/30">
              <h3 className="font-medium text-cafe-text mb-4">Payment Details</h3>
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm text-cafe-textMuted mb-1">{selectedPaymentMethod.name}</p>
                  <p className="font-mono text-cafe-text font-medium">{selectedPaymentMethod.account_number}</p>
                  <p className="text-sm text-cafe-textMuted mb-3">Account Name: {selectedPaymentMethod.account_name}</p>
                  <p className="text-xl font-semibold text-white">Amount: ₱{totalPrice}</p>
                </div>
                <div className="flex-shrink-0">
                  <img 
                    src={selectedPaymentMethod.qr_code_url} 
                    alt={`${selectedPaymentMethod.name} QR Code`}
                    className="w-32 h-32 rounded-lg border-2 border-cafe-primary/30 shadow-sm"
                    onError={(e) => {
                      e.currentTarget.src = 'https://images.pexels.com/photos/8867482/pexels-photo-8867482.jpeg?auto=compress&cs=tinysrgb&w=300&h=300&fit=crop';
                    }}
                  />
                  <p className="text-xs text-cafe-textMuted text-center mt-2">Scan to pay</p>
                </div>
              </div>
            </div>
          )}

          {/* Payment instructions */}
          <div className="glass border border-cafe-primary/30 rounded-lg p-4">
            <h4 className="font-medium text-cafe-text mb-2">📸 Payment Proof Required</h4>
            <p className="text-sm text-cafe-textMuted">
              After making your payment, please upload a screenshot of your payment receipt below. This helps us verify and process your order quickly.
            </p>
          </div>
        </div>

        {/* Order Summary */}
        <div className="glass-card rounded-xl p-6">
          <h2 className="text-2xl font-medium text-cafe-text mb-6">Final Order Summary</h2>
          
          <div className="space-y-4 mb-6">
            <div className="glass-strong rounded-lg p-4 border border-cafe-primary/30">
              <h4 className="font-medium text-cafe-text mb-2">Customer Details</h4>
              {hasAnyCustomFields ? (
                itemsWithCustomFields.map((item) => {
                  const fields = item.customFields?.map(field => {
                    const valueKey = `${item.id}_${field.key}`;
                    const value = customFieldValues[valueKey];
                    return value ? (
                      <p key={valueKey} className="text-sm text-cafe-textMuted">
                        {field.label}: {value}
                      </p>
                    ) : null;
                  }).filter(Boolean);
                  
                  if (!fields || fields.length === 0) return null;
                  
                  return (
                    <div key={item.id} className="mb-3 pb-3 border-b border-cafe-primary/20 last:border-b-0 last:pb-0">
                      <p className="text-sm font-semibold text-cafe-text mb-1">{item.name}:</p>
                      {fields}
                    </div>
                  );
                })
              ) : (
                customFieldValues['default_ign'] && (
                  <p className="text-sm text-cafe-textMuted">
                    IGN: {customFieldValues['default_ign']}
                  </p>
                )
              )}
            </div>

            {cartItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-2 border-b border-cafe-primary/30">
                <div>
                  <h4 className="font-medium text-cafe-text">{item.name}</h4>
                  {item.selectedVariation && (
                    <p className="text-sm text-cafe-textMuted">Package: {item.selectedVariation.name}</p>
                  )}
                  {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                    <p className="text-sm text-cafe-textMuted">
                      Add-ons: {item.selectedAddOns.map(addOn => 
                        addOn.quantity && addOn.quantity > 1 
                          ? `${addOn.name} x${addOn.quantity}`
                          : addOn.name
                      ).join(', ')}
                    </p>
                  )}
                  <p className="text-sm text-cafe-textMuted">₱{item.totalPrice} x {item.quantity}</p>
                </div>
                <span className="font-semibold text-cafe-text">₱{item.totalPrice * item.quantity}</span>
              </div>
            ))}
          </div>
          
          <div className="border-t border-cafe-primary/30 pt-4 mb-6">
            <div className="flex items-center justify-between text-2xl font-semibold text-cafe-text">
              <span>Total:</span>
              <span className="text-white">₱{totalPrice}</span>
            </div>
          </div>

          {/* Receipt Upload Section */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-cafe-text mb-2">
              Payment Receipt <span className="text-red-400">*</span>
            </label>
            
            {!receiptPreview ? (
              <div className="glass border-2 border-dashed border-cafe-primary/30 rounded-lg p-6 text-center hover:border-cafe-primary transition-colors duration-200">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleReceiptUpload(file);
                    }
                  }}
                  className="hidden"
                  id="receipt-upload"
                  disabled={uploadingReceipt}
                />
                <label
                  htmlFor="receipt-upload"
                  className={`cursor-pointer flex flex-col items-center space-y-2 ${uploadingReceipt ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {uploadingReceipt ? (
                    <>
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cafe-primary"></div>
                      <span className="text-sm text-cafe-textMuted">Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-cafe-primary" />
                      <span className="text-sm text-cafe-text">Click to upload receipt</span>
                      <span className="text-xs text-cafe-textMuted">JPEG, PNG, WebP, or GIF (Max 5MB)</span>
                    </>
                  )}
                </label>
              </div>
            ) : (
              <div className="relative glass border border-cafe-primary/30 rounded-lg p-4">
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0">
                    <img
                      src={receiptPreview}
                      alt="Receipt preview"
                      className="w-20 h-20 object-cover rounded-lg border border-cafe-primary/30"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-cafe-text truncate">
                      {receiptFile?.name || 'Receipt uploaded'}
                    </p>
                    <p className="text-xs text-cafe-textMuted">
                      {receiptImageUrl ? '✓ Uploaded successfully' : 'Uploading...'}
                    </p>
                  </div>
                  <button
                    onClick={handleReceiptRemove}
                    className="flex-shrink-0 p-2 glass-strong rounded-lg hover:bg-red-500/20 transition-colors duration-200"
                    disabled={uploadingReceipt}
                  >
                    <X className="h-4 w-4 text-cafe-text" />
                  </button>
                </div>
              </div>
            )}

            {receiptError && (
              <p className="mt-2 text-sm text-red-400">{receiptError}</p>
            )}
          </div>

          <button
            onClick={handleCopyMessage}
            disabled={uploadingReceipt}
            className={`w-full py-3 rounded-xl font-medium transition-all duration-200 transform mb-3 flex items-center justify-center space-x-2 ${
              !uploadingReceipt
                ? 'glass border border-cafe-primary/30 text-cafe-text hover:border-cafe-primary hover:glass-strong'
                : 'glass border border-cafe-primary/20 text-cafe-textMuted cursor-not-allowed'
            }`}
          >
            {copied ? (
              <>
                <Check className="h-5 w-5" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-5 w-5" />
                <span>Copy Order Message</span>
              </>
            )}
          </button>

          <button
            onClick={handlePlaceOrder}
            disabled={!receiptImageUrl || uploadingReceipt}
            className={`w-full py-4 rounded-xl font-medium text-lg transition-all duration-200 transform ${
              receiptImageUrl && !uploadingReceipt
                ? 'text-white hover:opacity-90 hover:scale-[1.02]'
                : 'glass text-cafe-textMuted cursor-not-allowed'
            }`}
            style={receiptImageUrl && !uploadingReceipt ? { backgroundColor: '#1E7ACB' } : {}}
          >
            {uploadingReceipt ? 'Uploading Receipt...' : 'Place Order via Messenger'}
          </button>
          
          <p className="text-xs text-cafe-textMuted text-center mt-3">
            You'll be redirected to Facebook Messenger to confirm your order. Your receipt has been uploaded and will be included in the message.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Checkout;