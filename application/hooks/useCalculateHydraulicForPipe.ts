import { useMemo } from 'react';
import { calculateHydraulicForPipe, type HydraulicCalculationOutput } from '../../hydraulics/hydraulicCalculationEngine';
import type { CollectorSizingMode } from '../../utils/designFlowCalculator';

export interface UseCalculateHydraulicForPipeOptions {
    pipe: {
        userDefinedId?: string | null;
        id: string;
        startNodeId?: string | null;
        endNodeId?: string | null;
        length?: { value?: number } | number;
        diameter?: { value?: number } | number;
        isSlopeManual?: boolean;
        manualSlope?: { value?: number };
        slope?: { value?: number } | number;
        material?: { value?: string } | string;
        [key: string]: unknown;
    };
    settings: { populationTotal?: number; collectorSizingMode?: CollectorSizingMode };
    enabled?: boolean;
}

export interface UseCalculateHydraulicForPipeResult {
    calculation: HydraulicCalculationOutput | null;
    isLoading: boolean;
    error: Error | null;
    hasResult: boolean;
}

export function useCalculateHydraulicForPipe({
    pipe,
    settings,
    enabled = true
}: UseCalculateHydraulicForPipeOptions): UseCalculateHydraulicForPipeResult {
    const calculation = useMemo(() => {
        if (!enabled) return null;
        if (!pipe) return null;

        try {
            return calculateHydraulicForPipe(pipe as any, settings);
        } catch (err) {
            console.error('Error en calculateHydraulicForPipe:', err);
            return null;
        }
    }, [pipe, settings, enabled]);

    return {
        calculation,
        isLoading: false,
        error: null,
        hasResult: calculation !== null
    };
}

export default useCalculateHydraulicForPipe;