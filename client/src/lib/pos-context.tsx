import { createContext, useContext, useState, type ReactNode } from "react";
import type { Product } from "@shared/schema";

interface CartItem {
  id: string;
  product: Product;
  quantity: number;
  modifiers: { id: string; name: string; price: string }[];
  notes?: string;
}

interface POSContextType {
  cart: CartItem[];
  selectedTable: string | null;
  heldOrders: { id: string; items: CartItem[]; tableId?: string }[];
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (itemId: string) => void;
  removeFreeItems: () => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  updateModifiers: (itemId: string, modifiers: { id: string; name: string; price: string }[]) => void;
  updateNotes: (itemId: string, notes: string) => void;
  clearCart: () => void;
  setSelectedTable: (tableId: string | null) => void;
  holdOrder: () => void;
  resumeOrder: (orderId: string) => void;
  getSubtotal: () => number;
  getTaxAmount: (taxRate: number) => number;
  getTotal: (taxRate: number) => number;
}

const POSContext = createContext<POSContextType | null>(null);

export function POSProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [heldOrders, setHeldOrders] = useState<{ id: string; items: CartItem[]; tableId?: string }[]>([]);

  const addToCart = (product: Product, quantity = 1) => {
    const existingItem = cart.find(
      (item) => item.product.id === product.id && item.modifiers.length === 0 && !item.notes
    );

    if (existingItem) {
      setCart(
        cart.map((item) =>
          item.id === existingItem.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        )
      );
    } else {
      setCart([
        ...cart,
        {
          id: crypto.randomUUID(),
          product,
          quantity,
          modifiers: [],
        },
      ]);
    }
  };

  const removeFromCart = (itemId: string) => {
    setCart(cart.filter((item) => item.id !== itemId));
  };

  const removeFreeItems = () => {
    setCart(cart.filter((item) => !item.id.startsWith("free-")));
  };

  const updateQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(itemId);
      return;
    }
    setCart(
      cart.map((item) =>
        item.id === itemId ? { ...item, quantity } : item
      )
    );
  };

  const updateModifiers = (itemId: string, modifiers: { id: string; name: string; price: string }[]) => {
    setCart(
      cart.map((item) =>
        item.id === itemId ? { ...item, modifiers } : item
      )
    );
  };

  const updateNotes = (itemId: string, notes: string) => {
    setCart(
      cart.map((item) =>
        item.id === itemId ? { ...item, notes } : item
      )
    );
  };

  const clearCart = () => {
    setCart([]);
    setSelectedTable(null);
  };

  const holdOrder = () => {
    if (cart.length === 0) return;
    
    setHeldOrders([
      ...heldOrders,
      {
        id: crypto.randomUUID(),
        items: [...cart],
        tableId: selectedTable || undefined,
      },
    ]);
    clearCart();
  };

  const resumeOrder = (orderId: string) => {
    const order = heldOrders.find((o) => o.id === orderId);
    if (!order) return;
    
    setCart(order.items);
    if (order.tableId) setSelectedTable(order.tableId);
    setHeldOrders(heldOrders.filter((o) => o.id !== orderId));
  };

  const getSubtotal = () => {
    return cart.reduce((sum, item) => {
      const productPrice = parseFloat(item.product.price);
      const modifiersPrice = item.modifiers.reduce(
        (mSum, m) => mSum + parseFloat(m.price || "0"),
        0
      );
      return sum + (productPrice + modifiersPrice) * item.quantity;
    }, 0);
  };

  const getTaxAmount = (taxRate: number) => {
    return getSubtotal() * (taxRate / 100);
  };

  const getTotal = (taxRate: number) => {
    return getSubtotal() + getTaxAmount(taxRate);
  };

  return (
    <POSContext.Provider
      value={{
        cart,
        selectedTable,
        heldOrders,
        addToCart,
        removeFromCart,
        removeFreeItems,
        updateQuantity,
        updateModifiers,
        updateNotes,
        clearCart,
        setSelectedTable,
        holdOrder,
        resumeOrder,
        getSubtotal,
        getTaxAmount,
        getTotal,
      }}
    >
      {children}
    </POSContext.Provider>
  );
}

export function usePOS() {
  const context = useContext(POSContext);
  if (!context) {
    throw new Error("usePOS must be used within a POSProvider");
  }
  return context;
}
