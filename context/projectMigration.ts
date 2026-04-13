import type { CalculationMethod } from '../hydraulics/types';
import {
    DEFAULT_PROJECT_SETTINGS,
    type Project,
    validateProjectStructure
} from './validateProjectStructure';
import {
    CURRENT_PROJECT_SCHEMA_VERSION,
    CURRENT_PROJECT_VERSION,
    normalizeSchemaVersion
} from './projectSchema';

type MigrationFn = (project: any) => any;

export interface ProjectMigrationMeta {
    fromSchemaVersion: number;
    toSchemaVersion: number;
    schemaMigrated: boolean;
    legacyDetected: boolean;
}

export interface ProjectMigrationResult {
    project: Project;
    meta: ProjectMigrationMeta;
}

function asObject(value: any): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, any>
        : {};
}

function asArray<T = any>(value: any): T[] {
    if (Array.isArray(value)) return value as T[];
    if (value && typeof value === 'object') {
        return Object.values(value).filter(item => item !== null && item !== undefined) as T[];
    }
    return [];
}

function firstDefined(...values: any[]): any {
    for (const value of values) {
        if (value !== undefined && value !== null) return value;
    }
    return undefined;
}

function toNumber(value: any, fallback = 0): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const normalized = value.replace(',', '.').replace(/[^0-9+\-.eE]/g, '').trim();
        if (normalized !== '') {
            const parsed = Number(normalized);
            if (Number.isFinite(parsed)) return parsed;
        }
    }
    return fallback;
}

function normalizeCalculationMethod(value: any): CalculationMethod | undefined {
    if (typeof value !== 'string') return undefined;
    const normalized = value.toUpperCase().replace(/[^A-Z_]/g, '');
    if (normalized.includes('DARCY')) return 'DARCY_WEISBACH';
    if (normalized.includes('HAZEN')) return 'HAZEN_WILLIAMS';
    return undefined;
}

function detectSourceVersion(data: Record<string, any>): number {
    if (!Object.prototype.hasOwnProperty.call(data, 'version')) {
        return 0;
    }

    const rawVersion = toNumber(data.version, 0);
    return Number.isFinite(rawVersion) && rawVersion >= 0
        ? Math.floor(rawVersion)
        : 0;
}

function detectSourceSchemaVersion(data: Record<string, any>): number {
    return normalizeSchemaVersion(data.schemaVersion);
}

function unwrapEnvelope(rawData: any): Record<string, any> {
    const root = asObject(rawData);
    const candidates = [
        root,
        asObject(root.project),
        asObject(root.projectData),
        asObject(root.data),
        asObject(root.payload)
    ];

    const selected = candidates.find(candidate => Object.keys(candidate).length > 0);
    return selected || {};
}

function coerceNumericStrings(value: any): any {
    if (Array.isArray(value)) {
        return value.map(item => coerceNumericStrings(item));
    }

    if (value && typeof value === 'object') {
        const source = value as Record<string, any>;
        const output: Record<string, any> = {};

        Object.entries(source).forEach(([key, inner]) => {
            if (typeof inner === 'string' && /^(?:\s*[+-]?\d+(?:[\.,]\d+)?(?:e[+-]?\d+)?\s*)$/i.test(inner)) {
                output[key] = toNumber(inner, 0);
                return;
            }
            output[key] = coerceNumericStrings(inner);
        });

        return output;
    }

    return value;
}

function normalizeAttr(value: any, fallbackValue: number | string, origin: 'manual' | 'calculated') {
    if (value && typeof value === 'object' && 'value' in value) {
        return {
            ...value,
            value: value.value ?? fallbackValue,
            origin
        };
    }

    return {
        value: value ?? fallbackValue,
        origin
    };
}

function inferHeightLocked(chamber: any): boolean {
    const hasManualHOrigin = chamber?.H && typeof chamber.H === 'object' && chamber.H.origin === 'manual';
    const explicitManual = chamber?.isHeightManual === true || chamber?.fixedHeight === true || chamber?.autoHeight === false;

    if (typeof chamber?.heightLocked === 'boolean') {
        if (chamber.heightLocked) return true;
        if (hasManualHOrigin || explicitManual) return true;
        return false;
    }

    if (typeof chamber?.autoHeight === 'boolean') return !chamber.autoHeight;
    if (typeof chamber?.isHeightManual === 'boolean') return chamber.isHeightManual;
    if (typeof chamber?.fixedHeight === 'boolean') return chamber.fixedHeight;
    if (hasManualHOrigin) return true;

    return false;
}

function inferSlopeLocked(pipe: any): boolean {
    const hasManualSlopeValue = pipe?.manualSlope !== undefined && pipe?.manualSlope !== null;
    const explicitManual = pipe?.isSlopeManual === true || pipe?.autoSlope === false;

    if (typeof pipe?.slopeLocked === 'boolean') {
        if (pipe.slopeLocked) return true;
        if (explicitManual || hasManualSlopeValue) return true;
        return false;
    }

    if (typeof pipe?.isSlopeManual === 'boolean') return pipe.isSlopeManual;
    if (typeof pipe?.autoSlope === 'boolean') return !pipe.autoSlope;
    if (hasManualSlopeValue) return true;
    return false;
}

function inferLengthMode(pipe: any): 'manual' | 'auto' {
    if (typeof pipe?.autoLength === 'boolean') return pipe.autoLength ? 'auto' : 'manual';
    if (typeof pipe?.lengthAuto === 'boolean') return pipe.lengthAuto ? 'auto' : 'manual';
    if (typeof pipe?.isLengthManual === 'boolean') return pipe.isLengthManual ? 'manual' : 'auto';
    if (pipe?.lengthMode === 'manual' || pipe?.lengthMode === 'auto') return pipe.lengthMode;
    if (pipe?.length && typeof pipe.length === 'object' && pipe.length.origin === 'calculated') return 'auto';
    if (pipe?.calculatedLength !== undefined && pipe?.calculatedLength !== null) return 'auto';
    return 'manual';
}

function readAttrNumber(value: any, fallback = 0): number {
    if (value && typeof value === 'object' && 'value' in value) {
        return toNumber(value.value, fallback);
    }
    return toNumber(value, fallback);
}

function round2(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Number(Math.max(0, value).toFixed(2));
}

function estimatePipeLengthFromGeometry(pipe: any): number {
    const x1 = toNumber(pipe?.x1, NaN);
    const y1 = toNumber(pipe?.y1, NaN);
    const x2 = toNumber(pipe?.x2, NaN);
    const y2 = toNumber(pipe?.y2, NaN);

    if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) {
        return 0;
    }

    const vertices = asArray<any>(pipe?.vertices)
        .map(vertex => ({
            x: toNumber(vertex?.x, NaN),
            y: toNumber(vertex?.y, NaN)
        }))
        .filter(vertex => Number.isFinite(vertex.x) && Number.isFinite(vertex.y));

    const points = [{ x: x1, y: y1 }, ...vertices, { x: x2, y: y2 }];
    if (points.length < 2) return 0;

    let total = 0;
    for (let i = 0; i < points.length - 1; i += 1) {
        total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    }
    return total;
}

function stripLegacyChamberFields(chamber: any): any {
    const next = { ...chamber };
    delete next.autoHeight;
    delete next.heightMode;
    delete next.fixedHeight;
    delete next.isHeightManual;
    delete next.hasCRe;
    delete next.incomingElevations;
    delete next.qinAcumulado;
    delete next.qwwPropio;
    delete next.qwwAcumulado;
    delete next.uehAcumuladas;
    delete next.sources;
    delete next.topologyRole;
    delete next.P_acum;
    delete next.Q_source_Lps;
    return next;
}

function stripLegacyPipeFields(pipe: any): any {
    const next = { ...pipe };
    delete next.autoLength;
    delete next.lengthAuto;
    delete next.calculatedLength;
    delete next.autoSlope;
    delete next.isLengthManual;
    delete next.sources;
    delete next.gravityRole_auto;
    delete next.hydraulics;
    delete next.verificacion1105;
    delete next.qMin_Ls;
    delete next.Q_design_Lps;
    delete next.qDesign_Lps;
    delete next.qDiseno_Ls;
    delete next.UEH_total;
    delete next.UEH_upstream;
    delete next.Qmed_Lps;
    delete next.M_harmon;
    delete next.Qmax_Lps;
    delete next.flowMethodNCh1105;
    delete next.cumulativeLengthDN175_m;
    delete next.dnReductionFlag;
    delete next.dnReductionMotivo;
    delete next.qwwTransportado;
    delete next.qContinuous;
    delete next.uehTransportadas;
    return next;
}

function migrateSchemaV2toV3(project: any): any {
    const source = asObject(project);

    const migratedChambers = asArray(source.chambers).map((rawChamber: any) => {
        // 1. Identify if height was manual
        const heightLocked = inferHeightLocked(rawChamber);
        
        // 2. Preserve user input only
        const chamber = stripLegacyChamberFields(rawChamber);
        const ctVal = readAttrNumber(chamber.CT, 100);
        const deltaVal = readAttrNumber(chamber.delta, 0.02);
        const hVal = readAttrNumber(chamber.H, 0);

        return {
            ...chamber,
            heightLocked,
            CT: { value: ctVal, origin: 'manual' },
            delta: { value: deltaVal, origin: 'manual' },
            // If height is locked, we keep H as manual. 
            // If NOT locked, we reset H to 0 to force recalculation (using Ct - minIncoming or Ct - 0.6 fallback).
            H: { value: heightLocked ? hVal : 0, origin: heightLocked ? 'manual' : 'calculated' },
            // Discard calculated results
            Cre: { value: 0, origin: 'calculated' },
            CRS: { value: 0, origin: 'calculated' },
            uehPropias: normalizeAttr(chamber.uehPropias, 0, 'manual')
        };
    });

    const migratedPipes = asArray(source.pipes).map((rawPipe: any) => {
        // 1. Identify modes
        const slopeLocked = inferSlopeLocked(rawPipe);
        const lengthMode = inferLengthMode(rawPipe);

        // 2. Preserve user input only
        const pipe = stripLegacyPipeFields(rawPipe);
        const diameter = readAttrNumber(pipe.diameter, 110);
        const material = pipe.material?.value || pipe.material || 'PVC';

        // Length normalization
        const geometricLength = estimatePipeLengthFromGeometry(rawPipe);
        const userLength = readAttrNumber(firstDefined(pipe.length, pipe.lengthManual, pipe.manualLength), 0);
        
        // Logical check: if user defined a length and it's manual mode, keep it.
        // If it was auto, definitely use geometric.
        const activeLengthValue = lengthMode === 'manual' ? (userLength > 0 ? userLength : geometricLength) : geometricLength;

        // Slope normalization
        const manualSlopeVal = readAttrNumber(firstDefined(pipe.manualSlope, pipe.slope), 0);

        return {
            ...pipe,
            lengthMode,
            slopeLocked,
            isSlopeManual: slopeLocked,
            diameter: { value: diameter, origin: 'manual' },
            material: { value: material, origin: 'manual' },
            length: { 
                value: round2(activeLengthValue), 
                origin: lengthMode === 'manual' ? 'manual' : 'calculated' 
            },
            // If slope is NOT locked, reset to 0 to force recalc from radier elevations.
            slope: { 
                value: slopeLocked ? manualSlopeVal : 0, 
                origin: slopeLocked ? 'manual' : 'calculated' 
            },
            manualSlope: { value: manualSlopeVal, origin: 'manual' }
        };
    });

    return {
        ...source,
        chambers: migratedChambers,
        pipes: migratedPipes,
        schemaVersion: 3
    };
}

function migrateSchemaLegacyToV2(project: any): any {
    const source = asObject(project);

    const migratedChambers = asArray(source.chambers).map((rawChamber: any) => {
        const heightLocked = inferHeightLocked(rawChamber);
        const chamber = stripLegacyChamberFields(rawChamber);
        const hValue = readAttrNumber(chamber.H, 0);

        return {
            ...chamber,
            heightLocked,
            H: normalizeAttr(chamber.H, hValue, heightLocked ? 'manual' : 'calculated'),
            Cre: normalizeAttr(0, 0, 'calculated'),
            CRS: normalizeAttr(0, 0, 'calculated')
        };
    });

    const migratedPipes = asArray(source.pipes).map((rawPipe: any) => {
        const slopeLocked = inferSlopeLocked(rawPipe);
        const lengthMode = inferLengthMode(rawPipe);
        const pipe = stripLegacyPipeFields(rawPipe);
        const geometricLength = estimatePipeLengthFromGeometry(pipe);
        const manualLength = readAttrNumber(
            firstDefined(pipe.length, pipe.lengthManual, pipe.manualLength),
            readAttrNumber(pipe.calculatedLength, geometricLength)
        );
        const autoLength = geometricLength > 0 ? geometricLength : readAttrNumber(firstDefined(pipe.calculatedLength, pipe.length), 0);
        const normalizedLength = lengthMode === 'auto' ? autoLength : manualLength;

        const manualSlopeValue = readAttrNumber(firstDefined(pipe.manualSlope, pipe.slope), 0);
        const normalizedSlope = slopeLocked
            ? normalizeAttr(pipe.slope, manualSlopeValue, 'manual')
            : normalizeAttr(pipe.slope, readAttrNumber(pipe.slope, 0), 'calculated');

        return {
            ...pipe,
            lengthMode,
            length: normalizeAttr(pipe.length, round2(normalizedLength), lengthMode === 'auto' ? 'calculated' : 'manual'),
            slopeLocked,
            isSlopeManual: slopeLocked,
            slope: normalizedSlope,
            manualSlope: normalizeAttr(pipe.manualSlope, manualSlopeValue, 'manual')
        };
    });

    return {
        ...source,
        chambers: migratedChambers,
        pipes: migratedPipes,
        schemaVersion: 2
    };
}

function migrateV0toV1(sourceProject: any): any {
    const source = asObject(sourceProject);

    const chambers = asArray(firstDefined(
        source.chambers,
        source.nodes,
        source.cameras,
        source.camaras,
        source.manholes,
        source.camarasSanitarias
    ));

    let pipes = asArray(firstDefined(
        source.pipes,
        source.links,
        source.lines,
        source.edges,
        source.tuberias,
        source.tubos
    ));

    pipes = pipes.map((p: any) => {
        if (!p) return p;

        const hasLegacyPipeRole = p.pipeRole && !p.override && !p.effective;

        if (hasLegacyPipeRole) {
            const legacyRole = p.pipeRole;
            let legacyRegime = p.topologyRegime;
            let legacyTopoRole = p.topologyRole;

            if (!legacyRegime) {
                legacyRegime = legacyRole === 'COLECTOR_EXTERIOR' ? 'NCH1105' : 'NCH3371';
            }
            if (!legacyTopoRole) {
                if (legacyRole === 'COLECTOR_EXTERIOR') legacyTopoRole = 'COLECTOR';
                else if (legacyRole === 'DESCARGA_HORIZ') legacyTopoRole = 'LATERAL';
                else legacyTopoRole = 'RAMAL_INTERIOR';
            }

            return {
                ...p,
                override: { enabled: true, pipeRole: legacyRole, reason: 'Migrado desde versión anterior' },
                effective: {
                    pipeRole: legacyRole,
                    topologyRegime: legacyRegime,
                    topologyRole: legacyTopoRole
                },
                designOptions: p.designOptions || { collectorSizingMode: 'UEH_Qww' }
            };
        }

        if (!p.override) {
            p.override = { enabled: false };
        }

        if (!p.designOptions) {
            const effectiveRole = p.effective?.pipeRole || p.auto?.pipeRole || p.pipeRole;
            if (effectiveRole === 'COLECTOR_EXTERIOR') {
                p.designOptions = { collectorSizingMode: 'UEH_Qww' };
            }
        }

        return p;
    });

    const settingsSource = asObject(firstDefined(
        source.settings,
        source.projectSettings,
        source.config,
        source.configuration
    ));

    const mapSource = asObject(firstDefined(settingsSource.mapDimensions, source.mapDimensions));

    const migrated = {
        ...source,
        fileType: 'SMCALC_ALC',
        version: CURRENT_PROJECT_VERSION,
        chambers,
        pipes,
        settings: {
            ...DEFAULT_PROJECT_SETTINGS,
            ...settingsSource,
            mapDimensions: {
                ...DEFAULT_PROJECT_SETTINGS.mapDimensions,
                ...mapSource,
                minX: toNumber(mapSource.minX, DEFAULT_PROJECT_SETTINGS.mapDimensions.minX),
                minY: toNumber(mapSource.minY, DEFAULT_PROJECT_SETTINGS.mapDimensions.minY),
                maxX: toNumber(mapSource.maxX, DEFAULT_PROJECT_SETTINGS.mapDimensions.maxX),
                maxY: toNumber(mapSource.maxY, DEFAULT_PROJECT_SETTINGS.mapDimensions.maxY)
            }
        },
        wetWells: asArray(firstDefined(source.wetWells, source.wetwells, source.wet_wells, source.camarasBombeo)),
        pumps: asArray(firstDefined(source.pumps, source.bombas)),
        pressurePipes: asArray(firstDefined(source.pressurePipes, source.impulsionPipes, source.tuberiasImpulsion, source.lineasImpulsion)),
        outfallsPressure: asArray(firstDefined(source.outfallsPressure, source.outfalls, source.descargas, source.discharges)),
        pressureJunctions: asArray(firstDefined(source.pressureJunctions, source.junctions, source.nodesPressure, source.nudosPresion)),
        pumpingSystems: asArray(firstDefined(source.pumpingSystems, source.systems, source.pressureSystems)),
        calculationMethod: normalizeCalculationMethod(firstDefined(source.calculationMethod, source.method)) || 'HAZEN_WILLIAMS'
    };

    return coerceNumericStrings(migrated);
}

const FILE_MIGRATIONS: Record<number, MigrationFn> = {
    0: migrateV0toV1
};

const SCHEMA_MIGRATIONS: Record<number, MigrationFn> = {
    0: migrateSchemaLegacyToV2,
    1: migrateSchemaLegacyToV2,
    2: migrateSchemaV2toV3
};

function migrateProjectFileStructure(rawData: any): Project {
    let projectDraft = unwrapEnvelope(rawData);
    let version = detectSourceVersion(projectDraft);

    while (version < CURRENT_PROJECT_VERSION) {
        const migration = FILE_MIGRATIONS[version];
        if (!migration) break;
        projectDraft = migration(projectDraft);
        version = detectSourceVersion(projectDraft);
        if (version < CURRENT_PROJECT_VERSION) {
            version = CURRENT_PROJECT_VERSION;
            projectDraft.version = version;
        }
    }

    if (!projectDraft.fileType) {
        projectDraft.fileType = 'SMCALC_ALC';
    }

    if (!projectDraft.version) {
        projectDraft.version = CURRENT_PROJECT_VERSION;
    }

    return validateProjectStructure(projectDraft);
}

export function migrateProjectSchema(rawData: any): ProjectMigrationResult {
    try {
        const rawProject = unwrapEnvelope(rawData);
        const fromSchemaVersion = detectSourceSchemaVersion(rawProject);
        const baseProject = migrateProjectFileStructure(rawProject);

        let schemaDraft: any = { ...baseProject };
        let schemaVersion = normalizeSchemaVersion(schemaDraft.schemaVersion);
        if (schemaVersion <= 0) schemaVersion = fromSchemaVersion;

        while (schemaVersion < CURRENT_PROJECT_SCHEMA_VERSION) {
            const migration = SCHEMA_MIGRATIONS[schemaVersion];
            if (!migration) break;
            schemaDraft = migration(schemaDraft);
            schemaVersion = normalizeSchemaVersion(schemaDraft.schemaVersion);
            if (schemaVersion <= 0) {
                schemaVersion += 1;
                schemaDraft.schemaVersion = schemaVersion;
            }
        }

        if (!schemaDraft.schemaVersion || normalizeSchemaVersion(schemaDraft.schemaVersion) < CURRENT_PROJECT_SCHEMA_VERSION) {
            schemaDraft.schemaVersion = CURRENT_PROJECT_SCHEMA_VERSION;
        }

        // Migration: remove all per-pipe habPorCasa overrides so the project setting always governs.
        // Users can still set per-pipe overrides explicitly via the Hab/Casa column in the table.
        schemaDraft = {
            ...schemaDraft,
            pipes: asArray(schemaDraft.pipes).map((p: any) => {
                const storedHab = p.hydraulics?.inputs?.habPorCasa;
                if (storedHab !== undefined && storedHab !== null) {
                    const { habPorCasa: _, ...restInputs } = p.hydraulics?.inputs ?? {};
                    return { ...p, hydraulics: { ...p.hydraulics, inputs: restInputs } };
                }
                return p;
            })
        };

        const validated = validateProjectStructure(schemaDraft);
        const finalProject: Project = {
            ...validated,
            schemaVersion: Math.max(CURRENT_PROJECT_SCHEMA_VERSION, normalizeSchemaVersion(validated.schemaVersion))
        };

        return {
            project: finalProject,
            meta: {
                fromSchemaVersion,
                toSchemaVersion: finalProject.schemaVersion,
                schemaMigrated: fromSchemaVersion < finalProject.schemaVersion,
                legacyDetected: fromSchemaVersion === 0
            }
        };
    } catch (error) {
        console.warn('[projectMigration] Falla no fatal al migrar esquema.', error);
        const fallback = validateProjectStructure({
            fileType: 'SMCALC_ALC',
            version: CURRENT_PROJECT_VERSION,
            schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION
        });

        return {
            project: {
                ...fallback,
                schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION
            },
            meta: {
                fromSchemaVersion: 0,
                toSchemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
                schemaMigrated: true,
                legacyDetected: true
            }
        };
    }
}

export function migrateProject(rawData: any): Project {
    return migrateProjectSchema(rawData).project;
}
