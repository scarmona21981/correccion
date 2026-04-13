import { useMemo } from 'react';
import { runPressureAnalysis } from '../../hydraulics/pressureModule';

export interface UsePressureSimulationOptions {
    wetWell?: any;
    pump?: any;
    pipe?: any;
    method?: 'HAZEN_WILLIAMS' | 'DARCY_WEISBACH';
    destinationNode?: any;
    enabled?: boolean;
}

export interface UsePressureSimulationResult {
    results: any;
    isLoading: boolean;
    error: Error | null;
    hasResults: boolean;
}

export function usePressureSimulation({
    wetWell,
    pump,
    pipe,
    method = 'HAZEN_WILLIAMS',
    destinationNode,
    enabled = true
}: UsePressureSimulationOptions): UsePressureSimulationResult {
    const results = useMemo(() => {
        if (!enabled) return null;
        if (!wetWell || !pump || !pipe) return null;

        try {
            return runPressureAnalysis(
                wetWell,
                pump,
                pipe,
                method,
                destinationNode
            );
        } catch (err) {
            console.error('Error en análisis de presión:', err);
            return null;
        }
    }, [wetWell, pump, pipe, destinationNode, method, enabled]);

    return {
        results,
        isLoading: false,
        error: null,
        hasResults: results !== null
    };
}

export default usePressureSimulation;