import { Chamber, Pipe, ProjectSettings } from '../context/ProjectContext';
import { Conduit } from '../hydraulics/types';
import { classifyPipeSegments, SegmentType } from '../hydraulics/segmentClassifier';
import { ManningSolver } from '../hydraulics/solver';
import { calculatePeakFlow_NCh1105, calculateQmdAS_Lps } from '../utils/designFlowCalculator';
import { getManningAndDiMm } from '../hydraulics/hydraulicCalculationEngine';
import { resolveHydraulicDiMm } from '../utils/diameterMapper';
import { getEffectivePipe } from '../utils/getEffectivePipe';

// Helper to get effective slope (manual if active, otherwise calculated)
type AnyPipe = {
    isSlopeManual?: boolean;
    manualSlope?: { value?: number | string } | null;
    slope?: { value?: number | string } | null;
};

function getEffectiveSlopePct(pipe: AnyPipe): number {
    const manual = pipe?.isSlopeManual ? Number(pipe?.manualSlope?.value) : NaN;
    if (Number.isFinite(manual) && manual > 0) return manual;
    const geom = Number(pipe?.slope?.value);
    return Number.isFinite(geom) ? geom : 0;
}

export type VerificationNorm = "NCh1105" | "NCh3371";

export type NCh1105SegmentType = "NACIENTE" | "LATERAL" | "COLECTOR";

export type PeakMethod = "BSCE" | "INTERP_BSCE_HARMON" | "HARMON" | "CAUDAL_DIRECTO" | "USER_DEFINED";

export interface CalcStep {
    label: string;        // ej: "P_trib", "Qmd", "M(Harmon)", "Qmaxh", "Manning_partial"
    method?: PeakMethod;  // si aplica
    formulaLatex?: string; // fórmula (corta)
    substitution?: string; // valores sustituidos (texto)
    result?: string;       // resultado final formateado
}

export interface SegmentTrace {
    segmentId: string;
    steps: CalcStep[];
}

export interface VerificationRowBase {
    // Identificación
    segmentId: string;
    tramo: string;             // "CI-12 → CI-14"
    upstreamNodeId: string;
    downstreamNodeId: string;

    // Norma y rol
    norma: "NCh1105";          // fijo en estas tablas
    role: string;              // "COLECTOR_EXTERIOR"
    segmentType: NCh1105SegmentType;

    // Geometría
    material: string;          // "PVC"
    dn_mm: number;             // DN nominal
    dint_mm: number;           // diámetro interior usado
    length_m: number;
    slope_m_m: number;         // pendiente (m/m)
    slope_pct: number;         // pendiente (%)

    // Aportes
    ueh_total: number;
    ueh_upstream: number;
    p_total: number;           // población por turno (input)
    p_tributaria: number;      // calculada por tramo

    // Caudales (siempre en L/s)
    qmd_lps: number;
    qmaxh_lps: number;
    qmin_lps: number;

    // Etiquetas de método (para mostrar)
    peak_method: PeakMethod;

    // Renombre correcto
    q_circulante_lps: number;
    equivalent_houses?: number;
    hab_por_casa_usado?: number;

    observation?: string;
}

export interface VerificationRowMax extends VerificationRowBase {
    // Hidráulica a Qmax
    h_over_d_max: number;
    v_max_mps: number;
    q_capacity_partial_lps?: number;
    ok_vmax: boolean;                 // V <= 3 m/s
    ok_hdmax: boolean;                // h/D <= 0.70 (default) o <=0.80 si “justificado”
    status: 'OK' | 'WARNING' | 'ERROR';
}

export interface VerificationRowMin extends VerificationRowBase {
    // Hidráulica a Qmin
    h_over_d_min: number;
    v_min_mps: number;
    ok_hdmin: boolean;                // h/D >= 0.30 (para COLECTOR)
    ok_vmin: boolean;                 // V >= 0.60 m/s
    min_rule: "QMIN_0_6_QMD" | "BSCE_AUTO_LAVADO" | "UNKNOWN";  // regla aplicada según segmentType
    status: 'OK' | 'WARNING' | 'ERROR';
}

export interface VerificationMatrix {
    projectId: string;
    generatedAtISO: string;
    table16_max: VerificationRowMax[];
    table17_min: VerificationRowMin[];
    traceBySegment: Record<string, SegmentTrace>; // trazabilidad por tramo
}

export function buildVerificationMatrix(
    chambers: Chamber[],
    pipes: Pipe[],
    settings: ProjectSettings
): VerificationMatrix {
    const generatedAtISO = new Date().toISOString();

    // 1. Filtrar solo tramos NCh1105 según rol efectivo
    const nch1105Pipes = pipes.filter(p => getEffectivePipe(p).regime === 'NCH1105');

    // 2. Clasificar tramos (NACIENTE, LATERAL, COLECTOR)
    const segmentsMap = classifyPipeSegments(pipes.map(p => ({
        id: p.id,
        from: p.startNodeId || '',
        to: p.endNodeId || '',
        diameter: Number(p.diameter?.value || 0) / 1000,
        length: Number(p.length?.value || 0),
        slope: getEffectiveSlopePct(p as unknown as AnyPipe)
    } as Conduit)));

    const table16_max: VerificationRowMax[] = [];
    const table17_min: VerificationRowMin[] = [];
    const traceBySegment: Record<string, SegmentTrace> = {};

    const P_total = settings.hasPopulation ? (settings.populationTotal || 0) : 0;
    const D = settings.D_L_per_hab_day || 150;
    const R = settings.R_recovery || 0.8;
    const C = settings.C_capacity || 1.0;
    const habPorCasa = settings.nch1105?.habPorCasa ?? null;

    // Necesitamos el total de UEH para ponderar si aplica
    const uehTotal = chambers.reduce((sum, c) => sum + Number(c.uehPropias?.value || 0), 0);

    for (const pipe of nch1105Pipes) {
        const segmentId = pipe.id;
        const eff = getEffectivePipe(pipe);
        const topologyType = segmentsMap.get(segmentId) || 'COLECTOR';
        const type = eff.role === 'COLECTOR' ? 'COLECTOR' : (eff.role === 'LATERAL' ? 'LATERAL' : topologyType);
        const upstreamNode = chambers.find(c => c.id === pipe.startNodeId);
        const downstreamNode = chambers.find(c => c.id === pipe.endNodeId);

        const tramoLabel = `${upstreamNode?.userDefinedId || upstreamNode?.id || '?'} → ${downstreamNode?.userDefinedId || downstreamNode?.id || '?'}`;

        const uehUpstream = Number(pipe.uehTransportadas?.value || 0);
        const isPublicoProject = settings.projectType === 'Público';

        // P_tributaria por tramo:
        // - Público: usar P_edge acumulado (de populationAccumulator) → varía por tramo
        // - Domiciliario/Mixto: distribución proporcional por UEH
        let p_tributaria = 0;
        if (isPublicoProject) {
            // P_edge es el valor fresco calculado por accumulatePopulation
            p_tributaria = Math.max(0, Number(pipe.P_edge ?? 0));
        } else if (P_total > 0 && uehTotal > 0) {
            p_tributaria = (uehUpstream / uehTotal) * P_total;
        } else if (pipe.hydraulics?.inputs?.P_edge) {
            p_tributaria = pipe.hydraulics.inputs.P_edge;
        }

        // Qmd
        const qmd_lps = calculateQmdAS_Lps({ P: p_tributaria, D, R, C });

        // Qmaxh
        let qmaxh_lps = 0;
        let peak_method: PeakMethod = 'HARMON';

        const traceSteps: CalcStep[] = [];
        // Traza de P_trib: fórmula diferente según modo proyecto
        if (isPublicoProject) {
            traceSteps.push({
                label: "P_trib",
                formulaLatex: "P_{trib} = P_{edge} \\text{ (acumulación topológica)}",
                substitution: `P_{edge}(${upstreamNode?.userDefinedId || pipe.startNodeId || '?'}) = ${p_tributaria.toFixed(0)} hab`,
                result: p_tributaria.toFixed(2)
            });
        } else {
            traceSteps.push({
                label: "P_trib",
                formulaLatex: "P_{trib} = (UEH_{up} / UEH_{total}) \\cdot P_{total}",
                substitution: `(${uehUpstream.toFixed(0)} / ${uehTotal.toFixed(0)}) \\cdot ${P_total.toFixed(0)}`,
                result: p_tributaria.toFixed(2)
            });
        }
        traceSteps.push({
            label: "Qmd",
            formulaLatex: "Q_{md} = (P_{trib} \\cdot D \\cdot R \\cdot C) / 86400",
            substitution: `(${p_tributaria.toFixed(2)} \\cdot ${D} \\cdot ${R} \\cdot ${C}) / 86400`,
            result: qmd_lps.toFixed(4) + " L/s"
        });

        const peak = calculatePeakFlow_NCh1105(
            p_tributaria,
            D,
            R,
            C,
            settings.nch1105?.peakMode || 'AUTO',
            habPorCasa
        );

        qmaxh_lps = peak.Qmax;
        peak_method = peak.method === 'INTERPOLACION' ? 'INTERP_BSCE_HARMON' : peak.method;

        if (peak.method === 'BSCE') {
            traceSteps.push({
                label: "Qmaxh (BSCE)",
                method: 'BSCE',
                formulaLatex: "Q_{maxh} = BSCE(N_{viv})",
                substitution: `N_{viv} = ceil(${p_tributaria.toFixed(2)} / ${peak.habPorCasaUsado ?? habPorCasa}) = ${peak.equivalentHouses ?? 0}`,
                result: qmaxh_lps.toFixed(2) + " L/s"
            });
        } else if (peak.method === 'INTERPOLACION') {
            traceSteps.push({
                label: "Qmaxh (Interp)",
                method: 'INTERP_BSCE_HARMON',
                formulaLatex: "Q_{maxh} = 3.6 + \\frac{P-100}{900} \\cdot (Q_{H,1000} - 3.6)",
                substitution: `3.6 + \\frac{${p_tributaria.toFixed(2)}-100}{900} \\cdot (${Number(peak.details.Q1000_Lps || 0).toFixed(2)} - 3.6)`,
                result: qmaxh_lps.toFixed(3) + " L/s"
            });
        } else {
            const M = peak.M || 0;
            traceSteps.push({
                label: "M (Harmon)",
                formulaLatex: "M = 1 + \\frac{14}{4 + \\sqrt{P/1000}}",
                substitution: `1 + \\frac{14}{4 + \\sqrt{${p_tributaria.toFixed(0)}/1000}}`,
                result: M.toFixed(3)
            });
            traceSteps.push({
                label: "Qmaxh",
                method: 'HARMON',
                formulaLatex: "Q_{maxh} = M \\cdot Q_{md}",
                substitution: `${M.toFixed(3)} \\cdot ${qmd_lps.toFixed(4)}`,
                result: qmaxh_lps.toFixed(3) + " L/s"
            });
        }

        // Trace for MAX (Table 16)
        const traceMax: SegmentTrace = {
            segmentId,
            steps: [...traceSteps]
        };

        // Geometry
        const material = String(pipe.material?.value || 'PVC');
        const dn_mm = Number(pipe.diameter?.value || 200);
        const sdr = pipe.sdr?.value ? String(pipe.sdr.value) : undefined;
        let n = getManningAndDiMm(material, dn_mm, sdr).n;
        if (pipe.manningOrigin === 'Manual' && pipe.manningManual?.value) {
            n = Number(pipe.manningManual.value);
        } else if (pipe.manningOrigin === 'Global' || (settings && settings.manning?.source === 'global')) {
            if (settings && settings.manning?.value) {
                n = settings.manning.value;
            }
        }
        const { di_mm: diTable } = getManningAndDiMm(material, dn_mm, sdr);
        const di_mm = resolveHydraulicDiMm(pipe, diTable);
        const slope_pct = getEffectiveSlopePct(pipe as unknown as AnyPipe);
        const slope_m_m = slope_pct / 100;
        const length_m = Number(pipe.length?.value || 0);

        // Hydraulic Qmax
        const resMax = ManningSolver.calculatePartialFlow(qmaxh_lps / 1000, di_mm / 1000, slope_m_m, n);
        const h_over_d_max = resMax.fillRatio;
        const v_max_mps = resMax.velocity;
        const ok_vmax = v_max_mps <= 3.0;
        const ok_hdmax = h_over_d_max <= 0.70;

        traceMax.steps.push({
            label: "Manning (Qmax)",
            formulaLatex: "Q = \\frac{1}{n} A R^{2/3} S^{1/2}",
            substitution: `Q=${qmaxh_lps.toFixed(2)} L/s, Dint=${di_mm}mm, n=${n}, S=${slope_pct.toFixed(2)}%`,
            result: `h/D=${h_over_d_max.toFixed(2)}, V=${v_max_mps.toFixed(2)} m/s`
        });

        const rowBase: VerificationRowBase = {
            segmentId,
            tramo: tramoLabel,
            upstreamNodeId: pipe.startNodeId || '',
            downstreamNodeId: pipe.endNodeId || '',
            norma: "NCh1105",
            role: eff.role,
            segmentType: type as NCh1105SegmentType,
            material,
            dn_mm,
            dint_mm: di_mm,
            length_m,
            slope_m_m,
            slope_pct,
            ueh_total: uehTotal,
            ueh_upstream: uehUpstream,
            p_total: P_total,
            p_tributaria,
            qmd_lps,
            qmaxh_lps,
            qmin_lps: 0,
            peak_method,
            q_circulante_lps: qmaxh_lps,
            equivalent_houses: peak.equivalentHouses,
            hab_por_casa_usado: peak.habPorCasaUsado
        };

        const rowMax: VerificationRowMax = {
            ...rowBase,
            h_over_d_max,
            v_max_mps,
            ok_vmax,
            ok_hdmax,
            status: (ok_vmax && ok_hdmax) ? 'OK' : (h_over_d_max > 0.8 ? 'ERROR' : 'WARNING'),
            observation: !ok_vmax ? "Velocidad > 3 m/s" : (!ok_hdmax ? "h/D > 0.70" : undefined)
        };
        table16_max.push(rowMax);

        // Traza Qmin — mismo P_trib trace
        const traceStepsMin: CalcStep[] = [];
        if (isPublicoProject) {
            traceStepsMin.push({
                label: "P_trib",
                formulaLatex: "P_{trib} = P_{edge} \\text{ (acumulación topológica)}",
                substitution: `P_{edge} = ${p_tributaria.toFixed(0)} hab`,
                result: p_tributaria.toFixed(2)
            });
        } else {
            traceStepsMin.push({
                label: "P_trib",
                formulaLatex: "P_{trib} = (UEH_{up} / UEH_{total}) \\cdot P_{total}",
                substitution: `(${uehUpstream.toFixed(0)} / ${uehTotal.toFixed(0)}) \\cdot ${P_total.toFixed(0)}`,
                result: p_tributaria.toFixed(2)
            });
        }
        traceStepsMin.push({
            label: "Qmd",
            formulaLatex: "Q_{md} = (P_{trib} \\cdot D \\cdot R \\cdot C) / 86400",
            substitution: `(${p_tributaria.toFixed(2)} \\cdot ${D} \\cdot ${R} \\cdot ${C}) / 86400`,
            result: qmd_lps.toFixed(4) + " L/s"
        });

        // En NCh1105, Qmín aplica igual para todos los roles (colector, lateral, naciente):
        // Qmín = 0.60 · Qmd (Art. 6.9.1). El criterio BSCE solo se usa cuando P < umbral y
        // modo no es Público puro.
        let qmin_lps = 0;
        let min_rule: VerificationRowMin['min_rule'] = 'UNKNOWN';
        // DN mínimo según proyecto: Público NCh1105 Art. 8.1 → 200mm; Domiciliario → 175mm
        const dn_min_calc = isPublicoProject ? 200 : 175;

        // Regla universal en Público: 0.6·Qmd para todos los roles
        // En Domiciliario/Mixto: NACIENTE/LATERAL usan BSCE (1.0 L/s), COLECTOR usa 0.6·Qmd
        if (type === 'COLECTOR' || isPublicoProject) {
            qmin_lps = 0.6 * qmd_lps;
            min_rule = 'QMIN_0_6_QMD';
            traceStepsMin.push({
                label: "Qmin (Regla 0.6)",
                formulaLatex: "Q_{min} = 0.6 \\cdot Q_{md}",
                substitution: `0.6 \\cdot ${qmd_lps.toFixed(4)}`,
                result: qmin_lps.toFixed(4) + " L/s"
            });
        } else {
            qmin_lps = 1.0; // BSCE autolavado (Domiciliario/Mixto, tramo inicial)
            min_rule = 'BSCE_AUTO_LAVADO';
            traceStepsMin.push({
                label: "Qmin (BSCE)",
                formulaLatex: "Q_{min} = 1.0 \\text{ L/s}",
                substitution: "Regla autolavado (tramo inicial)",
                result: "1.00 L/s"
            });
        }

        const resMin = ManningSolver.calculatePartialFlow(qmin_lps / 1000, di_mm / 1000, slope_m_m, n);
        const h_over_d_min = resMin.fillRatio;
        const v_min_mps = resMin.velocity;

        const ok_vmin = v_min_mps >= 0.60;
        // h/D mínimo: COLECTOR >= 0.30; en Público todos los roles deben cumplirlo
        const ok_hdmin = (type === 'COLECTOR' || isPublicoProject) ? h_over_d_min >= 0.30 : true;
        // DN mínimo según tipo proyecto
        const ok_dn_min = dn_mm >= dn_min_calc;

        traceStepsMin.push({
            label: "Manning (Qmin)",
            formulaLatex: "Q = \\frac{1}{n} A R^{2/3} S^{1/2}",
            substitution: `Q=${qmin_lps.toFixed(2)} L/s, Dint=${di_mm}mm, n=${n}, S=${slope_pct.toFixed(2)}%`,
            result: `h/D=${h_over_d_min.toFixed(2)}, V=${v_min_mps.toFixed(2)} m/s`
        });

        const rowMin: VerificationRowMin = {
            ...rowBase,
            qmin_lps,
            q_circulante_lps: qmin_lps,
            h_over_d_min,
            v_min_mps,
            ok_hdmin,
            ok_vmin,
            min_rule,
            status: (ok_hdmin && ok_vmin && ok_dn_min) ? 'OK' : 'WARNING',
            observation: !ok_dn_min ? `DN < ${dn_min_calc} mm (mín NCh1105)` :
                !ok_hdmin ? "h/D < 0.30" :
                    !ok_vmin ? "V < 0.60 m/s" : undefined
        };
        table17_min.push(rowMin);

        // Store traces with composite keys
        traceBySegment[`${segmentId}_MAX`] = { segmentId, steps: traceMax.steps };
        traceBySegment[`${segmentId}_MIN`] = { segmentId, steps: traceStepsMin };
    }

    return {
        projectId: "current",
        generatedAtISO,
        table16_max,
        table17_min,
        traceBySegment
    };
}
