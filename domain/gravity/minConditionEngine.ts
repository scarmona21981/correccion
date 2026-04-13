import {
    SegmentInput,
    SegmentMinHydraulicResult,
    QminMethodTrace
} from './types';
import { getManningAndDiMm } from '../../hydraulics/hydraulicCalculationEngine';
import {
    evaluateSlopeByNch1105,
    getNch1105SlopeLimits,
    SegmentInitialType
} from '../../hydraulics/nch1105SlopeTable';
import { getEffectiveRole, isRoleManual } from './roleUtils';
import { isValidDiameterMm } from '../../utils/diameterMapper';

/**
 * Solver de flujo parcial (Manning) específico para NCh1105
 */
function solvePartialHydraulics(Q_lps: number, D_m: number, S_m_m: number, n: number) {
    if (Q_lps <= 0 || D_m <= 0 || S_m_m <= 0) return { hD: 0, v: 0, qFull: 0 };

    const A_full = (Math.PI * D_m * D_m) / 4;
    const R_full = D_m / 4;
    const qFull = (1 / n) * A_full * Math.pow(R_full, 2 / 3) * Math.sqrt(S_m_m) * 1000;

    const ratio = Math.min(Q_lps / qFull, 0.999);
    if (ratio >= 0.999) return { hD: 1.0, v: (qFull / 1000) / A_full, qFull };

    let lo = 0.001, hi = 0.999;
    for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        const theta = 2 * Math.acos(1 - 2 * mid);
        const A = (D_m * D_m / 8) * (theta - Math.sin(theta));
        const P = D_m * theta / 2;
        const R = P > 0 ? A / P : 0;
        const Qmid = (1 / n) * A * Math.pow(R, 2 / 3) * Math.sqrt(S_m_m) * 1000;
        if (Qmid < Q_lps) lo = mid; else hi = mid;
    }
    const hD = (lo + hi) / 2;
    const theta = 2 * Math.acos(1 - 2 * hD);
    const A = (D_m * D_m / 8) * (theta - Math.sin(theta));
    const v = A > 0 ? (Q_lps / 1000) / A : 0;

    return { hD, v, qFull };
}

/**
 * Implementación de la Condición de Caudal Mínimo (Tabla 17 NCh1105:2019)
 */
export function computeMinConditionForSegments(
    segments: SegmentInput[],
    context: {
        Qmd_Ls_bySegment?: Record<string, number>;
        bsce_Ls_bySegment?: Record<string, number>;
        manning_n?: number;
        /** DN mínimo normativo a usar. Público NCh1105 = 200mm (8.1). Default = 175mm. */
        dnMin_mm?: number;
        /** Si true, aplica DN mín de 200mm y marca INCOMPLETO si P_edge=0 */
        isPublico?: boolean;
    }
): SegmentMinHydraulicResult[] {
    return segments.map(seg => {
        const missing: string[] = [];

        // 1. Determine Qmin and Method according to NCh1105
        let Qmin_Ls = 0;
        let traceMethod: QminMethodTrace['basis'] = "QMD";
        let formula = "";

        const qmd_val = context.Qmd_Ls_bySegment?.[seg.id];
        const bsce_val = context.bsce_Ls_bySegment?.[seg.id];

        const D = seg.D_Lphd ?? 150;
        const R = seg.R ?? 0.8;
        const C = seg.C ?? 1.0;
        const P_edge_seg = Math.max(0, seg.P_edge ?? 0);
        const qmd_from_pedge = P_edge_seg > 0 ? (P_edge_seg * D * R * C) / 86400 : 0;
        const qmd_eff = (qmd_val !== undefined && qmd_val > 0) ? qmd_val : qmd_from_pedge;

        const effectiveRole = getEffectiveRole(seg);
        const roleIsManual = isRoleManual(seg);

        switch (effectiveRole) {
            case "COLECTOR":
            case "INTERCEPTOR":
            case "EMISARIO":
                traceMethod = "0_60_QMD";
                Qmin_Ls = 0.60 * qmd_eff;
                formula = "Q_{m\u00edn} = 0.60 \\cdot Q_{md}";
                break;
            case "LATERAL":
            case "NACIENTE": {
                traceMethod = "BSCE";
                if (bsce_val !== undefined && bsce_val > 0) {
                    Qmin_Ls = bsce_val;
                } else if (context.isPublico) {
                    Qmin_Ls = 0.60 * qmd_eff;
                    traceMethod = "0_60_QMD";
                } else {
                    Qmin_Ls = 0;
                    missing.push("BSCE (sin viviendas/hab equivalentes)");
                }
                formula = "Q_{verif} = Q_{BSCE,\u00e1x.inst.}";
                break;
            }
            default:
                Qmin_Ls = 0.60 * qmd_eff;
                traceMethod = "0_60_QMD (fallback)";
                formula = "Q_{m\u00edn} = 0.60 \\cdot Q_{md}";
                break;
        }

        // 2. Hydraulic Parameters
        const material = seg.material || 'PVC';
        const { n: default_n, di_mm: default_di } = getManningAndDiMm(material, seg.DN_mm, seg.sdr);
        const Dint_mm = isValidDiameterMm(seg.Dint_mm) ? Number(seg.Dint_mm) : (isValidDiameterMm(default_di) ? Number(default_di) : Number(seg.DN_mm));
        const n_used = seg.manning_n || context.manning_n || default_n || 0.013;
        const manning_origin = seg.manning_origin || (context.manning_n ? 'Global' : 'Material');
        const I_eval_permille = seg.slope_permille ?? 0;
        if (seg.slope_permille === undefined || seg.slope_permille === null) missing.push("Pendiente");

        const D_m = Dint_mm / 1000;
        const S_m_m = Math.max(0.0001, I_eval_permille / 1000);

        // 3. Hydraulic Calculation
        const hydro = solvePartialHydraulics(Qmin_Ls, D_m, S_m_m, n_used);

        // 4. Limits and Checks
        const hD_min = 0.30;
        const initialType: SegmentInitialType = seg.isInitial ? "INICIAL" : "NO_INICIAL";
        const slopeLimits = getNch1105SlopeLimits(seg.DN_mm, seg.isInitial === true);
        const I_min_permille = slopeLimits.minRecommendedPermil;
        const I_crit_permille = slopeLimits.criticalPermil;

        let DN_min_mm: number | undefined = undefined;
        if (seg.role === "COLECTOR" || seg.role === "INTERCEPTOR" || seg.role === "EMISARIO" || seg.role === "LATERAL" || seg.role === "NACIENTE") {
            DN_min_mm = context.dnMin_mm ?? (context.isPublico ? 200 : 175);
        }

        const slopeEval = evaluateSlopeByNch1105(I_eval_permille, slopeLimits);
        const checkI = slopeEval.check;
        const checkHD = hydro.hD >= hD_min;

        // Vmin classification (NCh1105 6.8 + Professional practice)
        let velocityStatus: 'CUMPLE' | 'ACEPTABLE' | 'REVISAR' = 'REVISAR';
        if (hydro.v >= 0.60) velocityStatus = 'CUMPLE';
        else if (hydro.v >= 0.30) velocityStatus = 'ACEPTABLE';
        
        const checkV = hydro.v >= 0.60; // old binary check (informative)
        const checkQcap = Qmin_Ls <= hydro.qFull;
        const checkDN = DN_min_mm ? seg.DN_mm >= DN_min_mm : true;

        const missingQmd = qmd_eff <= 0;
        const hasCriticalData = !missing.includes("Pendiente") && !missingQmd;
        
        let status: SegmentMinHydraulicResult['status'] = "INCOMPLETO";
        if (hasCriticalData) {
            // APTO if slope is OK AND velocity is at least ACEPTABLE (>= 0.30)
            const isApto = checkI && (velocityStatus === 'CUMPLE' || velocityStatus === 'ACEPTABLE');
            status = isApto ? 'APTO' : 'REVISAR';
        }

        return {
            id: seg.id,
            tramoLabel: `${seg.cIni}-${seg.cFin}`,
            role: effectiveRole,
            role_auto: seg.gravityRole_auto ?? seg.role,
            role_isManual: roleIsManual,
            L_m: seg.L_m,
            DN_mm: seg.DN_mm,
            Dint_mm: Dint_mm,
            I_eval_permille,
            Qmin_Ls,
            Qcap_Ls: hydro.qFull,
            h_over_D: hydro.hD,
            V_ms: hydro.v,
            velocityStatus,
            manning: n_used,
            manning_origin,
            trace: {
                basis: traceMethod,
                formula,
                values: {
                    "Qmd": qmd_eff,
                    "BSCE": (bsce_val !== undefined && bsce_val > 0) ? bsce_val : 0,
                    "n": n_used,
                    "Dint": Dint_mm,
                    "I": I_eval_permille,
                    ...(P_edge_seg > 0 && !(qmd_val && qmd_val > 0) ? { "P_edge (fallback)": P_edge_seg } : {})
                },
                notes: [
                    roleIsManual ? `Rol: ${effectiveRole} (Manual)` : `Rol: ${effectiveRole} (Auto)`,
                    `Tipo: ${initialType}`,
                    `I_min = ${I_min_permille}‰, I_crit = ${I_crit_permille}‰`,
                    `Pendiente: ${slopeEval.reason}`,
                    DN_min_mm ? `DN mín: ${DN_min_mm} mm` : 'DN mín: N/A',
                    `Velocidad: ${velocityStatus} (V = ${hydro.v.toFixed(2)} m/s)`
                ]
            },
            limits: {
                I_min_permille,
                h_over_D_min: hD_min,
                V_ref_lim_ms: 0.60,
                DN_min_mm
            },
            checks: {
                I: checkI,
                hD: checkHD,
                Vref: checkV, 
                Qcap: checkQcap,
                DN: checkDN
            },
            status,
            missing: missing.length > 0 ? missing : undefined
        };
    });
}
