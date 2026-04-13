// Simple test to verify React rendering
import React from 'react';
import ReactDOM from 'react-dom/client';

console.log('🧪 TEST: Starting minimal React test...');

const TestApp = () => {
    console.log('🧪 TEST: TestApp component rendering');
    return (
        <div style={{ padding: '20px', fontFamily: 'Arial' }}>
            <h1 style={{ color: 'green' }}>✅ React is Working!</h1>
            <p>If you see this, React is rendering correctly.</p>
        </div>
    );
};

try {
    const root = document.getElementById('root');
    if (root) {
        ReactDOM.createRoot(root).render(<TestApp />);
        console.log('🧪 TEST: React render successful');
    } else {
        console.error('🧪 TEST: Root element not found');
    }
} catch (error) {
    console.error('🧪 TEST: Error during render:', error);
}
