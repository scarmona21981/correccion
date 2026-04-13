import { useMemo, useState, useEffect } from 'react';
import { evaluateBatchCapacity, type InverseResult, type InverseMode } from '../../hydraulics/inverseCapacityEngine';
import type { Pipe, ProjectSettings } from '../../context/ProjectContext';

export interface UseInverseCapacityOptions {
    pipes: Pipe[];
    settings: ProjectSettings;
    mode: InverseMode;
    selectedPipeId?: string | null;
    enabled?: boolean;
}

export interface UseInverseCapacityResult {
    results: Record<string, InverseResult>;
    isRunning: boolean;
    progress: { done: number; total: number } | null;
    error: Error | null;
    hasResults: boolean;
    lastCacheKey: string;
}

function computeCacheKey(pipes: Pipe[], settings: ProjectSettings, mode: InverseMode, selectedPipeId: string | null | undefined): string {
    const pipeIds = pipes.map(p => p.id).sort().join(',');
    const settingsKey = `${settings.projectType}-${settings.populationTotal}-${settings.D_L_per_hab_day}-${settings.R_recovery}`;
    return `${pipeIds}|${settingsKey}|${mode}|${selectedPipeId || 'none'}`;
}

export function useInverseCapacity({
    pipes,
    settings,
    mode,
    selectedPipeId,
    enabled = true
}: UseInverseCapacityOptions): UseInverseCapacityResult {
    const [results, setResults] = useState<Record<string, InverseResult>>({});
    const [isRunning, setIsRunning] = useState(false);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [lastCacheKey, setLastCacheKey] = useState('');

    const cacheKey = useMemo(() => computeCacheKey(pipes, settings, mode, selectedPipeId), [pipes, settings, mode, selectedPipeId]);

    useEffect(() => {
        if (!enabled || pipes.length === 0) {
            setResults({});
            return;
        }

        if (cacheKey === lastCacheKey && Object.keys(results).length > 0) {
            return;
        }

        let mounted = true;

        const runAnalysis = async () => {
            setIsRunning(true);
            setProgress({ done: 0, total: pipes.length });

            await new Promise<void>(resolve => {
                setTimeout(() => {
                    if (!mounted) {
                        resolve();
                        return;
                    }

                    const res = evaluateBatchCapacity(
                        pipes,
                        settings,
                        (done, total) => {
                            if (mounted) {
                                setProgress({ done, total });
                            }
                        }
                    );

                    if (mounted) {
                        setResults(res);
                        setLastCacheKey(cacheKey);
                    }

                    setIsRunning(false);
                    setProgress(null);
                    resolve();
                }, 0);
            });
        };

        runAnalysis();

        return () => {
            mounted = false;
        };
    }, [cacheKey, lastCacheKey, pipes, settings, enabled]);

    const hasResults = Object.keys(results).length > 0;

    return {
        results,
        isRunning,
        progress,
        error: null,
        hasResults,
        lastCacheKey
    };
}

export default useInverseCapacity;