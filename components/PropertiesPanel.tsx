import React, { useEffect, useState } from 'react';
import { useThemeStyles } from '../theme/useThemeStyles';
import { useTheme } from '../theme/ThemeProvider';
import { useProject, Chamber, Pipe, AttributeValue } from '../context/ProjectContext';
import type { WetWell, Pump, PressurePipe, PumpCurveMode, PumpCurvePoint, PipeMaterial, PressureJunction, PressureBoundaryType, AirValveNode } from '../hydraulics/types';
import { useView } from '../context/ViewContext';
import { PropertyInput } from './common/PropertyInput';
import { X, Trash2, Check, AlertCircle, AlertTriangle, Info, XCircle, Plus, Activity, Zap, Eye, ChevronRight } from 'lucide-react';
import { validateDomiciliaryPipe } from '../utils/domiciliaryRules';
import { getPipeNormativeAlerts, getChamberNormativeAlerts } from '../utils/normativeRules';
import { ArtifactCalculator, getUEHForFixtureByClass } from './common/ArtifactCalculator';
import { PumpCurveEditor } from './PumpCurveEditor';
import { calculatePipeConnectionPoint } from '../utils/geometryEngine';
import { calculateSanitaryCycle, calculateOptimalWetWellLevels, calculateWetWellVolume, optimizeWetWellForRetention, optimizePipeDiameter } from '../hydraulics/pressureModule';
import { toM3s, fromM3s } from '../hydraulics/flowUnits';
import { ChamberFixtureLoad, NCH3371_TABLE_B1 } from '../hydraulics/qwwTables';
import { inferPipeRoleFromNodeTypes, PIPE_ROLE_METHOD_LABELS, PIPE_ROLE_OPTIONS, PipeRole, resolveEffectivePipeRole, resolveEffectiveTopologyRegime, DesignMethod, DESIGN_METHOD_LABELS, DESIGN_METHOD_OPTIONS, resolveDesignMethod, getDesignMethodLabel, DescargaHorizVerificationMethod, DESCARGA_HORIZ_VERIFICATION_METHOD_LABELS, DESCARGA_HORIZ_VERIFICATION_METHOD_OPTIONS, resolveDescargaHorizVerificationMethod } from '../utils/pipeRole';
import { resolveNormativeState, inferNormativeAuto, NormativeRegime, NormativeRole3371, NormativeRole1105 } from '../utils/resolveNormativeState';
import { CollectorSizingMode } from '../utils/designFlowCalculator';
import { getManningN } from '../hydraulics/uehTables';
import { buildAutoLengthUpdate, buildManualLengthUpdate, resolvePipeLengthMode } from '../utils/pipeLengthMode';
import { resolveInternalDiameter } from '../utils/diameterMapper';
import { getRegimeForPipeRole, getTopologyRoleForPipeRole } from '../sanitary/topology/pipeOverrideEngine';
import { buildChamberIncomingDisplay } from '../utils/chamberIncomingDisplay';

const createProfilePointId = () => `PT-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

interface PropertiesPanelProps {
    onToggleCollapse?: () => void;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ onToggleCollapse }) => {
    const { editingObjectId, setEditingObjectId, isLocked, analysisResults, selectedIds } = useView();
    const {
        chambers, pipes, setChambers, setPipes,
        wetWells, setWetWells, pumps, setPumps, pressurePipes, setPressurePipes, pressureJunctions, setPressureJunctions,
        pumpingSystems, setPumpingSystems, activePumpingSystemId,
        settings, setSettings,
        renameChamberUserDefinedId, renamePipeUserDefinedId
    } = useProject();
    const [isVisible, setIsVisible] = useState(false);
    const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
    const [calculatorTargetId, setCalculatorTargetId] = useState<string | null>(null);
    const [isViewerOpen, setIsViewerOpen] = useState(false);
    const [viewerTargetId, setViewerTargetId] = useState<string | null>(null);
    const [pendingOptimization, setPendingOptimization] = useState<{
        Nmin: number;
        Noff: number;
        N1on: number;
        success: boolean;
        message: string;
    } | null>(null);
    const [editableNameDraft, setEditableNameDraft] = useState('');
    const [editableNameError, setEditableNameError] = useState('');

    const themeStyles = useThemeStyles();
    const { colors, semantic, badge, button, label, input, card, formGroup } = themeStyles;
    const { themeVersion } = useTheme();

    useEffect(() => {
        // Force re-render when theme changes
    }, [themeVersion]);

    useEffect(() => {
        if (editingObjectId) {
            setIsVisible(true);
            setPendingOptimization(null); // Clear optimization when changing focus
        } else {
            setIsVisible(false);
        }
    }, [editingObjectId]);

    useEffect(() => {
        if (!pressurePipes?.length || !pressureJunctions?.length) return;

        setPressurePipes(prev => {
            let changed = false;

            const synced = prev.map(pipe => {
                const endJunction = pressureJunctions.find(j => j.id === pipe.endNodeId);
                if (!endJunction) return pipe;

                const targetZEnd = Number(endJunction.elevation);
                if (!Number.isFinite(targetZEnd)) return pipe;

                if (Math.abs(pipe.z_end - targetZEnd) < 0.0001) return pipe;

                changed = true;
                return { ...pipe, z_end: targetZEnd };
            });

            return changed ? synced : prev;
        });
    }, [pressurePipes, pressureJunctions, setPressurePipes]);


    // NOTE: All hooks must be called BEFORE any early return (Rules of Hooks)
    // The sizingMode useEffect MUST be called here unconditionally
    const _editingId = editingObjectId?.id ?? '';
    const _editingType = editingObjectId?.type ?? '';

    // Ensure sizingMode consistency with projectType and pipeRole (hoisted before early return)
    useEffect(() => {
        if (_editingType !== 'pipe') return;
        const pipe = pipes.find(p => p.id === _editingId);
        if (!pipe) return;

        const pType = settings.projectType;
        const role = resolveEffectivePipeRole(pipe);
        const currentMode = pipe.designOptions?.collectorSizingMode || 'UEH_Qww';
        let correctMode = currentMode;

        if (pType === 'Domiciliario') {
            correctMode = 'UEH_Qww';
        } else if (pType === 'Público') {
            if (role === 'COLECTOR_EXTERIOR') {
                correctMode = 'POBLACION_NCH1105';
            }
        } else if (pType === 'Mixto') {
            if (role !== 'COLECTOR_EXTERIOR' && currentMode === 'POBLACION_NCH1105') {
                correctMode = 'UEH_Qww';
            }
        }

        if (correctMode !== currentMode) {
            setPipes(prev => prev.map(p => p.id === _editingId ? {
                ...p,
                designOptions: { ...p.designOptions, collectorSizingMode: correctMode }
            } : p));
        }
    }, [_editingId, _editingType, settings.projectType, pipes, setPipes]);

    useEffect(() => {
        if (_editingType === 'chamber') {
            const chamber = chambers.find(c => c.id === _editingId);
            setEditableNameDraft(chamber?.userDefinedId || '');
            setEditableNameError('');
            return;
        }

        if (_editingType === 'pipe') {
            const pipe = pipes.find(p => p.id === _editingId);
            setEditableNameDraft(pipe?.userDefinedId || '');
            setEditableNameError('');
            return;
        }

        setEditableNameDraft('');
        setEditableNameError('');
    }, [_editingId, _editingType, chambers, pipes]);

    if (!editingObjectId && !isVisible) return null;

    const { id, type } = editingObjectId || { id: '', type: 'chamber' };

    // Detect element type and find object
    let object: Chamber | Pipe | WetWell | Pump | PressurePipe | PressureJunction | undefined;
    let elementType: 'chamber' | 'pipe' | 'wetwell' | 'pump' | 'pressurepipe' | 'pressure_junction' | 'air_valve' = type as any;


    if (type === 'chamber') {
        // Check if it's a wet well or regular chamber
        object = wetWells.find(w => w.id === id) || chambers.find(c => c.id === id);
        if (wetWells.find(w => w.id === id)) elementType = 'wetwell';
    } else if (type === 'pipe') {
        // Resolve ambiguous ids safely: prefer the collection that matches current editing context.
        const gravityPipe = pipes.find(p => p.id === id);
        const pressurePipe = pressurePipes.find(p => p.id === id);

        if (gravityPipe && pressurePipe) {
            const preferPressureByPrefix = id.startsWith('pressurepipe-');
            const preferGravityByPrefix = id.startsWith('pipe-');
            const hasPressureSelectionContext = Array.from(selectedIds).some(selectedId => (
                wetWells.some(w => w.id === selectedId)
                || pumps.some(p => p.id === selectedId)
                || pressurePipes.some(p => p.id === selectedId || (p.inlineNodes || []).some(node => node.id === selectedId))
                || pressureJunctions.some(j => j.id === selectedId)
            ));

            if (preferPressureByPrefix || (!preferGravityByPrefix && hasPressureSelectionContext)) {
                object = pressurePipe;
                elementType = 'pressurepipe';
            } else {
                object = gravityPipe;
                elementType = 'pipe';
            }
        } else if (pressurePipe) {
            object = pressurePipe;
            elementType = 'pressurepipe';
        } else {
            object = gravityPipe;
        }
    }

    // Check for pumps (treated as a special "chamber" type for selection)
    if (!object) {
        object = pumps.find(p => p.id === id);
        if (object) elementType = 'pump';
    }

    // Check for pressure junctions
    if (!object) {
        object = pressureJunctions.find(j => j.id === id);
        if (object) elementType = 'pressure_junction';
    }

    // Check for air valves (inline nodes)
    if (!object) {
        for (const pipe of pressurePipes) {
            const av = pipe.inlineNodes?.find(n => n.id === id);
            if (av) {
                object = av as any;
                elementType = 'air_valve' as any;
                break;
            }
        }
    }

    // If object deleted but panel open, close it
    if (!object && isVisible) {
        setEditingObjectId(null);
        return null;
    }

    if (!object) return null;

    const chamberIncomingDisplay = elementType === 'chamber'
        ? buildChamberIncomingDisplay(object as Chamber, pipes)
        : [];

    const isEditableGravityLabel = elementType === 'chamber' || elementType === 'pipe';

    const normalizeName = (value: string) => value.trim().toUpperCase();

    const validateNameInUI = (nextValue: string): string | null => {
        const normalized = normalizeName(nextValue);
        if (!normalized) return 'El nombre no puede estar vacío';

        if (elementType === 'chamber') {
            const duplicated = chambers.some(chamber => (
                chamber.id !== id
                && normalizeName(chamber.userDefinedId || '') === normalized
            ));
            if (duplicated) return 'Ya existe una cámara con ese nombre';
        }

        if (elementType === 'pipe') {
            const duplicated = pipes.some(pipe => (
                pipe.id !== id
                && normalizeName(pipe.userDefinedId || '') === normalized
            ));
            if (duplicated) return 'Ya existe un tramo con ese nombre';
        }

        return null;
    };

    const commitEditableName = () => {
        if (!isEditableGravityLabel) return;

        const preValidationError = validateNameInUI(editableNameDraft);
        if (preValidationError) {
            setEditableNameError(preValidationError);
            return;
        }

        if (elementType === 'chamber') {
            const result = renameChamberUserDefinedId(id, editableNameDraft);
            if (!result.ok) {
                setEditableNameError(result.error);
                return;
            }
            setEditableNameError('');
            setEditableNameDraft(result.value);
            return;
        }

        if (elementType === 'pipe') {
            const result = renamePipeUserDefinedId(id, editableNameDraft);
            if (!result.ok) {
                setEditableNameError(result.error);
                return;
            }
            setEditableNameError('');
            setEditableNameDraft(result.value);
        }
    };

    const handleClose = () => {
        setIsVisible(false);
        setTimeout(() => setEditingObjectId(null), 300); // Wait for animation
    };

    const handleDelete = () => {
        if (isLocked) return;
        if (window.confirm('Are you sure you want to delete this object?')) {
            if (elementType === 'chamber') {
                setChambers(prev => prev.filter(c => c.id !== id));
            } else if (elementType === 'wetwell') {
                setWetWells(prev => prev.filter(w => w.id !== id));
            } else if (elementType === 'pump') {
                setPumps(prev => prev.filter(p => p.id !== id));
            } else if (elementType === 'pressurepipe') {
                setPressurePipes(prev => prev.filter(p => p.id !== id));
            } else if (elementType === 'pressure_junction') {
                setPressureJunctions(prev => prev.filter(j => j.id !== id));
            } else if (elementType === 'pipe') {
                setPipes(prev => prev.filter(p => p.id !== id));
            } else if (elementType === ('air_valve' as any)) {
                setPressurePipes(prev => prev.map(p => ({
                    ...p,
                    inlineNodes: p.inlineNodes?.filter(n => n.id !== id)
                })));
            }
            handleClose();
        }
    };

    const handleUpdateObject = (objId: string, objType: string, updates: any) => {
        if (isLocked) return;
        if (objType === 'chamber') {
            const chamberUpdates = { ...updates } as Partial<Chamber>;

            if (chamberUpdates.H && typeof chamberUpdates.H === 'object') {
                if (typeof chamberUpdates.heightLocked === 'boolean') {
                    chamberUpdates.H = {
                        ...chamberUpdates.H,
                        origin: chamberUpdates.heightLocked ? 'manual' : 'calculated'
                    };
                } else {
                    chamberUpdates.heightLocked = chamberUpdates.H.origin === 'manual';
                }
            }

            setChambers(prev => {
                const updatedChambers = prev.map(c => {
                    if (c.id === objId) {
                        return { ...c, ...chamberUpdates } as Chamber;
                    }
                    return c;
                });

                // Find the updated chamber to use for calculations
                const targetChamber = updatedChambers.find(c => c.id === objId);

                // Recalculate Connected Pipes if Geometry (x, y, diameter/dimension) changed
                if (targetChamber && (chamberUpdates.x !== undefined || chamberUpdates.y !== undefined || chamberUpdates.chamberDimension !== undefined)) {
                    // Update Gravity Pipes
                    setPipes(currentPipes => currentPipes.map(p => {
                        // Parse dimension to diameter
                        const dimMatch = (targetChamber.chamberDimension || '120').match(/(\d+)/);
                        const radius = (dimMatch ? Number(dimMatch[0]) / 100 : 1.2) / 2;
                        const center = { x: targetChamber.x, y: targetChamber.y };

                        if (p.startNodeId === objId) {
                            const newStart = calculatePipeConnectionPoint(center, radius, { x: p.x2, y: p.y2 });
                            return { ...p, x1: newStart.x, y1: newStart.y };
                        }
                        if (p.endNodeId === objId) {
                            const newEnd = calculatePipeConnectionPoint(center, radius, { x: p.x1, y: p.y1 });
                            return { ...p, x2: newEnd.x, y2: newEnd.y };
                        }
                        return p;
                    }));

                    // Update Pressure Pipes
                    setPressurePipes(currentPP => currentPP.map(p => {
                        // Parse dimension to diameter
                        const dimMatch = (targetChamber.chamberDimension || '120').match(/(\d+)/);
                        const radius = (dimMatch ? Number(dimMatch[0]) / 100 : 1.2) / 2;
                        const center = { x: targetChamber.x, y: targetChamber.y };

                        if (p.startNodeId === objId) {
                            const newStart = calculatePipeConnectionPoint(center, radius, { x: p.x2, y: p.y2 });
                            return { ...p, x1: newStart.x, y1: newStart.y };
                        }
                        if (p.endNodeId === objId) {
                            const newEnd = calculatePipeConnectionPoint(center, radius, { x: p.x1, y: p.y1 });
                            return { ...p, x2: newEnd.x, y2: newEnd.y };
                        }
                        return p;
                    }));
                }

                // Reclassify connected pipes when chamberType changes
                if (targetChamber && chamberUpdates.chamberType !== undefined) {
                    setPipes(currentPipes => currentPipes.map(pipe => {
                        if (pipe.startNodeId !== objId && pipe.endNodeId !== objId) {
                            return pipe;
                        }

                        if (pipe.override?.enabled === true) {
                            return pipe;
                        }

                        const startChamber = updatedChambers.find(c => c.id === pipe.startNodeId);
                        const endChamber = updatedChambers.find(c => c.id === pipe.endNodeId);
                        const startType = startChamber?.chamberType;
                        const endType = endChamber?.chamberType;

                        const newPipeRole = inferPipeRoleFromNodeTypes(startType, endType);

                        const topologyRegime = getRegimeForPipeRole(newPipeRole);
                        const topologyRole = getTopologyRoleForPipeRole(newPipeRole);

                        return {
                            ...pipe,
                            pipeRole: newPipeRole,
                            gravityRole_manual: pipe.gravityRole_manual,
                            auto: {
                                ...pipe.auto,
                                sources: pipe.auto?.sources || [],
                                pipeRole: newPipeRole,
                                topologyRegime,
                                topologyRole
                            },
                            effective: undefined
                        } as Pipe;
                    }));
                }

                return updatedChambers;
            });

            // Check WetWells / Pumps similarly if they are updated via this handler (usually they have their own setters below)
            // But if `handleUpdateObject` is generic, we should handle them.
            // Currently `handleUpdateObject` only takes 'chamber' or 'pipe'.
            // WetWells updates are done via `setWetWells` directly in the JSX below.
            // I should probably refactor that to use a centralized handler or add the logic there too.
            // For now, let's fix Chambers.

        } else {
            const pipeUpdates = { ...updates } as Partial<Pipe>;

            if (typeof pipeUpdates.slopeLocked === 'boolean' && pipeUpdates.isSlopeManual === undefined) {
                pipeUpdates.isSlopeManual = pipeUpdates.slopeLocked;
            }
            if (typeof pipeUpdates.isSlopeManual === 'boolean' && pipeUpdates.slopeLocked === undefined) {
                pipeUpdates.slopeLocked = pipeUpdates.isSlopeManual;
            }

            if (pipeUpdates.lengthMode === 'manual' && pipeUpdates.length && typeof pipeUpdates.length === 'object') {
                pipeUpdates.length = {
                    ...pipeUpdates.length,
                    origin: 'manual'
                };
            }
            if (pipeUpdates.lengthMode === 'auto' && pipeUpdates.length && typeof pipeUpdates.length === 'object') {
                pipeUpdates.length = {
                    ...pipeUpdates.length,
                    origin: 'calculated'
                };
            }

            setPipes(prev => prev.map(p => {
                if (p.id !== objId) return p;

                const updatedPipe = { ...p, ...pipeUpdates } as Pipe;
                const dintRes = resolveInternalDiameter(updatedPipe);

                return {
                    ...updatedPipe,
                    internalDiameterResolved: dintRes.di_mm,
                    internalDiameterSource: dintRes.source
                } as Pipe;
            }));
        }
    };

    // sizingMode consistency is now hoisted before the early return (see above)

    // Helper to update WetWells geometry and connected pipes
    const updateWetWell = (id: string, updates: Partial<WetWell>) => {
        if (isLocked) return;
        setWetWells(prev => {
            const updatedWells = prev.map(w => w.id === id ? { ...w, ...updates } : w);

            // Check if geometry changed
            if (updates.x !== undefined || updates.y !== undefined || updates.diameter !== undefined || updates.width !== undefined) {
                const targetWell = updatedWells.find(w => w.id === id);
                if (targetWell) {
                    const radius = (targetWell.diameter || 1.2) / 2; // Approximate if square?
                    const center = { x: targetWell.x, y: targetWell.y };

                    // Recalculate Pressure Pipes (mostly) and Gravity Pipes
                    setPipes(currentPipes => currentPipes.map(p => {
                        if (p.startNodeId === id) {
                            const newStart = calculatePipeConnectionPoint(center, radius, { x: p.x2, y: p.y2 });
                            return { ...p, x1: newStart.x, y1: newStart.y };
                        }
                        if (p.endNodeId === id) {
                            const newEnd = calculatePipeConnectionPoint(center, radius, { x: p.x1, y: p.y1 });
                            return { ...p, x2: newEnd.x, y2: newEnd.y };
                        }
                        return p;
                    }));

                    setPressurePipes(currentPP => currentPP.map(p => {
                        if (p.startNodeId === id) {
                            const newStart = calculatePipeConnectionPoint(center, radius, { x: p.x2, y: p.y2 });
                            return { ...p, x1: newStart.x, y1: newStart.y };
                        }
                        if (p.endNodeId === id) {
                            const newEnd = calculatePipeConnectionPoint(center, radius, { x: p.x1, y: p.y1 });
                            return { ...p, x2: newEnd.x, y2: newEnd.y };
                        }
                        return p;
                    }));
                }
            }
            return updatedWells;
        });
    };

    // Check if this is a pressure element
    const isPressureElement = wetWells?.some(w => w.id === id) ||
        pumps?.some(p => p.id === id) ||
        pressurePipes?.some(p => p.id === id) ||
        pressureJunctions?.some(j => j.id === id) ||
        (elementType as string) === 'air_valve';

    const isPublicoProject = settings.projectType === 'Público';

    const attributes = type === 'chamber'
        ? isPublicoProject
            // ── Público: sin UEH, con P_local ──
            ? [
                { key: 'CT', label: 'Cota Terreno (CT)', unit: 'm' },
                { key: 'H', label: 'Altura (H)', unit: 'm' },
                { key: 'delta', label: 'Delta (Δ)', unit: 'm' },
                { key: 'Cre', label: 'C. Radier Ent. (Cre)', unit: 'm' },
                { key: 'CRS', label: 'C. Radier Sal. (CRS)', unit: 'm' },
                { key: 'populationLocal', label: 'Población Local (P_local)', unit: 'hab' },
                { key: 'P_acum', label: 'Población Acumulada (P_acum)', unit: 'hab' },
                { key: 'Qin', label: 'Caudal Entrada (Qin)', unit: 'l/s' },
                { key: 'qinAcumulado', label: 'Caudal Acumulado (Qin)', unit: 'l/s' }
            ]
            // ── Domiciliario / Mixto: con UEH ──
            : [
                { key: 'CT', label: 'Cota Terreno (CT)', unit: 'm' },
                { key: 'H', label: 'Altura (H)', unit: 'm' },
                { key: 'delta', label: 'Delta (Δ)', unit: 'm' },
                { key: 'Cre', label: 'C. Radier Ent. (Cre)', unit: 'm' },
                { key: 'CRS', label: 'C. Radier Sal. (CRS)', unit: 'm' },
                { key: 'uehPropias', label: 'UEH Propias', unit: '' },
                { key: 'uehAcumuladas', label: 'UEH Acumuladas', unit: '' },
                { key: 'qwwPropio', label: 'Qww Propio', unit: 'l/s' },
                { key: 'qwwAcumulado', label: 'Qww Acumulado', unit: 'l/s' },
                { key: 'Qin', label: 'Caudal Entrada (Qin)', unit: 'l/s' },
                { key: 'qinAcumulado', label: 'Caudal Acumulado (Qin)', unit: 'l/s' }
            ]
        : [
            { key: 'material', label: 'Material', unit: '' },
            { key: 'diameter', label: 'Diámetro Nominal (DN)', unit: 'mm' },
            { key: 'length', label: 'Longitud', unit: 'm' },
            { key: 'slope', label: 'Pendiente', unit: '%' },
            { key: 'P_edge', label: 'Población Tributaria', unit: 'hab' },
            { key: 'uehTransportadas', label: 'UEH Transportadas', unit: '' },
            { key: 'qwwTransportado', label: 'Caudal medio diario', unit: 'l/s' },
            { key: 'qmaxHorarioTramo', label: 'Caudal máximo horario del tramo', unit: 'l/s' }
        ];



    // ... (existing helper functions)

    // Get normative reference for the selected element
    const getNormativeReference = () => {
        if (type === 'pipe') {
            const pipeRole = resolveEffectivePipeRole(object as Pipe);
            if (pipeRole === 'COLECTOR_EXTERIOR') {
                return {
                    norm: 'NCh 1105',
                    method: 'Hidráulico (Manning)'
                };
            } else {
                return {
                    norm: 'NCh 3371',
                    method: settings.verificationMode === 'MANNING_ONLY' ? 'Hidráulico' : 'UEH'
                };
            }
        }
        return null;
    };

    const normRef = getNormativeReference();

    const updatePumpSystemBinding = (pumpId: string, updates: Partial<Pump>) => {
        setPumps(prev => prev.map(p => p.id === pumpId ? { ...p, ...updates } : p));

        setPumpingSystems(prev => prev.map(system => {
            const isPrimaryPump = system.pumpId === pumpId;
            const isActiveSystem = system.id === activePumpingSystemId;
            const shouldSync = isPrimaryPump || isActiveSystem;
            if (!shouldSync) return system;

            const nextWetWellId = updates.wetWellId !== undefined ? updates.wetWellId : system.wetWellId;
            const nextPumpId = system.pumpId || pumpId;
            const nextDischargeStart = system.dischargeStartNodeId || pumpId;

            return {
                ...system,
                wetWellId: nextWetWellId,
                pumpId: nextPumpId,
                dischargeStartNodeId: nextDischargeStart
            };
        }));
    };

    return (
        <>
            <div className={`properties-panel ${isVisible ? 'open' : ''}`}
                key={`props-${id}-lock-${isLocked}`}
                style={{
                    width: isVisible ? '320px' : '0',
                    borderLeft: isVisible ? '1px solid var(--border, var(--border))' : 'none',
                    background: 'var(--surface, var(--surface))',
                    transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s ease',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    zIndex: 100,
                    boxShadow: isVisible ? 'var(--shadow-sm)' : 'none'
                }}>
                {/* Header — CAD style */}
                <div className="prop-panel-header">
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Propiedades</span>
                    <div style={{ display: 'flex', gap: '2px' }}>
                        {onToggleCollapse && (
                            <button
                                onClick={onToggleCollapse}
                                className="panel-collapse-btn"
                                style={{ padding: '4px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                                title="Contraer panel"
                            >
                                <ChevronRight size={14} />
                            </button>
                        )}
                        <button
                            onClick={handleDelete}
                            disabled={isLocked}
                            style={{ color: isLocked ? 'var(--text-muted)' : 'var(--danger, var(--error-color))', padding: '4px', border: 'none', background: 'transparent', cursor: isLocked ? 'not-allowed' : 'pointer' }}
                            title="Eliminar"
                        >
                            <Trash2 size={14} />
                        </button>
                        <button onClick={handleClose} style={{ color: 'var(--text-muted)', padding: '4px', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                            <X size={14} />
                        </button>
                    </div>
                </div>
                {/* Element badge + selector */}
                <div className="prop-element-badge">
                    <div className="prop-element-icon" />
                    <span style={{ fontSize: '11px', color: 'var(--text-primary, var(--text-primary))', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {elementType === 'chamber' ? 'Cámara' : elementType === 'pipe' ? 'Tubería' : elementType === 'wetwell' ? 'Cámara Húmeda' : elementType === 'pump' ? 'Bomba' : elementType === 'pressurepipe' ? 'Tubería Presión' : elementType === 'pressure_junction' ? 'Nodo P.' : 'Ventosa'}
                    </span>
                    <select
                        value={`${type}:${id}`}
                        onChange={(e) => {
                            const [newType, ...idParts] = e.target.value.split(':');
                            const newId = idParts.join(':').trim();
                            setEditingObjectId({ id: newId, type: newType as 'chamber' | 'pipe' | 'air_valve' });
                        }}
                        disabled={isLocked}
                        style={{ marginLeft: 'auto', fontSize: '11px', maxWidth: '130px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '2px', color: 'var(--text-primary, var(--text-primary))', padding: '1px 4px', cursor: 'pointer' }}
                    >
                        <optgroup label="Cámaras">
                            {chambers.map(c => (
                                <option key={c.id} value={`chamber:${c.id}`}>{c.userDefinedId}</option>
                            ))}
                        </optgroup>
                        <optgroup label="Tuberías">
                            {pipes.map(p => (
                                <option key={p.id} value={`pipe:${p.id}`}>{p.userDefinedId}</option>
                            ))}
                            {pressurePipes.map(p => (
                                <option key={p.id} value={`pipe:${p.id}`}>{p.name || p.id}</option>
                            ))}
                        </optgroup>
                        <optgroup label="Nodos de Presión">
                            {pressureJunctions.map(j => (
                                <option key={j.id} value={`chamber:${j.id}`}>{j.name || j.id}</option>
                            ))}
                        </optgroup>
                        <optgroup label="Ventosas (Inline)">
                            {pressurePipes.flatMap(p => p.inlineNodes || []).map(av => (
                                <option key={av.id} value={`air_valve:${av.id}`}>{av.id}</option>
                            ))}
                        </optgroup>
                    </select>
                </div>

                {/* Content */}
                <div className="prop-content-area">

                    {isEditableGravityLabel && (
                        <>
                            <div className="prop-section-header">General</div>
                            <div className="prop-row">
                                <div className="prop-row-label">Identificador</div>
                                <div className="prop-row-value" style={{ flexDirection: 'column', alignItems: 'stretch', padding: '2px 4px' }}>
                                    <input
                                        type="text"
                                        value={editableNameDraft}
                                        onChange={(e) => {
                                            setEditableNameDraft(e.target.value);
                                            if (editableNameError) setEditableNameError('');
                                        }}
                                        onBlur={commitEditableName}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                commitEditableName();
                                            }
                                        }}
                                        disabled={isLocked}
                                        style={{ fontWeight: 700, color: editableNameError ? 'var(--danger, var(--error-color))' : undefined }}
                                    />
                                    {editableNameError && (
                                        <span style={{ fontSize: '9px', color: 'var(--danger, var(--error-color))', lineHeight: 1.2 }}>{editableNameError}</span>
                                    )}
                                </div>
                            </div>
                        </>
                    )}

                    {/* Normative Reference - Only for Pipes */}
                    {normRef && (
                        <div style={{
                            padding: '12px',
                            background: 'var(--accent-soft)',
                            border: '1px solid var(--accent)',
                            borderRadius: '8px'
                        }}>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                NORMA DE VERIFICACIÓN
                            </div>
                            <div style={{ fontWeight: 600, color: 'var(--accent)', fontSize: '0.9rem' }}>
                                {normRef.norm}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                Método: {normRef.method}
                            </div>
                        </div>
                    )}

                    {/* WET WELL PROPERTY EDITOR */}
                    {wetWells?.some(w => w.id === id) && (() => {
                        const wetWell = wetWells.find(w => w.id === id) as WetWell;
                        return (
                            <>
                                <div style={{
                                    padding: '12px',
                                    background: 'var(--accent-soft)',
                                    border: '1px solid var(--accent)',
                                    borderRadius: '8px',
                                    marginBottom: '12px'
                                }}>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        💧 CÁMARA HÚMEDA
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        Sistema de Impulsión
                                    </div>
                                </div>





                                {/* Smart Design Optimization [NEW] */}
                                <div style={{ marginBottom: '16px', background: 'var(--success-soft)', padding: '10px', borderRadius: '6px', border: '1px solid var(--success)' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--success)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Zap size={14} /> OPTIMIZACIÓN DE DISEÑO
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>T. Mín. Marcha (min)</label>
                                            <input
                                                type="number"
                                                value={wetWell.minPumpingTime || 0}
                                                onChange={(e) => updateWetWell(id, { minPumpingTime: parseFloat(e.target.value) })}
                                                disabled={isLocked}
                                                style={{
                                                    width: '100%',
                                                    background: 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    color: 'var(--text-primary)',
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Arranques Máx/h</label>
                                            <input
                                                type="number"
                                                value={wetWell.maxStartsPerHour || 6}
                                                onChange={(e) => updateWetWell(id, { maxStartsPerHour: parseFloat(e.target.value) })}
                                                disabled={isLocked}
                                                style={{
                                                    width: '100%',
                                                    background: 'var(--surface-input)',
                                                    border: '1px solid var(--surface-input-border)',
                                                    color: 'var(--text-primary)',
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Q Medio (l/s)</label>
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={wetWell.inflowRate || 0}
                                                onChange={(e) => updateWetWell(id, { inflowRate: parseFloat(e.target.value) })}
                                                disabled={isLocked}
                                                style={{
                                                    width: '100%',
                                                    background: 'var(--surface-input)',
                                                    border: '1px solid var(--surface-input-border)',
                                                    color: 'var(--text-primary)',
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <button
                                        onClick={(e) => {
                                            const area = calculateWetWellVolume(wetWell, 1);
                                            const connectedPump = pumps.find(p => p.wetWellId === id);
                                            const Qb = connectedPump?.pointNom?.Q || connectedPump?.Qnom || 0.01;
                                            const result = optimizeWetWellForRetention(wetWell, area, Qb);

                                            if (result.success && result.calculatedN1on !== undefined) {
                                                setPendingOptimization({
                                                    N1on: result.calculatedN1on,
                                                    Noff: result.calculatedNoff!,
                                                    Nmin: result.calculatedNmin!,
                                                    success: true,
                                                    message: result.message
                                                });
                                            } else {
                                                alert(result.message);
                                            }
                                        }}
                                        disabled={isLocked}
                                        style={{
                                            width: '100%',
                                            padding: '8px',
                                            background: 'var(--success)',
                                            color: 'var(--text-primary)',
                                            border: 'none',
                                            borderRadius: '4px',
                                            fontSize: '0.7rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '6px',
                                            marginTop: '14px'
                                        }}
                                    >
                                        <Zap size={14} /> OPTIMIZAR VOLUMEN (Cumplimiento Integral NCh 2472)
                                    </button>

                                    {/* Optimization Result Panel [PROMPT REQUESTED] */}
                                    {pendingOptimization && (
                                        <div style={{
                                            marginTop: '12px',
                                            padding: '10px',
                                            background: 'var(--accent-soft)',
                                            border: '1px solid var(--accent)',
                                            borderRadius: '6px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '8px'
                                        }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span>PARÁMETROS OPTIMIZADOS</span>
                                                <button
                                                    onClick={() => setPendingOptimization(null)}
                                                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', textAlign: 'center' }}>
                                                <div>
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>N. Min</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600 }}>{pendingOptimization.Nmin}m</div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>N. Off</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600 }}>{pendingOptimization.Noff}m</div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>1ra On</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600 }}>{pendingOptimization.N1on}m</div>
                                                </div>
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--accent)', fontStyle: 'italic', marginBottom: '4px' }}>
                                                {pendingOptimization.message}
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button
                                                    onClick={() => {
                                                        updateWetWell(id, {
                                                            N1on: pendingOptimization.N1on,
                                                            Noff: pendingOptimization.Noff,
                                                            Nmin: pendingOptimization.Nmin
                                                        });
                                                        setPendingOptimization(null);
                                                    }}
                                                    disabled={isLocked}
                                                    style={{
                                                        flex: 1,
                                                        padding: '6px',
                                                        background: isLocked ? 'var(--accent-soft)' : 'var(--accent)',
                                                        color: 'var(--text-primary)',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        cursor: isLocked ? 'not-allowed' : 'pointer',
                                                        opacity: isLocked ? 0.6 : 1
                                                    }}
                                                >
                                                    Aceptar
                                                </button>
                                                <button
                                                    onClick={() => setPendingOptimization(null)}
                                                    style={{
                                                        padding: '6px 12px',
                                                        background: 'var(--surface)',
                                                        color: 'var(--text-primary)',
                                                        border: '1px solid var(--border)',
                                                        borderRadius: '4px',
                                                        fontSize: '0.75rem',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Cancelar
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Safety Margin Criterion (used when Q = Qin is imposed) */}
                                <div style={{ marginBottom: '16px', background: 'var(--surface)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Activity size={14} /> CRITERIO DE MARGEN (QIN)
                                    </div>

                                    <div style={{
                                        fontSize: '0.72rem',
                                        color: 'var(--accent)',
                                        marginBottom: '8px',
                                        padding: '6px 8px',
                                        background: 'var(--accent-soft)',
                                        border: '1px solid var(--accent)',
                                        borderRadius: '6px'
                                    }}>
                                        Velocidad Impulsión - Exigencia: igual a 0.6 - 3.0 m/s
                                    </div>

                                    <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                        Margen de Seguridad Propuesto FS: {'>= X%'}
                                    </label>

                                    <input
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        max="100"
                                        value={Number.isFinite(wetWell.safetyMarginRequirement) ? wetWell.safetyMarginRequirement : 15}
                                        onChange={(e) => updateWetWell(id, { safetyMarginRequirement: Math.max(0, Number(e.target.value) || 0) })}
                                        disabled={isLocked}
                                        style={{
                                            width: '100%',
                                            background: 'var(--surface-input)',
                                            border: '1px solid var(--accent)',
                                            color: 'var(--text-primary)',
                                            padding: '6px 8px',
                                            borderRadius: '4px',
                                            fontSize: '0.8rem'
                                        }}
                                    />

                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                                        Se usa en la verificación de altura de diseño cuando la hidráulica se evalúa con Q = Qin.
                                    </div>
                                </div>

                                {/* Elevations Section */}
                                <div style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                                        ELEVACIONES (m)
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Radier (CR)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={wetWell.CR}
                                                onChange={(e) => updateWetWell(id, { CR: Number(e.target.value) })}
                                                disabled={isLocked}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px',
                                                    background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '4px',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Terreno (CT)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={wetWell.CT}
                                                onChange={(e) => updateWetWell(id, { CT: Number(e.target.value) })}
                                                disabled={isLocked}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px',
                                                    background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    borderLeft: '3px solid var(--accent)', // Highlight
                                                    borderRadius: '4px',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Nivel Agua (CL)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={wetWell.CL}
                                                onChange={(e) => updateWetWell(id, { CL: Number(e.target.value) })}
                                                disabled={isLocked}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px',
                                                    background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    borderLeft: '3px solid var(--accent)', // Highlight
                                                    borderRadius: '4px',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Invert (CI)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={wetWell.CI}
                                                onChange={(e) => updateWetWell(id, { CI: Number(e.target.value) })}
                                                disabled={isLocked}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px',
                                                    background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '4px',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Control Levels Section */}
                                <div style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                                        NIVELES DE CONTROL (m)
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Mínimo (Nmin)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={wetWell.Nmin}
                                                onChange={(e) => updateWetWell(id, { Nmin: Number(e.target.value) })}
                                                disabled={isLocked}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px',
                                                    background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '4px',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Apagado (Noff)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={wetWell.Noff}
                                                onChange={(e) => updateWetWell(id, { Noff: Number(e.target.value) })}
                                                disabled={isLocked}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px',
                                                    background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '4px',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>1ra Bomba (N1on)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={wetWell.N1on}
                                                onChange={(e) => updateWetWell(id, { N1on: Number(e.target.value) })}
                                                disabled={isLocked}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px',
                                                    background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '4px',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Alarma (Nalarm)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={wetWell.Nalarm}
                                                onChange={(e) => updateWetWell(id, { Nalarm: Number(e.target.value) })}
                                                disabled={isLocked}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px',
                                                    background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '4px',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Rebalse (Seguridad)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={wetWell.overflowLevel || ''}
                                                onChange={(e) => updateWetWell(id, { overflowLevel: Number(e.target.value) || undefined })}
                                                placeholder="m"
                                                disabled={isLocked}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px',
                                                    background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '4px',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Geometry Section */}
                                <div style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                                        GEOMETRÍA
                                    </div>
                                    <div style={{ marginBottom: '12px' }}>
                                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Tipo de Geometría</label>
                                        <select
                                            value={wetWell.geometryType || (wetWell.width && wetWell.length ? 'rectangular' : 'circular')}
                                            onChange={(e) => updateWetWell(id, { geometryType: e.target.value as any })}
                                            disabled={isLocked}
                                            style={{
                                                width: '100%',
                                                padding: '6px',
                                                background: 'var(--bg)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '4px',
                                                color: 'var(--text-primary)',
                                                fontSize: '0.85rem'
                                            }}
                                        >
                                            <option value="circular">Cilíndrica</option>
                                            <option value="square">Cuadrada</option>
                                            <option value="rectangular">Rectangular</option>
                                        </select>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        {(wetWell.geometryType === 'circular' || (!wetWell.geometryType && !wetWell.width)) && (
                                            <div>
                                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Diámetro (m)</label>
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        value={wetWell.diameter || ''}
                                                        onChange={(e) => updateWetWell(id, { diameter: Number(e.target.value) || undefined })}
                                                        disabled={isLocked}
                                                        style={{
                                                            flex: 1,
                                                            padding: '6px',
                                                            background: 'var(--bg)',
                                                            border: '1px solid var(--border)',
                                                            borderRadius: '4px',
                                                            color: 'var(--text-primary)',
                                                            fontSize: '0.85rem'
                                                        }}
                                                    />
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--success)', background: 'var(--success-soft)', padding: '4px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                                                        A: {calculateWetWellVolume(wetWell, 1).toFixed(2)}m²
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {wetWell.geometryType === 'square' && (
                                            <div>
                                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Lado (m)</label>
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        value={wetWell.side || ''}
                                                        onChange={(e) => updateWetWell(id, { side: Number(e.target.value) || undefined })}
                                                        onFocus={(e) => e.target.select()}
                                                        disabled={isLocked}
                                                        style={{
                                                            flex: 1,
                                                            padding: '6px',
                                                            background: 'var(--bg)',
                                                            border: '1px solid var(--border)',
                                                            borderRadius: '4px',
                                                            color: 'var(--text-primary)',
                                                            fontSize: '0.85rem'
                                                        }}
                                                    />
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--success)', background: 'var(--success-soft)', padding: '4px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                                                        A: {calculateWetWellVolume(wetWell, 1).toFixed(2)}m²
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {(wetWell.geometryType === 'rectangular' || (!wetWell.geometryType && wetWell.width)) && (
                                            <>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Largo (m)</label>
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        value={wetWell.length || ''}
                                                        onChange={(e) => updateWetWell(id, { length: Number(e.target.value) || undefined })}
                                                        onFocus={(e) => e.target.select()}
                                                        disabled={isLocked}
                                                        style={{
                                                            width: '100%',
                                                            padding: '6px',
                                                            background: 'var(--bg)',
                                                            border: '1px solid var(--border)',
                                                            borderRadius: '4px',
                                                            color: 'var(--text-primary)',
                                                            fontSize: '0.85rem'
                                                        }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Ancho (m)</label>
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        value={wetWell.width || ''}
                                                        onChange={(e) => updateWetWell(id, { width: Number(e.target.value) || undefined })}
                                                        onFocus={(e) => e.target.select()}
                                                        disabled={isLocked}
                                                        style={{
                                                            width: '100%',
                                                            padding: '6px',
                                                            background: 'var(--bg)',
                                                            border: '1px solid var(--border)',
                                                            borderRadius: '4px',
                                                            color: 'var(--text-primary)',
                                                            fontSize: '0.85rem'
                                                        }}
                                                    />
                                                </div>
                                            </>
                                        )}

                                        <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--success)', background: 'var(--success-soft)', padding: '4px 8px', borderRadius: '4px' }}>
                                                Área Calculada: {calculateWetWellVolume(wetWell, 1).toFixed(2)}m²
                                            </div>
                                        </div>

                                        <div style={{ gridColumn: 'span 2', marginTop: '8px' }}>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Espesor Muro (m)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={wetWell.wallThickness || ''}
                                                onChange={(e) => updateWetWell(id, { wallThickness: Number(e.target.value) || undefined })}
                                                placeholder="0.20"
                                                disabled={isLocked}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px',
                                                    background: 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '4px',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {/* Sanitary Data */}
                                    <div style={{ marginTop: '16px' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                                            DATOS SANITARIOS
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                            <div>
                                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Q-Afluente (l/s)</label>
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={wetWell.inflowRate || ''}
                                                    onChange={(e) => updateWetWell(id, { inflowRate: Number(e.target.value) })}
                                                    onFocus={(e) => e.target.select()}
                                                    disabled={isLocked}
                                                    placeholder="0.0"
                                                    style={{
                                                        width: '100%',
                                                        padding: '6px',
                                                        background: 'var(--bg)',
                                                        border: '1px solid var(--border)',
                                                        borderLeft: '3px solid var(--success)',
                                                        borderRadius: '4px',
                                                        color: 'var(--text-primary)',
                                                        fontSize: '0.85rem'
                                                    }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Coef. Punta (α)</label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={wetWell.peakingFactor || ''}
                                                    onChange={(e) => updateWetWell(id, { peakingFactor: Number(e.target.value) })}
                                                    onFocus={(e) => e.target.select()}
                                                    disabled={isLocked}
                                                    placeholder="1.0"
                                                    style={{
                                                        width: '100%',
                                                        padding: '6px',
                                                        background: 'var(--bg)',
                                                        border: '1px solid var(--border)',
                                                        borderRadius: '4px',
                                                        color: 'var(--text-primary)',
                                                        fontSize: '0.85rem'
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        );
                    })()}

                    {/* PUMP PROPERTY EDITOR */}
                    {pumps?.some(p => p.id === id) && (() => {
                        const pump = pumps.find(p => p.id === id) as Pump;
                        const hasCurveData = pump.curveMode === '3_POINTS'
                            ? !!pump.point0 && !!pump.pointNom && !!pump.pointMax
                            : Array.isArray(pump.curveTable) && pump.curveTable.length >= 3;
                        const hydraulicFlowMode = pump.hydraulicFlowMode || (hasCurveData ? 'OPERATING_POINT_QSTAR' : 'IMPOSED_QIN');
                        const pumpSystemId = pump.systemId || activePumpingSystemId || pumpingSystems.find(s => s.pumpId === pump.id)?.id || '';
                        const availableWetWells = wetWells.filter(w => !pumpSystemId || w.systemId === pumpSystemId);
                        const availableDischargePipes = pressurePipes.filter(pipe => {
                            const linkKind = pipe.kind || 'pipe';
                            if (linkKind !== 'pipe') return false;
                            if (pumpSystemId && pipe.systemId && pipe.systemId !== pumpSystemId) return false;
                            return true;
                        });
                        return (
                            <>
                                <div style={{
                                    padding: '12px',
                                    background: 'var(--success-soft)',
                                    border: '1px solid var(--success)',
                                    borderRadius: '8px',
                                    marginBottom: '12px'
                                }}>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        ⚙️ BOMBA
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        Sistema de Impulsión
                                    </div>
                                </div>

                                <div style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                                        VINCULOS EXPLICITOS
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Cámara húmeda (wetWellId)</label>
                                            <select
                                                value={pump.wetWellId || ''}
                                                onChange={(e) => updatePumpSystemBinding(id, { wetWellId: e.target.value })}
                                                disabled={isLocked}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px',
                                                    background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    borderLeft: pump.wetWellId ? '3px solid var(--success)' : '3px solid var(--danger)',
                                                    borderRadius: '4px',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.85rem'
                                                }}
                                            >
                                                <option value="">Seleccionar cámara húmeda...</option>
                                                {availableWetWells.map(ww => (
                                                    <option key={ww.id} value={ww.id}>{ww.userDefinedId || ww.name || ww.id}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Linea de descarga (dischargeLineId)</label>
                                            <select
                                                value={pump.dischargeLineId || ''}
                                                onChange={(e) => {
                                                    const nextDischargeLineId = e.target.value;
                                                    setPumps(prev => prev.map(p => p.id === id ? { ...p, dischargeLineId: nextDischargeLineId } : p));
                                                    setPumpingSystems(prev => prev.map(system => {
                                                        const isPrimaryPump = system.pumpId === id;
                                                        const isActiveSystem = system.id === activePumpingSystemId;
                                                        if (!isPrimaryPump && !isActiveSystem) return system;
                                                        return {
                                                            ...system,
                                                            pumpId: system.pumpId || id,
                                                            dischargeStartNodeId: system.dischargeStartNodeId || id
                                                        };
                                                    }));
                                                }}
                                                disabled={isLocked}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px',
                                                    background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    borderLeft: pump.dischargeLineId ? '3px solid var(--success)' : '3px solid var(--danger)',
                                                    borderRadius: '4px',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.85rem'
                                                }}
                                            >
                                                <option value="">Seleccionar linea principal...</option>
                                                {availableDischargePipes.map(pipe => (
                                                    <option key={pipe.id} value={pipe.id}>{pipe.name || pipe.userDefinedId || pipe.id}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {(!pump.wetWellId || !pump.dischargeLineId) && (
                                            <div style={{
                                                fontSize: '0.7rem',
                                                color: 'var(--danger)',
                                                padding: '6px 8px',
                                                borderRadius: '4px',
                                                background: 'var(--error-bg)',
                                                border: '1px solid var(--error-border)'
                                            }}>
                                                Vinculos obligatorios: defina wetWellId y dischargeLineId para poder calcular este sistema.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Rated Characteristics Section */}
                                <div style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                                        CARACTERÍSTICAS NOMINALES
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Qnom (l/min)</label>
                                            <input
                                                type="number"
                                                step="1"
                                                value={pump.Qnom ? fromM3s(pump.Qnom, 'L/min').toFixed(2) : ''}
                                                onChange={(e) => setPumps(prev => prev.map(p => p.id === id ? { ...p, Qnom: toM3s(Number(e.target.value), 'L/min') } : p))}
                                                onFocus={(e) => e.target.select()}
                                                disabled={isLocked}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px',
                                                    background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    borderLeft: '3px solid var(--accent)', // Highlight
                                                    borderRadius: '4px',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Hnom (m)</label>
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={pump.Hnom}
                                                onChange={(e) => setPumps(prev => prev.map(p => p.id === id ? { ...p, Hnom: Number(e.target.value) } : p))}
                                                disabled={isLocked}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px',
                                                    background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '4px',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>PN (bar)</label>
                                            <input
                                                type="number"
                                                step="1"
                                                value={pump.PN_usuario}
                                                onChange={(e) => setPumps(prev => prev.map(p => p.id === id ? { ...p, PN_usuario: Number(e.target.value) } : p))}
                                                disabled={isLocked}
                                                placeholder="6, 10, 16..."
                                                style={{
                                                    width: '100%',
                                                    padding: '6px',
                                                    background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '4px',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                                        LÍMITES DE CAUDAL BOMBA
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Qmin (L/s)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={pump.operatingLimits?.qMin_Lps ?? ''}
                                                onChange={(e) => setPumps(prev => prev.map(p => p.id === id ? {
                                                    ...p,
                                                    operatingLimits: {
                                                        ...p.operatingLimits,
                                                        qMin_Lps: e.target.value === '' ? undefined : Number(e.target.value),
                                                        mode: p.operatingLimits?.mode || 'STRICT'
                                                    }
                                                } : p))}
                                                disabled={isLocked}
                                                placeholder="Opcional"
                                                style={{ width: '100%', padding: '6px', background: isLocked ? 'var(--locked-bg)' : 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Qmax (L/s)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={pump.operatingLimits?.qMax_Lps ?? ''}
                                                onChange={(e) => setPumps(prev => prev.map(p => p.id === id ? {
                                                    ...p,
                                                    operatingLimits: {
                                                        ...p.operatingLimits,
                                                        qMax_Lps: e.target.value === '' ? undefined : Number(e.target.value),
                                                        mode: p.operatingLimits?.mode || 'STRICT'
                                                    }
                                                } : p))}
                                                disabled={isLocked}
                                                placeholder="Opcional"
                                                style={{ width: '100%', padding: '6px', background: isLocked ? 'var(--locked-bg)' : 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                                            />
                                        </div>
                                        <div style={{ gridColumn: '1 / -1' }}>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Modo de límites</label>
                                            <select
                                                value={pump.operatingLimits?.mode || 'STRICT'}
                                                onChange={(e) => setPumps(prev => prev.map(p => p.id === id ? {
                                                    ...p,
                                                    operatingLimits: {
                                                        ...p.operatingLimits,
                                                        mode: e.target.value === 'CLAMP' ? 'CLAMP' : 'STRICT'
                                                    }
                                                } : p))}
                                                disabled={isLocked}
                                                style={{ width: '100%', padding: '6px', background: isLocked ? 'var(--locked-bg)' : 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                                            >
                                                <option value="STRICT">STRICT (sin recorte)</option>
                                                <option value="CLAMP">CLAMP (recortar a rango)</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                                        NPSH (SUCCIÓN)
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>NPSHr (m)</label>
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={pump.npshRequired_m ?? ''}
                                                onChange={(e) => setPumps(prev => prev.map(p => p.id === id ? {
                                                    ...p,
                                                    npshRequired_m: e.target.value === '' ? undefined : Number(e.target.value)
                                                } : p))}
                                                disabled={isLocked}
                                                placeholder="Opcional"
                                                style={{ width: '100%', padding: '6px', background: isLocked ? 'var(--locked-bg)' : 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Margen NPSH (m)</label>
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={pump.npshMargin_m ?? ''}
                                                onChange={(e) => setPumps(prev => prev.map(p => p.id === id ? {
                                                    ...p,
                                                    npshMargin_m: e.target.value === '' ? undefined : Number(e.target.value)
                                                } : p))}
                                                disabled={isLocked}
                                                placeholder="0.5"
                                                style={{ width: '100%', padding: '6px', background: isLocked ? 'var(--locked-bg)' : 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                                        CONDICIONES AMBIENTALES (NPSH)
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        <div style={{ gridColumn: '1 / -1' }}>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Modo</label>
                                            <select
                                                value={pump.environmentalConditions?.mode || 'DEFAULT'}
                                                onChange={(e) => setPumps(prev => prev.map(p => p.id === id ? {
                                                    ...p,
                                                    environmentalConditions: {
                                                        ...p.environmentalConditions,
                                                        mode: e.target.value === 'AUTO' ? 'AUTO' : e.target.value === 'MANUAL' ? 'MANUAL' : 'DEFAULT'
                                                    }
                                                } : p))}
                                                disabled={isLocked}
                                                style={{ width: '100%', padding: '6px', background: isLocked ? 'var(--locked-bg)' : 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                                            >
                                                <option value="DEFAULT">DEFAULT (Patm 10.3, Pvapor 0.3)</option>
                                                <option value="AUTO">AUTO (altitud + temperatura)</option>
                                                <option value="MANUAL">MANUAL (Patm y Pvapor)</option>
                                            </select>
                                        </div>

                                        {(pump.environmentalConditions?.mode || 'DEFAULT') === 'AUTO' && (
                                            <>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Altitud (msnm)</label>
                                                    <input
                                                        type="number"
                                                        step="1"
                                                        value={pump.environmentalConditions?.altitude_m ?? ''}
                                                        onChange={(e) => setPumps(prev => prev.map(p => p.id === id ? {
                                                            ...p,
                                                            environmentalConditions: {
                                                                ...p.environmentalConditions,
                                                                mode: 'AUTO',
                                                                altitude_m: e.target.value === '' ? undefined : Number(e.target.value)
                                                            }
                                                        } : p))}
                                                        disabled={isLocked}
                                                        style={{ width: '100%', padding: '6px', background: isLocked ? 'var(--locked-bg)' : 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Temperatura agua (°C)</label>
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        value={pump.environmentalConditions?.waterTemperature_C ?? ''}
                                                        onChange={(e) => setPumps(prev => prev.map(p => p.id === id ? {
                                                            ...p,
                                                            environmentalConditions: {
                                                                ...p.environmentalConditions,
                                                                mode: 'AUTO',
                                                                waterTemperature_C: e.target.value === '' ? undefined : Number(e.target.value)
                                                            }
                                                        } : p))}
                                                        disabled={isLocked}
                                                        style={{ width: '100%', padding: '6px', background: isLocked ? 'var(--locked-bg)' : 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                                                    />
                                                </div>
                                            </>
                                        )}

                                        {(pump.environmentalConditions?.mode || 'DEFAULT') === 'MANUAL' && (
                                            <>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Patm Head (m)</label>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={pump.environmentalConditions?.patmHead_m ?? ''}
                                                        onChange={(e) => setPumps(prev => prev.map(p => p.id === id ? {
                                                            ...p,
                                                            environmentalConditions: {
                                                                ...p.environmentalConditions,
                                                                mode: 'MANUAL',
                                                                patmHead_m: e.target.value === '' ? undefined : Number(e.target.value)
                                                            }
                                                        } : p))}
                                                        disabled={isLocked}
                                                        style={{ width: '100%', padding: '6px', background: isLocked ? 'var(--locked-bg)' : 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Pvapor Head (m)</label>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={pump.environmentalConditions?.pvaporHead_m ?? ''}
                                                        onChange={(e) => setPumps(prev => prev.map(p => p.id === id ? {
                                                            ...p,
                                                            environmentalConditions: {
                                                                ...p.environmentalConditions,
                                                                mode: 'MANUAL',
                                                                pvaporHead_m: e.target.value === '' ? undefined : Number(e.target.value)
                                                            }
                                                        } : p))}
                                                        disabled={isLocked}
                                                        style={{ width: '100%', padding: '6px', background: isLocked ? 'var(--locked-bg)' : 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                                                    />
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Hydraulic Flow Mode Selector */}
                                <div style={{ marginBottom: '16px', background: 'var(--surface)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Activity size={14} /> CAUDAL PARA ANÁLISIS HIDRÁULICO
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                                            <input
                                                type="radio"
                                                name={`hydraulicFlowMode-${id}`}
                                                checked={hydraulicFlowMode === 'IMPOSED_QIN'}
                                                onChange={() => setPumps(prev => prev.map(p => p.id === id ? { ...p, hydraulicFlowMode: 'IMPOSED_QIN' } : p))}
                                                disabled={isLocked}
                                                style={{ accentColor: 'var(--accent)', marginTop: '2px' }}
                                            />
                                            <span>
                                                <strong style={{ color: 'var(--accent-soft)' }}>Usar Qin (diseño sanitario)</strong>
                                                <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '2px' }}>
                                                    Calcula pérdidas, HGL y presiones con Q = Qin. No usa Q* para pérdidas/HGL.
                                                </span>
                                            </span>
                                        </label>

                                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                                            <input
                                                type="radio"
                                                name={`hydraulicFlowMode-${id}`}
                                                checked={hydraulicFlowMode === 'OPERATING_POINT_QSTAR'}
                                                onChange={() => setPumps(prev => prev.map(p => p.id === id ? { ...p, hydraulicFlowMode: 'OPERATING_POINT_QSTAR' } : p))}
                                                disabled={isLocked}
                                                style={{ accentColor: 'var(--warning)', marginTop: '2px' }}
                                            />
                                            <span>
                                                <strong style={{ color: 'var(--warning)' }}>Usar Q* (punto de operación)</strong>
                                                <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '2px' }}>
                                                    Calcula Q* por intersección bomba-sistema y usa Q* para pérdidas, HGL y presiones.
                                                </span>
                                            </span>
                                        </label>

                                        {hydraulicFlowMode === 'OPERATING_POINT_QSTAR' && (
                                            <div style={{ fontSize: '0.72rem', color: 'var(--warning)', paddingLeft: '24px' }}>
                                                ⚠ Q* puede ser distinto de Qin. Revisa evacuación/ciclos en el módulo de cámara húmeda.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Operational Constraints Section */}
                                <div style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                                        RESTRICCIONES OPERACIONALES
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Max Arranques/h</label>
                                            <input
                                                type="number"
                                                step="1"
                                                value={pump.maxStartsPerHour || ''}
                                                onChange={(e) => setPumps(prev => prev.map(p => p.id === id ? { ...p, maxStartsPerHour: Number(e.target.value) || undefined } : p))}
                                                disabled={isLocked}
                                                placeholder="10"
                                                style={{
                                                    width: '100%',
                                                    padding: '6px',
                                                    background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '4px',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Min Run (min)</label>
                                            <input
                                                type="number"
                                                step="1"
                                                value={pump.minRunTime || ''}
                                                onChange={(e) => setPumps(prev => prev.map(p => p.id === id ? { ...p, minRunTime: Number(e.target.value) || undefined } : p))}
                                                disabled={isLocked}
                                                placeholder="5"
                                                style={{
                                                    width: '100%',
                                                    padding: '6px',
                                                    background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '4px',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Max Run (min)</label>
                                            <input
                                                type="number"
                                                step="1"
                                                value={pump.maxRunTime || ''}
                                                onChange={(e) => setPumps(prev => prev.map(p => p.id === id ? { ...p, maxRunTime: Number(e.target.value) || undefined } : p))}
                                                disabled={isLocked}
                                                placeholder="30"
                                                style={{
                                                    width: '100%',
                                                    padding: '6px',
                                                    background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '4px',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {/* Sanitary Operational Data */}
                                    <div style={{ marginTop: '16px' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                                            OPERACIÓN SANITARIA
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                            <div>
                                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>N° Bombas</label>
                                                <input
                                                    type="number"
                                                    value={pump.pumpCount || 1}
                                                    onChange={(e) => setPumps(prev => prev.map(p => p.id === id ? { ...p, pumpCount: Number(e.target.value) } : p))}
                                                    disabled={isLocked}
                                                    style={{ width: '100%', padding: '6px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Eficiencia (%)</label>
                                                <input
                                                    type="number"
                                                    value={pump.efficiency || 75}
                                                    onChange={(e) => setPumps(prev => prev.map(p => p.id === id ? { ...p, efficiency: Number(e.target.value) } : p))}
                                                    disabled={isLocked}
                                                    style={{ width: '100%', padding: '6px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                                                />
                                            </div>
                                            <div style={{ gridColumn: '1 / -1' }}>
                                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Modo de Operación</label>
                                                <select
                                                    value={pump.operationMode || 'alternated'}
                                                    onChange={(e) => setPumps(prev => prev.map(p => p.id === id ? { ...p, operationMode: e.target.value as any } : p))}
                                                    disabled={isLocked}
                                                    style={{ width: '100%', padding: '6px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                                                >
                                                    <option value="alternated">Alternada (1+1)</option>
                                                    <option value="parallel">Paralelo (1+1)</option>
                                                    <option value="standby">Reserva (Stay-by)</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Curve Mode Section */}
                                    <div style={{ marginBottom: '16px' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
                                            CURVA DE BOMBA
                                        </div>
                                        <PumpCurveEditor
                                            mode={pump.curveMode}
                                            curveData={pump.curveMode === 'TABLE'
                                                ? (pump.curveTable || [])
                                                : [pump.point0, pump.pointNom, pump.pointMax]
                                                    .filter((point): point is PumpCurvePoint => Boolean(point && Number.isFinite(point.Q) && Number.isFinite(point.H)))
                                            }
                                            onModeChange={(mode: PumpCurveMode) => setPumps(prev => prev.map(p => {
                                                if (p.id !== id) return p;

                                                if (mode === '3_POINTS') {
                                                    const fallbackSorted = [...(p.curveTable || [])].sort((a, b) => a.Q - b.Q);
                                                    const point0 = p.point0 || fallbackSorted[0] || { Q: 0, H: 30 };
                                                    const pointNom = p.pointNom || fallbackSorted[Math.min(1, Math.max(0, fallbackSorted.length - 1))] || { Q: 0.01, H: 25 };
                                                    const pointMax = p.pointMax || fallbackSorted[Math.max(0, fallbackSorted.length - 1)] || { Q: 0.02, H: 20 };

                                                    return {
                                                        ...p,
                                                        curveMode: mode,
                                                        point0,
                                                        pointNom,
                                                        pointMax
                                                    };
                                                }

                                                const fallbackTable = (p.curveTable && p.curveTable.length > 0)
                                                    ? [...p.curveTable]
                                                        .filter(point => Number.isFinite(point?.Q) && Number.isFinite(point?.H))
                                                        .sort((a, b) => a.Q - b.Q)
                                                    : [p.point0, p.pointNom, p.pointMax]
                                                        .filter((point): point is PumpCurvePoint => Boolean(point && Number.isFinite(point.Q) && Number.isFinite(point.H)))
                                                        .sort((a, b) => a.Q - b.Q);

                                                return {
                                                    ...p,
                                                    curveMode: mode,
                                                    curveTable: fallbackTable
                                                };
                                            }))}
                                            onCurveChange={(data: PumpCurvePoint[]) => setPumps(prev => prev.map(p => {
                                                if (p.id !== id) return p;

                                                if (p.curveMode === 'TABLE') {
                                                    const tableInM3s = [...data]
                                                        .filter(point => Number.isFinite(point?.Q) && Number.isFinite(point?.H))
                                                        .sort((a, b) => a.Q - b.Q);
                                                    return {
                                                        ...p,
                                                        curveMode: 'TABLE',
                                                        curveTable: tableInM3s
                                                    };
                                                }

                                                const sorted = [...data].sort((a, b) => a.Q - b.Q);
                                                const existingPoints = [p.point0, p.pointNom, p.pointMax]
                                                    .filter((point): point is PumpCurvePoint => Boolean(point && Number.isFinite(point.Q) && Number.isFinite(point.H)));

                                                const point0 = sorted[0] || existingPoints[0] || { Q: 0, H: 30 };
                                                const pointNom = sorted[1] || existingPoints[1] || point0;
                                                const pointMax = sorted[2] || sorted[sorted.length - 1] || existingPoints[2] || pointNom;

                                                return {
                                                    ...p,
                                                    point0,
                                                    pointNom,
                                                    pointMax
                                                };
                                            }))}
                                            disabled={isLocked}
                                        />
                                    </div>
                                </div>
                            </>
                        );
                    })()}

                    {/* PRESSURE PIPE PROPERTY EDITOR */}
                    {pressurePipes?.some(p => p.id === id) && (() => {
                        const pipe = pressurePipes.find(p => p.id === id) as PressurePipe;
                        const endPressureJunction = pressureJunctions.find(j => j.id === pipe.endNodeId);
                        const isZEndLinkedToJunction = !!endPressureJunction;
                        const zEndValue = isZEndLinkedToJunction ? Number(endPressureJunction?.elevation || 0) : pipe.z_end;
                        const coverValue = Number.isFinite(pipe.cover_m) ? Number(pipe.cover_m) : 1;

                        const allSuggestedAirValves = analysisResults && 'verifications' in analysisResults
                            ? Object.entries((analysisResults as any).verifications || {})
                                .flatMap(([pipeId, verification]: [string, any]) =>
                                    ((verification?.airValves || []) as any[]).map((av, idx) => ({
                                        ...av,
                                        pipeId,
                                        _idx: idx
                                    }))
                                )
                                .sort((a, b) => (a.chainage || 0) - (b.chainage || 0))
                                .map((av, index) => ({
                                    ...av,
                                    avId: av.avId || `AV-${index + 1}`
                                }))
                            : [];

                        const suggestedAirValves = allSuggestedAirValves
                            .filter((av: any) => av.pipeId === pipe.id);

                        const getSuggestedValveType = (type: string): AirValveNode['airValveType'] => {
                            if (type === 'AIR_RELEASE' || type === 'RECOMENDADA_INGRESO_AIRE' || type === 'PREVENTIVA_PENDIENTE') return 'SIMPLE';
                            if (type === 'ANTI_SURGE' || type === 'EXPULSION_ANTI_GOLPE') return 'DOBLE';
                            return 'TRIPLE';
                        };

                        const insertSuggestedAirValve = (rec: any) => {
                            if (isLocked) return;

                            const currentPipe = pressurePipes.find(p => p.id === pipe.id) || pipe;
                            const chainage = Math.max(0, Math.min(currentPipe.length, Number(rec.chainage) || 0));

                            const existingOnPipe = (currentPipe.inlineNodes || []).find(node =>
                                (rec.avId && node.id === rec.avId) || Math.abs(node.chainage - chainage) < 0.05
                            );

                            if (existingOnPipe) {
                                setEditingObjectId({ id: existingOnPipe.id, type: 'air_valve' });
                                return;
                            }

                            const preferredId = (rec.avId || '').trim();
                            const existingIds = new Set(pressurePipes.flatMap(p => (p.inlineNodes || []).map(n => n.id)));
                            let finalId = preferredId || `AV-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
                            if (existingIds.has(finalId)) {
                                let suffix = 2;
                                while (existingIds.has(`${finalId}-${suffix}`)) suffix++;
                                finalId = `${finalId}-${suffix}`;
                            }

                            const ratio = currentPipe.length > 0 ? chainage / currentPipe.length : 0;
                            const x = currentPipe.x1 + (currentPipe.x2 - currentPipe.x1) * ratio;
                            const y = currentPipe.y1 + (currentPipe.y2 - currentPipe.y1) * ratio;

                            const newNode: AirValveNode = {
                                id: finalId,
                                pipeId: currentPipe.id,
                                chainage,
                                elevation: Number(rec.elevation) || 0,
                                airValveType: getSuggestedValveType(rec.type),
                                orificeDiameter: 50,
                                pressureRating: 16,
                                x,
                                y
                            };

                            setPressurePipes(prev => prev.map(p => p.id === currentPipe.id ? {
                                ...p,
                                inlineNodes: [...(p.inlineNodes || []), newNode]
                            } : p));

                            setEditingObjectId({ id: newNode.id, type: 'air_valve' });
                        };
                        return (
                            <>
                                <div style={{
                                    padding: '12px',
                                    background: 'var(--accent-soft)',
                                    border: '1px solid var(--accent)',
                                    borderRadius: '8px',
                                    marginBottom: '12px'
                                }}>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        🔵 TUBERÍA DE PRESIÓN
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Sistema de Impulsión</span>
                                        <span style={{ fontWeight: 600, color: 'var(--accent)', fontSize: '0.65rem' }}>NCh 2472:2021</span>
                                    </div>
                                </div>

                                {/* Geometry Section */}
                                <div style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                                        GEOMETRÍA
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Diámetro (mm)</label>
                                            <input
                                                type="number"
                                                step="1"
                                                value={pipe.diameter}
                                                onChange={(e) => setPressurePipes(prev => prev.map(p => p.id === id ? { ...p, diameter: Number(e.target.value) } : p))}
                                                onFocus={(e) => e.target.select()}
                                                disabled={isLocked}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px',
                                                    background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    borderLeft: '3px solid var(--accent)', // Highlight
                                                    borderRadius: '4px',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Longitud (m)</label>
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={pipe.length}
                                                onChange={(e) => setPressurePipes(prev => prev.map(p => p.id === id ? { ...p, length: Number(e.target.value) } : p))}
                                                disabled={isLocked}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px',
                                                    background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '4px',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                        </div>
                                        <div style={{ gridColumn: '1 / -1' }}>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Material</label>
                                            <select
                                                value={pipe.material}
                                                onChange={(e) => setPressurePipes(prev => prev.map(p => p.id === id ? { ...p, material: e.target.value as PipeMaterial } : p))}
                                                disabled={isLocked}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px',
                                                    background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    borderLeft: '3px solid var(--accent)', // Highlight
                                                    borderRadius: '4px',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.85rem'
                                                }}
                                            >
                                                <option value="PVC">PVC</option>
                                                <option value="HDPE">HDPE</option>
                                                <option value="Fierro Fundido">Fierro Fundido</option>
                                                <option value="HCV">HCV</option>
                                                <option value="Hormigón">Hormigón</option>
                                                <option value="Otro">Otro</option>
                                            </select>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            // Find connected pump and wet well
                                            const ww = wetWells.find(w => w.id === pipe.startNodeId);
                                            const pump = pumps.find(p => p.id === pipe.startNodeId);

                                            let targetPump = pump;
                                            if (ww) {
                                                targetPump = pumps.find(p => p.wetWellId === ww.id);
                                            }

                                            if (!ww || !targetPump) {
                                                alert('No se detecta bomba o cámara conectada para optimizar diámetro.');
                                                return;
                                            }

                                            const result = optimizePipeDiameter(pipe, targetPump, ww, pressureJunctions);
                                            if (result.success && result.optimizedDiameter) {
                                                setPressurePipes(prev => prev.map(p => p.id === id ? { ...p, diameter: result.optimizedDiameter! } : p));
                                            } else {
                                                alert(result.message);
                                            }
                                        }}
                                        disabled={isLocked}
                                        style={{
                                            background: 'var(--accent)',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '4px',
                                            padding: '8px',
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            width: '100%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '6px',
                                            marginTop: '12px'
                                        }}
                                    >
                                        <Activity size={14} /> OPTIMIZAR DIÁMETRO
                                    </button>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '6px', padding: '0 4px' }}>
                                        Busca diámetro comercial PVC (50-200mm) que cumpla V: 0.6-3m/s y Margen ≥ 15%.
                                    </div>
                                </div>

                                {/* Elevations Section */}
                                <div style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                                        ELEVACIONES (m)
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Inicio (z_start)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={pipe.z_start}
                                                onChange={(e) => setPressurePipes(prev => prev.map(p => p.id === id ? { ...p, z_start: Number(e.target.value) } : p))}
                                                disabled={isLocked}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px',
                                                    background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '4px',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Final (z_end)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={zEndValue}
                                                onChange={(e) => setPressurePipes(prev => prev.map(p => p.id === id ? { ...p, z_end: Number(e.target.value) } : p))}
                                                disabled={isLocked || isZEndLinkedToJunction}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px',
                                                    background: (isLocked || isZEndLinkedToJunction) ? 'var(--locked-bg)' : 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    borderLeft: isZEndLinkedToJunction ? '3px solid var(--warning)' : '1px solid var(--border)',
                                                    borderRadius: '4px',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                            {isZEndLinkedToJunction && (
                                                <div style={{ fontSize: '0.65rem', color: 'var(--warning)', marginTop: '4px' }}>
                                                    Sincronizado con nudo de presión: {endPressureJunction?.name || endPressureJunction?.id}
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ gridColumn: '1 / -1' }}>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Cobertura (cover_m)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={coverValue}
                                                onChange={(e) => setPressurePipes(prev => prev.map(p => p.id === id ? { ...p, cover_m: Number(e.target.value) } : p))}
                                                disabled={isLocked}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px',
                                                    background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '4px',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* TERRAIN PROFILE POINTS */}
                                <div style={{ marginBottom: '16px', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', background: 'var(--surface-elevated)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                            PERFIL DEL TERRENO (INTERMEDIOS)
                                        </div>
                                        <button
                                            onClick={() => {
                                                setPressurePipes(prev => prev.map(p => p.id === id ? {
                                                    ...p,
                                                    profilePoints: [
                                                        ...(p.profilePoints || []),
                                                        {
                                                            id: createProfilePointId(),
                                                            chainage: Math.round(p.length / 2),
                                                            elevation: Number.isFinite(Number(p.z_start_terreno))
                                                                ? Number(p.z_start_terreno)
                                                                : Number(p.z_start || 0)
                                                        }
                                                    ]
                                                } : p));
                                            }}
                                            disabled={isLocked}
                                            style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '4px', padding: '2px 8px', fontSize: '0.7rem', cursor: 'pointer' }}
                                        >
                                            + PUNTO
                                        </button>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {(pipe.profilePoints || []).length === 0 && (
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic', padding: '4px' }}>
                                                Sin puntos intermedios (Perfil Lineal)
                                            </div>
                                        )}
                                        {(pipe.profilePoints || []).map((pt, idx) => {
                                            const pointId = pt.id || `PT-${idx + 1}`;
                                            return (
                                                <div key={pt.id || idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 30px', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                                                    <div style={{ gridColumn: '1 / 4', fontSize: '0.68rem', color: 'var(--warning)', fontWeight: 700 }}>
                                                        {pointId}
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Chainage (m)</label>
                                                        <input
                                                            type="number"
                                                            value={pt.chainage}
                                                            onChange={(e) => {
                                                                const val = Number(e.target.value);
                                                                setPressurePipes(prev => prev.map(p => p.id === id ? {
                                                                    ...p,
                                                                    profilePoints: (p.profilePoints || []).map((point, i) => i === idx ? { ...point, chainage: val } : point)
                                                                } : p));
                                                            }}
                                                            disabled={isLocked}
                                                            style={{ width: '100%', padding: '4px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-primary)' }}
                                                        />
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Cota (m)</label>
                                                        <input
                                                            type="number"
                                                            value={pt.elevation}
                                                            onChange={(e) => {
                                                                const val = Number(e.target.value);
                                                                setPressurePipes(prev => prev.map(p => p.id === id ? {
                                                                    ...p,
                                                                    profilePoints: (p.profilePoints || []).map((point, i) => i === idx ? { ...point, elevation: val } : point)
                                                                } : p));
                                                            }}
                                                            disabled={isLocked}
                                                            style={{ width: '100%', padding: '4px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-primary)' }}
                                                        />
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            setPressurePipes(prev => prev.map(p => p.id === id ? {
                                                                ...p,
                                                                profilePoints: p.profilePoints?.filter((_, i) => i !== idx)
                                                            } : p));
                                                        }}
                                                        disabled={isLocked}
                                                        style={{ background: 'transparent', border: 'none', color: 'var(--error-color)', cursor: 'pointer', padding: '0 4px', marginTop: '14px' }}
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>

                                {/* VENTOSAS EN LÍNEA SECTION */}
                                <div style={{ marginBottom: '16px', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', background: 'var(--accent-soft)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                            VENTOSAS EN LÍNEA
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto', paddingRight: '4px', scrollbarWidth: 'thin' }}>
                                        <div style={{ fontSize: '0.68rem', color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.04em' }}>
                                            SUGERIDAS (GRAFICO IMPULSION)
                                        </div>

                                        {suggestedAirValves.length === 0 && (
                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px 2px' }}>
                                                Ejecuta el análisis para ver ventosas sugeridas de esta tubería.
                                            </div>
                                        )}

                                        {suggestedAirValves.map((rec: any, recIdx: number) => {
                                            const chainage = Number(rec.chainage) || 0;
                                            const elevation = Number(rec.elevation) || 0;
                                            const pressure = Number(rec.pressure) || 0;
                                            const assignedNode = (pipe.inlineNodes || []).find(node =>
                                                node.id === rec.avId || Math.abs(node.chainage - chainage) < 0.05
                                            );
                                            const reasonText = Array.isArray(rec.reasons) && rec.reasons.length > 0
                                                ? rec.reasons.join(' | ')
                                                : (rec.reason || 'Sin detalle hidráulico');

                                            return (
                                                <div key={`suggested-${rec.avId || recIdx}`} style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: '1fr auto',
                                                    gap: '8px',
                                                    alignItems: 'center',
                                                    background: 'var(--surface-elevated)',
                                                    border: `1px solid ${assignedNode ? 'var(--success-border)' : 'var(--border)'}`,
                                                    borderRadius: '6px',
                                                    padding: '6px 8px'
                                                }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                            <span style={{ fontSize: '0.75rem', color: 'var(--warning)', fontWeight: 700 }}>{rec.avId || `AV-${recIdx + 1}`}</span>
                                                            <span style={{ fontSize: '0.65rem', color: 'var(--danger)' }}>{String(rec.type || '').replace(/_/g, ' ')}</span>
                                                            {assignedNode && <span style={{ fontSize: '0.62rem', color: 'var(--success)', fontWeight: 700 }}>ASIGNADA</span>}
                                                        </div>
                                                        <span style={{ fontSize: '0.67rem', color: 'var(--text-primary)' }}>
                                                            Prog: {chainage.toFixed(1)}m | Cota: {elevation.toFixed(2)}m | P: {pressure.toFixed(2)} bar
                                                        </span>
                                                        <span title={reasonText} style={{ fontSize: '0.63rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {reasonText}
                                                        </span>
                                                    </div>

                                                    <button
                                                        onClick={() => {
                                                            if (assignedNode) {
                                                                setEditingObjectId({ id: assignedNode.id, type: 'air_valve' });
                                                                return;
                                                            }
                                                            insertSuggestedAirValve(rec);
                                                        }}
                                                        disabled={isLocked && !assignedNode}
                                                        style={{
                                                            background: assignedNode ? 'var(--success-bg)' : 'var(--accent)',
                                                            color: assignedNode ? 'var(--success)' : 'white',
                                                            border: 'none',
                                                            borderRadius: '4px',
                                                            padding: '4px 8px',
                                                            fontSize: '0.64rem',
                                                            fontWeight: 700,
                                                            cursor: (isLocked && !assignedNode) ? 'not-allowed' : 'pointer',
                                                            opacity: (isLocked && !assignedNode) ? 0.6 : 1,
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                        title={assignedNode ? `Ver ${assignedNode.id}` : `Asignar ${rec.avId || 'ID recomendado'}`}
                                                    >
                                                        {assignedNode ? 'Ver' : 'Asignar ID'}
                                                    </button>
                                                </div>
                                            );
                                        })}

                                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-primary)', fontWeight: 700, letterSpacing: '0.04em' }}>
                                                INSTALADAS
                                            </div>

                                            {(pipe.inlineNodes || []).length === 0 && (
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic', padding: '4px' }}>
                                                    Sin ventosas instaladas
                                                </div>
                                            )}

                                            {(pipe.inlineNodes || []).map((node, idx) => (
                                                <div key={idx} style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    background: 'var(--bg)',
                                                    padding: '6px 10px',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--border)'
                                                }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{node.id}</span>
                                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Prog: {node.chainage.toFixed(1)}m | Cota: {node.elevation.toFixed(2)}m</span>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '4px' }}>
                                                        <button
                                                            onClick={() => setEditingObjectId({ id: node.id, type: 'air_valve' })}
                                                            style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: '4px' }}
                                                            title="Editar Propiedades"
                                                        >
                                                            <Activity size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setPressurePipes(prev => prev.map(p => p.id === id ? {
                                                                    ...p,
                                                                    inlineNodes: p.inlineNodes?.filter((_, i) => i !== idx)
                                                                } : p));
                                                            }}
                                                            disabled={isLocked}
                                                            style={{ background: 'transparent', border: 'none', color: 'var(--error-color)', cursor: 'pointer', padding: '4px' }}
                                                            title="Eliminar"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                                        PRESIÓN NOMINAL
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>PN (bar)</label>
                                        <input
                                            type="number"
                                            step="1"
                                            value={pipe.PN}
                                            onChange={(e) => setPressurePipes(prev => prev.map(p => p.id === id ? { ...p, PN: Number(e.target.value) } : p))}
                                            disabled={isLocked}
                                            placeholder="6, 10, 16..."
                                            style={{
                                                width: '100%',
                                                padding: '6px',
                                                background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '4px',
                                                color: 'var(--text-primary)',
                                                fontSize: '0.85rem'
                                            }}
                                        />
                                    </div>

                                    <div style={{ marginTop: '10px' }}>
                                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Presión mínima admisible (bar)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={pipe.pressureCriteria?.minPressureBar ?? pipe.minPressureBar ?? ''}
                                            onChange={(e) => setPressurePipes(prev => prev.map(p => p.id === id ? {
                                                ...p,
                                                minPressureBar: e.target.value === '' ? undefined : Number(e.target.value),
                                                pressureCriteria: {
                                                    ...(p.pressureCriteria || {}),
                                                    minPressureBar: e.target.value === '' ? undefined : Number(e.target.value)
                                                }
                                            } : p))}
                                            disabled={isLocked}
                                            placeholder="0"
                                            style={{
                                                width: '100%',
                                                padding: '6px',
                                                background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '4px',
                                                color: 'var(--text-primary)',
                                                fontSize: '0.85rem'
                                            }}
                                        />
                                    </div>

                                    {/* Hydraulic Calculation Method */}
                                    <div style={{ marginTop: '16px' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                                            CÁLCULO HIDRÁULICO
                                        </div>
                                        <select
                                            value={pipe.calculationMethod || 'HAZEN_WILLIAMS'}
                                            onChange={(e) => setPressurePipes(prev => prev.map(p => p.id === id ? { ...p, calculationMethod: e.target.value as 'HAZEN_WILLIAMS' | 'DARCY_WEISBACH' } : p))}
                                            disabled={isLocked}
                                            style={{
                                                width: '100%',
                                                padding: '6px',
                                                background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '4px',
                                                color: 'var(--text-primary)',
                                                fontSize: '0.85rem'
                                            }}
                                        >
                                            <option value="HAZEN_WILLIAMS">Hazen-Williams (C)</option>
                                            <option value="DARCY_WEISBACH">Darcy-Weisbach (ε)</option>
                                        </select>
                                    </div>

                                    {/* Hydraulic Coefficients */}
                                    <div style={{ marginTop: '12px' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                                            COEFICIENTES HIDRÁULICOS
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                                            {(pipe.calculationMethod === 'HAZEN_WILLIAMS' || !pipe.calculationMethod) && (
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>C-Hazen</label>
                                                    <input
                                                        type="number"
                                                        step="1"
                                                        value={pipe.C_hazen || 140}
                                                        onChange={(e) => setPressurePipes(prev => prev.map(p => p.id === id ? { ...p, C_hazen: Number(e.target.value) } : p))}
                                                        disabled={isLocked}
                                                        style={{
                                                            width: '100%',
                                                            padding: '6px',
                                                            background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                            border: '1px solid var(--border)',
                                                            borderRadius: '4px',
                                                            color: 'var(--text-primary)',
                                                            fontSize: '0.85rem'
                                                        }}
                                                    />
                                                </div>
                                            )}
                                            {pipe.calculationMethod === 'DARCY_WEISBACH' && (
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Rugosidad Absoluta (mm)</label>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={pipe.roughness || 0.0015}
                                                        onChange={(e) => setPressurePipes(prev => prev.map(p => p.id === id ? { ...p, roughness: Number(e.target.value) } : p))}
                                                        disabled={isLocked}
                                                        style={{
                                                            width: '100%',
                                                            padding: '6px',
                                                            background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                            border: '1px solid var(--border)',
                                                            borderRadius: '4px',
                                                            color: 'var(--text-primary)',
                                                            fontSize: '0.85rem'
                                                        }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Aging Check Section [NEW] */}
                                    <div style={{ marginTop: '16px' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                                            VERIFICACIÓN ENVEJECIMIENTO
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>C-Futuro Mínimo</label>
                                            <input
                                                type="number"
                                                step="1"
                                                value={pipe.agingCheck?.minFutureC || ''}
                                                onChange={(e) => setPressurePipes(prev => prev.map(p => p.id === id ? {
                                                    ...p,
                                                    agingCheck: { ...p.agingCheck, minFutureC: Number(e.target.value) }
                                                } : p))}
                                                disabled={isLocked}
                                                placeholder="110"
                                                style={{
                                                    width: '100%',
                                                    padding: '6px',
                                                    background: 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '4px',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                        </div>
                                    </div>
                                    {/* K Factors (Minor Losses) */}
                                    <div style={{ marginTop: '16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                PÉRDIDAS SINGULARES (K)
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                Total K: {(pipe.kFactors || []).reduce((acc, k) => acc + k.K, 0).toFixed(2)}
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                            <select
                                                id={`k-preset-${id}`}
                                                style={{ flex: 1, padding: '4px', fontSize: '0.8rem', borderRadius: '4px', background: 'var(--bg)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                                            >
                                                <option value="0.9|Codo 90°">Codo 90° (K=0.9)</option>
                                                <option value="0.4|Codo 45°">Codo 45° (K=0.4)</option>
                                                <option value="0.2|Válvula Compuerta">Válvula Compuerta (K=0.2)</option>
                                                <option value="2.5|Válvula Retención">Válvula Retención (K=2.5)</option>
                                                <option value="1.0|Salida Tubería">Salida Tubería (K=1.0)</option>
                                                <option value="0.5|Entrada Tubería">Entrada Tubería (K=0.5)</option>
                                            </select>
                                            <button
                                                onClick={() => {
                                                    const select = document.getElementById(`k-preset-${id}`) as HTMLSelectElement;
                                                    const [val, label] = select.value.split('|');
                                                    setPressurePipes(prev => prev.map(p => p.id === id ? {
                                                        ...p,
                                                        kFactors: [...(p.kFactors || []), { description: label, K: Number(val) }]
                                                    } : p));
                                                }}
                                                disabled={isLocked}
                                                style={{
                                                    background: 'var(--accent)',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    padding: '4px 8px',
                                                    cursor: isLocked ? 'not-allowed' : 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center'
                                                }}
                                            >
                                                <Plus size={14} />
                                            </button>
                                        </div>

                                        <div style={{
                                            background: 'var(--surface-input)',
                                            borderRadius: '4px',
                                            padding: '4px',
                                            maxHeight: '100px',
                                            overflowY: 'auto',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '4px'
                                        }}>
                                            {(pipe.kFactors || []).length === 0 && (
                                                <div style={{ padding: '8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic' }}>
                                                    Sin elementos singulares
                                                </div>
                                            )}
                                            {(pipe.kFactors || []).map((k, idx) => (
                                                <div key={idx} style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    background: 'var(--bg)',
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.8rem'
                                                }}>
                                                    <span style={{ color: 'var(--text-primary)' }}>{k.description}</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{k.K}</span>
                                                        <button
                                                            onClick={() => setPressurePipes(prev => prev.map(p => p.id === id ? {
                                                                ...p,
                                                                kFactors: p.kFactors.filter((_, i) => i !== idx)
                                                            } : p))}
                                                            disabled={isLocked}
                                                            style={{ border: 'none', background: 'transparent', color: 'var(--error-color)', cursor: 'pointer', padding: 0 }}
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </>
                        );
                    })()}

                    {/* PRESSURE JUNCTION PROPERTY EDITOR */}
                    {pressureJunctions?.some(j => j.id === id) && (() => {
                        const junction = pressureJunctions.find(j => j.id === id) as PressureJunction;
                        const incomingPipes = pressurePipes.filter(p => p.endNodeId === id).length;
                        const outgoingPipes = pressurePipes.filter(p => p.startNodeId === id).length;
                        const isFinalPressureNode = incomingPipes > 0 && outgoingPipes === 0;
                        const outletCondition: 'ATMOSPHERIC' | 'PRESSURIZED' = junction.boundaryType === 'FIXED_HEAD'
                            ? 'PRESSURIZED'
                            : 'ATMOSPHERIC';

                        const parseOptionalNumber = (rawValue: string): number | undefined => {
                            const normalized = rawValue.trim();
                            if (normalized === '') return undefined;
                            const parsed = Number(normalized);
                            return Number.isFinite(parsed) ? parsed : undefined;
                        };

                        const toFixedHeadFromPressure = (axisElevation: number, pressureBar?: number): number | undefined => {
                            if (!Number.isFinite(axisElevation)) return undefined;
                            if (pressureBar === undefined || !Number.isFinite(pressureBar)) return undefined;
                            return axisElevation + (pressureBar * 10.1972);
                        };

                        const setOutletCondition = (condition: 'ATMOSPHERIC' | 'PRESSURIZED') => {
                            setPressureJunctions(prev => prev.map(j => {
                                if (j.id !== id) return j;

                                if (condition === 'ATMOSPHERIC') {
                                    return {
                                        ...j,
                                        boundaryType: 'ATMOSPHERIC',
                                        targetPressureBar: undefined,
                                        fixedHead: Number.isFinite(j.elevation) ? j.elevation : undefined
                                    };
                                }

                                const pressureBar = Number.isFinite(j.targetPressureBar ?? Number.NaN)
                                    ? (j.targetPressureBar as number)
                                    : 0;
                                const fixedHead = toFixedHeadFromPressure(j.elevation, pressureBar);

                                return {
                                    ...j,
                                    boundaryType: 'FIXED_HEAD',
                                    targetPressureBar: pressureBar,
                                    fixedHead
                                };
                            }));
                        };

                        const updateAtmosphericLevel = (rawValue: string) => {
                            const level = parseOptionalNumber(rawValue);
                            setPressureJunctions(prev => prev.map(j => j.id === id ? {
                                ...j,
                                boundaryType: 'ATMOSPHERIC',
                                elevation: level ?? 0,
                                fixedHead: level
                            } : j));
                        };

                        const updatePressurizedAxisElevation = (rawValue: string) => {
                            const axisElevation = parseOptionalNumber(rawValue);
                            setPressureJunctions(prev => prev.map(j => {
                                if (j.id !== id) return j;

                                const normalizedAxis = axisElevation ?? 0;
                                const fixedHead = toFixedHeadFromPressure(normalizedAxis, j.targetPressureBar);

                                return {
                                    ...j,
                                    boundaryType: 'FIXED_HEAD',
                                    elevation: normalizedAxis,
                                    fixedHead
                                };
                            }));
                        };

                        const updateTargetPressureBar = (rawValue: string) => {
                            const pressureBar = parseOptionalNumber(rawValue);
                            setPressureJunctions(prev => prev.map(j => j.id === id ? {
                                ...j,
                                boundaryType: 'FIXED_HEAD',
                                targetPressureBar: pressureBar,
                                fixedHead: toFixedHeadFromPressure(j.elevation, pressureBar)
                            } : j));
                        };

                        const inputStyle = {
                            width: '100%',
                            padding: '6px',
                            background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                            border: '1px solid var(--border)',
                            borderRadius: '4px',
                            color: 'var(--text-primary)',
                            fontSize: '0.85rem'
                        };

                        return (
                            <>
                                <div style={{
                                    padding: '12px',
                                    background: 'var(--warning-bg)',
                                    border: '1px solid var(--warning-border)',
                                    borderRadius: '8px',
                                    marginBottom: '12px'
                                }}>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        🔶 NODO DE PRESIÓN
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        Condición de Borde
                                    </div>
                                </div>

                                {/* General Properties */}
                                <div style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                                        PROPIEDADES
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Nombre</label>
                                            <input
                                                type="text"
                                                value={junction.name || ''}
                                                onChange={(e) => setPressureJunctions(prev => prev.map(j => j.id === id ? { ...j, name: e.target.value } : j))}
                                                disabled={isLocked}
                                                style={inputStyle}
                                            />
                                        </div>
                                        {isFinalPressureNode ? (
                                            <>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                                                        Condición de salida
                                                    </label>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                                                            <input
                                                                type="radio"
                                                                name={`junction-outlet-${id}`}
                                                                checked={outletCondition === 'ATMOSPHERIC'}
                                                                onChange={() => setOutletCondition('ATMOSPHERIC')}
                                                                disabled={isLocked}
                                                            />
                                                            A atmósfera (cámara rompe presión)
                                                        </label>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                                                            <input
                                                                type="radio"
                                                                name={`junction-outlet-${id}`}
                                                                checked={outletCondition === 'PRESSURIZED'}
                                                                onChange={() => setOutletCondition('PRESSURIZED')}
                                                                disabled={isLocked}
                                                            />
                                                            Presurizada
                                                        </label>
                                                    </div>
                                                </div>

                                                {outletCondition === 'ATMOSPHERIC' ? (
                                                    <div>
                                                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                                            Cota nivel libre (m)
                                                        </label>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={Number.isFinite(junction.elevation) ? junction.elevation : ''}
                                                            onChange={(e) => updateAtmosphericLevel(e.target.value)}
                                                            disabled={isLocked}
                                                            style={inputStyle}
                                                        />
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div>
                                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                                                Presión objetivo (bar)
                                                            </label>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                value={junction.targetPressureBar ?? ''}
                                                                onChange={(e) => updateTargetPressureBar(e.target.value)}
                                                                disabled={isLocked}
                                                                style={inputStyle}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                                                Cota eje (m)
                                                            </label>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                value={Number.isFinite(junction.elevation) ? junction.elevation : ''}
                                                                onChange={(e) => updatePressurizedAxisElevation(e.target.value)}
                                                                disabled={isLocked}
                                                                style={inputStyle}
                                                            />
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '-4px' }}>
                                                            Carga fija equivalente (Ce): {junction.fixedHead !== undefined ? `${junction.fixedHead.toFixed(2)} m` : '--'}
                                                        </div>
                                                    </>
                                                )}

                                                <div style={{
                                                    background: 'var(--accent-soft)',
                                                    border: '1px solid var(--accent)',
                                                    borderRadius: '6px',
                                                    padding: '8px',
                                                    fontSize: '0.74rem',
                                                    color: 'var(--accent)',
                                                    lineHeight: 1.4
                                                }}>
                                                    Si es a atmósfera: HGL final = cota nivel libre, P = 0 bar.
                                                </div>
                                                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                                                    Regla corta: Rompe presión abierta =&gt; usar nivel libre.
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Tipo de Borde</label>
                                                    <select
                                                        value={junction.boundaryType}
                                                        onChange={(e) => setPressureJunctions(prev => prev.map(j => j.id === id ? { ...j, boundaryType: e.target.value as PressureBoundaryType } : j))}
                                                        disabled={isLocked}
                                                        style={inputStyle}
                                                    >
                                                        <option value="INTERNAL">Interno (Continuidad)</option>
                                                        <option value="ATMOSPHERIC">Atmosférico (Descarga Libre)</option>
                                                        <option value="FIXED_HEAD">Carga Fija (Ce)</option>
                                                        <option value="PRESSURE_BREAK">Cámara Rompe Presión</option>
                                                        <option value="CONNECTION">Conexión a Red</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Elevación (m)</label>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={junction.elevation}
                                                        onChange={(e) => setPressureJunctions(prev => prev.map(j => j.id === id ? { ...j, elevation: Number(e.target.value) } : j))}
                                                        disabled={isLocked}
                                                        style={inputStyle}
                                                    />
                                                </div>

                                                {(junction.boundaryType === 'FIXED_HEAD' || junction.boundaryType === 'PRESSURE_BREAK') && (
                                                    <div>
                                                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                                            {junction.boundaryType === 'FIXED_HEAD' ? 'Carga Fija - Ce (m)' : 'Cota de Vertedero - Ce (m)'}
                                                        </label>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={junction.fixedHead || ''}
                                                            onChange={(e) => setPressureJunctions(prev => prev.map(j => j.id === id ? { ...j, fixedHead: Number(e.target.value) } : j))}
                                                            onFocus={(e) => e.target.select()}
                                                            disabled={isLocked}
                                                            placeholder="Cota del agua"
                                                            style={inputStyle}
                                                        />
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </>
                        );
                    })()}


                    {/* AIR VALVE PROPERTY EDITOR */}
                    {elementType === ('air_valve' as any) && object && (() => {
                        const av = object as unknown as AirValveNode;
                        const updateAV = (updates: Partial<AirValveNode>) => {
                            setPressurePipes(prev => prev.map(p => ({
                                ...p,
                                inlineNodes: p.inlineNodes?.map(n => n.id === av.id ? { ...n, ...updates } : n)
                            })));
                        };

                        return (
                            <>
                                <div style={{
                                    padding: '12px',
                                    background: 'var(--accent-soft)',
                                    border: '1px solid var(--accent)',
                                    borderRadius: '8px',
                                    marginBottom: '12px'
                                }}>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        💨 VENTOSA (AIR VALVE)
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        Elemento en Línea
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <div>
                                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Tipo de Ventosa</label>
                                        <select
                                            value={av.airValveType}
                                            onChange={(e) => updateAV({ airValveType: e.target.value as any })}
                                            disabled={isLocked}
                                            style={{
                                                width: '100%',
                                                padding: '6px',
                                                background: 'var(--bg)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '4px',
                                                color: 'var(--text-primary)',
                                                fontSize: '0.85rem'
                                            }}
                                        >
                                            <option value="SIMPLE">Simple Efecto</option>
                                            <option value="DOBLE">Doble Efecto</option>
                                            <option value="TRIPLE">Triple Efecto</option>
                                        </select>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Orificio (mm)</label>
                                            <input
                                                type="number"
                                                value={av.orificeDiameter || ''}
                                                onChange={(e) => updateAV({ orificeDiameter: Number(e.target.value) })}
                                                disabled={isLocked}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px',
                                                    background: 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '4px',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Presión Nom. (bar)</label>
                                            <input
                                                type="number"
                                                value={av.pressureRating || ''}
                                                onChange={(e) => updateAV({ pressureRating: Number(e.target.value) })}
                                                disabled={isLocked}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px',
                                                    background: 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '4px',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Progresiva (m)</label>
                                        <input
                                            type="number"
                                            value={av.chainage.toFixed(2)}
                                            readOnly
                                            style={{
                                                width: '100%',
                                                padding: '6px',
                                                background: 'var(--surface-input)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '4px',
                                                color: 'var(--text-muted)',
                                                fontSize: '0.85rem'
                                            }}
                                        />
                                    </div>

                                </div>

                                {/* Calculated State */}
                                {av.hydraulicState && (
                                    <div style={{
                                        padding: '8px',
                                        borderRadius: '4px',
                                        background: 'var(--accent-soft)',
                                        border: '1px solid var(--accent)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '8px',
                                        marginTop: '12px'
                                    }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 600 }}>ESTADO HIDRÁULICO</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>Estado: {av.hydraulicState}</div>
                                    </div>
                                )}
                            </>
                        );
                    })()}

                    {/* CHAMBER TYPE/DIMENSIONS — CAD grid rows */}
                    {type === 'chamber' && (
                        <>
                            <div className="prop-row">
                                <div className="prop-row-label">Tipo</div>
                                <div className="prop-row-value">
                                    <select
                                        value={(object as Chamber).chamberType}
                                        onChange={(e) => {
                                            const newType = e.target.value as 'Domiciliaria' | 'Pública';
                                            const defaultDim = newType === 'Domiciliaria' ? '60 cm' : '120 cm';
                                            handleUpdateObject(object.id, type, { chamberType: newType, chamberDimension: defaultDim });
                                        }}
                                        disabled={isLocked}
                                    >
                                        <option value="Domiciliaria">Domiciliaria</option>
                                        <option value="Pública">Pública</option>
                                    </select>
                                </div>
                            </div>
                            <div className="prop-row">
                                <div className="prop-row-label">Dimensión</div>
                                <div className="prop-row-value">
                                    <select
                                        value={(object as Chamber).chamberDimension}
                                        onChange={(e) => handleUpdateObject(object.id, type, { chamberDimension: e.target.value })}
                                        disabled={isLocked}
                                    >
                                        {(object as Chamber).chamberType === 'Domiciliaria' ? (
                                            <>
                                                <option value="60 cm">60 cm</option>
                                                <option value="80 cm">80 cm</option>
                                            </>
                                        ) : (
                                            <>
                                                <option value="120 cm">120 cm</option>
                                                <option value="150 cm">150 cm</option>
                                                <option value="200 cm">200 cm</option>
                                            </>
                                        )}
                                    </select>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Attributes Grid - Hidden for pressure elements */}
                    {
                        !isPressureElement && (
                            <div>
                                {type === 'pipe' && (() => {
                                    const gravityPipe = object as Pipe;
                                    const startType = gravityPipe.startNodeId
                                        ? chambers.find(chamber => chamber.id === gravityPipe.startNodeId)?.chamberType
                                        : undefined;
                                    const endType = gravityPipe.endNodeId
                                        ? chambers.find(chamber => chamber.id === gravityPipe.endNodeId)?.chamberType
                                        : undefined;

                                    // Resolve new normative state
                                    const normativeState = resolveNormativeState({
                                        ...gravityPipe,
                                        startChamberType: startType,
                                        endChamberType: endType
                                    });
                                    
                                    const autoInference = inferNormativeAuto(startType, endType);
                                    const isManual = normativeState.isManual;
                                    const effectiveRegime = normativeState.regime;
                                    const effectiveNormativeRole = normativeState.role;
                                    
                                    // For legacy compatibility in the rest of the file
                                    const effectiveRole = effectiveNormativeRole === 'LATERAL' || effectiveNormativeRole === 'COLECTOR' ? 'COLECTOR_EXTERIOR' : effectiveNormativeRole;
                                    const is1105 = effectiveRegime === 'NCH1105';

                                    const buildNormativeOverride = (regime: NormativeRegime, role: NormativeRole3371 | NormativeRole1105) => ({
                                        normativeRegime: regime,
                                        normativeRole: role,
                                        norma: regime,
                                        role1105: regime === 'NCH1105' ? role : undefined,
                                        role3371: regime === 'NCH3371' ? role : undefined
                                    });

                                    const handleUpdateNormativeState = (regime: NormativeRegime, role: string) => {
                                        if (isLocked) return;
                                        handleUpdateObject(gravityPipe.id, 'pipe', {
                                            gravityRole_manual: role === 'COLECTOR' ? 'COLECTOR'
                                                              : role === 'LATERAL'  ? 'LATERAL'
                                                              : role === 'NACIENTE' ? 'NACIENTE'
                                                              : null,
                                            override: {
                                                ...gravityPipe.override,
                                                enabled: true,
                                                ...buildNormativeOverride(regime, role as NormativeRole3371 | NormativeRole1105),
                                                changedAt: new Date().toISOString()
                                            }
                                        });
                                    };

                                    const handleToggleManualNormative = (enabled: boolean) => {
                                        if (isLocked) return;
                                        if (enabled) {
                                            handleUpdateObject(gravityPipe.id, 'pipe', {
                                                override: {
                                                    ...gravityPipe.override,
                                                    enabled: true,
                                                    ...buildNormativeOverride(effectiveRegime, effectiveNormativeRole),
                                                    changedAt: new Date().toISOString()
                                                }
                                            });
                                        } else {
                                            handleUpdateObject(gravityPipe.id, 'pipe', {
                                                override: {
                                                    ...gravityPipe.override,
                                                    enabled: false
                                                }
                                            });
                                        }
                                    };

                                    

                                    

                                    const effectiveDesignMethod = resolveDesignMethod(gravityPipe, effectiveRole);
                                    const showDesignMethodSelector = effectiveRole === 'DESCARGA_HORIZ' || gravityPipe.designMethod !== undefined;

                                    const effectiveVerificationMethod = resolveDescargaHorizVerificationMethod(gravityPipe);
                                    const showVerificationMethodSelector = effectiveRole === 'DESCARGA_HORIZ';

                                    const handleVerificationMethodChange = (value: DescargaHorizVerificationMethod) => {
                                        if (isLocked) return;
                                        handleUpdateObject(gravityPipe.id, 'pipe', {
                                            verificationMethod: value
                                        });
                                    };

                                    const handleDesignMethodChange = (value: string) => {
                                        if (isLocked) return;
                                        if (value === 'AUTO') {
                                            const { designMethod, ...rest } = gravityPipe as Pipe;
                                            handleUpdateObject(gravityPipe.id, 'pipe', rest);
                                        } else if (value === 'NCH3371_A' || value === 'NCH3371_B') {
                                            handleUpdateObject(gravityPipe.id, 'pipe', {
                                                ...gravityPipe,
                                                designMethod: value as DesignMethod
                                            });
                                        }
                                    };

                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            {/* RESPUESTA NORMATIVA UNIFICADA */}
                                            <div style={{
                                                padding: '12px',
                                                background: 'var(--bg)',
                                                borderRadius: '6px',
                                                border: '1px solid var(--border)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '12px'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>RESOLUCION NORMATIVA</label>
                                                    <span style={{
                                                        fontSize: '0.65rem',
                                                        padding: '3px 8px',
                                                        borderRadius: '6px',
                                                        background: isManual ? 'var(--warning)' : 'var(--accent)',
                                                        color: isManual ? 'var(--text-primary)' : 'var(--text-primary)',
                                                        fontWeight: 700
                                                    }}>
                                                        {isManual ? 'MANUAL' : 'AUTO'}
                                                    </span>
                                                </div>

                                                {/* Visualizacion del estado actual detectado por AUTO */}
                                                {!isManual && (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'var(--hover-bg)', padding: '8px', borderRadius: '4px' }}>
                                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>AUTO detectado:</div>
                                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                                                            {autoInference.regime} / {autoInference.role}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Switch para seleccion manual */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isManual}
                                                        onChange={(e) => handleToggleManualNormative(e.target.checked)}
                                                        disabled={isLocked}
                                                        style={{ width: '16px', height: '16px', cursor: isLocked ? 'not-allowed' : 'pointer', accentColor: 'var(--accent)' }}
                                                    />
                                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                                                        Usar selección manual
                                                    </label>
                                                </div>

                                                {/* Controles de seleccion manual */}
                                                {isManual && (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--warning-bg)', padding: '10px', borderRadius: '4px', border: '1px solid var(--warning-border)' }}>
                                                        <div>
                                                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Norma:</label>
                                                            <select
                                                                value={effectiveRegime}
                                                                disabled={isLocked}
                                                                onChange={(e) => handleUpdateNormativeState(e.target.value as NormativeRegime, e.target.value === 'NCH1105' ? 'LATERAL' : 'DESCARGA_HORIZ')}
                                                                style={{
                                                                    width: '100%', padding: '6px', background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                                    border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '0.8rem'
                                                                }}
                                                            >
                                                                <option value="NCH3371">NCH3371</option>
                                                                <option value="NCH1105">NCH1105</option>
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Rol ({effectiveRegime}):</label>
                                                            <select
                                                                value={effectiveNormativeRole}
                                                                disabled={isLocked}
                                                                onChange={(e) => handleUpdateNormativeState(effectiveRegime, e.target.value)}
                                                                style={{
                                                                    width: '100%', padding: '6px', background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                                    border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '0.8rem'
                                                                }}
                                                            >
                                                                {effectiveRegime === 'NCH3371' ? (
                                                                    <>
                                                                        <option value="DESCARGA_HORIZ">DESCARGA_HORIZ</option>
                                                                        <option value="INTERIOR_RAMAL">INTERIOR_RAMAL</option>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <option value="LATERAL">LATERAL</option>
                                                                        <option value="COLECTOR">COLECTOR</option>
                                                                        <option value="CAÑERIA">CAÑERIA</option>
                                                                    </>
                                                                )}
                                                            </select>
                                                        </div>
                                                        <input
                                                            type="text"
                                                            placeholder="Razón del override (opcional)"
                                                            value={gravityPipe.override?.reason || ''}
                                                            onChange={(e) => handleUpdateObject(gravityPipe.id, 'pipe', {
                                                                override: {
                                                                    ...gravityPipe.override,
                                                                    reason: e.target.value
                                                                }
                                                            })}
                                                            disabled={isLocked}
                                                            style={{
                                                                width: '100%', padding: '6px', background: isLocked ? 'var(--locked-bg)' : 'var(--bg)',
                                                                border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '0.75rem', marginTop: '4px'
                                                            }}
                                                        />
                                                    </div>
                                                )}

                                                {/* Detalle del método de aplicación */}
                                                <div style={{ padding: '8px', background: 'var(--hover-bg)', borderRadius: '4px', border: '1px solid var(--border)' }}>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                        Método aplicable: <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                            {effectiveNormativeRole === 'DESCARGA_HORIZ'
                                                                ? DESCARGA_HORIZ_VERIFICATION_METHOD_LABELS[effectiveVerificationMethod]
                                                                : (effectiveDesignMethod ? getDesignMethodLabel(effectiveDesignMethod) : PIPE_ROLE_METHOD_LABELS[effectiveRole])}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* SELECTOR DE MÉTODO DE VERIFICACIÓN PARA DESCARGA_HORIZ */}
                                                {showVerificationMethodSelector && (
                                                    <div style={{ marginTop: '4px', padding: '8px', background: 'var(--accent-soft)', borderRadius: '6px', border: '1px solid var(--accent)' }}>
                                                        <div style={{ fontSize: '0.68rem', color: 'var(--accent)', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                            MÉTODO DE VERIFICACIÓN ESPECIAL
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                            {DESCARGA_HORIZ_VERIFICATION_METHOD_OPTIONS.map(method => (
                                                                <label key={method} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', fontSize: '0.8rem' }}>
                                                                    <input
                                                                        type="radio"
                                                                        name={`verification-method-${gravityPipe.id}`}
                                                                        checked={effectiveVerificationMethod === method}
                                                                        onChange={() => handleVerificationMethodChange(method)}
                                                                        disabled={isLocked}
                                                                        style={{ accentColor: method === 'A3_TABLA' ? 'var(--success)' : 'var(--warning)', marginTop: '2px' }}
                                                                    />
                                                                    <span>
                                                                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                                                                            {DESCARGA_HORIZ_VERIFICATION_METHOD_LABELS[method]}
                                                                        </span>
                                                                        {method === 'A3_TABLA' && (
                                                                            <span style={{ display: 'block', color: 'var(--success)', fontSize: '0.7rem', marginTop: '2px' }}>
                                                                                Por defecto • No requiere Q
                                                                            </span>
                                                                        )}
                                                                        {method === 'B25_MANNING' && (
                                                                            <span style={{ display: 'block', color: 'var(--warning)', fontSize: '0.7rem', marginTop: '2px' }}>
                                                                                Requiere Q de diseño (qwwTransportado)
                                                                            </span>
                                                                        )}
                                                                    </span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                        {effectiveVerificationMethod === 'B25_MANNING' && (!gravityPipe.qwwTransportado || Number(gravityPipe.qwwTransportado.value) <= 0) && (
                                                            <div style={{ marginTop: '8px', padding: '6px 8px', background: 'var(--warning-bg)', borderRadius: '4px', border: '1px solid var(--warning-border)', fontSize: '0.72rem', color: 'var(--warning)' }}>
                                                                <span style={{ fontWeight: 600 }}>Atención:</span> El método Manning requiere Q de diseño. Si no hay Q, el tramo será "No evaluable".
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* MÉTODO DE DIMENSIONAMIENTO - Solo para COLECTOR */}
                                            {effectiveRole === 'COLECTOR_EXTERIOR' && (() => {
                                                const sizingMode = gravityPipe.designOptions?.collectorSizingMode || 'UEH_Qww';
                                                const hydraulics = gravityPipe.hydraulics;
                                                const autoAny = gravityPipe.auto as any;
                                                const qDesignHydraulics = Number(hydraulics?.Q_design_Lps);
                                                const qDesignAuto = Number(autoAny?.Q_design_Lps_acc);
                                                let qDesign = Number.isFinite(qDesignHydraulics)
                                                    ? qDesignHydraulics
                                                    : (Number.isFinite(qDesignAuto) ? qDesignAuto : Number(gravityPipe.Q_design_Lps || 0));
                                                const methodQ = hydraulics?.methodQ || 'UEH';
                                                let flowMethodNCh1105 = hydraulics?.flowMethodNCh1105 ?? autoAny?.flowMethodNCh1105 ?? gravityPipe.flowMethodNCh1105 ?? null;
                                                const qww_Lps = Number(gravityPipe.qwwTransportado?.value || 0);
                                                const qContinuous_Lps = Number(gravityPipe.qContinuous?.value || 0);
                                                const qwwInfo = qContinuous_Lps > 0 ? qContinuous_Lps : qww_Lps;

                                                const P_total = Number(hydraulics?.inputs?.P_total ?? (settings.hasPopulation ? settings.populationTotal : 0));
                                                let P_edge = Number(hydraulics?.inputs?.P_edge ?? autoAny?.P_edge ?? gravityPipe.P_tributaria ?? 0);
                                                const UEH_upstream = Number(hydraulics?.inputs?.UEH_upstream ?? gravityPipe.UEH_upstream ?? gravityPipe.uehTransportadas?.value ?? 0);
                                                const UEH_total = Number(hydraulics?.inputs?.UEH_total ?? chambers.reduce((sum, c) => sum + Number(c.uehPropias?.value || 0), 0));

                                                const D_default = Number(hydraulics?.inputs?.D !== undefined ? hydraulics.inputs.D : (settings.D_L_per_hab_day || 150));
                                                const R_default = Number(hydraulics?.inputs?.R !== undefined ? hydraulics.inputs.R : (settings.R_recovery || 0.8));
                                                const C_default = Number(hydraulics?.inputs?.C !== undefined ? hydraulics.inputs.C : (settings.C_capacity || 1.0));
                                                let Qmd_Lps = Number(hydraulics?.inputs?.QmdAS_Lps ?? autoAny?.Qmd_Lps ?? gravityPipe.Qmed_Lps ?? 0);
                                                let M_harmon = Number(hydraulics?.inputs?.M_harmon ?? autoAny?.M_harmon ?? gravityPipe.M_harmon ?? 0);
                                                const N_casas = Number(hydraulics?.inputs?.N_casas ?? 0);
                                                const habPorCasaUsado = Number(hydraulics?.inputs?.habPorCasaUsado ?? hydraulics?.inputs?.habPorCasa ?? settings.nch1105?.habPorCasa ?? 5);
                                                const peakReason = hydraulics?.inputs?.peakReason;
                                                const peakNote = hydraulics?.inputs?.peakNote;
                                                const peakBlocked = Boolean(hydraulics?.inputs?.peakBlocked);
                                                const peakMissingHabPorCasa = Boolean(hydraulics?.inputs?.peakMissingHabPorCasa);
                                                const peakReasonLabel = peakReason === 'FORZADO_HARMON'
                                                    ? 'FORZADO (Harmon)'
                                                    : peakReason === 'ESTRICTO'
                                                        ? 'ESTRICTO NCh1105'
                                                        : 'AUTO';

                                                const hasWeightedErrors = sizingMode === 'POBLACION_PONDERADA_UEH' && (!P_total || P_total <= 0 || !UEH_total || UEH_total <= 0 || !UEH_upstream || UEH_upstream <= 0);

                                                const handleSizingModeChange = (mode: CollectorSizingMode) => {
                                                    if (isLocked) return;
                                                    handleUpdateObject(gravityPipe.id, 'pipe', {
                                                        designOptions: {
                                                            ...gravityPipe.designOptions,
                                                            collectorSizingMode: mode
                                                        }
                                                    });
                                                };

                                                const handlePopulationParamChange = (param: 'P' | 'D' | 'R' | 'C', value: number) => {
                                                    if (isLocked) return;
                                                    setSettings(prev => ({
                                                        ...prev,
                                                        hasPopulation: true,
                                                        populationTotal: param === 'P' ? Math.max(0, value) : prev.populationTotal,
                                                        D_L_per_hab_day: param === 'D' ? Math.max(0, value) : prev.D_L_per_hab_day,
                                                        R_recovery: param === 'R' ? Math.max(0, value) : prev.R_recovery,
                                                        C_capacity: param === 'C' ? Math.max(0, value) : prev.C_capacity
                                                    }));
                                                };

                                                const methodBadge = flowMethodNCh1105 === 'BSCE'
                                                        ? 'BSCE'
                                                        : flowMethodNCh1105 === 'INTERPOLACION'
                                                            ? 'Interpolación'
                                                            : flowMethodNCh1105 === 'HARMON'
                                                                ? 'Harmon'
                                                                : methodQ === 'TABLA'
                                                                    ? 'BSCE'
                                                                    : methodQ === 'INTERPOLACION'
                                                                        ? 'Interpolación'
                                                                        : methodQ === 'HARMON'
                                                                            ? 'Harmon'
                                                                            : sizingMode === 'UEH_Qww'
                                                                                ? 'UEH'
                                                                                : '—';

                                                return (
                                                    <div style={{
                                                        padding: '8px',
                                                        background: 'var(--accent-soft)',
                                                        borderRadius: '6px',
                                                        border: '1px solid var(--accent)',
                                                        marginTop: '8px'
                                                    }}>
                                                        <div style={{ fontSize: '0.68rem', color: 'var(--accent)', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                            MÉTODO DE DIMENSIONAMIENTO
                                                        </div>

                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                            <label
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '7px',
                                                                    cursor: (settings.projectType === 'Público' && effectiveRole === 'COLECTOR_EXTERIOR') ? 'not-allowed' : 'pointer',
                                                                    fontSize: '0.76rem',
                                                                    minHeight: '26px',
                                                                    opacity: (settings.projectType === 'Público' && effectiveRole === 'COLECTOR_EXTERIOR') ? 0.5 : 1
                                                                }}
                                                                title={settings.projectType === 'Público' ? 'No permitido en Proyectos Públicos' : ''}
                                                            >
                                                                <input
                                                                    type="radio"
                                                                    name={`sizing-mode-${id}`}
                                                                    checked={sizingMode === 'UEH_Qww'}
                                                                    onChange={() => handleSizingModeChange('UEH_Qww')}
                                                                    disabled={isLocked || (settings.projectType === 'Público' && effectiveRole === 'COLECTOR_EXTERIOR')}
                                                                    style={{ accentColor: 'var(--accent)', width: '15px', height: '15px' }}
                                                                />
                                                                <span style={{ color: 'var(--text-primary)' }}>UEH (Qww acumulado)</span>
                                                            </label>

                                                            <label
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '7px',
                                                                    cursor: settings.projectType === 'Domiciliario' ? 'not-allowed' : 'pointer',
                                                                    fontSize: '0.76rem',
                                                                    minHeight: '26px',
                                                                    opacity: settings.projectType === 'Domiciliario' ? 0.5 : 1
                                                                }}
                                                                title={settings.projectType === 'Domiciliario' ? 'No permitido en Proyectos Domiciliarios' : ''}
                                                            >
                                                                <input
                                                                    type="radio"
                                                                    name={`sizing-mode-${id}`}
                                                                    checked={sizingMode === 'POBLACION_NCH1105'}
                                                                    onChange={() => handleSizingModeChange('POBLACION_NCH1105')}
                                                                    disabled={isLocked || settings.projectType === 'Domiciliario'}
                                                                    style={{ accentColor: 'var(--warning)', width: '15px', height: '15px' }}
                                                                />
                                                                <span style={{ color: 'var(--text-primary)' }}>Población (NCh1105)</span>
                                                            </label>

                                                            <label
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '7px',
                                                                    cursor: settings.projectType === 'Domiciliario' ? 'not-allowed' : 'pointer',
                                                                    fontSize: '0.76rem',
                                                                    minHeight: '26px',
                                                                    opacity: settings.projectType === 'Domiciliario' ? 0.5 : 1
                                                                }}
                                                                title={settings.projectType === 'Domiciliario' ? 'No permitido en Proyectos Domiciliarios' : ''}
                                                            >
                                                                <input
                                                                    type="radio"
                                                                    name={`sizing-mode-${id}`}
                                                                    checked={sizingMode === 'POBLACION_PONDERADA_UEH'}
                                                                    onChange={() => handleSizingModeChange('POBLACION_PONDERADA_UEH')}
                                                                    disabled={isLocked || settings.projectType === 'Domiciliario'}
                                                                    style={{ accentColor: 'var(--success)', width: '15px', height: '15px' }}
                                                                />
                                                                <span style={{ color: 'var(--text-primary)' }}>Población ponderada desde UEH</span>
                                                            </label>
                                                        </div>

                                                        <div style={{ marginTop: '7px', padding: '5px 8px', borderRadius: '4px', background: 'var(--success-soft)', border: '1px solid var(--success)', fontSize: '0.78rem' }}>
                                                            <span style={{ color: 'var(--text-muted)' }}>Q diseño:</span>{' '}
                                                            <span style={{ color: 'var(--success)', fontWeight: 700 }}>{qDesign.toFixed(2)} L/s</span>
                                                            {sizingMode === 'UEH_Qww' && (
                                                                <span style={{ color: 'var(--success)' }}> · UEH</span>
                                                            )}
                                                        </div>

                                                        {sizingMode === 'UEH_Qww' && (
                                                            <div style={{ marginTop: '6px', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                                                Qww acumulado: {qwwInfo > 0 ? `${qwwInfo.toFixed(3)} L/s` : '0.000 L/s'}
                                                            </div>
                                                        )}

                                                        {sizingMode === 'POBLACION_NCH1105' && (
                                                            <div style={{ marginTop: '7px' }}>
                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                                                    <div>
                                                                        <label style={{ fontSize: '0.64rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>P total</label>
                                                                        <input type="number" value={P_total} onChange={(e) => handlePopulationParamChange('P', Number(e.target.value))} disabled={isLocked} style={{ width: '100%', padding: '3px 6px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '0.74rem', background: 'var(--bg)', color: 'var(--text-primary)' }} />
                                                                    </div>
                                                                    <div>
                                                                        <label style={{ fontSize: '0.64rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>D (L/hab/d)</label>
                                                                        <input type="number" value={D_default} onChange={(e) => handlePopulationParamChange('D', Number(e.target.value))} disabled={isLocked} style={{ width: '100%', padding: '3px 6px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '0.74rem', background: 'var(--bg)', color: 'var(--text-primary)' }} />
                                                                    </div>
                                                                    <div>
                                                                        <label style={{ fontSize: '0.64rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>R</label>
                                                                        <input type="number" step="0.01" value={R_default} onChange={(e) => handlePopulationParamChange('R', Number(e.target.value))} disabled={isLocked} style={{ width: '100%', padding: '3px 6px', borderRadius: '4px', border: R_default > 1 ? '1px solid var(--warning)' : '1px solid var(--border)', fontSize: '0.74rem', background: R_default > 1 ? 'var(--warning-bg)' : 'var(--bg)', color: 'var(--text-primary)' }} />
                                                                    </div>
                                                                    <div>
                                                                        <label style={{ fontSize: '0.64rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>C</label>
                                                                        <input type="number" step="0.01" value={C_default} onChange={(e) => handlePopulationParamChange('C', Number(e.target.value))} disabled={isLocked} style={{ width: '100%', padding: '3px 6px', borderRadius: '4px', border: C_default < 1 ? '1px solid var(--warning)' : '1px solid var(--border)', fontSize: '0.74rem', background: C_default < 1 ? 'var(--warning-bg)' : 'var(--bg)', color: 'var(--text-primary)' }} />
                                                                    </div>
                                                                </div>
                                                                <div style={{ marginTop: '5px', fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                                                                    P_edge: {P_edge.toFixed(0)} hab · QmdAS: {Qmd_Lps.toFixed(3)} L/s · M: {M_harmon > 0 ? M_harmon.toFixed(3) : '—'}
                                                                </div>
                                                                {N_casas > 0 && (
                                                                    <div style={{ marginTop: '4px', fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                                                                        BSCE: {N_casas.toFixed(0)} viv eq
                                                                    </div>
                                                                )}
                                                                {flowMethodNCh1105 === 'BSCE' && (
                                                                    <div style={{ marginTop: '4px', fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                                                                        Hab/casa usado: {habPorCasaUsado.toFixed(2)}
                                                                    </div>
                                                                )}
                                                                <div style={{ marginTop: '4px', fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                                                                    Método punta aplicado: {methodBadge} · Motivo: {peakReasonLabel}{peakMissingHabPorCasa ? ' (sin hab/casa)' : ''}
                                                                </div>
                                                                {peakNote && (
                                                                    <div style={{ marginTop: '4px', fontSize: '0.64rem', color: peakBlocked ? 'var(--danger)' : 'var(--text-muted)' }}>
                                                                        {peakNote}
                                                                    </div>
                                                                )}
                                                                {peakMissingHabPorCasa && (
                                                                    <div style={{ marginTop: '4px', fontSize: '0.66rem', color: 'var(--warning)', fontWeight: 600 }}>
                                                                        ⚠ Sin hab/casa explícito: BSCE usa fallback 5 hab/casa.
                                                                    </div>
                                                                )}
                                                                <div style={{ marginTop: '4px', fontSize: '0.64rem', color: 'var(--success)' }}>
                                                                    Qmaxh: {qDesign.toFixed(3)} L/s
                                                                </div>
                                                            </div>
                                                        )}

                                                        {sizingMode === 'POBLACION_PONDERADA_UEH' && (
                                                            <div style={{ marginTop: '7px' }}>
                                                                {hasWeightedErrors && (
                                                                    <div style={{ marginBottom: '6px', padding: '6px', background: 'var(--error-bg)', borderRadius: '4px', border: '1px solid var(--error-border)' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--danger)', fontSize: '0.68rem' }}>
                                                                            <AlertCircle size={13} />
                                                                            <span>Configuración incompleta</span>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                                                                    <div>P_total: <strong style={{ color: 'var(--text-primary)' }}>{P_total > 0 ? `${P_total.toFixed(0)} hab` : '0 hab'}</strong></div>
                                                                    <div>P_tributaria (P_edge): <strong style={{ color: 'var(--success)' }}>{P_edge > 0 ? `${P_edge.toFixed(0)} hab` : '0 hab'}</strong></div>
                                                                    <div>UEH_total: <strong style={{ color: 'var(--text-primary)' }}>{UEH_total.toFixed(0)}</strong></div>
                                                                    <div>UEH_upstream: <strong style={{ color: 'var(--text-primary)' }}>{UEH_upstream.toFixed(0)}</strong></div>
                                                                </div>
                                                                <div style={{ marginTop: '5px', fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                                                                    P_edge: {P_edge.toFixed(0)} hab · D={D_default} · R={R_default} · C={C_default} · QmdAS={Qmd_Lps.toFixed(3)} L/s
                                                                </div>
                                                                <div style={{ marginTop: '4px', fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                                                                    Método punta aplicado: {methodBadge} · Motivo: {peakReasonLabel}{peakMissingHabPorCasa ? ' (sin hab/casa)' : ''}
                                                                </div>
                                                                {N_casas > 0 && (
                                                                    <div style={{ marginTop: '4px', fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                                                                        BSCE: {N_casas.toFixed(0)} viv eq
                                                                    </div>
                                                                )}
                                                                {flowMethodNCh1105 === 'BSCE' && (
                                                                    <div style={{ marginTop: '4px', fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                                                                        Hab/casa usado: {habPorCasaUsado.toFixed(2)}
                                                                    </div>
                                                                )}
                                                                {peakNote && (
                                                                    <div style={{ marginTop: '4px', fontSize: '0.64rem', color: peakBlocked ? 'var(--danger)' : 'var(--text-muted)' }}>
                                                                        {peakNote}
                                                                    </div>
                                                                )}
                                                                {peakMissingHabPorCasa && (
                                                                    <div style={{ marginTop: '4px', fontSize: '0.66rem', color: 'var(--warning)', fontWeight: 600 }}>
                                                                        ⚠ Sin hab/casa explícito: BSCE usa fallback 5 hab/casa.
                                                                    </div>
                                                                )}
                                                                <div style={{ marginTop: '4px', fontSize: '0.64rem', color: 'var(--success)' }}>
                                                                    Qmaxh: {qDesign.toFixed(3)} L/s
                                                                </div>
                                                            </div>
                                                        )}

                                                        <details style={{ marginTop: '7px' }}>
                                                            <summary style={{ fontSize: '0.66rem', color: 'var(--accent)', cursor: 'pointer' }}>Ver fórmula</summary>
                                                            <div style={{ marginTop: '4px', padding: '6px', background: 'var(--accent-soft)', borderRadius: '4px', fontSize: '0.64rem', color: 'var(--accent)' }}>
                                                                Harmon (NCh1105): M = 1 + 14 / (4 + sqrt(P/1000))<br />
                                                                QmdAS = (P * D * R * C) / 86400<br />
                                                                P &lt; 100: tabla BSCE · 100 a 1000: interpolación · P &gt; 1000: Harmon.<br />
                                                                Si no hay hab/casa, BSCE usa fallback explícito de 5 hab/casa.
                                                            </div>
                                                        </details>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    );
                                })()}


                                {attributes.map((attr: any) => {
                                    const field = attr.key as string;
                                    let rawVal = (object as any)[field];
                                    let valObj: AttributeValue = (rawVal && typeof rawVal === 'object' && 'value' in rawVal)
                                        ? rawVal
                                        : { value: Number(rawVal) || 0, origin: (field === 'populationLocal' ? 'manual' : 'calculated') };

                                    if (type === 'pipe' && field === 'qwwTransportado') {
                                        const pipe = object as Pipe;
                                        const qMedio = Number(
                                            pipe.hydraulics?.inputs?.QmdAS_Lps
                                            ?? pipe.Qmed_Lps
                                            ?? pipe.qwwTransportado?.value
                                            ?? 0
                                        );
                                        valObj = { value: Number.isFinite(qMedio) ? qMedio : 0, origin: 'calculated' };
                                    }

                                    if (type === 'pipe' && field === 'qmaxHorarioTramo') {
                                        const pipe = object as Pipe;
                                        const qMaximo = Number(
                                            pipe.hydraulics?.Q_design_Lps
                                            ?? pipe.Qmax_Lps
                                            ?? pipe.qinTransportado?.value
                                            ?? 0
                                        );
                                        valObj = { value: Number.isFinite(qMaximo) ? qMaximo : 0, origin: 'calculated' };
                                    }

                                    const pipeForField = type === 'pipe' ? object as Pipe : null;
                                    const isSlopeLocked = !!(pipeForField && (typeof pipeForField.slopeLocked === 'boolean'
                                        ? pipeForField.slopeLocked
                                        : pipeForField.isSlopeManual));
                                    const isLengthAuto = !!(pipeForField && field === 'length' && resolvePipeLengthMode(pipeForField) === 'auto');

                                    // Special logic for manual slope
                                    const isManualSlopeActive = type === 'pipe' && field === 'slope' && isSlopeLocked;
                                    const targetField = isManualSlopeActive ? 'manualSlope' : field;
                                    if (isManualSlopeActive && (object as Pipe).manualSlope) {
                                        valObj = (object as Pipe).manualSlope!;
                                    }

                                    const isCalculated = (valObj?.origin === 'calculated' && !(type === 'pipe' && field === 'length')) || isLengthAuto;
                                    let isReadOnly = isCalculated;

                                    // Force read-only fields
                                    if (type === 'chamber' && ['Cre', 'CRS', 'uehAcumuladas', 'qwwPropio', 'qwwAcumulado', 'qinAcumulado', 'P_acum'].includes(String(field))) isReadOnly = true;
                                    if (type === 'pipe' && ['uehTransportadas', 'qwwTransportado', 'qinTransportado', 'qmaxHorarioTramo', 'P_edge'].includes(String(field))) isReadOnly = true;

                                    // Special blocking logic for UEH Propias
                                    if (field === 'uehPropias') {
                                        const chamber = object as Chamber;
                                        // Block manual input if set via artifact calculator
                                        if (chamber.uehInputMethod === 'artifact') {
                                            isReadOnly = true;
                                        }
                                    }

                                    // Qin is always editable now (no INTERMITTENT mode restriction)

                                    // Exceptions
                                    if (field === 'H' || field === 'slope' || field === 'length') isReadOnly = false;
                                    if (field === 'delta' && (object as Chamber).deltaMode === 'manual') isReadOnly = false;

                                    // Validators
                                    let warning: string | null = null;
                                    const recommendations: string[] = [];

                                    if (type === 'pipe' && field === 'slope') {
                                        const pipeRole = resolveEffectivePipeRole(object as Pipe);
                                        const alerts = getPipeNormativeAlerts(settings.projectType, pipeRole, Number((object as Pipe).diameter.value), Number(valObj.value));
                                        alerts.forEach(a => {
                                            if (a.type === 'warning' && !warning) warning = a.message;
                                            if (a.type === 'recommendation') recommendations.push(a.message);
                                        });

                                        // Domiciliary validation for smaller pipes
                                        if (settings.projectType === 'Domiciliario' && pipeRole !== 'COLECTOR_EXTERIOR' && Number((object as Pipe).diameter.value) <= 160) {
                                            const domVal = validateDomiciliaryPipe(settings.projectType, Number((object as Pipe).diameter.value), Number((object as Pipe).slope.value), Number((object as Pipe).uehTransportadas.value));
                                            if (!domVal.isValid) domVal.errors.forEach(e => { if (!warning) warning = e; else recommendations.push(e); });
                                        }
                                    }

                                    // Render Field
                                    const POP_KEYS = new Set(['populationLocal', 'P_acum', 'P_edge', 'p_hab']);
                                    const CAUDAL_KEYS = new Set(['uehPropias','uehAcumuladas','qwwPropio','qwwAcumulado','Qin','qinAcumulado','uehTransportadas','qwwTransportado','qmaxHorarioTramo']);
                                    const GEOM_KEYS = new Set(['CT','H','delta','Cre','CRS','material','diameter','length','slope']);
                                    // Insert section headers at the right spot
                                    const isFirstPop = POP_KEYS.has(field) && !attributes.slice(0, attributes.indexOf(attr)).some((a: any) => POP_KEYS.has(a.key));
                                    const isFirstCaudal = CAUDAL_KEYS.has(field) && !attributes.slice(0, attributes.indexOf(attr)).some((a: any) => CAUDAL_KEYS.has(a.key));
                                    const isFirstGeom = GEOM_KEYS.has(field) && !attributes.slice(0, attributes.indexOf(attr)).some((a: any) => GEOM_KEYS.has(a.key));
                                    return (
                                        <React.Fragment key={attr.key}>
                                            {isFirstGeom && <div className="prop-section-header">Geometría</div>}
                                            {isFirstPop && <div className="prop-section-header">Población</div>}
                                            {isFirstCaudal && <div className="prop-section-header">Caudales</div>}
                                            <div className="prop-row">
                                                <div className="prop-row-label">{attr.label}</div>
                                                <div className={`prop-row-value${isReadOnly ? ' readonly' : ''}`}>
                                                    {field === 'material' ? (
                                                        <>
                                                            <select
                                                                value={valObj?.value || ''}
                                                                disabled={isLocked || isReadOnly}
                                                                onChange={(e) => handleUpdateObject(object.id, type, { material: { ...valObj, value: e.target.value, origin: valObj?.origin || 'manual' } })}
                                                                className={warning ? 'input-error' : ''}
                                                            >
                                                                <option value="PVC">PVC</option>
                                                                <option value="HDPE_LISO">HDPE Liso</option>
                                                                <option value="HDPE_CORRUGADO">HDPE Corrugado</option>
                                                                <option value="HORMIGON_HCV">Hormigón (HCV)</option>
                                                                <option value="Fierro Fundido">Fierro Fundido</option>
                                                                <option value="Otro">Otro</option>
                                                            </select>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <PropertyInput
                                                                isNumber={true}
                                                                value={valObj?.value}
                                                                disabled={isLocked || isReadOnly}
                                                                onChange={(val) => {
                                                                    const forceManualLength = field === 'length' && type === 'pipe';
                                                                    const needsManualSwitch = (field === 'H' || field === 'slope' || field === 'length') && (valObj?.origin === 'calculated');
                                                                    const newOrigin = forceManualLength ? 'manual' : (needsManualSwitch ? 'manual' : valObj.origin);

                                                                    if (field === 'H' && type === 'chamber') {
                                                                        handleUpdateObject(object.id, type, {
                                                                            H: { value: val, origin: 'manual' },
                                                                            heightLocked: true
                                                                        });
                                                                    } else if (field === 'slope' && type === 'pipe') {
                                                                        handleUpdateObject(object.id, type, {
                                                                            slopeLocked: true,
                                                                            isSlopeManual: true,
                                                                            manualSlope: { value: val, origin: 'manual' }
                                                                        });
                                                                    } else if (field === 'length' && type === 'pipe') {
                                                                        handleUpdateObject(object.id, type, buildManualLengthUpdate((object as Pipe).length, Number(val)));
                                                                    } else if (field === 'uehPropias' && type === 'chamber') {
                                                                        const inputMethod = Number(val) === 0 ? undefined : 'manual';
                                                                        handleUpdateObject(object.id, type, {
                                                                            uehPropias: { value: val, origin: 'manual' },
                                                                            uehInputMethod: inputMethod
                                                                        });
                                                                    } else if (field === 'populationLocal' && type === 'chamber') {
                                                                        handleUpdateObject(object.id, type, { populationLocal: Number(val) });
                                                                    } else {
                                                                        handleUpdateObject(object.id, type, { [targetField]: { ...valObj, value: val, origin: newOrigin } });
                                                                    }
                                                                }}
                                                                className={warning ? 'input-error' : ''}
                                                                style={{}}
                                                            />
                                                            {attr.unit && <span className="prop-unit">{attr.unit}</span>}
                                                            {isCalculated && <span className="prop-auto-badge">AUTO</span>}
                                                        </>
                                                    )}

                                                    {/* Artifact Button + View Button for uehPropias */}
                                                    {field === 'uehPropias' && (() => {
                                                        const chamber = object as Chamber;
                                                        const hasFixtures = (chamber.fixtureLoads?.length ?? 0) > 0;
                                                        const isEditDisabled = isLocked ||
                                                            (chamber.uehInputMethod === 'manual' && Number(chamber.uehPropias.value) > 0);
                                                        return (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'stretch', marginLeft: '2px' }}>
                                                                {hasFixtures && (
                                                                    <button
                                                                        onClick={() => { setViewerTargetId(object.id); setIsViewerOpen(true); }}
                                                                        title="Ver artefactos"
                                                                        style={{ padding: '1px 5px', background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: '2px', color: 'var(--success)', fontSize: '9px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                                                    >
                                                                        <Eye size={10} />
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={() => { setCalculatorTargetId(object.id); setIsCalculatorOpen(true); }}
                                                                    disabled={isEditDisabled}
                                                                    title="Calcular UEH por artefacto"
                                                                    style={{ padding: '1px 5px', background: isEditDisabled ? 'var(--surface-input)' : 'var(--accent-color, var(--accent))', border: 'none', borderRadius: '2px', color: 'white', fontSize: '9px', fontWeight: 600, cursor: isEditDisabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', opacity: isEditDisabled ? 0.5 : 1 }}
                                                                >
                                                                    ART
                                                                </button>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </div>

                                            {/* SDR sub-row for HDPE_LISO */}
                                            {field === 'material' && valObj?.value === 'HDPE_LISO' && (
                                                <div className="prop-row">
                                                    <div className="prop-row-label">SDR</div>
                                                    <div className="prop-row-value">
                                                        <select
                                                            value={(object as any).sdr?.value || 'SDR17'}
                                                            disabled={isLocked || isReadOnly}
                                                            onChange={(e) => handleUpdateObject(object.id, type, { sdr: { value: e.target.value, origin: 'manual' } })}
                                                        >
                                                            <option value="SDR17">SDR 17 (PNC 10)</option>
                                                            <option value="SDR21">SDR 21 (PNC 8)</option>
                                                            <option value="SDR26">SDR 26 (PNC 6)</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Manual Height toggle as compact row */}
                                            {type === 'chamber' && field === 'H' && (
                                                <div className="prop-row">
                                                    <div className="prop-row-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={(object as Chamber).heightLocked ?? (valObj.origin === 'manual')}
                                                            onChange={(e) => handleUpdateObject(object.id, 'chamber', {
                                                                heightLocked: e.target.checked,
                                                                H: { ...valObj, origin: e.target.checked ? 'manual' : 'calculated' }
                                                            })}
                                                            disabled={isLocked}
                                                            id={`manual-h-${id}`}
                                                            style={{ width: '11px', height: '11px' }}
                                                        />
                                                        <label htmlFor={`manual-h-${id}`} style={{ cursor: 'pointer' }}>H manual</label>
                                                    </div>
                                                    <div className="prop-row-value" style={{ color: 'var(--accent)', fontStyle: 'normal', background: 'none' }}>
                                                        {(object as Chamber).heightLocked ?? (valObj.origin === 'manual') ? 'Sí' : 'No'}
                                                    </div>
                                                </div>
                                            )}

                                            {type === 'chamber' && field === 'CRS' && chamberIncomingDisplay.length > 0 && (
                                                <>
                                                    <div className="prop-section-header">Entradas por Tramo</div>
                                                    {chamberIncomingDisplay.map((entry) => (
                                                        <React.Fragment key={`incoming-${entry.pipeId}`}>
                                                            <div className="prop-row">
                                                                <div className="prop-row-label">Tramo</div>
                                                                <div className="prop-row-value readonly">
                                                                    {entry.pipeLabel}
                                                                </div>
                                                            </div>
                                                            <div className="prop-row">
                                                                <div className="prop-row-label">Cre {entry.pipeLabel}</div>
                                                                <div className="prop-row-value readonly">
                                                                    {entry.cre.toFixed(3)}
                                                                    <span className="prop-unit">m</span>
                                                                </div>
                                                            </div>
                                                            {/* Fila Δ: editable solo para el tramo con menor Cre */}
                                                            <div className="prop-row">
                                                                <div className="prop-row-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                    <span style={{
                                                                        fontFamily: 'serif',
                                                                        fontSize: '1em',
                                                                        fontWeight: 700,
                                                                        color: entry.isDeltaEditable ? 'var(--accent)' : 'var(--text-muted)',
                                                                        userSelect: 'none',
                                                                    }}>Δ</span>
                                                                    <span>{entry.pipeLabel}</span>
                                                                </div>
                                                                {entry.isDeltaEditable ? (
                                                                    <div className="prop-row-value">
                                                                        <PropertyInput
                                                                            isNumber={true}
                                                                            value={entry.delta}
                                                                            disabled={isLocked}
                                                                            onChange={(val) => {
                                                                                const chamber = object as Chamber;
                                                                                const newIncomingDeltas = { ...(chamber.incomingDeltas || {}) };
                                                                                newIncomingDeltas[entry.pipeId] = Number(val);
                                                                                handleUpdateObject(chamber.id, 'chamber', { incomingDeltas: newIncomingDeltas });
                                                                            }}
                                                                            style={{}}
                                                                        />
                                                                        <span className="prop-unit">m</span>
                                                                    </div>
                                                                ) : (
                                                                    <div className="prop-row-value readonly">
                                                                        {entry.delta.toFixed(3)}
                                                                        <span className="prop-unit">m</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </React.Fragment>
                                                    ))}
                                                </>
                                            )}

                                            {/* Manual Slope toggle */}
                                            {type === 'pipe' && field === 'slope' && (
                                                <div className="prop-row">
                                                    <div className="prop-row-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={((object as Pipe).slopeLocked ?? (object as Pipe).isSlopeManual) || false}
                                                            onChange={(e) => handleUpdateObject(object.id, 'pipe', {
                                                                slopeLocked: e.target.checked,
                                                                isSlopeManual: e.target.checked
                                                            })}
                                                            disabled={isLocked}
                                                            id={`manual-slope-${id}`}
                                                            style={{ width: '11px', height: '11px' }}
                                                        />
                                                        <label htmlFor={`manual-slope-${id}`} style={{ cursor: 'pointer' }}>i manual</label>
                                                    </div>
                                                    <div className="prop-row-value" style={{ color: 'var(--accent)', fontStyle: 'normal', background: 'none' }}>
                                                        {((object as Pipe).slopeLocked ?? (object as Pipe).isSlopeManual) ? 'Sí' : 'No'}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Auto Length toggle */}
                                            {type === 'pipe' && field === 'length' && (
                                                <div className="prop-row">
                                                    <div className="prop-row-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={resolvePipeLengthMode(object as Pipe) === 'auto'}
                                                            onChange={(e) => {
                                                                const pipeObject = object as Pipe;
                                                                if (!e.target.checked) {
                                                                    handleUpdateObject(object.id, 'pipe', buildManualLengthUpdate(pipeObject.length, Number(valObj?.value || 0)));
                                                                    return;
                                                                }
                                                                const pts = [{ x: pipeObject.x1, y: pipeObject.y1 }, ...(pipeObject.vertices || []), { x: pipeObject.x2, y: pipeObject.y2 }];
                                                                let totalLength = 0;
                                                                for (let i = 0; i < pts.length - 1; i++) {
                                                                    totalLength += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
                                                                }
                                                                handleUpdateObject(object.id, 'pipe', buildAutoLengthUpdate(pipeObject.length, totalLength));
                                                            }}
                                                            disabled={isLocked}
                                                            id={`auto-length-${id}`}
                                                            style={{ width: '11px', height: '11px' }}
                                                        />
                                                        <label htmlFor={`auto-length-${id}`} style={{ cursor: 'pointer' }}>L auto</label>
                                                    </div>
                                                    <div className="prop-row-value" style={{ color: 'var(--accent)', fontStyle: 'normal', background: 'none' }}>
                                                        {resolvePipeLengthMode(object as Pipe) === 'auto' ? 'Geom.' : 'Manual'}
                                                    </div>
                                                </div>
                                            )}

                                            {/* DINT sub-section */}
                                            {type === 'pipe' && field === 'diameter' && (
                                                <div className="prop-row">
                                                    <div className="prop-row-label">DINT modo</div>
                                                    <div className="prop-row-value">
                                                        <select
                                                            value={(object as Pipe).internalDiameterMode || 'AUTO'}
                                                            onChange={(e) => handleUpdateObject(object.id, 'pipe', { internalDiameterMode: e.target.value as any })}
                                                            disabled={isLocked}
                                                        >
                                                            <option value="AUTO">Auto</option>
                                                            <option value="MANUAL">Manual</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            )}
                                            {type === 'pipe' && field === 'diameter' && (object as Pipe).internalDiameterMode === 'MANUAL' && (
                                                <div className="prop-row">
                                                    <div className="prop-row-label">DINT manual</div>
                                                    <div className="prop-row-value">
                                                        <PropertyInput
                                                            isNumber={true}
                                                            value={(object as Pipe).internalDiameterManual?.value ?? 0}
                                                            onChange={(val) => handleUpdateObject(object.id, 'pipe', { internalDiameterManual: { value: Number(val), origin: 'manual' } })}
                                                            disabled={isLocked}
                                                            style={{}}
                                                        />
                                                        <span className="prop-unit">mm</span>
                                                    </div>
                                                </div>
                                            )}
                                            {type === 'pipe' && field === 'diameter' && (
                                                <div className="prop-row">
                                                    <div className="prop-row-label">DINT resuelto</div>
                                                    <div className="prop-row-value readonly">
                                                        {(object as Pipe).internalDiameterResolved?.toFixed(2) || '—'}
                                                        <span className="prop-unit">mm</span>
                                                        <span style={{ fontSize: '9px', color: 'var(--text-muted)', marginLeft: '2px' }}>[{(object as Pipe).internalDiameterSource || '—'}]</span>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Inline warnings */}
                                            {warning && (
                                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '1px 8px', background: 'var(--danger-soft)', fontSize: '9px', color: 'var(--danger)' }}>
                                                    <AlertTriangle size={10} />
                                                    {warning}
                                                </div>
                                            )}
                                            {recommendations.map((rec, i) => (
                                                <div key={i} style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '1px 8px', background: 'color-mix(in srgb, var(--accent) 8%, transparent)', fontSize: '9px', color: 'var(--text-muted)' }}>
                                                    <Info size={10} />
                                                    {rec}
                                                </div>
                                            ))}
                                        </React.Fragment>
                                    );
                                })}

                                {type === 'pipe' && (() => {
                                    const pipe = object as Pipe;
                                    const effectiveManning = pipe.manningOrigin === 'Manual'
                                        ? Number(pipe.manningManual?.value || 0.013)
                                        : (pipe.manningOrigin === 'Material'
                                            ? getManningN(String(pipe.material.value))
                                            : (settings.manning.value || 0.013));

                                    return (
                                        <>
                                            <div className="prop-section-header">
                                                <Zap size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                                                Manning
                                            </div>
                                            <div className="prop-row">
                                                <div className="prop-row-label">Origen</div>
                                                <div className="prop-row-value">
                                                    <select
                                                        value={pipe.manningOrigin || 'Global'}
                                                        onChange={(e) => handleUpdateObject(pipe.id, 'pipe', { manningOrigin: e.target.value as any })}
                                                        disabled={isLocked}
                                                    >
                                                        <option value="Global">Global ({settings.manning.value || 0.013})</option>
                                                        <option value="Material">Por Material ({getManningN(String(pipe.material.value))})</option>
                                                        <option value="Manual">Manual</option>
                                                    </select>
                                                </div>
                                            </div>
                                            {pipe.manningOrigin === 'Manual' && (
                                                <div className="prop-row">
                                                    <div className="prop-row-label">Valor (n)</div>
                                                    <div className="prop-row-value">
                                                        <PropertyInput
                                                            isNumber={true}
                                                            value={pipe.manningManual?.value ?? 0.013}
                                                            onChange={(val) => handleUpdateObject(pipe.id, 'pipe', { manningManual: { value: val, origin: 'manual' } })}
                                                            disabled={isLocked}
                                                            style={{}}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                            <div className="prop-row">
                                                <div className="prop-row-label">n efectivo</div>
                                                <div className="prop-row-value readonly">
                                                    {effectiveManning.toFixed(3)}
                                                </div>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        )
                    }
                    {/* System Info */}
                    <div className="prop-section-header">Sistema</div>
                    <div className="prop-row">
                        <div className="prop-row-label">ID interno</div>
                        <div className="prop-row-value readonly">{object.id.substring(0, 10)}…</div>
                    </div>
                    <div className="prop-row">
                        <div className="prop-row-label">X</div>
                        <div className="prop-row-value readonly">
                            {Number(type === 'chamber' ? (object as Chamber).x : (object as any).x || (object as any).x1 || 0).toFixed(3)}
                        </div>
                    </div>
                    <div className="prop-row">
                        <div className="prop-row-label">Y</div>
                        <div className="prop-row-value readonly">
                            {Number(type === 'chamber' ? (object as Chamber).y : (object as any).y || (object as any).y1 || 0).toFixed(3)}
                        </div>
                    </div>
                </div>
            </div>

            <ArtifactCalculator
                isOpen={isCalculatorOpen}
                onClose={() => setIsCalculatorOpen(false)}
                sanitarySystemType={settings.sanitarySystemType}
                initialFixtures={
                    calculatorTargetId
                        ? (chambers.find(c => c.id === calculatorTargetId)?.fixtureLoads ?? [])
                        : []
                }
                onSave={({ totalUEH, fixtureLoads }) => {
                    if (isLocked) {
                        setIsCalculatorOpen(false);
                        return;
                    }
                    if (calculatorTargetId) {
                        const inputMethod = totalUEH === 0 ? undefined : 'artifact';
                        handleUpdateObject(calculatorTargetId, 'chamber', {
                            uehPropias: { value: totalUEH, origin: 'manual' },
                            uehInputMethod: inputMethod,
                            fixtureLoads: fixtureLoads as ChamberFixtureLoad[]
                        });
                    }
                    setIsCalculatorOpen(false);
                }}
            />

            {/* READ-ONLY FIXTURES VIEWER MODAL */}
            {isViewerOpen && viewerTargetId && (() => {
                const chamber = chambers.find(c => c.id === viewerTargetId);
                const fixtures = chamber?.fixtureLoads ?? [];
                const totalUEH = Number(chamber?.uehPropias?.value ?? 0);
                const qwwPropio = Number(chamber?.qwwPropio?.value ?? 0);

                // Calcular UEH unitario y subtotal por fila al vuelo
                const rows = fixtures.map(fl => {
                    console.log('Fixture row:', fl); // debug temporal
                    const uehUnit = getUEHForFixtureByClass(fl.fixtureKey, Number(fl.usageClass));
                    const subtotal = uehUnit * fl.quantity;
                    const nombre = (NCH3371_TABLE_B1 as Record<string, { name: string }>)[fl.fixtureKey]?.name ?? fl.fixtureKey;
                    return { fl, nombre, uehUnit, subtotal };
                });
                const sumaSubtotales = rows.reduce((s, r) => s + r.subtotal, 0);

                return (
                    <div style={{
                        position: 'fixed', inset: 0,
                        background: 'var(--modal-backdrop)',
                        zIndex: 9999,
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }} onClick={() => setIsViewerOpen(false)}>
                        <div style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: '12px',
                            padding: '24px',
                            width: '560px',
                            maxHeight: '80vh',
                            overflowY: 'auto',
                            boxShadow: 'var(--modal-shadow)'
                        }} onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                <div>
                                    <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                                        Artefactos asociados a la cámara
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        Unidades sanitarias consideradas en el cálculo UEH
                                    </div>
                                </div>
                                <button
                                    onClick={() => setIsViewerOpen(false)}
                                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Table */}
                            {rows.length === 0 ? (
                                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '24px 0', fontStyle: 'italic' }}>
                                    No hay artefactos registrados
                                </div>
                            ) : (
                                <table className="table-pro compact zebra hover">
                                    <thead>
                                        <tr>
                                            <th>Artefacto</th>
                                            <th className="center">Clase</th>
                                            <th className="numeric">UEH unit</th>
                                            <th className="center">Cant</th>
                                            <th className="numeric">Subtotal</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map(({ fl, nombre, uehUnit, subtotal }, idx) => (
                                            <tr key={idx}>
                                                <td>{nombre}</td>
                                                <td className="center">{fl.usageClass}</td>
                                                <td className="numeric">{(uehUnit ?? 0).toFixed(0)}</td>
                                                <td className="center" style={{ fontWeight: 600 }}>{fl.quantity}</td>
                                                <td className="numeric" style={{ fontWeight: 700 }}>{(subtotal ?? 0).toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr>
                                            <td colSpan={4} style={{ textAlign: 'right' }}>TOTAL UEH</td>
                                            <td className="numeric" style={{ fontWeight: 700 }}>{(sumaSubtotales ?? 0).toFixed(2)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            )}

                            {/* Resumen Qww */}
                            <div style={{
                                marginTop: '12px',
                                padding: '10px 12px',
                                background: 'var(--success-bg)',
                                border: '1px solid var(--success-border)',
                                borderRadius: '8px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>Qww Propio (l/s)</span>
                                <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--success)' }}>{(qwwPropio ?? 0).toFixed(4)}</span>
                            </div>

                            <div style={{ textAlign: 'center', marginTop: '16px' }}>
                                <button
                                    onClick={() => setIsViewerOpen(false)}
                                    style={{
                                        padding: '8px 24px',
                                        background: 'var(--bg)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '6px',
                                        color: 'var(--text-primary)',
                                        fontSize: '0.85rem',
                                        cursor: 'pointer'
                                    }}
                                >Cerrar</button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </>
    );
};
