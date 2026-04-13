/**
 * Test file for pressure hydraulics calculations
 * 
 * Tests:
 * - Hazen-Williams formula
 * - Darcy-Weisbach formula
 * - Singular losses
 * - Pump curve interpolation (3-point)
 * - Operating point solver
 * - Pressure verification
 * - Surge analysis
 */

import { hazenWilliamsLoss, darcyWeisbachLoss, singularLosses, calculateVelocity } from '../hydraulics/lossModule';
import { createPumpCurve, findOperatingPoint, createSystemCurve, validatePumpCurve } from '../hydraulics/pumpModule';
import { Pump, PumpCurvePoint, KFactor, PressurePoint } from '../hydraulics/types';
import { analyzeSurge } from '../hydraulics/surgeModule';
import { verifyPressureLimits, calculatePressureProfile } from '../hydraulics/pressureModule';

console.log('🧪 Testing Pressure Hydraulics Calculations\n');
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

const report = (ok: boolean, label: string) => {
    if (ok) {
        passed += 1;
        console.log(`✓ ${label}: PASSED`);
    } else {
        failed += 1;
        console.log(`✗ ${label}: FAILED`);
    }
};

const closeTo = (value: number, expected: number, tolerance: number) =>
    Math.abs(value - expected) <= tolerance;

// ============================================================================
// TEST 1: Hazen-Williams Loss Calculation
// ============================================================================

console.log('\n📊 Test 1: Hazen-Williams Loss');
console.log('-'.repeat(60));

const Q = 0.01; // m³/s
const C = 140;
const D = 0.15; // m (150mm)
const L = 100; // m

const hf_hazen = hazenWilliamsLoss(Q, C, D, L);
console.log(`Parámetros: Q=${Q} m³/s, C=${C}, D=${D}m, L=${L}m`);
console.log(`Pérdida por fricción (Hazen-Williams): ${hf_hazen.toFixed(3)} m`);
console.log(`Esperado: ~0.230m`);
report(closeTo(hf_hazen, 0.230, 0.01), 'Fórmula Hazen-Williams');

// ============================================================================
// TEST 2: Darcy-Weisbach Loss Calculation
// ============================================================================

console.log('\n📊 Test 2: Darcy-Weisbach Loss');
console.log('-'.repeat(60));

const roughness = 0.0015; // mm
const hf_darcy = darcyWeisbachLoss(Q, roughness, D, L);
console.log(`Parámetros: Q=${Q} m³/s, ε=${roughness}mm, D=${D}m, L=${L}m`);
console.log(`Pérdida por fricción (Darcy-Weisbach): ${hf_darcy.toFixed(3)} m`);
console.log(`Esperado: ~0.202m`);
report(closeTo(hf_darcy, 0.202, 0.01), 'Fórmula Darcy-Weisbach');

// ============================================================================
// TEST 3: Singular Losses
// ============================================================================

console.log('\n📊 Test 3: Singular Losses');
console.log('-'.repeat(60));

const kFactors: KFactor[] = [
    { description: 'Válvula de Retención', K: 2.5 },
    { description: 'Codo 90°', K: 0.9 },
    { description: 'Entrada', K: 0.5 }
];

const hs = singularLosses(Q, D, kFactors);
const v = calculateVelocity(Q, D);
console.log(`Parámetros: Q=${Q} m³/s, D=${D}m`);
console.log(`Velocidad: ${v.toFixed(2)} m/s`);
console.log(`K total: ${kFactors.reduce((sum, k) => sum + k.K, 0)}`);
console.log(`Pérdidas singulares: ${hs.toFixed(3)} m`);
console.log(`Esperado: ~0.064m`);
report(closeTo(hs, 0.064, 0.01), 'Pérdidas singulares');

// ============================================================================
// TEST 4: Pump Curve (3-Point Mode)
// ============================================================================

console.log('\n📊 Test 4: Pump Curve Interpolation (3-Point)');
console.log('-'.repeat(60));

const pump: Pump = {
    id: 'test-pump',
    x: 0,
    y: 0,
    curveMode: '3_POINTS',
    point0: { Q: 0, H: 30 },
    pointNom: { Q: 0.015, H: 25 },
    pointMax: { Q: 0.03, H: 15 },
    Qnom: 0.015,
    Hnom: 25,
    PN_usuario: 10,
    wetWellId: 'well-test',
    dischargeLineId: 'line-test'
};

const curveValidation = validatePumpCurve(pump);
console.log(`Curva válida: ${curveValidation.valid ? '✓ SÍ' : '✗ NO'}`);
if (!curveValidation.valid) {
    console.log(`Errores: ${curveValidation.errors.join(', ')}`);
}

const pumpCurve = createPumpCurve(pump);
const H_at_010 = pumpCurve(0.01);
console.log(`H en Q=0.01 m³/s: ${H_at_010.toFixed(2)} m`);
console.log(`Esperado: ~26.5m`);
report(closeTo(H_at_010, 26.5, 2.0), 'Curva de bomba (3 puntos)');

// ============================================================================
// TEST 5: Operating Point Solver
// ============================================================================

console.log('\n📊 Test 5: Operating Point Calculation');
console.log('-'.repeat(60));

const H_static = 15; // m
const K_total = 500; // derived from system parameters

const systemCurve = createSystemCurve(H_static, K_total);
const operatingPoint = findOperatingPoint(pumpCurve, systemCurve, 0.015);

console.log(`Carga estática: ${H_static} m`);
console.log(`K total del sistema: ${K_total}`);
console.log(`Punto de operación:`);
console.log(`  Q = ${operatingPoint.Q.toFixed(4)} m³/s`);
console.log(`  H = ${operatingPoint.H.toFixed(2)} m`);
console.log(`Esperado: Q ≈ 0.029 m³/s, H ≈ 15.7m`);
report(
    closeTo(operatingPoint.Q, 0.029, 0.003) && closeTo(operatingPoint.H, 15.7, 0.8),
    'Punto de operación (solver)'
);

// ============================================================================
// TEST 6: Pressure Verification
// ============================================================================

console.log('\n📊 Test 6: Pressure Calculations');
console.log('-'.repeat(60));

const H_pump = 35; // m
const z_pump = 5; // m
const z_end = 25; // m
const h_friction_test = 5; // m
const h_singular_test = 2; // m

const pipeLength = 150; // m
const pressurePoints = calculatePressureProfile(H_pump, z_pump, z_end, h_friction_test, h_singular_test, pipeLength);

const PN = 10; // bar

console.log(`Perfil de presión:`);
pressurePoints.forEach(p => {
    console.log(`  ${p.location}: P = ${p.pressure.toFixed(2)} bar (H=${p.head.toFixed(1)}m, z=${p.elevation.toFixed(1)}m)`);
});

const pressureCheck = verifyPressureLimits(pressurePoints, PN);
console.log(`Presión máxima: ${pressureCheck.maxPressure.toFixed(2)} bar en "${pressureCheck.maxLocation}"`);
console.log(`Cumple PN ${PN} bar: ${pressureCheck.ok ? '✓ SÍ' : '✗ NO'}`);
if (!pressureCheck.ok) {
    console.log(`Violaciones: ${pressureCheck.violations.join('; ')}`);
}

const zonedPointsOk: PressurePoint[] = [
    { location: 'Succión', chainage: 0, elevation: 100, head: 100, pressure: 0 },
    { location: 'Descarga intermedia', chainage: 50, elevation: 105, head: 106.5, pressure: 0.15 },
    { location: 'Descarga atmosférica', chainage: 100, elevation: 110, head: 110, pressure: 0 }
];

const zonedCheckOk = verifyPressureLimits(zonedPointsOk, PN, {
    allowAtmosphericEndPressure: true,
    minPressureBar: 0,
    zones: ['SUCTION', 'DISCHARGE', 'DISCHARGE']
});

console.log(`Chequeo succión + atmosférico: ${zonedCheckOk.ok ? '✓ OK' : '✗ FAIL'}`);
if (!zonedCheckOk.ok) {
    console.log(`Violaciones zonificadas: ${zonedCheckOk.violations.join('; ')}`);
}
report(zonedCheckOk.ok, 'Criterio zonificado (succión + descarga atmosférica)');

const negativePointCheck = verifyPressureLimits([
    { location: 'Punto negativo', chainage: 10, elevation: 0, head: 0, pressure: -0.2 }
], PN, { minPressureBar: 0, zones: ['DISCHARGE'] });
console.log(`Presión negativa detectada: ${negativePointCheck.ok ? '✗ NO' : '✓ SÍ'}`);
report(!negativePointCheck.ok, 'Detección de presión negativa');

const overPnCheck = verifyPressureLimits([
    { location: 'Punto sobre PN', chainage: 10, elevation: 0, head: 0, pressure: PN + 0.5 }
], PN, { minPressureBar: 0, zones: ['DISCHARGE'] });
console.log(`Sobrepresión detectada: ${overPnCheck.ok ? '✗ NO' : '✓ SÍ'}`);
report(!overPnCheck.ok, 'Detección de sobrepresión PN');

report(pressureCheck.ok, 'Cálculos de presión');

// ============================================================================
// TEST 7: Surge Analysis
// ============================================================================

console.log('\n📊 Test 7: Water Hammer Analysis');
console.log('-'.repeat(60));

const L_pipe = 200; // m
const V_flow = 1.5; // m/s
const material = 'PVC';
const D_nom = 200; // mm
const P_max_static = 3.5; // bar
const PN_pipe = 10; // bar

const surgeResult = analyzeSurge(L_pipe, V_flow, material, D_nom, P_max_static, PN_pipe);

console.log(`Análisis golpe de ariete:`);
console.log(`  Activado: ${surgeResult.activated ? 'SÍ (L>50m Y V>1.2m/s)' : 'NO'}`);
if (surgeResult.activated) {
    console.log(`  Velocidad de onda: ${surgeResult.waveSpeed.toFixed(0)} m/s`);
    console.log(`  ΔH surge: ${surgeResult.deltaH.toFixed(2)} m`);
    console.log(`  P máxima estática: ${surgeResult.P_max_static.toFixed(2)} bar`);
    console.log(`  P máxima total (estática + surge): ${surgeResult.P_max_total.toFixed(2)} bar`);
    console.log(`  Cumple PN ${PN_pipe} bar: ${surgeResult.compliant ? '✓ SÍ' : '✗ NO'}`);
    if (!surgeResult.compliant) {
        console.log(`  Violaciones:`);
        surgeResult.violations.forEach(v => console.log(`    - ${v}`));
    }
}
report(surgeResult.activated && surgeResult.compliant, 'Análisis de golpe de ariete');

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log('📋 RESUMEN DE TESTS');
console.log('='.repeat(60));
console.log(`Tests aprobados: ${passed}`);
console.log(`Tests fallidos: ${failed}`);

if (failed > 0) {
    console.log('\n❌ Existen tests fallidos. Revisar resultados.\n');
    process.exit(1);
}

console.log('\n✅ Todos los módulos de cálculo hidráulico funcionando correctamente\n');
