import { Pipe, ProjectSettings } from '../../context/ProjectContext';
import { CapacityRangeResult, CapacityConstraints } from './capacityRange.types';
import { RIDAA_CAPACITY_TABLE, getMaxUEHForDNAndSlope } from '../../hydraulics/uehTables';

/**
 * NCh3371 (Domestic) Evaluation for Inverse Capacity
 */
export function evaluateRangeNCh3371(
    pipe: Pipe,
    settings: ProjectSettings,
    constraints: CapacityConstraints
): Partial<CapacityRangeResult> {
    const UEH_base = Number(pipe.uehTransportadas?.value || 0);
    const dn = constraints.dn_mm;
    const slope = constraints.slope_pct;

    const maxUEH = getMaxUEHForDNAndSlope(dn, slope);

    if (maxUEH === null) {
        return {
            status: 'INDETERMINADO',
            norma: 'NCh3371',
            limitingMax: 'DN/Pendiente fuera de tabla RIDAA'
        };
    }

    // Delta UEH
    const deltaUEH = maxUEH - UEH_base;
    const status = deltaUEH < 0 ? 'SOBRECARGADO' : (deltaUEH > maxUEH * 0.1 ? 'OPTIMO' : 'SOBRECARGADO');
    // Nota: NCh3371 suele ser binario (cumple o no cumple)

    return {
        P_base: UEH_base, // Usamos UEH como P_base para propósitos de tabla
        P_max_norm: maxUEH,
        P_min_norm: null,
        deltaP_up: deltaUEH,
        status: deltaUEH < 0 ? 'SOBRECARGADO' : 'OPTIMO',
        okMaxAtBase: UEH_base <= maxUEH,
        okMinAtBase: true, // NCh3371 no suele evaluar autolavado por población mínima
        limitingMax: `Máx UEH RIDAA: ${maxUEH}`,
        limitingMin: '—',
        detailsMax: `Capacidad según Tabla A.3 para DN ${dn} y i=${slope.toFixed(2)}%`,
        norma: 'NCh3371'
    };
}
