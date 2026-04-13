/**
 * Condition Detector
 * Determines when Manning hydraulic verification is REQUIRED
 * 
 * Manning is executed ONLY when the pipe falls outside the normative UEH domain
 * or has special hydraulic conditions that require detailed analysis.
 */

import { Conduit, UEHVerificationResult } from './types';
import { isNormativeDN } from './uehTables';

// ============================================================================
// MANNING REQUIREMENT DETECTION
// ============================================================================

export interface ManningRequirement {
    required: boolean;
    reasons: string[];
}

/**
 * Determine if Manning hydraulic verification is required for a pipe
 * 
 * Manning is REQUIRED when ANY of the following conditions are met:
 * 1. UEH verification is non-compliant (exceeds capacity or violates slope)
 * 2. Pipe DN is non-normative (not in RIDAA tables)
 * 3. Pipe type is not purely domiciliary (e.g., private public-type network, collector)
 * 4. Flow regime is not gravitational (e.g., pumped discharge)
 * 5. Special hydraulic conditions are flagged
 * 6. Pipe has constant flow
 * 7. Pipe is a long segment
 * 
 * @param conduit - Pipe segment to analyze
 * @param uehResult - Result from UEH normative verification
 * @returns Manning requirement with reasons
 */
export function requiresManning(
    conduit: Conduit,
    uehResult: UEHVerificationResult
): ManningRequirement {
    const reasons: string[] = [];
    const dnMm = Math.round(conduit.diameter * 1000);
    const slopePercent = conduit.slope * 100;

    // ========================================================================
    // CONDITION 1: UEH non-compliance
    // ========================================================================

    if (!uehResult.compliant) {
        if (uehResult.violations.some(v => v.includes('superan capacidad'))) {
            reasons.push('UEH transportadas superan capacidad normativa');
        }
        if (uehResult.violations.some(v => v.includes('inferior a mínimo'))) {
            reasons.push('Pendiente inferior a mínimo normativo');
        }
        if (uehResult.violations.some(v => v.includes('no contemplado'))) {
            reasons.push('DN no contemplado en tablas normativas');
        }
    }

    // ========================================================================
    // CONDITION 2: Non-normative diameter
    // ========================================================================

    if (!isNormativeDN(dnMm)) {
        if (!reasons.includes('DN no contemplado en tablas normativas')) {
            reasons.push(`DN ${dnMm}mm fuera del dominio normativo [75, 110, 160]`);
        }
    }

    // ========================================================================
    // CONDITION 3: Non-domiciliary pipe type
    // ========================================================================

    if (conduit.pipeType && conduit.pipeType !== 'Domiciliario Simple') {
        reasons.push(`Tipo de tramo: ${conduit.pipeType} requiere verificación hidráulica`);
    }

    // ========================================================================
    // CONDITION 4: Non-gravitational flow regime
    // ========================================================================

    if (conduit.flowRegime && conduit.flowRegime !== 'Gravitacional') {
        reasons.push(`Régimen de flujo: ${conduit.flowRegime} requiere verificación hidráulica`);
    }

    // ========================================================================
    // CONDITION 5: Constant flow flag
    // ========================================================================

    if (conduit.hasConstantFlow) {
        reasons.push('Tramo con caudal continuo requiere verificación hidráulica');
    }

    // ========================================================================
    // CONDITION 6: Pumped discharge flag
    // ========================================================================

    if (conduit.hasPumpedDischarge) {
        reasons.push('Descarga bombeada requiere verificación hidráulica');
    }

    // ========================================================================
    // CONDITION 7: Long segment flag
    // ========================================================================

    if (conduit.isLongSegment) {
        reasons.push('Tramo largo requiere verificación de autolimpieza');
    }

    // ========================================================================
    // CONDITION 8: Special hydraulic conditions
    // ========================================================================

    if (conduit.hasSpecialCondition) {
        reasons.push('Condición hidráulica especial detectada');
    }

    // ========================================================================
    // CONDITION 9: Very steep or very flat slopes
    // ========================================================================

    // Even if UEH compliant, extremely steep slopes should be checked for velocity
    if (slopePercent > 10) {
        reasons.push(`Pendiente elevada (${slopePercent.toFixed(1)}%) requiere verificación de velocidad máxima`);
    }

    // Very flat slopes near the minimum should also be verified
    if (slopePercent > 0 && slopePercent < 1.0 && isNormativeDN(dnMm)) {
        reasons.push(`Pendiente baja (${slopePercent.toFixed(2)}%) requiere verificación de autolimpieza`);
    }

    // ========================================================================
    // Return result
    // ========================================================================

    return {
        required: reasons.length > 0,
        reasons
    };
}

/**
 * Get a human-readable summary of why Manning is required (or not)
 */
export function getManningRequirementSummary(requirement: ManningRequirement): string {
    if (!requirement.required) {
        return 'No se requiere verificación hidráulica Manning (cumple totalmente criterio normativo UEH)';
    }

    return `Verificación hidráulica Manning REQUERIDA:\n${requirement.reasons.map(r => `  • ${r}`).join('\n')}`;
}

/**
 * Check if Manning requirement is due to geometric/normative issues vs special conditions
 */
export function isManningRequiredByGeometry(requirement: ManningRequirement): boolean {
    const geometricKeywords = [
        'DN',
        'Pendiente',
        'UEH transportadas superan',
        'inferior a mínimo'
    ];

    return requirement.reasons.some(reason =>
        geometricKeywords.some(keyword => reason.includes(keyword))
    );
}

/**
 * Check if Manning requirement is due to special operational conditions
 */
export function isManningRequiredBySpecialConditions(requirement: ManningRequirement): boolean {
    const specialKeywords = [
        'caudal continuo',
        'bombeada',
        'Tramo largo',
        'especial',
        'Tipo de tramo',
        'Régimen'
    ];

    return requirement.reasons.some(reason =>
        specialKeywords.some(keyword => reason.includes(keyword))
    );
}
