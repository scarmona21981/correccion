import React, { useState, useEffect, useRef } from 'react';
import { useThemeStyles } from '../theme/useThemeStyles';
import { useTheme } from '../theme/ThemeProvider';
import {
    MousePointer2,
    Square,
    Circle,
    Type,
    Search,
    Plus,
    Minus,
    RefreshCw,
    Play,
    FileText,
    Activity,
    BarChart,
    Map as MapIcon,
    CircleDot,
    GitBranch as PipeIcon,
    Check,
    AlertCircle,
    XCircle,
    X,
    Table,
    Pencil
} from 'lucide-react';

import { useProject } from '../context/ProjectContext';
import type { Chamber, Pipe, AttributeValue } from '../context/ProjectContext';
import {
    WetWell, Pump, PressurePipe, OutfallPressure, PressureJunction, AirValveNode,
    CalculationMethod, GeometricVertex, PumpingSystem
} from '../hydraulics/types';
import { useView, ViewTool } from '../context/ViewContext';
import { OverviewMap } from './OverviewMap';
import { getPipeNormativeAlerts, getChamberNormativeAlerts } from '../utils/normativeRules';
import { calculateUEHAccumulation } from '../utils/uehAccumulator';
import { calculateFlowAccumulation } from '../utils/flowAccumulator';
import { validateDomiciliaryPipe } from '../utils/domiciliaryRules';
import { calculateGeometry, calculatePipeConnectionPoint } from '../utils/geometryEngine';
import { generateWetWellName, generatePumpName, generatePressurePipeName, generatePressureJunctionName } from '../utils/pressureNaming';
import { inferPipeRoleFromNodeTypes } from '../utils/pipeRole';
import { resolvePipeLengthMode, withCalculatedPipeLength } from '../utils/pipeLengthMode';
import { CURRENT_PROJECT_SCHEMA_VERSION, CURRENT_PROJECT_VERSION } from '../context/projectSchema';

import { getPipeColor } from '../utils/visualizationUtils';
import { buildChamberIncomingDisplay } from '../utils/chamberIncomingDisplay';
import { ColorLegend } from './ColorLegend';
import { LabelSelector } from './LabelSelector';
import { ChamberConnectionGlyph } from './network/ChamberConnectionGlyph';
import { CoordinateIndicator } from './CoordinateIndicator';
import {
    buildGraphFromPipes,
    dijkstraRoute,
    enumerateKRoutes,
    formatRouteText,
    RoutePathGravity
} from '../hydraulics/routeEngineGravity';
import { RouteSelectionController } from './RouteSelectionController';

interface ZoomSelection {
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
}

interface SnapFeedback {
    x: number;
    y: number;
    type: 'edge' | 'center' | 'grid' | 'free';
    targetId?: string;
}



type Tool = ViewTool; // Alias for backward compatibility if needed, or replace usages

import { FloatingToolbar } from './FloatingToolbar';
import { SimulationFAB } from './SimulationFAB';

const createProfilePointId = () => `PT-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

interface WorkspaceProps {
    readOnly: boolean;
    onChamberClick?: (id: string, e?: React.MouseEvent) => void;
    onRunSimulation?: () => void;
    isLocked?: boolean;
}


export const Workspace: React.FC<WorkspaceProps> = ({ readOnly, onChamberClick, onRunSimulation, isLocked }) => {
    const canvasRef = useRef<HTMLDivElement>(null);
    const {
        scale, setScale,
        viewOffset, setViewOffset,
        zoomExtents,
        layers,
        visualizationMode,
        analysisResults,
        showLegend,
        setShowLegend,
        toggleLayer,
        customColors,
        visibleLabelTypes,
        setViewportSize,
        showGrid,
        setShowGrid,
        editingObjectId,
        setEditingObjectId,
        selectedIds,
        setSelectedIds,
        toggleSelection,
        clearSelection,
        addToSelection,
        activeTool,
        setActiveTool,
        interactionMode,
        setInteractionMode,
        routeSelectionMode,
        setRouteSelectionMode,
        routeStartNodeId,
        setRouteStartNodeId,
        routeEndNodeId,
        setRouteEndNodeId,
        activeRoute,
        setActiveRoute,
        showChamberDiagrams
    } = useView();


    // Local state for tools if not in context
    // Local state for tools if not in context
    // const [activeTool, setActiveTool] = useState... // Removed to use context
    const {
        chambers,
        setChambers,
        pipes,
        setPipes,
        wetWells,
        setWetWells,
        pumps,
        setPumps,
        pressurePipes,
        setPressurePipes,
        outfallsPressure,
        setOutfallsPressure,
        pressureJunctions,
        setPressureJunctions,
        pumpingSystems,
        setPumpingSystems,
        activePumpingSystemId,
        setActivePumpingSystemId,
        settings: projectSettings,
        snapshot
    } = useProject();
    const { mapDimensions, units: projectUnits } = projectSettings;

    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    
    const themeStyles = useThemeStyles();
    const { colors, semantic, pipeColors, nodeColors } = themeStyles;
    const { themeVersion } = useTheme();
    // const [editingObjectId, setEditingObjectId] = useState<{ id: string, type: 'chamber' | 'pipe' } | null>(null); // Removed local state
    
    useEffect(() => {
        // Force re-render when theme changes
    }, [themeVersion]);

    const [pipeStart, setPipeStart] = useState<{ x: number, y: number, nodeId?: string } | null>(null);
    const [snapFeedback, setSnapFeedback] = useState<SnapFeedback | null>(null);
    const [zoomSelection, setZoomSelection] = useState<ZoomSelection | null>(null);
    const [autoLength, setAutoLength] = useState<boolean>(false);
    // scale and viewOffset moved to Context
    const lastClickRef = useRef<{ id: string, time: number } | null>(null);
    const lastMiddleClickRef = useRef<number>(0);
    // const canvasRef = useRef<HTMLDivElement>(null); // Moved up

    const [isPanning, setIsPanning] = useState<boolean>(false);
    const panStartRef = useRef<{ x: number, y: number } | null>(null);
    const [hasMovedDuringPan, setHasMovedDuringPan] = useState<boolean>(false);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, objectId: string, type: 'pipe' | 'chamber' } | null>(null);
    const [draggingProfilePoint, setDraggingProfilePoint] = useState<{ pipeId: string, pointIndex: number } | null>(null);
    const [draggingAirValve, setDraggingAirValve] = useState<{ pipeId: string, nodeId: string } | null>(null);
    const [drawingVertices, setDrawingVertices] = useState<GeometricVertex[]>([]);
    const [draggingVertexIdx, setDraggingVertexIdx] = useState<{ pipeId: string, index: number } | null>(null);
    const [editingHandle, setEditingHandle] = useState<{ x: number, y: number, pipeId: string } | null>(null);
    const [focusedWetWellId, setFocusedWetWellId] = useState<string | null>(null);
    const [wetWellSelectionView, setWetWellSelectionView] = useState<'pumping' | 'affluents'>('pumping');
    const [traceMode, setTraceMode] = useState<boolean>(false);
    const [routeToastMessage, setRouteToastMessage] = useState<string>('');
    const [routeAlternatives, setRouteAlternatives] = useState<RoutePathGravity[]>([]);
    const [selectedRouteAlternativeIndex, setSelectedRouteAlternativeIndex] = useState(0);
    const [showRouteAlternativesModal, setShowRouteAlternativesModal] = useState(false);


    React.useEffect(() => {
        const handleClickOutside = () => setContextMenu(null);
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && pipeStart) {
                // Finalize pipe via Enter key
                finalizePipe(mousePos.x, mousePos.y, null);
            }
        };
        window.addEventListener('click', handleClickOutside);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('click', handleClickOutside);
            window.removeEventListener('keydown', handleKeyDown);
        }
    }, [pipeStart, mousePos, drawingVertices]);

    React.useEffect(() => {
        if (editingHandle && !selectedIds.has(editingHandle.pipeId)) {
            setEditingHandle(null);
        }
    }, [selectedIds, editingHandle]);

    React.useEffect(() => {
        if (!readOnly) return;
        setDraggingId(null);
        setDraggingProfilePoint(null);
        setDraggingAirValve(null);
        setDraggingVertexIdx(null);
        setPipeStart(null);
        setDrawingVertices([]);
        setContextMenu(null);
        setEditingHandle(null);
    }, [readOnly]);

    React.useEffect(() => {
        if (!focusedWetWellId) return;
        if (selectedIds.has(focusedWetWellId)) return;
        setFocusedWetWellId(null);
    }, [selectedIds, focusedWetWellId]);

    React.useEffect(() => {
        if (!routeSelectionMode) return;
        if (activeTool !== 'pointer' && activeTool !== 'query') {
            setActiveTool('pointer');
        }
    }, [routeSelectionMode, activeTool, setActiveTool]);

    const SYSTEM_PALETTE = React.useMemo(() => [
        'var(--accent)',
        'var(--success)',
        'var(--warning)',
        'var(--danger)',
        'var(--system-4)',
        'var(--system-5)',
        'var(--system-6)',
        'var(--success)'
    ], []);

    const getSystemColor = React.useCallback((systemId?: string) => {
        if (!systemId) return 'var(--accent-soft)';
        const system = pumpingSystems.find(entry => entry.id === systemId);
        if (system?.color) return system.color;
        const index = pumpingSystems.findIndex(entry => entry.id === systemId);
        if (index < 0) return 'var(--accent-soft)';
        return SYSTEM_PALETTE[index % SYSTEM_PALETTE.length];
    }, [pumpingSystems, SYSTEM_PALETTE]);

    const getNodeSystemId = React.useCallback((nodeId?: string): string | undefined => {
        if (!nodeId) return undefined;
        const wetWell = wetWells.find(w => w.id === nodeId);
        if (wetWell?.systemId) return wetWell.systemId;
        const pump = pumps.find(p => p.id === nodeId);
        if (pump?.systemId) return pump.systemId;
        const junction = pressureJunctions.find(j => j.id === nodeId);
        if (junction?.systemId) return junction.systemId;
        const outfall = outfallsPressure.find(o => o.id === nodeId);
        if (outfall?.systemId) return outfall.systemId;
        return undefined;
    }, [wetWells, pumps, pressureJunctions, outfallsPressure]);

    const isPressureElementId = React.useCallback((objectId?: string): boolean => {
        if (!objectId) return false;
        if (wetWells.some(w => w.id === objectId)) return true;
        if (pumps.some(p => p.id === objectId)) return true;
        if (pressureJunctions.some(j => j.id === objectId)) return true;
        if (outfallsPressure.some(o => o.id === objectId)) return true;
        if (pressurePipes.some(pipe => pipe.id === objectId)) return true;
        return pressurePipes.some(pipe => (pipe.inlineNodes || []).some(node => node.id === objectId));
    }, [wetWells, pumps, pressureJunctions, outfallsPressure, pressurePipes]);

    const getEditingTypeForId = React.useCallback((objectId: string): 'chamber' | 'pipe' | 'air_valve' => {
        if (pressurePipes.some(pipe => pipe.id === objectId)) return 'pipe';
        if (pressurePipes.some(pipe => (pipe.inlineNodes || []).some(node => node.id === objectId))) return 'air_valve';
        return 'chamber';
    }, [pressurePipes]);

    const createNextSystemId = React.useCallback((): string => {
        const existing = new Set(pumpingSystems.map(system => system.id));
        let index = 1;
        while (existing.has(`S-${index}`)) index += 1;
        return `S-${index}`;
    }, [pumpingSystems]);

    const createSystemShell = React.useCallback((systemId: string): PumpingSystem => ({
        id: systemId,
        name: `Sistema ${systemId.replace(/^S-/, '')}`,
        wetWellId: '',
        pumpId: '',
        dischargeStartNodeId: '',
        outfallNodeId: ''
    }), []);

    const ensureSystemExists = React.useCallback((systemId: string) => {
        setPumpingSystems(prev => {
            if (prev.some(system => system.id === systemId)) return prev;
            return [...prev, createSystemShell(systemId)];
        });
    }, [setPumpingSystems, createSystemShell]);

    const getOrCreateActiveSystemId = React.useCallback((): string => {
        if (activePumpingSystemId && pumpingSystems.some(system => system.id === activePumpingSystemId)) {
            return activePumpingSystemId;
        }

        if (pumpingSystems.length > 0) {
            const firstSystemId = pumpingSystems[0].id;
            setActivePumpingSystemId(firstSystemId);
            return firstSystemId;
        }

        const newSystemId = createNextSystemId();
        setPumpingSystems(prev => [...prev, createSystemShell(newSystemId)]);
        setActivePumpingSystemId(newSystemId);
        return newSystemId;
    }, [activePumpingSystemId, pumpingSystems, setActivePumpingSystemId, setPumpingSystems, createNextSystemId, createSystemShell]);

    const resolvePressurePipeSystem = React.useCallback((startNodeId?: string, endNodeId?: string): {
        blocked: boolean;
        reason?: string;
        systemId?: string;
    } => {
        const startSystemId = getNodeSystemId(startNodeId);
        const endSystemId = getNodeSystemId(endNodeId);

        if (startSystemId && endSystemId && startSystemId !== endSystemId) {
            return {
                blocked: true,
                reason: `No se puede crear enlace entre sistemas distintos (${startSystemId} y ${endSystemId}).`
            };
        }

        return {
            blocked: false,
            systemId: startSystemId || endSystemId || getOrCreateActiveSystemId()
        };
    }, [getNodeSystemId, getOrCreateActiveSystemId]);

    const upsertSystemFromPressureLink = React.useCallback((systemId: string, link: PressurePipe, linkKind: 'pipe' | 'pump_link') => {
        const resolveKind = (nodeId?: string): 'wetwell' | 'pump' | 'junction' | 'outfall' | null => {
            if (!nodeId) return null;
            if (wetWells.some(w => w.id === nodeId)) return 'wetwell';
            if (pumps.some(p => p.id === nodeId)) return 'pump';
            if (pressureJunctions.some(j => j.id === nodeId)) return 'junction';
            if (outfallsPressure.some(o => o.id === nodeId)) return 'outfall';
            return null;
        };

        const startKind = resolveKind(link.startNodeId);
        const endKind = resolveKind(link.endNodeId);

        setPumpingSystems(prev => {
            const current = prev.find(system => system.id === systemId) || createSystemShell(systemId);

            let wetWellId = current.wetWellId;
            let pumpId = current.pumpId;
            let dischargeStartNodeId = current.dischargeStartNodeId;
            let outfallNodeId = current.outfallNodeId;

            if (linkKind === 'pump_link') {
                if (startKind === 'wetwell') wetWellId = link.startNodeId || wetWellId;
                if (endKind === 'wetwell') wetWellId = link.endNodeId || wetWellId;
                if (startKind === 'pump') pumpId = link.startNodeId || pumpId;
                if (endKind === 'pump') pumpId = link.endNodeId || pumpId;
                if (!dischargeStartNodeId && pumpId) dischargeStartNodeId = pumpId;
            } else {
                if (startKind === 'pump') {
                    pumpId = link.startNodeId || pumpId;
                    dischargeStartNodeId = link.startNodeId || dischargeStartNodeId;
                }

                if (endKind === 'outfall') {
                    outfallNodeId = link.endNodeId || outfallNodeId;
                }

                const endJunction = pressureJunctions.find(j => j.id === link.endNodeId);
                if (
                    endJunction
                    && (endJunction.boundaryType === 'ATMOSPHERIC' || endJunction.boundaryType === 'PRESSURE_BREAK' || endJunction.boundaryType === 'FIXED_HEAD')
                ) {
                    outfallNodeId = endJunction.id;
                }
            }

            const updatedSystem: PumpingSystem = {
                ...current,
                id: systemId,
                name: current.name || `Sistema ${systemId.replace(/^S-/, '')}`,
                wetWellId,
                pumpId,
                dischargeStartNodeId,
                outfallNodeId
            };

            const index = prev.findIndex(system => system.id === systemId);
            if (index === -1) return [...prev, updatedSystem];

            const next = [...prev];
            next[index] = updatedSystem;
            return next;
        });
    }, [setPumpingSystems, createSystemShell, wetWells, pumps, pressureJunctions, outfallsPressure]);

    const assignNodeToSystem = React.useCallback((nodeId: string, systemId: string) => {
        setWetWells(prev => prev.map(w => w.id === nodeId ? { ...w, systemId, kind: 'wet_well' } : w));
        setPumps(prev => prev.map(p => p.id === nodeId ? { ...p, systemId, kind: 'pump' } : p));
        setPressureJunctions(prev => prev.map(j => j.id === nodeId ? {
            ...j,
            systemId,
            kind: j.boundaryType === 'PRESSURE_BREAK' ? 'break_pressure_chamber' : 'junction'
        } : j));
        setOutfallsPressure(prev => prev.map(o => o.id === nodeId ? { ...o, systemId, kind: 'outfall' } : o));
    }, [setWetWells, setPumps, setPressureJunctions, setOutfallsPressure]);

    const getPressureNodeKind = React.useCallback((nodeId?: string): 'wetwell' | 'pump' | 'junction' | 'outfall' | null => {
        if (!nodeId) return null;
        if (wetWells.some(w => w.id === nodeId)) return 'wetwell';
        if (pumps.some(p => p.id === nodeId)) return 'pump';
        if (pressureJunctions.some(j => j.id === nodeId)) return 'junction';
        if (outfallsPressure.some(o => o.id === nodeId)) return 'outfall';
        return null;
    }, [wetWells, pumps, pressureJunctions, outfallsPressure]);

    const isTerminalPressureNode = React.useCallback((nodeId?: string): boolean => {
        if (!nodeId) return false;
        if (outfallsPressure.some(outfall => outfall.id === nodeId)) return true;

        const junction = pressureJunctions.find(item => item.id === nodeId);
        if (!junction) return false;

        return junction.boundaryType === 'ATMOSPHERIC'
            || junction.boundaryType === 'PRESSURE_BREAK'
            || junction.boundaryType === 'FIXED_HEAD';
    }, [outfallsPressure, pressureJunctions]);

    const resolveWetWellForPressureElement = React.useCallback((focusedId: string): string | null => {
        if (wetWells.some(w => w.id === focusedId)) return focusedId;

        const focusedPump = pumps.find(p => p.id === focusedId);
        if (focusedPump?.wetWellId) return focusedPump.wetWellId;

        const systemByPump = pumpingSystems.find(system => system.pumpId === focusedId);
        if (systemByPump?.wetWellId) return systemByPump.wetWellId;

        const focusedPipe = pressurePipes.find(pipe => pipe.id === focusedId)
            || pressurePipes.find(pipe => (pipe.inlineNodes || []).some(node => node.id === focusedId));

        if (!focusedPipe) return null;

        const linkedNodeIds = [focusedPipe.startNodeId, focusedPipe.endNodeId].filter(Boolean) as string[];
        const wetWellNode = linkedNodeIds.find(nodeId => wetWells.some(w => w.id === nodeId));
        if (wetWellNode) return wetWellNode;

        const linkedPump = linkedNodeIds
            .map(nodeId => pumps.find(p => p.id === nodeId))
            .find(Boolean);

        if (linkedPump?.wetWellId) return linkedPump.wetWellId;

        const system = focusedPipe.systemId
            ? pumpingSystems.find(entry => entry.id === focusedPipe.systemId)
            : undefined;

        return system?.wetWellId || null;
    }, [wetWells, pumps, pumpingSystems, pressurePipes]);

    const buildPumpingScopeFromWetWell = React.useCallback((wetWellId: string): { ids: Set<string>; systemId?: string } | null => {
        const selected = new Set<string>([wetWellId]);

        const mappedSystems = pumpingSystems.filter(system => system.wetWellId === wetWellId);
        const pumpIds = new Set<string>();

        mappedSystems.forEach(system => {
            if (system.pumpId) pumpIds.add(system.pumpId);
        });

        pumps.forEach(pump => {
            if (pump.wetWellId === wetWellId) {
                pumpIds.add(pump.id);
            }
        });

        pressurePipes.forEach(pipe => {
            const kind = pipe.kind || 'pipe';
            if (kind !== 'pump_link') return;

            const linkedNodeIds = [pipe.startNodeId, pipe.endNodeId].filter(Boolean) as string[];
            const linksWetWell = linkedNodeIds.includes(wetWellId);
            if (!linksWetWell) return;

            const linkedPumpId = linkedNodeIds.find(nodeId => pumps.some(pump => pump.id === nodeId));
            if (linkedPumpId) pumpIds.add(linkedPumpId);
        });

        if (pumpIds.size === 0) {
            return null;
        }

        pumpIds.forEach(pumpId => {
            selected.add(pumpId);

            pressurePipes.forEach(pipe => {
                const kind = pipe.kind || 'pipe';
                if (kind !== 'pump_link') return;

                const linkedNodeIds = [pipe.startNodeId, pipe.endNodeId].filter(Boolean) as string[];
                if (!linkedNodeIds.includes(wetWellId) || !linkedNodeIds.includes(pumpId)) return;

                selected.add(pipe.id);
                (pipe.inlineNodes || []).forEach(node => selected.add(node.id));
            });
        });

        const queue = Array.from(pumpIds);
        const visitedNodes = new Set<string>(queue);

        while (queue.length > 0) {
            const currentNodeId = queue.shift() as string;

            const outgoingPipes = pressurePipes.filter(pipe => {
                const kind = pipe.kind || 'pipe';
                return kind === 'pipe' && pipe.startNodeId === currentNodeId;
            });

            outgoingPipes.forEach(pipe => {
                selected.add(pipe.id);
                (pipe.inlineNodes || []).forEach(node => selected.add(node.id));

                const endNodeId = pipe.endNodeId;
                if (!endNodeId) return;

                selected.add(endNodeId);
                if (visitedNodes.has(endNodeId)) return;

                visitedNodes.add(endNodeId);
                if (!isTerminalPressureNode(endNodeId)) {
                    queue.push(endNodeId);
                }
            });
        }

        const systemId = mappedSystems[0]?.id
            || pumps.find(pump => pump.wetWellId === wetWellId)?.systemId
            || wetWells.find(w => w.id === wetWellId)?.systemId;

        return { ids: selected, systemId };
    }, [pumpingSystems, pumps, pressurePipes, isTerminalPressureNode, wetWells]);

    const applySystemScopedSelection = React.useCallback((focusedId: string, type: 'chamber' | 'pipe' | 'air_valve') => {
        const linkedWetWellId = resolveWetWellForPressureElement(focusedId);
        if (linkedWetWellId) {
            const pumpingScope = buildPumpingScopeFromWetWell(linkedWetWellId);
            if (pumpingScope) {
                pumpingScope.ids.add(focusedId);
                setSelectedIds(pumpingScope.ids);
                setEditingObjectId({ id: focusedId, type });
                if (pumpingScope.systemId) {
                    setActivePumpingSystemId(pumpingScope.systemId);
                }
                return;
            }
        }

        const nodeSystemId = getNodeSystemId(focusedId)
            || pressurePipes.find(pipe => pipe.id === focusedId)?.systemId
            || pressurePipes.find(pipe => (pipe.inlineNodes || []).some(node => node.id === focusedId))?.systemId;

        if (!nodeSystemId) {
            setSelectedIds(new Set([focusedId]));
            setEditingObjectId({ id: focusedId, type });
            return;
        }

        const scoped = new Set<string>();
        wetWells.forEach(w => { if (w.systemId === nodeSystemId) scoped.add(w.id); });
        pumps.forEach(p => { if (p.systemId === nodeSystemId) scoped.add(p.id); });
        pressureJunctions.forEach(j => { if (j.systemId === nodeSystemId) scoped.add(j.id); });
        outfallsPressure.forEach(o => { if (o.systemId === nodeSystemId) scoped.add(o.id); });
        pressurePipes.forEach(pipe => {
            if (pipe.systemId !== nodeSystemId) return;
            scoped.add(pipe.id);
            (pipe.inlineNodes || []).forEach(node => scoped.add(node.id));
        });

        scoped.add(focusedId);
        setSelectedIds(scoped);
        setEditingObjectId({ id: focusedId, type });
        setActivePumpingSystemId(nodeSystemId);
    }, [
        resolveWetWellForPressureElement,
        buildPumpingScopeFromWetWell,
        getNodeSystemId,
        pressurePipes,
        wetWells,
        pumps,
        pressureJunctions,
        outfallsPressure,
        setSelectedIds,
        setEditingObjectId,
        setActivePumpingSystemId
    ]);

    const applyWetWellAffluentsSelection = React.useCallback((wetWellId: string) => {
        const selected = new Set<string>([wetWellId]);
        const queue: string[] = [wetWellId];
        const visitedNodes = new Set<string>([wetWellId]);

        while (queue.length > 0) {
            const currentNodeId = queue.shift() as string;
            const incomingPipes = pipes.filter(pipe => pipe.endNodeId === currentNodeId);

            incomingPipes.forEach(pipe => {
                selected.add(pipe.id);
                if (!pipe.startNodeId) return;
                selected.add(pipe.startNodeId);
                if (!visitedNodes.has(pipe.startNodeId)) {
                    visitedNodes.add(pipe.startNodeId);
                    queue.push(pipe.startNodeId);
                }
            });
        }

        setSelectedIds(selected);
        setEditingObjectId({ id: wetWellId, type: 'chamber' });
    }, [pipes, setSelectedIds, setEditingObjectId]);

    const applyWetWellSelection = React.useCallback((wetWellId: string) => {
        setFocusedWetWellId(wetWellId);
        if (wetWellSelectionView === 'affluents') {
            applyWetWellAffluentsSelection(wetWellId);
            return;
        }

        const pumpingScope = buildPumpingScopeFromWetWell(wetWellId);
        if (pumpingScope) {
            pumpingScope.ids.add(wetWellId);
            setSelectedIds(pumpingScope.ids);
            setEditingObjectId({ id: wetWellId, type: 'chamber' });
            if (pumpingScope.systemId) {
                setActivePumpingSystemId(pumpingScope.systemId);
            }
            return;
        }

        applySystemScopedSelection(wetWellId, 'chamber');
    }, [
        wetWellSelectionView,
        applyWetWellAffluentsSelection,
        buildPumpingScopeFromWetWell,
        setSelectedIds,
        setEditingObjectId,
        setActivePumpingSystemId,
        applySystemScopedSelection
    ]);

    React.useEffect(() => {
        if (!focusedWetWellId) return;
        if (!wetWells.some(w => w.id === focusedWetWellId)) {
            setFocusedWetWellId(null);
            return;
        }

        if (editingObjectId?.id && !isPressureElementId(editingObjectId.id)) {
            return;
        }

        if (wetWellSelectionView === 'affluents') {
            applyWetWellAffluentsSelection(focusedWetWellId);
        } else {
            const pumpingScope = buildPumpingScopeFromWetWell(focusedWetWellId);
            if (pumpingScope) {
                pumpingScope.ids.add(focusedWetWellId);
                setSelectedIds(pumpingScope.ids);
                if (!editingObjectId?.id || !pumpingScope.ids.has(editingObjectId.id)) {
                    setEditingObjectId({ id: focusedWetWellId, type: 'chamber' });
                }
                if (pumpingScope.systemId) {
                    setActivePumpingSystemId(pumpingScope.systemId);
                }
            } else {
                applySystemScopedSelection(focusedWetWellId, 'chamber');
            }
        }
    }, [
        focusedWetWellId,
        wetWellSelectionView,
        wetWells,
        applyWetWellAffluentsSelection,
        buildPumpingScopeFromWetWell,
        setSelectedIds,
        setEditingObjectId,
        setActivePumpingSystemId,
        applySystemScopedSelection,
        editingObjectId,
        isPressureElementId
    ]);

    React.useEffect(() => {
        if (pumpingSystems.length === 0) {
            if (activePumpingSystemId !== null) setActivePumpingSystemId(null);
            return;
        }

        if (!activePumpingSystemId || !pumpingSystems.some(system => system.id === activePumpingSystemId)) {
            setActivePumpingSystemId(pumpingSystems[0].id);
        }
    }, [pumpingSystems, activePumpingSystemId, setActivePumpingSystemId]);

    const activePumpingSystem = React.useMemo(
        () => pumpingSystems.find(system => system.id === activePumpingSystemId) || null,
        [pumpingSystems, activePumpingSystemId]
    );

    const getPressureSystemOpacity = React.useCallback((systemId?: string, isSelected = false): number => {
        if (!activePumpingSystemId) return 1;
        if (!systemId) return 0.35;
        if (systemId === activePumpingSystemId) return isSelected ? 1 : 0.98;
        return isSelected ? 0.45 : 0.22;
    }, [activePumpingSystemId]);

    const focusedWetWell = React.useMemo(
        () => wetWells.find(w => w.id === focusedWetWellId) || null,
        [wetWells, focusedWetWellId]
    );

    const chamberById = React.useMemo(() => {
        const map = new Map<string, Chamber>();
        chambers.forEach(chamber => map.set(chamber.id, chamber));
        return map;
    }, [chambers]);

    const resolveChamberLabel = React.useCallback((nodeId: string): string => {
        const chamber = chamberById.get(nodeId);
        return chamber?.userDefinedId || chamber?.id || nodeId;
    }, [chamberById]);

    const routeGraph = React.useMemo(
        () => buildGraphFromPipes(chambers, pipes),
        [chambers, pipes]
    );

    const routeNodeSet = React.useMemo(
        () => new Set(activeRoute?.nodeIds || []),
        [activeRoute]
    );

    const routePipeSet = React.useMemo(
        () => new Set(activeRoute?.pipeIds || []),
        [activeRoute]
    );

    const routeSummaryText = React.useMemo(() => {
        if (!activeRoute) return '';
        return formatRouteText(activeRoute, routeGraph.chamberById);
    }, [activeRoute, routeGraph]);

    const routeStartLabel = routeStartNodeId ? resolveChamberLabel(routeStartNodeId) : '';
    const routeEndLabel = routeEndNodeId ? resolveChamberLabel(routeEndNodeId) : '';

    const closeRouteAlternativesModal = React.useCallback(() => {
        setShowRouteAlternativesModal(false);
        setRouteAlternatives([]);
    }, []);

    const resetRouteSelection = React.useCallback(() => {
        setRouteSelectionMode(false);
        setRouteStartNodeId(null);
        setRouteEndNodeId(null);
        setActiveRoute(null);
        setRouteAlternatives([]);
        setShowRouteAlternativesModal(false);
        setSelectedRouteAlternativeIndex(0);
        setRouteToastMessage('');
    }, [
        setRouteSelectionMode,
        setRouteStartNodeId,
        setRouteEndNodeId,
        setActiveRoute
    ]);

    const buildRouteCandidates = React.useCallback((startNodeId: string, endNodeId: string): RoutePathGravity[] => {
        const dedupe = (paths: RoutePathGravity[]): RoutePathGravity[] => {
            const seen = new Set<string>();
            const unique: RoutePathGravity[] = [];
            paths.forEach(path => {
                const signature = `${path.nodeIds.join('>')}|${path.pipeIds.join('>')}`;
                if (seen.has(signature)) return;
                seen.add(signature);
                unique.push(path);
            });
            return unique.sort((left, right) => left.totalLength - right.totalLength);
        };

        const shortest = dijkstraRoute(routeGraph, startNodeId, endNodeId);
        if (!shortest) return [];

        const alternatives = enumerateKRoutes(routeGraph, startNodeId, endNodeId, 6);
        return dedupe([shortest, ...alternatives]);
    }, [routeGraph]);

    const applyRouteFromSelection = React.useCallback((startNodeId: string, endNodeId: string) => {
        const alternatives = buildRouteCandidates(startNodeId, endNodeId);

        if (alternatives.length === 0) {
            setRouteEndNodeId(null);
            setActiveRoute(null);
            setRouteAlternatives([]);
            setShowRouteAlternativesModal(false);
            setSelectedRouteAlternativeIndex(0);
            setRouteToastMessage('No hay conectividad entre cámaras seleccionadas');
            return;
        }

        setRouteToastMessage('');
        setRouteEndNodeId(endNodeId);
        setActiveRoute(alternatives[0]);

        if (alternatives.length > 1) {
            setRouteAlternatives(alternatives);
            setSelectedRouteAlternativeIndex(0);
            setShowRouteAlternativesModal(true);
        } else {
            setRouteAlternatives([]);
            setShowRouteAlternativesModal(false);
            setSelectedRouteAlternativeIndex(0);
        }
    }, [buildRouteCandidates, setRouteEndNodeId, setActiveRoute]);

    const handleRouteChamberClick = React.useCallback((nodeId: string): boolean => {
        if (!routeSelectionMode) return false;

        if (!routeStartNodeId || routeEndNodeId) {
            setRouteStartNodeId(nodeId);
            setRouteEndNodeId(null);
            setActiveRoute(null);
            setRouteAlternatives([]);
            setSelectedRouteAlternativeIndex(0);
            setShowRouteAlternativesModal(false);
            setRouteToastMessage('');
            return true;
        }

        if (nodeId === routeStartNodeId) {
            setRouteToastMessage('Seleccione una cámara final distinta a la inicial');
            return true;
        }

        applyRouteFromSelection(routeStartNodeId, nodeId);
        return true;
    }, [
        routeSelectionMode,
        routeStartNodeId,
        routeEndNodeId,
        setRouteStartNodeId,
        setRouteEndNodeId,
        setActiveRoute,
        applyRouteFromSelection
    ]);

    const confirmRouteAlternative = React.useCallback(() => {
        if (routeAlternatives.length === 0) {
            setShowRouteAlternativesModal(false);
            return;
        }

        const selected = routeAlternatives[Math.max(0, Math.min(selectedRouteAlternativeIndex, routeAlternatives.length - 1))];
        setActiveRoute(selected);
        setShowRouteAlternativesModal(false);
    }, [routeAlternatives, selectedRouteAlternativeIndex, setActiveRoute]);

    const routeAlternativeItems = React.useMemo(() => {
        return routeAlternatives.map((route) => ({
            route,
            text: `${formatRouteText(route, routeGraph.chamberById)} (${route.pipeIds.length} tramos, L=${route.totalLength.toFixed(2)} m)`
        }));
    }, [routeAlternatives, routeGraph]);

    const openRouteProfilePopout = React.useCallback(async () => {
        if (!activeRoute) return;
        if (!window.electronAPI?.openPopout) return;

        const snapshotJson = JSON.stringify({
            fileType: 'SMCALC_ALC',
            version: CURRENT_PROJECT_VERSION,
            schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
            chambers,
            pipes,
            settings: projectSettings
        });

        const analysisSnapshotJson = JSON.stringify(analysisResults ?? null);

        try {
            await window.electronAPI.openPopout({
                view: 'PROFILE_ROUTE_GRAVITY',
                selection: {
                    routeId: `${routeStartNodeId || 'NA'}-${routeEndNodeId || 'NA'}`,
                    route: {
                        nodeIds: activeRoute.nodeIds,
                        pipeIds: activeRoute.pipeIds,
                        totalLength: activeRoute.totalLength
                    }
                },
                snapshotJson,
                analysisSnapshotJson
            });
        } catch (error) {
            console.warn('No se pudo abrir el popout del perfil por ruta.', error);
            setRouteToastMessage('No se pudo abrir el perfil en ventana flotante');
        }
    }, [
        activeRoute,
        chambers,
        pipes,
        projectSettings,
        analysisResults,
        routeStartNodeId,
        routeEndNodeId
    ]);

    React.useEffect(() => {
        if (!routeToastMessage) return;
        const timer = window.setTimeout(() => setRouteToastMessage(''), 2600);
        return () => window.clearTimeout(timer);
    }, [routeToastMessage]);

    // Global pan events — keeps panning even when mouse leaves the canvas
    React.useEffect(() => {
        const handleMouseMoveGlobal = (e: MouseEvent) => {
            if (!isPanning || !panStartRef.current) return;
            const dx = e.clientX - panStartRef.current.x;
            const dy = e.clientY - panStartRef.current.y;
            setViewOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            panStartRef.current = { x: e.clientX, y: e.clientY };
        };
        const handleMouseUpGlobal = (e: MouseEvent) => {
            if (e.button === 1) {
                setIsPanning(false);
                panStartRef.current = null;
            }
        };
        window.addEventListener('mousemove', handleMouseMoveGlobal);
        window.addEventListener('mouseup', handleMouseUpGlobal);
        return () => {
            window.removeEventListener('mousemove', handleMouseMoveGlobal);
            window.removeEventListener('mouseup', handleMouseUpGlobal);
        };
    }, [isPanning]);

    React.useEffect(() => {
        if (!activePumpingSystemId) return;

        if (editingObjectId?.id && !isPressureElementId(editingObjectId.id)) {
            return;
        }

        const scoped = new Set<string>();
        wetWells.forEach(w => { if (w.systemId === activePumpingSystemId) scoped.add(w.id); });
        pumps.forEach(p => { if (p.systemId === activePumpingSystemId) scoped.add(p.id); });
        pressureJunctions.forEach(j => { if (j.systemId === activePumpingSystemId) scoped.add(j.id); });
        outfallsPressure.forEach(o => { if (o.systemId === activePumpingSystemId) scoped.add(o.id); });
        pressurePipes.forEach(pipe => {
            if (pipe.systemId !== activePumpingSystemId) return;
            scoped.add(pipe.id);
            (pipe.inlineNodes || []).forEach(node => scoped.add(node.id));
        });

        if (scoped.size === 0) return;

        setSelectedIds(scoped);

        if (editingObjectId?.id && scoped.has(editingObjectId.id)) {
            return;
        }

        const system = pumpingSystems.find(item => item.id === activePumpingSystemId);
        const focusId = system?.wetWellId || system?.pumpId || Array.from(scoped)[0];
        if (focusId) {
            setEditingObjectId({ id: focusId, type: getEditingTypeForId(focusId) });
        }

        if (system?.wetWellId) {
            setFocusedWetWellId(system.wetWellId);
            setWetWellSelectionView('pumping');
        }
    }, [
        activePumpingSystemId,
        pumpingSystems,
        wetWells,
        pumps,
        pressureJunctions,
        outfallsPressure,
        pressurePipes,
        setSelectedIds,
        setEditingObjectId,
        editingObjectId,
        isPressureElementId,
        getEditingTypeForId
    ]);
    // Initial and dynamic size tracking


    React.useEffect(() => {
        if (!canvasRef.current) return;
        const observer = new ResizeObserver(entries => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                setViewportSize({ width, height });
            }
        });
        observer.observe(canvasRef.current);
        return () => observer.disconnect();
    }, [setViewportSize]);

    // Grid Configuration
    const VISUAL_GRID_SIZE = 1; // 1 meter spacing? Or 10? User wants "Rejilla 1m = 2x pixels at 200%".
    // Actually, common CAD is 1 unit = 1 meter.
    // If we want a readable grid, maybe 10m or 5m spacing?
    // Code used `GRID_SIZE = 20`. Let's assume 20 units (meters).
    const GRID_SIZE = 20;
    const SHOW_GRID = true; // Could be a prop later
    const SNAP_RADIUS_CENTER = 15;
    const CHAMBER_RADIUS = 15;

    // Radius helper
    const getNodeRadius = (node: any, type: string): number => {
        // Real model radius
        const diameter = Number(node.diameter) || 1.2;
        return diameter / 2;
    };

    const getVal = (attr: any): number => {
        if (attr && typeof attr === 'object' && 'value' in attr) return Number(attr.value) || 0;
        return Number(attr) || 0;
    };

    const getNextChamberId = () => {
        let index = 1;
        while (chambers.some(c => c.userDefinedId === `C${index}`)) {
            index++;
        }
        return `C${index}`;
    };

    const getNextPipeId = () => {
        let index = 1;
        while (pipes.some(p => p.userDefinedId === `T${index}`)) {
            index++;
        }
        return `T${index}`;
    };

    const calculateSnap = (mouseX: number, mouseY: number): SnapFeedback => {
        // Collect all potential snap targets
        const candidates = [
            ...chambers.map(c => ({ id: c.id, x: c.x, y: c.y, type: 'chamber', radius: (Number(c.chamberType === 'Domiciliaria' ? 0.6 : (c as any).diameter) || 1.2) / 2 })), // Approx radius
            ...wetWells.map(w => ({ id: w.id, x: w.x, y: w.y, type: 'wetwell', radius: (w.diameter || 1.2) / 2 })),
            ...pumps.map(p => ({ id: p.id, x: p.x, y: p.y, type: 'pump', radius: 0.2 })), // Small radius for pumps
            ...wetWells.map(w => ({ id: w.id, x: w.x, y: w.y, type: 'wetwell', radius: (w.diameter || 1.2) / 2 })),
            ...pumps.map(p => ({ id: p.id, x: p.x, y: p.y, type: 'pump', radius: 0.2 })), // Small radius for pumps
            ...(outfallsPressure || []).map(o => ({ id: o.id, x: o.x, y: o.y, type: 'outfall', radius: 0.4 })),
            ...(pressureJunctions || []).map(j => ({ id: j.id, x: j.x, y: j.y, type: 'junction', radius: 0.3 }))
        ];

        // 1. Check Edge SNAP (Unified for all)
        for (const node of candidates) {
            // Screen space distance for snapping feel
            // We need to convert node radius to screen pixels to check "edge"
            const screenX = node.x * scale + viewOffset.x;
            const screenY = node.y * scale + viewOffset.y;
            const msX = mouseX * scale + viewOffset.x; // Wait, mouseX passed here is already model or screen?
            // The caller passes 'x' and 'y' which are MODEL coordinates usually. Let's verify usage.
            // usage: calculateSnap(x, y) where x,y are model coords.

            const dx = mouseX - node.x;
            const dy = mouseY - node.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Snap tolerance in model units (e.g. 10 pixels / scale)
            const tolerance = 15 / scale;

            if (Math.abs(distance - node.radius) < tolerance) {
                const angle = Math.atan2(dy, dx);
                return {
                    x: node.x + Math.cos(angle) * node.radius,
                    y: node.y + Math.sin(angle) * node.radius,
                    type: 'edge', // Unified: "AJUSTE BORDE"
                    targetId: node.id
                };
            }
        }

        // 2. Check Center SNAP needed? 
        // User requested: "La tubería no entra al centro del nodo."
        // But maybe we still want to snap to center for placement? 
        // Actually, if we SNAP to center, we should then AUTO-ADJUST to edge.
        // But the user said: "Ajuste Rejilla = Ajuste Borde".
        // Let's keep Center snap but it effectively behaves as "Target Node", and the pipe creation logic will clamp it.
        // However, if we return "center" type, the pipe creation might start at center.
        // Let's force everything to return a point on the perimeter if it hits a node.

        for (const node of candidates) {
            const dx = mouseX - node.x;
            const dy = mouseY - node.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const tolerance = 15 / scale;

            if (distance < node.radius + tolerance) {
                // Even if clicking inside, snap to edge?
                // Or snap to center and let creation logic fix it?
                // User says: "La tubería termina exactamente en el perímetro real del nodo."
                // So if I click center, it should calculate the vector to the OTHER end?
                // But for the START point, we don't know the other end yet.
                // So for the FIRST point, maybe center is fine, but as soon as we drag the second point, the first point adjusts?
                // Or we just snap to the edge closest to the mouse?

                const angle = Math.atan2(dy, dx);
                // If distance is very small (at center), angle is unstable.
                // Let's just return the center as a "Node Hit" and let the Pipe Logic handle the vector projection later.
                // BUT wait, `pipeStart` stores this coordinate.
                // If we store center, we need to update it when we define the second point.

                return {
                    x: node.x + Math.cos(angle) * node.radius, // Snap to rim even if inside
                    y: node.y + Math.sin(angle) * node.radius,
                    type: 'edge',
                    targetId: node.id
                };
            }
        }

        // 3. Free Movement (Grid Snap Removed)
        // User requested: "eliminar ajuste (snap) de rejilla"
        return {
            x: mouseX,
            y: mouseY,
            type: 'free' // No snap
        };
    };

    const calculateDistance = (x1: number, y1: number, x2: number, y2: number) => {
        return parseFloat(Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)).toFixed(3));
    };

    const calculatePipePathLength = (x1: number, y1: number, x2: number, y2: number, vertices?: GeometricVertex[]): number => {
        const pts = [{ x: x1, y: y1 }, ...(vertices || []), { x: x2, y: y2 }];
        let totalL = 0;
        for (let i = 0; i < pts.length - 1; i++) {
            totalL += calculateDistance(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
        }
        return totalL;
    };

    const pointToSegmentDistance = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const len_sq = C * C + D * D;
        let param = -1;
        if (len_sq !== 0) // in case of 0 length line
            param = dot / len_sq;

        let xx, yy;

        if (param < 0) {
            xx = x1;
            yy = y1;
        }
        else if (param > 1) {
            xx = x2;
            yy = y2;
        }
        else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const dx = px - xx;
        const dy = py - yy;
        return Math.sqrt(dx * dx + dy * dy);
    };

    const handleZoomExtents = () => {
        if (chambers.length === 0 && pipes.length === 0) {
            zoomExtents({ minX: 0, minY: 0, maxX: 0, maxY: 0 }, { width: 100, height: 100 }); // Reset
            return;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        chambers.forEach(c => {
            minX = Math.min(minX, c.x); minY = Math.min(minY, c.y);
            maxX = Math.max(maxX, c.x); maxY = Math.max(maxY, c.y);
        });
        pipes.forEach(p => {
            minX = Math.min(minX, p.x1, p.x2); minY = Math.min(minY, p.y1, p.y2);
            maxX = Math.max(maxX, p.x1, p.x2); maxY = Math.max(maxY, p.y1, p.y2);
        });

        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();

        zoomExtents(
            { minX, minY, maxX, maxY },
            { width: rect.width, height: rect.height }
        );
    };

    const handleWheel = (e: React.WheelEvent) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();

        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Target coordinates in model space before zoom
        const modelX = (mouseX - viewOffset.x) / scale;
        const modelY = (mouseY - viewOffset.y) / scale;

        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        let newScale = Math.min(Math.max(scale * zoomFactor, 0.05), 20);

        // New offset to keep model coordinates under mouse
        const newOffsetX = mouseX - modelX * newScale;
        const newOffsetY = mouseY - modelY * newScale;

        setScale(newScale);
        setViewOffset({ x: newOffsetX, y: newOffsetY });
    };

    const finalizePipe = (lastX: number, lastY: number, endNodeId: string | null) => {
        if (!pipeStart) return;

        let finalX1 = pipeStart.x;
        let finalY1 = pipeStart.y;
        let finalX2 = lastX;
        let finalY2 = lastY;

        // Determine aim points for connection correction
        const aimForStart = drawingVertices.length > 0 ? drawingVertices[0] : { x: finalX2, y: finalY2 };
        const aimForEnd = drawingVertices.length > 0 ? drawingVertices[drawingVertices.length - 1] : { x: finalX1, y: finalY1 };

        if (pipeStart.nodeId) {
            const startNode = chambers.find(c => c.id === pipeStart.nodeId) || wetWells.find(w => w.id === pipeStart.nodeId) || pumps.find(p => p.id === pipeStart.nodeId) || pressureJunctions.find(j => j.id === pipeStart.nodeId);
            if (startNode) {
                const radius = getNodeRadius(startNode, 'chamber');
                const corrected = calculatePipeConnectionPoint({ x: startNode.x, y: startNode.y }, radius, aimForStart);
                finalX1 = corrected.x;
                finalY1 = corrected.y;
            }
        }

        if (endNodeId) {
            const endNode = chambers.find(c => c.id === endNodeId) || wetWells.find(w => w.id === endNodeId) || pumps.find(p => p.id === endNodeId) || pressureJunctions.find(j => j.id === endNodeId);
            if (endNode) {
                const radius = getNodeRadius(endNode, 'chamber');
                const corrected = calculatePipeConnectionPoint({ x: endNode.x, y: endNode.y }, radius, aimForEnd);
                finalX2 = corrected.x;
                finalY2 = corrected.y;
            }
        }

        // Calculate total length
        let totalLength = 0;
        const pts = [{ x: finalX1, y: finalY1 }, ...drawingVertices, { x: finalX2, y: finalY2 }];
        for (let i = 0; i < pts.length - 1; i++) {
            totalLength += calculateDistance(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
        }

        if (totalLength < 0.1) {
            console.warn("Pipe too short. Creation blocked.");
            setPipeStart(null);
            setDrawingVertices([]);
            return;
        }

        snapshot();
        if (activeTool === 'pipe') {
            const startChamberType = pipeStart.nodeId
                ? chambers.find(chamber => chamber.id === pipeStart.nodeId)?.chamberType
                : undefined;
            const endChamberType = endNodeId
                ? chambers.find(chamber => chamber.id === endNodeId)?.chamberType
                : undefined;

            const newPipe: Pipe = {
                id: `pipe-${Date.now()}`,
                userDefinedId: getNextPipeId(),
                x1: finalX1, y1: finalY1, x2: finalX2, y2: finalY2,
                startNodeId: pipeStart.nodeId,
                endNodeId: endNodeId || undefined,
                pipeRole: inferPipeRoleFromNodeTypes(startChamberType, endChamberType),
                material: { value: 'PVC', origin: 'manual' },
                diameter: { value: 110, origin: 'manual' },
                length: { value: parseFloat(totalLength.toFixed(2)), origin: 'manual' },
                lengthMode: 'manual',
                slope: { value: 0, origin: 'manual' },
                slopeLocked: false,
                isSlopeManual: false,
                uehTransportadas: { value: 0, origin: 'calculated' },
                qContinuous: { value: 0, origin: 'manual' },
                manningOrigin: 'Global',
                vertices: drawingVertices.length > 0 ? drawingVertices : undefined
            };
            setPipes(prev => [...prev, newPipe]);
        } else if (activeTool === 'pressurepipe') {
            const startNodeId = pipeStart.nodeId;
            const normalizedEndNodeId = endNodeId || undefined;

            const systemResolution = resolvePressurePipeSystem(startNodeId, normalizedEndNodeId);
            if (systemResolution.blocked || !systemResolution.systemId) {
                alert(systemResolution.reason || 'No fue posible determinar el sistema de la tubería de presión.');
                setPipeStart(null);
                setDrawingVertices([]);
                return;
            }

            const systemId = systemResolution.systemId;
            ensureSystemExists(systemId);

            if (startNodeId && !getNodeSystemId(startNodeId)) {
                assignNodeToSystem(startNodeId, systemId);
            }
            if (normalizedEndNodeId && !getNodeSystemId(normalizedEndNodeId)) {
                assignNodeToSystem(normalizedEndNodeId, systemId);
            }

            const startKind = getPressureNodeKind(startNodeId);
            const endKind = getPressureNodeKind(normalizedEndNodeId);
            const linkKind: 'pipe' | 'pump_link' = (
                (startKind === 'wetwell' && endKind === 'pump')
                || (startKind === 'pump' && endKind === 'wetwell')
            )
                ? 'pump_link'
                : 'pipe';

            const newPressurePipe: PressurePipe = {
                id: `pressurepipe-${Date.now()}`,
                name: generatePressurePipeName(pressurePipes),
                x1: finalX1, y1: finalY1, x2: finalX2, y2: finalY2,
                startNodeId,
                endNodeId: normalizedEndNodeId,
                length: parseFloat(totalLength.toFixed(2)),
                diameter: 150, material: 'PVC', C_hazen: 140,
                z_start: 100, z_end: 100, PN: 10,
                z_start_terreno: 100,
                z_end_terreno: 100,
                cover_m: 1,
                kFactors: [],
                kind: linkKind,
                systemId,
                vertices: drawingVertices.length > 0 ? drawingVertices : undefined
            };

            if (linkKind === 'pump_link') {
                const wetWellId = startKind === 'wetwell' ? startNodeId : normalizedEndNodeId;
                const pumpId = startKind === 'pump' ? startNodeId : normalizedEndNodeId;
                if (pumpId && wetWellId) {
                    setPumps(prev => prev.map(p => p.id === pumpId ? { ...p, wetWellId, systemId } : p));
                }
            } else if (startKind === 'pump' && startNodeId) {
                const dischargeLineId = newPressurePipe.id;
                setPumps(prev => prev.map(p => p.id === startNodeId ? { ...p, dischargeLineId, systemId } : p));
            }

            upsertSystemFromPressureLink(systemId, newPressurePipe, linkKind);
            setActivePumpingSystemId(systemId);
            setPressurePipes(prev => [...prev, newPressurePipe]);
        }

        setPipeStart(null);
        setDrawingVertices([]);
    };

    const handleDeleteVertex = (pipeId: string, index: number) => {
        if (readOnly) return;
        snapshot();
        const updateGravityPipe = (p: Pipe) => {
            if (p.id !== pipeId) return p;
            const newVertices = [...(p.vertices || [])];
            newVertices.splice(index, 1);

            const nextPipe = {
                ...p,
                vertices: newVertices.length > 0 ? newVertices : undefined
            };

            const totalL = calculatePipePathLength(nextPipe.x1, nextPipe.y1, nextPipe.x2, nextPipe.y2, nextPipe.vertices);
            return withCalculatedPipeLength(nextPipe, totalL);
        };

        const updatePressurePipe = (p: PressurePipe) => {
            if (p.id !== pipeId) return p;
            const newVertices = [...(p.vertices || [])];
            newVertices.splice(index, 1);
            const nextPipe = {
                ...p,
                vertices: newVertices.length > 0 ? newVertices : undefined
            };
            const totalL = calculatePipePathLength(nextPipe.x1, nextPipe.y1, nextPipe.x2, nextPipe.y2, nextPipe.vertices);
            return {
                ...nextPipe,
                length: parseFloat(totalL.toFixed(2))
            };
        };

        setPipes(prev => prev.map(updateGravityPipe));
        setPressurePipes(prev => prev.map(updatePressurePipe));
    };

    const handlePipeClick = (pipe: any, clickX: number, clickY: number) => {
        if (readOnly) return;
        // STRICT MODE CHECK: Only allow editing in EDIT_PIPE mode
        if (interactionMode !== 'EDIT_PIPE') return;

        snapshot();

        // Find the segment where the click occurred and insert vertex
        const pts = [{ x: pipe.x1, y: pipe.y1 }, ...(pipe.vertices || []), { x: pipe.x2, y: pipe.y2 }];
        let insertIdx = -1;
        let minDist = 2; // threshold

        for (let i = 0; i < pts.length - 1; i++) {
            const d = pointToSegmentDistance(clickX, clickY, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
            if (d < minDist) {
                insertIdx = i; // Insert after index i (which means at index i in the 'vertices' array)
                break;
            }
        }

        if (insertIdx !== -1) {
            const updateGravityPipe = (p: Pipe) => {
                if (p.id !== pipe.id) return p;
                const newVertices = [...(p.vertices || [])];
                newVertices.splice(insertIdx, 0, { x: clickX, y: clickY });

                const nextPipe = {
                    ...p,
                    vertices: newVertices
                };

                const totalL = calculatePipePathLength(nextPipe.x1, nextPipe.y1, nextPipe.x2, nextPipe.y2, nextPipe.vertices);
                return withCalculatedPipeLength(nextPipe, totalL);
            };

            const updatePressurePipe = (p: PressurePipe) => {
                if (p.id !== pipe.id) return p;
                const newVertices = [...(p.vertices || [])];
                newVertices.splice(insertIdx, 0, { x: clickX, y: clickY });
                const nextPipe = {
                    ...p,
                    vertices: newVertices
                };
                const totalL = calculatePipePathLength(nextPipe.x1, nextPipe.y1, nextPipe.x2, nextPipe.y2, nextPipe.vertices);
                return {
                    ...nextPipe,
                    length: parseFloat(totalL.toFixed(2))
                };
            };

            setPipes(prev => prev.map(updateGravityPipe));
            setPressurePipes(prev => prev.map(updatePressurePipe));
        }
    };

    const updateAutoLengths = (chamberId: string, newX: number, newY: number) => {
        if (!autoLength) return;
        setPipes(prev => prev.map(p => {
            if (p.startNodeId === chamberId || p.endNodeId === chamberId) {
                if (resolvePipeLengthMode(p) !== 'auto') {
                    return p;
                }

                const startNode = p.startNodeId === chamberId ? { x: newX, y: newY } : chambers.find(c => c.id === p.startNodeId);
                const endNode = p.endNodeId === chamberId ? { x: newX, y: newY } : chambers.find(c => c.id === p.endNodeId);

                const x1 = startNode ? startNode.x : p.x1;
                const y1 = startNode ? startNode.y : p.y1;
                const x2 = endNode ? endNode.x : p.x2;
                const y2 = endNode ? endNode.y : p.y2;

                const totalL = calculatePipePathLength(x1, y1, x2, y2, p.vertices);
                return withCalculatedPipeLength(p, totalL);
            }
            return p;
        }));
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!canvasRef.current) return;

        // Update cursor based on tool
        if (activeTool === 'zoom-window') {
            setZoomSelection({
                startX: e.clientX,
                startY: e.clientY,
                currentX: e.clientX,
                currentY: e.clientY
            });
            return;
        }

        // READ-ONLY GUARD
        if (readOnly) {
            // Only allow panning and simple selection (no editing triggers)
            // CAD STYLE: Button 1 (Middle) and Button 2 (Right) for PANNING
            if (activeTool === 'pan' || e.button === 1 || e.button === 2) {
                e.preventDefault();
                setIsPanning(true);
                setHasMovedDuringPan(false);
                panStartRef.current = { x: e.clientX, y: e.clientY };
                return;
            }
        } else {
            // Handle Pan Tool / CAD Style Pan (Writable mode)
            if (activeTool === 'pan' || e.button === 1 || e.button === 2) {
                // If it's button 2 (right), we might want to open context menu on UP if no movement
                // If it's button 1 (middle), it's ALWAYS panning
                e.preventDefault();
                setIsPanning(true);
                setHasMovedDuringPan(false);
                panStartRef.current = { x: e.clientX, y: e.clientY };
                return;
            }
        }


        if (e.button !== 0) return;

        const rect = canvasRef.current.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        // Convert screen to model space
        const x = (screenX - viewOffset.x) / scale;
        const y = (screenY - viewOffset.y) / scale;

        // Check bounds for creation
        const isInside = x >= mapDimensions.minX && x <= mapDimensions.maxX &&
            y >= mapDimensions.minY && y <= mapDimensions.maxY;

        if (activeTool === 'camera') {
            if (readOnly) return; // Block creation
            if (!isInside) {
                console.warn(`Chamber created outside map bounds: (${x.toFixed(2)}, ${y.toFixed(2)})`);
                // Allow creation but log warning - user may need to adjust map dimensions
            }
            snapshot(); // Save state before creation
            const newChamber: Chamber = {
                id: `chamber-${Date.now()}`,
                userDefinedId: getNextChamberId(),
                x,
                y,
                CT: { value: 100, origin: 'manual' },
                H: { value: 0, origin: 'manual' },
                heightLocked: true,
                Cre: { value: 0, origin: 'calculated' },
                CRS: { value: 0, origin: 'calculated' },
                delta: { value: 0, origin: 'manual' },
                deltaMode: 'manual',
                Qin: { value: 0, origin: 'manual' },
                uehPropias: { value: 0, origin: 'manual' },
                uehAcumuladas: { value: 0, origin: 'calculated' },
                chamberType: 'Domiciliaria',
                chamberDimension: '120 cm'
            };

            let nextChambers = [...chambers, newChamber];
            let nextPipes = pipes;

            setChambers(nextChambers);
            if (nextPipes !== pipes) setPipes(nextPipes); // Only if changed (unlikely for camera add)
        } else if (activeTool === 'pipe') {
            const snap = calculateSnap(x, y);

            // Check bounds for pipe start/end
            const isSnapInside = snap.x >= mapDimensions.minX && snap.x <= mapDimensions.maxX &&
                snap.y >= mapDimensions.minY && snap.y <= mapDimensions.maxY;

            if (readOnly) return; // Block creation

            if (!isSnapInside) {
                console.warn(`Pipe point outside map bounds: (${snap.x.toFixed(2)}, ${snap.y.toFixed(2)})`);
                // Allow creation but log warning
            }

            if (!pipeStart) {
                setPipeStart({ x: snap.x, y: snap.y, nodeId: snap.targetId });
                setDrawingVertices([]);
            } else {
                if (snap.targetId) {
                    // Clicked on a node, finalize
                    finalizePipe(snap.x, snap.y, snap.targetId);
                } else {
                    // Clicked on empty space, add vertex
                    setDrawingVertices(prev => [...prev, { x: snap.x, y: snap.y }]);
                }
            }
        } else if (activeTool === 'wetwell') {
            if (readOnly) return;
            if (!isInside) {
                console.warn(`WetWell created outside map bounds: (${x.toFixed(2)}, ${y.toFixed(2)})`);
            }
            snapshot();
            let systemId = getOrCreateActiveSystemId();
            const activeSystem = pumpingSystems.find(system => system.id === systemId);
            if (activeSystem?.wetWellId) {
                systemId = createNextSystemId();
            }
            ensureSystemExists(systemId);
            const newWetWell: WetWell = {
                id: `wetwell-${Date.now()}`,
                name: generateWetWellName(wetWells),
                kind: 'wet_well',
                systemId,
                x, y,
                CR: 95, CT: 100, CL: 98, CI: 96,
                Nmin: 96.5, Noff: 97, N1on: 97.5, Nalarm: 99,
                diameter: 2
            };
            setPumpingSystems(prev => {
                const current = prev.find(system => system.id === systemId) || createSystemShell(systemId);
                const updated: PumpingSystem = {
                    ...current,
                    wetWellId: current.wetWellId || newWetWell.id
                };
                const index = prev.findIndex(system => system.id === systemId);
                if (index < 0) return [...prev, updated];
                const next = [...prev];
                next[index] = updated;
                return next;
            });
            setWetWells(prev => [...prev, newWetWell]);
            setActivePumpingSystemId(systemId);
        } else if (activeTool === 'pump') {
            if (readOnly) return;
            if (!isInside) {
                console.warn(`Pump created outside map bounds: (${x.toFixed(2)}, ${y.toFixed(2)})`);
            }
            snapshot();
            const systemId = getOrCreateActiveSystemId();
            ensureSystemExists(systemId);
            const linkedWetWell = wetWells.find(w => w.systemId === systemId);
            const newPump: Pump = {
                id: `pump-${Date.now()}`,
                name: generatePumpName(pumps),
                kind: 'pump',
                systemId,
                x, y,
                curveMode: '3_POINTS',
                point0: { Q: 0, H: 30 },
                pointNom: { Q: 0.015, H: 25 },
                pointMax: { Q: 0.03, H: 15 },
                hydraulicFlowMode: 'OPERATING_POINT_QSTAR',
                operatingLimits: { mode: 'STRICT' },
                npshMargin_m: 0.5,
                environmentalConditions: { mode: 'DEFAULT' },
                Qnom: 0.015, Hnom: 25, PN_usuario: 10,
                maxStartsPerHour: 10, minRunTime: 5, maxRunTime: 30,
                wetWellId: linkedWetWell?.id || '',
                dischargeLineId: ''
            };
            setPumpingSystems(prev => {
                const current = prev.find(system => system.id === systemId) || createSystemShell(systemId);
                const updated: PumpingSystem = {
                    ...current,
                    pumpId: current.pumpId || newPump.id,
                    dischargeStartNodeId: current.dischargeStartNodeId || newPump.id,
                    wetWellId: current.wetWellId || linkedWetWell?.id || ''
                };
                const index = prev.findIndex(system => system.id === systemId);
                if (index < 0) return [...prev, updated];
                const next = [...prev];
                next[index] = updated;
                return next;
            });
            setPumps(prev => [...prev, newPump]);
            setActivePumpingSystemId(systemId);
        } else if (activeTool === 'pressure_junction') {
            if (readOnly) return;
            if (!isInside) {
                console.warn(`Junction created outside map bounds: (${x.toFixed(2)}, ${y.toFixed(2)})`);
            }
            snapshot();
            const systemId = getOrCreateActiveSystemId();
            ensureSystemExists(systemId);
            const newJunction: PressureJunction = {
                id: `junction-${Date.now()}`,
                name: generatePressureJunctionName(pressureJunctions),
                kind: 'junction',
                systemId,
                x, y,
                elevation: 100,
                boundaryType: 'ATMOSPHERIC'
            };
            setPumpingSystems(prev => {
                const current = prev.find(system => system.id === systemId) || createSystemShell(systemId);
                const updated: PumpingSystem = {
                    ...current,
                    outfallNodeId: current.outfallNodeId || newJunction.id
                };
                const index = prev.findIndex(system => system.id === systemId);
                if (index < 0) return [...prev, updated];
                const next = [...prev];
                next[index] = updated;
                return next;
            });
            setPressureJunctions(prev => [...prev, newJunction]);
            setActivePumpingSystemId(systemId);
        } else if (activeTool === 'pressurepipe') {
            const snap = calculateSnap(x, y);
            const isSnapInside = snap.x >= mapDimensions.minX && snap.x <= mapDimensions.maxX &&
                snap.y >= mapDimensions.minY && snap.y <= mapDimensions.maxY;

            if (readOnly) return;
            if (!isSnapInside) {
                console.warn(`Pressure pipe point outside map bounds: (${snap.x.toFixed(2)}, ${snap.y.toFixed(2)})`);
            }

            if (!pipeStart) {
                setPipeStart({ x: snap.x, y: snap.y, nodeId: snap.targetId });
                setDrawingVertices([]);
            } else {
                if (snap.targetId) {
                    finalizePipe(snap.x, snap.y, snap.targetId);
                } else {
                    setDrawingVertices(prev => [...prev, { x: snap.x, y: snap.y }]);
                }
            }
        } else if (activeTool === 'pointer' || activeTool === 'query') {
            if (routeSelectionMode) {
                return;
            }

            const clickRadius = 18;
            let clickedNodeId: string | null = null;

            // 1. Check Chambers
            const clickedChamber = chambers.find(c => Math.sqrt(Math.pow(c.x - x, 2) + Math.pow(c.y - y, 2)) < clickRadius);
            if (clickedChamber) clickedNodeId = clickedChamber.id;

            // 2. Check WetWells
            if (!clickedNodeId) {
                const clickedWetWell = wetWells.find(w => Math.sqrt(Math.pow(w.x - x, 2) + Math.pow(w.y - y, 2)) < clickRadius);
                if (clickedWetWell) clickedNodeId = clickedWetWell.id;
            }

            // 3. Check Pumps
            if (!clickedNodeId) {
                const clickedPump = pumps.find(p => Math.sqrt(Math.pow(p.x - x, 2) + Math.pow(p.y - y, 2)) < clickRadius);
                if (clickedPump) clickedNodeId = clickedPump.id;
            }

            // 4. Check Junctions
            if (!clickedNodeId) {
                const clickedJunction = pressureJunctions.find(j => Math.sqrt(Math.pow(j.x - x, 2) + Math.pow(j.y - y, 2)) < clickRadius);
                if (clickedJunction) clickedNodeId = clickedJunction.id;
            }

            // Check pipe hit
            let clickedPipeId: string | null = null;
            if (!clickedNodeId) {
                // Gravity Pipes
                const clickedPipe = pipes.find(p => {
                    const startNode = chambers.find(c => c.id === p.startNodeId);
                    const endNode = chambers.find(c => c.id === p.endNodeId);

                    const x1 = Number(startNode ? startNode.x : p.x1);
                    const y1 = Number(startNode ? startNode.y : p.y1);
                    const x2 = Number(endNode ? endNode.x : p.x2);
                    const y2 = Number(endNode ? endNode.y : p.y2);

                    const dist = pointToSegmentDistance(x, y, x1, y1, x2, y2);
                    return dist < 7;
                });
                if (clickedPipe) clickedPipeId = clickedPipe.id;

                // Pressure Pipes
                if (!clickedPipeId) {
                    const clickedPressure = pressurePipes.find(p => {
                        const getAnyNode = (id: string | undefined) =>
                            chambers.find(c => c.id === id) ||
                            wetWells.find(w => w.id === id) ||
                            pumps.find(pm => pm.id === id);

                        const startNode = getAnyNode(p.startNodeId);
                        const endNode = getAnyNode(p.endNodeId);

                        const x1 = Number(startNode ? startNode.x : p.x1);
                        const y1 = Number(startNode ? startNode.y : p.y1);
                        const x2 = Number(endNode ? endNode.x : p.x2);
                        const y2 = Number(endNode ? endNode.y : p.y2);

                        const dist = pointToSegmentDistance(x, y, x1, y1, x2, y2);
                        return dist < 7;
                    });
                    if (clickedPressure) clickedPipeId = clickedPressure.id;
                }
            }

            if (clickedNodeId) {
                onChamberClick?.(clickedNodeId);
                const isWetWellNode = wetWells.some(w => w.id === clickedNodeId);
                const isPressureNode =
                    isWetWellNode
                    || pumps.some(p => p.id === clickedNodeId)
                    || pressureJunctions.some(j => j.id === clickedNodeId)
                    || outfallsPressure.some(o => o.id === clickedNodeId);

                if (activeTool === 'query' || readOnly) {
                    if (isPressureNode) {
                        if (isWetWellNode) {
                            applyWetWellSelection(clickedNodeId);
                        } else {
                            setFocusedWetWellId(null);
                            applySystemScopedSelection(clickedNodeId, 'chamber');
                        }
                    } else {
                        setFocusedWetWellId(null);
                        setEditingObjectId({ id: clickedNodeId, type: 'chamber' });
                    }
                } else {
                    if (isPressureNode) {
                        if (isWetWellNode) {
                            applyWetWellSelection(clickedNodeId);
                        } else {
                            setFocusedWetWellId(null);
                            applySystemScopedSelection(clickedNodeId, 'chamber');
                        }
                    } else {
                        setFocusedWetWellId(null);
                        setEditingObjectId({ id: clickedNodeId, type: 'chamber' });
                    }
                    snapshot(); // Save state before dragging starts
                    setDraggingId(clickedNodeId);
                }
            } else if (clickedPipeId) {
                const isPressurePipe = pressurePipes.some(p => p.id === clickedPipeId);
                if (isPressurePipe) {
                    setFocusedWetWellId(null);
                    applySystemScopedSelection(clickedPipeId, 'pipe');
                } else {
                    setFocusedWetWellId(null);
                    setEditingObjectId({ id: clickedPipeId, type: 'pipe' });
                }
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {


        if (!canvasRef.current) return;

        if (activeTool === 'zoom-window' && zoomSelection) {
            setZoomSelection(prev => prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : null);
            return;
        }



        if (isPanning && panStartRef.current) {
            const dx = e.clientX - panStartRef.current.x;
            const dy = e.clientY - panStartRef.current.y;

            let newOffsetX = viewOffset.x + dx;
            let newOffsetY = viewOffset.y + dy;

            // RELAXED PANNING: Removed aggressive clamping that prevented free movement
            // We just update the offset directly.
            // If we want a soft limit, we can add it later, but "free movement" is requested.
            setViewOffset({ x: newOffsetX, y: newOffsetY });
            panStartRef.current = { x: e.clientX, y: e.clientY };
            return;
        }

        const rect = canvasRef.current.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        // Model space coordinates
        const x = parseFloat(((screenX - viewOffset.x) / scale).toFixed(3));
        const y = parseFloat(((screenY - viewOffset.y) / scale).toFixed(3));

        setMousePos({ x, y });

        if (readOnly) {
            if (snapFeedback) {
                setSnapFeedback(null);
            }
            return;
        }

        if (draggingProfilePoint) {
            const pipe = pressurePipes.find(p => p.id === draggingProfilePoint.pipeId);
            if (!pipe) return;

            const dx_p = pipe.x2 - pipe.x1;
            const dy_p = pipe.y2 - pipe.y1;
            const L_geom = Math.sqrt(dx_p * dx_p + dy_p * dy_p);
            if (L_geom === 0) return;

            // Project mouse position onto pipe line
            const t_proj = ((x - pipe.x1) * dx_p + (y - pipe.y1) * dy_p) / (L_geom * L_geom);
            const rawT = Math.max(0, Math.min(1, t_proj));
            const newChainage = Math.round(rawT * pipe.length * 10) / 10;

            setPressurePipes(prev => prev.map(p => p.id === pipe.id ? {
                ...p,
                profilePoints: (p.profilePoints || []).map((pt, idx) =>
                    idx === draggingProfilePoint.pointIndex ? { ...pt, chainage: newChainage } : pt
                )
            } : p));
            return;
        }

        if (draggingVertexIdx) {
            const { pipeId, index } = draggingVertexIdx;
            const updateGravityPipe = (p: Pipe) => {
                if (p.id !== pipeId) return p;
                const newVertices = [...(p.vertices || [])];
                newVertices[index] = { x, y };

                const nextPipe = {
                    ...p,
                    vertices: newVertices
                };

                const totalL = calculatePipePathLength(nextPipe.x1, nextPipe.y1, nextPipe.x2, nextPipe.y2, nextPipe.vertices);
                return withCalculatedPipeLength(nextPipe, totalL);
            };

            const updatePressurePipe = (p: PressurePipe) => {
                if (p.id !== pipeId) return p;
                const newVertices = [...(p.vertices || [])];
                newVertices[index] = { x, y };
                const nextPipe = {
                    ...p,
                    vertices: newVertices
                };
                const totalL = calculatePipePathLength(nextPipe.x1, nextPipe.y1, nextPipe.x2, nextPipe.y2, nextPipe.vertices);
                return {
                    ...nextPipe,
                    length: parseFloat(totalL.toFixed(2))
                };
            };

            setPipes(prev => prev.map(updateGravityPipe));
            setPressurePipes(prev => prev.map(updatePressurePipe));
            return;
        }

        if (draggingAirValve) {
            const pipe = pressurePipes.find(p => p.id === draggingAirValve.pipeId);
            if (!pipe) return;

            const dx_p = pipe.x2 - pipe.x1;
            const dy_p = pipe.y2 - pipe.y1;
            const L_geom = Math.sqrt(dx_p * dx_p + dy_p * dy_p);
            if (L_geom === 0) return;

            // Project mouse position onto pipe line
            const t_proj = ((x - pipe.x1) * dx_p + (y - pipe.y1) * dy_p) / (L_geom * L_geom);
            const rawT = Math.max(0, Math.min(1, t_proj));

            // Map back to coordinates on the line
            const dragX = pipe.x1 + rawT * dx_p;
            const dragY = pipe.y1 + rawT * dy_p;
            const newChainage = Math.round(rawT * pipe.length * 10) / 10;

            setPressurePipes(prev => prev.map(p => p.id === pipe.id ? {
                ...p,
                inlineNodes: (p.inlineNodes || []).map(node =>
                    node.id === draggingAirValve.nodeId ? { ...node, chainage: newChainage, x: dragX, y: dragY } : node
                )
            } : p));
            return;
        }

        if (draggingId) {
            // FREE DRAGGING & PIPE RECALCULATION
            const newX = x;
            const newY = y;

            // 1. Update Node Position
            setChambers(prev => prev.map(c =>
                c.id === draggingId ? { ...c, x: newX, y: newY } : c
            ));

            // Also update WetWells/Pumps if dragging them (assuming draggingId covers them - need to check logic)
            // (The original code only updated 'chambers'. If pumps are drastic different, check logic.
            // But usually 'chambers' state handles 'pumps' if they are in same list? Ah, see updateAutoLengths)
            // Wait, we need to update the specific collection.
            if (wetWells.some(w => w.id === draggingId)) {
                setWetWells(prev => prev.map(w => w.id === draggingId ? { ...w, x: newX, y: newY } : w));
            } else if (pumps.some(p => p.id === draggingId)) {
                setPumps(prev => prev.map(p => p.id === draggingId ? { ...p, x: newX, y: newY } : p));
            } else if (outfallsPressure?.some(o => o.id === draggingId)) {
                // setOutfalls...
            } else if (pressureJunctions?.some(j => j.id === draggingId)) {
                setPressureJunctions(prev => prev.map(j => j.id === draggingId ? { ...j, x: newX, y: newY } : j));
            }


            // 2. Update Connected Pipes (Gravity)
            setPipes(prev => prev.map(p => {
                if (p.startNodeId === draggingId) {
                    // This is start node. Recalculate x1, y1 based on NEW node position and EXISTING endpoint x2,y2
                    // But wait, x2/y2 might be connected to another node.
                    // If connected to another node, x2/y2 IS the rim of that node. Accurate.

                    const nodeRadius = getNodeRadius(chambers.find(c => c.id === draggingId) || wetWells.find(w => w.id === draggingId), 'chamber');
                    const newPoint = calculatePipeConnectionPoint({ x: newX, y: newY }, nodeRadius, { x: p.x2, y: p.y2 });

                    // Also, we might need to update the OTHER end if it was pointing to the OLD center?
                    // No, if the other end is connected to a node, its x2,y2 is already on the rim of that node aimed at us.
                    // BUT since WE moved, the vector changed!
                    // The other node's connection point needs to rotate to face the new position of this node.
                    // So we must update BOTH ends of the pipe if both are connected.

                    let finalX2 = p.x2;
                    let finalY2 = p.y2;

                    if (p.endNodeId) {
                        const endNode = chambers.find(c => c.id === p.endNodeId) || wetWells.find(w => w.id === p.endNodeId);
                        if (endNode) {
                            const endRadius = getNodeRadius(endNode, 'chamber');
                            // Aim at our NEW position (newX, newY)
                            // Actually aim at our new RIM point? No, aim at our center for the vector calculation.
                            const adjustedEnd = calculatePipeConnectionPoint({ x: endNode.x, y: endNode.y }, endRadius, { x: newX, y: newY });
                            finalX2 = adjustedEnd.x;
                            finalY2 = adjustedEnd.y;
                        }
                    }

                    // Now recalculate OUR start point based on the updated Target
                    const adjustedStart = calculatePipeConnectionPoint({ x: newX, y: newY }, nodeRadius, { x: finalX2, y: finalY2 });

                    return { ...p, x1: adjustedStart.x, y1: adjustedStart.y, x2: finalX2, y2: finalY2 };
                }

                if (p.endNodeId === draggingId) {
                    // This is end node.
                    const nodeRadius = getNodeRadius(chambers.find(c => c.id === draggingId) || wetWells.find(w => w.id === draggingId), 'chamber');

                    // Update OTHER end first
                    let finalX1 = p.x1;
                    let finalY1 = p.y1;

                    if (p.startNodeId) {
                        const startNode = chambers.find(c => c.id === p.startNodeId) || wetWells.find(w => w.id === p.startNodeId);
                        if (startNode) {
                            const startRadius = getNodeRadius(startNode, 'chamber');
                            const adjustedStart = calculatePipeConnectionPoint({ x: startNode.x, y: startNode.y }, startRadius, { x: newX, y: newY });
                            finalX1 = adjustedStart.x;
                            finalY1 = adjustedStart.y;
                        }
                    }

                    const adjustedEnd = calculatePipeConnectionPoint({ x: newX, y: newY }, nodeRadius, { x: finalX1, y: finalY1 });
                    return { ...p, x1: finalX1, y1: finalY1, x2: adjustedEnd.x, y2: adjustedEnd.y };
                }

                return p;
            }));

            // 3. Update Connected Pressure Pipes
            setPressurePipes(prev => prev.map(p => {
                if (p.startNodeId === draggingId || p.endNodeId === draggingId) {
                    // Same logic as above
                    let targetX = p.startNodeId === draggingId ? p.x2 : p.x1;
                    let targetY = p.startNodeId === draggingId ? p.y2 : p.y1;

                    // Identify the OTHER node
                    const otherId = p.startNodeId === draggingId ? p.endNodeId : p.startNodeId;
                    const getOtherNode = (id: string) =>
                        chambers.find(c => c.id === id) ||
                        wetWells.find(w => w.id === id) ||
                        pumps.find(pm => pm.id === id) ||
                        pressureJunctions.find(j => j.id === id);

                    const otherNode = otherId ? getOtherNode(otherId) : null;

                    let finalX1 = p.x1;
                    let finalY1 = p.y1;
                    let finalX2 = p.x2;
                    let finalY2 = p.y2;

                    // Logic: 
                    // 1. Get positions of Start and End Nodes (Current dragging one is NEW pos, other is OLD pos)
                    // 2. Compute vectors and rim points for both.

                    const startNodeId = p.startNodeId;
                    const endNodeId = p.endNodeId;

                    const sNode = startNodeId === draggingId ? { x: newX, y: newY } : (chambers.find(c => c.id === startNodeId) || wetWells.find(w => w.id === startNodeId) || pumps.find(p => p.id === startNodeId) || pressureJunctions.find(j => j.id === startNodeId));
                    const eNode = endNodeId === draggingId ? { x: newX, y: newY } : (chambers.find(c => c.id === endNodeId) || wetWells.find(w => w.id === endNodeId) || pumps.find(p => p.id === endNodeId) || pressureJunctions.find(j => j.id === endNodeId));

                    if (sNode && eNode) {
                        // Both ends connected
                        const sRadius = getNodeRadius(sNode, 'chamber'); // approximate type
                        const eRadius = getNodeRadius(eNode, 'chamber');

                        const startP = calculatePipeConnectionPoint({ x: sNode.x, y: sNode.y }, sRadius, { x: eNode.x, y: eNode.y });
                        const endP = calculatePipeConnectionPoint({ x: eNode.x, y: eNode.y }, eRadius, { x: sNode.x, y: sNode.y });

                        finalX1 = startP.x; finalY1 = startP.y;
                        finalX2 = endP.x; finalY2 = endP.y;
                    } else if (sNode && !eNode) {
                        // Start connected (dragged?), End free
                        // If Dragging Start: End stays at p.x2,p.y2
                        // Start re-aims at p.x2,p.y2
                        const sRadius = getNodeRadius(sNode, 'chamber');
                        const startP = calculatePipeConnectionPoint({ x: sNode.x, y: sNode.y }, sRadius, { x: p.x2, y: p.y2 });
                        finalX1 = startP.x; finalY1 = startP.y;
                    } else if (!sNode && eNode) {
                        const eRadius = getNodeRadius(eNode, 'chamber');
                        const endP = calculatePipeConnectionPoint({ x: eNode.x, y: eNode.y }, eRadius, { x: p.x1, y: p.y1 });
                        finalX2 = endP.x; finalY2 = endP.y;
                    }

                    return { ...p, x1: finalX1, y1: finalY1, x2: finalX2, y2: finalY2 };
                }
                return p;
            }));

            updateAutoLengths(draggingId, newX, newY);
        }

        if (activeTool === 'pipe' || activeTool === 'pressurepipe') {
            const snap = calculateSnap(x, y);
            setSnapFeedback(snap);
        } else {
            setSnapFeedback(null);
        }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        setDraggingId(null);
        setDraggingProfilePoint(null);
        setDraggingAirValve(null);

        if (activeTool === 'select-area' && zoomSelection && canvasRef.current) {
            // Box Selection Logic
            const selectRect = {
                minX: Math.min(zoomSelection.startX, zoomSelection.currentX),
                maxX: Math.max(zoomSelection.startX, zoomSelection.currentX),
                minY: Math.min(zoomSelection.startY, zoomSelection.currentY),
                maxY: Math.max(zoomSelection.startY, zoomSelection.currentY)
            }

            // Convert to Model Coordinates
            const rect = canvasRef.current.getBoundingClientRect();
            const modelRect = {
                minX: (selectRect.minX - rect.left - viewOffset.x) / scale,
                maxX: (selectRect.maxX - rect.left - viewOffset.x) / scale,
                minY: (selectRect.minY - rect.top - viewOffset.y) / scale,
                maxY: (selectRect.maxY - rect.top - viewOffset.y) / scale
            };

            const newSelection: string[] = [];

            // Check Chambers
            chambers.forEach(c => {
                const cx = Number(c.x);
                const cy = Number(c.y);
                if (cx >= modelRect.minX && cx <= modelRect.maxX && cy >= modelRect.minY && cy <= modelRect.maxY) {
                    newSelection.push(c.id);
                }
            });

            // Check Pipes (simple bounding box check)
            pipes.forEach(p => {
                const px1 = Number(p.x1);
                const py1 = Number(p.y1);
                const px2 = Number(p.x2);
                const py2 = Number(p.y2);
                // Check if BOTH ends are inside? Or ANY part?
                // Standard behavior: Enclosed elements. So both ends inside or the bounding box fully inside.
                // Simplified: Check if center is inside or if either endpoint is inside.
                // Let's go with: If either endpoint is inside, key it.
                if ((px1 >= modelRect.minX && px1 <= modelRect.maxX && py1 >= modelRect.minY && py1 <= modelRect.maxY) ||
                    (px2 >= modelRect.minX && px2 <= modelRect.maxX && py2 >= modelRect.minY && py2 <= modelRect.maxY)) {
                    newSelection.push(p.id);
                }
            });

            // Check Pressure Pipes
            pressurePipes.forEach(p => {
                /* Similar logic */
                const px1 = Number(p.x1); // simplified
                const py1 = Number(p.y1);
                const px2 = Number(p.x2);
                const py2 = Number(p.y2);

                // Need actual coordinates if stored ones are NaN? No, render logic handles that.
                if (!isNaN(px1) && !isNaN(py1)) {
                    if ((px1 >= modelRect.minX && px1 <= modelRect.maxX && py1 >= modelRect.minY && py1 <= modelRect.maxY) ||
                        (px2 >= modelRect.minX && px2 <= modelRect.maxX && py2 >= modelRect.minY && py2 <= modelRect.maxY)) {
                        newSelection.push(p.id);
                    }
                }
            });

            if (newSelection.length > 0) {
                addToSelection(newSelection);
                // Switch back to pointer? Or keep selecting? Standard: Keep tool active or revert.
                // Let's revert to pointer for safety.
                setActiveTool('pointer');
            }
            setZoomSelection(null);
            return;
        }

        if (activeTool === 'zoom-window' && zoomSelection && canvasRef.current) {
            const rect = canvasRef.current.getBoundingClientRect();

            // Calculate screen coordinates of the selection box relative to canvas
            const screenMinX = Math.min(zoomSelection.startX, zoomSelection.currentX) - rect.left;
            const screenMinY = Math.min(zoomSelection.startY, zoomSelection.currentY) - rect.top;
            const screenMaxX = Math.max(zoomSelection.startX, zoomSelection.currentX) - rect.left;
            const screenMaxY = Math.max(zoomSelection.startY, zoomSelection.currentY) - rect.top;

            // Convert to model coordinates
            const minX = (screenMinX - viewOffset.x) / scale;
            const minY = (screenMinY - viewOffset.y) / scale;
            const maxX = (screenMaxX - viewOffset.x) / scale;
            const maxY = (screenMaxY - viewOffset.y) / scale;

            // Apply zoom if box is large enough (avoid incidental clicks)
            if (Math.abs(screenMaxX - screenMinX) > 10 && Math.abs(screenMaxY - screenMinY) > 10) {
                zoomExtents({ minX, minY, maxX, maxY }, { width: rect.width, height: rect.height });
                setActiveTool('pointer');
            }

            setZoomSelection(null);
            return;
        }

        if (isPanning) { // This block handles pan release for both middle and right click
            setIsPanning(false);
            panStartRef.current = null;
            if (e.button === 1) { // Middle button
                const now = Date.now();
                if (now - lastMiddleClickRef.current < 400) {
                    // Double middle click -> Zoom Extents
                    handleZoomExtents();
                    lastMiddleClickRef.current = 0;
                } else {
                    lastMiddleClickRef.current = now;
                }
            }
            // If it was a right-click pan, we don't want to open context menu if moved
            if (e.button === 2 && hasMovedDuringPan) {
                e.preventDefault(); // Prevent context menu if it was a pan
            }
        }
    };

    const handleContextMenu = (e: React.MouseEvent, objectId: string, type: 'chamber' | 'pipe') => {
        if (isPanning) return;
        if (readOnly) return; // Block context menu editing in read-only
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, objectId, type });
        setEditingObjectId({ id: objectId, type });
    };

    const handleAddProfilePoint = () => {
        if (readOnly) return;
        if (!contextMenu || contextMenu.type !== 'pipe') return;
        const pipe = pressurePipes.find(p => p.id === contextMenu.objectId);
        if (!pipe) return;

        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const mapX = (contextMenu.x - rect.left - viewOffset.x) / (scale > 0 ? scale : 1);
        const mapY = (contextMenu.y - rect.top - viewOffset.y) / (scale > 0 ? scale : 1);

        const dx = pipe.x2 - pipe.x1;
        const dy = pipe.y2 - pipe.y1;
        const L_geom = Math.sqrt(dx * dx + dy * dy);
        if (L_geom === 0) return;

        const t = ((mapX - pipe.x1) * dx + (mapY - pipe.y1) * dy) / (L_geom * L_geom);
        const chainage = Math.max(0, Math.min(pipe.length, t * pipe.length));

        setPressurePipes(prev => prev.map(p => p.id === pipe.id ? {
            ...p,
            profilePoints: [
                ...(p.profilePoints || []),
                {
                    id: createProfilePointId(),
                    chainage,
                    elevation: Number.isFinite(Number(p.z_start_terreno))
                        ? Number(p.z_start_terreno)
                        : Number(p.z_start || 0)
                }
            ]
        } : p));

        setContextMenu(null);
    };

    const handleCanvasContextMenu = (e: React.MouseEvent) => {
        e.preventDefault(); // ALWAYS prevent context menu to allow CAD style pan/click
        if (isPanning && hasMovedDuringPan) return;
        setActiveTool('pointer');
        setPipeStart(null);
    };



    // ========================================================================
    // HELPER: Calculate Intersection with Node Boundary (Edge Snap)
    // ========================================================================
    const calculateNodeBoundaryIntersection = (
        x1: number, y1: number, // Node Center
        x2: number, y2: number, // Target Point (Other Node Center)
        nodeType: 'circle' | 'square',
        size: number // Radius for circle, Half-width for square
    ): { x: number, y: number } => {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist === 0) return { x: x1, y: y1 };

        let intersectionX = x1;
        let intersectionY = y1;

        if (nodeType === 'circle') {
            // Simple vector projection
            intersectionX = x1 + (dx / dist) * size;
            intersectionY = y1 + (dy / dist) * size;
        } else {
            // Square/Rectangle intersection (Ray vs AABB)
            // For a square centered at x1,y1 with half-width 'size'
            // We want to find t such that point P = Start + t*Dir lies on the boundary
            // The boundary is defined by max(|x-x1|, |y-y1|) = size

            // Normalize direction
            const ux = dx / dist;
            const uy = dy / dist;

            // Avoid division by zero
            const tx = ux !== 0 ? (Math.sign(ux) * size) / ux : Infinity;
            const ty = uy !== 0 ? (Math.sign(uy) * size) / uy : Infinity;

            const t = Math.min(Math.abs(tx), Math.abs(ty));

            intersectionX = x1 + ux * t;
            intersectionY = y1 + uy * t;
        }

        return { x: intersectionX, y: intersectionY };
    };

    return (
        <main className="workspace">

            <div style={{ display: 'flex', flex: 1 }}>
                <div
                    className={`workspace-content ${!showGrid ? 'no-grid' : ''}`}
                    style={{ cursor: isPanning ? 'grabbing' : routeSelectionMode ? 'crosshair' : activeTool === 'pointer' ? 'default' : 'crosshair' }}
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                            setActiveTool('pointer');
                            setPipeStart(null);
                            setEditingObjectId(null);
                            clearSelection(); // Also clear selection
                            setRouteSelectionMode(false);
                            setRouteStartNodeId(null);
                            setRouteEndNodeId(null);
                            setActiveRoute(null);
                            setRouteAlternatives([]);
                            setShowRouteAlternativesModal(false);
                            setSelectedRouteAlternativeIndex(0);
                            setRouteToastMessage('');
                        }
                        if ((e.key === 'Delete' || e.key === 'Backspace') && readOnly) {
                            e.preventDefault();
                            return;
                        }
                        if (e.key === 'Delete' || e.key === 'Backspace') {
                            // Bulk Delete Logic
                            let idsToDelete = new Set(selectedIds);
                            if (idsToDelete.size === 0 && editingObjectId) {
                                idsToDelete.add(editingObjectId.id);
                            }

                            if (idsToDelete.size > 0) {
                                // 1. Delete Pipes
                                setPipes(prev => prev.filter(p => !idsToDelete.has(p.id) && !idsToDelete.has(p.startNodeId!) && !idsToDelete.has(p.endNodeId!)));
                                setPressurePipes(prev => prev.filter(p => !idsToDelete.has(p.id) && !idsToDelete.has(p.startNodeId!) && !idsToDelete.has(p.endNodeId!)));

                                // 2. Delete Nodes (Chambers, WetWells, Pumps)
                                setChambers(prev => prev.filter(c => !idsToDelete.has(c.id)));
                                setWetWells(prev => prev.filter(w => !idsToDelete.has(w.id)));
                                setPumps(prev => prev.filter(p => !idsToDelete.has(p.id)));
                                // outfalls?

                                clearSelection();
                                setEditingObjectId(null);
                            }
                        }
                    }}
                    ref={canvasRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={(e) => {
                        handleMouseMove(e);
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setMousePos({
                            x: e.clientX - rect.left,
                            y: e.clientY - rect.top
                        });
                    }}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={(e) => { if (!isPanning) handleMouseUp(e); }}
                    onAuxClick={(e) => e.preventDefault()}
                    onContextMenu={handleCanvasContextMenu}
                    onWheel={handleWheel}
                >
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                    }}>
                        <div style={{ transform: `translate(${viewOffset.x}px, ${viewOffset.y}px) scale(${scale})`, transformOrigin: '0 0' }}>

                            {/* SCALABLE SVG GRID & CONTENT */}
                            <svg
                                width="10"
                                height="10" // Non-zero size to ensure rendering
                                style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
                            >
                                <defs>
                                    {/* Dot Pattern for Grid */}
                                    <pattern id="gridPattern" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
                                        <circle cx="1" cy="1" r={0.5 / scale < 0.2 ? 0.2 : 0.5 / scale} fill="var(--pipe-default)" fillOpacity="0.5" />
                                        {/* Optimization: Keep dot size relatively constant in screen space or let it scale? 
                                        User wants "1m = 100px". 
                                        If we just let it scale, the dot gets huge.
                                        Let's try inverse scaling the radius: r={1 / scale}. 
                                        Then the dot stays "1px" on screen.
                                    */}
                                    </pattern>
                                </defs>

                                {/* Infinite Grid Background */}
                                <rect
                                    x="-50000" y="-50000"
                                    width="100000" height="100000"
                                    fill="url(#gridPattern)"
                                    style={{ pointerEvents: 'none' }}
                                />

                                {/* Backdrop Layer */}
                                {layers.backdrop && (
                                    <g style={{ opacity: 0.5, pointerEvents: 'none' }}>
                                        {/* Placeholder for backdrop if implementing actual image loading */}
                                        {/* <image href={backdrop.url} x={backdrop.x} y={backdrop.y} width={1000} height={1000} /> */}
                                    </g>
                                )}

                                {/* Pipes Layer */}
                                {layers.pipes && pipes.map(pipe => {
                                    const startNode = chambers.find(c => c.id === pipe.startNodeId);
                                    const endNode = chambers.find(c => c.id === pipe.endNodeId);

                                    const x1 = Number(pipe.x1);
                                    const y1 = Number(pipe.y1);
                                    const x2 = Number(pipe.x2);
                                    const y2 = Number(pipe.y2);

                                    const v = (analysisResults as any)?.velocities?.[pipe.id];
                                    const fill = (analysisResults as any)?.flows?.[pipe.id]; // Simplified for common check

                                    // Skip rendering if coordinates are invalid
                                    if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) return null;

                                    // DIRECT RENDER: No more "visual calculation". Trust the model.
                                    // The model x1,y1,x2,y2 are now guaranteed to be on the node perimeter (or where they should be).

                                    const midX = (x1 + x2) / 2;
                                    const midY = (y1 + y2) / 2;
                                    const dx = x2 - x1;
                                    const dy = y2 - y1;
                                    const length = Math.sqrt(dx * dx + dy * dy);
                                    const ux = dx / length;
                                    const uy = dy / length;

                                    // Normal vector (perpendicular to pipe)
                                    let nx = -uy;
                                    let ny = ux;
                                    if (ny > 0 || (ny === 0 && nx < 0)) {
                                        nx = uy;
                                        ny = -ux;
                                    }

                                    // Base offsets in screen pixels
                                    const idOffsetDist = 18 / scale;
                                    const boxOffsetDist = 32 / scale; // Reduced from 55 to be closer to pipe

                                    const idX = midX + nx * idOffsetDist;
                                    const idY = midY + ny * idOffsetDist;

                                    const pipePoints = [{ x: x1, y: y1 }, ...(pipe.vertices || []), { x: x2, y: y2 }];
                                    const polylinePoints = pipePoints.map(p => `${p.x},${p.y}`).join(' ');
                                    const isRoutePipe = routePipeSet.has(pipe.id);

                                    return (
                                        <g key={pipe.id} style={{ pointerEvents: 'all' }} onContextMenu={(e) => handleContextMenu(e, pipe.id, 'pipe')}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const rect = canvasRef.current!.getBoundingClientRect();
                                                const clickX = (e.clientX - rect.left - viewOffset.x) / scale;
                                                const clickY = (e.clientY - rect.top - viewOffset.y) / scale;

                                                if (!readOnly && interactionMode === 'EDIT_PIPE') {
                                                    handlePipeClick(pipe, clickX, clickY);
                                                }
                                                toggleSelection(pipe.id, 'pipe', e.ctrlKey);
                                            }}
                                        >

                                            {/* Selection Highlight (Glow/Halo) */}
                                            {selectedIds.has(pipe.id) && (
                                                <polyline
                                                    points={polylinePoints}
                                                    style={{
                                                        fill: 'none',
                                                        stroke: 'var(--accent)',
                                                        strokeWidth: Math.max(16, (Number(pipe.diameter.value) / 1000) * scale + 14),
                                                        strokeOpacity: 0.6,
                                                        strokeLinecap: 'round',
                                                        strokeLinejoin: 'round',
                                                        filter: 'blur(3px)',
                                                        vectorEffect: 'non-scaling-stroke'
                                                    }}
                                                />
                                            )}

                                            {isRoutePipe && (
                                                <polyline
                                                    points={polylinePoints}
                                                    style={{
                                                        fill: 'none',
                                                        stroke: 'var(--warning)',
                                                        strokeWidth: Math.max(7, (Number(pipe.diameter.value) / 1000) * scale + 3),
                                                        strokeOpacity: 0.85,
                                                        strokeLinecap: 'round',
                                                        strokeLinejoin: 'round',
                                                        filter: 'drop-shadow(0 0 4px rgba(250, 204, 21, 0.6))',
                                                        vectorEffect: 'non-scaling-stroke'
                                                    }}
                                                />
                                            )}

                                            <polyline
                                                points={polylinePoints}
                                                className="pipe-line"
                                                style={{
                                                    fill: 'none',
                                                    stroke: getPipeColor(pipe, visualizationMode, analysisResults, projectSettings, customColors),
                                                    strokeWidth: Math.max(3, (Number(pipe.diameter.value) / 1000) * scale),
                                                    strokeLinejoin: 'round',
                                                    vectorEffect: 'non-scaling-stroke'
                                                }}
                                            />
                                            <polyline
                                                points={polylinePoints}
                                                className="pipe-hitbox"
                                                style={{ fill: 'none' }}
                                            />

                                            {/* Geometric Vertex Markers (when selected) */}
                                            {selectedIds.has(pipe.id) && pipe.vertices?.map((v, idx) => (
                                                <circle
                                                    key={`v-${pipe.id}-${idx}`}
                                                    cx={v.x} cy={v.y}
                                                    r={5 / scale}
                                                    fill="white"
                                                    stroke="var(--accent)"
                                                    strokeWidth={2 / scale}
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation();
                                                        if (readOnly) return;
                                                        // STRICT MODE CHECK: Only allow moving vertices in EDIT_PIPE mode
                                                        if (interactionMode === 'EDIT_PIPE' && e.button === 0) {
                                                            setDraggingVertexIdx({ pipeId: pipe.id, index: idx });
                                                        }
                                                    }}
                                                    onContextMenu={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        if (readOnly) return;
                                                        // STRICT MODE CHECK: Only allow deleting vertices in EDIT_PIPE mode
                                                        if (interactionMode === 'EDIT_PIPE') {
                                                            handleDeleteVertex(pipe.id, idx);
                                                        }
                                                    }}
                                                    style={{ cursor: 'move' }}
                                                />
                                            ))}
                                            {/* Mandatory Pipe ID Label (Clean Text, Always Visible) */}
                                            <text
                                                x={idX}
                                                y={idY}
                                                textAnchor="middle"
                                                dominantBaseline="middle"
                                                style={{
                                                    fontSize: `${0.85 / Math.sqrt(scale)}rem`,
                                                    fontWeight: 800,
                                                    fill: 'var(--accent)',
                                                    pointerEvents: 'none',
                                                    userSelect: 'none'
                                                }}
                                            >
                                                {pipe.userDefinedId}
                                            </text>
                                            {visualizationMode === 'velocity' && (analysisResults as any)?.velocities && (analysisResults as any).velocities[pipe.id] !== undefined && (
                                                <text
                                                    x={midX}
                                                    y={midY + 15}
                                                    textAnchor="middle"
                                                    fontSize="11"
                                                    fill="#60a5fa"
                                                    fontWeight="600"
                                                >
                                                    v={(analysisResults as any).velocities[pipe.id].toFixed(2)} m/s
                                                </text>
                                            )}
                                            {/* Optional Pipe Labels (Customizable pill) */}
                                            {(() => {
                                                const hasVisibleData =
                                                    visibleLabelTypes.has('pipe_material') ||
                                                    visibleLabelTypes.has('pipe_diameter') ||
                                                    visibleLabelTypes.has('pipe_slope') ||
                                                    visibleLabelTypes.has('pipe_length') ||
                                                    (visibleLabelTypes.has('pipe_velocity') && (analysisResults as any)?.velocities?.[pipe.id] !== undefined);

                                                if (!layers.labels || !hasVisibleData) return null;

                                                return (
                                                    <foreignObject
                                                        x={midX + nx * boxOffsetDist - 60 / scale}
                                                        y={midY + ny * boxOffsetDist - 40 / scale}
                                                        width={120 / scale}
                                                        height={80 / scale}
                                                        style={{ pointerEvents: 'none', overflow: 'visible' }}
                                                    >
                                                        <div
                                                            className="pipe-label-pill"
                                                            style={{
                                                                width: '120px',
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                alignItems: 'center',
                                                                gap: '0px',
                                                                background: '#E0E0E0', // Light gray background like chamber
                                                                border: '1px solid rgba(0, 0, 0, 0.1)',
                                                                borderRadius: '4px',
                                                                padding: '2px 6px',
                                                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                                                fontSize: '0.75rem',
                                                                color: 'var(--accent)', // Blue text like chamber
                                                                fontWeight: 600,
                                                                transform: `scale(${1 / scale})`,
                                                                transformOrigin: 'center center',
                                                                whiteSpace: 'nowrap'
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                                {visibleLabelTypes.has('pipe_material') && <span>{pipe.material.value}</span>}
                                                                {visibleLabelTypes.has('pipe_diameter') && <span>Ø{pipe.diameter.value}</span>}
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                                {visibleLabelTypes.has('pipe_slope') && <span>P:{pipe.slope.value}%</span>}
                                                                {visibleLabelTypes.has('pipe_length') && <span>L:{pipe.length.value}m</span>}
                                                            </div>
                                                            {visibleLabelTypes.has('pipe_velocity') && (analysisResults as any)?.velocities?.[pipe.id] !== undefined && (
                                                                <div style={{ color: 'var(--accent)', borderTop: '1px solid rgba(0,0,0,0.1)', marginTop: '2px', width: '100%', textAlign: 'center' }}>
                                                                    V:{(analysisResults as any).velocities[pipe.id].toFixed(2)}m/s
                                                                </div>
                                                            )}
                                                        </div>
                                                    </foreignObject>
                                                );
                                            })()}
                                        </g>
                                    );
                                })}
                                {pipeStart && (
                                    <polyline
                                        points={[`${pipeStart.x},${pipeStart.y}`, ...drawingVertices.map(v => `${v.x},${v.y}`), snapFeedback ? `${snapFeedback.x},${snapFeedback.y}` : `${mousePos.x},${mousePos.y}`].join(' ')}
                                        className="pipe-line-preview"
                                        style={{ fill: 'none' }}
                                    />
                                )}
                                {/* Snap Feedback removed from SVG - moved to HTML Overlay */}

                                {/* ========================================== */}
                                {/* PRESSURE PIPES LAYER (Blue Dashed Lines with Edge Snap) */}
                                {/* ========================================== */}
                                {layers.pipes && pressurePipes.map(pipe => {
                                    // Default coordinates
                                    let x1 = Number(pipe.x1);
                                    let y1 = Number(pipe.y1);
                                    let x2 = Number(pipe.x2);
                                    let y2 = Number(pipe.y2);

                                    // Resolve dynamic coordinates from nodes
                                    const startWetWell = wetWells.find(w => w.id === pipe.startNodeId);
                                    const endWetWell = wetWells.find(w => w.id === pipe.endNodeId);
                                    const startPump = pumps.find(p => p.id === pipe.startNodeId);
                                    const endPump = pumps.find(p => p.id === pipe.endNodeId);
                                    const startChamber = chambers.find(c => c.id === pipe.startNodeId);
                                    const endChamber = chambers.find(c => c.id === pipe.endNodeId);
                                    const startOutfall = outfallsPressure?.find(o => o.id === pipe.startNodeId);
                                    const endOutfall = outfallsPressure?.find(o => o.id === pipe.endNodeId);

                                    // For now, only WetWells and Pumps are pressure nodes (Outfalls too later)

                                    if (startWetWell) { /* Pressure pipes might default to center or specific point? Let's use stored coords for consistency */ }
                                    // Checking stored coords first for Pressure Pipes too
                                    x1 = Number(pipe.x1);
                                    y1 = Number(pipe.y1);
                                    x2 = Number(pipe.x2);
                                    y2 = Number(pipe.y2);


                                    if (isNaN(x1)) x1 = startWetWell ? Number(startWetWell.x) : Number(startPump ? startPump.x : (startChamber ? startChamber.x : startOutfall?.x));
                                    if (isNaN(y1)) y1 = startWetWell ? Number(startWetWell.y) : Number(startPump ? startPump.y : (startChamber ? startChamber.y : startOutfall?.y));
                                    if (isNaN(x2)) x2 = endWetWell ? Number(endWetWell.x) : Number(endPump ? endPump.y : (endChamber ? endChamber.x : endOutfall?.x));
                                    if (isNaN(y2)) y2 = endWetWell ? Number(endWetWell.y) : Number(endPump ? endPump.y : (endChamber ? endChamber.y : endOutfall?.y));


                                    if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) return null;

                                    // DIRECT RENDER FOR PRESSURE PIPES TOO
                                    const drawX1 = x1;
                                    const drawY1 = y1;
                                    const drawX2 = x2;
                                    const drawY2 = y2;


                                    const midX = (x1 + x2) / 2; // Label still at true center
                                    const midY = (y1 + y2) / 2;
                                    const dx = x2 - x1;
                                    const dy = y2 - y1;
                                    const length = Math.sqrt(dx * dx + dy * dy);
                                    const ux = dx / length;
                                    const uy = dy / length;

                                    let nx = -uy;
                                    let ny = ux;
                                    if (ny > 0 || (ny === 0 && nx < 0)) {
                                        nx = uy;
                                        ny = -ux;
                                    }

                                    const systemColor = getSystemColor(pipe.systemId);
                                    const linkKind = pipe.kind || 'pipe';
                                    const systemOpacity = getPressureSystemOpacity(pipe.systemId, selectedIds.has(pipe.id));
                                    const systemName = pipe.systemId
                                        ? (pumpingSystems.find(system => system.id === pipe.systemId)?.name || pipe.systemId)
                                        : '';

                                    const labelText = linkKind === 'pump_link'
                                        ? (systemName || 'Sistema')
                                        : (pipe.name || pipe.id);

                                    const labelOffsetDist = (linkKind === 'pump_link' ? 28 : 18) / Math.max(scale, 0.75);
                                    const labelNx = linkKind === 'pump_link' ? -nx : nx;
                                    const labelNy = linkKind === 'pump_link' ? -ny : ny;
                                    const labelX = midX + labelNx * labelOffsetDist;
                                    const labelY = midY + labelNy * labelOffsetDist;
                                    const labelFontPx = linkKind === 'pump_link'
                                        ? Math.max(9, Math.min(12, 10 / Math.sqrt(Math.max(scale, 0.4))))
                                        : Math.max(8, Math.min(11, 9 / Math.sqrt(Math.max(scale, 0.4))));
                                    const showLabel = linkKind !== 'pump_link' || !activePumpingSystemId || pipe.systemId === activePumpingSystemId;

                                    const pipePoints = [{ x: x1, y: y1 }, ...(pipe.vertices || []), { x: x2, y: y2 }];
                                    const polylinePoints = pipePoints.map(p => `${p.x},${p.y}`).join(' ');

                                    return (
                                        <g
                                            key={pipe.id}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const rect = canvasRef.current!.getBoundingClientRect();
                                                const clickX = (e.clientX - rect.left - viewOffset.x) / scale;
                                                const clickY = (e.clientY - rect.top - viewOffset.y) / scale;

                                                if (!readOnly && interactionMode === 'EDIT_PIPE') {
                                                    handlePipeClick(pipe, clickX, clickY);
                                                }
                                                setFocusedWetWellId(null);
                                                applySystemScopedSelection(pipe.id, 'pipe');
                                            }}

                                        >
                                            {/* Selection Highlight */}
                                            {selectedIds.has(pipe.id) && (
                                                <polyline
                                                    points={polylinePoints}
                                                    style={{
                                                        fill: 'none',
                                                        stroke: systemColor,
                                                        strokeWidth: 16,
                                                        strokeOpacity: 0.6 * systemOpacity,
                                                        strokeLinecap: 'round',
                                                        strokeLinejoin: 'round',
                                                        filter: 'blur(3px)',
                                                        vectorEffect: 'non-scaling-stroke'
                                                    }}
                                                />
                                            )}
                                            {/* Main Pressure Pipe - Blue Dashed */}
                                            <polyline
                                                points={polylinePoints}
                                                className="pipe-line"
                                                style={{
                                                    fill: 'none',
                                                    stroke: systemColor,
                                                    strokeWidth: linkKind === 'pump_link'
                                                        ? Math.max(2, 0.6 * scale)
                                                        : Math.max(4, (Number(pipe.diameter) / 1000) * scale),
                                                    strokeDasharray: linkKind === 'pump_link' ? '4, 3' : '8, 4',
                                                    opacity: (linkKind === 'pump_link' ? 0.85 : 1) * systemOpacity,
                                                    strokeLinejoin: 'round',
                                                    vectorEffect: 'non-scaling-stroke'
                                                }}
                                            />

                                            {/* Geometric Vertex Markers (when selected) */}
                                            {selectedIds.has(pipe.id) && pipe.vertices?.map((v, idx) => (
                                                <circle
                                                    key={`v-${pipe.id}-${idx}`}
                                                    cx={v.x} cy={v.y}
                                                    r={5 / scale}
                                                    fill="white"
                                                    stroke="#3B82F6"
                                                    strokeWidth={2 / scale}
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation();
                                                        if (readOnly) return;
                                                        // STRICT MODE CHECK: Only allow moving vertices in EDIT_PIPE mode
                                                        if (interactionMode === 'EDIT_PIPE' && e.button === 0) {
                                                            setDraggingVertexIdx({ pipeId: pipe.id, index: idx });
                                                        }
                                                    }}
                                                    onContextMenu={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        if (readOnly) return;
                                                        // STRICT MODE CHECK: Only allow deleting vertices in EDIT_PIPE mode
                                                        if (interactionMode === 'EDIT_PIPE') {
                                                            handleDeleteVertex(pipe.id, idx);
                                                        }
                                                    }}
                                                    style={{ cursor: 'move' }}
                                                />
                                            ))}

                                            {/* Profile Point Markers */}
                                            {pipe.profilePoints?.map((pt, idx) => {

                                                const t = pt.chainage / pipe.length;
                                                const ptX = x1 + t * dx;
                                                const ptY = y1 + t * dy;
                                                const pointId = pt.id || `PT-${idx + 1}`;
                                                return (
                                                    <g key={`profile-pt-${pt.id || idx}`}>
                                                        <circle
                                                            cx={ptX}
                                                            cy={ptY}
                                                            r={6 / scale}
                                                            fill="#F59E0B"
                                                            stroke="#FFFFFF"
                                                            strokeWidth={2 / scale}
                                                            opacity={systemOpacity}
                                                            onMouseDown={(e) => {
                                                                e.stopPropagation();
                                                                if (readOnly) return;
                                                                setDraggingProfilePoint({ pipeId: pipe.id, pointIndex: idx });
                                                            }}
                                                            style={{ cursor: 'pointer' }}
                                                        />
                                                        <text
                                                            x={ptX}
                                                            y={ptY - 12 / scale}
                                                            textAnchor="middle"
                                                            style={{
                                                                fontSize: `${0.58 / Math.sqrt(scale)}rem`,
                                                                fill: '#fbbf24',
                                                                fontWeight: 700,
                                                                pointerEvents: 'none',
                                                                userSelect: 'none',
                                                                opacity: systemOpacity
                                                            }}
                                                        >
                                                            {pointId}
                                                        </text>
                                                    </g>
                                                );
                                            })}
                                            {/* Hitbox uses original coordinates to ensure continuity for selection */}
                                            <polyline points={polylinePoints} className="pipe-hitbox" style={{ fill: 'none' }} />
                                            {/* Pipe ID Label */}
                                            {showLabel && (
                                                <text
                                                    x={labelX}
                                                    y={labelY}
                                                    textAnchor="middle"
                                                    dominantBaseline="middle"
                                                    style={{
                                                        fontSize: `${labelFontPx}px`,
                                                        fontWeight: linkKind === 'pump_link' ? 700 : 800,
                                                        fill: systemColor,
                                                        pointerEvents: 'none',
                                                        userSelect: 'none',
                                                        opacity: systemOpacity,
                                                        paintOrder: 'stroke',
                                                        stroke: 'rgba(15,23,42,0.85)',
                                                        strokeWidth: 3
                                                    }}
                                                >
                                                    {labelText}
                                                </text>
                                            )}

                                            {/* Inline Nodes (Air Valves) */}
                                            {layers.pipes && pipe.inlineNodes?.map((node) => (
                                                <g
                                                    key={node.id}
                                                    onMouseDown={(e) => {
                                                        if (readOnly || isLocked) return;
                                                        e.stopPropagation();
                                                        setDraggingAirValve({ pipeId: pipe.id, nodeId: node.id });
                                                    }}
                                                    style={{ cursor: readOnly || isLocked ? 'default' : 'grab', opacity: systemOpacity }}
                                                >
                                                    <circle
                                                        cx={node.x}
                                                        cy={node.y}
                                                        r={8 / scale}
                                                        fill="rgba(15, 23, 42, 0.9)"
                                                        stroke={node.active ? "#f59e0b" : "#64748b"}
                                                        strokeWidth={1.5 / scale}
                                                    />
                                                    <path
                                                        d={`M ${node.x} ${node.y - 12 / scale} L ${node.x - 7 / scale} ${node.y - 2 / scale} L ${node.x + 7 / scale} ${node.y - 2 / scale} Z`}
                                                        fill={node.active ? "#f59e0b" : "#64748b"}
                                                    />
                                                    {/* Optional: Label chainage */}
                                                    <text
                                                        x={node.x}
                                                        y={node.y + 16 / scale}
                                                        textAnchor="middle"
                                                        style={{ fontSize: `${0.6 / Math.sqrt(scale)}rem`, fill: '#94a3b8', pointerEvents: 'none' }}
                                                    >
                                                        {`${node.id} • ${node.chainage.toFixed(1)}m`}
                                                    </text>
                                                </g>
                                            ))}
                                        </g>
                                    );
                                })}

                                {layers.pipes && pumps.map(pump => {
                                    const wetWell = wetWells.find(w => w.id === pump.wetWellId);
                                    if (!wetWell) return null;

                                    const x1 = Number(wetWell.x);
                                    const y1 = Number(wetWell.y);
                                    const x2 = Number(pump.x);
                                    const y2 = Number(pump.y);

                                    if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) return null;

                                    const dx = x2 - x1;
                                    const dy = y2 - y1;
                                    const distance = Math.sqrt(dx * dx + dy * dy);
                                    if (distance < 1e-6) return null;

                                    const ux = dx / distance;
                                    const uy = dy / distance;
                                    const nx = -uy;
                                    const ny = ux;

                                    const startOffset = 11 / Math.max(scale, 0.5);
                                    const endOffset = 10 / Math.max(scale, 0.5);
                                    const startX = x1 + ux * startOffset;
                                    const startY = y1 + uy * startOffset;
                                    const endX = x2 - ux * endOffset;
                                    const endY = y2 - uy * endOffset;

                                    const arrowLength = 9 / Math.max(scale, 0.5);
                                    const arrowWidth = 5 / Math.max(scale, 0.5);
                                    const baseX = endX - ux * arrowLength;
                                    const baseY = endY - uy * arrowLength;
                                    const leftX = baseX + nx * arrowWidth;
                                    const leftY = baseY + ny * arrowWidth;
                                    const rightX = baseX - nx * arrowWidth;
                                    const rightY = baseY - ny * arrowWidth;

                                    const systemColor = getSystemColor(pump.systemId || wetWell.systemId);
                                    const highlighted = selectedIds.has(wetWell.id) || selectedIds.has(pump.id);
                                    const systemOpacity = getPressureSystemOpacity(pump.systemId || wetWell.systemId, highlighted);

                                    return (
                                        <g key={`wetwell-pump-link-${pump.id}`} style={{ pointerEvents: 'none' }}>
                                            <line
                                                x1={startX}
                                                y1={startY}
                                                x2={endX}
                                                y2={endY}
                                                style={{
                                                    stroke: systemColor,
                                                    strokeWidth: highlighted ? Math.max(2.8, 0.8 * scale) : Math.max(1.8, 0.55 * scale),
                                                    strokeDasharray: '6, 4',
                                                    opacity: (highlighted ? 0.95 : 0.7) * systemOpacity,
                                                    vectorEffect: 'non-scaling-stroke'
                                                }}
                                            />
                                            <polygon
                                                points={`${endX},${endY} ${leftX},${leftY} ${rightX},${rightY}`}
                                                style={{ fill: systemColor, opacity: (highlighted ? 0.95 : 0.8) * systemOpacity }}
                                            />
                                        </g>
                                    );
                                })}

                                {/* Temporary Pipe Line (Creation) */}
                                {activeTool === 'pipe' && pipeStart && (
                                    <line
                                        x1={pipeStart.x}
                                        y1={pipeStart.y}
                                        x2={snapFeedback ? snapFeedback.x : (mousePos.x - viewOffset.x) / (scale > 0 ? scale : 1)}
                                        y2={snapFeedback ? snapFeedback.y : (mousePos.y - viewOffset.y) / (scale > 0 ? scale : 1)}
                                        style={{
                                            stroke: 'var(--accent)',
                                            strokeWidth: 4,
                                            strokeDasharray: '5, 5',
                                            opacity: 0.8,
                                            pointerEvents: 'none',
                                            vectorEffect: 'non-scaling-stroke'
                                        }}
                                    />
                                )}

                            </svg>

                            {/* Chambers Layer */}
                            {layers.chambers && chambers.map(chamber => {
                                const cx = Number(chamber.x);
                                const cy = Number(chamber.y);
                                if (isNaN(cx) || isNaN(cy)) return null;
                                const safeScale = scale > 0 ? scale : 1;
                                const isRouteStart = routeStartNodeId === chamber.id;
                                const isRouteEnd = routeEndNodeId === chamber.id;
                                const isRouteNode = routeNodeSet.has(chamber.id);
                                const routeHighlightColor = isRouteStart
                                    ? 'var(--success)'
                                    : isRouteEnd
                                        ? 'var(--danger)'
                                        : isRouteNode
                                            ? 'var(--warning)'
                                            : null;

                                // Calculate connection angles to avoid overlaps
                                const connectedPipes = pipes.filter(p => p.startNodeId === chamber.id || p.endNodeId === chamber.id);
                                const angles = connectedPipes.map(p => {
                                    const otherChamberId = p.startNodeId === chamber.id ? p.endNodeId : p.startNodeId;
                                    const otherChamber = chambers.find(c => c.id === otherChamberId);
                                    if (!otherChamber) return null;
                                    return Math.atan2(Number(otherChamber.y) - cy, Number(otherChamber.x) - cx);
                                }).filter(a => a !== null) as number[];
                                const incomingDisplay = buildChamberIncomingDisplay(chamber, pipes);

                                // Default positions: ID at Top, CRS at Bottom
                                let idPos: React.CSSProperties = { top: '-22px', left: '50%', transform: 'translateX(-50%)' };
                                let crsPos: React.CSSProperties = { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '6px' };

                                // Check if any pipe is "down" (near Math.PI/2)
                                const isPipeDown = angles.some(a => a > Math.PI / 4 && a < 3 * Math.PI / 4);
                                // Check if any pipe is "up" (near -Math.PI/2)
                                const isPipeUp = angles.some(a => a > -3 * Math.PI / 4 && a < -Math.PI / 4);

                                if (isPipeDown) {
                                    // Shift CRS to the side if there's a pipe going down
                                    crsPos = { top: '50%', left: '100%', transform: 'translateY(-50%)', marginTop: '0', marginLeft: '12px' };
                                }
                                if (isPipeUp) {
                                    // Shift ID to the side if there's a pipe going up
                                    idPos = { top: '50%', left: '-20px', transform: 'translate(-100%, -50%)' };
                                }

                                return (
                                    <div
                                        key={chamber.id}
                                        className={`chamber-node-pill ${selectedIds.has(chamber.id) ? 'selected' : ''}`}
                                        style={{
                                            left: cx,
                                            top: cy,
                                            transform: `translate(-50%, -50%) scale(${1 / safeScale})`, // Keep visual size constant
                                            cursor: routeSelectionMode ? 'crosshair' : undefined
                                        }}
                                        onMouseDown={(e) => {
                                            if (routeSelectionMode) {
                                                e.stopPropagation();
                                            }
                                        }}
                                        onContextMenu={(e) => handleContextMenu(e, chamber.id, 'chamber')}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (handleRouteChamberClick(chamber.id)) {
                                                return;
                                            }

                                            if (onChamberClick) {
                                                // If parent handler exists (e.g. for Profile selection), use it
                                                onChamberClick(chamber.id, e);
                                            } else {
                                                // Default selection logic
                                                toggleSelection(chamber.id, 'chamber', e.ctrlKey);
                                            }
                                        }}
                                    >
                                        {/* Hybrid Scaling: Max(MinSize, RealSize) for visibility */}
                                        <div className="node-icon-circle" style={{
                                            width: `${Math.max(24, ((chamber as any).diameter || 1.2) * scale)}px`,
                                            height: `${Math.max(24, ((chamber as any).diameter || 1.2) * scale)}px`,
                                            border: routeHighlightColor ? `2px solid ${routeHighlightColor}` : undefined,
                                            boxShadow: routeHighlightColor
                                                ? `0 0 0 3px ${routeHighlightColor}33, 0 0 14px ${routeHighlightColor}88`
                                                : undefined
                                        }}>
                                            {/* Optional: Icon inside circle? */}
                                        </div>

                                        {showChamberDiagrams && (
                                            <ChamberConnectionGlyph
                                                chamber={chamber}
                                                pipes={pipes}
                                                chambers={chambers}
                                                size={32}
                                            />
                                        )}

                                        {/* ID Label (Dynamic Position) */}
                                        <div style={{
                                            position: 'absolute',
                                            ...idPos,
                                            fontSize: '0.8rem',
                                            fontWeight: 800,
                                            color: 'var(--text-primary)',
                                            textShadow: '0 0 2px rgba(0,0,0,0.8)',
                                            pointerEvents: 'none',
                                            zIndex: 5,
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {chamber.userDefinedId}
                                        </div>

                                        {/* Additional Labels (Conditionals) - Dynamic Position */}
                                        {layers.labels && (
                                            <div style={{
                                                position: 'absolute',
                                                ...crsPos,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                pointerEvents: 'none',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                {/* visibleLabelTypes.has('chamber_id') logic could also go here if we want toggleable ID outside */}
                                                {visibleLabelTypes.has('chamber_id') && (
                                                    <span style={{ display: 'none' }}>{/* Placeholder as we already show it above */}</span>
                                                )}
                                                {visibleLabelTypes.has('chamber_ct') && (
                                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.8)', padding: '0 2px', borderRadius: '2px' }}>
                                                        CT: {Number(chamber.CT.value).toFixed(2)}
                                                    </span>
                                                )}
                                                {visibleLabelTypes.has('chamber_cre') && incomingDisplay.map((entry) => (
                                                    <span
                                                        key={`cre-${chamber.id}-${entry.pipeId}`}
                                                        style={{ fontSize: '0.65rem', fontWeight: 600, color: '#0ea5e9', background: 'rgba(255,255,255,0.88)', padding: '0 3px', borderRadius: '2px' }}
                                                    >
                                                        Cre {entry.pipeLabel}: {entry.cre.toFixed(2)}
                                                    </span>
                                                ))}
                                                {visibleLabelTypes.has('chamber_h') && incomingDisplay.map((entry) => (
                                                    <span
                                                        key={`h-${chamber.id}-${entry.pipeId}`}
                                                        style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--warning)', background: 'rgba(255,255,255,0.88)', padding: '0 3px', borderRadius: '2px' }}
                                                    >
                                                        H {entry.pipeLabel}: {entry.h.toFixed(2)}
                                                    </span>
                                                ))}
                                                {visibleLabelTypes.has('chamber_crs') && (
                                                    <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--accent)', background: 'rgba(255,255,255,0.8)', padding: '0 2px', borderRadius: '2px' }}>
                                                        CRS: {Number(chamber.CRS.value).toFixed(2)}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {/* ========================================== */}
                            {/* PRESSURE NETWORK ELEMENTS */}
                            {/* ========================================== */}

                            {/* Wet Wells Layer (Conditional Shape: Square or Circle) */}
                            {layers.chambers && wetWells.map(wetWell => {
                                const cx = Number(wetWell.x);
                                const cy = Number(wetWell.y);
                                if (isNaN(cx) || isNaN(cy)) return null;
                                const safeScale = scale > 0 ? scale : 1;
                                const systemColor = getSystemColor(wetWell.systemId);
                                const systemOpacity = getPressureSystemOpacity(wetWell.systemId, selectedIds.has(wetWell.id) || editingObjectId?.id === wetWell.id);

                                // Determine Shape
                                const isCircle = (wetWell.diameter && wetWell.diameter > 0);

                                return (
                                    <div
                                        key={wetWell.id}
                                        className={`chamber-node-pill ${editingObjectId?.id === wetWell.id ? 'selected' : ''}`}
                                        style={{
                                            left: cx,
                                            top: cy,
                                            transform: `translate(-50%, -50%) scale(${1 / safeScale})`,
                                            borderColor: systemColor,
                                            backgroundImage: 'none !important',
                                            backgroundColor: 'var(--bg-color)', // Filled for Square
                                            borderRadius: isCircle ? '50%' : '2px', // Square vs Circle container
                                            borderWidth: isCircle ? '0px' : '2px', // Border only for square container (inner handled differently)
                                            boxShadow: 'none', // remove default shadow to handle custom ones
                                            opacity: systemOpacity
                                        }}
                                        onContextMenu={(e) => handleContextMenu(e, wetWell.id, 'chamber')}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            applyWetWellSelection(wetWell.id);
                                        }}
                                    >
                                        {isCircle ? (
                                            // CIRCULAR STYLE: Max(24, RealSize * Scale)
                                            <div style={{
                                                position: 'relative',
                                                width: `${Math.max(24, (wetWell.diameter || 1.2) * scale)}px`,
                                                height: `${Math.max(24, (wetWell.diameter || 1.2) * scale)}px`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}>
                                                {/* Outer Ring */}
                                                <div style={{
                                                    position: 'absolute',
                                                    top: 0, left: 0, width: '100%', height: '100%',
                                                    borderRadius: '50%',
                                                    border: `2px solid ${systemColor}`,
                                                    boxSizing: 'border-box'
                                                }} />
                                                {/* Inner Fill/Icon (Scale proportion or fixed?) Let's keep icon fixed or semi-scaled */}
                                                <div style={{
                                                    width: '20px', height: '20px',
                                                    borderRadius: '50%',
                                                    background: systemColor,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                                }}>
                                                    <div style={{ fontSize: '12px', color: 'var(--text-primary)' }}>💧</div>
                                                </div>
                                            </div>
                                        ) : (
                                            // SQUARE STYLE: Max(24, RealSize * Scale)
                                            <div style={{
                                                width: `${Math.max(24, (wetWell.diameter || 1.2) * scale)}px`,
                                                height: `${Math.max(24, (wetWell.diameter || 1.2) * scale)}px`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                // Container is already square from parent style
                                            }}>
                                                {/* Inner Circle Overlay */}
                                                <div style={{
                                                    width: '20px', height: '20px',
                                                    borderRadius: '50%',
                                                    background: 'rgba(255,255,255,0.2)', // Subtle inner circle
                                                    border: '1px solid rgba(255,255,255,0.6)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}>
                                                    <div style={{ fontSize: '12px', color: 'var(--text-primary)' }}>💧</div>
                                                </div>
                                            </div>
                                        )}


                                        {/* ID Label */}
                                        <div style={{
                                            position: 'absolute',
                                            top: '-24px',
                                            left: '50%',
                                            transform: 'translateX(-50%)',
                                            fontSize: '0.8rem',
                                            fontWeight: 800,
                                            color: systemColor,
                                            textShadow: '0 0 2px rgba(0,0,0,0.8)',
                                            pointerEvents: 'none',
                                            zIndex: 5,
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {wetWell.name || wetWell.id}
                                        </div>

                                        {/* Water Level Label */}
                                        {layers.labels && visibleLabelTypes.has('chamber_crs') && (
                                            <div style={{
                                                position: 'absolute',
                                                top: '100%',
                                                left: '50%',
                                                transform: 'translateX(-50%)',
                                                marginTop: '6px',
                                                pointerEvents: 'none',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: systemColor, background: 'rgba(255,255,255,0.8)', padding: '0 2px', borderRadius: '2px' }}>
                                                    CL: {Number(wetWell.CL).toFixed(2)}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {/* Pumps Layer (with Pump Icon) */}
                            {layers.chambers && pumps.map(pump => {
                                const cx = Number(pump.x);
                                const cy = Number(pump.y);
                                if (isNaN(cx) || isNaN(cy)) return null;
                                const safeScale = scale > 0 ? scale : 1;
                                const systemColor = getSystemColor(pump.systemId);
                                const systemOpacity = getPressureSystemOpacity(pump.systemId, selectedIds.has(pump.id) || editingObjectId?.id === pump.id);

                                return (
                                    <div
                                        key={pump.id}
                                        className={`chamber-node-pill ${editingObjectId?.id === pump.id ? 'selected' : ''}`}
                                        style={{
                                            left: cx,
                                            top: cy,
                                            transform: `translate(-50%, -50%) scale(${1 / safeScale})`,
                                            borderColor: systemColor,
                                            background: `linear-gradient(135deg, ${systemColor} 0%, rgba(5, 150, 105, 0.85) 100%)`
                                            , opacity: systemOpacity
                                        }}
                                        onContextMenu={(e) => handleContextMenu(e, pump.id, 'chamber')}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setFocusedWetWellId(null);
                                            applySystemScopedSelection(pump.id, 'chamber');
                                        }}
                                    >
                                        <div className="node-icon-circle" style={{
                                            width: `${Math.max(24, 1.2 * scale)}px`,
                                            height: `${Math.max(24, 1.2 * scale)}px`,
                                            background: systemColor,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            {/* Pump Icon */}
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5">
                                                <circle cx="12" cy="12" r="8" />
                                                <path d="M12 8v8M8 12h8" />
                                            </svg>
                                        </div>
                                        {/* ID Label */}
                                        <div style={{
                                            position: 'absolute',
                                            top: '-22px',
                                            left: '50%',
                                            transform: 'translateX(-50%)',
                                            fontSize: '0.8rem',
                                            fontWeight: 800,
                                            color: systemColor,
                                            textShadow: '0 0 2px rgba(0,0,0,0.8)',
                                            pointerEvents: 'none',
                                            zIndex: 5,
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {pump.name || pump.id}
                                        </div>


                                        {/* Pump Spec Label */}
                                        {layers.labels && (
                                            <div style={{
                                                position: 'absolute',
                                                top: '100%',
                                                left: '50%',
                                                transform: 'translateX(-50%)',
                                                marginTop: '6px',
                                                pointerEvents: 'none',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                <span style={{ fontSize: '0.65rem', fontWeight: 600, color: systemColor, background: 'rgba(255,255,255,0.8)', padding: '0 2px', borderRadius: '2px' }}>
                                                    {(pump.Qnom * 1000).toFixed(0)} L/s @ {pump.Hnom}m
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {/* Pressure Junctions Layer */}
                            {layers.chambers && pressureJunctions?.map(junction => {
                                const cx = Number(junction.x);
                                const cy = Number(junction.y);
                                if (isNaN(cx) || isNaN(cy)) return null;
                                const safeScale = scale > 0 ? scale : 1;
                                const systemColor = getSystemColor(junction.systemId);
                                const systemOpacity = getPressureSystemOpacity(junction.systemId, selectedIds.has(junction.id) || editingObjectId?.id === junction.id);

                                return (
                                    <div
                                        key={junction.id}
                                        className={`chamber-node-pill ${editingObjectId?.id === junction.id ? 'selected' : ''}`}
                                        style={{
                                            left: cx,
                                            top: cy,
                                            transform: `translate(-50%, -50%) scale(${1 / safeScale})`,
                                            borderColor: systemColor,
                                            background: 'transparent',
                                            boxShadow: 'none',
                                            width: 'auto', height: 'auto',
                                            opacity: systemOpacity
                                        }}
                                        onContextMenu={(e) => handleContextMenu(e, junction.id, 'chamber')}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setFocusedWetWellId(null);
                                            applySystemScopedSelection(junction.id, 'chamber');
                                        }}
                                    >
                                        <div style={{
                                            position: 'relative',
                                            width: `${Math.max(20, 1.0 * scale)}px`,
                                            height: `${Math.max(20, 1.0 * scale)}px`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            {/* Double Circle Icon */}
                                            <div style={{
                                                position: 'absolute',
                                                top: 0, left: 0, width: '100%', height: '100%',
                                                borderRadius: '50%',
                                                border: `2px solid ${systemColor}`,
                                                boxSizing: 'border-box'
                                            }} />
                                            <div style={{
                                                width: '60%', height: '60%',
                                                borderRadius: '50%',
                                                background: systemColor,
                                                opacity: 0.6
                                            }} />
                                        </div>

                                        <div style={{
                                            position: 'absolute',
                                            top: '-24px',
                                            left: '50%',
                                            transform: 'translateX(-50%)',
                                            fontSize: '0.8rem',
                                            fontWeight: 800,
                                            color: systemColor,
                                            textShadow: '0 0 2px rgba(0,0,0,0.8)',
                                            pointerEvents: 'none',
                                            zIndex: 5,
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {junction.name || junction.id}
                                        </div>
                                    </div>
                                );
                            })}

                            {/* HTML Overlay for Snap Feedback - High Z-Index, Fixed Screen Size */}
                            {/* HTML Overlay for Snap Feedback - High Z-Index, Fixed Screen Size */}
                            {snapFeedback && snapFeedback.type !== 'free' && (
                                <div style={{
                                    position: 'absolute',
                                    left: snapFeedback.x,
                                    top: snapFeedback.y,
                                    transform: `translate(-50%, -50%) scale(${1 / (scale > 0 ? scale : 1)})`,
                                    pointerEvents: 'none',
                                    zIndex: 100, // Topmost
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    {/* Inner Target Circle */}
                                    <div style={{
                                        width: '10px', height: '10px',
                                        border: '2px solid #2563eb',
                                        borderRadius: '50%',
                                        background: 'transparent'
                                    }} />

                                    {/* Halo (Context Visual) */}
                                    {snapFeedback.type === 'edge' && (
                                        <div style={{
                                            position: 'absolute',
                                            width: '24px', height: '24px',
                                            borderRadius: '50%',
                                            backgroundColor: 'rgba(37, 99, 235, 0.2)',
                                            border: '1px solid rgba(37,99,235,0.3)'
                                        }} />
                                    )}
                                    {snapFeedback.type === 'center' && (
                                        <div style={{
                                            position: 'absolute',
                                            width: '20px', height: '20px',
                                            backgroundColor: 'rgba(37, 99, 235, 0.4)',
                                            borderRadius: '2px'
                                        }} />
                                    )}

                                    {/* Text Label - Offset from center */}
                                    <div style={{
                                        position: 'absolute',
                                        left: '20px', top: '-24px',
                                        background: 'rgba(0, 0, 0, 0.9)', // Darker background
                                        color: 'white',
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        fontSize: '12px',
                                        fontFamily: 'Inter, sans-serif',
                                        whiteSpace: 'nowrap', // Prevents wrapping
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                        border: '1px solid rgba(255,255,255,0.1)'
                                    }}>
                                        AJUSTE: {snapFeedback.type === 'edge' ? 'BORDE' : snapFeedback.type === 'center' ? 'CENTRO' : 'REJILLA'}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>






                    <CoordinateIndicator
                        style={{
                            position: 'absolute',
                            bottom: '20px',
                            left: '20px',
                            opacity: 0.8
                        }}
                    />

                    <div className="canvas-overlay-label">
                        Vista de Mapa
                    </div>

                    <RouteSelectionController
                        enabled={routeSelectionMode}
                        routeText={routeSummaryText}
                        route={activeRoute}
                        startLabel={routeStartLabel}
                        endLabel={routeEndLabel}
                        toastMessage={routeToastMessage}
                        alternatives={routeAlternativeItems}
                        selectedAlternativeIndex={selectedRouteAlternativeIndex}
                        showAlternativesModal={showRouteAlternativesModal}
                        onSelectAlternative={setSelectedRouteAlternativeIndex}
                        onConfirmAlternative={confirmRouteAlternative}
                        onCloseAlternativesModal={closeRouteAlternativesModal}
                        onOpenProfilePopout={openRouteProfilePopout}
                        onResetSelection={resetRouteSelection}
                        onDismissToast={() => setRouteToastMessage('')}
                    />

                    {focusedWetWell && (
                        <div className="canvas-info-panel">
                            <span style={{ fontWeight: 700 }}>{focusedWetWell.userDefinedId || focusedWetWell.name || focusedWetWell.id}</span>
                            <button
                                onClick={() => setWetWellSelectionView('affluents')}
                                className={`canvas-info-panel-btn ${wetWellSelectionView === 'affluents' ? 'active' : ''}`}
                            >
                                Ver red de afluentes
                            </button>
                            <button
                                onClick={() => setWetWellSelectionView('pumping')}
                                className={`canvas-info-panel-btn ${wetWellSelectionView === 'pumping' ? 'active' : ''}`}
                            >
                                Ver sistema de impulsion
                            </button>
                        </div>
                    )}

                    {/* Zoom Window Selection Rect */}
                    {
                        zoomSelection && (
                            <div style={{
                                position: 'absolute',
                                left: Math.min(zoomSelection.startX, zoomSelection.currentX) - (canvasRef.current?.getBoundingClientRect().left || 0),
                                top: Math.min(zoomSelection.startY, zoomSelection.currentY) - (canvasRef.current?.getBoundingClientRect().top || 0),
                                width: Math.abs(zoomSelection.currentX - zoomSelection.startX),
                                height: Math.abs(zoomSelection.currentY - zoomSelection.startY),
                                border: '1px dashed #2563eb',
                                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                                pointerEvents: 'none',
                                zIndex: 1000
                            }} />
                        )
                    }
                </div>

            </div>

            <FloatingToolbar
                activeTool={activeTool}
                setActiveTool={setActiveTool}
                layers={layers}
                toggleLayer={toggleLayer}
            />

            <div className="status-bar-theme">
                <div className="status-item" style={{ display: 'flex', gap: '10px', fontFamily: "var(--font-family-numeric)", fontVariantNumeric: 'tabular-nums', letterSpacing: '0.2px', fontSize: '0.72rem' }}>
                    <span>X: {(mousePos.x / scale).toFixed(1)}</span>
                    <span>Y: {(mousePos.y / scale).toFixed(1)}</span>
                </div>
                <div className="status-item" style={{ fontSize: '0.72rem' }}>
                    Zoom: <span style={{ fontWeight: 700, fontFamily: "var(--font-family-numeric)", fontVariantNumeric: 'tabular-nums' }}>{Math.round(scale * 100)}%</span>
                </div>
                <div className="status-bar-theme-divider" />
                <div className="status-item">
                    Unidades: <span style={{ fontWeight: 600 }}>{projectUnits}</span>
                </div>
                {activePumpingSystem && (
                    <>
                        <div className="status-bar-theme-divider" />
                        <div className="status-item">
                            Sistema: <span style={{ fontWeight: 700, color: getSystemColor(activePumpingSystem.id) }}>{activePumpingSystem.name}</span>
                        </div>
                    </>
                )}
            </div>

            {/* Color Legend */}
            {
                showLegend && visualizationMode !== 'none' && (
                    <ColorLegend
                        mode={visualizationMode}
                        onClose={() => setShowLegend(false)}
                    />
                )
            }
            {/* PIPES CONTEXT MENU */}
            {
                contextMenu && (
                    <div
                        style={{
                            position: 'fixed',
                            left: contextMenu.x,
                            top: contextMenu.y,
                            background: 'var(--surface-elevated, #1a1a1b)',
                            border: '1px solid var(--border, rgba(255,255,255,0.1))',
                            borderRadius: '10px',
                            padding: '4px',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px var(--border, rgba(255,255,255,0.05))',
                            zIndex: 10000,
                            backdropFilter: 'blur(16px)',
                            WebkitBackdropFilter: 'blur(16px)',
                            minWidth: '180px'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {contextMenu.type === 'pipe' && (
                            <>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (readOnly) return;
                                        setInteractionMode('EDIT_PIPE');
                                        setEditingObjectId({ id: contextMenu.objectId, type: 'pipe' });
                                        setContextMenu(null);
                                    }}
                                    disabled={readOnly}
                                    style={{
                                        width: '100%',
                                        padding: '10px 14px',
                                        textAlign: 'left',
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--text-primary, #fff)',
                                        fontSize: '0.85rem',
                                        cursor: readOnly ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        borderRadius: '6px',
                                        transition: 'background 0.2s',
                                        opacity: readOnly ? 0.6 : 1
                                    }}
                                    onMouseEnter={(e) => {
                                        if (readOnly) return;
                                        e.currentTarget.style.background = 'var(--hover-bg)';
                                    }}
                                    onMouseLeave={(e) => {
                                        if (readOnly) return;
                                        e.currentTarget.style.background = 'transparent';
                                    }}
                                >
                                    <Pencil size={14} color="#3B82F6" /> Editar Vértices
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (readOnly) return;
                                        handleAddProfilePoint();
                                    }}
                                    disabled={readOnly}
                                    style={{
                                        width: '100%',
                                        padding: '10px 14px',
                                        textAlign: 'left',
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--text-primary, #fff)',
                                        fontSize: '0.85rem',
                                        cursor: readOnly ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        borderRadius: '6px',
                                        transition: 'background 0.2s',
                                        opacity: readOnly ? 0.6 : 1
                                    }}
                                    onMouseEnter={(e) => {
                                        if (readOnly) return;
                                        e.currentTarget.style.background = 'var(--hover-bg)';
                                    }}
                                    onMouseLeave={(e) => {
                                        if (readOnly) return;
                                        e.currentTarget.style.background = 'transparent';
                                    }}
                                >
                                    <Plus size={14} color="#10B981" /> Añadir Punto de Perfil
                                </button>
                            </>
                        )}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setEditingObjectId({ id: contextMenu.objectId, type: contextMenu.type === 'pipe' ? 'pipe' : 'chamber' });
                                setContextMenu(null);
                            }}
                            style={{
                                width: '100%',
                                padding: '10px 14px',
                                textAlign: 'left',
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-primary, #fff)',
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                borderRadius: '6px',
                                transition: 'background 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--hover-bg)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                            <FileText size={14} color="#3B82F6" /> Ver Propiedades
                        </button>
                    </div>
                )
            }
        </main >
    );
};
