import { Recommendation } from './types';
import { getSlopeMinPermil } from '../../../hydraulics/nch1105SlopeTable';
import { checkDiameterNCh1105 } from '../../../hydraulics/nch1105DiameterCheck';

export interface EvalResult {
    apto: boolean;
    motivo?: string;
}

export type MotorEvalFunc = (dn: number, slopePct: number) => EvalResult;

/**
 * NCh1105 – CONDICIÓN MÍNIMA (Autolavado)
 * Se ejecuta SOLO si: verificacion1105.min.apto === false
 */
export function build1105MinRecommendations(
    tramoId: string,
    dnActual: number,
    slopeActual: number,
    evalMin: MotorEvalFunc,
    dnList: number[]
): Recommendation[] {
    const recs: Recommendation[] = [];
    const cumulativeDN175_m = 0; // TODO: conectar acumulado real si existe en el futuro

    // Pendiente mínima normativa por tabla (per mil -> porcentaje)
    const slopeMinNormative = getSlopeMinPermil(dnActual, "NO_INICIAL") / 10;

    if (slopeActual < slopeMinNormative) {
        // PRIORIDAD: AUMENTAR PENDIENTE
        let slopeRequired: number | null = null;
        const slopeMax = 0.15; // 15%

        // Iterar buscando cumplimiento
        for (let s = Math.max(slopeActual + 0.1, slopeMinNormative); s <= slopeMax * 100; s += 0.1) {
            const res = evalMin(dnActual, s);
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
                detalle: `La pendiente actual (${slopeActual.toFixed(2)}%) es inferior a la mínima normativa o insuficiente. Se sugiere aumentar a ${slopeRequired.toFixed(2)}% para lograr autolavado.`,
                valores: { suggestedSlope: slopeRequired }
            });
        }
    } else {
        // PRIORIDAD: REDUCIR DIÁMETRO (Filtrando por normativa NCh1105 para evitar DN < 175 no permitidos)
        const smallerDns = dnList
            .filter(d => d < dnActual)
            .filter(d => checkDiameterNCh1105(d, cumulativeDN175_m).status !== "NO_APTO")
            .sort((a, b) => b - a);

        let dnRequired: number | null = null;

        for (const d of smallerDns) {
            const res = evalMin(d, slopeActual);
            if (res.apto) {
                dnRequired = d;
                break;
            }
        }

        if (dnRequired !== null) {
            const chk = checkDiameterNCh1105(dnRequired, cumulativeDN175_m);
            const conditionalNote = chk.status === "CONDICIONAL"
                ? " Nota: DN 175 es condicional y requiere justificación según NCh1105."
                : "";

            recs.push({
                tramoId,
                norma: "NCh1105",
                tipo: "DECREASE_DN",
                titulo: "Reducir diámetro",
                detalle: `La pendiente es adecuada, pero el caudal es insuficiente. Reducir a DN ${dnRequired} permite aumentar el tirante relativo (h/D) y la velocidad.${conditionalNote}`,
                valores: { suggestedDn: dnRequired }
            });
        } else {
            // Si reducir diámetro no es posible por normativa o no cumple, intentar aumentar pendiente como último recurso
            let slopeRequired: number | null = null;
            for (let s = slopeActual + 0.1; s <= 15; s += 0.1) {
                if (evalMin(dnActual, s).apto) {
                    slopeRequired = s;
                    break;
                }
            }
            if (slopeRequired) {
                recs.push({
                    tramoId,
                    norma: "NCh1105",
                    tipo: "INCREASE_SLOPE",
                    titulo: "Aumentar pendiente",
                    detalle: `No es posible reducir el DN sin violar el mínimo normativo NCh1105 (DN < 175 no permitido). Se requiere aumentar la pendiente a ${slopeRequired.toFixed(2)}% para lograr autolavado manteniendo el DN actual.`,
                    valores: { suggestedSlope: slopeRequired }
                });
            }
        }
    }

    return recs;
}
