import { Recommendation } from './types';

/**
 * NCh3371 – Instalaciones Domiciliarias
 * Se ejecuta SOLO si: tramo.estado === "NO APTO" y norma es NCh3371
 */
export function build3371Recommendations(
    tramoId: string,
    checks: any[]
): Recommendation[] {
    const recs: Recommendation[] = [];

    const failChecks = checks.filter(c => c.estado === 'FAIL');

    for (const check of failChecks) {
        if (check.id === 'DN_MIN' || check.id === 'DN_REQUERIDO') {
            recs.push({
                tramoId,
                norma: "NCh3371",
                tipo: "INCREASE_DN",
                titulo: "Aumentar diámetro",
                detalle: `El diámetro nominal actual es inferior al mínimo exigido por la norma NCh3371 (RIDAA) para el tipo de tramo o los artefactos conectados. Se sugiere incrementar el DN para cumplir con el requisito normativo de ${check.requerido}.`
            });
        }
        else if (check.id === 'PENDIENTE_MIN') {
            recs.push({
                tramoId,
                norma: "NCh3371",
                tipo: "INCREASE_SLOPE",
                titulo: "Aumentar pendiente",
                detalle: `La pendiente configuración del tramo es menor al 1% mínimo requerido para ramales interiores o al 3% para tramos con pocos artefactos (si aplica). Incremente la pendiente para asegurar el escurrimiento y cumplir con la norma.`
            });
        }
        else if (check.id === 'CAPACIDAD' || check.id === 'UEH_TABLA_A3' || check.id === 'H_D') {
            recs.push({
                tramoId,
                norma: "NCh3371",
                tipo: "FLOW_CAPACITY",
                titulo: "Aumentar capacidad",
                detalle: `La demanda hidráulica (ya sea en UEH o caudal acumulado) excedería la capacidad máxima soportable para el diámetro y pendiente configurados. ${check.actual}. Se sugiere aumentar el diámetro o la pendiente.`
            });
        }
        else if (check.id === 'VELOCIDAD_MAX') {
            recs.push({
                tramoId,
                norma: "NCh3371",
                tipo: "FLOW_CAPACITY",
                titulo: "Aumentar diámetro",
                detalle: "La velocidad de flujo supera los 3.0 m/s recomendados para evitar erosión en la red interior. Evalúe disminuir la pendiente o aumentar el diámetro."
            });
        }
    }

    return recs;
}
