import React, { useState } from 'react';
import { MousePointer2, CircleDot, Spline, Hand, Settings, Table, BarChart3, Settings2, Layers, Grid2X2, Droplet, Zap, Route, BoxSelect, Activity } from 'lucide-react';
import { useView } from '../context/ViewContext';
import { VisibilitySelector } from './VisibilitySelector';

interface FloatingToolbarProps {
    activeTool: string;
    setActiveTool: (tool: any) => void;
    toggleLayer: (layer: any) => void;
    layers: Record<string, boolean> | any;
}

export const FloatingToolbar: React.FC<FloatingToolbarProps> = ({
    activeTool,
    setActiveTool,
    toggleLayer,
    layers
}) => {
    const {
        setIsMapDimensionsOpen,
        resultsDockOpen,
        isResultsDockCollapsed,
        resultsDockTabId,
        openResultsDock,
        showGrid,
        setShowGrid,
        routeSelectionMode,
        setRouteSelectionMode,
        setRouteStartNodeId,
        setRouteEndNodeId,
        setActiveRoute,
    } = useView();

    const [showVisibilitySelector, setShowVisibilitySelector] = useState(false);

    const navigationTools = [
        { id: 'pointer', icon: MousePointer2, label: 'Seleccionar' },
        { id: 'pan', icon: Hand, label: 'Panorámica' }
    ];

    const gravityTools = [
        { id: 'camera', icon: CircleDot, label: 'Cámara' },
        { id: 'pipe', icon: Spline, label: 'Tubería' }
    ];

    const pressureTools = [
        { id: 'wetwell', icon: Droplet, label: 'Cámara Húmeda' },
        { id: 'pump', icon: Zap, label: 'Bomba' },
        { id: 'pressurepipe', icon: Activity, label: 'Tubería a Presión' },
        { id: 'pressure_junction', icon: CircleDot, label: 'Nodos/Ventosas' },
        { id: 'select-area', icon: BoxSelect, label: 'Selección por Área' }
    ];

    const toggleRouteSelection = () => {
        const next = !routeSelectionMode;
        setRouteSelectionMode(next);

        if (next) {
            setRouteStartNodeId(null);
            setRouteEndNodeId(null);
            setActiveRoute(null);
            setActiveTool('pointer');
        }
    };

    const renderToolGroup = (group: Array<{ id: string; icon: any; label: string }>) => (
        <div className="floating-toolbar-group">
            {group.map(tool => (
                <button
                    key={tool.id}
                    onClick={() => setActiveTool(tool.id as any)}
                    title={tool.label}
                    className={`floating-toolbar-btn ${activeTool === tool.id ? 'active' : ''}`}
                >
                    <tool.icon size={18} strokeWidth={activeTool === tool.id ? 2.5 : 2} />
                </button>
            ))}
        </div>
    );


    return (
        <div className="floating-toolbar">
            <div className="floating-toolbar-group">
                <button
                    onClick={() => openResultsDock('camaras', 'tabla')}
                    title="Tabla de Cámaras"
                    className={`floating-toolbar-btn ${resultsDockOpen && !isResultsDockCollapsed && resultsDockTabId === 'camaras' ? 'active' : ''}`}
                >
                    <Table size={18} />
                </button>

                <button
                    onClick={() => openResultsDock('resultados', 'tabla')}
                    title="Panel de Resultados"
                    className={`floating-toolbar-btn ${resultsDockOpen && !isResultsDockCollapsed && resultsDockTabId === 'resultados' ? 'active' : ''}`}
                >
                    <BarChart3 size={18} />
                </button>

                <button
                    onClick={toggleRouteSelection}
                    title={routeSelectionMode ? 'Desactivar seleccion de ruta' : 'Seleccionar ruta (Perfil)'}
                    className={`floating-toolbar-btn ${routeSelectionMode ? 'active' : ''}`}
                >
                    <Route size={18} />
                </button>
            </div>

            <div className="floating-toolbar-divider" />

            {renderToolGroup(navigationTools)}

            <div className="floating-toolbar-divider" />

            {renderToolGroup(gravityTools)}

            <div className="floating-toolbar-divider" />

            {renderToolGroup(pressureTools)}

            <div className="floating-toolbar-divider" />

            <div className="floating-toolbar-group">
                <div className="floating-toolbar-visibility">
                    <button
                        onClick={() => setShowVisibilitySelector(!showVisibilitySelector)}
                        title="Visibilidad de Etiquetas"
                        className={`floating-toolbar-btn ${showVisibilitySelector ? 'active' : ''}`}
                    >
                        <Settings2 size={18} />
                    </button>

                    {showVisibilitySelector && (
                        <div className="floating-toolbar-visibility-dropdown">
                            <VisibilitySelector onClose={() => setShowVisibilitySelector(false)} />
                        </div>
                    )}
                </div>

                <button
                    onClick={() => toggleLayer('labels')}
                    title="Mostrar/Ocultar Leyenda de Elementos"
                    className={`floating-toolbar-btn ${layers.labels ? 'active' : ''}`}
                >
                    <Layers size={18} />
                </button>

                <button
                    onClick={() => setShowGrid(!showGrid)}
                    title="Mostrar/Ocultar Rejilla"
                    className={`floating-toolbar-btn ${showGrid ? 'active' : ''}`}
                >
                    <Grid2X2 size={18} />
                </button>

                <button
                    onClick={() => setIsMapDimensionsOpen(true)}
                    title="Configuración del Proyecto"
                    className="floating-toolbar-btn"
                >
                    <Settings size={18} />
                </button>
            </div>
        </div>
    );
};
