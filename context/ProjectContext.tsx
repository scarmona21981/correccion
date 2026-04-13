import React, { createContext, useContext, useState, useEffect } from 'react';
import { WetWell, Pump, PressurePipe, OutfallPressure, CalculationMethod, PressureJunction, GeometricVertex, PumpingSystem } from '../hydraulics/types';
import { ChamberFixtureLoad, SanitarySystemType, normalizeUsageClass } from '../hydraulics/qwwTables';
import { inferPipeRoleFromNodeTypes, mapLegacyPipeTypeToRole, normalizePipeRole, PipeRole } from '../utils/pipeRole';
import { migrateProject, migrateProjectSchema } from './projectMigration';
import { CURRENT_PROJECT_SCHEMA_VERSION, CURRENT_PROJECT_VERSION, normalizeSchemaVersion } from './projectSchema';

// Define types here or import them if shared. Using basic ‘any’ for internal detailed types to avoid circular deps if types are in Workspace.
// Better to move types to a shared file, but for now we define what we need.
export interface AttributeValue {
    value: number | string;
    origin: 'manual' | 'calculated';
}

export interface Chamber {
    id: string;
    userDefinedId: string;
    x: number;
    y: number;
    CT: AttributeValue;
    H: AttributeValue;
    heightLocked?: boolean;
    Cre: AttributeValue;
    CRS: AttributeValue;
    delta: AttributeValue;
    deltaMode: 'auto' | 'manual';
    Qin: AttributeValue;
    uehPropias: AttributeValue;
    uehAcumuladas: AttributeValue;
    chamberType: 'Domiciliaria' | 'Pública';
    qinAcumulado?: AttributeValue;
    chamberDimension: string;
    hasCRe?: boolean;
    incomingElevations?: { pipeId: string, value: number }[];
    /** Delta por tramo de entrada: Cre(tramo) = CRS + Δ(tramo). */
    incomingDeltas?: Record<string, number>;
    manualIncomingH?: Record<string, number>;
    uehInputMethod?: 'manual' | 'artifact';
    fixtureLoads?: ChamberFixtureLoad[];
    qwwPropio?: AttributeValue;
    qwwAcumulado?: AttributeValue;
    installationGroupId?: string;
    sources?: string[];
    topologyRole?: string;
    Q_source_Lps?: number;
    /** Población aportante local (P_local en hab). Solo usado en proyectos Públicos. */
    populationLocal?: number | null;
    /** Población acumulada aguas arriba (calculada, solo lectura). */
    P_acum?: number;
}

export interface PipeAutoClassification {
    sources: string[];
    pipeRole: PipeRole;
    topologyRegime: string;
    topologyRole: string;
    Q_design_Lps_acc?: number;
    normativeRegime?: string;
    normativeRole?: string;
}

export interface PipeOverride {
    enabled: boolean;
    pipeRole?: PipeRole;
    reason?: string;
    changedAt?: string;
    normativeRegime?: string;
    normativeRole?: string;
    norma?: string;
    role1105?: string;
    role3371?: string;
}

export interface PipeEffective {
    pipeRole: PipeRole;
    topologyRegime: string;
    topologyRole: string;
}

export type NCh1105PeakMode = 'AUTO' | 'FORCE_HARMON' | 'STRICT';

export interface NCh1105Settings {
    enabled: boolean;
    peakMode: NCh1105PeakMode;
    habPorCasa?: number | null;
}

export type NCh1105FlowMethod = 'HARMON' | 'BSCE' | 'INTERPOLACION' | 'CAUDAL_DIRECTO' | null;

export interface PipeHydraulicsInputs {
    P_total?: number;
    P_edge?: number;
    D?: number;
    R?: number;
    C?: number;
    QmdAS_Lps?: number;
    M_harmon?: number;
    UEH_total?: number;
    UEH_upstream?: number;
    Qww_Lps?: number;
    N_casas?: number;
    equivalentHouses?: number;
    habPorCasaUsado?: number;
    Qbsce_Lps?: number;
    peakMode?: NCh1105PeakMode;
    peakReason?: 'AUTO' | 'FORZADO_HARMON' | 'ESTRICTO';
    peakNote?: string;
    peakBlocked?: boolean;
    peakMissingHabPorCasa?: boolean;
    habPorCasa?: number | null;
}

export interface PipeHydraulicsDesign {
    Q_design_Lps: number;
    methodQ: 'UEH' | 'HARMON' | 'INTERPOLACION' | 'TABLA' | 'CAUDAL_DIRECTO';
    flowMethodNCh1105?: NCh1105FlowMethod;
    sourceMode?: 'UEH_Qww' | 'POBLACION_NCH1105' | 'POBLACION_PONDERADA_UEH';
    modelHydraulic?: 'MANNING';
    inputs?: PipeHydraulicsInputs;
}

export interface Pipe {
    id: string;
    userDefinedId: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    startNodeId?: string;
    endNodeId?: string;
    material: AttributeValue;
    diameter: AttributeValue;
    length: AttributeValue;
    lengthMode?: 'manual' | 'auto';
    slope: AttributeValue;
    uehTransportadas: AttributeValue;
    qContinuous?: AttributeValue;
    qinTransportado?: AttributeValue;
    qwwTransportado?: AttributeValue;
    pipeRole?: PipeRole;
    hasUpstreamInput?: boolean;
    slopeLocked?: boolean;
    isSlopeManual?: boolean;
    manualSlope?: AttributeValue;
    sdr?: AttributeValue;
    vertices?: GeometricVertex[];
    sources?: string[];
    topologyRole?: string;
    topologyRegime?: string;
    Q_design_Lps?: number;
    auto?: PipeAutoClassification;
    override?: PipeOverride;
    effective?: PipeEffective;
    P_tributaria?: number;
    P_edge?: number;
    Qmed_Lps?: number;
    M_harmon?: number;
    Qmax_Lps?: number;
    flowMethodNCh1105?: NCh1105FlowMethod;
    flowDesignMode?: 'POPULATION_NCH1105' | 'DIRECT_Q';
    collectorSizingMode?: 'UEH_Qww' | 'POBLACION_NCH1105' | 'POBLACION_PONDERADA_UEH';
    UEH_total?: number;
    UEH_upstream?: number;
    verificationMethod?: DescargaHorizVerificationMethod;
    designMethod?: 'NCH3371_A' | 'NCH3371_B';
    designOptions?: PipeDesignOptions;
    hydraulics?: PipeHydraulicsDesign;
    cumulativeLengthDN175_m?: number;
    dnReductionFlag?: boolean;
    dnReductionMotivo?: string | null;
    qMin_Ls?: number;
    verificacion1105?: {
        max: { apto: boolean; motivo: string };
        min: { apto: boolean; motivo: string };
    };
    /**
     * Rol gravitacional normativo calculado automáticamente por topología NCh1105.
     * NACIENTE: inDegree=0 en startNode; COLECTOR: inDegree>=2 en endNode; LATERAL: resto.
     * Nunca se sobreescribe con rol_manual.
     */
    gravityRole_auto?: 'NACIENTE' | 'LATERAL' | 'COLECTOR';
    /**
     * Override manual del rol NCh1105 por el usuario.
     * Si es null/undefined, se usa gravityRole_auto.
     * No se borra automáticamente al recalcular la red.
     */
    gravityRole_manual?: 'NACIENTE' | 'LATERAL' | 'COLECTOR' | null;
    manningOrigin?: 'Global' | 'Material' | 'Manual';
    manningManual?: AttributeValue;
    internalDiameterMode?: 'AUTO' | 'MANUAL';
    internalDiameterManual?: AttributeValue;
    internalDiameterResolved?: number;
    internalDiameterSource?: 'AUTO' | 'MANUAL' | 'FALLBACK_DN';
}

export interface MapDimensions {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export type ProjectUnits = 'Meters' | 'Feet' | 'Degrees' | 'None';
export type ProjectType = 'Domiciliario' | 'Público' | 'Mixto';

export type FlowDesignModeCollectors = 'POPULATION_NCH1105' | 'DIRECT_Q';

export type CollectorSizingMode = 'UEH_Qww' | 'POBLACION_NCH1105' | 'POBLACION_PONDERADA_UEH';

export type DescargaHorizVerificationMethod = 'A3_TABLA' | 'B25_MANNING';

export type RenameResult = { ok: true; value: string } | { ok: false; error: string };

export interface PipeDesignOptions {
    collectorSizingMode?: CollectorSizingMode;
    population?: {
        P: number;
        D: number;
        R: number;
        C: number;
        peakMode?: NCh1105PeakMode;
        habPorCasa?: number | null;
    };
}

export interface ProjectSettings {
    mapDimensions: MapDimensions;
    units: ProjectUnits;
    projectType: ProjectType;
    sanitarySystemType: SanitarySystemType;
    flowDesignModeCollectors: FlowDesignModeCollectors;
    verificationMode: 'UEH_MANNING' | 'MANNING_ONLY';
    hasPopulation: boolean;
    populationTotal: number;
    D_L_per_hab_day: number;
    R_recovery: number;
    C_capacity: number;
    nch1105: NCh1105Settings;
    manning: {
        value: number;
        source: 'global' | 'manual';
    };
}

interface ProjectData {
    fileType?: string;
    version?: number;
    schemaVersion?: number;
    chambers: Chamber[];
    pipes: Pipe[];
    settings?: ProjectSettings; // Optional for backward compatibility
    // Pressure/Pumping elements (optional for backward compatibility)
    wetWells?: WetWell[];
    pumps?: Pump[];
    pressurePipes?: PressurePipe[];
    outfallsPressure?: OutfallPressure[];
    pressureJunctions?: PressureJunction[];
    pumpingSystems?: PumpingSystem[];
    activePumpingSystemId?: string;
    calculationMethod?: CalculationMethod;
}

interface ProjectContextType {
    chambers: Chamber[];
    pipes: Pipe[];
    settings: ProjectSettings;
    setChambers: React.Dispatch<React.SetStateAction<Chamber[]>>;
    setPipes: React.Dispatch<React.SetStateAction<Pipe[]>>;
    setSettings: React.Dispatch<React.SetStateAction<ProjectSettings>>;
    // Pressure/Pumping elements
    wetWells: WetWell[];
    pumps: Pump[];
    pressurePipes: PressurePipe[];
    outfallsPressure: OutfallPressure[];
    calculationMethod: CalculationMethod;
    setWetWells: React.Dispatch<React.SetStateAction<WetWell[]>>;
    setPumps: React.Dispatch<React.SetStateAction<Pump[]>>;
    setPressurePipes: React.Dispatch<React.SetStateAction<PressurePipe[]>>;
    setOutfallsPressure: React.Dispatch<React.SetStateAction<OutfallPressure[]>>;
    setCalculationMethod: React.Dispatch<React.SetStateAction<CalculationMethod>>;

    // Pressure Junctions
    pressureJunctions: PressureJunction[];
    setPressureJunctions: React.Dispatch<React.SetStateAction<PressureJunction[]>>;
    pumpingSystems: PumpingSystem[];
    setPumpingSystems: React.Dispatch<React.SetStateAction<PumpingSystem[]>>;
    activePumpingSystemId: string | null;
    setActivePumpingSystemId: React.Dispatch<React.SetStateAction<string | null>>;

    filePath: string | null;
    projectSessionId: number;
    isDirty: boolean;
    createNewProject: () => void;
    openProject: () => Promise<void>;
    openProjectFromPath: (projectPath: string) => Promise<void>;
    saveProject: () => Promise<boolean>;
    saveProjectAs: () => Promise<boolean>;
    exitApplication: () => void;
    markDirty: () => void;
    undo: () => void;
    redo: () => void;
    snapshot: () => void;
    canUndo: boolean;
    canRedo: boolean;
    renameChamberUserDefinedId: (chamberId: string, nextValue: string) => RenameResult;
    renamePipeUserDefinedId: (pipeId: string, nextValue: string) => RenameResult;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    console.log('📦 ProjectProvider: Initializing...');
    const [chambers, setChambers] = useState<Chamber[]>([]);
    const [pipes, setPipes] = useState<Pipe[]>([]);
    const [settings, setSettings] = useState<ProjectSettings>({
        mapDimensions: { minX: 0, minY: 0, maxX: 1000, maxY: 1000 },
        units: 'Meters',
        projectType: 'Público',
        sanitarySystemType: 'I',
        flowDesignModeCollectors: 'DIRECT_Q',
        verificationMode: 'UEH_MANNING',
        hasPopulation: false,
        populationTotal: 0,
        D_L_per_hab_day: 150,
        R_recovery: 0.8,
        C_capacity: 1.0,
        nch1105: {
            enabled: true,
            peakMode: 'AUTO',
            habPorCasa: null
        },
        manning: {
            value: 0.013,
            source: 'global'
        }
    });
    // Pressure/Pumping elements state
    const [wetWells, setWetWells] = useState<WetWell[]>([]);
    const [pumps, setPumps] = useState<Pump[]>([]);
    const [pressurePipes, setPressurePipes] = useState<PressurePipe[]>([]);
    const [outfallsPressure, setOutfallsPressure] = useState<OutfallPressure[]>([]);
    const [pressureJunctions, setPressureJunctions] = useState<PressureJunction[]>([]);
    const [pumpingSystems, setPumpingSystems] = useState<PumpingSystem[]>([]);
    const [activePumpingSystemId, setActivePumpingSystemId] = useState<string | null>(null);
    const [calculationMethod, setCalculationMethod] = useState<CalculationMethod>('HAZEN_WILLIAMS');
    const [filePath, setFilePath] = useState<string | null>(null);
    const [projectSessionId, setProjectSessionId] = useState(0);
    const [isDirty, setIsDirty] = useState(false);

    const normalizeElementLabel = (value: string): string => value.trim().toUpperCase();

    const renameChamberUserDefinedId = (chamberId: string, nextValue: string): RenameResult => {
        const normalized = normalizeElementLabel(nextValue);
        if (!normalized) return { ok: false, error: 'El nombre de la cámara no puede estar vacío' };

        const duplicated = chambers.some(chamber => (
            chamber.id !== chamberId
            && normalizeElementLabel(chamber.userDefinedId || '') === normalized
        ));
        if (duplicated) return { ok: false, error: 'Ya existe una cámara con ese nombre' };

        setChambers(prev => prev.map(chamber => (
            chamber.id === chamberId
                ? { ...chamber, userDefinedId: normalized }
                : chamber
        )));

        return { ok: true, value: normalized };
    };

    const renamePipeUserDefinedId = (pipeId: string, nextValue: string): RenameResult => {
        const normalized = normalizeElementLabel(nextValue);
        if (!normalized) return { ok: false, error: 'El nombre del tramo no puede estar vacío' };

        const duplicated = pipes.some(pipe => (
            pipe.id !== pipeId
            && normalizeElementLabel(pipe.userDefinedId || '') === normalized
        ));
        if (duplicated) return { ok: false, error: 'Ya existe un tramo con ese nombre' };

        setPipes(prev => prev.map(pipe => (
            pipe.id === pipeId
                ? { ...pipe, userDefinedId: normalized }
                : pipe
        )));

        return { ok: true, value: normalized };
    };

    const urlParams = React.useMemo(() => new URLSearchParams(window.location.search), []);
    const windowId = urlParams.get('windowId') || 'main';
    const isPopout = urlParams.get('popout') === '1';

    // When data changes, mark dirty. 
    // Optimization: Only mark dirty if it wasn't a "load" operation. 
    // We can use a ref to track if we are loading.
    const isLoadingRef = React.useRef(false);
    const emitTimerRef = React.useRef<number | null>(null);
    const lastAppliedSnapshotRef = React.useRef<string | null>(null);

    useEffect(() => {
        if (!isLoadingRef.current) {
            setIsDirty(true);
        }
    }, [chambers, pipes, settings, wetWells, pumps, pressurePipes, outfallsPressure, pressureJunctions, pumpingSystems, activePumpingSystemId, calculationMethod]);

    // Initial load reset
    useEffect(() => {
        isLoadingRef.current = false;
    }, []);

    // AUTO-RECALCULATION: Unified observer using recalcProject
    // Pipeline: Geometry → Topology (roles) → UEH → Qww → Flow → Sanitary → Hydraulic
    useEffect(() => {
        if (isLoadingRef.current) return;
        if (isPopout) return;
        if (chambers.length === 0 && pipes.length === 0) return;

        console.log('🔄 ProjectContext: Auto-recalculating via recalcProject...');

        import('../engines/recalcProject').then(({ recalcProjectFromSettings }) => {
            const result = recalcProjectFromSettings(chambers, pipes, settings);

            const chambersChanged = JSON.stringify(result.chambers) !== JSON.stringify(chambers);
            const pipesChanged = JSON.stringify(result.pipes) !== JSON.stringify(pipes);

            if (chambersChanged || pipesChanged) {
                if (chambersChanged) setChambers(result.chambers);
                if (pipesChanged) setPipes(result.pipes);
            }

            if (result.errors.length > 0) {
                console.warn('⚠️ recalcProject errors:', result.errors);
            }
        });
    }, [
        isPopout,
        projectSessionId,
        chambers.length,
        pipes.length,
        settings.sanitarySystemType,
        settings.flowDesignModeCollectors,
        settings.verificationMode,
        settings.hasPopulation,
        settings.populationTotal,
        settings.D_L_per_hab_day,
        settings.R_recovery,
        settings.C_capacity,
        settings.nch1105?.peakMode,
        settings.nch1105?.habPorCasa,
        settings.projectType,             // ← cambio Domiciliario/Público/Mixto
        chambers.reduce((sum, c) =>
            sum +
            Number(c.Qin?.value || 0) + Number(c.uehPropias?.value || 0) +
            Number(c.CT?.value || 0) + (c.CT?.origin === 'manual' ? 1000 : 0) +
            Number(c.H?.value || 0) + (c.H?.origin === 'manual' ? 2000 : 0) +
            ((typeof c.heightLocked === 'boolean' ? c.heightLocked : c.H?.origin === 'manual') ? 4000 : 0) +
            Number(c.delta?.value || 0) +
            // Δ por tramo (cámara): gatilla recálculo geométrico al editar entradas por tramo
            (c.incomingDeltas
                ? Object.entries(c.incomingDeltas).reduce((acc, [k, v]) => acc + k.length * 17 + Number(v || 0) * 1000, 0)
                : 0) +
            // Legacy: H manual por tramo
            (c.manualIncomingH
                ? Object.entries(c.manualIncomingH).reduce((acc, [k, v]) => acc + k.length * 11 + Number(v || 0) * 1000, 0)
                : 0) +
            Number(c.populationLocal ?? 0) * 7 +   // ← P_local para proyectos Públicos
            (c.installationGroupId ? c.installationGroupId.length * 100 : 0) +
            (c.chamberType === 'Domiciliaria' ? 3000 : 0) +
            (c.sources ? c.sources.length * 50 : 0) +
            (c.topologyRole ? c.topologyRole.length * 20 : 0), 0),
        pipes.reduce((sum, p) => sum +
            (p.startNodeId ? 1 : 0) + (p.endNodeId ? 1 : 0) +
            Number(p.manualSlope?.value || 0) + ((typeof p.slopeLocked === 'boolean' ? p.slopeLocked : p.isSlopeManual) ? 5000 : 0) +
            Number((p.length as any)?.value || 0) +
            ((p.lengthMode === 'auto') ? 7000 : 0) +
            Number(p.diameter?.value || 0) + Number(p.slope?.value || 0) +
            (p.pipeRole === 'INTERIOR_RAMAL' ? 101 : p.pipeRole === 'DESCARGA_HORIZ' ? 211 : p.pipeRole === 'COLECTOR_EXTERIOR' ? 307 : 0) +
            (p.auto?.pipeRole === 'INTERIOR_RAMAL' ? 401 : p.auto?.pipeRole === 'DESCARGA_HORIZ' ? 503 : p.auto?.pipeRole === 'COLECTOR_EXTERIOR' ? 601 : 0) +
            (p.effective?.pipeRole === 'INTERIOR_RAMAL' ? 701 : p.effective?.pipeRole === 'DESCARGA_HORIZ' ? 809 : p.effective?.pipeRole === 'COLECTOR_EXTERIOR' ? 907 : 0) +
            ((p.override?.enabled ? 1009 : 0) +
                (p.override?.pipeRole === 'INTERIOR_RAMAL' ? 1103 : p.override?.pipeRole === 'DESCARGA_HORIZ' ? 1201 : p.override?.pipeRole === 'COLECTOR_EXTERIOR' ? 1301 : 0)) +
            (p.topologyRegime === 'NCH1105' ? 1409 : p.topologyRegime === 'NCH3371' ? 1423 : 0) +
            (p.effective?.topologyRegime === 'NCH1105' ? 1451 : p.effective?.topologyRegime === 'NCH3371' ? 1471 : 0) +
            (p.gravityRole_manual === 'NACIENTE' ? 1489 : p.gravityRole_manual === 'LATERAL' ? 1493 : p.gravityRole_manual === 'COLECTOR' ? 1499 : 0) +
            (p.sources ? p.sources.length * 50 : 0) +
            (p.topologyRole ? p.topologyRole.length * 20 : 0) +
            (p.designOptions?.collectorSizingMode ? p.designOptions.collectorSizingMode.length * 25 : 0) +
            Number(p.designOptions?.population?.P || 0) +
            Number(p.designOptions?.population?.D || 0) +
            Number(p.designOptions?.population?.R || 0) +
            Number(p.designOptions?.population?.C || 0) +
            (p.verificationMethod ? p.verificationMethod.length * 7 : 0) +
            Number(p.uehTransportadas?.value || 0) +
            Number(p.Q_design_Lps || 0) +
            Number(p.hydraulics?.Q_design_Lps || 0), 0)
    ]);

    const getCurrentContent = () => {
        const data: ProjectData = {
            fileType: 'SMCALC_ALC',
            version: CURRENT_PROJECT_VERSION,
            schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
            chambers,
            pipes,
            settings,
            // Include pressure elements if present
            wetWells: wetWells.length > 0 ? wetWells : undefined,
            pumps: pumps.length > 0 ? pumps : undefined,
            pressurePipes: pressurePipes.length > 0 ? pressurePipes : undefined,
            outfallsPressure: outfallsPressure.length > 0 ? outfallsPressure : undefined,
            pressureJunctions: pressureJunctions.length > 0 ? pressureJunctions : undefined,
            pumpingSystems: pumpingSystems.length > 0 ? pumpingSystems : undefined,
            activePumpingSystemId: activePumpingSystemId || undefined,
            calculationMethod: pumps.length > 0 ? calculationMethod : undefined
        };
        return JSON.stringify(data, null, 2);
    };

    useEffect(() => {
        if (isPopout) return;
        if (!window.electronAPI?.sendProjectSnapshot) return;

        const snapshotJson = getCurrentContent();
        if (snapshotJson === lastAppliedSnapshotRef.current) {
            return;
        }

        if (emitTimerRef.current) {
            window.clearTimeout(emitTimerRef.current);
        }

        emitTimerRef.current = window.setTimeout(() => {
            window.electronAPI.sendProjectSnapshot({
                snapshotJson,
                sourceWindowId: windowId
            });
        }, 250);

        return () => {
            if (emitTimerRef.current) {
                window.clearTimeout(emitTimerRef.current);
            }
        };
    }, [
        isPopout,
        windowId,
        chambers,
        pipes,
        settings,
        wetWells,
        pumps,
        pressurePipes,
        outfallsPressure,
        pressureJunctions,
        pumpingSystems,
        activePumpingSystemId,
        calculationMethod
    ]);

    useEffect(() => {
        if (!window.electronAPI?.onProjectSnapshot) return;

        const applySnapshotJson = (snapshotJson: string | null | undefined, sourceWindowId?: string) => {
            if (!snapshotJson || sourceWindowId === windowId) return;
            if (snapshotJson === lastAppliedSnapshotRef.current) return;

            let parsed: ProjectData | null = null;
            try {
                parsed = JSON.parse(snapshotJson) as ProjectData;
            } catch {
                return;
            }
            if (!parsed) return;

            lastAppliedSnapshotRef.current = snapshotJson;
            isLoadingRef.current = true;

            setChambers(Array.isArray(parsed.chambers) ? parsed.chambers : []);
            setPipes(Array.isArray(parsed.pipes) ? parsed.pipes : []);
            setSettings(prev => parsed?.settings || prev);

            setWetWells(Array.isArray(parsed.wetWells) ? parsed.wetWells : []);
            setPumps(Array.isArray(parsed.pumps) ? parsed.pumps : []);
            setPressurePipes(Array.isArray(parsed.pressurePipes) ? parsed.pressurePipes : []);
            setOutfallsPressure(Array.isArray(parsed.outfallsPressure) ? parsed.outfallsPressure : []);
            setPressureJunctions(Array.isArray(parsed.pressureJunctions) ? parsed.pressureJunctions : []);
            setPumpingSystems(Array.isArray(parsed.pumpingSystems) ? parsed.pumpingSystems : []);
            setActivePumpingSystemId(parsed.activePumpingSystemId || null);

            setCalculationMethod(parsed.calculationMethod || 'HAZEN_WILLIAMS');

            setIsDirty(false);
            window.setTimeout(() => {
                isLoadingRef.current = false;
            }, 50);
        };

        const unsub = window.electronAPI.onProjectSnapshot(({ snapshotJson, sourceWindowId }) => {
            applySnapshotJson(snapshotJson, sourceWindowId);
        });

        if (window.electronAPI.getLatestProjectSnapshot) {
            window.electronAPI.getLatestProjectSnapshot()
                .then((snapshotJson) => {
                    applySnapshotJson(snapshotJson, 'main');
                })
                .catch(() => {
                    // No-op: this is a best-effort hydration path.
                });
        }

        return () => {
            if (typeof unsub === 'function') {
                unsub();
            }
        };
    }, [windowId]);

    const markDirty = () => setIsDirty(true);

    const bumpProjectSession = () => setProjectSessionId(prev => prev + 1);

    const ensureArray = <T = any>(value: any): T[] => {
        if (Array.isArray(value)) return value as T[];

        if (value && typeof value === 'object') {
            return Object.values(value)
                .filter(item => item !== null && item !== undefined) as T[];
        }

        return [];
    };

    const tryParseEmbeddedJson = (value: any): any => {
        if (typeof value !== 'string') return value;

        const candidate = sanitizeJsonText(value);
        if (!candidate) return value;

        try {
            return JSON.parse(candidate);
        } catch {
            return value;
        }
    };

    const unwrapProjectEnvelope = (raw: any): any => {
        const parsedRaw = tryParseEmbeddedJson(raw);
        if (!parsedRaw || typeof parsedRaw !== 'object') return {};

        const rawObj = parsedRaw as any;

        const envelopeKeys = ['project', 'projectData', 'data', 'payload'];
        for (const key of envelopeKeys) {
            const parsed = tryParseEmbeddedJson(rawObj[key]);
            if (parsed && typeof parsed === 'object') return parsed;
        }

        return rawObj;
    };

    const sanitizeJsonText = (content: string): string => {
        return content
            .replace(/^\uFEFF/, '')
            .replace(/\u0000/g, '')
            .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:])\/\/.*$/gm, '$1')
            .replace(/,\s*([}\]])/g, '$1')
            .replace(/;\s*$/, '')
            .trim();
    };

    const legacyJsonToStrictJson = (content: string): string => {
        return content
            .replace(/\bNaN\b/g, 'null')
            .replace(/\bundefined\b/g, 'null')
            .replace(/\b-?Infinity\b/g, 'null')
            .replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)/g, '$1"$2"$3')
            .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, g1: string) => `"${g1.replace(/"/g, '\\"')}"`);
    };

    const normalizeCalculationMethod = (rawMethod: any): CalculationMethod | undefined => {
        if (!rawMethod) return undefined;
        const method = String(rawMethod).toUpperCase().replace(/[^A-Z_]/g, '');
        if (method.includes('DARCY')) return 'DARCY_WEISBACH';
        if (method.includes('HAZEN')) return 'HAZEN_WILLIAMS';
        return undefined;
    };

    const normalizeProjectShape = (raw: any): ProjectData => {
        const root = unwrapProjectEnvelope(raw);

        const chambers = ensureArray<Chamber>(
            root?.chambers ?? root?.cameras ?? root?.camaras ?? root?.nodes ?? root?.camarasSanitarias ?? root?.manholes ?? []
        );

        const pipes = ensureArray<Pipe>(
            root?.pipes ?? root?.tuberias ?? root?.links ?? root?.lines ?? root?.edges ?? root?.segments ?? root?.tubos ?? []
        );

        const settings = (root?.settings && typeof root.settings === 'object')
            ? root.settings
            : ((root?.projectSettings && typeof root.projectSettings === 'object')
                ? root.projectSettings
                : ((root?.config && typeof root.config === 'object')
                    ? root.config
                    : ((root?.configuration && typeof root.configuration === 'object') ? root.configuration : undefined)));

        const wetWells = ensureArray<WetWell>(root?.wetWells ?? root?.wetwells ?? root?.wet_wells ?? root?.camarasBombeo ?? []);
        const pumps = ensureArray<Pump>(root?.pumps ?? root?.bombas ?? []);
        const pressurePipes = ensureArray<PressurePipe>(root?.pressurePipes ?? root?.impulsionPipes ?? root?.impulsion_lines ?? root?.tuberiasImpulsion ?? root?.lineasImpulsion ?? []);
        const outfallsPressure = ensureArray<OutfallPressure>(root?.outfallsPressure ?? root?.discharges ?? root?.descargas ?? []);
        const pressureJunctions = ensureArray<PressureJunction>(root?.pressureJunctions ?? root?.junctions ?? root?.nodesPressure ?? root?.nudosPresion ?? root?.junctionPressure ?? []);
        const pumpingSystems = ensureArray<PumpingSystem>(root?.pumpingSystems ?? root?.systems ?? root?.pressureSystems ?? []);
        const activePumpingSystemId = typeof root?.activePumpingSystemId === 'string' ? root.activePumpingSystemId : undefined;

        return {
            chambers,
            pipes,
            settings,
            version: typeof root?.version === 'number'
                ? root.version
                : (typeof root?.version === 'string' && Number.isFinite(Number(root.version))
                    ? Number(root.version)
                    : undefined),
            schemaVersion: normalizeSchemaVersion(root?.schemaVersion),
            wetWells,
            pumps,
            pressurePipes,
            outfallsPressure,
            pressureJunctions,
            pumpingSystems,
            activePumpingSystemId,
            calculationMethod: normalizeCalculationMethod(root?.calculationMethod)
        };
    };

    const parseProjectData = (rawContent: string): { project: ProjectData; warning?: string } => {
        const raw = rawContent.replace(/^\uFEFF/, '').trim();

        const parseAttempts: string[] = [];
        let parsedContent: any = null;

        const tryParse = (candidate: string): any | null => {
            if (!candidate) return null;
            try {
                return JSON.parse(candidate);
            } catch (error) {
                parseAttempts.push(error instanceof Error ? error.message : String(error));
                return null;
            }
        };

        const directParsed = tryParse(raw);
        if (directParsed) {
            parsedContent = tryParseEmbeddedJson(directParsed);
        }

        const sanitized = sanitizeJsonText(raw);
        if (!parsedContent) {
            const sanitizedParsed = tryParse(sanitized);
            if (sanitizedParsed) {
                parsedContent = tryParseEmbeddedJson(sanitizedParsed);
            }
        }

        if (!parsedContent) {
            const legacyStrict = legacyJsonToStrictJson(sanitized);
            const legacyParsed = tryParse(legacyStrict);
            if (legacyParsed) {
                parsedContent = tryParseEmbeddedJson(legacyParsed);
            }
        }

        if (!parsedContent) {
            const firstBrace = sanitized.indexOf('{');
            const lastBrace = sanitized.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace > firstBrace) {
                const jsonSegment = sanitized.slice(firstBrace, lastBrace + 1);
                const segmentParsed = tryParse(jsonSegment);
                if (segmentParsed) {
                    parsedContent = tryParseEmbeddedJson(segmentParsed);
                } else {
                    const legacySegment = legacyJsonToStrictJson(jsonSegment);
                    const legacySegmentParsed = tryParse(legacySegment);
                    if (legacySegmentParsed) {
                        parsedContent = tryParseEmbeddedJson(legacySegmentParsed);
                    }
                }
            }
        }

        if (!parsedContent) {
            const firstBracket = sanitized.indexOf('[');
            const lastBracket = sanitized.lastIndexOf(']');
            if (firstBracket !== -1 && lastBracket > firstBracket) {
                const arraySegment = sanitized.slice(firstBracket, lastBracket + 1);
                const arrayParsed = tryParse(arraySegment);
                if (Array.isArray(arrayParsed)) {
                    parsedContent = { chambers: arrayParsed, pipes: [] };
                }
            }
        }

        if (!parsedContent) {
            const detail = parseAttempts.length > 0 ? parseAttempts[parseAttempts.length - 1] : 'Formato no reconocido';
            console.warn('[ProjectContext] JSON no legible, se abrirá con valores por defecto.', detail);
            const safeFallback = migrateProject({});
            return {
                project: normalizeProjectShape(safeFallback),
                warning: `No se pudo leer completamente el archivo. Se abrió una versión recuperada con valores por defecto. Detalle: ${detail}`
            };
        }

        const migration = migrateProjectSchema(parsedContent);
        const migrationWarning = migration.meta.schemaMigrated
            ? 'Proyecto anterior actualizado automáticamente al nuevo motor de cálculo.'
            : undefined;

        return {
            project: normalizeProjectShape(migration.project),
            warning: migrationWarning
        };
    };

    const loadProject = async (targetPath: string): Promise<{ project: ProjectData; warning?: string }> => {
        try {
            const loaded = await window.electronAPI.loadProject(targetPath);
            if (!loaded || typeof loaded.content !== 'string') {
                console.warn('[ProjectContext] loadProject: contenido vacío, se aplican defaults.');
                return {
                    project: normalizeProjectShape(migrateProject({})),
                    warning: 'No se pudo leer el archivo seleccionado. Se abrió un proyecto por defecto.'
                };
            }

            return parseProjectData(loaded.content);
        } catch (error) {
            console.warn('[ProjectContext] loadProject: error no fatal durante lectura.', error);
            return {
                project: normalizeProjectShape(migrateProject({})),
                warning: 'Error al leer archivo. Se abrió un proyecto por defecto para evitar pérdida de sesión.'
            };
        }
    };

    const migratePressureSystems = (input: {
        wetWells: WetWell[];
        pumps: Pump[];
        pressurePipes: PressurePipe[];
        outfallsPressure: OutfallPressure[];
        pressureJunctions: PressureJunction[];
        pumpingSystems?: PumpingSystem[];
        activePumpingSystemId?: string;
    }): {
        wetWells: WetWell[];
        pumps: Pump[];
        pressurePipes: PressurePipe[];
        outfallsPressure: OutfallPressure[];
        pressureJunctions: PressureJunction[];
        pumpingSystems: PumpingSystem[];
        activePumpingSystemId: string | null;
    } => {
        const wetWellIds = new Set(input.wetWells.map(w => w.id));
        const pumpIds = new Set(input.pumps.map(p => p.id));
        const junctionIds = new Set(input.pressureJunctions.map(j => j.id));
        const outfallIds = new Set(input.outfallsPressure.map(o => o.id));

        const pipeById = new Map(input.pressurePipes.map(p => [p.id, p]));

        const normalizePipeKind = (pipe: PressurePipe): 'pipe' | 'pump_link' => {
            if (pipe.kind === 'pump_link') return 'pump_link';
            if (pipe.kind === 'pipe') return 'pipe';

            const a = pipe.startNodeId;
            const b = pipe.endNodeId;
            const isWetWellToPump =
                (!!a && !!b) && (
                    (wetWellIds.has(a) && pumpIds.has(b))
                    || (wetWellIds.has(b) && pumpIds.has(a))
                );
            return isWetWellToPump ? 'pump_link' : 'pipe';
        };

        const normalizedPipes = input.pressurePipes.map(pipe => ({
            ...pipe,
            kind: normalizePipeKind(pipe)
        }));

        const pumpLinkByPumpId = new Map<string, PressurePipe>();
        normalizedPipes
            .filter(pipe => pipe.kind === 'pump_link')
            .forEach(pipe => {
                const start = pipe.startNodeId;
                const end = pipe.endNodeId;
                if (start && pumpIds.has(start)) pumpLinkByPumpId.set(start, pipe);
                if (end && pumpIds.has(end)) pumpLinkByPumpId.set(end, pipe);
            });

        const dischargePipeByPumpId = new Map<string, PressurePipe>();
        normalizedPipes
            .filter(pipe => pipe.kind === 'pipe')
            .forEach(pipe => {
                if (pipe.startNodeId && pumpIds.has(pipe.startNodeId)) {
                    dischargePipeByPumpId.set(pipe.startNodeId, pipe);
                }
            });

        const existingSystems = (input.pumpingSystems || [])
            .filter(system => system && typeof system.id === 'string' && system.id.trim() !== '')
            .map(system => ({ ...system }));

        const systems: PumpingSystem[] = [];
        const usedSystemIds = new Set<string>();
        const reserveSystemId = (seed?: string): string => {
            const preferred = typeof seed === 'string' ? seed.trim() : '';
            if (preferred && !usedSystemIds.has(preferred)) {
                usedSystemIds.add(preferred);
                return preferred;
            }
            let index = 1;
            while (usedSystemIds.has(`S-${index}`)) index++;
            const id = `S-${index}`;
            usedSystemIds.add(id);
            return id;
        };

        existingSystems.forEach(system => {
            systems.push({
                id: reserveSystemId(system.id),
                name: system.name || system.id || 'Sistema',
                color: system.color,
                wetWellId: system.wetWellId || '',
                pumpId: system.pumpId || '',
                dischargeStartNodeId: system.dischargeStartNodeId || system.pumpId || '',
                outfallNodeId: system.outfallNodeId || ''
            });
        });

        if (systems.length === 0) {
            input.pumps.forEach((pump, index) => {
                const pumpLink = pumpLinkByPumpId.get(pump.id);
                const inferredWetWellId =
                    (typeof pump.wetWellId === 'string' && wetWellIds.has(pump.wetWellId) ? pump.wetWellId : '')
                    || (pumpLink?.startNodeId && wetWellIds.has(pumpLink.startNodeId) ? pumpLink.startNodeId : '')
                    || (pumpLink?.endNodeId && wetWellIds.has(pumpLink.endNodeId) ? pumpLink.endNodeId : '');

                const dischargePipe =
                    ((typeof pump.dischargeLineId === 'string' && pipeById.get(pump.dischargeLineId)) || undefined)
                    || ((typeof pump.dischargePipeId === 'string' && pipeById.get(pump.dischargePipeId)) || undefined)
                    || dischargePipeByPumpId.get(pump.id);

                const outfallNodeId = dischargePipe?.endNodeId || '';
                const systemId = reserveSystemId(pump.systemId || `S-${index + 1}`);

                systems.push({
                    id: systemId,
                    name: `Sistema ${index + 1}`,
                    color: undefined,
                    wetWellId: inferredWetWellId,
                    pumpId: pump.id,
                    dischargeStartNodeId: pump.id,
                    outfallNodeId
                });
            });
        }

        if (systems.length === 0) {
            systems.push({
                id: reserveSystemId('S-1'),
                name: 'Sistema 1',
                color: undefined,
                wetWellId: input.wetWells[0]?.id || '',
                pumpId: input.pumps[0]?.id || '',
                dischargeStartNodeId: input.pumps[0]?.id || '',
                outfallNodeId: input.outfallsPressure[0]?.id || input.pressureJunctions[0]?.id || ''
            });
        }

        const systemByPumpId = new Map<string, string>();
        const systemByWetWellId = new Map<string, string>();
        const systemByOutfallNodeId = new Map<string, string>();
        systems.forEach(system => {
            if (system.pumpId) systemByPumpId.set(system.pumpId, system.id);
            if (system.wetWellId) systemByWetWellId.set(system.wetWellId, system.id);
            if (system.outfallNodeId) systemByOutfallNodeId.set(system.outfallNodeId, system.id);
        });

        const defaultSystemId = systems[0].id;

        const wetWells = input.wetWells.map(w => ({
            ...w,
            kind: 'wet_well' as const,
            systemId: w.systemId || systemByWetWellId.get(w.id) || defaultSystemId,
            allowMultiplePumps: !!w.allowMultiplePumps
        }));

        const pumps = input.pumps.map(p => {
            const linkedSystemId = p.systemId || systemByPumpId.get(p.id) || systemByWetWellId.get(p.wetWellId) || defaultSystemId;

            const pumpLink = pumpLinkByPumpId.get(p.id);
            const inferredWetWellId =
                (p.wetWellId && wetWellIds.has(p.wetWellId) ? p.wetWellId : '')
                || (pumpLink?.startNodeId && wetWellIds.has(pumpLink.startNodeId) ? pumpLink.startNodeId : '')
                || (pumpLink?.endNodeId && wetWellIds.has(pumpLink.endNodeId) ? pumpLink.endNodeId : '');

            const dischargePipe =
                (p.dischargeLineId && pipeById.get(p.dischargeLineId))
                || (p.dischargePipeId && pipeById.get(p.dischargePipeId))
                || dischargePipeByPumpId.get(p.id);

            return {
                ...p,
                kind: 'pump' as const,
                systemId: linkedSystemId,
                wetWellId: inferredWetWellId || '',
                dischargeLineId: dischargePipe?.id || p.dischargeLineId || p.dischargePipeId || ''
            };
        });

        const pressurePipes = normalizedPipes.map(pipe => {
            const byStart = pipe.startNodeId ? systemByPumpId.get(pipe.startNodeId) || systemByWetWellId.get(pipe.startNodeId) : undefined;
            const byEnd = pipe.endNodeId ? systemByOutfallNodeId.get(pipe.endNodeId) || systemByWetWellId.get(pipe.endNodeId) : undefined;
            const byPumpDischarge = pumps.find(p => p.dischargeLineId === pipe.id)?.systemId;

            return {
                ...pipe,
                kind: normalizePipeKind(pipe),
                systemId: pipe.systemId || byPumpDischarge || byStart || byEnd || defaultSystemId
            };
        });

        const outfallsPressure = input.outfallsPressure.map(outfall => ({
            ...outfall,
            kind: 'outfall' as const,
            systemId: outfall.systemId || systemByOutfallNodeId.get(outfall.id) || defaultSystemId
        }));

        const pressureJunctions = input.pressureJunctions.map(junction => ({
            ...junction,
            kind: (junction.boundaryType === 'PRESSURE_BREAK' ? 'break_pressure_chamber' : 'junction') as 'junction' | 'break_pressure_chamber',
            systemId: junction.systemId || systemByOutfallNodeId.get(junction.id) || defaultSystemId
        }));

        const refreshedSystems = systems.map((system, index) => {
            const pump = pumps.find(p => p.id === system.pumpId) || pumps.find(p => p.systemId === system.id);
            const wetWell = wetWells.find(w => w.id === system.wetWellId) || wetWells.find(w => w.systemId === system.id);
            const dischargePipe = pressurePipes.find(pipe => pipe.id === (pump?.dischargeLineId || ''))
                || pressurePipes.find(pipe => pipe.systemId === system.id && pipe.kind === 'pipe' && pipe.startNodeId === (pump?.id || ''));

            const outfallNodeId = dischargePipe?.endNodeId
                || system.outfallNodeId
                || outfallsPressure.find(outfall => outfall.systemId === system.id)?.id
                || pressureJunctions.find(junction => junction.systemId === system.id && (junction.boundaryType === 'ATMOSPHERIC' || junction.boundaryType === 'PRESSURE_BREAK' || junction.boundaryType === 'FIXED_HEAD'))?.id
                || '';

            return {
                id: system.id,
                name: system.name || `Sistema ${index + 1}`,
                color: system.color,
                wetWellId: wetWell?.id || system.wetWellId || '',
                pumpId: pump?.id || system.pumpId || '',
                dischargeStartNodeId: pump?.id || system.dischargeStartNodeId || '',
                outfallNodeId
            };
        });

        const activePumpingSystemId = refreshedSystems.some(system => system.id === input.activePumpingSystemId)
            ? (input.activePumpingSystemId as string)
            : (refreshedSystems[0]?.id || null);

        return {
            wetWells,
            pumps,
            pressurePipes,
            outfallsPressure,
            pressureJunctions,
            pumpingSystems: refreshedSystems,
            activePumpingSystemId
        };
    };

    const handleUnsavedChanges = (): boolean => {
        if (isDirty && (chambers.length > 0 || pipes.length > 0)) { // Only if there's actual data
            return !window.confirm('You have unsaved changes. Are you sure you want to discard them?');
        }
        return false;
    };

    const [history, setHistory] = useState<{
        chambers: Chamber[],
        pipes: Pipe[],
        wetWells: WetWell[],
        pumps: Pump[],
        pressurePipes: PressurePipe[],
        outfallsPressure: OutfallPressure[],
        pressureJunctions: PressureJunction[],
        pumpingSystems: PumpingSystem[],
        activePumpingSystemId: string | null
    }[]>([]);
    const [future, setFuture] = useState<{
        chambers: Chamber[],
        pipes: Pipe[],
        wetWells: WetWell[],
        pumps: Pump[],
        pressurePipes: PressurePipe[],
        outfallsPressure: OutfallPressure[],
        pressureJunctions: PressureJunction[],
        pumpingSystems: PumpingSystem[],
        activePumpingSystemId: string | null
    }[]>([]);

    // Snapshot current state to history
    const snapshot = () => {
        setHistory(prev => [...prev, {
            chambers,
            pipes,
            wetWells,
            pumps,
            pressurePipes,
            outfallsPressure,
            pressureJunctions,
            pumpingSystems,
            activePumpingSystemId
        }]);
        setFuture([]); // Clear redo stack on new action
    };

    const undo = () => {
        if (history.length === 0) return;
        const previous = history[history.length - 1];
        const newHistory = history.slice(0, -1);

        setFuture(prev => [{
            chambers,
            pipes,
            wetWells,
            pumps,
            pressurePipes,
            outfallsPressure,
            pressureJunctions,
            pumpingSystems,
            activePumpingSystemId
        }, ...prev]);
        setChambers(previous.chambers);
        setPipes(previous.pipes);
        setWetWells(previous.wetWells);
        setPumps(previous.pumps);
        setPressurePipes(previous.pressurePipes);
        setOutfallsPressure(previous.outfallsPressure);
        setPressureJunctions(previous.pressureJunctions);
        setPumpingSystems(previous.pumpingSystems);
        setActivePumpingSystemId(previous.activePumpingSystemId);
        setHistory(newHistory);
    };

    const redo = () => {
        if (future.length === 0) return;
        const next = future[0];
        const newFuture = future.slice(1);

        setHistory(prev => [...prev, {
            chambers,
            pipes,
            wetWells,
            pumps,
            pressurePipes,
            outfallsPressure,
            pressureJunctions,
            pumpingSystems,
            activePumpingSystemId
        }]);
        setChambers(next.chambers);
        setPipes(next.pipes);
        setWetWells(next.wetWells);
        setPumps(next.pumps);
        setPressurePipes(next.pressurePipes);
        setOutfallsPressure(next.outfallsPressure);
        setPressureJunctions(next.pressureJunctions);
        setPumpingSystems(next.pumpingSystems);
        setActivePumpingSystemId(next.activePumpingSystemId);
        setFuture(newFuture);
    };

    // Keyboard shortcuts for Undo/Redo
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === 'z') {
                e.preventDefault();
                undo();
            } else if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
                e.preventDefault();
                redo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [history, future, chambers, pipes, wetWells, pumps, pressurePipes, outfallsPressure, pressureJunctions, pumpingSystems, activePumpingSystemId]);

    const createNewProject = () => {
        if (handleUnsavedChanges()) return;
        isLoadingRef.current = true;
        setChambers([]);
        setPipes([]);
        setWetWells([]);
        setPumps([]);
        setPressurePipes([]);
        setOutfallsPressure([]);
        setPressureJunctions([]);
        setPumpingSystems([]);
        setActivePumpingSystemId(null);
        setCalculationMethod('HAZEN_WILLIAMS');
        setHistory([]);
        setFuture([]);
        setSettings({
            mapDimensions: { minX: 0, minY: 0, maxX: 1000, maxY: 1000 },
            units: 'Meters',
            projectType: 'Público',
            sanitarySystemType: 'I',
            flowDesignModeCollectors: 'DIRECT_Q',
            verificationMode: 'UEH_MANNING',
            hasPopulation: false,
            populationTotal: 0,
            D_L_per_hab_day: 150,
            R_recovery: 0.8,
            C_capacity: 1.0,
            nch1105: {
                enabled: true,
                peakMode: 'AUTO',
                habPorCasa: null
            },
            manning: {
                value: 0.013,
                source: 'global'
            }
        });
        setFilePath(null);
        setIsDirty(false);
        bumpProjectSession();
        setTimeout(() => isLoadingRef.current = false, 100);
    };

    const applyLoadedProjectData = async (parsed: ProjectData, sourcePath: string, warning?: string) => {
        if (warning) {
            alert(warning);
        }

        const migrateAttr = (val: any, defaultVal: number | string = 0, defaultOrigin: 'manual' | 'calculated' = 'manual'): AttributeValue => {
            if (val && typeof val === 'object' && 'value' in val) {
                const finalVal = (val.value === null || (typeof val.value === 'number' && isNaN(val.value))) ? defaultVal : val.value;
                return { ...val, value: finalVal };
            }

            const finalVal = (val === null || val === undefined || (typeof val === 'number' && isNaN(val))) ? defaultVal : val;
            return { value: finalVal, origin: defaultOrigin };
        };

        const toNumber = (val: any, defaultVal = 0): number => {
            if (typeof val === 'number' && Number.isFinite(val)) return val;
            if (typeof val === 'string') {
                const normalized = val.replace(',', '.').replace(/[^0-9+\-.eE]/g, '').trim();
                const parsedNum = Number(normalized);
                if (Number.isFinite(parsedNum)) return parsedNum;
            }
            return defaultVal;
        };

        const asObject = (val: any): Record<string, any> => {
            return val && typeof val === 'object' && !Array.isArray(val) ? val : {};
        };

        const rawChambers = ensureArray<any>(parsed.chambers).filter(item => item && typeof item === 'object');
        const rawPipes = ensureArray<any>(parsed.pipes).filter(item => item && typeof item === 'object');
        const rawPressurePipes = ensureArray<any>(parsed.pressurePipes).filter(item => item && typeof item === 'object');

        const normalizeFixtureLoads = (input: any): ChamberFixtureLoad[] => {
            return ensureArray<any>(input)
                .filter(item => item && typeof item === 'object')
                .map(item => ({
                    fixtureKey: String(item.fixtureKey || item.key || item.type || '').trim(),
                    quantity: toNumber(item.quantity ?? item.qty, 0),
                    usageClass: normalizeUsageClass(item.usageClass ?? item.clase ?? item.class ?? 1)
                }))
                .filter(item => item.fixtureKey && item.quantity > 0);
        };

        const resultChambers = rawChambers.map((c: any, idx: number) => {
            const migratedH = migrateAttr(c.H, 1.5, 'manual');
            const heightLocked = typeof c.heightLocked === 'boolean'
                ? c.heightLocked
                : migratedH.origin === 'manual';

            return {
                ...c,
                id: c.id || c.ID || `C-${idx + 1}`,
                userDefinedId: c.userDefinedId || c.codigo || c.name || c.id || `C${idx + 1}`,
                x: toNumber(c.x ?? c.X ?? c.cx, 0),
                y: toNumber(c.y ?? c.Y ?? c.cy, 0),
                CT: migrateAttr(c.CT, 100, 'manual'),
                H: migratedH,
                heightLocked,
                Cre: migrateAttr(c.Cre, 98.5, 'calculated'),
                CRS: migrateAttr(c.CRS, 98.5, 'calculated'),
                delta: migrateAttr(c.delta, 0, 'manual'),
                uehPropias: migrateAttr(c.uehPropias || c.UEH, 0, 'manual'),
                uehAcumuladas: migrateAttr(c.uehAcumuladas, 0, 'calculated'),
                qwwPropio: migrateAttr(c.qwwPropio, 0, 'calculated'),
                qwwAcumulado: migrateAttr(c.qwwAcumulado, 0, 'calculated'),
                Qin: migrateAttr(c.Qin, 0, 'manual'),
                chamberType: c.chamberType || 'Domiciliaria',
                chamberDimension: c.chamberDimension || '120 cm',
                fixtureLoads: normalizeFixtureLoads(c.fixtureLoads || c.fixtures || c.artefactos)
            };
        });

        const chamberTypeById = new Map(
            resultChambers.map(chamber => [chamber.id, chamber.chamberType as 'Domiciliaria' | 'Pública'])
        );

        const inferPipeRole = (startNodeId?: string, endNodeId?: string): PipeRole => {
            const startType = startNodeId ? chamberTypeById.get(startNodeId) : undefined;
            const endType = endNodeId ? chamberTypeById.get(endNodeId) : undefined;
            return inferPipeRoleFromNodeTypes(startType, endType);
        };

        const resultPipes = rawPipes.map((p: any, idx: number) => {
            const migratedLength = migrateAttr(p.length, 0, 'manual');
            const lengthMode: 'manual' | 'auto' = p.lengthMode === 'auto' || p.lengthMode === 'manual'
                ? p.lengthMode
                : (migratedLength.origin === 'calculated' ? 'auto' : 'manual');
            const slopeLocked = typeof p.slopeLocked === 'boolean' ? p.slopeLocked : !!p.isSlopeManual;

            return {
                ...p,
                id: p.id || p.ID || `P-${idx + 1}`,
                userDefinedId: p.userDefinedId || p.codigo || p.name || p.id || `T${idx + 1}`,
                startNodeId: typeof p.startNodeId === 'string' ? p.startNodeId : (typeof p.start === 'string' ? p.start : undefined),
                endNodeId: typeof p.endNodeId === 'string' ? p.endNodeId : (typeof p.end === 'string' ? p.end : undefined),
                x1: toNumber(p.x1 ?? p.xStart, 0),
                y1: toNumber(p.y1 ?? p.yStart, 0),
                x2: toNumber(p.x2 ?? p.xEnd, 0),
                y2: toNumber(p.y2 ?? p.yEnd, 0),
                material: migrateAttr(p.material, 'PVC', 'manual'),
                diameter: migrateAttr(p.diameter, 200, 'manual'),
                length: migratedLength,
                lengthMode,
                slope: migrateAttr(p.slope, 0, 'calculated'),
                uehTransportadas: migrateAttr(p.uehTransportadas, 0, 'calculated'),
                qwwTransportado: migrateAttr(p.qwwTransportado, 0, 'calculated'),
                qContinuous: migrateAttr(p.qContinuous, 0, 'calculated'),
                pipeRole: normalizePipeRole(p.pipeRole ?? p.pipe_role)
                    || mapLegacyPipeTypeToRole(p.pipeType)
                    || inferPipeRole(
                        typeof p.startNodeId === 'string' ? p.startNodeId : (typeof p.start === 'string' ? p.start : undefined),
                        typeof p.endNodeId === 'string' ? p.endNodeId : (typeof p.end === 'string' ? p.end : undefined)
                    ),
                slopeLocked,
                isSlopeManual: slopeLocked,
                manualSlope: p.manualSlope ? migrateAttr(p.manualSlope, 0, 'manual') : undefined,
                sdr: migrateAttr(p.sdr, 'SDR17', 'manual')
            };
        });

        const resultPressurePipes = rawPressurePipes.map((p: any, idx: number) => ({
            ...p,
            id: p.id || p.ID || `PP-${idx + 1}`,
            kind: p.kind === 'pump_link' ? 'pump_link' : 'pipe',
            systemId: typeof p.systemId === 'string' ? p.systemId : undefined,
            name: p.name || p.nombre || p.id || `P-IMP-${idx + 1}`,
            x1: toNumber(p.x1 ?? p.xStart, 0),
            y1: toNumber(p.y1 ?? p.yStart, 0),
            x2: toNumber(p.x2 ?? p.xEnd, 0),
            y2: toNumber(p.y2 ?? p.yEnd, 0),
            length: toNumber(p.length, 0),
            diameter: toNumber(p.diameter, 0),
            material: p.material || 'PVC',
            z_start: toNumber(p.z_start ?? p.zStart, 0),
            z_end: toNumber(p.z_end ?? p.zEnd, 0),
            z_start_terreno: toNumber(p.z_start_terreno ?? p.zStartTerreno ?? p.terrainStart, toNumber(p.z_start ?? p.zStart, 0)),
            z_end_terreno: toNumber(p.z_end_terreno ?? p.zEndTerreno ?? p.terrainEnd, toNumber(p.z_end ?? p.zEnd, 0)),
            cover_m: toNumber(p.cover_m ?? p.coverM, 1),
            kFactors: Array.isArray(p.kFactors) ? p.kFactors : [],
            PN: toNumber(p.PN, 10),
            minPressureBar: p.minPressureBar !== undefined
                ? toNumber(p.minPressureBar, 0)
                : (p.pressureCriteria?.minPressureBar !== undefined ? toNumber(p.pressureCriteria.minPressureBar, 0) : undefined),
            pressureCriteria: (p.pressureCriteria || p.minPressureBar !== undefined)
                ? { minPressureBar: p.pressureCriteria?.minPressureBar !== undefined ? toNumber(p.pressureCriteria.minPressureBar, 0) : toNumber(p.minPressureBar, 0) }
                : undefined,
            profilePoints: ensureArray<any>(p.profilePoints).map((pt: any, pIdx: number) => ({
                ...pt,
                id: (typeof pt?.id === 'string' && pt.id.trim()) ? pt.id : `PT-${pIdx + 1}`,
                chainage: toNumber(pt?.chainage, 0),
                elevation: toNumber(pt?.elevation, 0)
            })),
            inlineNodes: ensureArray<any>(p.inlineNodes).map((n: any, nIdx: number) => ({
                ...n,
                id: (typeof n?.id === 'string' && n.id.trim()) ? n.id : `AV-${nIdx + 1}`,
                chainage: toNumber(n?.chainage, 0),
                elevation: toNumber(n?.elevation, 0),
                x: toNumber(n?.x, 0),
                y: toNumber(n?.y, 0)
            }))
        }));

        const resultWetWells = ensureArray<any>(parsed.wetWells)
            .filter(item => item && typeof item === 'object')
            .map((w: any, idx: number) => ({
                ...w,
                id: w.id || w.ID || `WW-${idx + 1}`,
                kind: 'wet_well' as const,
                systemId: typeof w.systemId === 'string' ? w.systemId : undefined,
                userDefinedId: w.userDefinedId || w.name || w.nombre || `CB-${idx + 1}`,
                x: toNumber(w.x ?? w.X, 0),
                y: toNumber(w.y ?? w.Y, 0),
                CR: toNumber(w.CR, 0),
                CT: toNumber(w.CT, 0),
                CL: toNumber(w.CL, 0),
                CI: toNumber(w.CI, 0),
                Nmin: toNumber(w.Nmin, 0),
                Noff: toNumber(w.Noff, 0),
                N1on: toNumber(w.N1on, 0),
                Nalarm: toNumber(w.Nalarm, 0),
                safetyMarginRequirement: toNumber(w.safetyMarginRequirement, 15),
                submergenceRequirement: toNumber(
                    w.submergenceRequirement ?? w.minimumSubmergence ?? w.minSubmergence,
                    0.5
                ),
                allowMultiplePumps: !!w.allowMultiplePumps
            }));

        const resultPumps = ensureArray<any>(parsed.pumps)
            .filter(item => item && typeof item === 'object')
            .map((pump: any, idx: number) => {
                const point0 = pump.point0
                    ? { Q: toNumber(pump.point0.Q ?? pump.point0.q, 0), H: toNumber(pump.point0.H ?? pump.point0.h, 0) }
                    : undefined;
                const pointNom = pump.pointNom
                    ? { Q: toNumber(pump.pointNom.Q ?? pump.pointNom.q, 0), H: toNumber(pump.pointNom.H ?? pump.pointNom.h, 0) }
                    : undefined;
                const pointMax = pump.pointMax
                    ? { Q: toNumber(pump.pointMax.Q ?? pump.pointMax.q, 0), H: toNumber(pump.pointMax.H ?? pump.pointMax.h, 0) }
                    : undefined;
                const curveTable = ensureArray<any>(
                    pump.curveTable
                    ?? pump.pumpTable
                    ?? pump.pumpCurve
                    ?? pump.curve
                )
                    .map((pt: any) => ({
                        Q: toNumber(pt?.Q ?? pt?.q, 0),
                        H: toNumber(pt?.H ?? pt?.h, 0)
                    }))
                    .filter((point: { Q: number; H: number }) => Number.isFinite(point.Q) && Number.isFinite(point.H))
                    .sort((a, b) => a.Q - b.Q);

                const hasThreePointData = !!point0 && !!pointNom && !!pointMax;
                const curveMode = pump.curveMode === 'TABLE' || (!hasThreePointData && curveTable.length >= 3)
                    ? 'TABLE'
                    : '3_POINTS';

                const hasCurveData = curveMode === '3_POINTS'
                    ? hasThreePointData
                    : curveTable.length >= 3;

                const hydraulicFlowMode = pump.hydraulicFlowMode === 'IMPOSED_QIN' || pump.hydraulicFlowMode === 'OPERATING_POINT_QSTAR'
                    ? pump.hydraulicFlowMode
                    : (hasCurveData ? 'OPERATING_POINT_QSTAR' : 'IMPOSED_QIN');

                return {
                    ...pump,
                    id: pump.id || pump.ID || `PM-${idx + 1}`,
                    kind: 'pump' as const,
                    systemId: typeof pump.systemId === 'string' ? pump.systemId : undefined,
                    userDefinedId: pump.userDefinedId || pump.name || pump.nombre || `B-${idx + 1}`,
                    x: toNumber(pump.x ?? pump.X, 0),
                    y: toNumber(pump.y ?? pump.Y, 0),
                    curveMode,
                    point0,
                    pointNom,
                    pointMax,
                    curveTable,
                    hydraulicFlowMode,
                    operatingLimits: pump.operatingLimits
                        ? {
                            qMin_Lps: pump.operatingLimits.qMin_Lps !== undefined ? toNumber(pump.operatingLimits.qMin_Lps, 0) : undefined,
                            qMax_Lps: pump.operatingLimits.qMax_Lps !== undefined ? toNumber(pump.operatingLimits.qMax_Lps, 0) : undefined,
                            mode: pump.operatingLimits.mode === 'CLAMP' ? 'CLAMP' : 'STRICT'
                        }
                        : undefined,
                    npshRequired_m: pump.npshRequired_m !== undefined ? toNumber(pump.npshRequired_m, 0) : undefined,
                    npshMargin_m: pump.npshMargin_m !== undefined ? toNumber(pump.npshMargin_m, 0.5) : undefined,
                    environmentalConditions: pump.environmentalConditions
                        ? {
                            mode: ['DEFAULT', 'AUTO', 'MANUAL'].includes(pump.environmentalConditions.mode)
                                ? pump.environmentalConditions.mode
                                : 'DEFAULT',
                            altitude_m: pump.environmentalConditions.altitude_m !== undefined ? toNumber(pump.environmentalConditions.altitude_m, 0) : undefined,
                            waterTemperature_C: pump.environmentalConditions.waterTemperature_C !== undefined ? toNumber(pump.environmentalConditions.waterTemperature_C, 20) : undefined,
                            patmHead_m: pump.environmentalConditions.patmHead_m !== undefined ? toNumber(pump.environmentalConditions.patmHead_m, 10.3) : undefined,
                            pvaporHead_m: pump.environmentalConditions.pvaporHead_m !== undefined ? toNumber(pump.environmentalConditions.pvaporHead_m, 0.3) : undefined
                        }
                        : undefined,
                    Qnom: toNumber(pump.Qnom, 0),
                    Hnom: toNumber(pump.Hnom, 0),
                    PN_usuario: toNumber(pump.PN_usuario, 10),
                    wetWellId: typeof pump.wetWellId === 'string' ? pump.wetWellId : '',
                    dischargeLineId: typeof pump.dischargeLineId === 'string'
                        ? pump.dischargeLineId
                        : (typeof pump.dischargePipeId === 'string' ? pump.dischargePipeId : '')
                };
            });

        const resultOutfallsPressure = ensureArray<any>(parsed.outfallsPressure)
            .filter(item => item && typeof item === 'object')
            .map((o: any, idx: number) => ({
                ...o,
                id: o.id || o.ID || `OUT-${idx + 1}`,
                kind: 'outfall' as const,
                systemId: typeof o.systemId === 'string' ? o.systemId : undefined,
                userDefinedId: o.userDefinedId || o.name || o.nombre || `D-${idx + 1}`,
                x: toNumber(o.x ?? o.X, 0),
                y: toNumber(o.y ?? o.Y, 0),
                elevation: toNumber(o.elevation ?? o.z, 0)
            }));

        const resultPressureJunctions = ensureArray<any>(parsed.pressureJunctions)
            .filter(item => item && typeof item === 'object')
            .map((j: any, idx: number) => ({
                ...j,
                id: j.id || j.ID || `J-${idx + 1}`,
                kind: (j.kind === 'break_pressure_chamber' || j.boundaryType === 'PRESSURE_BREAK') ? 'break_pressure_chamber' : 'junction',
                systemId: typeof j.systemId === 'string' ? j.systemId : undefined,
                userDefinedId: j.userDefinedId || j.name || j.nombre || `N-${idx + 1}`,
                x: toNumber(j.x ?? j.X, 0),
                y: toNumber(j.y ?? j.Y, 0),
                boundaryType: ['INTERNAL', 'ATMOSPHERIC', 'FIXED_HEAD', 'CONNECTION', 'PRESSURE_BREAK'].includes(j.boundaryType)
                    ? j.boundaryType
                    : 'INTERNAL',
                elevation: toNumber(j.elevation ?? j.z, 0),
                fixedHead: j.fixedHead !== undefined ? toNumber(j.fixedHead, 0) : undefined,
                targetPressureBar: j.targetPressureBar !== undefined ? toNumber(j.targetPressureBar, 0) : undefined
            }));

        const migratedPressure = migratePressureSystems({
            wetWells: resultWetWells,
            pumps: resultPumps,
            pressurePipes: resultPressurePipes,
            outfallsPressure: resultOutfallsPressure,
            pressureJunctions: resultPressureJunctions,
            pumpingSystems: parsed.pumpingSystems,
            activePumpingSystemId: parsed.activePumpingSystemId
        });

        const normalizedSettings: ProjectSettings = parsed.settings
            ? (() => {
                const flowMode = (parsed.settings as any).flowDesignModeCollectors ||
                    ((parsed.settings as any).networkType === 'CONTINUOUS' ? 'DIRECT_Q' : 'POPULATION_NCH1105');
                const rawNch1105 = (parsed.settings as any).nch1105;
                const rawPeakMode = rawNch1105?.peakMode;
                const peakMode: NCh1105PeakMode = rawPeakMode === 'FORCE_HARMON' || rawPeakMode === 'STRICT' || rawPeakMode === 'AUTO'
                    ? rawPeakMode
                    : 'AUTO';
                const habPorCasaRaw = toNumber(rawNch1105?.habPorCasa, 0);

                return {
                    ...parsed.settings,
                    mapDimensions: {
                        minX: toNumber((parsed.settings as any)?.mapDimensions?.minX, 0),
                        minY: toNumber((parsed.settings as any)?.mapDimensions?.minY, 0),
                        maxX: toNumber((parsed.settings as any)?.mapDimensions?.maxX, 1000),
                        maxY: toNumber((parsed.settings as any)?.mapDimensions?.maxY, 1000)
                    },
                    projectType: parsed.settings.projectType || 'Público',
                    sanitarySystemType: (parsed.settings as any).sanitarySystemType === 'II' ? 'II' : 'I',
                    flowDesignModeCollectors: flowMode as 'POPULATION_NCH1105' | 'DIRECT_Q',
                    verificationMode: parsed.settings.verificationMode || 'UEH_MANNING',
                    hasPopulation: typeof (parsed.settings as any).hasPopulation === 'boolean' ? (parsed.settings as any).hasPopulation : false,
                    populationTotal: toNumber((parsed.settings as any).populationTotal, 0),
                    D_L_per_hab_day: toNumber((parsed.settings as any).D_L_per_hab_day, 150),
                    R_recovery: toNumber((parsed.settings as any).R_recovery, 0.8),
                    C_capacity: toNumber((parsed.settings as any).C_capacity, 1.0),
                    nch1105: {
                        enabled: typeof rawNch1105?.enabled === 'boolean'
                            ? rawNch1105.enabled
                            : true,
                        peakMode,
                        habPorCasa: habPorCasaRaw > 0 ? habPorCasaRaw : null
                    },
                    manning: {
                        value: toNumber(asObject((parsed.settings as any).manning).value, 0.013),
                        source: (parsed.settings as any).manning?.source === 'manual' ? 'manual' : 'global'
                    }
                };
            })()
            : {
                mapDimensions: { minX: 0, minY: 0, maxX: 1000, maxY: 1000 },
                units: 'Meters',
                projectType: 'Público',
                sanitarySystemType: 'I',
                flowDesignModeCollectors: 'DIRECT_Q',
                verificationMode: 'UEH_MANNING',
                hasPopulation: false,
                populationTotal: 0,
                D_L_per_hab_day: 150,
                R_recovery: 0.8,
                C_capacity: 1.0,
                nch1105: {
                    enabled: true,
                    peakMode: 'AUTO',
                    habPorCasa: null
                },
                manning: {
                    value: 0.013,
                    source: 'global'
                }
            };

        let recomputedChambers = resultChambers;
        let recomputedPipes = resultPipes;
        try {
            const { recalcProjectFromSettings } = await import('../engines/recalcProject');
            const recomputed = recalcProjectFromSettings(resultChambers, resultPipes, normalizedSettings);
            recomputedChambers = recomputed.chambers;
            recomputedPipes = recomputed.pipes;
        } catch (error) {
            console.warn('[ProjectContext] No se pudo recalcular durante la carga. Se mantiene estado normalizado.', error);
        }

        setChambers(recomputedChambers);
        setPipes(recomputedPipes);
        setWetWells(migratedPressure.wetWells);
        setPumps(migratedPressure.pumps);
        setPressurePipes(migratedPressure.pressurePipes);
        setOutfallsPressure(migratedPressure.outfallsPressure);
        setPressureJunctions(migratedPressure.pressureJunctions);
        setPumpingSystems(migratedPressure.pumpingSystems);
        setActivePumpingSystemId(migratedPressure.activePumpingSystemId);
        setCalculationMethod(parsed.calculationMethod || 'HAZEN_WILLIAMS');
        setSettings(normalizedSettings);

        const migratedNotice = typeof warning === 'string'
            && warning.toLowerCase().includes('actualizado automáticamente');

        setFilePath(sourcePath);
        setIsDirty(migratedNotice);
        setTimeout(() => {
            isLoadingRef.current = false;
            bumpProjectSession();
        }, 100);
    };

    const applyOpenFailureFallback = (error: unknown) => {
        console.warn('Failed to open file. Applying safe defaults.', error);

        const safeDefault = normalizeProjectShape(migrateProject({}));
        setChambers([]);
        setPipes([]);
        setWetWells([]);
        setPumps([]);
        setPressurePipes([]);
        setOutfallsPressure([]);
        setPressureJunctions([]);
        setPumpingSystems([]);
        setActivePumpingSystemId(null);
        setCalculationMethod(safeDefault.calculationMethod || 'HAZEN_WILLIAMS');
        setSettings(safeDefault.settings || {
            mapDimensions: { minX: 0, minY: 0, maxX: 1000, maxY: 1000 },
            units: 'Meters',
            projectType: 'Público',
            sanitarySystemType: 'I',
            flowDesignModeCollectors: 'DIRECT_Q',
            verificationMode: 'UEH_MANNING',
            hasPopulation: false,
            populationTotal: 0,
            D_L_per_hab_day: 0,
            R_recovery: 0.85,
            C_capacity: 1.0,
            nch1105: {
                enabled: true,
                peakMode: 'AUTO',
                habPorCasa: null
            },
            manning: {
                value: 0.013,
                source: 'global'
            }
        });
        setFilePath(null);
        setIsDirty(false);
        bumpProjectSession();
        isLoadingRef.current = false;

        const message = error instanceof Error ? error.message : String(error);
        alert(`No se pudo abrir el archivo seleccionado. Se cargó un proyecto por defecto para evitar fallos. Detalle: ${message}`);
    };

    const openProjectFromPath = async (projectPath: string) => {
        if (!projectPath) return;
        if (handleUnsavedChanges()) return;
        isLoadingRef.current = true;

        try {
            const loadedProject = await loadProject(projectPath);
            await applyLoadedProjectData(loadedProject.project, projectPath, loadedProject.warning);
        } catch (error) {
            applyOpenFailureFallback(error);
        }
    };

    const openProject = async () => {
        if (handleUnsavedChanges()) return;
        isLoadingRef.current = true;

        try {
            const result = await window.electronAPI.openFile();
            if (result) {
                const loadedProject = await loadProject(result.path);
                await applyLoadedProjectData(loadedProject.project, result.path, loadedProject.warning);
            } else {
                isLoadingRef.current = false;
            }
        } catch (error) {
            applyOpenFailureFallback(error);
        }
    };

    const saveProjectAs = async (): Promise<boolean> => {
        try {
            const content = getCurrentContent();
            const newPath = await window.electronAPI.saveFileAs(content);
            if (newPath) {
                setFilePath(newPath);
                setIsDirty(false);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to save file as:', error);
            alert('Error saving file.');
            return false;
        } finally {
            setTimeout(() => isLoadingRef.current = false, 100);
        }
    };

    const saveProject = async (): Promise<boolean> => {
        if (!filePath) {
            return saveProjectAs();
        }

        if (!filePath.toLowerCase().endsWith('.smal')) {
            console.warn('[ProjectContext] Guardado bloqueado en formato legacy. Se requiere extensión .smal.');
            return saveProjectAs();
        }

        try {
            const content = getCurrentContent();
            await window.electronAPI.saveFile(filePath, content);
            setIsDirty(false);
            return true;
        } catch (error) {
            console.error('Failed to save file:', error);
            alert('Error saving file.');
            return false;
        }
    };

    const exitApplication = () => {
        if (handleUnsavedChanges()) return;
        window.electronAPI.exitApp();
    };

    // Keyboard shortcuts handler
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                if (e.altKey) {
                    saveProjectAs(); // Ctrl+Alt+S (Check precedence)
                } else {
                    saveProject(); // Ctrl+S
                }
            } else if (e.ctrlKey && e.key === 'o') {
                e.preventDefault();
                openProject();
            } else if (e.ctrlKey && e.key === 'n') {
                e.preventDefault();
                createNewProject();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [chambers, pipes, filePath, isDirty]);

    return (
        <ProjectContext.Provider value={{
            chambers,
            pipes,
            setChambers,
            setPipes,
            filePath,
            projectSessionId,
            isDirty,
            createNewProject,
            openProject,
            openProjectFromPath,
            saveProject,
            saveProjectAs,
            exitApplication,
            markDirty,
            settings,
            setSettings,
            wetWells,
            pumps,
            pressurePipes,
            outfallsPressure,
            calculationMethod,
            setWetWells,
            setPumps,
            setPressurePipes,
            setOutfallsPressure,
            setCalculationMethod,
            pressureJunctions,
            setPressureJunctions,
            pumpingSystems,
            setPumpingSystems,
            activePumpingSystemId,
            setActivePumpingSystemId,
            undo,
            redo,
            snapshot,
            canUndo: history.length > 0,
            canRedo: future.length > 0,
            renameChamberUserDefinedId,
            renamePipeUserDefinedId
        }}>
            {children}
        </ProjectContext.Provider>
    );
};

export const useProject = () => {
    const context = useContext(ProjectContext);
    if (!context) {
        throw new Error('useProject must be used within a ProjectProvider');
    }
    return context;
};
