import { Pipe, ProjectSettings } from '../../context/ProjectContext';
import { CapacityRangeResult, CapacityConstraints, CapacityStatus } from './capacityRange.types';
import { evaluateRangeNCh1105 } from './capacityRange.nch1105';
import { evaluateRangeNCh3371 } from './capacityRange.nch3371';
import { resolveEffectivePipeRole } from '../../utils/pipeRole';
import { getManningAndDiMm } from '../../hydraulics/hydraulicCalculationEngine';
import { resolveHydraulicDiMm } from '../../utils/diameterMapper';

/**
 * CORE Engine for Inverse Capacity Range
 */
export function evaluatePipeCapacityRange(
    pipe: Pipe,
    settings: ProjectSettings
): CapacityRangeResult {
    const role = resolveEffectivePipeRole(pipe);
    const tramoLabel = pipe.userDefinedId || pipe.id;
    const tramoNodes = `${pipe.startNodeId || '?'} - ${pipe.endNodeId || '?'}`;

    const material = String(pipe.material?.value || 'PVC');
    const dn_mm = Number(pipe.diameter?.value || 0);
    const sdr = pipe.sdr?.value ? String(pipe.sdr.value) : undefined;

    const { n, di_mm: di_fallback } = getManningAndDiMm(material, dn_mm, sdr);
    const di_mm = resolveHydraulicDiMm(pipe, di_fallback);
    const slope_pct = pipe.isSlopeManual && pipe.manualSlope
        ? Number(pipe.manualSlope.value)
        : Number(pipe.slope?.value || 0);

    const constraints: CapacityConstraints = { dn_mm, slope_pct, material, n, di_mm };

    let resultPartial: Partial<CapacityRangeResult> = {
        status: 'INDETERMINADO',
        limitingMax: 'Desconocido',
        norma: 'INDETERMINADA'
    };

    // --- Selección de Norma ---
    // Si es colector exterior o red pública -> NCh1105
    if (role === 'COLECTOR_EXTERIOR' || settings.projectType === 'Público') {
        resultPartial = evaluateRangeNCh1105(pipe, settings, constraints);
    }
    // Si es instalacion domiciliaria o descarga -> NCh3371
    else if (role === 'INTERIOR_RAMAL' || role === 'DESCARGA_HORIZ' || role === 'CAÑERIA') {
        resultPartial = evaluateRangeNCh3371(pipe, settings, constraints);
    }

    // Finalize result fields
    const P_base = Number(pipe.hydraulics?.inputs?.P_edge ?? pipe.P_edge ?? pipe.uehTransportadas?.value ?? 0);
    const Q_base_lps = Number(pipe.hydraulics?.Q_design_Lps ?? pipe.Q_design_Lps ?? 0);

    const P_min = resultPartial.P_min_norm ?? null;
    const P_max = resultPartial.P_max_norm ?? null;

    // Determine Status
    let finalStatus: CapacityStatus = 'INDETERMINADO';
    const hasAnyBound = P_min !== null || P_max !== null;

    if (!hasAnyBound) {
        finalStatus = 'INDETERMINADO';
    } else if (P_min !== null && P_max !== null && P_min > P_max) {
        finalStatus = 'INCOMPATIBLE';
    } else if (P_max !== null && P_base > P_max) {
        finalStatus = 'SOBRECARGADO';
    } else if (P_min !== null && P_base < P_min) {
        finalStatus = 'SUBUTILIZADO'; // <-- esto representa “sin autolavado” cuando P_min viene por condición mínima
    } else if (P_max !== null || P_min !== null) {
        finalStatus = 'OPTIMO';
    }

    // Calcular “Limitante real”
    const okMaxAtBase = resultPartial.okMaxAtBase;
    const okMinAtBase = resultPartial.okMinAtBase;

    let limitingReal: CapacityRangeResult['limitingReal'] = 'Desconocido';
    if (okMaxAtBase === true && okMinAtBase === true) limitingReal = 'Ninguna';
    else if (okMaxAtBase === false && okMinAtBase === true) limitingReal = 'Capacidad máxima';
    else if (okMaxAtBase === true && okMinAtBase === false) limitingReal = 'Autolavado';
    else if (okMaxAtBase === false && okMinAtBase === false) limitingReal = 'Ambas';

    const limitingRealText =
        limitingReal === 'Autolavado' ? (resultPartial.limitingMin || 'Autolavado') :
            limitingReal === 'Capacidad máxima' ? (resultPartial.limitingMax || 'Capacidad máxima') :
                limitingReal === 'Ambas' ? 'Falla máxima y mínima' :
                    limitingReal === 'Ninguna' ? 'Cumple ambas' :
                        '—';

    return {
        pipeId: pipe.id,
        label: tramoLabel,
        rol: role,
        P_base,
        Q_base_lps,
        P_min_norm: P_min,
        P_max_norm: P_max,
        deltaP_up: P_max !== null ? (P_max - P_base) : null,
        deltaP_down: P_min !== null ? (P_base - P_min) : null,
        status: finalStatus,
        limitingMax: resultPartial.limitingMax || (finalStatus === 'INCOMPATIBLE' ? 'P_min > P_max' : '—'),
        limitingMin: resultPartial.limitingMin || '—',
        okMaxAtBase,
        okMinAtBase,
        limitingReal,
        limitingRealText,
        detailsMax: resultPartial.detailsMax,
        detailsMin: resultPartial.detailsMin,
        norma: resultPartial.norma || 'INDETERMINADA'
    };
}

export function evaluateBatchCapacityRange(
    pipes: Pipe[],
    settings: ProjectSettings
): CapacityRangeResult[] {
    return pipes.map(p => evaluatePipeCapacityRange(p, settings));
}
