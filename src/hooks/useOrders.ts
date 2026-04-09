import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Order, CreateOrderData, OrderStatus } from '../types';

export const useOrders = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentFilter, setCurrentFilter] = useState<string | null>(null);

  // Fetch all orders with pagination and filtering
  const fetchOrders = async (page: number = 1, limit: number = 20, filterOptions?: { orderOption?: string }) => {
    try {
      setLoading(true);
      setCurrentPage(page);
      
      let actualFilter = currentFilter;
      if (filterOptions !== undefined) {
        if (filterOptions.orderOption) {
          actualFilter = filterOptions.orderOption;
          setCurrentFilter(filterOptions.orderOption);
        } else {
          actualFilter = null;
          setCurrentFilter(null);
        }
      }

      const from = (page - 1) * limit;
      const to = from + limit - 1;

      let query = supabase
        .from('orders')
        .select('id, invoice_number, status, total_price, payment_method_id, created_at, updated_at, member_id, order_option, order_items, customer_info, receipt_url', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (actualFilter) {
        query = query.eq('order_option', actualFilter);
      }

      const { data, count, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setOrders((data || []) as Order[]);
      if (count !== null) {
        setTotalCount(count);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch orders');
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch a single order by ID
  const fetchOrderById = async (orderId: string): Promise<Order | null> => {
    try {
      const { data, error: fetchError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (fetchError) throw fetchError;

      return data;
    } catch (err) {
      console.error('Error fetching order:', err);
      return null;
    }
  };

  // Create a new order
  const createOrder = async (orderData: CreateOrderData): Promise<Order | null> => {
    try {
      const { data, error: createError } = await supabase
        .from('orders')
        .insert({
          order_items: orderData.order_items,
          customer_info: orderData.customer_info,
          payment_method_id: orderData.payment_method_id,
          receipt_url: orderData.receipt_url,
          total_price: orderData.total_price,
          member_id: orderData.member_id || null,
          order_option: orderData.order_option || 'place_order',
          invoice_number: orderData.invoice_number || null,
          status: 'pending',
        })
        .select()
        .single();

      if (createError) throw createError;

      // Add new order to the list if we're in admin view
      if (orders.length > 0 && data) {
        setOrders(prev => {
          const updated = [data as Order, ...prev];
          return updated.slice(0, 20); // enforce max 20 due to pagination logic
        });
        setTotalCount(prev => prev + 1);
      } else if (orders.length === 0) {
        // If no orders loaded, fetch initial set
        await fetchOrders(1, 20);
      }

      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create order');
      console.error('Error creating order:', err);
      return null;
    }
  };

  // Update order status
  const updateOrderStatus = async (orderId: string, status: OrderStatus): Promise<boolean> => {
    try {
      const { error: updateError } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', orderId);

      if (updateError) throw updateError;

      // Update the specific order in the list
      if (orders.length > 0) {
        setOrders(prev => prev.map(order => 
          order.id === orderId ? { ...order, status } : order
        ));
      }

      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update order');
      console.error('Error updating order:', err);
      return false;
    }
  };

  // Subscribe to order updates (real-time) - only if orders are already loaded
  useEffect(() => {
    if (orders.length === 0) return;
    
    const channel = supabase
      .channel('orders-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            // Use the order data from the payload directly (optimized - no extra egress)
            const newOrder = payload.new as Order;
            
            // Only prepend if we're on page 1 and matches filter
            if (currentPage === 1) {
              const orderOption = newOrder.order_option || 'place_order';
              if (!currentFilter || orderOption === currentFilter) {
                setOrders(prev => {
                  if (prev.some(order => order.id === newOrder.id)) return prev;
                  const updated = [newOrder, ...prev];
                  return updated.slice(0, 20);
                });
                setTotalCount(prev => prev + 1);
              }
            }
          } else if (payload.eventType === 'UPDATE') {
            // Update the specific order in the list using payload data (optimized - no extra egress)
            const updatedOrder = payload.new as Order;
            setOrders(prev => prev.map(order => 
              order.id === updatedOrder.id ? { ...order, ...updatedOrder } : order
            ));
          } else if (payload.eventType === 'DELETE') {
            // Remove deleted order from list
            setOrders(prev => {
              const next = prev.filter(order => order.id !== payload.old.id);
              if (next.length !== prev.length) {
                // Approximate total count adjustment
                setTotalCount(count => count > 0 ? count - 1 : 0);
              }
              return next;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orders.length, currentPage, currentFilter]);

  return {
    orders,
    loading,
    error,
    totalCount,
    currentPage,
    setCurrentPage,
    fetchOrders,
    fetchOrderById,
    createOrder,
    updateOrderStatus,
  };
};
