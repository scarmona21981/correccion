import { Recommendation } from './types';
import { build1105MinRecommendations, MotorEvalFunc } from './nch1105MinRecommendations';
import { build1105MaxRecommendations } from './nch1105MaxRecommendations';
import { build3371Recommendations } from './nch3371Recommendations';
import { checkDiameterNCh1105 } from '../../../hydraulics/nch1105DiameterCheck';
import dInteriorRaw from '../../../../normativa/diametros internos/d_interior.json';

const dInterior = dInteriorRaw as any;

/**
 * Motor principal de recomendaciones.
 * Recibe un tramo (FilaUnificada / Norm Row) y los motores de evaluación.
 */
export function buildRecommendations(
    tramo: any,
    motores: { evalMin: MotorEvalFunc; evalMax: MotorEvalFunc; material: string }
): Recommendation[] {
    const recs: Recommendation[] = [];
    const tramoId = tramo.id || tramo.pipeId; // ID visible (ej: T8)
    const pipeIdInternal = tramo.pipeId; // ID interno

    // Obtener lista de DNs disponibles para el material real
    const matKey = normalizeMaterialKey(motores.material);
    const matData = dInterior.materiales[matKey] || dInterior.materiales['PVC'];
    let dnList: number[] = [];

    if (matData.diametros) {
        dnList = Object.keys(matData.diametros).map(Number);
    } else if (matData.SDR17) {
        // Fallback or specific SDR
        dnList = Object.keys(matData.SDR17).map(Number);
    }
    dnList.sort((a, b) => a - b);

    // FILTRO NORMATIVO PREVENTIVO (NCh1105)
    if (tramo.norma === "NCh1105") {
        const cumulativeDN175_m = 0; // TODO: conectar si existe dato real
        dnList = dnList.filter(d => checkDiameterNCh1105(d, cumulativeDN175_m).status !== "NO_APTO");
    }

    if (tramo.norma === "NCh1105") {
        const condMin = tramo.condMin;
        const condMax = tramo.condMax;

        if (condMin && !condMin.apto) {
            const minRecs = build1105MinRecommendations(
                tramoId,
                tramo.dn,
                tramo.pendiente,
                motores.evalMin,
                dnList
            );
            minRecs.forEach(r => {
                r.falloLabel = "AUTOLAVADO (Condición mínima NCh1105)";
                r.pipeId = pipeIdInternal;
            });
            recs.push(...minRecs);
        }

        if (condMax && !condMax.apto) {
            const maxRecs = build1105MaxRecommendations(
                tramoId,
                tramo.dn,
                tramo.pendiente,
                motores.evalMax,
                dnList
            );
            maxRecs.forEach(r => {
                r.falloLabel = "CAPACIDAD HIDRÁULICA (Condición máxima NCh1105)";
                r.pipeId = pipeIdInternal;
            });
            recs.push(...maxRecs);
        }
    }

    if (tramo.norma.includes("NCh3371")) {
        // En NCh3371 evaluamos si el estado global es NO APTO
        if (tramo.estado === "NO APTO") {
            const rowRecs = build3371Recommendations(tramoId, tramo.checks);
            rowRecs.forEach(r => {
                r.falloLabel = "CAPACIDAD UEH (Tabla A.3 NCh3371)";
                r.pipeId = pipeIdInternal;
            });
            recs.push(...rowRecs);
        }
    }

    return recs;
}

function normalizeMaterialKey(mat: string): string {
    const raw = String(mat || '').trim().toUpperCase();
    if (raw === '') return 'PVC';
    if (raw.includes('PVC')) return 'PVC';
    if (raw.includes('HORMIG')) return 'HORMIGON_HCV';
    if (raw.includes('HCV')) return 'HORMIGON_HCV';
    if (raw.includes('HDPE') || raw.includes('PEAD') || raw.includes('PE')) return 'HDPE_LISO';
    return raw;
}
