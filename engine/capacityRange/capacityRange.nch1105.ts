import { Pipe, ProjectSettings } from '../../context/ProjectContext';
import { CapacityRangeResult, CapacityConstraints } from './capacityRange.types';
import { LIMITS_NCH1105 } from '../../hydraulics/nch1105Limits';
import { ManningSolver } from '../../hydraulics/solver';

/**
 * NCh1105 Evaluation for Inverse Capacity
 */
export function evaluateRangeNCh1105(
    pipe: Pipe,
    settings: ProjectSettings,
    constraints: CapacityConstraints
): Partial<CapacityRangeResult> {
    const P_base = Number(pipe.hydraulics?.inputs?.P_edge ?? pipe.P_edge ?? 0);
    const Q_base_lps = Number(pipe.hydraulics?.Q_design_Lps ?? pipe.Q_design_Lps ?? 0);

    if (P_base <= 0 || Q_base_lps <= 0) {
        return {
            status: 'INDETERMINADO',
            limitingMin: 'P_base o Q_base es cero',
            norma: 'NCh1105'
        };
    }

    const { di_mm, slope_pct, n } = constraints;
    const slope_mm = slope_pct / 100;
    const D_m = di_mm / 1000;

    // --- evaluators ---
    const evalMax = (Q_lps: number) => {
        const results = ManningSolver.calculatePartialFlow(Q_lps / 1000, D_m, slope_mm, n);
        const hD_ok = results.fillRatio <= LIMITS_NCH1105.MAX.hD_max;
        const v_ok = results.velocity <= LIMITS_NCH1105.MAX.v_max;
        let limiting = '';
        if (!hD_ok) limiting = `h/D > ${LIMITS_NCH1105.MAX.hD_max}`;
        else if (!v_ok) limiting = `V > ${LIMITS_NCH1105.MAX.v_max} m/s`;

        return { ok: hD_ok && v_ok, limiting, hD: results.fillRatio, v: results.velocity };
    };

    const evalMin = (Q_lps: number) => {
        const results = ManningSolver.calculatePartialFlow(Q_lps / 1000, D_m, slope_mm, n);

        // Autolavado NCh1105: V >= 0.60 m/s Y h/D >= 0.30 (solo en colectores)
        // El motor actual suele ser mas laxo o estricto segun configuracion, 
        // seguiremos los LIMITS_NCH1105.MIN
        const v_ok = results.velocity >= LIMITS_NCH1105.MIN.v_min;
        const hD_ok = results.fillRatio >= LIMITS_NCH1105.MIN.hD_min;

        let limiting = '';
        if (!v_ok) limiting = `V < ${LIMITS_NCH1105.MIN.v_min} m/s`;
        else if (!hD_ok) limiting = `h/D < ${LIMITS_NCH1105.MIN.hD_min}`;

        return { ok: v_ok && hD_ok, limiting, hD: results.fillRatio, v: results.velocity };
    };

    // --- find Q_max ---
    // Q_full_lps
    const Q_full_lps = ManningSolver.calculateFullPipeFlow(n, D_m, slope_mm) * 1000;
    let Q_max_lps = findBoundaryFlow(0, Math.max(Q_full_lps, Q_base_lps * 2), evalMax, true) ?? 0;

    // --- find Q_min ---
    let Q_min_lps = findBoundaryFlow(0, Math.max(Q_full_lps, Q_base_lps * 1.5), evalMin, false);

    // --- convert to P ---
    const P_max_norm = P_base * (Q_max_lps / Q_base_lps);
    const P_min_norm = Q_min_lps === null ? null : P_base * (Q_min_lps / Q_base_lps);

    const resMax = evalMax(Q_max_lps);
    const resMin = Q_min_lps === null ? null : evalMin(Q_min_lps);

    // NUEVO: evaluación en el caudal base
    const resMaxBase = evalMax(Q_base_lps);
    const resMinBase = evalMin(Q_base_lps);

    return {
        P_min_norm,
        P_max_norm,
        okMaxAtBase: resMaxBase.ok,
        okMinAtBase: resMinBase.ok,
        limitingMax: resMax.limiting || 'Capacidad física',
        limitingMin: resMin ? (resMin.limiting || 'Autolavado') : 'No alcanza autolavado en el rango evaluado',
        detailsMax: `Q_max: ${Q_max_lps.toFixed(2)} L/s | h/D: ${resMax.hD.toFixed(2)} | V: ${resMax.v.toFixed(2)}`,
        detailsMin: (resMin && Q_min_lps !== null) ? `Q_min: ${Q_min_lps.toFixed(2)} L/s | h/D: ${resMin.hD.toFixed(2)} | V: ${resMin.v.toFixed(2)}` : `Sin solución: ni con Q alto se logra Vmin/hDmin`,
        norma: 'NCh1105'
    };
}

function findBoundaryFlow(
    low: number,
    high: number,
    evaluator: (Q: number) => { ok: boolean },
    isMaxSearch: boolean
): number | null {
    let lo = low;
    let hi = high;

    // Si buscamos Max y el low ya falla, es 0
    if (isMaxSearch && !evaluator(lo).ok) return 0;
    // Si buscamos Min y el high falla, no hay solución en este rango?
    // Subir el techo si es necesario
    if (!isMaxSearch && !evaluator(hi).ok) {
        hi *= 5; // Un intento mas
        if (!evaluator(hi).ok) return null; // <-- SIN SOLUCIÓN REAL
    }

    for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        if (hi - lo < 0.001) break;

        const res = evaluator(mid);
        if (isMaxSearch) {
            if (res.ok) lo = mid; else hi = mid;
        } else {
            if (res.ok) hi = mid; else lo = mid;
        }
    }
    return isMaxSearch ? lo : hi;
}
