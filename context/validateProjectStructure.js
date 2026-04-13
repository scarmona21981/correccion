"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PROJECT_SETTINGS = void 0;
exports.validateProjectStructure = validateProjectStructure;
exports.DEFAULT_PROJECT_SETTINGS = {
    mapDimensions: {
        minX: 0,
        minY: 0,
        maxX: 1000,
        maxY: 1000
    },
    units: 'Meters',
    projectType: 'Público',
    sanitarySystemType: 'I',
    networkType: 'CONTINUOUS',
    verificationMode: 'UEH_MANNING'
};
const VALID_UNITS = new Set(['Meters', 'Feet', 'Degrees', 'None']);
const VALID_PROJECT_TYPES = new Set(['Domiciliario', 'Público', 'Mixto']);
const VALID_SANITARY_SYSTEM_TYPES = new Set(['I', 'II']);
const VALID_NETWORK_TYPES = new Set(['INTERMITTENT', 'CONTINUOUS']);
const VALID_VERIFICATION_MODES = new Set(['UEH_MANNING', 'MANNING_ONLY']);
const VALID_CALCULATION_METHODS = new Set(['HAZEN_WILLIAMS', 'DARCY_WEISBACH']);
const NUMERIC_HINT_KEYS = new Set([
    'x', 'y', 'x1', 'y1', 'x2', 'y2',
    'length', 'diameter', 'slope', 'z_start', 'z_end', 'PN', 'C_hazen',
    'elevation', 'fixedHead', 'targetPressureBar',
    'CR', 'CT', 'CL', 'CI', 'Nmin', 'Noff', 'N1on', 'Nalarm',
    'Qnom', 'Hnom', 'PN_usuario', 'maxStartsPerHour', 'minRunTime', 'maxRunTime',
    'chainage', 'roughness', 'thickness', 'sdr',
    'minX', 'minY', 'maxX', 'maxY'
]);
function toNumber(value, fallback) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string') {
        const normalized = value.replace(',', '.').replace(/[^0-9+\-.eE]/g, '').trim();
        if (normalized !== '') {
            const parsed = Number(normalized);
            if (Number.isFinite(parsed))
                return parsed;
        }
    }
    return fallback;
}
function toArray(value) {
    if (Array.isArray(value))
        return value;
    if (value && typeof value === 'object') {
        return Object.values(value).filter(item => item !== null && item !== undefined);
    }
    return [];
}
function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
}
function normalizeEnum(value, validSet, fallback) {
    if (typeof value === 'string' && validSet.has(value)) {
        return value;
    }
    return fallback;
}
function normalizeLooseNumbers(value, parentKey) {
    if (Array.isArray(value)) {
        return value.map(item => normalizeLooseNumbers(item));
    }
    if (value && typeof value === 'object') {
        const source = value;
        const output = {};
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
function createDefaultProject() {
    return {
        fileType: 'SMCALC_ALC',
        version: 1,
        chambers: [],
        pipes: [],
        settings: { ...exports.DEFAULT_PROJECT_SETTINGS, mapDimensions: { ...exports.DEFAULT_PROJECT_SETTINGS.mapDimensions } },
        wetWells: [],
        pumps: [],
        pressurePipes: [],
        outfallsPressure: [],
        pressureJunctions: [],
        pumpingSystems: []
    };
}
function validateProjectStructure(project) {
    try {
        const source = asObject(project);
        const sourceSettings = asObject(source.settings);
        const sourceMap = asObject(sourceSettings.mapDimensions);
        const normalizedSettings = {
            mapDimensions: {
                minX: toNumber(sourceMap.minX, exports.DEFAULT_PROJECT_SETTINGS.mapDimensions.minX),
                minY: toNumber(sourceMap.minY, exports.DEFAULT_PROJECT_SETTINGS.mapDimensions.minY),
                maxX: toNumber(sourceMap.maxX, exports.DEFAULT_PROJECT_SETTINGS.mapDimensions.maxX),
                maxY: toNumber(sourceMap.maxY, exports.DEFAULT_PROJECT_SETTINGS.mapDimensions.maxY)
            },
            units: normalizeEnum(sourceSettings.units, VALID_UNITS, exports.DEFAULT_PROJECT_SETTINGS.units),
            projectType: normalizeEnum(sourceSettings.projectType, VALID_PROJECT_TYPES, exports.DEFAULT_PROJECT_SETTINGS.projectType),
            sanitarySystemType: normalizeEnum(sourceSettings.sanitarySystemType, VALID_SANITARY_SYSTEM_TYPES, exports.DEFAULT_PROJECT_SETTINGS.sanitarySystemType),
            networkType: normalizeEnum(sourceSettings.networkType, VALID_NETWORK_TYPES, exports.DEFAULT_PROJECT_SETTINGS.networkType),
            verificationMode: normalizeEnum(sourceSettings.verificationMode, VALID_VERIFICATION_MODES, exports.DEFAULT_PROJECT_SETTINGS.verificationMode)
        };
        if (normalizedSettings.mapDimensions.maxX <= normalizedSettings.mapDimensions.minX) {
            normalizedSettings.mapDimensions.maxX = normalizedSettings.mapDimensions.minX + 1000;
            console.warn('[validateProjectStructure] maxX invalido; usando valor por defecto seguro.');
        }
        if (normalizedSettings.mapDimensions.maxY <= normalizedSettings.mapDimensions.minY) {
            normalizedSettings.mapDimensions.maxY = normalizedSettings.mapDimensions.minY + 1000;
            console.warn('[validateProjectStructure] maxY invalido; usando valor por defecto seguro.');
        }
        const rawVersion = toNumber(source.version, 1);
        const version = Number.isFinite(rawVersion) && rawVersion > 0
            ? Math.floor(rawVersion)
            : 1;
        const normalizedCalculationMethod = normalizeEnum(source.calculationMethod, VALID_CALCULATION_METHODS, 'HAZEN_WILLIAMS');
        const validated = {
            fileType: 'SMCALC_ALC',
            version,
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
    }
    catch (error) {
        console.warn('[validateProjectStructure] Error no fatal. Se aplica fallback seguro.', error);
        return createDefaultProject();
    }
}
