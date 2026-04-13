export const CURRENT_PROJECT_VERSION = 1;
export const CURRENT_PROJECT_SCHEMA_VERSION = 3;

export const normalizeSchemaVersion = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
    if (typeof value === 'string') {
        const parsed = Number(value.trim());
        if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
    }
    return 0;
};
