import { useMemo } from 'react';
import { executeHydraulicCalculation, type HydraulicCalculationOutput, type TramoInput } from '../../hydraulics/hydraulicCalculationEngine';
import type { RolNormativo } from '../../hydraulics/test';

export interface UseExecuteHydraulicCalculationOptions {
    tramo: TramoInput;
    enabled?: boolean;
}

export interface UseExecuteHydraulicCalculationResult {
    calculation: HydraulicCalculationOutput | null;
    isLoading: boolean;
    error: Error | null;
    hasResult: boolean;
}

export function useExecuteHydraulicCalculation({
    tramo,
    enabled = true
}: UseExecuteHydraulicCalculationOptions): UseExecuteHydraulicCalculationResult {
    const calculation = useMemo(() => {
        if (!enabled) return null;
        if (!tramo) return null;

        try {
            return executeHydraulicCalculation(tramo);
        } catch (err) {
            console.error('Error en executeHydraulicCalculation:', err);
            return null;
        }
    }, [tramo, enabled]);

    return {
        calculation,
        isLoading: false,
        error: null,
        hasResult: calculation !== null
    };
}

export default useExecuteHydraulicCalculation;