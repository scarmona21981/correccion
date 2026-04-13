
import { detectAirValves, AirValveRecommendation } from '../hydraulics/airValveModule';
import { PressurePoint } from '../hydraulics/types';

// Mock Profile
const profile: PressurePoint[] = [
    // 1. Pump Discharge (Should get mandatory valve)
    { location: 'Descarga Bomba', elevation: 100, head: 150, pressure: 4.9 },

    // 2. High Point (Geometric)
    { location: 'Punto 2', elevation: 110, head: 148, pressure: 3.7 },
    { location: 'Punto 3 - HIGH', elevation: 120, head: 146, pressure: 2.5 },
    { location: 'Punto 4', elevation: 115, head: 144, pressure: 2.8 },

    // 3. Low Pressure / Vacuum
    { location: 'Punto 5', elevation: 130, head: 140, pressure: 0.98 },
    { location: 'Punto 6 - LOW P', elevation: 142, head: 138, pressure: -0.4 }, // VACUUM!
    { location: 'Punto 7', elevation: 135, head: 136, pressure: 0.1 },

    // 4. End
    { location: 'Fin de Tubería', elevation: 110, head: 130, pressure: 1.96 }
];

console.log('--- Testing Air Valve Detection ---');
const recommendations = detectAirValves(profile, 1000);

recommendations.forEach((r, i) => {
    console.log(`\nValve #${i + 1}:`);
    console.log(`  Type: ${r.type}`);
    console.log(`  Elevation: ${r.elevation} m`);
    console.log(`  Pressure: ${r.pressure.toFixed(2)} bar`);
    console.log(`  Reasons: ${(r.reasons || [r.reason]).join(' | ')}`);
});

// Assertions
const hasHighPointRecommendation = recommendations.some(r => r.elevation === 120);
const hasTripleAtLowPressure = recommendations.some(r => r.type === 'TRIPLE_EFFECT' && r.pressure < 0.3);
const hasSingleRecommendationPerChainage = recommendations.every((rec, idx) =>
    recommendations.findIndex(other => Math.abs(other.chainage - rec.chainage) <= 0.1) === idx
);

if (hasHighPointRecommendation && hasTripleAtLowPressure && hasSingleRecommendationPerChainage) {
    console.log('\n[PASS] Prioritized valve logic applied correctly.');
} else {
    console.error('\n[FAIL] Valve prioritization did not match expected behavior.');
    if (!hasHighPointRecommendation) console.error(' - Missing recommendation at high point');
    if (!hasTripleAtLowPressure) console.error(' - Missing TRIPLE_EFFECT at low/negative pressure');
    if (!hasSingleRecommendationPerChainage) console.error(' - Duplicate recommendations detected at same chainage');
}

const assert = (condition: boolean, message: string) => {
    if (!condition) throw new Error(message);
};

// -------------------------------------------------------------------------
// New boundary-condition tests for atmospheric discharge / pressure-break end
// -------------------------------------------------------------------------

const profileAtmosphericEnd: PressurePoint[] = [
    { location: 'Descarga Bomba', chainage: 0, elevation: 100, head: 120, pressure: 1.96 },
    { location: 'Tramo medio', chainage: 500, elevation: 105, head: 118, pressure: 1.28 },
    { location: 'Fin de Tubería', chainage: 1000, elevation: 110, head: 110, pressure: 0.0 }
];

const atmosphericNoValve = detectAirValves(profileAtmosphericEnd, 1000, {
    atmosphericDischarge: true,
    atmosphericBoundaryChainages: [1000],
    boundaryExclusionDistance: 1,
    pressureEpsBar: 1e-6
});

assert(
    atmosphericNoValve.every(rec => Math.abs(rec.chainage - 1000) > 1),
    'Caso 1: no debe sugerir ventosa en la última progresiva con descarga atmosférica/CRP.'
);

const profileWithIntermediateHighPoint: PressurePoint[] = [
    { location: 'Descarga Bomba', chainage: 0, elevation: 100, head: 125, pressure: 2.45 },
    { location: 'Punto alto intermedio', chainage: 620, elevation: 118, head: 120, pressure: 0.20 },
    { location: 'Bajada', chainage: 760, elevation: 112, head: 117, pressure: 0.49 },
    { location: 'Fin de Tubería', chainage: 1000, elevation: 110, head: 110, pressure: 0.0 }
];

const atmosphericWithHighPoint = detectAirValves(profileWithIntermediateHighPoint, 1000, {
    atmosphericDischarge: true,
    atmosphericBoundaryChainages: [1000],
    boundaryExclusionDistance: 1,
    pressureEpsBar: 1e-6
});

assert(
    atmosphericWithHighPoint.some(rec => Math.abs(rec.chainage - 620) <= 5),
    'Caso 2: debe sugerir ventosa en punto alto intermedio en sistema con descarga atmosférica.'
);
assert(
    atmosphericWithHighPoint.every(rec => Math.abs(rec.chainage - 1000) > 1),
    'Caso 2: no debe sugerir ventosa en la CRP/descarga atmosférica final.'
);

const profileClosedNegativePressure: PressurePoint[] = [
    { location: 'Descarga Bomba', chainage: 0, elevation: 100, head: 122, pressure: 2.16 },
    { location: 'Punto crítico cerrado', chainage: 700, elevation: 125, head: 123, pressure: -0.20 },
    { location: 'Fin de Tubería cerrada', chainage: 1000, elevation: 120, head: 123, pressure: 0.30 }
];

const closedNegative = detectAirValves(profileClosedNegativePressure, 1000, {
    atmosphericDischarge: false,
    pressureEpsBar: 1e-6
});

assert(
    closedNegative.some(rec => rec.pressure < -1e-6),
    'Caso 3: presión negativa real en punto cerrado debe seguir generando recomendación.'
);

console.log('[PASS] Atmospheric-boundary air-valve filtering checks passed.');
