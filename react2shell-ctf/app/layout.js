export const metadata = {
  title: 'QuickShop - Fast & Easy Shopping',
  description: 'Your favorite online store',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ 
        fontFamily: 'system-ui, sans-serif',
        margin: 0,
        padding: '20px',
        backgroundColor: '#f5f5f5'
      }}>
        {children}
      </body>
    </html>
  );
}
