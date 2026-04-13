import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null
        };
    }

    static getDerivedStateFromError(error: Error): State {
        return {
            hasError: true,
            error,
            errorInfo: null
        };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        this.setState({
            error,
            errorInfo
        });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: '40px',
                    fontFamily: 'monospace',
                    backgroundColor: '#fee',
                    minHeight: '100vh'
                }}>
                    <h1 style={{ color: '#c00' }}>⚠️ Error de Aplicación</h1>
                    <h2>Algo salió mal al cargar la aplicación</h2>
                    <details style={{ whiteSpace: 'pre-wrap', marginTop: '20px' }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: '10px' }}>
                            Ver detalles del error
                        </summary>
                        <div style={{
                            backgroundColor: '#fff',
                            padding: '20px',
                            borderRadius: '4px',
                            border: '1px solid #ccc',
                            marginTop: '10px'
                        }}>
                            <h3>Error:</h3>
                            <pre style={{ color: '#c00' }}>
                                {this.state.error && this.state.error.toString()}
                            </pre>
                            <h3>Stack Trace:</h3>
                            <pre style={{ fontSize: '12px', overflow: 'auto' }}>
                                {this.state.errorInfo && this.state.errorInfo.componentStack}
                            </pre>
                        </div>
                    </details>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            marginTop: '20px',
                            padding: '10px 20px',
                            fontSize: '16px',
                            cursor: 'pointer',
                            backgroundColor: '#2563eb',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px'
                        }}
                    >
                        Recargar Aplicación
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
