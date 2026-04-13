import { useMemo } from 'react';
import { buildVerificationMatrix, type VerificationMatrix } from '../../verification/verificationMatrix';
import type { Chamber, Pipe, ProjectSettings } from '../../context/ProjectContext';

export interface UseNormativeChecksOptions {
    chambers: Chamber[];
    pipes: Pipe[];
    settings: ProjectSettings;
    enabled?: boolean;
}

export interface UseNormativeChecksResult {
    verification: VerificationMatrix | null;
    isLoading: boolean;
    error: Error | null;
    hasResults: boolean;
    summary: {
        total: number;
        passed: number;
        failed: number;
        warnings: number;
    } | null;
}

export function useNormativeChecks({
    chambers,
    pipes,
    settings,
    enabled = true
}: UseNormativeChecksOptions): UseNormativeChecksResult {
    const verification = useMemo(() => {
        if (!enabled) return null;
        if (!chambers || chambers.length === 0) return null;
        if (!pipes || pipes.length === 0) return null;

        try {
            return buildVerificationMatrix(chambers, pipes, settings);
        } catch (err) {
            console.error('Error en verificación normativa:', err);
            return null;
        }
    }, [chambers, pipes, settings, enabled]);

    const summary = useMemo(() => {
        if (!verification) return null;

        const checks = verification.table16_max || [];
        const passed = checks.filter((c: any) => c.status === 'OK').length;
        const failed = checks.filter((c: any) => c.status === 'ERROR').length;
        const warnings = checks.filter((c: any) => c.status === 'WARNING').length;

        return {
            total: checks.length,
            passed,
            failed,
            warnings
        };
    }, [verification]);

    return {
        verification,
        isLoading: false,
        error: null,
        hasResults: verification !== null,
        summary
    };
}

export function useTable16Verification(options: UseNormativeChecksOptions) {
    const { verification } = useNormativeChecks(options);
    return verification?.table16_max ?? null;
}

export function useTable17Verification(options: UseNormativeChecksOptions) {
    const { verification } = useNormativeChecks(options);
    return verification?.table17_min ?? null;
}

export function useSegmentTrace(options: UseNormativeChecksOptions) {
    const { verification } = useNormativeChecks(options);
    return verification?.traceBySegment ?? null;
}

export default useNormativeChecks;