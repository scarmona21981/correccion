import { NCh1105Settings } from '../../context/ProjectContext';
import { harmonCoefficient } from '../../utils/designFlowCalculator';
import { Q_BSCE_20, resolveHabPorCasaFactor, resolveNCh1105BSCEInput } from '../../hydraulics/nch1105BSCEHelper';

export type NCh1105PeakMethod = 'HARMON' | 'BSCE' | 'INTERPOLACION';

export interface NCh1105PeakResult {
    method: NCh1105PeakMethod;
    Qmaxh: number;
    M?: number;
    Ncasas?: number;
    habPorCasaUsado?: number;
    note: string;
    reason: 'AUTO' | 'FORZADO_HARMON' | 'ESTRICTO';
    blocked?: boolean;
    missingHabPorCasa?: boolean;
}

interface ComputeNCh1105PeakParams {
    P_edge: number;
    QmdAS: number;
    settings: NCh1105Settings;
}

function sanitizePositive(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
}

export function computeNCh1105Peak({
    P_edge,
    QmdAS,
    settings
}: ComputeNCh1105PeakParams): NCh1105PeakResult {
    const pEdgeSafe = Number.isFinite(P_edge) ? Math.max(0, P_edge) : 0;
    const qmdSafe = Number.isFinite(QmdAS) ? Math.max(0, QmdAS) : 0;

    const peakMode = settings?.peakMode || 'AUTO';
    const habPorCasa = sanitizePositive(settings?.habPorCasa);
    const missingHabPorCasa = habPorCasa === null;
    const habPorCasaUsado = resolveHabPorCasaFactor(habPorCasa);

    const harmon = (
        reason: NCh1105PeakResult['reason'],
        noteOverride?: string,
        extra?: Pick<NCh1105PeakResult, 'blocked' | 'missingHabPorCasa' | 'habPorCasaUsado'>
    ): NCh1105PeakResult => {
        const M = harmonCoefficient(pEdgeSafe);
        return {
            method: 'HARMON',
            M,
            Qmaxh: M * qmdSafe,
            note: noteOverride || (pEdgeSafe < 100
                ? 'Harmon aplicado como criterio conservador (UEH-only).'
                : 'Harmon oficial NCh1105.'),
            reason,
            ...extra
        };
    };

    const strictLogic = (reason: NCh1105PeakResult['reason']): NCh1105PeakResult => {
        if (pEdgeSafe < 100) {
            const bsce = resolveNCh1105BSCEInput(pEdgeSafe, { nch1105: { habPorCasa } });
            return {
                method: 'BSCE',
                Ncasas: bsce.equivalentHouses,
                habPorCasaUsado: bsce.habPorCasaUsado,
                Qmaxh: bsce.qmaxBsce,
                note: missingHabPorCasa
                    ? 'BSCE aplicado con fallback hab/casa=5 (sin configuración explícita).'
                    : `BSCE aplicado segun NCh1105 (<100 hab) con hab/casa=${bsce.habPorCasaUsado}.`,
                reason,
                missingHabPorCasa
            };
        }

        if (pEdgeSafe > 1000) {
            return harmon(reason);
        }

        const q20 = Q_BSCE_20;
        const qmd1000 = pEdgeSafe > 0 ? qmdSafe * (1000 / pEdgeSafe) : 0;
        const q1000 = harmonCoefficient(1000) * qmd1000;
        const factor = (pEdgeSafe - 100) / 900;
        const Qmaxh = q20 + factor * (q1000 - q20);

        return {
            method: 'INTERPOLACION',
            Qmaxh,
            note: 'Interpolacion NCh1105 (100-1000 hab).',
            reason,
            habPorCasaUsado
        };
    };

    if (peakMode === 'FORCE_HARMON') return harmon('FORZADO_HARMON');
    if (peakMode === 'STRICT') return strictLogic('ESTRICTO');

    if (peakMode === 'AUTO') {
        return strictLogic('AUTO');
    }

    return harmon('AUTO');
}
