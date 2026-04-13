import React from 'react';
import { Workspace } from './components/Workspace';
import { PropertiesPanel } from './components/PropertiesPanel';
import { ResultsDock } from './components/ResultsDock';
import { VerticalRail } from './components/ui/VerticalRail';


import { MenuBar } from './components/MenuBar';
import { User } from 'lucide-react';
import { ProjectProvider } from './context/ProjectContext';
import { ViewProvider } from './context/ViewContext';
import { DisplaySettingsProvider } from './DisplaySettingsContext';
import { AnalysisViewModeProvider } from './AnalysisViewModeContext';

import { MapDimensionsDialog } from './components/MapDimensionsDialog';
import { useView } from './context/ViewContext';
import { useProject } from './context/ProjectContext';
import { GravityModel, PressureModel, PressureModelValidationError, PressurePipe, GravityResults } from './hydraulics';
import { calculateFlowAccumulation } from './utils/flowAccumulator';
import { getManningN } from './hydraulics/uehTables';
import { getInternalDiameter } from './utils/diameterMapper';
import { resolveEffectivePipeRole } from './utils/pipeRole';
import { resolveActivePumpingSelection } from './utils/pumpingSelection';

const StatusBar: React.FC = () => {
    return (
        <footer className="status-bar">
        </footer>
    );
};

interface PumpLinkDialogState {
    systemId: string;
    systemName: string;
    wetWellIds: string[];
    pumpIds: string[];
    selectedWetWellId: string;
    selectedPumpId: string;
    canAutoLink: boolean;
    showWetWellSelector: boolean;
    showPumpSelector: boolean;
    message: string;
}

interface AnalysisToastState {
    id: number;
    message: string;
}

const AppInner: React.FC = () => {
    console.log('🔧 AppInner: Component rendering...');
    const {
        isMapDimensionsOpen, setIsMapDimensionsOpen,
        setAnalysisResults, analysisResults,
        setGravityResults, setVerification1105,
        visualizationMode, setVisualizationMode,
        isLocked, setIsLocked, toggleSelection,
        resultsDockOpen,
        isCanvasExpanded,
        isResultsDockCollapsed,
        isRightPanelCollapsed,
        closeResultsDock,
        toggleRightPanel
    } = useView();
    const {
        chambers,
        pipes,
        settings,
        wetWells,
        pumps,
        pressurePipes,
        setPressurePipes,
        outfallsPressure,
        pressureJunctions,
        pumpingSystems,
        setPumpingSystems,
        activePumpingSystemId,
        setActivePumpingSystemId,
        setPumps,
        calculationMethod,
        isDirty,
        filePath,
        projectSessionId,
        saveProject,
        openProjectFromPath
    } = useProject();
    const [pumpLinkDialog, setPumpLinkDialog] = React.useState<PumpLinkDialogState | null>(null);
    const [analysisToast, setAnalysisToast] = React.useState<AnalysisToastState | null>(null);

    const isResultsDockVisible = resultsDockOpen && !isCanvasExpanded && !isResultsDockCollapsed;
    const isRightPanelVisible = !isCanvasExpanded && !isRightPanelCollapsed;

    const projectName = filePath
        ? filePath.split(/[/\\]/).pop()?.replace('.json', '') || 'Proyecto sin nombre'
        : 'Proyecto sin nombre';

    const showAnalysisToast = React.useCallback((message: string) => {
        setAnalysisToast({
            id: Date.now() + Math.floor(Math.random() * 1000),
            message
        });
    }, []);

    React.useEffect(() => {
        if (!analysisToast) return;
        const timer = setTimeout(() => setAnalysisToast(null), 3400);
        return () => clearTimeout(timer);
    }, [analysisToast]);

    React.useEffect(() => {
        const handleLockedKeydown = (e: KeyboardEvent) => {
            if (!isLocked) return;
            const key = e.key.toLowerCase();
            const isUndo = e.ctrlKey && key === 'z';
            const isRedo = e.ctrlKey && (key === 'y' || (e.shiftKey && key === 'z'));
            const isDelete = key === 'delete' || key === 'backspace';

            if (isUndo || isRedo || isDelete) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        };

        window.addEventListener('keydown', handleLockedKeydown, true);
        return () => window.removeEventListener('keydown', handleLockedKeydown, true);
    }, [isLocked]);

    // Reset analysis state when project is reset or changed
    React.useEffect(() => {
        if (chambers.length === 0 && pipes.length === 0 && !isDirty) {
            console.log('🔄 App: Resetting locked state due to empty project');
            setIsLocked(false);
            setAnalysisResults(null);
            closeResultsDock();
        }
    }, [chambers.length, pipes.length, isDirty, closeResultsDock, setIsLocked, setAnalysisResults]);

    // Auto-recalculation: Re-run analysis when properties change if locked
    const hasPressureElements = pumps.length > 0;
    React.useEffect(() => {
        // Only auto-recalculate if:
        // 1. System is locked (analysis has been run)
        // 2. There are elements to analyze
        // 3. Has pressure elements (pumps exist)
        if (!isLocked || !hasPressureElements) {
            return;
        }

        // Debounce timer to avoid excessive recalculations
        const timer = setTimeout(() => {
            console.log('🔄 App: Auto-recalculating due to property change...');
            runSimulation();
        }, 300); // 300ms debounce

        return () => clearTimeout(timer);
        // Dependencies: calculationMethod and element arrays
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [calculationMethod, wetWells, pumps, pressurePipes, outfallsPressure, pressureJunctions, pumpingSystems, activePumpingSystemId, isLocked, hasPressureElements]);

    React.useEffect(() => {
        console.log('📂 App: Resetting locked state due to project session change:', projectSessionId, filePath);
        setIsLocked(false);
        setAnalysisResults(null);
        closeResultsDock();
    }, [projectSessionId, filePath, closeResultsDock, setIsLocked, setAnalysisResults]);

    // Splash Screen Simulation
    React.useEffect(() => {
        const simulateStartup = async () => {
            if (window.electronAPI && window.electronAPI.sendLoadingProgress) {
                // 0% - Initial
                window.electronAPI.sendLoadingProgress(0, "Cargando configuración...");

                // 20% - Configuration Loaded
                await new Promise(resolve => setTimeout(resolve, 800));
                window.electronAPI.sendLoadingProgress(20, "Iniciando motor de cálculo...");

                // 50% - Engine Ready
                await new Promise(resolve => setTimeout(resolve, 1000));
                window.electronAPI.sendLoadingProgress(50, "Cargando interfaz y tablas...");

                // 80% - UI Ready
                await new Promise(resolve => setTimeout(resolve, 800));
                window.electronAPI.sendLoadingProgress(80, "Verificación final...");

                // 100% - Ready
                await new Promise(resolve => setTimeout(resolve, 500));
                window.electronAPI.sendLoadingProgress(100, "Listo");

                // Close Splash
                setTimeout(() => {
                    window.electronAPI.sendAppReady();
                }, 200);
            }
        };

        simulateStartup();
    }, []);

    // Handle window close confirmation
    React.useEffect(() => {
        if (!window.electronAPI) return;

        // Listen for unsaved changes check from main process
        const handleCheckUnsaved = () => {
            console.log('🔔 Window close requested, isDirty:', isDirty);
            window.electronAPI.sendUnsavedChangesResponse(isDirty);
        };

        // Listen for save-and-close request
        const handleSaveAndClose = async () => {
            console.log('💾 Save and close requested');
            try {
                const wasSaved = await saveProject();
                if (!wasSaved) {
                    console.log('⚠️ Save cancelled or failed. Keeping application open.');
                    return;
                }

                console.log('✅ Project saved before close');
                // Notify main process that save is complete
                window.electronAPI.sendSaveCompleted();
            } catch (error) {
                console.error('❌ Error saving project:', error);
                // Don't send save completed if there was an error
            }
        };

        const cleanupCheck = window.electronAPI.onCheckUnsavedChanges(handleCheckUnsaved);
        const cleanupSave = window.electronAPI.onSaveAndClose(handleSaveAndClose);

        // Cleanup listeners on unmount
        return () => {
            cleanupCheck();
            cleanupSave();
        };
    }, [isDirty, filePath, chambers, pipes, settings, saveProject]);

    React.useEffect(() => {
        if (!window.electronAPI?.onOpenProject) return;

        const cleanup = window.electronAPI.onOpenProject((projectPath: string) => {
            if (!projectPath || typeof projectPath !== 'string') return;
            console.log('📂 Opening project from file association:', projectPath);
            openProjectFromPath(projectPath);
        });

        return cleanup;
    }, [openProjectFromPath]);


    const getNodeLabel = (node: { id: string; userDefinedId?: string; name?: string } | undefined): string => {
        if (!node) return '';
        return node.userDefinedId || node.name || node.id;
    };

    const openPumpLinkRepairDialog = (
        systemId: string,
        message: string,
        options?: {
            canAutoLink?: boolean;
            wetWellIds?: string[];
            pumpIds?: string[];
        }
    ) => {
        const system = pumpingSystems.find(item => item.id === systemId);
        const wetWellIds = (options?.wetWellIds && options.wetWellIds.length > 0)
            ? options.wetWellIds
            : wetWells.filter(item => item.systemId === systemId).map(item => item.id);
        const pumpIds = (options?.pumpIds && options.pumpIds.length > 0)
            ? options.pumpIds
            : pumps.filter(item => item.systemId === systemId).map(item => item.id);

        setPumpLinkDialog({
            systemId,
            systemName: system?.name || systemId,
            wetWellIds,
            pumpIds,
            selectedWetWellId: wetWellIds[0] || '',
            selectedPumpId: pumpIds[0] || '',
            canAutoLink: !!options?.canAutoLink,
            showWetWellSelector: false,
            showPumpSelector: false,
            message
        });
    };

    const buildPumpLink = (
        systemId: string,
        wetWellId: string,
        pumpId: string,
        existingPressurePipes: PressurePipe[]
    ): PressurePipe | null => {
        const wetWell = wetWells.find(item => item.id === wetWellId);
        const pump = pumps.find(item => item.id === pumpId);
        if (!wetWell || !pump) return null;

        const duplicated = existingPressurePipes.some(link => {
            const kind = link.kind || 'pipe';
            if (kind !== 'pump_link') return false;
            if (link.systemId !== systemId) return false;
            return (
                (link.startNodeId === wetWellId && link.endNodeId === pumpId)
                || (link.startNodeId === pumpId && link.endNodeId === wetWellId)
            );
        });

        if (duplicated) return null;

        const x1 = Number(wetWell.x) || 0;
        const y1 = Number(wetWell.y) || 0;
        const x2 = Number(pump.x) || 0;
        const y2 = Number(pump.y) || 0;
        const length = Math.max(0.01, Number(Math.hypot(x2 - x1, y2 - y1).toFixed(3)));
        const zStart = Number.isFinite(wetWell.CL) ? wetWell.CL : (Number.isFinite(wetWell.CI) ? wetWell.CI : (Number.isFinite(wetWell.CR) ? wetWell.CR : 0));
        const zEnd = Number.isFinite(pump.Hnom) ? pump.Hnom : zStart;
        const linkId = (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
            ? `pump_link-${globalThis.crypto.randomUUID()}`
            : `pump_link-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        return {
            id: linkId,
            name: `VINC-${getNodeLabel(wetWell)}-${getNodeLabel(pump)}`,
            kind: 'pump_link',
            systemId,
            x1,
            y1,
            x2,
            y2,
            startNodeId: wetWell.id,
            endNodeId: pump.id,
            length,
            diameter: 100,
            material: 'PVC',
            C_hazen: 140,
            z_start: zStart,
            z_end: zEnd,
            kFactors: [],
            PN: Number.isFinite(pump.PN_usuario) ? pump.PN_usuario : 10
        };
    };

    const runPressureSimulation = (overrides?: {
        pressurePipes?: PressurePipe[];
        pumps?: typeof pumps;
        pumpingSystems?: typeof pumpingSystems;
    }): boolean => {
        if (wetWells.length === 0) {
            alert('Sistema de presión requiere al menos una cámara de bombeo.');
            return false;
        }

        let pressurePipesData = overrides?.pressurePipes || pressurePipes;
        let pumpsData = overrides?.pumps || pumps;
        let pumpingSystemsData = overrides?.pumpingSystems || pumpingSystems;

        if (pressurePipesData.length === 0) {
            alert('Sistema de presión requiere al menos una tubería de impulsión.');
            return false;
        }
        if (pumpingSystemsData.length === 0) {
            alert('No hay sistemas de bombeo definidos. Cree y configure un sistema antes de ejecutar.');
            return false;
        }

        const pumpingSelection = resolveActivePumpingSelection({
            pumpingSystems: pumpingSystemsData,
            activePumpingSystemId,
            pumps: pumpsData,
            wetWells
        });
        const resolvedSystemId = pumpingSelection.activeSystem?.id || '';

        if (!resolvedSystemId) {
            alert('Seleccione un sistema de bombeo activo antes de ejecutar.');
            return false;
        }

        if (resolvedSystemId !== activePumpingSystemId) {
            setActivePumpingSystemId(resolvedSystemId);
        }

        if (pumpingSelection.pumpNotFound) {
            alert('Bomba seleccionada no existe');
            return false;
        }

        const selectedPump = pumpingSelection.pump;
        if (selectedPump && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
            const points = selectedPump.curveMode === 'TABLE'
                ? (selectedPump.curveTable || []).filter(point => Number.isFinite(point?.Q) && Number.isFinite(point?.H)).length
                : [selectedPump.point0, selectedPump.pointNom, selectedPump.pointMax]
                    .filter(point => Boolean(point && Number.isFinite(point.Q) && Number.isFinite(point.H))).length;
            console.log('[Pump] selectedPumpId=', pumpingSelection.selectedPumpId, 'pump.name=', selectedPump.name || selectedPump.userDefinedId || selectedPump.id, 'points=', points);
        }

        const model = new PressureModel();

        wetWells.forEach(ww => model.addWetWell(ww));
        pumpsData.forEach(p => model.addPump(p));
        pressurePipesData.forEach(pp => model.addPressurePipe(pp));
        outfallsPressure.forEach(o => model.addOutfall(o));
        pressureJunctions.forEach(j => model.addPressureJunction(j));
        pumpingSystemsData.forEach(s => model.addPumpingSystem(s));

        const prep = model.ensurePumpLinkForSystem(resolvedSystemId);
        if (prep.status === 'missing') {
            openPumpLinkRepairDialog(resolvedSystemId, `Falta vínculo entre Cámara Húmeda y Bomba (pump_link) en ${prep.context.systemName}.`, {
                canAutoLink: prep.context.canAutoLink,
                wetWellIds: prep.context.wetWellIds,
                pumpIds: prep.context.pumpIds
            });
            return false;
        }

        if (prep.status === 'auto_created') {
            pressurePipesData = [...pressurePipesData, prep.link];
            pumpsData = pumpsData.map(item => item.id === prep.context.pumpIds[0]
                ? { ...item, wetWellId: prep.context.wetWellIds[0], systemId: prep.context.systemId }
                : item
            );
            pumpingSystemsData = pumpingSystemsData.map(system => system.id === prep.context.systemId
                ? {
                    ...system,
                    wetWellId: prep.context.wetWellIds[0] || system.wetWellId,
                    pumpId: prep.context.pumpIds[0] || system.pumpId,
                    dischargeStartNodeId: system.dischargeStartNodeId || prep.context.pumpIds[0] || ''
                }
                : system
            );

            setPressurePipes(prev => prev.some(pipe => pipe.id === prep.link.id) ? prev : [...prev, prep.link]);
            setPumps(prev => prev.map(item => item.id === prep.context.pumpIds[0]
                ? { ...item, wetWellId: prep.context.wetWellIds[0], systemId: prep.context.systemId }
                : item
            ));
            setPumpingSystems(prev => prev.map(system => system.id === prep.context.systemId
                ? {
                    ...system,
                    wetWellId: prep.context.wetWellIds[0] || system.wetWellId,
                    pumpId: prep.context.pumpIds[0] || system.pumpId,
                    dischargeStartNodeId: system.dischargeStartNodeId || prep.context.pumpIds[0] || ''
                }
                : system
            ));

            const wwLabel = getNodeLabel(wetWells.find(item => item.id === prep.context.wetWellIds[0])) || prep.context.wetWellIds[0];
            const pumpLabel = getNodeLabel(pumps.find(item => item.id === prep.context.pumpIds[0])) || prep.context.pumpIds[0];
            showAnalysisToast(`Vínculo CH↔B auto-creado: ${wwLabel} -> ${pumpLabel}.`);
        }

        try {
            const solveModel = new PressureModel();
            wetWells.forEach(ww => solveModel.addWetWell(ww));
            pumpsData.forEach(p => solveModel.addPump(p));
            pressurePipesData.forEach(pp => solveModel.addPressurePipe(pp));
            outfallsPressure.forEach(o => solveModel.addOutfall(o));
            pressureJunctions.forEach(j => solveModel.addPressureJunction(j));
            pumpingSystemsData.forEach(s => solveModel.addPumpingSystem(s));

            const res = solveModel.solveSystem(resolvedSystemId, calculationMethod);

            setAnalysisResults(res);
            if (visualizationMode === 'none') {
                setVisualizationMode('compliance');
            }
            setIsLocked(true);

            console.log('✅ Pressure analysis complete', {
                systemId: res.systemId,
                systemName: res.systemName,
                result: res
            });

            return true;
        } catch (error: any) {
            if (error instanceof PressureModelValidationError && error.code === 'MISSING_PUMP_LINK') {
                openPumpLinkRepairDialog(error.context.systemId, error.message, {
                    canAutoLink: error.context.canAutoLink,
                    wetWellIds: error.context.wetWellIds,
                    pumpIds: error.context.pumpIds
                });
                return false;
            }

            console.error('❌ Pressure analysis failed:', error);
            alert(`Error en análisis de presión: ${error?.message || error}`);
            return false;
        }
    };

    const runSimulation = () => {
        // AUTO-DETECT: Pressure system vs Gravity system
        const hasPumps = pumps.length > 0;

        if (hasPumps) {
            // ==============================================
            // PRESSURE NETWORK ANALYSIS
            // ==============================================
            console.log('🚀 Running PRESSURE analysis...');
            runPressureSimulation();
        } else {
            // ==============================================
            // GRAVITY NETWORK ANALYSIS (Existing)
            // ==============================================
            console.log('📉 Running GRAVITY analysis...');

            const flowResult = calculateFlowAccumulation(chambers, pipes, { settings });
            const safePipes = flowResult.pipes;

            const model = new GravityModel();

            // Use real project data
            chambers.forEach(c => {
                model.addNode({
                    id: c.id,
                    elev_terreno: Number(c.CT),
                    elev_tuberia: Number(c.CRS.value),
                    inflow: 0.01
                });
            });

            safePipes.forEach(p => {
                // Determine slope to use: Manual or Calculated
                const slopeValue = (p.isSlopeManual && p.manualSlope)
                    ? Number(p.manualSlope.value)
                    : Number(p.slope.value);

                const dn = Number(p.diameter.value);
                const di = getInternalDiameter(String(p.material.value), dn, (p as any).sdr?.value);

                model.addConduit({
                    id: p.id,
                    from: p.startNodeId || '',
                    to: p.endNodeId || '',
                    diameter: di / 1000,           // Manning calculation uses Di
                    nominalDiameter: dn / 1000,    // Normative checks use DN
                    internalDiameter: di / 1000,
                    length: Number(p.length.value),
                    slope: slopeValue / 100,
                    roughness_n: p.manningOrigin === 'Manual'
                        ? Number(p.manningManual?.value || 0.013)
                        : (p.manningOrigin === 'Material'
                            ? getManningN(String(p.material.value))
                            : (settings.manning.value || 0.013)),
                    uehTransported: Number(p.uehTransportadas.value),
                    qwwTransported: Number(p.qwwTransportado?.value || 0),
                    pipeRole: resolveEffectivePipeRole(p),
                    qContinuous: p.qContinuous ? {
                        value: Number(p.hydraulics?.Q_design_Lps ?? p.qContinuous.value),
                        origin: p.qContinuous.origin === 'manual' ? 'input' : 'calculated'
                    } : undefined,
                    hasUpstreamInput: p.hasUpstreamInput
                });
            });

            const res = model.solve(settings.verificationMode);
            setAnalysisResults(res);
            setGravityResults(res);
            setVerification1105(null);
            if (visualizationMode === 'none') {
                setVisualizationMode('compliance');
            }
            setIsLocked(true); // Auto-lock on execution

            console.log('✅ Gravity analysis complete', res);
        }
    };

    const handleCreatePumpLinkAndRetry = (wetWellId: string, pumpId: string) => {
        if (!pumpLinkDialog) return;
        const systemId = pumpLinkDialog.systemId;

        if (!wetWellId || !pumpId) {
            alert('Seleccione una cámara húmeda y una bomba para crear el vínculo.');
            return;
        }

        const existingPairLink = pressurePipes.find(link => {
            const kind = link.kind || 'pipe';
            if (kind !== 'pump_link') return false;
            if (link.systemId !== systemId) return false;
            return (
                (link.startNodeId === wetWellId && link.endNodeId === pumpId)
                || (link.startNodeId === pumpId && link.endNodeId === wetWellId)
            );
        });

        const createdLink = existingPairLink || buildPumpLink(systemId, wetWellId, pumpId, pressurePipes);
        if (!createdLink) {
            alert('No se pudo crear el vínculo CH↔B seleccionado.');
            return;
        }

        const nextPressurePipes = existingPairLink
            ? pressurePipes
            : [...pressurePipes, createdLink];

        const nextPumps = pumps.map(item => item.id === pumpId
            ? { ...item, wetWellId, systemId }
            : item
        );

        const nextSystems = pumpingSystems.map(system => system.id === systemId
            ? {
                ...system,
                wetWellId,
                pumpId,
                dischargeStartNodeId: system.dischargeStartNodeId || pumpId
            }
            : system
        );

        setPressurePipes(nextPressurePipes);
        setPumps(nextPumps);
        setPumpingSystems(nextSystems);
        setPumpLinkDialog(null);

        const wwLabel = getNodeLabel(wetWells.find(item => item.id === wetWellId)) || wetWellId;
        const pumpLabel = getNodeLabel(pumps.find(item => item.id === pumpId)) || pumpId;
        if (existingPairLink) {
            showAnalysisToast(`Vínculo CH↔B ya existía: ${wwLabel} -> ${pumpLabel}.`);
        } else {
            showAnalysisToast(`Vínculo CH↔B creado: ${wwLabel} -> ${pumpLabel}.`);
        }

        runPressureSimulation({
            pressurePipes: nextPressurePipes,
            pumps: nextPumps,
            pumpingSystems: nextSystems
        });
    };

    return (
        <>
            <div className="app-container">
                <header style={{
                    height: 'var(--header-height)',
                    background: 'var(--surface, var(--surface))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 20px',
                    zIndex: 200,
                    position: 'relative'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        {/* Logo mark */}
                        <div style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '7px',
                            background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 70%, var(--success)))',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 2px 8px color-mix(in srgb, var(--accent) 25%, transparent)',
                            flexShrink: 0
                        }}>
                            <span style={{ color: 'var(--text-primary)', fontSize: '0.65rem', fontWeight: 900, letterSpacing: '-0.02em' }}>SM</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                            <span style={{ fontWeight: 800, fontSize: '0.88rem', letterSpacing: '-0.02em', color: 'var(--text-primary, var(--text-primary))', lineHeight: 1.1 }}>
                                SMCALC_ALC
                                <span style={{ opacity: 0.35, fontWeight: 400, fontSize: '0.72rem', marginLeft: '6px' }}>v.0.1.1</span>
                            </span>
                            <span style={{
                                color: 'var(--text-muted)',
                                fontWeight: 500,
                                fontSize: '0.72rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}>
                                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{projectName}</span>
                            </span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button style={{
                            background: 'var(--accent)',
                            border: 'none',
                            borderRadius: '50%',
                            width: '30px',
                            height: '30px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                            transition: 'transform 0.15s ease'
                        }}>
                            <User size={16} color="white" />
                        </button>
                    </div>
                </header>
                <MenuBar onRunSimulation={runSimulation} />

                <div className="main-layout">
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        overflow: 'hidden',
                        minWidth: 0
                    }}>
                        <div style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            position: 'relative',
                            minWidth: 0
                        }}>
                            <Workspace
                                key={`workspace-${projectSessionId}`}
                                readOnly={isLocked}
                                onChamberClick={(id, e) => {
                                    toggleSelection(id, 'chamber', e?.ctrlKey || false);
                                }}
                                onRunSimulation={runSimulation}
                                isLocked={isLocked}
                            />
                        </div>

                        {isResultsDockVisible && (
                            <div className="results-dock-container" style={{
                                width: '520px',
                                flexShrink: 0,
                                display: 'flex',
                                flexDirection: 'column',
                                transition: 'width 0.2s ease'
                            }}>
                                <ResultsDock />
                            </div>
                        )}
                    </div>

                    <VerticalRail />

                    {isRightPanelVisible && (
                        <PropertiesPanel
                            key={`properties-${projectSessionId}`}
                            onToggleCollapse={toggleRightPanel}
                        />
                    )}
                </div>
            </div>

            {analysisToast && (
                <div
                    style={{
                        position: 'fixed',
                        top: 18,
                        right: 18,
                        zIndex: 3500,
                        background: 'rgba(15, 23, 42, 0.94)',
                        color: 'var(--text-primary)',
                        border: '1px solid rgba(148,163,184,0.4)',
                        borderRadius: '8px',
                        padding: '9px 12px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        boxShadow: '0 10px 24px rgba(0,0,0,0.35)',
                        maxWidth: '360px',
                        lineHeight: 1.35
                    }}
                >
                    {analysisToast.message}
                </div>
            )}

            <MapDimensionsDialog
                isOpen={isMapDimensionsOpen}
                onClose={() => setIsMapDimensionsOpen(false)}
            />

            {pumpLinkDialog && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0,0,0,0.45)',
                        zIndex: 4000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <div
                        style={{
                            width: 'min(560px, 92vw)',
                            background: 'var(--surface)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border)',
                            borderRadius: '10px',
                            boxShadow: '0 14px 38px rgba(0,0,0,0.35)',
                            padding: '16px'
                        }}
                    >
                        <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '8px' }}>
                            Falta vínculo entre Cámara Húmeda y Bomba (pump_link)
                        </div>
                        <div style={{ fontSize: '0.86rem', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.35 }}>
                            {pumpLinkDialog.message}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                    Cámara húmeda
                                </label>
                                <select
                                    value={pumpLinkDialog.selectedWetWellId}
                                    onChange={(e) => {
                                        const selectedWetWellId = e.target.value;
                                        setPumpLinkDialog(prev => prev ? {
                                            ...prev,
                                            selectedWetWellId
                                        } : prev);

                                        if (pumpLinkDialog.showWetWellSelector) {
                                            handleCreatePumpLinkAndRetry(selectedWetWellId, pumpLinkDialog.selectedPumpId);
                                        }
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '7px',
                                        borderRadius: '6px',
                                        border: '1px solid var(--border)',
                                        background: 'var(--bg)',
                                        color: 'var(--text-primary)'
                                    }}
                                >
                                    <option value="">Seleccionar cámara...</option>
                                    {pumpLinkDialog.wetWellIds.map(wetWellId => {
                                        const wetWell = wetWells.find(item => item.id === wetWellId);
                                        return (
                                            <option key={wetWellId} value={wetWellId}>
                                                {getNodeLabel(wetWell) || wetWellId}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                    Bomba
                                </label>
                                <select
                                    value={pumpLinkDialog.selectedPumpId}
                                    onChange={(e) => {
                                        const selectedPumpId = e.target.value;
                                        setPumpLinkDialog(prev => prev ? {
                                            ...prev,
                                            selectedPumpId
                                        } : prev);

                                        if (pumpLinkDialog.showPumpSelector) {
                                            handleCreatePumpLinkAndRetry(pumpLinkDialog.selectedWetWellId, selectedPumpId);
                                        }
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '7px',
                                        borderRadius: '6px',
                                        border: '1px solid var(--border)',
                                        background: 'var(--bg)',
                                        color: 'var(--text-primary)'
                                    }}
                                >
                                    <option value="">Seleccionar bomba...</option>
                                    {pumpLinkDialog.pumpIds.map(pumpId => {
                                        const pump = pumps.find(item => item.id === pumpId);
                                        return (
                                            <option key={pumpId} value={pumpId}>
                                                {getNodeLabel(pump) || pumpId}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                        </div>

                        {(pumpLinkDialog.showWetWellSelector || pumpLinkDialog.showPumpSelector) && (
                            <div style={{ fontSize: '0.74rem', color: 'var(--accent)', marginBottom: '10px' }}>
                                Seleccione la pareja CH↔B y luego pulse "Crear vínculo y reintentar".
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            {pumpLinkDialog.canAutoLink && (
                                <button
                                    onClick={() => handleCreatePumpLinkAndRetry(
                                        pumpLinkDialog.selectedWetWellId || pumpLinkDialog.wetWellIds[0] || '',
                                        pumpLinkDialog.selectedPumpId || pumpLinkDialog.pumpIds[0] || ''
                                    )}
                                    style={{
                                        padding: '7px 12px',
                                        borderRadius: '6px',
                                        border: '1px solid var(--accent)',
                                        background: 'var(--accent)',
                                        color: 'var(--text-primary)',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Auto-vincular
                                </button>
                            )}
                            <button
                                onClick={() => setPumpLinkDialog(prev => prev ? {
                                    ...prev,
                                    showWetWellSelector: true,
                                    showPumpSelector: false
                                } : prev)}
                                style={{
                                    padding: '7px 10px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border)',
                                    background: 'var(--bg)',
                                    color: 'var(--text-primary)',
                                    cursor: 'pointer'
                                }}
                            >
                                Elegir cámara...
                            </button>
                            <button
                                onClick={() => setPumpLinkDialog(prev => prev ? {
                                    ...prev,
                                    showWetWellSelector: false,
                                    showPumpSelector: true
                                } : prev)}
                                style={{
                                    padding: '7px 10px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border)',
                                    background: 'var(--bg)',
                                    color: 'var(--text-primary)',
                                    cursor: 'pointer'
                                }}
                            >
                                Elegir bomba...
                            </button>
                            <button
                                onClick={() => handleCreatePumpLinkAndRetry(
                                    pumpLinkDialog.selectedWetWellId,
                                    pumpLinkDialog.selectedPumpId
                                )}
                                style={{
                                    padding: '7px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--success)',
                                    background: 'var(--success)',
                                    color: 'var(--text-primary)',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                Crear vínculo y reintentar
                            </button>
                            <button
                                onClick={() => setPumpLinkDialog(null)}
                                style={{
                                    padding: '7px 10px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border)',
                                    background: 'transparent',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer'
                                }}
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

function App() {
    console.log('🎯 App: Component rendering...');
    return (
        <ProjectProvider>
            <DisplaySettingsProvider>
                <AnalysisViewModeProvider>
                    <ViewProvider>
                        <AppInner />
                    </ViewProvider>
                </AnalysisViewModeProvider>
            </DisplaySettingsProvider>
        </ProjectProvider>
    );
}

export default App;
