import { useMemo } from 'react';
import { runImprovementAnalysis, type ImprovementReport } from '../../hydraulics/improvementEngine';
import type { Pipe, ProjectSettings } from '../../context/ProjectContext';

export interface UseImprovementAnalysisOptions {
    pipe: Pipe;
    settings: ProjectSettings;
    P_base: number;
    P_target: number;
    constraints?: {
        allowDiameterChange?: boolean;
        allowParallel?: boolean;
        allowSlopeChange?: boolean;
        slopeMultipliers?: number[];
    };
    enabled?: boolean;
}

export interface UseImprovementAnalysisResult {
    report: ImprovementReport | null;
    isLoading: boolean;
    error: Error | null;
    hasResult: boolean;
}

export function useImprovementAnalysis({
    pipe,
    settings,
    P_base,
    P_target,
    constraints,
    enabled = true
}: UseImprovementAnalysisOptions): UseImprovementAnalysisResult {
    const report = useMemo(() => {
        if (!enabled) return null;
        if (!pipe) return null;

        const finalConstraints = {
            allowDiameterChange: constraints?.allowDiameterChange ?? true,
            allowParallel: constraints?.allowParallel ?? false,
            allowSlopeChange: constraints?.allowSlopeChange ?? false,
            slopeMultipliers: constraints?.slopeMultipliers ?? [1.1, 1.25, 1.5, 2.0, 3.0]
        };

        try {
            return runImprovementAnalysis({
                pipe,
                settings,
                P_base,
                P_target,
                constraints: finalConstraints
            });
        } catch (err) {
            console.error('Error en runImprovementAnalysis:', err);
            return null;
        }
    }, [pipe, settings, P_base, P_target, constraints, enabled]);

    return {
        report,
        isLoading: false,
        error: null,
        hasResult: report !== null
    };
}

export default useImprovementAnalysis;