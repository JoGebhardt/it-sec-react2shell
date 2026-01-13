'use server';

// Simulated cart storage (in-memory for demo)
let cartItems = [];

export async function addToCart(productId, quantity) {
  // Simulate some processing delay
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Add item to cart
  const existingItem = cartItems.find(item => item.productId === productId);
  
  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    cartItems.push({ productId, quantity });
  }
  
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  
  return {
    success: true,
    cartCount: totalItems,
    message: `Added ${quantity} item(s) to cart`
  };
}

export async function getCartCount() {
  return cartItems.reduce((sum, item) => sum + item.quantity, 0);
}

export async function clearCart() {
  cartItems = [];
  return { success: true };
}
