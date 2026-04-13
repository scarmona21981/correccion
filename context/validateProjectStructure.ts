import type { CalculationMethod } from '../hydraulics/types';
import type { SanitarySystemType } from '../hydraulics/qwwTables';
import { CURRENT_PROJECT_SCHEMA_VERSION, CURRENT_PROJECT_VERSION, normalizeSchemaVersion } from './projectSchema';

export type FlowDesignModeCollectors = 'POPULATION_NCH1105' | 'DIRECT_Q';
export type NCh1105PeakMode = 'AUTO' | 'FORCE_HARMON' | 'STRICT';

export interface NCh1105SettingsShape {
    enabled: boolean;
    peakMode: NCh1105PeakMode;
    habPorCasa?: number | null;
}

export interface ProjectSettingsShape {
    mapDimensions: {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
    };
    units: 'Meters' | 'Feet' | 'Degrees' | 'None';
    projectType: 'Domiciliario' | 'Público' | 'Mixto';
    sanitarySystemType: SanitarySystemType;
    verificationMode: 'UEH_MANNING' | 'MANNING_ONLY';
    flowDesignModeCollectors: FlowDesignModeCollectors;
    hasPopulation: boolean;
    populationTotal: number;
    D_L_per_hab_day: number;
    R_recovery: number;
    C_capacity: number;
    nch1105: NCh1105SettingsShape;
    manning: {
        value: number;
        source: 'global' | 'manual';
    };
}

export interface Project {
    fileType: 'SMCALC_ALC';
    version: number;
    schemaVersion: number;
    chambers: any[];
    pipes: any[];
    settings: ProjectSettingsShape;
    wetWells: any[];
    pumps: any[];
    pressurePipes: any[];
    outfallsPressure: any[];
    pressureJunctions: any[];
    pumpingSystems: any[];
    activePumpingSystemId?: string;
    calculationMethod?: CalculationMethod;
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettingsShape = {
    mapDimensions: {
        minX: 0,
        minY: 0,
        maxX: 1000,
        maxY: 1000
    },
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

const VALID_UNITS = new Set<ProjectSettingsShape['units']>(['Meters', 'Feet', 'Degrees', 'None']);
const VALID_PROJECT_TYPES = new Set<ProjectSettingsShape['projectType']>(['Domiciliario', 'Público', 'Mixto']);
const VALID_SANITARY_SYSTEM_TYPES = new Set<ProjectSettingsShape['sanitarySystemType']>(['I', 'II']);
const VALID_FLOW_DESIGN_MODES = new Set<ProjectSettingsShape['flowDesignModeCollectors']>(['POPULATION_NCH1105', 'DIRECT_Q']);
const VALID_VERIFICATION_MODES = new Set<ProjectSettingsShape['verificationMode']>(['UEH_MANNING', 'MANNING_ONLY']);
const VALID_PEAK_MODES = new Set<NCh1105PeakMode>(['AUTO', 'FORCE_HARMON', 'STRICT']);
const VALID_CALCULATION_METHODS = new Set<CalculationMethod>(['HAZEN_WILLIAMS', 'DARCY_WEISBACH']);

const NUMERIC_HINT_KEYS = new Set([
    'x', 'y', 'x1', 'y1', 'x2', 'y2',
    'length', 'diameter', 'slope', 'z_start', 'z_end', 'z_start_terreno', 'z_end_terreno', 'cover_m', 'PN', 'C_hazen',
    'elevation', 'fixedHead', 'targetPressureBar',
    'CR', 'CT', 'CL', 'CI', 'Nmin', 'Noff', 'N1on', 'Nalarm',
    'Qnom', 'Hnom', 'PN_usuario', 'maxStartsPerHour', 'minRunTime', 'maxRunTime',
    'chainage', 'roughness', 'thickness', 'sdr',
    'minX', 'minY', 'maxX', 'maxY'
]);

function toNumber(value: any, fallback: number): number {
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

function toArray<T = any>(value: any): T[] {
    if (Array.isArray(value)) return value as T[];
    if (value && typeof value === 'object') {
        return Object.values(value).filter(item => item !== null && item !== undefined) as T[];
    }
    return [];
}

function asObject(value: any): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, any>
        : {};
}

function normalizeEnum<T extends string>(value: any, validSet: Set<T>, fallback: T): T {
    if (typeof value === 'string' && validSet.has(value as T)) {
        return value as T;
    }
    return fallback;
}

function normalizeLooseNumbers(value: any, parentKey?: string): any {
    if (Array.isArray(value)) {
        return value.map(item => normalizeLooseNumbers(item));
    }

    if (value && typeof value === 'object') {
        const source = value as Record<string, any>;
        const output: Record<string, any> = {};

        Object.entries(source).forEach(([key, inner]) => {
            if (typeof inner === 'string' && NUMERIC_HINT_KEYS.has(key)) {
                output[key] = toNumber(inner, 0);
                return;
            }

            output[key] = normalizeLooseNumbers(inner, key);
        });

        return output;
    }

    if (typeof value === 'string' && parentKey && NUMERIC_HINT_KEYS.has(parentKey)) {
        return toNumber(value, 0);
    }

    return value;
}

function createDefaultProject(): Project {
    return {
        fileType: 'SMCALC_ALC',
        version: CURRENT_PROJECT_VERSION,
        schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
        chambers: [],
        pipes: [],
        settings: { ...DEFAULT_PROJECT_SETTINGS, mapDimensions: { ...DEFAULT_PROJECT_SETTINGS.mapDimensions } },
        wetWells: [],
        pumps: [],
        pressurePipes: [],
        outfallsPressure: [],
        pressureJunctions: [],
        pumpingSystems: []
    };
}

export function validateProjectStructure(project: any): Project {
    try {
        const source = asObject(project);
        const sourceSettings = asObject(source.settings);
        const sourceMap = asObject(sourceSettings.mapDimensions);
        const sourceNch1105 = asObject(sourceSettings.nch1105);

        const normalizedSettings: ProjectSettingsShape = {
            mapDimensions: {
                minX: toNumber(sourceMap.minX, DEFAULT_PROJECT_SETTINGS.mapDimensions.minX),
                minY: toNumber(sourceMap.minY, DEFAULT_PROJECT_SETTINGS.mapDimensions.minY),
                maxX: toNumber(sourceMap.maxX, DEFAULT_PROJECT_SETTINGS.mapDimensions.maxX),
                maxY: toNumber(sourceMap.maxY, DEFAULT_PROJECT_SETTINGS.mapDimensions.maxY)
            },
            units: normalizeEnum(sourceSettings.units, VALID_UNITS, DEFAULT_PROJECT_SETTINGS.units),
            projectType: normalizeEnum(sourceSettings.projectType, VALID_PROJECT_TYPES, DEFAULT_PROJECT_SETTINGS.projectType),
            sanitarySystemType: normalizeEnum(sourceSettings.sanitarySystemType, VALID_SANITARY_SYSTEM_TYPES, DEFAULT_PROJECT_SETTINGS.sanitarySystemType),
            flowDesignModeCollectors: normalizeEnum(sourceSettings.flowDesignModeCollectors, VALID_FLOW_DESIGN_MODES, DEFAULT_PROJECT_SETTINGS.flowDesignModeCollectors),
            verificationMode: normalizeEnum(sourceSettings.verificationMode, VALID_VERIFICATION_MODES, DEFAULT_PROJECT_SETTINGS.verificationMode),
            hasPopulation: typeof sourceSettings.hasPopulation === 'boolean' ? sourceSettings.hasPopulation : DEFAULT_PROJECT_SETTINGS.hasPopulation,
            populationTotal: toNumber(sourceSettings.populationTotal, DEFAULT_PROJECT_SETTINGS.populationTotal),
            D_L_per_hab_day: toNumber(sourceSettings.D_L_per_hab_day, DEFAULT_PROJECT_SETTINGS.D_L_per_hab_day),
            R_recovery: toNumber(sourceSettings.R_recovery, DEFAULT_PROJECT_SETTINGS.R_recovery),
            C_capacity: toNumber(sourceSettings.C_capacity, DEFAULT_PROJECT_SETTINGS.C_capacity),
            nch1105: {
                enabled: typeof sourceNch1105.enabled === 'boolean'
                    ? sourceNch1105.enabled
                    : DEFAULT_PROJECT_SETTINGS.nch1105.enabled,
                peakMode: normalizeEnum(sourceNch1105.peakMode, VALID_PEAK_MODES, DEFAULT_PROJECT_SETTINGS.nch1105.peakMode),
                habPorCasa: (() => {
                    const raw = toNumber(sourceNch1105.habPorCasa, 0);
                    return raw > 0 ? raw : null;
                })()
            },
            manning: {
                value: toNumber(asObject(sourceSettings.manning).value, DEFAULT_PROJECT_SETTINGS.manning.value),
                source: normalizeEnum(asObject(sourceSettings.manning).source, new Set(['global', 'manual']), DEFAULT_PROJECT_SETTINGS.manning.source)
            }
        };

        if (normalizedSettings.mapDimensions.maxX <= normalizedSettings.mapDimensions.minX) {
            normalizedSettings.mapDimensions.maxX = normalizedSettings.mapDimensions.minX + 1000;
            console.warn('[validateProjectStructure] maxX invalido; usando valor por defecto seguro.');
        }
        if (normalizedSettings.mapDimensions.maxY <= normalizedSettings.mapDimensions.minY) {
            normalizedSettings.mapDimensions.maxY = normalizedSettings.mapDimensions.minY + 1000;
            console.warn('[validateProjectStructure] maxY invalido; usando valor por defecto seguro.');
        }

        const rawVersion = toNumber(source.version, CURRENT_PROJECT_VERSION);
        const version = Number.isFinite(rawVersion) && rawVersion > 0
            ? Math.floor(rawVersion)
            : CURRENT_PROJECT_VERSION;
        const schemaVersion = (() => {
            const parsed = normalizeSchemaVersion(source.schemaVersion);
            if (parsed > 0) return parsed;
            return 0;
        })();

        const normalizedCalculationMethod = normalizeEnum(
            source.calculationMethod,
            VALID_CALCULATION_METHODS,
            'HAZEN_WILLIAMS'
        );

        const validated: Project = {
            fileType: 'SMCALC_ALC',
            version,
            schemaVersion,
            chambers: normalizeLooseNumbers(toArray(source.chambers)),
            pipes: normalizeLooseNumbers(toArray(source.pipes)),
            settings: normalizedSettings,
            wetWells: normalizeLooseNumbers(toArray(source.wetWells)),
            pumps: normalizeLooseNumbers(toArray(source.pumps)),
            pressurePipes: normalizeLooseNumbers(toArray(source.pressurePipes)),
            outfallsPressure: normalizeLooseNumbers(toArray(source.outfallsPressure)),
            pressureJunctions: normalizeLooseNumbers(toArray(source.pressureJunctions)),
            pumpingSystems: normalizeLooseNumbers(toArray(source.pumpingSystems)),
            activePumpingSystemId: typeof source.activePumpingSystemId === 'string' ? source.activePumpingSystemId : undefined,
            calculationMethod: normalizedCalculationMethod
        };

        return validated;
    } catch (error) {
        console.warn('[validateProjectStructure] Error no fatal. Se aplica fallback seguro.', error);
        return createDefaultProject();
    }
}
