"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.useProject = exports.ProjectProvider = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = __importStar(require("react"));
const qwwTables_1 = require("../hydraulics/qwwTables");
const projectMigration_1 = require("./projectMigration");
const ProjectContext = (0, react_1.createContext)(undefined);
const ProjectProvider = ({ children }) => {
    console.log('📦 ProjectProvider: Initializing...');
    const [chambers, setChambers] = (0, react_1.useState)([]);
    const [pipes, setPipes] = (0, react_1.useState)([]);
    const [settings, setSettings] = (0, react_1.useState)({
        mapDimensions: { minX: 0, minY: 0, maxX: 1000, maxY: 1000 },
        units: 'Meters',
        projectType: 'Público',
        sanitarySystemType: 'I',
        networkType: 'CONTINUOUS', // Defaulting to CONTINUOUS as it's often safer or more general, or I can pick one. Let's pick CONTINUOUS as it maps to 'Público' which is the default project type.
        verificationMode: 'UEH_MANNING'
    });
    // Pressure/Pumping elements state
    const [wetWells, setWetWells] = (0, react_1.useState)([]);
    const [pumps, setPumps] = (0, react_1.useState)([]);
    const [pressurePipes, setPressurePipes] = (0, react_1.useState)([]);
    const [outfallsPressure, setOutfallsPressure] = (0, react_1.useState)([]);
    const [pressureJunctions, setPressureJunctions] = (0, react_1.useState)([]);
    const [pumpingSystems, setPumpingSystems] = (0, react_1.useState)([]);
    const [activePumpingSystemId, setActivePumpingSystemId] = (0, react_1.useState)(null);
    const [calculationMethod, setCalculationMethod] = (0, react_1.useState)('HAZEN_WILLIAMS');
    const [filePath, setFilePath] = (0, react_1.useState)(null);
    const [projectSessionId, setProjectSessionId] = (0, react_1.useState)(0);
    const [isDirty, setIsDirty] = (0, react_1.useState)(false);
    // When data changes, mark dirty. 
    // Optimization: Only mark dirty if it wasn't a "load" operation. 
    // We can use a ref to track if we are loading.
    const isLoadingRef = react_1.default.useRef(false);
    (0, react_1.useEffect)(() => {
        if (!isLoadingRef.current) {
            setIsDirty(true);
        }
    }, [chambers, pipes, settings, wetWells, pumps, pressurePipes, outfallsPressure, pressureJunctions, pumpingSystems, activePumpingSystemId, calculationMethod]);
    // Initial load reset
    (0, react_1.useEffect)(() => {
        isLoadingRef.current = false; // Reset after initial render/updates
    }, []);
    // AUTO-RECALCULATION: Unified observer for UEH and Continuous Flow
    // This ensures that "automatic" requirement is met across the app.
    (0, react_1.useEffect)(() => {
        if (isLoadingRef.current)
            return;
        if (chambers.length === 0 && pipes.length === 0)
            return;
        console.log('🔄 ProjectContext: Auto-recalculating accumulation...');
        // 0. Geometry Recalculation (Elevations and Slopes)
        Promise.resolve().then(() => __importStar(require('../utils/geometryEngine'))).then(({ calculateGeometry }) => {
            const geoRes = calculateGeometry(chambers, pipes);
            // 1. UEH Accumulation (Deterministic)
            Promise.resolve().then(() => __importStar(require('../utils/uehAccumulator'))).then(({ calculateUEHAccumulation }) => {
                const uehRes = calculateUEHAccumulation(geoRes.chambers, geoRes.pipes);
                // 1.1 Qww Accumulation (NCh3371 Anexo B)
                Promise.resolve().then(() => __importStar(require('../utils/qwwAccumulator'))).then(({ calculateQwwAccumulation }) => {
                    const qwwRes = calculateQwwAccumulation(uehRes.chambers, uehRes.pipes, settings.sanitarySystemType);
                    // 2. Continuous Flow Accumulation (If applicable)
                    if (settings.networkType === 'CONTINUOUS') {
                        Promise.resolve().then(() => __importStar(require('../utils/flowAccumulator'))).then(({ calculateFlowAccumulation }) => {
                            const flowRes = calculateFlowAccumulation(qwwRes.chambers, qwwRes.pipes);
                            // Only update if something actually changed to avoid infinite loops
                            if (JSON.stringify(flowRes.chambers) !== JSON.stringify(chambers) ||
                                JSON.stringify(flowRes.pipes) !== JSON.stringify(pipes)) {
                                setChambers(flowRes.chambers);
                                setPipes(flowRes.pipes);
                            }
                        });
                    }
                    else {
                        // If not continuous, apply UEH + Qww
                        if (JSON.stringify(qwwRes.chambers) !== JSON.stringify(chambers) ||
                            JSON.stringify(qwwRes.pipes) !== JSON.stringify(pipes)) {
                            setChambers(qwwRes.chambers);
                            setPipes(qwwRes.pipes);
                        }
                    }
                });
            });
        });
    }, [
        chambers.length,
        pipes.length,
        settings.sanitarySystemType,
        settings.networkType,
        // Track changes in critical attributes, connectivity, and origins (Auto vs Manual)
        chambers.reduce((sum, c) => sum +
            Number(c.Qin?.value || 0) + Number(c.uehPropias?.value || 0) +
            Number(c.CT?.value || 0) + (c.CT?.origin === 'manual' ? 1000 : 0) +
            Number(c.H?.value || 0) + (c.H?.origin === 'manual' ? 2000 : 0) +
            Number(c.delta?.value || 0), 0),
        pipes.reduce((sum, p) => sum +
            (p.startNodeId ? 1 : 0) + (p.endNodeId ? 1 : 0) +
            Number(p.manualSlope?.value || 0) + (p.isSlopeManual ? 5000 : 0), 0)
    ]);
    const getCurrentContent = () => {
        const data = {
            fileType: 'SMCALC_ALC',
            version: 1,
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
    const markDirty = () => setIsDirty(true);
    const bumpProjectSession = () => setProjectSessionId(prev => prev + 1);
    const ensureArray = (value) => {
        if (Array.isArray(value))
            return value;
        if (value && typeof value === 'object') {
            return Object.values(value)
                .filter(item => item !== null && item !== undefined);
        }
        return [];
    };
    const tryParseEmbeddedJson = (value) => {
        if (typeof value !== 'string')
            return value;
        const candidate = sanitizeJsonText(value);
        if (!candidate)
            return value;
        try {
            return JSON.parse(candidate);
        }
        catch {
            return value;
        }
    };
    const unwrapProjectEnvelope = (raw) => {
        const parsedRaw = tryParseEmbeddedJson(raw);
        if (!parsedRaw || typeof parsedRaw !== 'object')
            return {};
        const rawObj = parsedRaw;
        const envelopeKeys = ['project', 'projectData', 'data', 'payload'];
        for (const key of envelopeKeys) {
            const parsed = tryParseEmbeddedJson(rawObj[key]);
            if (parsed && typeof parsed === 'object')
                return parsed;
        }
        return rawObj;
    };
    const sanitizeJsonText = (content) => {
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
    const legacyJsonToStrictJson = (content) => {
        return content
            .replace(/\bNaN\b/g, 'null')
            .replace(/\bundefined\b/g, 'null')
            .replace(/\b-?Infinity\b/g, 'null')
            .replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)/g, '$1"$2"$3')
            .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, g1) => `"${g1.replace(/"/g, '\\"')}"`);
    };
    const normalizeCalculationMethod = (rawMethod) => {
        if (!rawMethod)
            return undefined;
        const method = String(rawMethod).toUpperCase().replace(/[^A-Z_]/g, '');
        if (method.includes('DARCY'))
            return 'DARCY_WEISBACH';
        if (method.includes('HAZEN'))
            return 'HAZEN_WILLIAMS';
        return undefined;
    };
    const normalizeProjectShape = (raw) => {
        const root = unwrapProjectEnvelope(raw);
        const chambers = ensureArray(root?.chambers ?? root?.cameras ?? root?.camaras ?? root?.nodes ?? root?.camarasSanitarias ?? root?.manholes ?? []);
        const pipes = ensureArray(root?.pipes ?? root?.tuberias ?? root?.links ?? root?.lines ?? root?.edges ?? root?.segments ?? root?.tubos ?? []);
        const settings = (root?.settings && typeof root.settings === 'object')
            ? root.settings
            : ((root?.projectSettings && typeof root.projectSettings === 'object')
                ? root.projectSettings
                : ((root?.config && typeof root.config === 'object')
                    ? root.config
                    : ((root?.configuration && typeof root.configuration === 'object') ? root.configuration : undefined)));
        const wetWells = ensureArray(root?.wetWells ?? root?.wetwells ?? root?.wet_wells ?? root?.camarasBombeo ?? []);
        const pumps = ensureArray(root?.pumps ?? root?.bombas ?? []);
        const pressurePipes = ensureArray(root?.pressurePipes ?? root?.impulsionPipes ?? root?.impulsion_lines ?? root?.tuberiasImpulsion ?? root?.lineasImpulsion ?? []);
        const outfallsPressure = ensureArray(root?.outfallsPressure ?? root?.discharges ?? root?.descargas ?? []);
        const pressureJunctions = ensureArray(root?.pressureJunctions ?? root?.junctions ?? root?.nodesPressure ?? root?.nudosPresion ?? root?.junctionPressure ?? []);
        const pumpingSystems = ensureArray(root?.pumpingSystems ?? root?.systems ?? root?.pressureSystems ?? []);
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
    const parseProjectData = (rawContent) => {
        const raw = rawContent.replace(/^\uFEFF/, '').trim();
        const parseAttempts = [];
        let parsedContent = null;
        const tryParse = (candidate) => {
            if (!candidate)
                return null;
            try {
                return JSON.parse(candidate);
            }
            catch (error) {
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
                }
                else {
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
            const safeFallback = (0, projectMigration_1.migrateProject)({});
            return {
                project: normalizeProjectShape(safeFallback),
                warning: `No se pudo leer completamente el archivo. Se abrió una versión recuperada con valores por defecto. Detalle: ${detail}`
            };
        }
        const migrated = (0, projectMigration_1.migrateProject)(parsedContent);
        return {
            project: normalizeProjectShape(migrated)
        };
    };
    const loadProject = async (targetPath) => {
        try {
            const loaded = await window.electronAPI.loadProject(targetPath);
            if (!loaded || typeof loaded.content !== 'string') {
                console.warn('[ProjectContext] loadProject: contenido vacío, se aplican defaults.');
                return {
                    project: normalizeProjectShape((0, projectMigration_1.migrateProject)({})),
                    warning: 'No se pudo leer el archivo seleccionado. Se abrió un proyecto por defecto.'
                };
            }
            return parseProjectData(loaded.content);
        }
        catch (error) {
            console.warn('[ProjectContext] loadProject: error no fatal durante lectura.', error);
            return {
                project: normalizeProjectShape((0, projectMigration_1.migrateProject)({})),
                warning: 'Error al leer archivo. Se abrió un proyecto por defecto para evitar pérdida de sesión.'
            };
        }
    };
    const migratePressureSystems = (input) => {
        const wetWellIds = new Set(input.wetWells.map(w => w.id));
        const pumpIds = new Set(input.pumps.map(p => p.id));
        const junctionIds = new Set(input.pressureJunctions.map(j => j.id));
        const outfallIds = new Set(input.outfallsPressure.map(o => o.id));
        const pipeById = new Map(input.pressurePipes.map(p => [p.id, p]));
        const normalizePipeKind = (pipe) => {
            if (pipe.kind === 'pump_link')
                return 'pump_link';
            if (pipe.kind === 'pipe')
                return 'pipe';
            const a = pipe.startNodeId;
            const b = pipe.endNodeId;
            const isWetWellToPump = (!!a && !!b) && ((wetWellIds.has(a) && pumpIds.has(b))
                || (wetWellIds.has(b) && pumpIds.has(a)));
            return isWetWellToPump ? 'pump_link' : 'pipe';
        };
        const normalizedPipes = input.pressurePipes.map(pipe => ({
            ...pipe,
            kind: normalizePipeKind(pipe)
        }));
        const pumpLinkByPumpId = new Map();
        normalizedPipes
            .filter(pipe => pipe.kind === 'pump_link')
            .forEach(pipe => {
            const start = pipe.startNodeId;
            const end = pipe.endNodeId;
            if (start && pumpIds.has(start))
                pumpLinkByPumpId.set(start, pipe);
            if (end && pumpIds.has(end))
                pumpLinkByPumpId.set(end, pipe);
        });
        const dischargePipeByPumpId = new Map();
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
        const systems = [];
        const usedSystemIds = new Set();
        const reserveSystemId = (seed) => {
            const preferred = typeof seed === 'string' ? seed.trim() : '';
            if (preferred && !usedSystemIds.has(preferred)) {
                usedSystemIds.add(preferred);
                return preferred;
            }
            let index = 1;
            while (usedSystemIds.has(`S-${index}`))
                index++;
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
                const inferredWetWellId = (typeof pump.wetWellId === 'string' && wetWellIds.has(pump.wetWellId) ? pump.wetWellId : '')
                    || (pumpLink?.startNodeId && wetWellIds.has(pumpLink.startNodeId) ? pumpLink.startNodeId : '')
                    || (pumpLink?.endNodeId && wetWellIds.has(pumpLink.endNodeId) ? pumpLink.endNodeId : '');
                const dischargePipe = ((typeof pump.dischargeLineId === 'string' && pipeById.get(pump.dischargeLineId)) || undefined)
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
        const systemByPumpId = new Map();
        const systemByWetWellId = new Map();
        const systemByOutfallNodeId = new Map();
        systems.forEach(system => {
            if (system.pumpId)
                systemByPumpId.set(system.pumpId, system.id);
            if (system.wetWellId)
                systemByWetWellId.set(system.wetWellId, system.id);
            if (system.outfallNodeId)
                systemByOutfallNodeId.set(system.outfallNodeId, system.id);
        });
        const defaultSystemId = systems[0].id;
        const wetWells = input.wetWells.map(w => ({
            ...w,
            kind: 'wet_well',
            systemId: w.systemId || systemByWetWellId.get(w.id) || defaultSystemId,
            allowMultiplePumps: !!w.allowMultiplePumps
        }));
        const pumps = input.pumps.map(p => {
            const linkedSystemId = p.systemId || systemByPumpId.get(p.id) || systemByWetWellId.get(p.wetWellId) || defaultSystemId;
            const pumpLink = pumpLinkByPumpId.get(p.id);
            const inferredWetWellId = (p.wetWellId && wetWellIds.has(p.wetWellId) ? p.wetWellId : '')
                || (pumpLink?.startNodeId && wetWellIds.has(pumpLink.startNodeId) ? pumpLink.startNodeId : '')
                || (pumpLink?.endNodeId && wetWellIds.has(pumpLink.endNodeId) ? pumpLink.endNodeId : '');
            const dischargePipe = (p.dischargeLineId && pipeById.get(p.dischargeLineId))
                || (p.dischargePipeId && pipeById.get(p.dischargePipeId))
                || dischargePipeByPumpId.get(p.id);
            return {
                ...p,
                kind: 'pump',
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
            kind: 'outfall',
            systemId: outfall.systemId || systemByOutfallNodeId.get(outfall.id) || defaultSystemId
        }));
        const pressureJunctions = input.pressureJunctions.map(junction => ({
            ...junction,
            kind: (junction.boundaryType === 'PRESSURE_BREAK' ? 'break_pressure_chamber' : 'junction'),
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
            ? input.activePumpingSystemId
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
    const handleUnsavedChanges = () => {
        if (isDirty && (chambers.length > 0 || pipes.length > 0)) { // Only if there's actual data
            return !window.confirm('You have unsaved changes. Are you sure you want to discard them?');
        }
        return false;
    };
    const [history, setHistory] = (0, react_1.useState)([]);
    const [future, setFuture] = (0, react_1.useState)([]);
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
        if (history.length === 0)
            return;
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
        if (future.length === 0)
            return;
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
    (0, react_1.useEffect)(() => {
        const handleKeyDown = (e) => {
            if (e.ctrlKey && e.key === 'z') {
                e.preventDefault();
                undo();
            }
            else if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
                e.preventDefault();
                redo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [history, future, chambers, pipes, wetWells, pumps, pressurePipes, outfallsPressure, pressureJunctions, pumpingSystems, activePumpingSystemId]);
    const createNewProject = () => {
        if (handleUnsavedChanges())
            return;
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
            networkType: 'CONTINUOUS',
            verificationMode: 'UEH_MANNING'
        });
        setFilePath(null);
        setIsDirty(false);
        bumpProjectSession();
        setTimeout(() => isLoadingRef.current = false, 100);
    };
    const applyLoadedProjectData = (parsed, sourcePath, warning) => {
        if (warning) {
            alert(warning);
        }
        const migrateAttr = (val, defaultVal = 0, defaultOrigin = 'manual') => {
            if (val && typeof val === 'object' && 'value' in val) {
                const finalVal = (val.value === null || (typeof val.value === 'number' && isNaN(val.value))) ? defaultVal : val.value;
                return { ...val, value: finalVal };
            }
            const finalVal = (val === null || val === undefined || (typeof val === 'number' && isNaN(val))) ? defaultVal : val;
            return { value: finalVal, origin: defaultOrigin };
        };
        const toNumber = (val, defaultVal = 0) => {
            if (typeof val === 'number' && Number.isFinite(val))
                return val;
            if (typeof val === 'string') {
                const normalized = val.replace(',', '.').replace(/[^0-9+\-.eE]/g, '').trim();
                const parsedNum = Number(normalized);
                if (Number.isFinite(parsedNum))
                    return parsedNum;
            }
            return defaultVal;
        };
        const rawChambers = ensureArray(parsed.chambers).filter(item => item && typeof item === 'object');
        const rawPipes = ensureArray(parsed.pipes).filter(item => item && typeof item === 'object');
        const rawPressurePipes = ensureArray(parsed.pressurePipes).filter(item => item && typeof item === 'object');
        const normalizeFixtureLoads = (input) => {
            return ensureArray(input)
                .filter(item => item && typeof item === 'object')
                .map(item => ({
                fixtureKey: String(item.fixtureKey || item.key || item.type || '').trim(),
                quantity: toNumber(item.quantity ?? item.qty, 0),
                usageClass: (0, qwwTables_1.normalizeUsageClass)(item.usageClass ?? item.clase ?? item.class ?? 1)
            }))
                .filter(item => item.fixtureKey && item.quantity > 0);
        };
        const resultChambers = rawChambers.map((c, idx) => ({
            ...c,
            id: c.id || c.ID || `C-${idx + 1}`,
            userDefinedId: c.userDefinedId || c.codigo || c.name || c.id || `C${idx + 1}`,
            x: toNumber(c.x ?? c.X ?? c.cx, 0),
            y: toNumber(c.y ?? c.Y ?? c.cy, 0),
            CT: migrateAttr(c.CT, 100, 'manual'),
            H: migrateAttr(c.H, 1.5, 'manual'),
            Cre: migrateAttr(c.Cre, 98.5, 'calculated'),
            CRS: migrateAttr(c.CRS, 98.5, 'calculated'),
            delta: migrateAttr(c.delta, 0, 'manual'),
            uehPropias: migrateAttr(c.uehPropias || c.UEH, 0, 'manual'),
            uehAcumuladas: migrateAttr(c.uehAcumuladas, 0, 'calculated'),
            qwwPropio: migrateAttr(c.qwwPropio, 0, 'calculated'),
            qwwAcumulado: migrateAttr(c.qwwAcumulado, 0, 'calculated'),
            Qin: migrateAttr(c.Qin, 0, 'manual'),
            chamberType: c.chamberType || 'Pública',
            chamberDimension: c.chamberDimension || '120 cm',
            fixtureLoads: normalizeFixtureLoads(c.fixtureLoads || c.fixtures || c.artefactos)
        }));
        const resultPipes = rawPipes.map((p, idx) => ({
            ...p,
            id: p.id || p.ID || `P-${idx + 1}`,
            userDefinedId: p.userDefinedId || p.codigo || p.name || p.id || `T${idx + 1}`,
            x1: toNumber(p.x1 ?? p.xStart, 0),
            y1: toNumber(p.y1 ?? p.yStart, 0),
            x2: toNumber(p.x2 ?? p.xEnd, 0),
            y2: toNumber(p.y2 ?? p.yEnd, 0),
            material: migrateAttr(p.material, 'PVC', 'manual'),
            diameter: migrateAttr(p.diameter, 200, 'manual'),
            length: migrateAttr(p.length, 0, 'manual'),
            slope: migrateAttr(p.slope, 0, 'calculated'),
            uehTransportadas: migrateAttr(p.uehTransportadas, 0, 'calculated'),
            qwwTransportado: migrateAttr(p.qwwTransportado, 0, 'calculated'),
            qContinuous: migrateAttr(p.qContinuous, 0, 'calculated'),
            manualSlope: p.manualSlope ? migrateAttr(p.manualSlope, 0, 'manual') : undefined,
            sdr: migrateAttr(p.sdr, 'SDR17', 'manual')
        }));
        const resultPressurePipes = rawPressurePipes.map((p, idx) => ({
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
            kFactors: Array.isArray(p.kFactors) ? p.kFactors : [],
            PN: toNumber(p.PN, 10),
            profilePoints: ensureArray(p.profilePoints).map((pt, pIdx) => ({
                ...pt,
                id: (typeof pt?.id === 'string' && pt.id.trim()) ? pt.id : `PT-${pIdx + 1}`,
                chainage: toNumber(pt?.chainage, 0),
                elevation: toNumber(pt?.elevation, 0)
            })),
            inlineNodes: ensureArray(p.inlineNodes).map((n, nIdx) => ({
                ...n,
                id: (typeof n?.id === 'string' && n.id.trim()) ? n.id : `AV-${nIdx + 1}`,
                chainage: toNumber(n?.chainage, 0),
                elevation: toNumber(n?.elevation, 0),
                x: toNumber(n?.x, 0),
                y: toNumber(n?.y, 0)
            }))
        }));
        const resultWetWells = ensureArray(parsed.wetWells)
            .filter(item => item && typeof item === 'object')
            .map((w, idx) => ({
            ...w,
            id: w.id || w.ID || `WW-${idx + 1}`,
            kind: 'wet_well',
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
            allowMultiplePumps: !!w.allowMultiplePumps
        }));
        const resultPumps = ensureArray(parsed.pumps)
            .filter(item => item && typeof item === 'object')
            .map((pump, idx) => {
            const curveMode = pump.curveMode === 'TABLE' ? 'TABLE' : '3_POINTS';
            const point0 = pump.point0
                ? { Q: toNumber(pump.point0.Q, 0), H: toNumber(pump.point0.H, 0) }
                : undefined;
            const pointNom = pump.pointNom
                ? { Q: toNumber(pump.pointNom.Q, 0), H: toNumber(pump.pointNom.H, 0) }
                : undefined;
            const pointMax = pump.pointMax
                ? { Q: toNumber(pump.pointMax.Q, 0), H: toNumber(pump.pointMax.H, 0) }
                : undefined;
            const curveTable = ensureArray(pump.curveTable).map((pt) => ({
                Q: toNumber(pt?.Q, 0),
                H: toNumber(pt?.H, 0)
            }));
            const hasCurveData = curveMode === '3_POINTS'
                ? !!point0 && !!pointNom && !!pointMax
                : curveTable.length >= 3;
            const hydraulicFlowMode = pump.hydraulicFlowMode === 'IMPOSED_QIN' || pump.hydraulicFlowMode === 'OPERATING_POINT_QSTAR'
                ? pump.hydraulicFlowMode
                : (hasCurveData ? 'OPERATING_POINT_QSTAR' : 'IMPOSED_QIN');
            return {
                ...pump,
                id: pump.id || pump.ID || `PM-${idx + 1}`,
                kind: 'pump',
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
                Qnom: toNumber(pump.Qnom, 0),
                Hnom: toNumber(pump.Hnom, 0),
                PN_usuario: toNumber(pump.PN_usuario, 10),
                wetWellId: typeof pump.wetWellId === 'string' ? pump.wetWellId : '',
                dischargeLineId: typeof pump.dischargeLineId === 'string'
                    ? pump.dischargeLineId
                    : (typeof pump.dischargePipeId === 'string' ? pump.dischargePipeId : '')
            };
        });
        const resultOutfallsPressure = ensureArray(parsed.outfallsPressure)
            .filter(item => item && typeof item === 'object')
            .map((o, idx) => ({
            ...o,
            id: o.id || o.ID || `OUT-${idx + 1}`,
            kind: 'outfall',
            systemId: typeof o.systemId === 'string' ? o.systemId : undefined,
            userDefinedId: o.userDefinedId || o.name || o.nombre || `D-${idx + 1}`,
            x: toNumber(o.x ?? o.X, 0),
            y: toNumber(o.y ?? o.Y, 0),
            elevation: toNumber(o.elevation ?? o.z, 0)
        }));
        const resultPressureJunctions = ensureArray(parsed.pressureJunctions)
            .filter(item => item && typeof item === 'object')
            .map((j, idx) => ({
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
        setChambers(resultChambers);
        setPipes(resultPipes);
        setWetWells(migratedPressure.wetWells);
        setPumps(migratedPressure.pumps);
        setPressurePipes(migratedPressure.pressurePipes);
        setOutfallsPressure(migratedPressure.outfallsPressure);
        setPressureJunctions(migratedPressure.pressureJunctions);
        setPumpingSystems(migratedPressure.pumpingSystems);
        setActivePumpingSystemId(migratedPressure.activePumpingSystemId);
        setCalculationMethod(parsed.calculationMethod || 'HAZEN_WILLIAMS');
        if (parsed.settings) {
            setSettings({
                ...parsed.settings,
                mapDimensions: {
                    minX: toNumber(parsed.settings?.mapDimensions?.minX, 0),
                    minY: toNumber(parsed.settings?.mapDimensions?.minY, 0),
                    maxX: toNumber(parsed.settings?.mapDimensions?.maxX, 1000),
                    maxY: toNumber(parsed.settings?.mapDimensions?.maxY, 1000)
                },
                projectType: parsed.settings.projectType || 'Público',
                sanitarySystemType: parsed.settings.sanitarySystemType === 'II' ? 'II' : 'I',
                networkType: parsed.settings.networkType || 'CONTINUOUS',
                verificationMode: parsed.settings.verificationMode || 'UEH_MANNING'
            });
        }
        else {
            setSettings({
                mapDimensions: { minX: 0, minY: 0, maxX: 1000, maxY: 1000 },
                units: 'Meters',
                projectType: 'Público',
                sanitarySystemType: 'I',
                networkType: 'CONTINUOUS',
                verificationMode: 'UEH_MANNING'
            });
        }
        setFilePath(sourcePath);
        setIsDirty(false);
        bumpProjectSession();
        setTimeout(() => {
            isLoadingRef.current = false;
        }, 100);
    };
    const applyOpenFailureFallback = (error) => {
        console.warn('Failed to open file. Applying safe defaults.', error);
        const safeDefault = normalizeProjectShape((0, projectMigration_1.migrateProject)({}));
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
            networkType: 'CONTINUOUS',
            verificationMode: 'UEH_MANNING'
        });
        setFilePath(null);
        setIsDirty(false);
        bumpProjectSession();
        isLoadingRef.current = false;
        const message = error instanceof Error ? error.message : String(error);
        alert(`No se pudo abrir el archivo seleccionado. Se cargó un proyecto por defecto para evitar fallos. Detalle: ${message}`);
    };
    const openProjectFromPath = async (projectPath) => {
        if (!projectPath)
            return;
        if (handleUnsavedChanges())
            return;
        isLoadingRef.current = true;
        try {
            const loadedProject = await loadProject(projectPath);
            applyLoadedProjectData(loadedProject.project, projectPath, loadedProject.warning);
        }
        catch (error) {
            applyOpenFailureFallback(error);
        }
    };
    const openProject = async () => {
        if (handleUnsavedChanges())
            return;
        isLoadingRef.current = true;
        try {
            const result = await window.electronAPI.openFile();
            if (result) {
                const loadedProject = await loadProject(result.path);
                applyLoadedProjectData(loadedProject.project, result.path, loadedProject.warning);
            }
            else {
                isLoadingRef.current = false;
            }
        }
        catch (error) {
            applyOpenFailureFallback(error);
        }
    };
    const saveProjectAs = async () => {
        try {
            const content = getCurrentContent();
            const newPath = await window.electronAPI.saveFileAs(content);
            if (newPath) {
                setFilePath(newPath);
                setIsDirty(false);
                return true;
            }
            return false;
        }
        catch (error) {
            console.error('Failed to save file as:', error);
            alert('Error saving file.');
            return false;
        }
        finally {
            setTimeout(() => isLoadingRef.current = false, 100);
        }
    };
    const saveProject = async () => {
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
        }
        catch (error) {
            console.error('Failed to save file:', error);
            alert('Error saving file.');
            return false;
        }
    };
    const exitApplication = () => {
        if (handleUnsavedChanges())
            return;
        window.electronAPI.exitApp();
    };
    // Keyboard shortcuts handler
    (0, react_1.useEffect)(() => {
        const handleKeyDown = (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                if (e.altKey) {
                    saveProjectAs(); // Ctrl+Alt+S (Check precedence)
                }
                else {
                    saveProject(); // Ctrl+S
                }
            }
            else if (e.ctrlKey && e.key === 'o') {
                e.preventDefault();
                openProject();
            }
            else if (e.ctrlKey && e.key === 'n') {
                e.preventDefault();
                createNewProject();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [chambers, pipes, filePath, isDirty]);
    return ((0, jsx_runtime_1.jsx)(ProjectContext.Provider, { value: {
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
            canRedo: future.length > 0
        }, children: children }));
};
exports.ProjectProvider = ProjectProvider;
const useProject = () => {
    const context = (0, react_1.useContext)(ProjectContext);
    if (!context) {
        throw new Error('useProject must be used within a ProjectProvider');
    }
    return context;
};
exports.useProject = useProject;
