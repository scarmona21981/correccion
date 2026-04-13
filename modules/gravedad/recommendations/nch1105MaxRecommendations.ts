import { Recommendation } from './types';
import { MotorEvalFunc } from './nch1105MinRecommendations';

/**
 * NCh1105 – CONDICIÓN MÁXIMA (Capacidad hidráulica)
 * Se ejecuta SOLO si: verificacion1105.max.apto === false
 */
export function build1105MaxRecommendations(
    tramoId: string,
    dnActual: number,
    slopeActual: number,
    evalMax: MotorEvalFunc,
    dnList: number[]
): Recommendation[] {
    const recs: Recommendation[] = [];

    // A) AUMENTAR DN (manteniendo pendiente)
    const largerDns = dnList.filter(d => d > dnActual).sort((a, b) => a - b);
    let dnRequired: number | null = null;

    for (const d of largerDns) {
        const res = evalMax(d, slopeActual);
        if (res.apto) {
            dnRequired = d;
            break;
        }
    }

    if (dnRequired !== null) {
        recs.push({
            tramoId,
            norma: "NCh1105",
            tipo: "INCREASE_DN",
            titulo: "Aumentar diámetro",
            detalle: `Se sugiere aumentar el diámetro nominal de ${dnActual} mm a ${dnRequired} mm. Esto permite reducir el llenado relativo h/D por debajo del 0.70 y la velocidad si fuera superior a 3 m/s con la pendiente configurada.`,
            valores: { suggestedDn: dnRequired }
        });
    }

    // B) AUMENTAR PENDIENTE (manteniendo DN)
    let slopeRequired: number | null = null;
    const slopeMax = 15; // 15%
    for (let s = slopeActual + 0.05; s <= slopeMax; s += 0.05) {
        const res = evalMax(dnActual, s);
        if (res.apto) {
            slopeRequired = s;
            break;
        }
    }

    if (slopeRequired !== null) {
        recs.push({
            tramoId,
            norma: "NCh1105",
            tipo: "INCREASE_SLOPE",
            titulo: "Aumentar pendiente",
            detalle: `Un aumento en la pendiente del ${slopeActual.toFixed(2)}% al ${slopeRequired.toFixed(2)}% permite incrementar la capacidad hidráulica de la sección sin necesidad de cambiar el diámetro.`,
            valores: { suggestedSlope: slopeRequired }
        });
    }

    // C) MOSTRAR CAPACIDAD ADMISIBLE
    // El motor evalMax debe devolver el Qcap en algún lado, 
    // pero si el motor es solo motorEval(dn, slope), necesito obtener el Qcap real.
    // Usaremos un truco: el "motivo" o "summary" puede contener el Qcap.
    // O tal vez ampliar el tipo EvalResult.

    // Por ahora, asumimos que evalMax es la función de validación.

    return recs;
}
