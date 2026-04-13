import { detectAirValves } from '../hydraulics/airValveModule';
import { generateHydraulicSamples } from '../hydraulics/pressureModule';
import { PressurePipe, PressurePoint } from '../hydraulics/types';

function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}

const pipe: PressurePipe = {
    id: 'PP-TEST-PERFIL',
    x1: 0,
    y1: 0,
    x2: 50,
    y2: 0,
    length: 50,
    diameter: 200,
    material: 'PVC',
    z_start: 100,
    z_end: 100,
    z_start_terreno: 100,
    z_end_terreno: 100,
    cover_m: 1,
    profilePoints: [{ chainage: 25, elevation: 115, id: 'PT-ALTO' }],
    kFactors: [],
    PN: 10
};

const samples = generateHydraulicSamples(pipe, 0, 0, 130);

const sampleAt = (targetX: number) => {
    const hit = samples.find(sample => Math.abs(sample.x - targetX) < 1e-6);
    if (hit) return hit;

    let nearest = samples[0];
    let minDistance = Math.abs(samples[0].x - targetX);
    samples.forEach(sample => {
        const distance = Math.abs(sample.x - targetX);
        if (distance < minDistance) {
            nearest = sample;
            minDistance = distance;
        }
    });
    return nearest;
};

const zStart = sampleAt(0).elevation;
const zPeak = sampleAt(25).elevation;
const zEnd = sampleAt(50).elevation;

assert(
    zPeak > zStart && zPeak > zEnd,
    `El eje no refleja punto alto intermedio (z0=${zStart.toFixed(2)}, z25=${zPeak.toFixed(2)}, z50=${zEnd.toFixed(2)}).`
);

const pressureProfile: PressurePoint[] = samples.map(sample => ({
    location: `x=${sample.x.toFixed(1)}m`,
    chainage: sample.x,
    elevation: sample.elevation,
    head: sample.hgl,
    pressure: sample.pressure
}));

const recommendations = detectAirValves(pressureProfile, pipe.length, {
    highPointDelta: 0.05,
    pressureEpsBar: 1e-6
});

assert(
    recommendations.some(rec => Math.abs(rec.chainage - 25) <= 1),
    `No se detectó recomendación de ventosa en el máximo local (cadena 25m). Detectadas: ${recommendations.map(rec => rec.chainage.toFixed(2)).join(', ')}`
);

console.log('[PASS] Perfil con punto intermedio alto: eje de tubería sube y luego baja, con ventosa sugerida en cumbre.');
