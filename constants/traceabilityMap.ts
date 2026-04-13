import { RolNormativo, DescargaHorizVerificationMethod } from '../hydraulics/test';

export interface TraceabilityInfo {
    method: string;
    norma: string;
    normaShort: string;
    anexo?: string;
    articulo?: string;
    formula: string;
    dnMin: number;
    slopeMin: number;
    fillLimit?: number;
    velocityMin?: number;
    velocityMax?: number;
    isUserSelected?: boolean;
    isDefault?: boolean;
}

import { getTablaA3TraceabilityInfo } from '../hydraulics/tablaA3Verifier';

const DESCARGA_HORIZ_TRACEABILITY_A3: TraceabilityInfo = {
    method: 'Tabular (UEH vs Tabla A.3)',
    norma: 'NCh3371:2017',
    normaShort: 'NCh3371',
    anexo: 'Anexo A Tabla A.3',
    articulo: 'Tabla A.3 - Capacidad de tuberías horizontales',
    formula: 'Verificación: UEH_tramo <= UEH_max (Tabla A.3)',
    dnMin: 100,
    slopeMin: 1.0,
    isDefault: true,
    isUserSelected: false
};

const DESCARGA_HORIZ_TRACEABILITY_B25: TraceabilityInfo = {
    method: 'MANNING - Ecuación de Manning',
    norma: 'NCh3371:2017',
    normaShort: 'NCh3371',
    anexo: 'Anexo B.2.5',
    articulo: 'Art. 6.3 - Cálculo hidráulico',
    formula: 'Qww = sqrt(sum(K^2 * QD * n) / 60)',
    dnMin: 100,
    slopeMin: 1.0,
    fillLimit: 0.80,
    velocityMin: 0.60,
    velocityMax: 3.0,
    isDefault: false,
    isUserSelected: true
};

export const TRACEABILITY_MAP: Record<RolNormativo, TraceabilityInfo> = {
    [RolNormativo.INTERIOR_RAMAL]: {
        method: 'Tabular (UEH vs Tabla A.3)',
        norma: 'NCh3371:2017',
        normaShort: 'NCh3371',
        anexo: 'Anexo A (RIDAA)',
        articulo: 'Tabla A.3 - Capacidad de tuberías horizontales',
        formula: 'Verificación: UEH_tramo <= UEH_max (Tabla A.3)',
        dnMin: 32,
        slopeMin: 1.0
    },
    [RolNormativo.DESCARGA_HORIZ]: DESCARGA_HORIZ_TRACEABILITY_A3,
    [RolNormativo.COLECTOR_EXTERIOR]: {
        method: 'MANNING - Ecuación de Manning con fórmula de Harmon',
        norma: 'NCh1105:2019',
        normaShort: 'NCh1105',
        anexo: undefined,
        articulo: 'Art. 6.7 - Caudales de proyecto',
        formula: 'Q = P * dot * M / 86400 (Harmon)',
        dnMin: 200,
        slopeMin: 0.5,
        fillLimit: 0.70,
        velocityMin: 0.60,
        velocityMax: 3.0
    }
};

export function getTraceability(rol: RolNormativo): TraceabilityInfo {
    return TRACEABILITY_MAP[rol];
}

export function getTraceabilityForDescargaHoriz(
    verificationMethod: DescargaHorizVerificationMethod
): TraceabilityInfo {
    if (verificationMethod === 'B25_MANNING') {
        return DESCARGA_HORIZ_TRACEABILITY_B25;
    }
    return DESCARGA_HORIZ_TRACEABILITY_A3;
}

export function getTraceabilityForPipe(
    rol: RolNormativo,
    verificationMethod?: DescargaHorizVerificationMethod
): TraceabilityInfo {
    if (rol === RolNormativo.DESCARGA_HORIZ) {
        const method = verificationMethod ?? 'A3_TABLA';
        return getTraceabilityForDescargaHoriz(method);
    }
    return TRACEABILITY_MAP[rol];
}

export function checkInconsistency(
    rol: RolNormativo,
    methodUsed: string,
    qCalculationMethod?: string
): { hasInconsistency: boolean; message: string } {
    const trace = TRACEABILITY_MAP[rol];
    
    if (rol === RolNormativo.INTERIOR_RAMAL) {
        return { hasInconsistency: false, message: '' };
    }
    
    if (rol === RolNormativo.DESCARGA_HORIZ) {
        if (!trace.norma.includes('NCh3371')) {
            return {
                hasInconsistency: true,
                message: 'DESCARGA_HORIZ debe usar NCh3371 Anexo B'
            };
        }
    }
    
    if (rol === RolNormativo.COLECTOR_EXTERIOR) {
        if (trace.norma.includes('NCh3371')) {
            return {
                hasInconsistency: true,
                message: 'COLECTOR_EXTERIOR debe usar NCh1105, no NCh3371'
            };
        }
    }
    
    return { hasInconsistency: false, message: '' };
}
