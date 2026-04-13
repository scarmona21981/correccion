import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight, Printer, FileText, Download, Settings, Image as ImageIcon, Eye, Move, ZoomIn, ZoomOut, Maximize, Maximize2, Minimize2, Layers, RotateCcw, RotateCw, BarChart3, Building2, Route, ChartLine, Lock, Unlock, ListTodo, Table2, Palette, X } from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { useView } from '../context/ViewContext';
import { useDisplaySettings } from '../DisplaySettingsContext';
import { useAnalysisViewMode } from '../AnalysisViewModeContext';
import { useTheme, THEMES, ThemeName } from '../theme/ThemeProvider';

interface MenuProps {
    onRunSimulation?: () => void;
}

export const MenuBar: React.FC<MenuProps> = ({ onRunSimulation }) => {
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
    const [restorePopoutsOnStartup, setRestorePopoutsOnStartup] = useState(true);
    const menuRef = useRef<HTMLDivElement>(null);
    const {
        chambers,
        pipes,
        createNewProject,
        openProject,
        saveProject,
        saveProjectAs,
        exitApplication,
        settings,
        setSettings,
        undo,
        redo,
        canUndo,
        canRedo,
        calculationMethod,
        setCalculationMethod,
        pressurePipes,
        pumpingSystems,
        activePumpingSystemId,
        setActivePumpingSystemId,
        setPumpingSystems
    } = useProject();
    const {
        settings: displaySettings,
        setFlowUnit,
        setFlowDecimals,
        setValueDecimals
    } = useDisplaySettings();
    const { mode: analysisViewMode, setMode: setAnalysisViewMode } = useAnalysisViewMode();
    const {
        zoomIn,
        zoomOut,
        zoomExtents,
        setActiveTool,
        toggleLayer,
        layers,
        backdrop,
        setBackdrop,
        setIsMapDimensionsOpen,
        visualizationMode,
        setVisualizationMode,
        resultsDockOpen,
        isResultsDockCollapsed,
        openResultsDock,
        analysisResults,
        showLegend,
        setShowLegend,
        setIsLocked,
        isCanvasExpanded,
        setIsCanvasExpanded,
        routeSelectionMode,
        setRouteSelectionMode,
        setRouteStartNodeId,
        setRouteEndNodeId,
        setActiveRoute,

        isLocked,
        setScale,
        setViewOffset
    } = useView();


    const handleClickOutside = (event: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
            setActiveMenu(null);
        }
    };

    useEffect(() => {
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    useEffect(() => {
        let mounted = true;
        if (!window.electronAPI?.getPopoutRestoreOnStartup) return;

        window.electronAPI.getPopoutRestoreOnStartup()
            .then((enabled) => {
                if (!mounted) return;
                setRestorePopoutsOnStartup(!!enabled);
            })
            .catch(() => {
                // Non-blocking UI setting fetch
            });

        return () => {
            mounted = false;
        };
    }, []);

    const toggleMenu = (menuName: string) => {
        setActiveMenu(activeMenu === menuName ? null : menuName);
    };

    const handleMouseEnter = (menuName: string) => {
        if (activeMenu) {
            setActiveMenu(menuName);
        }
    };

    const handleAction = (action: () => void) => {
        action();
        setActiveMenu(null);
    };

    const handleLockedAction = (action: () => void) => {
        if (isLocked) return;
        handleAction(action);
    };

    const canUndoAction = canUndo && !isLocked;
    const canRedoAction = canRedo && !isLocked;
    const { theme, setTheme } = useTheme();

    const ThemeSelector: React.FC = () => (
        <div className="dropdown-item has-submenu">
            <span>Tema Visual</span>
            <ChevronRight size={14} />
            <div className="dropdown-menu submenu">
                {THEMES.map((t) => (
                    <div
                        key={t.name}
                        className="dropdown-item"
                        onClick={() => handleAction(() => setTheme(t.name))}
                    >
                        <span style={{ width: 14, display: 'inline-block' }}>{theme === t.name ? '✓' : ''}</span>
                        <span>{t.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );

    const SYSTEM_FALLBACK_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#22c55e'];
    const activeSystem = pumpingSystems.find(system => system.id === activePumpingSystemId) || null;
    const activeSystemColor = activeSystem?.color
        || (activeSystem ? SYSTEM_FALLBACK_PALETTE[Math.max(0, pumpingSystems.findIndex(system => system.id === activeSystem.id)) % SYSTEM_FALLBACK_PALETTE.length] : '#3b82f6');

    const openProfileDock = () => {
        const hasGravityProfileData = chambers.length >= 2 && pipes.length > 0;
        const hasPressureProfileData = pressurePipes.length > 0;
        const hasPressureResults = !!analysisResults
            && typeof analysisResults === 'object'
            && 'operatingPoint' in analysisResults
            && 'pumpCurve' in analysisResults;

        if (hasGravityProfileData) {
            openResultsDock('gravedad', 'perfil');
            return;
        }

        if (hasPressureResults || hasPressureProfileData || pumpingSystems.length > 0) {
            openResultsDock('impulsion', 'perfil');
            return;
        }

        openResultsDock('gravedad', 'perfil');
    };

    const toggleRouteSelection = React.useCallback(() => {
        const next = !routeSelectionMode;
        setRouteSelectionMode(next);

        if (next) {
            setRouteStartNodeId(null);
            setRouteEndNodeId(null);
            setActiveRoute(null);
            setActiveTool('pointer');
        }
    }, [
        routeSelectionMode,
        setRouteSelectionMode,
        setRouteStartNodeId,
        setRouteEndNodeId,
        setActiveRoute,
        setActiveTool,
        openResultsDock
    ]);

    const resetView = () => {
        setScale(1);
        setViewOffset({ x: 0, y: 0 });
    };

    const handlePrint = () => {
        window.print();
        setActiveMenu(null);
    }

    const handleBackdropLoad = () => {
        const url = prompt("Enter image URL for backdrop:");
        if (url) {
            setBackdrop(prev => ({ ...prev, url }));
            if (!layers.backdrop) toggleLayer('backdrop');
        }
        setActiveMenu(null);
    };

    const handleBackdropUnload = () => {
        setBackdrop(prev => ({ ...prev, url: null }));
        setActiveMenu(null);
    };

    const toggleBackdropOption = (option: 'watermark' | 'grayscale') => {
        setBackdrop(prev => ({ ...prev, [option]: !prev[option] }));
    };

    const closeAllPopouts = React.useCallback(() => {
        if (!window.electronAPI?.closeAllPopouts) return;
        window.electronAPI.closeAllPopouts().catch((error) => {
            console.warn('No se pudieron cerrar las ventanas pop-out.', error);
        });
    }, []);

    const toggleRestorePopoutsOnStartup = React.useCallback(() => {
        const nextValue = !restorePopoutsOnStartup;
        setRestorePopoutsOnStartup(nextValue);

        if (!window.electronAPI?.setPopoutRestoreOnStartup) return;

        window.electronAPI.setPopoutRestoreOnStartup(nextValue)
            .then((confirmed) => setRestorePopoutsOnStartup(!!confirmed))
            .catch((error) => {
                console.warn('No se pudo actualizar la preferencia de restauración de pop-outs.', error);
                setRestorePopoutsOnStartup(!nextValue);
            });
    }, [restorePopoutsOnStartup]);

    return (
        <div className="menu-bar" ref={menuRef}>
            <div
                className={`menu-item-trigger ${activeMenu === 'file' ? 'active' : ''}`}
                onClick={() => toggleMenu('file')}
                onMouseEnter={() => handleMouseEnter('file')}
            >
                Archivo
                {activeMenu === 'file' && (
                    <div className="dropdown-menu">
                        <div className="dropdown-item" onClick={() => handleAction(() => { createNewProject(); setIsLocked(false); resetView(); })}>
                            <span>Nuevo</span>
                            <span className="shortcut">Ctrl+N</span>
                        </div>
                        <div className="dropdown-item" onClick={() => handleAction(() => { openProject(); setIsLocked(false); resetView(); })}>
                            <span>Abrir...</span>
                            <span className="shortcut">Ctrl+O</span>
                        </div>
                        <div className="dropdown-item has-submenu">
                            <span>Reabrir</span>
                            <ChevronRight size={14} />
                        </div>
                        <div className="separator"></div>
                        <div className="dropdown-item" onClick={() => handleAction(saveProject)}>
                            <span>Guardar</span>
                            <span className="shortcut">Ctrl+S</span>
                        </div>
                        <div className="dropdown-item" onClick={() => handleAction(saveProjectAs)}>
                            <span>Guardar Como...</span>
                            <span className="shortcut">Ctrl+Alt+S</span>
                        </div>
                        <div className="separator"></div>
                        <div className="dropdown-item has-submenu">
                            <span>Exportar</span>
                            <ChevronRight size={14} />
                        </div>
                        <div className="dropdown-item">
                            <span>Combinar...</span>
                        </div>
                        <div className="separator"></div>
                        <div className="dropdown-item">
                            <span>Configurar Página...</span>
                        </div>
                        <div className="dropdown-item" onClick={handlePrint}>
                            <span>Vista Previa</span>
                        </div>
                        <div className="dropdown-item" onClick={handlePrint}>
                            <span>Imprimir</span>
                        </div>
                        <div className="separator"></div>
                        <div className="dropdown-item" onClick={() => handleAction(exitApplication)}>
                            <span>Salir</span>
                            <span className="shortcut">Alt+F4</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Edit Menu */}
            <div className={`menu-item-trigger ${activeMenu === 'edit' ? 'active' : ''}`} onClick={() => toggleMenu('edit')}>
                Editar
                {activeMenu === 'edit' && (
                    <div className="dropdown-menu">
                        <div className={`dropdown-item ${!canUndoAction ? 'disabled' : ''}`} onClick={() => canUndoAction && handleAction(undo)}>
                            <RotateCcw size={14} style={{ marginRight: 8 }} />
                            <span>Deshacer</span>
                            <span className="shortcut">Ctrl+Z</span>
                        </div>
                        <div className={`dropdown-item ${!canRedoAction ? 'disabled' : ''}`} onClick={() => canRedoAction && handleAction(redo)}>
                            <RotateCw size={14} style={{ marginRight: 8 }} />
                            <span>Rehacer</span>
                            <span className="shortcut">Ctrl+Y</span>
                        </div>
                    </div>
                )}
            </div>

            {/* View Menu */}
            <div className={`menu-item-trigger ${activeMenu === 'view' ? 'active' : ''}`} onClick={() => toggleMenu('view')}>
                Ver
                {activeMenu === 'view' && (
                    <div className="dropdown-menu">
                        <div className="dropdown-item" onClick={() => handleAction(() => setIsMapDimensionsOpen(true))}>
                            <span>Ajustes del Proyecto...</span>
                        </div>

                        <div className="dropdown-item has-submenu backdrop-submenu-trigger">
                            <span>Imagen de Fondo</span>
                            <ChevronRight size={14} />
                            <div className="dropdown-menu submenu">
                                <div className="dropdown-item" onClick={handleBackdropLoad}>
                                    <span>Cargar</span>
                                </div>
                                <div className="dropdown-item" onClick={handleBackdropUnload}>
                                    <span>Quitar</span>
                                </div>
                                <div className="separator"></div>
                                <div className="dropdown-item disabled">
                                    <span>Alinear</span>
                                </div>
                                <div className="dropdown-item disabled">
                                    <span>Redimensionar...</span>
                                </div>
                                <div className="separator"></div>
                                <div className="dropdown-item" onClick={() => toggleBackdropOption('watermark')}>
                                    <span style={{ width: 14 }}>{backdrop.watermark ? '✓' : ''}</span>
                                    <span>Marca de agua</span>
                                </div>
                                <div className="dropdown-item" onClick={() => toggleBackdropOption('grayscale')}>
                                    <span style={{ width: 14 }}>{backdrop.grayscale ? '✓' : ''}</span>
                                    <span>Escala de grises</span>
                                </div>
                            </div>
                        </div>

                        <div className="separator"></div>

                        <div className="dropdown-item" onClick={() => handleAction(() => setActiveTool('pan'))}>
                            <span>Panorámica</span>
                        </div>
                        <div className="dropdown-item" onClick={() => handleAction(zoomIn)}>
                            <span>Acercar</span>
                        </div>
                        <div className="dropdown-item" onClick={() => handleAction(zoomOut)}>
                            <span>Alejar</span>
                        </div>
                        <div className="dropdown-item" onClick={() => handleAction(() => zoomExtents(undefined, undefined))}>
                            <span>Extensión Total</span>
                        </div>

                        <div className="separator"></div>

                        <div className="dropdown-item" onClick={() => handleAction(() => setActiveTool('query'))}>
                            <span>Consulta...</span>
                            <span className="shortcut">Ctrl+Q</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Visualization Menu */}
            <div
                className={`menu-item-trigger ${activeMenu === 'visualization' ? 'active' : ''}`}
                onClick={() => toggleMenu('visualization')}
                onMouseEnter={() => handleMouseEnter('visualization')}
            >
                Visualización
                {activeMenu === 'visualization' && (
                    <div className="dropdown-menu">
                        <div className="dropdown-item" onClick={() => handleAction(() => openResultsDock('resultados', 'tabla'))}>
                            <span style={{ width: 14, display: 'inline-block' }}>{resultsDockOpen && !isResultsDockCollapsed ? '✓' : ''}</span>
                            <span>Panel de Resultados</span>
                        </div>
                        <div className="dropdown-item" onClick={() => handleAction(() => setShowLegend(!showLegend))}>
                            <span style={{ width: 14, display: 'inline-block' }}>{showLegend ? '✓' : ''}</span>
                            <span>Mostrar Leyenda de Colores</span>
                        </div>
                        <div className="separator"></div>
                        <ThemeSelector />
                        <div className="separator"></div>
                        <div className="dropdown-item has-submenu">
                            <span>Unidad de caudal</span>
                            <ChevronRight size={14} />
                            <div className="dropdown-menu submenu">
                                {(['L/s', 'L/min', 'm3/s'] as const).map(unit => (
                                    <div
                                        key={unit}
                                        className="dropdown-item"
                                        onClick={() => handleAction(() => setFlowUnit(unit))}
                                    >
                                        <span style={{ width: 14, display: 'inline-block' }}>{displaySettings.flowUnit === unit ? '✓' : ''}</span>
                                        <span>{unit}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="dropdown-item has-submenu">
                            <span>Precisión de caudal</span>
                            <ChevronRight size={14} />
                            <div className="dropdown-menu submenu">
                                {[0, 1, 2, 3, 4].map(decimals => (
                                    <div
                                        key={`flow-decimals-${decimals}`}
                                        className="dropdown-item"
                                        onClick={() => handleAction(() => setFlowDecimals(decimals))}
                                    >
                                        <span style={{ width: 14, display: 'inline-block' }}>{displaySettings.flowDecimals === decimals ? '✓' : ''}</span>
                                        <span>{decimals} decimales</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="dropdown-item has-submenu">
                            <span>Precisión de valores</span>
                            <ChevronRight size={14} />
                            <div className="dropdown-menu submenu">
                                {[0, 1, 2, 3, 4].map(decimals => (
                                    <div
                                        key={`value-decimals-${decimals}`}
                                        className="dropdown-item"
                                        onClick={() => handleAction(() => setValueDecimals(decimals))}
                                    >
                                        <span style={{ width: 14, display: 'inline-block' }}>{displaySettings.valueDecimals === decimals ? '✓' : ''}</span>
                                        <span>{decimals} decimales</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="dropdown-item has-submenu">
                            <span>Modo de vista (resultados)</span>
                            <ChevronRight size={14} />
                            <div className="dropdown-menu submenu">
                                <div className="dropdown-item" onClick={() => handleAction(() => setAnalysisViewMode('normativo'))}>
                                    <span style={{ width: 14, display: 'inline-block' }}>{analysisViewMode === 'normativo' ? '✓' : ''}</span>
                                    <span>Resultados Principales</span>
                                </div>
                                <div className="dropdown-item" onClick={() => handleAction(() => setAnalysisViewMode('tecnico'))}>
                                    <span style={{ width: 14, display: 'inline-block' }}>{analysisViewMode === 'tecnico' ? '✓' : ''}</span>
                                    <span>Técnico</span>
                                </div>
                            </div>
                        </div>
                        <div className="separator"></div>
                        <div className="dropdown-item" onClick={() => handleAction(() => setVisualizationMode('none'))}>
                            <span style={{ width: 14, display: 'inline-block' }}>{visualizationMode === 'none' ? '✓' : ''}</span>
                            <span>Ninguna (Estándar)</span>
                        </div>
                        <div className="separator"></div>
                        <div className="dropdown-item" onClick={() => handleAction(() => setVisualizationMode('compliance'))}>
                            <span style={{ width: 14, display: 'inline-block' }}>{visualizationMode === 'compliance' ? '✓' : ''}</span>
                            <span>Mapa de Conformidad</span>
                        </div>
                        <div className="dropdown-item" onClick={() => handleAction(() => setVisualizationMode('ueh'))}>
                            <span style={{ width: 14, display: 'inline-block' }}>{visualizationMode === 'ueh' ? '✓' : ''}</span>
                            <span>UEH Transportadas</span>
                        </div>
                        <div className="dropdown-item" onClick={() => handleAction(() => setVisualizationMode('velocity'))}>
                            <span style={{ width: 14, display: 'inline-block' }}>{visualizationMode === 'velocity' ? '✓' : ''}</span>
                            <span>Velocidad Hidráulica</span>
                        </div>
                        <div className="dropdown-item" onClick={() => handleAction(() => setVisualizationMode('filling_ratio'))}>
                            <span style={{ width: 14, display: 'inline-block' }}>{visualizationMode === 'filling_ratio' ? '✓' : ''}</span>
                            <span>Relación de Llenado (y/D)</span>
                        </div>
                        <div className="dropdown-item" onClick={() => handleAction(() => setVisualizationMode('slope'))}>
                            <span style={{ width: 14, display: 'inline-block' }}>{visualizationMode === 'slope' ? '✓' : ''}</span>
                            <span>Pendiente (%)</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Other Menus */}
            <div
                className={`menu-item-trigger ${activeMenu === 'window' ? 'active' : ''}`}
                onClick={() => toggleMenu('window')}
                onMouseEnter={() => handleMouseEnter('window')}
            >
                Ventana
                {activeMenu === 'window' && (
                    <div className="dropdown-menu">
                        <div className="dropdown-item" onClick={() => handleAction(toggleRestorePopoutsOnStartup)}>
                            <span style={{ width: 14, display: 'inline-block' }}>{restorePopoutsOnStartup ? '✓' : ''}</span>
                            <span>Restaurar pop-outs al iniciar</span>
                        </div>
                        <div className="dropdown-item" onClick={() => handleAction(closeAllPopouts)}>
                            <span>Cerrar todas las pop-out</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Other Menus */}
            {[
                { label: 'Reporte', key: 'report' },
                { label: 'Herramientas', key: 'tools' },
                { label: 'Ayuda', key: 'help' }
            ].map((item) => (
                <div
                    key={item.key}
                    className={`menu-item-trigger ${activeMenu === item.key ? 'active' : ''}`}
                    onClick={() => toggleMenu(item.key)}
                    onMouseEnter={() => handleMouseEnter(item.key)}
                >
                    {item.label}
                    {activeMenu === item.key && (
                        <div className="dropdown-menu">
                            <div className="dropdown-item disabled">
                                <span>(Vacío)</span>
                            </div>
                        </div>
                    )}
                </div>
            ))}

            {/* Project Menu */}
            <div
                className={`menu-item-trigger ${activeMenu === 'project' ? 'active' : ''}`}
                onClick={() => toggleMenu('project')}
                onMouseEnter={() => handleMouseEnter('project')}
            >
                Proyecto
                {activeMenu === 'project' && (
                    <div className="dropdown-menu">
                        <div className="dropdown-item has-submenu">
                            <span>Tipo de Proyecto</span>
                            <ChevronRight size={14} />
                            <div className="dropdown-menu submenu">
                                {(['Domiciliario', 'Público', 'Mixto'] as const).map(type => (
                                    <div
                                        key={type}
                                        className={`dropdown-item ${isLocked ? 'disabled' : ''}`}
                                        onClick={() => handleLockedAction(() => {
                                            const newSettings = { ...settings, projectType: type };
                                            if (type === 'Domiciliario') {
                                                newSettings.flowDesignModeCollectors = 'DIRECT_Q';
                                                newSettings.hasPopulation = false;
                                                if (newSettings.nch1105) {
                                                    newSettings.nch1105.enabled = false;
                                                }
                                            } else if (type === 'Público') {
                                                newSettings.flowDesignModeCollectors = 'POPULATION_NCH1105';
                                                newSettings.hasPopulation = true;
                                                if (!newSettings.nch1105) {
                                                    newSettings.nch1105 = { enabled: true, peakMode: 'STRICT' };
                                                } else {
                                                    newSettings.nch1105.enabled = true;
                                                    newSettings.nch1105.peakMode = 'STRICT';
                                                }
                                            }
                                            setSettings(newSettings);
                                        })}
                                    >
                                        <span style={{ width: 14 }}>{settings.projectType === type ? '✓' : ''}</span>
                                        <span>{type}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="separator"></div>
                        <div className="dropdown-item has-submenu">
                            <span>Sistema Sanitario (Qww)</span>
                            <ChevronRight size={14} />
                            <div className="dropdown-menu submenu">
                                <div
                                    className={`dropdown-item ${isLocked ? 'disabled' : ''}`}
                                    onClick={() => handleLockedAction(() => setSettings({ ...settings, sanitarySystemType: 'I' }))}
                                >
                                    <span style={{ width: 14 }}>{settings.sanitarySystemType === 'I' ? '✓' : ''}</span>
                                    <span>Sistema I</span>
                                </div>
                                <div
                                    className={`dropdown-item ${isLocked ? 'disabled' : ''}`}
                                    onClick={() => handleLockedAction(() => setSettings({ ...settings, sanitarySystemType: 'II' }))}
                                >
                                    <span style={{ width: 14 }}>{settings.sanitarySystemType === 'II' ? '✓' : ''}</span>
                                    <span>Sistema II</span>
                                </div>
                            </div>
                        </div>
                        <div className="separator"></div>
                        <div className="dropdown-item has-submenu">
                            <span>Modo de Verificación</span>
                            <ChevronRight size={14} />
                            <div className="dropdown-menu submenu">
                                <div
                                    className={`dropdown-item ${isLocked ? 'disabled' : ''}`}
                                    onClick={() => handleLockedAction(() => setSettings({ ...settings, verificationMode: 'UEH_MANNING' }))}
                                >
                                    <span style={{ width: 14 }}>{settings.verificationMode === 'UEH_MANNING' ? '✓' : ''}</span>
                                    <span>UEH + Manning (Normativo)</span>
                                </div>
                                <div
                                    className={`dropdown-item ${isLocked ? 'disabled' : ''}`}
                                    onClick={() => handleLockedAction(() => setSettings({ ...settings, verificationMode: 'MANNING_ONLY' }))}
                                >
                                    <span style={{ width: 14 }}>{settings.verificationMode === 'MANNING_ONLY' ? '✓' : ''}</span>
                                    <span>Solo Manning (Hidráulico)</span>
                                </div>
                            </div>
                        </div>
                        <div className="separator"></div>
                        <div className="dropdown-item has-submenu">
                            <span>Método de Cálculo (Presión)</span>
                            <ChevronRight size={14} />
                            <div className="dropdown-menu submenu">
                                <div
                                    className={`dropdown-item ${isLocked ? 'disabled' : ''}`}
                                    onClick={() => handleLockedAction(() => setCalculationMethod('HAZEN_WILLIAMS'))}
                                >
                                    <span style={{ width: 14 }}>{calculationMethod === 'HAZEN_WILLIAMS' ? '✓' : ''}</span>
                                    <span>Hazen-Williams</span>
                                </div>
                                <div
                                    className={`dropdown-item ${isLocked ? 'disabled' : ''}`}
                                    onClick={() => handleLockedAction(() => setCalculationMethod('DARCY_WEISBACH'))}
                                >
                                    <span style={{ width: 14 }}>{calculationMethod === 'DARCY_WEISBACH' ? '✓' : ''}</span>
                                    <span>Darcy-Weisbach</span>
                                </div>
                            </div>
                        </div>
                        <div className="separator"></div>
                        <div className="dropdown-item disabled">
                            <span>Resumen...</span>
                        </div>
                    </div>
                )}
            </div>
            {/* Toolbar Shortcut Icons - Placed on the right side of the menu bar */}
            <div className="menu-toolbar-icons">
                {/* Íconos del sistema - siempre visibles */}
                {pumpingSystems.length > 0 && (
                    <div className="menu-system-cluster">
                        <span className="menu-system-label">Sistema</span>
                        <select
                            className="menu-system-select"
                            value={activePumpingSystemId || ''}
                            onChange={(e) => setActivePumpingSystemId(e.target.value || null)}
                        >
                            {pumpingSystems.map(system => (
                                <option key={system.id} value={system.id}>{system.name}</option>
                            ))}
                        </select>
                        {activeSystem && (
                            <label
                                className="menu-system-color"
                                title="Color del sistema activo"
                            >
                                <input
                                    type="color"
                                    value={activeSystemColor}
                                    onChange={(e) => {
                                        const color = e.target.value;
                                        setPumpingSystems(prev => prev.map(system =>
                                            system.id === activeSystem.id ? { ...system, color } : system
                                        ));
                                    }}
                                    style={{
                                        width: '24px',
                                        height: '24px',
                                        border: 'none',
                                        padding: 0,
                                        background: 'transparent',
                                        cursor: 'pointer'
                                    }}
                                />
                            </label>
                        )}
                    </div>
                )}
                {/* Contenedor de íconos con scroll horizontal */}
                <div className="menu-toolbar-scroll">
                    <div
                        className={`icon-button ${!canUndoAction ? 'disabled' : ''}`}
                        onClick={() => {
                            if (!canUndoAction) return;
                            undo();
                        }}
                        title="Undo (Ctrl+Z)"
                        style={{ cursor: canUndoAction ? 'pointer' : 'default', opacity: canUndoAction ? 1 : 0.5 }}
                    >
                        <RotateCcw size={18} />
                    </div>
                    <div
                        className={`icon-button ${!canRedoAction ? 'disabled' : ''}`}
                        onClick={() => {
                            if (!canRedoAction) return;
                            redo();
                        }}
                        title="Redo (Ctrl+Y)"
                        style={{ cursor: canRedoAction ? 'pointer' : 'default', opacity: canRedoAction ? 1 : 0.5 }}
                    >
                        <RotateCw size={18} />
                    </div>

                    {/* Resultados de Análisis */}
                    <div
                        className="topbar-icon"
                        onClick={() => {
                            if (!analysisResults) return;
                            openResultsDock('resultados', 'tabla');
                        }}
                        title="Ver resultados del análisis"
                    >
                        <BarChart3 size={18} />
                    </div>

                    {/* Tabla de Cámaras */}
                    <div
                        className="topbar-icon"
                        onClick={() => openResultsDock('camaras', 'tabla')}
                        title="Tabla de Cámaras"
                    >
                        <Building2 size={18} />
                    </div>

                    {/* Seleccionar Ruta Perfil */}
                    <div
                        className="topbar-icon"
                        onClick={toggleRouteSelection}
                        title={routeSelectionMode ? 'Desactivar seleccion de ruta' : 'Seleccionar ruta (Perfil)'}
                        style={routeSelectionMode ? {
                            borderColor: 'var(--success)',
                            color: 'var(--success)',
                            background: 'var(--success-bg)'
                        } : undefined}
                    >
                        <Route size={18} />
                    </div>

                    {/* Ver Perfil */}
                    <div
                        className="topbar-icon"
                        onClick={openProfileDock}
                        title="Ver perfil longitudinal"
                    >
                        <ChartLine size={18} />
                    </div>


                    {/* Lock / Unlock */}
                    <div
                        className={`topbar-icon ${isLocked ? 'state-locked' : 'state-unlocked'}`}
                        onClick={() => setIsLocked(prev => !prev)}
                        title={isLocked ? "Análisis bloqueado" : "Análisis desbloqueado"}
                    >
                        {isLocked ? <Lock size={18} /> : <Unlock size={18} />}
                    </div>

                    <div
                        className="topbar-icon"
                        onClick={() => setIsCanvasExpanded(prev => !prev)}
                        title={isCanvasExpanded ? 'Restaurar vista' : 'Expandir vista'}
                        style={{
                            borderColor: isCanvasExpanded ? 'var(--accent)' : 'var(--border)',
                            color: isCanvasExpanded ? 'var(--accent)' : 'var(--text-secondary)',
                            background: isCanvasExpanded ? 'var(--hover-bg)' : 'var(--surface)'
                        }}
                    >
                        {isCanvasExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                    </div>

                    <div
                        className="topbar-icon"
                        onClick={closeAllPopouts}
                        title="Cerrar todas las pop-out"
                    >
                        <X size={18} />
                    </div>
                </div>

                {/* Analysis Button - "Analizar" - siempre visible al extremo derecho */}
                {onRunSimulation && (
                    <button
                        onClick={() => {
                            if (isLocked) {
                                alert("PROYECTO BLOQUEADO, PARA SEGUIR DESBLOQUEAR");
                                return;
                            }
                            onRunSimulation();
                            setActiveMenu(null);
                        }}
                        className={`topbar-action ${isLocked ? 'state-locked' : 'state-unlocked'}`}
                        title={isLocked ? "Análisis bloqueado - Desbloquear para ejecutar" : "Ejecutar análisis"}
                    >
                        Analizar
                    </button>
                )}
            </div>
        </div>
    );
};
