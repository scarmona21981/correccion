"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateProject = migrateProject;
const validateProjectStructure_1 = require("./validateProjectStructure");
const CURRENT_PROJECT_VERSION = 1;
function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
}
function asArray(value) {
    if (Array.isArray(value))
        return value;
    if (value && typeof value === 'object') {
        return Object.values(value).filter(item => item !== null && item !== undefined);
    }
    return [];
}
function firstDefined(...values) {
    for (const value of values) {
        if (value !== undefined && value !== null)
            return value;
    }
    return undefined;
}
function toNumber(value, fallback = 0) {
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
function normalizeCalculationMethod(value) {
    if (typeof value !== 'string')
        return undefined;
    const normalized = value.toUpperCase().replace(/[^A-Z_]/g, '');
    if (normalized.includes('DARCY'))
        return 'DARCY_WEISBACH';
    if (normalized.includes('HAZEN'))
        return 'HAZEN_WILLIAMS';
    return undefined;
}
function detectSourceVersion(data) {
    if (!Object.prototype.hasOwnProperty.call(data, 'version')) {
        console.warn('[projectMigration] Archivo sin version detectada. Se asume v0 legacy.');
        return 0;
    }
    const rawVersion = toNumber(data.version, 0);
    return Number.isFinite(rawVersion) && rawVersion >= 0
        ? Math.floor(rawVersion)
        : 0;
}
function unwrapEnvelope(rawData) {
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
function coerceNumericStrings(value) {
    if (Array.isArray(value)) {
        return value.map(item => coerceNumericStrings(item));
    }
    if (value && typeof value === 'object') {
        const source = value;
        const output = {};
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
function migrateV0toV1(sourceProject) {
    const source = asObject(sourceProject);
    const chambers = asArray(firstDefined(source.chambers, source.nodes, source.cameras, source.camaras, source.manholes, source.camarasSanitarias));
    const pipes = asArray(firstDefined(source.pipes, source.links, source.lines, source.edges, source.tuberias, source.tubos));
    const settingsSource = asObject(firstDefined(source.settings, source.projectSettings, source.config, source.configuration));
    const mapSource = asObject(firstDefined(settingsSource.mapDimensions, source.mapDimensions));
    const migrated = {
        ...source,
        fileType: 'SMCALC_ALC',
        version: 1,
        chambers,
        pipes,
        settings: {
            ...validateProjectStructure_1.DEFAULT_PROJECT_SETTINGS,
            ...settingsSource,
            mapDimensions: {
                ...validateProjectStructure_1.DEFAULT_PROJECT_SETTINGS.mapDimensions,
                ...mapSource,
                minX: toNumber(mapSource.minX, validateProjectStructure_1.DEFAULT_PROJECT_SETTINGS.mapDimensions.minX),
                minY: toNumber(mapSource.minY, validateProjectStructure_1.DEFAULT_PROJECT_SETTINGS.mapDimensions.minY),
                maxX: toNumber(mapSource.maxX, validateProjectStructure_1.DEFAULT_PROJECT_SETTINGS.mapDimensions.maxX),
                maxY: toNumber(mapSource.maxY, validateProjectStructure_1.DEFAULT_PROJECT_SETTINGS.mapDimensions.maxY)
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
const MIGRATIONS = {
    0: migrateV0toV1
};
function migrateProject(rawData) {
    try {
        let projectDraft = unwrapEnvelope(rawData);
        let version = detectSourceVersion(projectDraft);
        while (version < CURRENT_PROJECT_VERSION) {
            const migration = MIGRATIONS[version];
            if (!migration) {
                console.warn(`[projectMigration] No existe migración para versión ${version}. Se aplica validación defensiva.`);
                break;
            }
            projectDraft = migration(projectDraft);
            version = detectSourceVersion(projectDraft);
            if (version < 1) {
                version = 1;
                projectDraft.version = version;
            }
        }
        if (!projectDraft.fileType) {
            console.warn('[projectMigration] fileType ausente. Se asigna SMCALC_ALC.');
            projectDraft.fileType = 'SMCALC_ALC';
        }
        if (!projectDraft.version) {
            projectDraft.version = CURRENT_PROJECT_VERSION;
        }
        return (0, validateProjectStructure_1.validateProjectStructure)(projectDraft);
    }
    catch (error) {
        console.warn('[projectMigration] Falla no fatal al migrar. Se retorna proyecto por defecto.', error);
        return (0, validateProjectStructure_1.validateProjectStructure)({
            fileType: 'SMCALC_ALC',
            version: CURRENT_PROJECT_VERSION
        });
    }
}
