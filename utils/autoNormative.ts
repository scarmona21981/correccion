export type NormativeRegime = 'NCH3371' | 'NCH1105';
export type NormativeRole = 'INTERIOR_RAMAL' | 'DESCARGA_HORIZ' | 'LATERAL' | 'COLECTOR' | 'CAÑERIA';

interface NodeLike {
    type?: string | null;
    chamberClass?: string | null;
    chamberType?: string | null;
}

function normalize(value: unknown): string {
    return String(value ?? '')
        .trim()
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function resolveNodeType(node?: NodeLike | null): 'PUBLICA' | 'DOMICILIARIA' | 'NONE' {
    const candidates = [node?.type, node?.chamberClass, node?.chamberType];
    for (const candidate of candidates) {
        const normalized = normalize(candidate);
        if (normalized === 'PUBLICA') return 'PUBLICA';
        if (normalized === 'DOMICILIARIA') return 'DOMICILIARIA';
    }
    return 'NONE';
}

/**
 * AUTO solo define valores por defecto inteligentes, no decisiones finales.
 */
export function inferAutoNormative(
    startNode?: NodeLike | null,
    endNode?: NodeLike | null
): { regime: NormativeRegime; role: NormativeRole } {
    const s = resolveNodeType(startNode);
    const e = resolveNodeType(endNode);

    // PUBLICA - PUBLICA
    if (s === 'PUBLICA' && e === 'PUBLICA') {
        return {
            regime: 'NCH1105',
            role: 'LATERAL' // 🔥 DEFAULT NUEVO: Evita sobredimensionar como colector
        };
    }

    // DOMICILIARIA - DOMICILIARIA
    if (s === 'DOMICILIARIA' && e === 'DOMICILIARIA') {
        return {
            regime: 'NCH3371',
            role: 'DESCARGA_HORIZ' // 🔥 DEFAULT NUEVO: Representa conducción principal
        };
    }

    // MIXTO / OTROS
    return {
        regime: 'NCH3371',
        role: 'DESCARGA_HORIZ'
    };
}
