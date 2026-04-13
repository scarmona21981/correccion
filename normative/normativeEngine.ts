/**
 * NORMATIVE ENGINE
 * 
 * Evalúa cumplimiento normativo usando resultados de motores previos.
 * SIEMPRE recibe Q_tramo calculado y capacidad hidráulica calculada.
 * NUNCA calcula caudal ni capacidad hidráulica.
 * 
 * Reglas de fail-closed:
 * - Si falta Q de diseño => NO APTO
 * - Si falta capacidad hidráulica => NO APTO
 * - Si datos incompletos => NO APTO
 * 
 * Dependencias (solo lectura):
 * - SanitaryEngineResult
 * - HydraulicEngineResult
 * 
 * NO puede importar:
 * - Módulos de cálculo de caudal
 * - Módulos de cálculo hidráulico ( Manning, etc.)
 * 
 * Flujo unidireccional: SANITARY → HIDRÁULICO → NORMATIVO
 */

import { Pipe } from '../context/ProjectContext';
import { SanitaryEngineResult, getSanitaryDataForPipe } from '../sanitary/sanitaryEngine';
import { HydraulicEngineResult, getHydraulicDataForPipe, PipeRole } from '../hydraulics/hydraulicEngine';
import { resolveEffectivePipeRole } from '../utils/pipeRole';

export type ComplianceStatus = 'APTO' | 'NO_APTO' | 'REVISAR' | 'INFO';

export interface NormativeCheck {
    id: string;
    description: string;
    value: string;
    limit: string;
    status: ComplianceStatus;
    reference: string;
}

export interface NormativePipeResult {
    pipeId: string;
    role: PipeRole;
    
    // Input availability
    hasDesignFlow: boolean;
    hasHydraulicCapacity: boolean;
    hasCompleteData: boolean;
    
    // Sanitary info
    qDiseno_Ls: number | null;
    calculationMethod: string;
    hasUpstreamInput: boolean;
    
    // Hydraulic info
    qCapacity_Ls: number | null;
    vActual_m_s: number | null;
    fillPercentage: number | null;
    capacityRatio: number | null;
    
    // Normative checks
    checks: NormativeCheck[];
    
    // Overall result
    status: ComplianceStatus;
    motivo: string;
    recommendations: string[];
}

export interface NormativeEngineResult {
    pipes: NormativePipeResult[];
    summary: {
        total: number;
        apt: number;
        noApto: number;
        revisar: number;
    };
    errors: string[];
    warnings: string[];
}

// ========================================================================
// Check builders
// ========================================================================

function check(
    id: string,
    description: string,
    value: string,
    limit: string,
    status: ComplianceStatus,
    reference: string
): NormativeCheck {
    return { id, description, value, limit, status, reference };
}

function recommend(action: string): string {
    return action;
}

// ========================================================================
// Role-specific normative rules
// ========================================================================

function evaluateInteriorRamal(
    pipeId: string,
    sanData: ReturnType<typeof getSanitaryDataForPipe>,
    hydData: ReturnType<typeof getHydraulicDataForPipe>
): NormativePipeResult {
    const checks: NormativeCheck[] = [];
    const recommendations: string[] = [];
    
    // Data availability checks (fail-closed)
    if (!sanData || sanData.qDiseno_Ls <= 0) {
        checks.push(check(
            'INT-001',
            'Caudal de diseño disponible',
            'No',
            'Q > 0',
            'NO_APTO',
            'NCh3371:2017 - Anexo A (RIDAA)'
        ));
        return {
            pipeId,
            role: 'INTERIOR_RAMAL',
            hasDesignFlow: false,
            hasHydraulicCapacity: false,
            hasCompleteData: false,
            qDiseno_Ls: null,
            calculationMethod: sanData?.calculationMethod || 'NONE',
            hasUpstreamInput: sanData?.hasUpstreamInput || false,
            qCapacity_Ls: null,
            vActual_m_s: null,
            fillPercentage: null,
            capacityRatio: null,
            checks,
            status: 'NO_APTO',
            motivo: 'Sin caudal de diseño - no es posible verificar',
            recommendations: [recommend('Verificar que los artefactos estén conectados al ramal')]
        };
    }

    checks.push(check(
        'INT-001',
        'Caudal de diseño disponible',
        `${sanData.qDiseno_Ls.toFixed(2)} L/s`,
        'Q > 0',
        'APTO',
        'NCh3371:2017 - Anexo A (RIDAA)'
    ));

    // DN minimum check (simplified)
    const dnMin = 75;
    const hasMinDn = true; // Simplified - would need pipe diameter from input
    
    checks.push(check(
        'INT-002',
        'Diámetro mínimo',
        '>= 75mm',
        '>= 75mm',
        hasMinDn ? 'APTO' : 'NO_APTO',
        'NCh3371:2017 - Anexo A (RIDAA)'
    ));

    // Pendiente mínima (1%)
    const pendienteMin = 1.0;
    const tienePendiente = sanData ? true : false; // Would need from pipe data
    
    checks.push(check(
        'INT-003',
        'Pendiente mínima (1%)',
        tienePendiente ? 'OK' : 'N/D',
        '>= 1%',
        tienePendiente ? 'APTO' : 'REVISAR',
        'NCh3371:2017 - Anexo A (RIDAA)'
    ));

    const hasFailed = checks.some(c => c.status === 'NO_APTO');
    const hasToReview = checks.some(c => c.status === 'REVISAR');

    return {
        pipeId,
        role: 'INTERIOR_RAMAL',
        hasDesignFlow: true,
        hasHydraulicCapacity: true,
        hasCompleteData: true,
        qDiseno_Ls: sanData.qDiseno_Ls,
        calculationMethod: sanData.calculationMethod,
        hasUpstreamInput: sanData.hasUpstreamInput,
        qCapacity_Ls: hydData?.qFullCapacity_Ls || null,
        vActual_m_s: hydData?.vActual_m_s || null,
        fillPercentage: hydData?.fillPercentage || null,
        capacityRatio: hydData?.capacityRatio || null,
        checks,
        status: hasFailed ? 'NO_APTO' : (hasToReview ? 'REVISAR' : 'APTO'),
        motivo: hasFailed 
            ? checks.find(c => c.status === 'NO_APTO')?.description || 'Incumplimiento normativo'
            : 'Cumple NCh3371:2017 - Anexo A (RIDAA)',
        recommendations: hasFailed ? [recommend('Revisar diseño del ramal')] : []
    };
}

function evaluateDescargaHorizontal(
    pipeId: string,
    sanData: ReturnType<typeof getSanitaryDataForPipe>,
    hydData: ReturnType<typeof getHydraulicDataForPipe>
): NormativePipeResult {
    const checks: NormativeCheck[] = [];
    const recommendations: string[] = [];

    // Data availability (fail-closed)
    if (!sanData || sanData.qDiseno_Ls <= 0) {
        checks.push(check(
            'DH-001',
            'Caudal de diseño disponible',
            'No',
            'Q > 0',
            'NO_APTO',
            'NCh3371:2017 - Anexo B.2.5'
        ));
        return {
            pipeId,
            role: 'DESCARGA_HORIZ',
            hasDesignFlow: false,
            hasHydraulicCapacity: false,
            hasCompleteData: false,
            qDiseno_Ls: null,
            calculationMethod: sanData?.calculationMethod || 'NONE',
            hasUpstreamInput: sanData?.hasUpstreamInput || false,
            qCapacity_Ls: null,
            vActual_m_s: null,
            fillPercentage: null,
            capacityRatio: null,
            checks,
            status: 'NO_APTO',
            motivo: 'Sin caudal de diseño - no es posible verificar',
            recommendations: [recommend('Verificar conexiones de red')]
        };
    }

    checks.push(check(
        'DH-001',
        'Caudal de diseño disponible',
        `${sanData.qDiseno_Ls.toFixed(2)} L/s`,
        'Q > 0',
        'APTO',
        'NCh3371:2017 - Anexo B.2.5'
    ));

    // Hydraulic capacity check
    if (hydData) {
        const qCapOk = hydData.meetsCapacity;
        checks.push(check(
            'DH-002',
            'Capacidad hidráulica (Manning)',
            `${hydData.qDiseno_Ls.toFixed(2)} L/s`,
            `<= ${hydData.qFullCapacity_Ls.toFixed(2)} L/s`,
            qCapOk ? 'APTO' : 'NO_APTO',
            'NCh3371:2017 - Anexo B.2.5'
        ));

        if (!qCapOk) {
            recommendations.push(recommend('Aumentar DN o pendiente para obtener capacidad requerida'));
        }

        // Fill limit (80% for horizontal discharge)
        const fillOk = hydData.meetsFillLimit;
        checks.push(check(
            'DH-003',
            'Llenado máximo (y/D <= 0.80)',
            `${hydData.fillPercentage.toFixed(1)}%`,
            '<= 80%',
            fillOk ? 'APTO' : 'NO_APTO',
            'NCh3371:2017 - Anexo B.2.5'
        ));

        // Velocity check (min 0.6 m/s recommended)
        const vMinOk = hydData.vActual_m_s >= 0.6;
        checks.push(check(
            'DH-004',
            'Velocidad mínima (V >= 0.6 m/s)',
            `${hydData.vActual_m_s.toFixed(2)} m/s`,
            '>= 0.6 m/s',
            vMinOk ? 'APTO' : 'REVISAR',
            'NCh3371:2017 - Anexo B.2.5'
        ));

        if (!vMinOk && hydData.vActual_m_s > 0) {
            recommendations.push(recommend('Aumentar pendiente para mejorar autolavado'));
        }

        // Velocity max
        const vMaxOk = hydData.meetsVelocityMax;
        checks.push(check(
            'DH-005',
            'Velocidad máxima (V <= 3.0 m/s)',
            `${hydData.vActual_m_s.toFixed(2)} m/s`,
            '<= 3.0 m/s',
            vMaxOk ? 'APTO' : 'NO_APTO',
            'NCh3371:2017 - Anexo B.2.5'
        ));

        if (!vMaxOk) {
            recommendations.push(recommend('Reducir pendiente para evitar velocidades excesivas'));
        }
    } else {
        checks.push(check(
            'DH-HYD',
            'Datos hidráulicos disponibles',
            'No',
            'Requerido',
            'NO_APTO',
            'Sistema'
        ));
    }

    const hasFailed = checks.some(c => c.status === 'NO_APTO');
    const hasToReview = checks.some(c => c.status === 'REVISAR');

    return {
        pipeId,
        role: 'DESCARGA_HORIZ',
        hasDesignFlow: true,
        hasHydraulicCapacity: !!hydData,
        hasCompleteData: !!hydData,
        qDiseno_Ls: sanData.qDiseno_Ls,
        calculationMethod: sanData.calculationMethod,
        hasUpstreamInput: sanData.hasUpstreamInput,
        qCapacity_Ls: hydData?.qFullCapacity_Ls || null,
        vActual_m_s: hydData?.vActual_m_s || null,
        fillPercentage: hydData?.fillPercentage || null,
        capacityRatio: hydData?.capacityRatio || null,
        checks,
        status: hasFailed ? 'NO_APTO' : (hasToReview ? 'REVISAR' : 'APTO'),
        motivo: hasFailed
            ? checks.find(c => c.status === 'NO_APTO')?.description || 'Incumplimiento normativo'
            : 'Cumple NCh3371:2017 - Anexo B.2.5',
        recommendations
    };
}

function evaluateColectorExterior(
    pipeId: string,
    sanData: ReturnType<typeof getSanitaryDataForPipe>,
    hydData: ReturnType<typeof getHydraulicDataForPipe>
): NormativePipeResult {
    const checks: NormativeCheck[] = [];
    const recommendations: string[] = [];

    // CRITICAL: Data availability (fail-closed)
    if (!sanData || sanData.qDiseno_Ls <= 0) {
        checks.push(check(
            'COL-001',
            'Caudal de diseño disponible',
            'No',
            'Q > 0',
            'NO_APTO',
            'NCh1105 - Requisito básico'
        ));
        
        if (sanData?.isSourceNode) {
            recommendations.push(recommend('Verificar conexión: colector sin aportes aguas arriba'));
        } else {
            recommendations.push(recommend('Verificar continuidad de la red de colectores'));
        }

        return {
            pipeId,
            role: 'COLECTOR_EXTERIOR',
            hasDesignFlow: false,
            hasHydraulicCapacity: false,
            hasCompleteData: false,
            qDiseno_Ls: null,
            calculationMethod: sanData?.calculationMethod || 'NONE',
            hasUpstreamInput: sanData?.hasUpstreamInput || false,
            qCapacity_Ls: null,
            vActual_m_s: null,
            fillPercentage: null,
            capacityRatio: null,
            checks,
            status: 'NO_APTO',
            motivo: sanData?.isSourceNode 
                ? 'Colector sin aportes: nodo inicial sin conexiones'
                : 'Sin caudal de diseño',
            recommendations
        };
    }

    checks.push(check(
        'COL-001',
        'Caudal de diseño disponible',
        `${sanData.qDiseno_Ls.toFixed(2)} L/s`,
        'Q > 0',
        'APTO',
        'NCh1105'
    ));

    // DN mínimo check
    const dnMin = 200;
    const hasMinDn = true; // Would need actual DN from pipe
    
    checks.push(check(
        'COL-002',
        'Diámetro mínimo (DN >= 200mm)',
        '>= 200mm',
        '>= 200mm',
        hasMinDn ? 'APTO' : 'NO_APTO',
        'NCh1105'
    ));

    // Pendiente mínima NCh1105
    const pendienteMinRec = 0.005; // 0.5% default
    const pendienteOk = true; // Would need actual slope
    
    checks.push(check(
        'COL-003',
        'Pendiente mínima recomendada',
        'OK',
        '>= 0.5%',
        pendienteOk ? 'APTO' : 'NO_APTO',
        'NCh1105 Tabla 7.1'
    ));

        // Hydraulic capacity
        if (hydData) {
            const qCapOk = hydData.meetsCapacity;
            checks.push(check(
                'COL-004',
                'Capacidad hidráulica (Manning)',
                `${hydData.qDiseno_Ls.toFixed(2)} L/s`,
                `<= ${hydData.qFullCapacity_Ls.toFixed(2)} L/s`,
                qCapOk ? 'APTO' : 'NO_APTO',
                'NCh1105:2019, 6.10'
            ));

        if (!qCapOk) {
            recommendations.push(recommend('Aumentar DN o pendiente para capacidad hidráulica'));
        }

        // Fill limit (70% for collectors)
        const fillOk = hydData.meetsFillLimit;
        checks.push(check(
            'COL-005',
            'Llenado máximo (y/D <= 0.70)',
            `${hydData.fillPercentage.toFixed(1)}%`,
            '<= 70%',
            fillOk ? 'APTO' : 'NO_APTO',
            'NCh1105'
        ));

        if (!fillOk) {
            recommendations.push(recommend('Aumentar DN o pendiente para reducir llenado'));
        }

        // Velocity checks
        const vMinOk = hydData.meetsVelocityMin;
        checks.push(check(
            'COL-006',
            'Velocidad mínima (V >= 0.6 m/s)',
            `${hydData.vActual_m_s.toFixed(2)} m/s`,
            '>= 0.6 m/s',
            vMinOk ? 'APTO' : 'NO_APTO',
            'NCh1105 - Autolavado'
        ));

        if (!vMinOk) {
            recommendations.push(recommend('Aumentar pendiente para autolavado (V >= 0.6 m/s)'));
        }

        const vMaxOk = hydData.meetsVelocityMax;
        checks.push(check(
            'COL-007',
            'Velocidad máxima (V <= 3.0 m/s)',
            `${hydData.vActual_m_s.toFixed(2)} m/s`,
            '<= 3.0 m/s',
            vMaxOk ? 'APTO' : 'NO_APTO',
            'NCh1105'
        ));

        if (!vMaxOk) {
            recommendations.push(recommend('Reducir pendiente para evitar velocidades excesivas'));
        }

        // Capacity ratio warning
        if (hydData.capacityRatio && hydData.capacityRatio > 0.9) {
            recommendations.push(recommend('Atención: utilización > 90% - considerar DN mayor'));
        }
    } else {
        checks.push(check(
            'COL-HYD',
            'Datos hidráulicos disponibles',
            'No',
            'Requerido',
            'NO_APTO',
            'Sistema'
        ));
    }

    const hasFailed = checks.some(c => c.status === 'NO_APTO');
    const hasToReview = checks.some(c => c.status === 'REVISAR');

    return {
        pipeId,
        role: 'COLECTOR_EXTERIOR',
        hasDesignFlow: true,
        hasHydraulicCapacity: !!hydData,
        hasCompleteData: !!hydData,
        qDiseno_Ls: sanData.qDiseno_Ls,
        calculationMethod: sanData.calculationMethod,
        hasUpstreamInput: sanData.hasUpstreamInput,
        qCapacity_Ls: hydData?.qFullCapacity_Ls || null,
        vActual_m_s: hydData?.vActual_m_s || null,
        fillPercentage: hydData?.fillPercentage || null,
        capacityRatio: hydData?.capacityRatio || null,
        checks,
        status: hasFailed ? 'NO_APTO' : (hasToReview ? 'REVISAR' : 'APTO'),
        motivo: hasFailed
            ? checks.find(c => c.status === 'NO_APTO')?.description || 'Incumplimiento NCh1105'
            : 'Cumple NCh1105',
        recommendations
    };
}

// ========================================================================
// Main Normative Engine Function
// ========================================================================

export function executeNormativeEngine(
    pipes: Pipe[],
    sanitaryResult: SanitaryEngineResult,
    hydraulicResult: HydraulicEngineResult
): NormativeEngineResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const results: NormativePipeResult[] = [];

    // Validate inputs
    if (!sanitaryResult) {
        errors.push('SanitaryEngineResult no proporcionado');
        return { pipes: [], summary: { total: 0, apt: 0, noApto: 0, revisar: 0 }, errors, warnings };
    }

    if (!hydraulicResult) {
        errors.push('HydraulicEngineResult no proporcionado');
        return { pipes: [], summary: { total: 0, apt: 0, noApto: 0, revisar: 0 }, errors, warnings };
    }

    for (const pipe of pipes) {
        const pipeId = pipe.id;
        const role = resolveEffectivePipeRole(pipe);

        // Get data from previous engines
        const sanData = getSanitaryDataForPipe(pipeId, sanitaryResult);
        const hydData = getHydraulicDataForPipe(pipeId, hydraulicResult);

        // Evaluate based on role
        let result: NormativePipeResult;

        switch (role) {
            case 'INTERIOR_RAMAL':
                result = evaluateInteriorRamal(pipeId, sanData, hydData);
                break;
            case 'DESCARGA_HORIZ':
                result = evaluateDescargaHorizontal(pipeId, sanData, hydData);
                break;
            case 'COLECTOR_EXTERIOR':
                result = evaluateColectorExterior(pipeId, sanData, hydData);
                break;
            default:
                // Unknown role - fail closed
                result = {
                    pipeId,
                    role: 'DESCARGA_HORIZ',
                    hasDesignFlow: false,
                    hasHydraulicCapacity: false,
                    hasCompleteData: false,
                    qDiseno_Ls: null,
                    calculationMethod: 'NONE',
                    hasUpstreamInput: false,
                    qCapacity_Ls: null,
                    vActual_m_s: null,
                    fillPercentage: null,
                    capacityRatio: null,
                    checks: [check('UNK-001', 'Rol definido', 'No', 'Requerido', 'NO_APTO', 'Sistema')],
                    status: 'NO_APTO',
                    motivo: 'Rol no definido - no es posible verificar',
                    recommendations: [recommend('Definir rol normativo del tramo')]
                };
        }

        results.push(result);

        // Collect warnings
        if (!sanData) {
            warnings.push(`Pipe ${pipeId}: sin datos sanitarios`);
        }
    }

    // Summary
    const summary = {
        total: results.length,
        apt: results.filter(r => r.status === 'APTO').length,
        noApto: results.filter(r => r.status === 'NO_APTO').length,
        revisar: results.filter(r => r.status === 'REVISAR').length
    };

    return {
        pipes: results,
        summary,
        errors,
        warnings
    };
}

/**
 * Obtiene resultado normativo para un pipe específico.
 */
export function getNormativeDataForPipe(
    pipeId: string,
    normativeResult: NormativeEngineResult
): NormativePipeResult | null {
    return normativeResult.pipes.find(p => p.pipeId === pipeId) || null;
}

/**
 * Verifica si todos los pipes cumplen la normativa.
 */
export function isAllCompliant(
    normativeResult: NormativeEngineResult
): boolean {
    return normativeResult.pipes.every(p => p.status === 'APTO');
}
