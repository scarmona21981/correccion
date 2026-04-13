import { ProjectType } from '../context/ProjectContext';
import { verifyByUEH } from '../hydraulics/uehVerifier';
import { Conduit } from '../hydraulics/types';

export interface DomiciliaryValidationResult {
    isValid: boolean;
    normApplied: 'RIDAA' | 'NCh 3371';
    errors: string[];
    maxUEH: number;
    minSlope: number;
}

/**
 * Validates a domiciliary pipe by wrapping the consolidated verification logic
 */
export const validateDomiciliaryPipe = (
    projectType: ProjectType,
    dn: number,
    slope: number,
    ueh: number
): DomiciliaryValidationResult => {
    // Mock a Conduit object for the verifier
    const conduit: Partial<Conduit> = {
        diameter: dn / 1000,
        slope: slope / 100,
        uehTransported: ueh,
        id: 'temp-validation',
        material: 'PVC',
        length: 1 // Default
    };

    const result = verifyByUEH(conduit as Conduit);

    return {
        isValid: result.compliant,
        normApplied: 'NCh 3371',
        errors: result.violations,
        maxUEH: result.maxAllowedUEH,
        minSlope: result.normativeSlope
    };
};
