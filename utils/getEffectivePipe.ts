import { NormativeRegime, NormativeRole3371, NormativeRole1105 } from './resolveNormativeState';

export function getEffectivePipe(pipe: any) {
    const normalizeRegime = (value: any): NormativeRegime => {
        const raw = String(value ?? '').toUpperCase().trim();
        return raw === 'NCH1105' ? 'NCH1105' : 'NCH3371';
    };

    const normalizeRole = (value: any, regime: NormativeRegime): NormativeRole3371 | NormativeRole1105 => {
        const raw = String(value ?? '').toUpperCase().trim();

        const canonical = raw === 'RAMAL_INTERIOR'
            ? 'INTERIOR_RAMAL'
            : raw === 'RAMAL_CONEXION'
                ? 'DESCARGA_HORIZ'
                : raw === 'NACIENTE'
                    ? 'LATERAL'
                    : raw === 'INTERCEPTOR' || raw === 'EMISARIO'
                        ? 'COLECTOR'
                        : raw;

        if (regime === 'NCH1105') {
            // Soporte para LATERAL, COLECTOR y CAÑERIA. Default es LATERAL.
            return (canonical === 'LATERAL' || canonical === 'COLECTOR' || canonical === 'CAÑERIA') 
                ? (canonical as NormativeRole1105) 
                : 'LATERAL';
        }

        // Para NCH3371. Default es DESCARGA_HORIZ.
        return (canonical === 'INTERIOR_RAMAL' || canonical === 'DESCARGA_HORIZ')
            ? (canonical as NormativeRole3371)
            : 'DESCARGA_HORIZ';
    };

    const autoRegime = normalizeRegime(pipe?.auto?.normativeRegime || pipe?.auto?.topologyRegime);
    const autoRole = normalizeRole(pipe?.auto?.normativeRole || pipe?.auto?.topologyRole, autoRegime);

    if (pipe?.override?.enabled) {
        const manualRegime = normalizeRegime(pipe.override.norma || pipe.override.normativeRegime || autoRegime);
        return {
            regime: manualRegime,
            role: manualRegime === 'NCH1105'
                    ? normalizeRole(pipe.override.role1105 || pipe.override.normativeRole || autoRole, manualRegime)
                    : normalizeRole(pipe.override.role3371 || pipe.override.normativeRole || autoRole, manualRegime),
            source: 'manual' as const
        };
    }

    return {
        regime: autoRegime,
        role: autoRole,
        source: 'auto' as const
    };
}
