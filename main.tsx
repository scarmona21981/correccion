import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './theme/tokens.css'
import './theme/visual-upgrade.css'
import './theme/professional-ui.css'
import './theme/theme-override.css'
import 'katex/dist/katex.min.css'
import { ThemeProvider } from './theme/ThemeProvider'
import ErrorBoundary from './components/ErrorBoundary'
import { PopoutApp } from './popout/PopoutApp'

console.log('🚀 main.tsx: Starting application...');

const params = new URLSearchParams(window.location.search);
const isPopout = params.get('popout') === '1';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ErrorBoundary>
            <ThemeProvider>
                {isPopout ? <PopoutApp /> : <App />}
            </ThemeProvider>
        </ErrorBoundary>
    </React.StrictMode>,
)

console.log('✅ main.tsx: ReactDOM.render called successfully');
