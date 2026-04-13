/**
 * NORMATIVE MAP - Mapa de Referencias Normativas
 * 
 * Este archivo centraliza todas las referencias normativas del proyecto
 * para evitar inconsistencias entre el metodo de calculo y la cita normativa.
 * 
 * REGLAS FUNDAMENTALES:
 * 
 * INTERIOR_RAMAL:
 *   - Metodo: UEH (Unidades de Equivalencia Hidraulica)
 *   - Norma: NCh3371:2017 - Anexo A (RIDAA)
 *   - Verificacion: Tabla A.3 (UEH_tramo <= UEH_max)
 *   - NO se calcula caudal, verificacion puramente tabular
 * 
 * DESCARGA_HORIZ:
 *   - Metodo: UNE (Unidades de Descarga) + Manning
 *   - Norma: NCh3371:2017 - Anexo B.2.5
 *   - Caudal: QD + K (Anexo B, Tablas B.1, B.2)
 *   - Llenado maximo: y/D <= 0.80
 * 
 * COLECTOR_EXTERIOR:
 *   - Metodo: Poblacion + Manning (Harmon/Boston)
 *   - Norma: NCh1105:2019
 *   - NO citar NCh3371 para colectores
 *   - Llenado maximo: h/D <= 0.70
 */

export type PipeNormativeRole = 'INTERIOR_RAMAL' | 'DESCARGA_HORIZ' | 'COLECTOR_EXTERIOR';

export interface NormativeConfig {
    method: 'UEH' | 'UNE' | 'POBLACION_MANNING';
    methodLabel: string;
    norma: string;
    normaShort: string;
    formula?: string;
    fillLimit?: number;
    velocityMin?: number;
    velocityMax?: number;
    dnMin?: number;
    slopeMin?: number;
}

export const NORMATIVE_MAP: Record<PipeNormativeRole, NormativeConfig> = {
    INTERIOR_RAMAL: {
        method: 'UEH',
        methodLabel: 'UEH',
        norma: 'NCh3371:2017 - Anexo A (RIDAA)',
        normaShort: 'NCh3371 Anexo A (RIDAA)',
        formula: undefined,
        dnMin: 32,
        slopeMin: 1.0
    },
    DESCARGA_HORIZ: {
        method: 'UNE',
        methodLabel: 'MANNING',
        norma: 'NCh3371:2017 - Anexo B.2.5',
        normaShort: 'NCh3371 B.2.5',
        formula: 'Qww = sqrt(sum(K^2 * QD * n) / 60)',
        fillLimit: 0.80,
        velocityMin: 0.60,
        velocityMax: 3.0
    },
    COLECTOR_EXTERIOR: {
        method: 'POBLACION_MANNING',
        methodLabel: 'MANNING',
        norma: 'NCh1105:2019',
        normaShort: 'NCh1105',
        formula: 'Q = P * dot * M / 86400 (Harmon)',
        fillLimit: 0.70,
        velocityMin: 0.60,
        velocityMax: 3.0,
        dnMin: 200
    }
};

export function getNormativeConfig(role: PipeNormativeRole): NormativeConfig {
    return NORMATIVE_MAP[role];
}

export function getNormaLabel(role: PipeNormativeRole): string {
    return NORMATIVE_MAP[role].normaShort;
}

export function getMethodLabel(role: PipeNormativeRole): string {
    return NORMATIVE_MAP[role].methodLabel;
}

export function getFormula(role: PipeNormativeRole): string | undefined {
    return NORMATIVE_MAP[role].formula;
}

export function getFillLimit(role: PipeNormativeRole): number | undefined {
    return NORMATIVE_MAP[role].fillLimit;
}

export function isInteriorRamal(role: PipeNormativeRole): boolean {
    return role === 'INTERIOR_RAMAL';
}

export function isDescargaHoriz(role: PipeNormativeRole): boolean {
    return role === 'DESCARGA_HORIZ';
}

export function isColectorExterior(role: PipeNormativeRole): boolean {
    return role === 'COLECTOR_EXTERIOR';
}

export function usesUEH(role: PipeNormativeRole): boolean {
    return NORMATIVE_MAP[role].method === 'UEH';
}

export function usesUNE(role: PipeNormativeRole): boolean {
    return NORMATIVE_MAP[role].method === 'UNE';
}

export function usesPoblacion(role: PipeNormativeRole): boolean {
    return NORMATIVE_MAP[role].method === 'POBLACION_MANNING';
}

export const NORMATIVE_REFERENCES = {
    NCH3371_ANEXO_A: 'NCh3371:2017 - Anexo A (RIDAA)',
    NCH3371_ANEXO_A_TABLA3: 'NCh3371:2017 - Anexo A (Tabla 3)',
    NCH3371_ANEXO_B25: 'NCh3371:2017 - Anexo B.2.5',
    NCH3371_TABLA_B1: 'NCh3371:2017 - Tabla B.1',
    NCH3371_TABLA_B2: 'NCh3371:2017 - Tabla B.2',
    NCH3371_TABLA_B3: 'NCh3371:2017 - Tabla B.3',
    NCH3371_TABLA_B4: 'NCh3371:2017 - Tabla B.4',
    NCH1105: 'NCh1105:2019',
    NCH1105_61: 'NCh1105:2019, 6.1',
    NCH1105_67: 'NCh1105:2019, 6.7',
    NCH1105_68: 'NCh1105:2019, 6.8',
    NCH1105_81: 'NCh1105:2019, 8.1',
    NCH1105_TABLA1: 'NCh1105:2019, Tabla 1'
};

export const DESIGN_METHOD_NORMATIVE: Record<'NCH3371_A' | 'NCH3371_B', { label: string; norma: string }> = {
    NCH3371_A: {
        label: 'Anexo A (Tabla 3)',
        norma: 'NCh3371:2017 - Anexo A (Tabla 3)'
    },
    NCH3371_B: {
        label: 'Anexo B.2.5 (Manning)',
        norma: 'NCh3371:2017 - Anexo B.2.5'
    }
};

export function getDesignMethodNormative(method: 'NCH3371_A' | 'NCH3371_B'): { label: string; norma: string } {
    return DESIGN_METHOD_NORMATIVE[method];
}
