/**
 * Design Flow Calculator for COLECTOR segments (NCh1105)
 * Supports:
 * - UEH_Qww mode: Uses accumulated Qww from upstream UEH/artifacts
 * - POBLACION_NCH1105 mode: Uses population-based calculation per NCh1105
 * - POBLACION_PONDERADA_UEH mode: Uses weighted population from UEH distribution
 * 
 * NCh1105:2019 – 6.6.1.1 Flow Calculation:
 * 1. QmdAS = (P * D * R * C) / 86400  [L/s]
 * 2. For P > 1000: M = Harmon formula, Qmax = M * QmdAS
 * 3. For P < 100: BSCE table lookup (Anexo A)
 * 4. For 100 <= P <= 1000: Linear interpolation between BSCE(20 houses=3.6L/s) and Harmon(1000)
 */

import { Pipe, NCh1105PeakMode, ProjectSettings } from '../context/ProjectContext';
import { getEffectivePipe } from './getEffectivePipe';
import {
    BSCE_TABLE,
    Q_BSCE_20,
    resolveHabPorCasaFactor,
    resolveNCh1105BSCEInput
} from '../hydraulics/nch1105BSCEHelper';

export type CollectorSizingMode = 'UEH_Qww' | 'POBLACION_NCH1105' | 'POBLACION_PONDERADA_UEH';

export interface PopulationParams {
    P: number;
    D: number;
    R: number;
    C: number;
    peakMode?: NCh1105PeakMode;
    habPorCasa?: number | null;
}

export interface DesignFlowResult {
    Q_used_Lps: number;
    method: 'UEH_Qww' | 'POBLACION_NCH1105' | 'POBLACION_PONDERADA_UEH';
    flowMethodNCh1105?: 'HARMON' | 'BSCE' | 'INTERPOLACION' | 'CAUDAL_DIRECTO' | null;
    details: {
        Qww_Lps?: number;
        P?: number;
        P_edge?: number;
        equivalentHouses?: number;
        habPorCasaUsado?: number;
        D?: number;
        R?: number;
        C?: number;
        Qmd_Lps?: number;
        M_harmon?: number;
        Qmax_Lps?: number;
        warnings?: string[];
        errors?: string[];
        UEH_total?: number;
        UEH_upstream?: number;
        norma?: string;
    };
}

export function getBSCEFlow_Lps(houses: number): number | null {
    const nViv = Math.round(houses);
    if (nViv < 1 || nViv > 20) return null;
    return BSCE_TABLE[nViv] ?? null;
}

/**
 * NCh1105:2019 – 6.6.1.1
 * Coeficiente de Harmon oficial
 * M = 1 + 14 / (4 + sqrt(P/1000))
 * Donde P es la población servida en habitantes
 * La raiz se aplica sobre (P/1000), NO sobre P directo
 */
export function harmonCoefficient(P: number): number {
    if (!P || P <= 0) return 1;
    return 1 + 14 / (4 + Math.sqrt(P / 1000));
}

/**
 * @deprecated Use harmonCoefficient() instead
 * Legacy function kept for backward compatibility
 */
export function calculateHarmonM(P: number): number {
    return harmonCoefficient(P);
}

export function calculateQmdAS_Lps(params: PopulationParams): number {
    const { P, D, R, C } = params;
    return (P * D * R * C) / 86400;
}

export interface NCh1105PeakFlowResult {
    P_edge: number;
    Qmax: number;
    qmax: number;
    method: 'HARMON' | 'BSCE' | 'INTERPOLACION';
    metodo: 'HARMON' | 'BSCE' | 'INTERPOLACION';
    Qmd: number;
    M?: number;
    equivalentHouses?: number;
    habPorCasaUsado?: number;
    warnings: string[];
    details: {
        D: number;
        R: number;
        C: number;
        Q100_Lps?: number;
        Q1000_Lps?: number;
        Qmd_1000_Lps?: number;
        interpolationFactor?: number;
        equivalentHouses?: number;
        habPorCasaUsado?: number;
        norma: string;
    };
}

/**
 * NCh1105:2019 – 6.6.1.1
 * Calcula el caudal maximo horario segun el metodo normativo
 * - P < 100: BSCE (Anexo A)
 * - 100 <= P <= 1000: Interpolacion lineal entre 3.6 L/s y Harmon(1000)
 * - P > 1000: Harmon oficial M = 1 + 14/(4 + sqrt(P/1000))
 */
export function calculatePeakFlow_NCh1105(
    P: number,
    D: number,
    R: number,
    C: number,
    mode: NCh1105PeakMode = 'AUTO',
    habPorCasa: number | null = null
): NCh1105PeakFlowResult {
    const warnings: string[] = [];
    const P_edge = Number.isFinite(P) ? P : 0;
    const habPorCasaUsado = resolveHabPorCasaFactor(habPorCasa);

    if (P_edge <= 0) {
        return {
            P_edge,
            Qmax: 0,
            qmax: 0,
            method: 'BSCE',
            metodo: 'BSCE',
            Qmd: 0,
            equivalentHouses: undefined,
            habPorCasaUsado,
            warnings: ['Población debe ser mayor a 0'],
            details: {
                D,
                R,
                C,
                habPorCasaUsado,
                norma: 'NCh1105:2019'
            }
        };
    }

    if (R > 1) {
        warnings.push(`R=${R} > 1.0 - valor inusual para coeficiente de recuperacion`);
    }
    if (C < 1) {
        warnings.push(`C=${C} < 1.0 - valor inusual para factor de capacidad`);
    }

    const Qmd = (P_edge * D * R * C) / 86400;

    if (mode === 'FORCE_HARMON') {
        const M = harmonCoefficient(P_edge);
        const Qmax = M * Qmd;
        return {
            P_edge,
            Qmax,
            method: 'HARMON',
            qmax: Qmax,
            metodo: 'HARMON',
            Qmd,
            M,
            habPorCasaUsado,
            warnings: [...warnings, 'Forzando Harmon por modo de diseño'],
            details: {
                D,
                R,
                C,
                habPorCasaUsado,
                norma: 'NCh1105:2019 - Forzado Harmon'
            }
        };
    }

    if (P_edge > 1000) {
        const M = harmonCoefficient(P_edge);
        const Qmax = M * Qmd;
        return {
            P_edge,
            Qmax,
            method: 'HARMON',
            qmax: Qmax,
            metodo: 'HARMON',
            Qmd,
            M,
            habPorCasaUsado,
            warnings,
            details: {
                D,
                R,
                C,
                habPorCasaUsado,
                norma: 'NCh1105:2019 - Harmon (P>1000)'
            }
        };
    }

    if (P_edge < 100) {
        const bsceResolved = resolveNCh1105BSCEInput(P_edge, { nch1105: { habPorCasa } });
        return {
            P_edge,
            Qmax: bsceResolved.qmaxBsce,
            method: 'BSCE',
            qmax: bsceResolved.qmaxBsce,
            metodo: 'BSCE',
            Qmd,
            equivalentHouses: bsceResolved.equivalentHouses,
            habPorCasaUsado: bsceResolved.habPorCasaUsado,
            warnings,
            details: {
                D,
                R,
                C,
                equivalentHouses: bsceResolved.equivalentHouses,
                habPorCasaUsado: bsceResolved.habPorCasaUsado,
                norma: `NCh1105:2019 - Anexo A (BSCE, hab/casa=${bsceResolved.habPorCasaUsado})`
            }
        };
    }

    const Q100 = Q_BSCE_20;
    const P_low = 100;
    const P_high = 1000;

    const Qmd_high = (P_high * D * R * C) / 86400;
    const M_high = harmonCoefficient(P_high);
    const Q1000 = M_high * Qmd_high;

    const t = (P_edge - P_low) / (P_high - P_low);
    const Qmax = Q100 + t * (Q1000 - Q100);

        warnings.push(`Población ${P_edge} en rango de interpolación (100-1000)`);
    return {
        P_edge,
        Qmax,
        method: 'INTERPOLACION',
        qmax: Qmax,
        metodo: 'INTERPOLACION',
        Qmd,
        habPorCasaUsado,
        warnings,
        details: {
            D,
            R,
            C,
            Q100_Lps: Q100,
            Q1000_Lps: Q1000,
            Qmd_1000_Lps: Qmd_high,
            interpolationFactor: t,
            habPorCasaUsado,
            norma: 'NCh1105:2019 - Interpolacion (100<=P<=1000)'
        }
    };
}

/**
 * @deprecated Use calculatePeakFlow_NCh1105() instead
 * Legacy function kept for backward compatibility
 */
export function calculateQmaxNCh1105_Lps(params: PopulationParams): {
    P_edge: number;
    Qmax: number;
    method: 'HARMON' | 'BSCE' | 'INTERPOLACION';
    Qmd: number;
    M?: number;
    warnings: string[];
    details: NCh1105PeakFlowResult['details'];
} {
    return calculatePeakFlow_NCh1105(
        params.P,
        params.D,
        params.R,
        params.C,
        params.peakMode || 'AUTO',
        params.habPorCasa ?? null
    );
}

export interface WeightedPopulationConfig {
    P_total: number;
    D: number;
    R: number;
    C: number;
    UEH_total: number;
    UEH_upstream: number;
    peakMode?: NCh1105PeakMode;
    habPorCasa?: number | null;
}

export interface WeightedPopulationResult {
    P_edge: number;
    equivalentHouses: number;
    habPorCasaUsado?: number;
    Qmd_Lps: number;
    M_harmon?: number;
    Qmax_Lps: number;
    method: 'HARMON' | 'BSCE' | 'INTERPOLACION';
    norma?: string;
    warnings: string[];
    details: NCh1105PeakFlowResult['details'];
}

/**
 * NCh1105:2019 – Calculo de caudal ponderado por UEH
 * Calcula P_edge = (UEH_upstream / UEH_total) * P_total
 * Luego aplica la seleccion normativa BSCE/INTERPOLACION/HARMON
 */
export function calculateWeightedPopulationFlow(config: WeightedPopulationConfig): WeightedPopulationResult {
    const warnings: string[] = [];
    const { P_total, D, R, C, UEH_total, UEH_upstream } = config;

    if (P_total <= 0) {
        return {
            P_edge: 0,
            equivalentHouses: 0,
            Qmd_Lps: 0,
            M_harmon: undefined,
            Qmax_Lps: 0,
            method: 'HARMON',
            warnings: ['P_total debe ser mayor a 0'],
            details: {
                D,
                R,
                C,
                norma: 'NCh1105:2019'
            }
        };
    }

    if (UEH_total <= 0) {
        return {
            P_edge: 0,
            equivalentHouses: 0,
            Qmd_Lps: 0,
            M_harmon: undefined,
            Qmax_Lps: 0,
            method: 'HARMON',
            warnings: ['UEH_total debe ser mayor a 0'],
            details: {
                D,
                R,
                C,
                norma: 'NCh1105:2019'
            }
        };
    }

    if (UEH_upstream <= 0) {
        return {
            P_edge: 0,
            equivalentHouses: 0,
            Qmd_Lps: 0,
            M_harmon: undefined,
            Qmax_Lps: 0,
            method: 'HARMON',
            warnings: ['UEH_upstream debe ser mayor a 0'],
            details: {
                D,
                R,
                C,
                norma: 'NCh1105:2019'
            }
        };
    }

    const w_i = UEH_upstream / UEH_total;
    const P_edge = w_i * P_total;

    const result = calculatePeakFlow_NCh1105(
        P_edge,
        D,
        R,
        C,
        config.peakMode || 'AUTO',
        config.habPorCasa ?? null
    );

    const equivalentHouses = result.method === 'BSCE'
        ? (result.equivalentHouses ?? 0)
        : 0;

    const norma = result.method === 'BSCE'
        ? 'NCh1105:2019 – Anexo A (BSCE)'
        : result.method === 'INTERPOLACION'
            ? 'NCh1105:2019 – Interpolación (100-1000 hab)'
            : 'NCh1105:2019 – Harmon (P>1000)';

    return {
        P_edge,
        equivalentHouses,
        habPorCasaUsado: result.habPorCasaUsado,
        Qmd_Lps: result.Qmd,
        M_harmon: result.M,
        Qmax_Lps: result.Qmax,
        method: result.method,
        norma,
        warnings: [...warnings, ...result.warnings],
        details: result.details
    };
}

export function getDesignFlow(edge: Pipe, projectSettings?: ProjectSettings, weightedConfig?: WeightedPopulationConfig): DesignFlowResult {
    const isPublico = projectSettings?.projectType === 'Público';
    const eff = getEffectivePipe(edge);
    const isCollector = eff.role === 'COLECTOR';
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!isCollector) {
        const qww = Number(edge.qwwTransportado?.value || 0);
        const qContinuous = Number(edge.qContinuous?.value || 0);
        const Q_used = qContinuous > 0 ? qContinuous : qww;

        return {
            Q_used_Lps: Q_used,
            method: 'UEH_Qww',
            flowMethodNCh1105: null,
            details: {
                Qww_Lps: qww,
                warnings: Q_used === 0 ? ['Sin caudal disponible'] : []
            }
        };
    }

    let sizingMode = edge.designOptions?.collectorSizingMode || 'UEH_Qww';
    if (isPublico) {
        sizingMode = 'POBLACION_NCH1105';
    }

    if (sizingMode === 'UEH_Qww') {
        const qww = Number(edge.qwwTransportado?.value || 0);
        const qContinuous = Number(edge.qContinuous?.value || 0);
        const Q_used = qContinuous > 0 ? qContinuous : qww;

        if (Q_used === 0) {
            warnings.push('Sin caudal acumulado desde UEH/artefactos');
        }

        return {
            Q_used_Lps: Q_used,
            method: 'UEH_Qww',
            flowMethodNCh1105: Q_used > 0 ? 'CAUDAL_DIRECTO' : null,
            details: {
                Qww_Lps: qww,
                warnings
            }
        };
    }

    if (sizingMode === 'POBLACION_PONDERADA_UEH') {
        if (!weightedConfig) {
            errors.push('POBLACION_PONDERADA_UEH requiere configuracion de ponderacion (P_total, D, R, C, UEH)');
            const qww = Number(edge.qwwTransportado?.value || 0);
            const qContinuous = Number(edge.qContinuous?.value || 0);
            const Q_fallback = qContinuous > 0 ? qContinuous : qww;

            return {
                Q_used_Lps: Q_fallback,
                method: 'POBLACION_PONDERADA_UEH',
                flowMethodNCh1105: null,
                details: {
                    Qww_Lps: qww,
                    warnings,
                    errors
                }
            };
        }

        const result = calculateWeightedPopulationFlow({
            ...weightedConfig,
            peakMode: isPublico ? 'STRICT' : (projectSettings?.nch1105?.peakMode || 'AUTO'),
            habPorCasa: projectSettings?.nch1105?.habPorCasa ?? null
        });

        return {
            Q_used_Lps: result.Qmax_Lps,
            method: 'POBLACION_PONDERADA_UEH',
            flowMethodNCh1105: result.method,
            details: {
                P: weightedConfig.P_total,
                P_edge: result.P_edge,
                equivalentHouses: result.equivalentHouses,
                habPorCasaUsado: result.habPorCasaUsado,
                D: weightedConfig.D,
                R: weightedConfig.R,
                C: weightedConfig.C,
                Qmd_Lps: result.Qmd_Lps,
                M_harmon: result.M_harmon,
                Qmax_Lps: result.Qmax_Lps,
                UEH_total: weightedConfig.UEH_total,
                UEH_upstream: weightedConfig.UEH_upstream,
                norma: result.norma,
                warnings: [...warnings, ...result.warnings],
                errors
            }
        };
    }

    const popParams = edge.designOptions?.population;

    if (!popParams || popParams.P <= 0) {
        warnings.push('Modo POBLACIÓN seleccionado pero sin parámetros de población válidos');
        const qww = Number(edge.qwwTransportado?.value || 0);
        const qContinuous = Number(edge.qContinuous?.value || 0);
        const Q_fallback = qContinuous > 0 ? qContinuous : qww;

        return {
            Q_used_Lps: Q_fallback,
            method: 'UEH_Qww',
            flowMethodNCh1105: null,
            details: {
                Qww_Lps: qww,
                warnings
            }
        };
    }

    let peakMode = edge.designOptions?.population?.peakMode || 'AUTO';
    if (isPublico) {
        peakMode = 'STRICT';
    }
    const habPorCasa = edge.designOptions?.population?.habPorCasa ?? projectSettings?.nch1105?.habPorCasa ?? null;
    const result = calculatePeakFlow_NCh1105(popParams.P, popParams.D, popParams.R, popParams.C, peakMode, habPorCasa);

    return {
        Q_used_Lps: result.Qmax,
        method: 'POBLACION_NCH1105',
        flowMethodNCh1105: result.method,
        details: {
            P: popParams.P,
            P_edge: result.P_edge,
            equivalentHouses: result.equivalentHouses,
            habPorCasaUsado: result.habPorCasaUsado,
            D: popParams.D,
            R: popParams.R,
            C: popParams.C,
            Qmd_Lps: result.Qmd,
            M_harmon: result.M,
            Qmax_Lps: result.Qmax,
            warnings: [...warnings, ...result.warnings]
        }
    };
}

export function getDefaultPopulationParams(): PopulationParams {
    return {
        P: 1000,
        D: 150,
        R: 0.8,
        C: 1.0
    };
}

export function validatePopulationParams(params: Partial<PopulationParams>): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
} {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (params.P !== undefined && params.P <= 0) {
        errors.push('Población (P) debe ser mayor a 0');
    }

    if (params.D !== undefined && params.D <= 0) {
        errors.push('Dotacion (D) debe ser mayor a 0');
    }

    if (params.R !== undefined) {
        if (params.R <= 0) {
            errors.push('Coeficiente de recuperacion (R) debe ser mayor a 0');
        } else if (params.R > 1) {
            warnings.push(`R=${params.R} > 1.0 es inusual`);
        }
    }

    if (params.C !== undefined && params.C < 1) {
        warnings.push(`C=${params.C} < 1.0 es inusual`);
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
}
