'use client';

import { useState } from 'react';
import { addToCart, getCartCount } from './actions';

export default function Home() {
  const [message, setMessage] = useState('');
  const [cartCount, setCartCount] = useState(0);

  const products = [
    { id: 'prod_001', name: 'Wireless Headphones', price: 79.99 },
    { id: 'prod_002', name: 'USB-C Cable', price: 12.99 },
    { id: 'prod_003', name: 'Phone Stand', price: 24.99 },
  ];

  async function handleAddToCart(productId, productName) {
    try {
      const result = await addToCart(productId, 1);
      if (result.success) {
        setMessage(`Added ${productName} to cart!`);
        setCartCount(result.cartCount);
      }
    } catch (error) {
      setMessage('Error adding to cart');
    }
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '30px',
        padding: '20px',
        backgroundColor: '#2563eb',
        color: 'white',
        borderRadius: '8px'
      }}>
        <h1 style={{ margin: 0 }}>🛒 QuickShop</h1>
        <span style={{ 
          backgroundColor: 'white', 
          color: '#2563eb', 
          padding: '8px 16px',
          borderRadius: '20px',
          fontWeight: 'bold'
        }}>
          Cart: {cartCount} items
        </span>
      </header>

      {message && (
        <div style={{
          padding: '12px 20px',
          backgroundColor: '#dcfce7',
          color: '#166534',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          {message}
        </div>
      )}

      <h2>Featured Products</h2>
      
      <div style={{ display: 'grid', gap: '20px' }}>
        {products.map(product => (
          <div 
            key={product.id}
            style={{
              padding: '20px',
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <div>
              <h3 style={{ margin: '0 0 8px 0' }}>{product.name}</h3>
              <p style={{ margin: 0, color: '#666' }}>${product.price}</p>
            </div>
            <button
              onClick={() => handleAddToCart(product.id, product.name)}
              style={{
                padding: '10px 20px',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              Add to Cart
            </button>
          </div>
        ))}
      </div>

      <footer style={{ 
        marginTop: '40px', 
        padding: '20px', 
        textAlign: 'center',
        color: '#666',
        borderTop: '1px solid #ddd'
      }}>
        <p>© 2025 QuickShop - Powered by Next.js {process.env.NEXT_VERSION || '16.0.6'}</p>
      </footer>
    </div>
  );
}
