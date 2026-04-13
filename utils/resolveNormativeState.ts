import { getEffectivePipe } from './getEffectivePipe';

export type NormativeRegime = 'NCH3371' | 'NCH1105';
export type NormativeRole3371 = 'INTERIOR_RAMAL' | 'DESCARGA_HORIZ';
export type NormativeRole1105 = 'LATERAL' | 'COLECTOR' | 'CAÑERIA';

export interface NormativeState {
    regime: NormativeRegime;
    role: NormativeRole3371 | NormativeRole1105;
    isManual: boolean;
}

export function resolveNormativeState(pipe: any): NormativeState {
    if (!pipe) {
        return { regime: 'NCH3371', role: 'DESCARGA_HORIZ', isManual: false };
    }

    const effective = getEffectivePipe(pipe);
    return {
        regime: effective.regime,
        role: effective.role,
        isManual: effective.source === 'manual'
    };
}

export function inferNormativeAuto(
    startType?: string,
    endType?: string
): { regime: NormativeRegime, role: NormativeRole3371 | NormativeRole1105 } {
    const normalizeType = (value?: string): 'PUBLICA' | 'DOMICILIARIA' | 'NONE' => {
        const normalized = String(value ?? '')
            .trim()
            .toUpperCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

        if (normalized === 'PUBLICA') return 'PUBLICA';
        if (normalized === 'DOMICILIARIA') return 'DOMICILIARIA';
        return 'NONE';
    };

    const start = normalizeType(startType);
    const end = normalizeType(endType);

    // DEFAULTS INTELIGENTES SEGÚN LA NUEVA REGLA:
    // PUBLICA-PUBLICA => NCH1105 / LATERAL
    if (start === 'PUBLICA' && end === 'PUBLICA') {
        return { regime: 'NCH1105', role: 'LATERAL' };
    }

    // DOMICILIARIA-DOMICILIARIA => NCH3371 / DESCARGA_HORIZ
    if (start === 'DOMICILIARIA' && end === 'DOMICILIARIA') {
        return { regime: 'NCH3371', role: 'DESCARGA_HORIZ' };
    }

    // OTROS (MIXTO, NONE) => NCH3371 / DESCARGA_HORIZ
    return { regime: 'NCH3371', role: 'DESCARGA_HORIZ' };
}

export function migrateLegacyRole(legacyRole: string): { regime: NormativeRegime, role: NormativeRole3371 | NormativeRole1105 } {
    if (legacyRole === 'INTERIOR_RAMAL') return { regime: 'NCH3371', role: 'INTERIOR_RAMAL' };
    if (legacyRole === 'DESCARGA_HORIZ') return { regime: 'NCH3371', role: 'DESCARGA_HORIZ' };
    if (legacyRole === 'COLECTOR_EXTERIOR') return { regime: 'NCH1105', role: 'LATERAL' }; // Default is LATERAL
    return { regime: 'NCH3371', role: 'DESCARGA_HORIZ' };
}
