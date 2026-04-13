import { useMemo } from 'react';
import { runSMCAL_GRAV, type SMCAL_GRAV_Results } from '../../hydraulics/nch1105Engine';
import type { Chamber, Pipe, ProjectSettings } from '../../context/ProjectContext';

export interface UseGravitySimulationOptions {
    chambers: Chamber[];
    pipes: Pipe[];
    settings: ProjectSettings;
    enabled?: boolean;
}

export interface UseGravitySimulationResult {
    results: SMCAL_GRAV_Results | null;
    isLoading: boolean;
    error: Error | null;
    hasResults: boolean;
}

export function useGravitySimulation({
    chambers,
    pipes,
    settings,
    enabled = true
}: UseGravitySimulationOptions): UseGravitySimulationResult {
    const results = useMemo(() => {
        if (!enabled) return null;
        if (!chambers || chambers.length === 0) return null;
        if (!pipes || pipes.length === 0) return null;
        
        try {
            return runSMCAL_GRAV(chambers, pipes, settings);
        } catch (err) {
            console.error('Error en simulación gravedad:', err);
            return null;
        }
    }, [chambers, pipes, settings, enabled]);

    return {
        results,
        isLoading: false,
        error: null,
        hasResults: results !== null
    };
}

export function useGravityResults(options: UseGravitySimulationOptions) {
    const { results } = useGravitySimulation(options);
    return results;
}

export function useHydraulicTable(options: UseGravitySimulationOptions) {
    const { results } = useGravitySimulation(options);
    return results?.tabla16Calculo ?? null;
}

export function useVerificationResults(options: UseGravitySimulationOptions) {
    const { results } = useGravitySimulation(options);
    return results?.tabla16Verificacion ?? null;
}

export default useGravitySimulation;