import React, { createContext, useCallback, useContext, useState, useEffect } from 'react';
import { useProject } from './ProjectContext';
import { Results, GravityResults } from '../hydraulics/types';
import type { RoutePathGravity } from '../hydraulics/routeEngineGravity';
import type { VerificationMatrix } from '../verification/verificationMatrix';

export interface ViewSettings {
    units: 'm' | 'cm' | 'mm';
    precision: number;
    showToolbar: boolean;
    showLegend: boolean;
}

export interface LayerVisibility {
    chambers: boolean;
    pipes: boolean;
    backdrop: boolean;
    dimensions: boolean;
    labels: boolean;
}

export interface BackdropSettings {
    url: string | null;
    opacity: number;
    x: number;
    y: number;
    scale: number;
    locked: boolean;
    watermark: boolean;
    grayscale: boolean;
}

export type ViewTool = 'pointer' | 'pan' | 'zoom-window' | 'query' | 'rect' | 'circle' | 'camera' | 'add' | 'text' | 'pipe' | 'select-area' | 'pressure_junction' | 'wetwell' | 'pump' | 'pressurepipe' | 'edit-pipe';

export type InteractionMode = 'SELECT' | 'EDIT_PIPE' | 'DRAW_PIPE' | 'MOVE_NODE';


export type VisualizationMode = 'none' | 'compliance' | 'ueh' | 'velocity' | 'filling_ratio' | 'slope';

export type DockSectionId =
    | 'gravedad'
    | 'impulsion'
    | 'camaras'
    | 'resultados';

export type DockSubTabId =
    | 'tabla'
    | 'perfil'
    | 'trazabilidad'
    | 'curva'
    | 'verificacion'
    | 'verificacion-nch1105'
    | 'verificacion-nch3371'
    | 'rol-normativo'
    | 'camara-humeda';

export type ResultsDockTabId = DockSectionId;

export type LabelType =
    | 'chamber_id' | 'chamber_ct' | 'chamber_cre' | 'chamber_h' | 'chamber_crs'
    | 'pipe_id' | 'pipe_material' | 'pipe_diameter' | 'pipe_slope' | 'pipe_length' | 'pipe_velocity';

interface ViewContextType {
    scale: number;
    setScale: React.Dispatch<React.SetStateAction<number>>;
    viewOffset: { x: number; y: number };
    setViewOffset: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
    layers: LayerVisibility;
    toggleLayer: (layer: keyof LayerVisibility) => void;
    backdrop: BackdropSettings;
    setBackdrop: React.Dispatch<React.SetStateAction<BackdropSettings>>;
    activeTool: ViewTool;
    setActiveTool: React.Dispatch<React.SetStateAction<ViewTool>>;
    settings: ViewSettings;
    setSettings: React.Dispatch<React.SetStateAction<ViewSettings>>;
    zoomIn: () => void;
    zoomOut: () => void;
    zoomExtents: (bounds?: { minX: number, minY: number, maxX: number, maxY: number }, canvasSize?: { width: number, height: number }) => void;
    isMapDimensionsOpen: boolean;
    setIsMapDimensionsOpen: React.Dispatch<React.SetStateAction<boolean>>;

    resultsDockOpen: boolean;
    setResultsDockOpen: React.Dispatch<React.SetStateAction<boolean>>;
    isCanvasExpanded: boolean;
    setIsCanvasExpanded: React.Dispatch<React.SetStateAction<boolean>>;
    isResultsDockCollapsed: boolean;
    setIsResultsDockCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
    isRightPanelCollapsed: boolean;
    setIsRightPanelCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
    resultsDockMinimized: boolean;
    setResultsDockMinimized: React.Dispatch<React.SetStateAction<boolean>>;
    resultsDockTabId: ResultsDockTabId;
    setResultsDockTabId: React.Dispatch<React.SetStateAction<ResultsDockTabId>>;
    activeDockSubTab: DockSubTabId;
    setActiveDockSubTab: React.Dispatch<React.SetStateAction<DockSubTabId>>;
    openDock: (sectionId?: DockSectionId, subTabId?: DockSubTabId) => void;
    closeDock: () => void;
    toggleDock: (sectionId?: DockSectionId, subTabId?: DockSubTabId) => void;
    setDockCollapsed: (collapsed: boolean) => void;
    setActiveSection: (sectionId: DockSectionId) => void;
    setActiveSubTab: (subTabId: DockSubTabId) => void;
    openResultsDock: (sectionId?: DockSectionId, subTabId?: DockSubTabId) => void;
    closeResultsDock: () => void;
    toggleResultsDock: (sectionId?: DockSectionId, subTabId?: DockSubTabId) => void;
    collapseResultsDock: () => void;
    toggleRightPanel: () => void;

    viewportSize: { width: number; height: number };
    setViewportSize: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>;
    visualizationMode: VisualizationMode;
    setVisualizationMode: React.Dispatch<React.SetStateAction<VisualizationMode>>;
    analysisResults: Results | null;
    setAnalysisResults: React.Dispatch<React.SetStateAction<Results | null>>;
    gravityResults: GravityResults | null;
    setGravityResults: React.Dispatch<React.SetStateAction<GravityResults | null>>;
    verification1105: VerificationMatrix | null;
    setVerification1105: React.Dispatch<React.SetStateAction<VerificationMatrix | null>>;
    isVerif1105Running: boolean;
    setIsVerif1105Running: React.Dispatch<React.SetStateAction<boolean>>;
    showLegend: boolean;
    setShowLegend: React.Dispatch<React.SetStateAction<boolean>>;
    showGrid: boolean;
    setShowGrid: React.Dispatch<React.SetStateAction<boolean>>;
    customColors: Record<string, Record<string, string>>;
    setCustomColors: React.Dispatch<React.SetStateAction<Record<string, Record<string, string>>>>;
    visibleLabelTypes: Set<LabelType>;
    toggleLabelType: (type: LabelType) => void;
    editingObjectId: { id: string, type: 'chamber' | 'pipe' | 'air_valve' } | null;
    setEditingObjectId: React.Dispatch<React.SetStateAction<{ id: string, type: 'chamber' | 'pipe' | 'air_valve' } | null>>;
    isLocked: boolean;
    setIsLocked: React.Dispatch<React.SetStateAction<boolean>>;
    selectedIds: Set<string>;
    setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    toggleSelection: (id: string, type: 'chamber' | 'pipe' | 'air_valve', multi: boolean) => void;
    clearSelection: () => void;
    addToSelection: (ids: string[]) => void;
    interactionMode: InteractionMode;
    setInteractionMode: React.Dispatch<React.SetStateAction<InteractionMode>>;

    routeSelectionMode: boolean;
    setRouteSelectionMode: React.Dispatch<React.SetStateAction<boolean>>;
    routeStartNodeId: string | null;
    setRouteStartNodeId: React.Dispatch<React.SetStateAction<string | null>>;
    routeEndNodeId: string | null;
    setRouteEndNodeId: React.Dispatch<React.SetStateAction<string | null>>;
    activeRoute: RoutePathGravity | null;
    setActiveRoute: React.Dispatch<React.SetStateAction<RoutePathGravity | null>>;

    showChamberDiagrams: boolean;
    setShowChamberDiagrams: React.Dispatch<React.SetStateAction<boolean>>;
}


const ViewContext = createContext<ViewContextType | undefined>(undefined);

const readStoredBool = (key: string, fallback: boolean): boolean => {
    try {
        const raw = window.localStorage.getItem(key);
        if (raw === null) return fallback;
        return raw === 'true';
    } catch {
        return fallback;
    }
};

const readStoredString = (key: string): string | null => {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
};

const DEFAULT_SUBTAB_BY_SECTION: Record<DockSectionId, DockSubTabId> = {
    gravedad: 'tabla',
    impulsion: 'tabla',
    camaras: 'tabla',
    resultados: 'tabla'
};

const LEGACY_SECTION_MAP: Record<string, DockSectionId> = {
    summary: 'resultados',
    gravity: 'gravedad',
    pressure: 'impulsion',
    cameras: 'camaras',
    segments: 'resultados'
};

const LEGACY_SUBTAB_MAP: Record<string, DockSubTabId> = {
    'summary-overview': 'tabla',
    'gravity-calculation': 'tabla',
    'gravity-verification': 'trazabilidad',
    'pressure-results': 'tabla',
    'pressure-checks': 'trazabilidad',
    'normative-verification': 'verificacion',
    'normative-role': 'rol-normativo',
    'cameras-table': 'tabla',
    'cameras-wetwell': 'camara-humeda',
    'segments-list': 'tabla'
};

const isDockSectionId = (value: string | null): value is DockSectionId => {
    return value === 'gravedad'
        || value === 'impulsion'
        || value === 'camaras'
        || value === 'resultados';
};

const isDockSubTabId = (value: string | null): value is DockSubTabId => {
    return value === 'tabla'
        || value === 'perfil'
        || value === 'trazabilidad'
        || value === 'curva'
        || value === 'verificacion'
        || value === 'verificacion-nch1105'
        || value === 'verificacion-nch3371'
        || value === 'rol-normativo'
        || value === 'camara-humeda';
};

const normalizeDockSection = (value: string | null): DockSectionId | null => {
    if (!value) return null;
    if (isDockSectionId(value)) return value;
    return LEGACY_SECTION_MAP[value] || null;
};

const normalizeDockSubTab = (value: string | null): DockSubTabId | null => {
    if (!value) return null;
    if (isDockSubTabId(value)) return value;
    return LEGACY_SUBTAB_MAP[value] || null;
};

export const ViewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    console.log('👁️ ViewProvider: Initializing...');
    const urlParams = React.useMemo(() => new URLSearchParams(window.location.search), []);
    const windowId = urlParams.get('windowId') || 'main';
    const isPopout = urlParams.get('popout') === '1';

    const [scale, setScale] = useState<number>(1);
    const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
    const [activeTool, setActiveTool] = useState<ViewTool>('pointer');
    const [isMapDimensionsOpen, setIsMapDimensionsOpen] = useState(false);
    const [resultsDockOpen, setResultsDockOpen] = useState(false);
    const [isCanvasExpanded, setIsCanvasExpanded] = useState<boolean>(() => readStoredBool('ui.isCanvasExpanded', false));
    const [isResultsDockCollapsed, setIsResultsDockCollapsed] = useState<boolean>(() => readStoredBool('ui.isResultsDockCollapsed', false));
    const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState<boolean>(() => readStoredBool('ui.isRightPanelCollapsed', false));
    const [resultsDockTabId, setResultsDockTabId] = useState<ResultsDockTabId>(() => {
        const stored = normalizeDockSection(readStoredString('ui.activeDockSection'));
        return stored || 'resultados';
    });
    const [activeDockSubTab, setActiveDockSubTab] = useState<DockSubTabId>(() => {
        const stored = normalizeDockSubTab(readStoredString('ui.activeDockSubTab'));
        if (stored) return stored;
        const sectionStored = normalizeDockSection(readStoredString('ui.activeDockSection'));
        const section = sectionStored || 'resultados';
        return DEFAULT_SUBTAB_BY_SECTION[section];
    });
    const [viewportSize, setViewportSize] = useState({ width: 1200, height: 800 });
    const [visualizationMode, setVisualizationMode] = useState<VisualizationMode>('none');
    const [analysisResults, setAnalysisResults] = useState<Results | null>(null);
    const [gravityResults, setGravityResults] = useState<GravityResults | null>(null);
    const [verification1105, setVerification1105] = useState<VerificationMatrix | null>(null);
    const [isVerif1105Running, setIsVerif1105Running] = useState(false);
    const lastAppliedAnalysisSnapshotRef = React.useRef<string | null>(null);
    const [showLegend, setShowLegend] = useState(true);
    const [showGrid, setShowGrid] = useState(true);
    const [customColors, setCustomColors] = useState<Record<string, Record<string, string>>>({});
    const [visibleLabelTypes, setVisibleLabelTypes] = useState<Set<LabelType>>(new Set([
        'chamber_id', 'chamber_crs', 'pipe_id'
    ]));
    const [interactionMode, setInteractionMode] = useState<InteractionMode>('SELECT');
    const [routeSelectionMode, setRouteSelectionMode] = useState(false);
    const [routeStartNodeId, setRouteStartNodeId] = useState<string | null>(null);
    const [routeEndNodeId, setRouteEndNodeId] = useState<string | null>(null);
    const [activeRoute, setActiveRoute] = useState<RoutePathGravity | null>(null);
    const [showChamberDiagrams, setShowChamberDiagrams] = useState<boolean>(() => readStoredBool('ui.showChamberDiagrams', false));

    // Sync interactionMode with activeTool
    useEffect(() => {
        if (activeTool === 'pointer' || activeTool === 'select-area') {
            setInteractionMode('SELECT');
        } else if (activeTool === 'pipe' || activeTool === 'pressurepipe' || activeTool === 'camera' || activeTool === 'wetwell' || activeTool === 'pump' || activeTool === 'pressure_junction') {
            setInteractionMode('DRAW_PIPE'); // Using DRAW_PIPE as a general "creation" mode
        } else if (activeTool === 'edit-pipe') {
            setInteractionMode('EDIT_PIPE');
        }
    }, [activeTool]);


    const toggleLabelType = (type: LabelType) => {
        setVisibleLabelTypes(prev => {
            const next = new Set(prev);
            if (next.has(type)) {
                next.delete(type);
            } else {
                next.add(type);
            }
            return next;
        });
    };

    const [layers, setLayers] = useState<LayerVisibility>({
        chambers: true,
        pipes: true,
        backdrop: true,
        dimensions: true,
        labels: true
    });

    const [backdrop, setBackdrop] = useState<BackdropSettings>({
        url: null,
        opacity: 0.5,
        x: 0,
        y: 0,
        scale: 1,
        locked: false,
        watermark: false,
        grayscale: false
    });

    const [settings, setSettings] = useState<ViewSettings>({
        units: 'm',
        precision: 2,
        showToolbar: true,
        showLegend: true
    });

    const toggleLayer = (layer: keyof LayerVisibility) => {
        setLayers(prev => ({ ...prev, [layer]: !prev[layer] }));
    };

    const zoomIn = () => {
        setScale(prev => Math.min(prev * 1.2, 10));
    };

    const zoomOut = () => {
        setScale(prev => Math.max(prev / 1.2, 0.1));
    };

    const { settings: projectSettings, projectSessionId, pumps } = useProject();

    useEffect(() => {
        try {
            window.localStorage.setItem('ui.isCanvasExpanded', String(isCanvasExpanded));
        } catch {
            // Ignore localStorage persistence errors
        }
    }, [isCanvasExpanded]);

    useEffect(() => {
        try {
            window.localStorage.setItem('ui.isResultsDockCollapsed', String(isResultsDockCollapsed));
        } catch {
            // Ignore localStorage persistence errors
        }
    }, [isResultsDockCollapsed]);

    useEffect(() => {
        try {
            window.localStorage.setItem('ui.isRightPanelCollapsed', String(isRightPanelCollapsed));
        } catch {
            // Ignore localStorage persistence errors
        }
    }, [isRightPanelCollapsed]);

    useEffect(() => {
        try {
            window.localStorage.setItem('ui.showChamberDiagrams', String(showChamberDiagrams));
        } catch {
            // Ignore localStorage persistence errors
        }
    }, [showChamberDiagrams]);

    useEffect(() => {
        try {
            window.localStorage.setItem('ui.activeDockSection', resultsDockTabId);
        } catch {
            // Ignore localStorage persistence errors
        }
    }, [resultsDockTabId]);

    useEffect(() => {
        try {
            window.localStorage.setItem('ui.activeDockSubTab', activeDockSubTab);
        } catch {
            // Ignore localStorage persistence errors
        }
    }, [activeDockSubTab]);

    useEffect(() => {
        setIsLocked(false);
        setEditingObjectId(null);
        setSelectedIds(new Set());
        setActiveTool('pointer');
        setInteractionMode('SELECT');
        setRouteEndNodeId(null);
        setActiveRoute(null);

        // Close results dock if opening a new project or resetting
        setResultsDockOpen(false);
        setIsResultsDockCollapsed(true);

        const refresh = () => window.dispatchEvent(new Event('resize'));
        requestAnimationFrame(refresh);
        const timer = window.setTimeout(refresh, 120);
        return () => window.clearTimeout(timer);
    }, [projectSessionId]);

    useEffect(() => {
        if (isPopout) return;
        if (!window.electronAPI?.sendAnalysisSnapshot) return;

        const snapshot = {
            analysisResults,
            gravityResults,
            verification1105
        };
        const snapshotJson = JSON.stringify(snapshot);

        if (snapshotJson === lastAppliedAnalysisSnapshotRef.current) {
            return;
        }

        window.electronAPI.sendAnalysisSnapshot({
            snapshotJson,
            sourceWindowId: windowId
        });
    }, [isPopout, analysisResults, gravityResults, verification1105, windowId]);

    useEffect(() => {
        if (!window.electronAPI?.onAnalysisSnapshot) return;

        const applyAnalysisSnapshot = (snapshotJson: string | null | undefined, sourceWindowId?: string) => {
            if (sourceWindowId === windowId || typeof snapshotJson !== 'string') return;
            if (snapshotJson === lastAppliedAnalysisSnapshotRef.current) return;

            let parsed: any = null;
            try {
                parsed = JSON.parse(snapshotJson);
            } catch {
                return;
            }

            lastAppliedAnalysisSnapshotRef.current = snapshotJson;

            if (parsed && typeof parsed === 'object' && ('analysisResults' in parsed || 'gravityResults' in parsed || 'verification1105' in parsed)) {
                setAnalysisResults(parsed.analysisResults ?? null);
                setGravityResults(parsed.gravityResults ?? null);
                setVerification1105(parsed.verification1105 ?? null);
            } else {
                setAnalysisResults(parsed);
            }
        };

        const unsub = window.electronAPI.onAnalysisSnapshot(({ snapshotJson, sourceWindowId }) => {
            applyAnalysisSnapshot(snapshotJson, sourceWindowId);
        });

        if (window.electronAPI.getLatestAnalysisSnapshot) {
            window.electronAPI.getLatestAnalysisSnapshot()
                .then((snapshotJson) => {
                    applyAnalysisSnapshot(snapshotJson, 'main');
                })
                .catch(() => {
                    // No-op: best-effort hydration.
                });
        }

        return () => {
            if (typeof unsub === 'function') {
                unsub();
            }
        };
    }, [windowId]);

    const zoomExtents = (bounds?: { minX: number, minY: number, maxX: number, maxY: number }, canvasSize?: { width: number, height: number }) => {
        let targetBounds = bounds;

        // If no bounds passed (e.g. toolbar button), use Map Dimensions from project
        if (!targetBounds) {
            targetBounds = projectSettings.mapDimensions;
        }

        if (!targetBounds || !canvasSize) return;

        // Ensure bounds are valid
        if (targetBounds.maxX <= targetBounds.minX || targetBounds.maxY <= targetBounds.minY) return;

        const padding = 50;
        const contentWidth = targetBounds.maxX - targetBounds.minX + padding * 2;
        const contentHeight = targetBounds.maxY - targetBounds.minY + padding * 2;

        if (contentWidth <= 0 || contentHeight <= 0) {
            setScale(1);
            setViewOffset({ x: 0, y: 0 });
            return;
        }

        const newScale = Math.min(Math.max(Math.min(canvasSize.width / contentWidth, canvasSize.height / contentHeight), 0.05), 20);

        // Center the map dimensions
        const offsetX = (canvasSize.width - (targetBounds.maxX + targetBounds.minX) * newScale) / 2;
        const offsetY = (canvasSize.height - (targetBounds.maxY + targetBounds.minY) * newScale) / 2;

        setScale(newScale);
        setViewOffset({ x: offsetX, y: offsetY });
    };

    const [editingObjectId, setEditingObjectId] = useState<{ id: string, type: 'chamber' | 'pipe' | 'air_valve' } | null>(null);
    const [isLocked, setIsLocked] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const toggleSelection = (id: string, type: 'chamber' | 'pipe' | 'air_valve', multi: boolean) => {
        if (!multi) {
            setSelectedIds(new Set([id]));
            setEditingObjectId({ id, type });
            return;
        }

        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }

            // Sync with editingObjectId
            if (next.size === 1 && next.has(id)) {
                setEditingObjectId({ id, type });
            } else if (next.size !== 1) {
                setEditingObjectId(null);
            }
            // Note: If we remove an item and 1 remains, we don't know its type here, so we default to null (panel closed).
            // This is acceptable behavior.
            return next;
        });
    };

    // Rule: isResultsDockOpen only if has results (in gravity mode context)
    useEffect(() => {
        const hasResults = !!analysisResults || !!gravityResults;
        const isGravity = !pumps.length; // Simple heuristic for now, or check projectType

        if (isGravity && !hasResults && resultsDockOpen) {
            setResultsDockOpen(false);
            setIsResultsDockCollapsed(true);
        }
    }, [analysisResults, gravityResults, resultsDockOpen, pumps.length]);

    // Rule: Close results dock when entering route selection mode
    useEffect(() => {
        if (routeSelectionMode && resultsDockOpen) {
            setResultsDockOpen(false);
            setIsResultsDockCollapsed(true);
        }
    }, [routeSelectionMode, resultsDockOpen]);

    const clearSelection = () => {
        setSelectedIds(new Set());
        setEditingObjectId(null);
    };

    const addToSelection = (ids: string[]) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            ids.forEach(id => next.add(id));
            if (next.size > 1) setEditingObjectId(null);
            return next;
        });
    };

    const openDock = useCallback((sectionId: DockSectionId = 'resultados', subTabId?: DockSubTabId) => {
        const hasResults = !!analysisResults || !!gravityResults;
        const isGravity = !pumps.length;

        // Constraint: Don't open if no results exist (special rules for gravity mode)
        if (isGravity && !hasResults && (sectionId === 'gravedad' || sectionId === 'resultados' || sectionId === 'camaras')) {
            return;
        }

        // Constraint: Don't open if in route selection mode
        if (routeSelectionMode) {
            return;
        }

        setResultsDockOpen(true);
        setIsResultsDockCollapsed(false);
        setResultsDockTabId(sectionId);
        setActiveDockSubTab(subTabId || DEFAULT_SUBTAB_BY_SECTION[sectionId]);
    }, [analysisResults, gravityResults, pumps.length, routeSelectionMode]);

    const closeDock = useCallback(() => {
        setResultsDockOpen(false);
        setIsResultsDockCollapsed(true);
    }, []);

    const toggleDock = useCallback((sectionId: DockSectionId = 'resultados', subTabId?: DockSubTabId) => {
        if (!resultsDockOpen || isResultsDockCollapsed) {
            openDock(sectionId, subTabId);
            return;
        }
        closeDock();
    }, [closeDock, isResultsDockCollapsed, openDock, resultsDockOpen]);

    const setDockCollapsed = useCallback((collapsed: boolean) => {
        setIsResultsDockCollapsed(collapsed);
        if (!collapsed) {
            setResultsDockOpen(true);
        }
    }, []);

    const setActiveSection = useCallback((sectionId: DockSectionId) => {
        setResultsDockTabId(sectionId);
        setActiveDockSubTab(DEFAULT_SUBTAB_BY_SECTION[sectionId]);
    }, []);

    const setActiveSubTab = useCallback((subTabId: DockSubTabId) => {
        setActiveDockSubTab(subTabId);
    }, []);

    const openResultsDock = useCallback((sectionId: DockSectionId = 'resultados', subTabId?: DockSubTabId) => {
        openDock(sectionId, subTabId);
    }, [openDock]);

    const closeResultsDock = useCallback(() => {
        closeDock();
    }, [closeDock]);

    const collapseResultsDock = useCallback(() => {
        setDockCollapsed(true);
    }, [setDockCollapsed]);

    const toggleResultsDock = useCallback((sectionId: DockSectionId = 'resultados', subTabId?: DockSubTabId) => {
        toggleDock(sectionId, subTabId);
    }, [toggleDock]);

    const toggleRightPanel = useCallback(() => {
        setIsRightPanelCollapsed(prev => !prev);
    }, []);

    return (
        <ViewContext.Provider value={{
            scale, setScale,
            viewOffset, setViewOffset,
            layers, toggleLayer,
            backdrop, setBackdrop,
            activeTool, setActiveTool,
            settings, setSettings,
            zoomIn, zoomOut, zoomExtents,
            isMapDimensionsOpen, setIsMapDimensionsOpen,
            resultsDockOpen, setResultsDockOpen,
            isCanvasExpanded, setIsCanvasExpanded,
            isResultsDockCollapsed, setIsResultsDockCollapsed,
            isRightPanelCollapsed, setIsRightPanelCollapsed,
            resultsDockMinimized: isResultsDockCollapsed,
            setResultsDockMinimized: setIsResultsDockCollapsed,
            resultsDockTabId, setResultsDockTabId,
            activeDockSubTab, setActiveDockSubTab,
            openDock,
            closeDock,
            toggleDock,
            setDockCollapsed,
            setActiveSection,
            setActiveSubTab,
            openResultsDock,
            closeResultsDock,
            toggleResultsDock,
            collapseResultsDock,
            toggleRightPanel,
            viewportSize, setViewportSize,
            visualizationMode, setVisualizationMode,
            analysisResults, setAnalysisResults,
            gravityResults, setGravityResults,
            verification1105, setVerification1105,
            isVerif1105Running, setIsVerif1105Running,
            showLegend, setShowLegend,
            showGrid, setShowGrid,
            customColors, setCustomColors,
            visibleLabelTypes, toggleLabelType,
            editingObjectId, setEditingObjectId,
            isLocked, setIsLocked,
            selectedIds, setSelectedIds,
            toggleSelection, clearSelection, addToSelection,
            interactionMode, setInteractionMode,

            routeSelectionMode,
            setRouteSelectionMode,
            routeStartNodeId,
            setRouteStartNodeId,
            routeEndNodeId,
            setRouteEndNodeId,
            activeRoute,
            setActiveRoute,
            showChamberDiagrams,
            setShowChamberDiagrams
        }}>

            {children}
        </ViewContext.Provider>
    );
};

export const useView = () => {
    const context = useContext(ViewContext);
    if (!context) {
        throw new Error('useView must be used within a ViewProvider');
    }
    return context;
};
