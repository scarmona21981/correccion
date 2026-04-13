import { PressureEngine } from '../hydraulics/pressureEngine';
import { toM3s } from '../hydraulics/flowUnits';
import {
    verifyVelocityRange,
    isVelocityWithinNormativeRange,
    evaluateEndPressureStatus,
    shouldWarnHighLosses,
    calculateBepFlowRatio,
    shouldRecommendSmallerPumpByBep
} from '../hydraulics/pressureModule';
import { Pump, PressurePipe, WetWell } from '../hydraulics/types';

const assertClose = (value: number, expected: number, tol: number, label: string) => {
    if (Math.abs(value - expected) > tol) {
        throw new Error(label + ': expected ' + expected.toFixed(6) + ' +/- ' + tol + ', got ' + value.toFixed(6));
    }
};

const wetWell: WetWell = {
    id: 'ww-mode-test',
    x: 0,
    y: 0,
    CR: 95,
    CT: 102,
    CL: 100,
    CI: 96,
    Nmin: 96,
    Noff: 97,
    N1on: 100,
    Nalarm: 101.5,
    inflowRate: 3
};

const basePump: Pump = {
    id: 'pump-mode-test',
    x: 0,
    y: 0,
    curveMode: '3_POINTS',
    Qnom: 0.003,
    Hnom: 20,
    PN_usuario: 10,
    wetWellId: 'ww-mode-test',
    dischargeLineId: 'pipe-mode-test',
    point0: { Q: 0, H: 25 },
    pointNom: { Q: 0.003, H: 20 },
    pointMax: { Q: 0.006, H: 12 }
};

const pipe: PressurePipe = {
    id: 'pipe-mode-test',
    x1: 0,
    y1: 0,
    x2: 10,
    y2: 10,
    length: 1800,
    diameter: 110,
    material: 'PVC',
    PN: 10,
    z_start: 100,
    z_end: 115,
    kFactors: [],
    C_hazen: 140
};

const engine = new PressureEngine();
const qinM3s = toM3s(wetWell.inflowRate || 0, 'L/s');

const velocityCases = [
    { v: 0.59, expectedOk: false, label: 'v=0.59 => no cumple' },
    { v: 0.60, expectedOk: true, label: 'v=0.60 => cumple' },
    { v: 3.00, expectedOk: true, label: 'v=3.00 => cumple' },
    { v: 3.01, expectedOk: false, label: 'v=3.01 => no cumple' },
    { v: 0.5999999999, expectedOk: true, label: 'v=0.5999999999 => cumple por EPS' }
];

console.log('--- Test Velocity Inclusive Normative Range ---');
velocityCases.forEach(({ v, expectedOk, label }) => {
    const result = verifyVelocityRange(v);
    if (result.ok !== expectedOk) {
        throw new Error(`${label}. Esperado ok=${expectedOk}, obtenido ok=${result.ok}. msg=${result.message}`);
    }
});

const velocityPassMsg = verifyVelocityRange(0.6).message;
if (velocityPassMsg !== 'Velocidad: 0.60 m/s (cumple 0.60–3.00 m/s)') {
    throw new Error(`Mensaje de velocidad para 0.60 inconsistente: ${velocityPassMsg}`);
}

if (!isVelocityWithinNormativeRange(0.5999999999)) {
    throw new Error('isVelocityWithinNormativeRange debe aceptar 0.5999999999 con EPS.');
}
console.log('OK inclusive velocity limits passed');

console.log('--- Test HydraulicFlowMode: IMPOSED_QIN ---');
const imposedResult = engine.analyzePressureNetwork(
    wetWell,
    { ...basePump, hydraulicFlowMode: 'IMPOSED_QIN' },
    pipe
);

const imposedQUsed = imposedResult.verifications[pipe.id].Q_operating;
assertClose(imposedQUsed, qinM3s, 1e-9, 'Q_used must equal Qin in IMPOSED_QIN');
assertClose(imposedResult.hydraulicState?.Q_hydraulic_used_Ls || 0, wetWell.inflowRate || 0, 1e-6, 'HydraulicState Q_used_Ls');
if (imposedResult.hydraulicState?.hydraulicFlowMode !== 'IMPOSED_QIN') {
    throw new Error('Expected hydraulicFlowMode=IMPOSED_QIN, got ' + imposedResult.hydraulicState?.hydraulicFlowMode);
}
if (!imposedResult.flowModeAnalysis?.design || !imposedResult.flowModeAnalysis?.operation) {
    throw new Error('flowModeAnalysis must include design and operation branches.');
}
if (!imposedResult.flowModeAnalysis.design.checks['Velocidad (Qin)']) {
    throw new Error('Design checks must include Velocidad (Qin).');
}
if (!imposedResult.flowModeAnalysis.operation.checks['Velocidad (Q*)']) {
    throw new Error('Operation checks must include Velocidad (Q*).');
}
if (!imposedResult.flowModeAnalysis.meta.hasPump) {
    throw new Error('flowModeAnalysis.meta.hasPump must be true for pressure engine.');
}
console.log('OK IMPOSED_QIN consistency passed');

console.log('--- Test HydraulicFlowMode: OPERATING_POINT_QSTAR ---');
const qStarResult = engine.analyzePressureNetwork(
    wetWell,
    { ...basePump, hydraulicFlowMode: 'OPERATING_POINT_QSTAR' },
    pipe
);

const qStar = qStarResult.operatingPoint.Q;
const qStarUsed = qStarResult.verifications[pipe.id].Q_operating;
assertClose(qStarUsed, qStar, 1e-9, 'Q_used must equal Q* in OPERATING_POINT_QSTAR');
if (qStarResult.hydraulicState?.hydraulicFlowMode !== 'OPERATING_POINT_QSTAR') {
    throw new Error('Expected hydraulicFlowMode=OPERATING_POINT_QSTAR, got ' + qStarResult.hydraulicState?.hydraulicFlowMode);
}

if (Math.abs(qStar - qinM3s) < 1e-7) {
    throw new Error('Test setup invalid: Q* should differ from Qin for this case.');
}

console.log('OK OPERATING_POINT_QSTAR consistency passed');

console.log('--- Test CAJA 1 velocity at boundary v=0.60 ---');
const qBoundaryLs = 3;
const qBoundaryM3s = toM3s(qBoundaryLs, 'L/s');
const diameterForV06_m = Math.sqrt((4 * qBoundaryM3s) / (Math.PI * 0.6));

const pipeBoundary: PressurePipe = {
    ...pipe,
    id: 'pipe-mode-test-v06',
    diameter: diameterForV06_m * 1000,
    length: 500,
    z_start: 100,
    z_end: 110
};

const pumpBoundary: Pump = {
    ...basePump,
    id: 'pump-mode-test-v06',
    point0: { Q: 0, H: 32 },
    pointNom: { Q: qBoundaryM3s, H: 26 },
    pointMax: { Q: qBoundaryM3s * 2, H: 20 },
    Qnom: qBoundaryM3s,
    Hnom: 26,
    hydraulicFlowMode: 'IMPOSED_QIN'
};

const boundaryResult = engine.analyzePressureNetwork(
    { ...wetWell, inflowRate: qBoundaryLs, safetyMarginRequirement: 15 },
    pumpBoundary,
    pipeBoundary
);

const boundaryCheck = boundaryResult.flowModeAnalysis?.design.checks['Velocidad (Qin)'];
if (!boundaryCheck) {
    throw new Error('No se encontró check Velocidad (Qin) en escenario frontera v=0.60.');
}

if (!boundaryCheck.ok) {
    throw new Error(`CAJA 1 debe cumplir para v≈0.60. Valor=${boundaryCheck.value.toFixed(10)}, target=${boundaryCheck.target}`);
}
console.log('OK CAJA 1 boundary velocity passed');

console.log('--- Test end pressure atmospheric condition ---');
const atmosphericEnd = evaluateEndPressureStatus(0, true, 1e-6, 0.5);
if (atmosphericEnd.status !== 'ok') {
    throw new Error(`Atmospheric discharge at ~0 bar should be OK. Got status=${atmosphericEnd.status}, msg=${atmosphericEnd.message}`);
}

const negativeEnd = evaluateEndPressureStatus(-0.01, false, 1e-6, 0.5);
if (negativeEnd.status !== 'critical') {
    throw new Error(`Negative end pressure should be critical. Got status=${negativeEnd.status}, msg=${negativeEnd.message}`);
}
console.log('OK end pressure condition checks passed');

console.log('--- Test loss ratio warning criterion ---');
if (!shouldWarnHighLosses(62.3, 50)) {
    throw new Error('Loss ratio 62.3% should trigger high-loss warning for threshold 50%.');
}
if (shouldWarnHighLosses(42.0, 50)) {
    throw new Error('Loss ratio 42.0% should not trigger high-loss warning for threshold 50%.');
}
console.log('OK loss ratio warning criterion passed');

console.log('--- Test BEP-based smaller pump recommendation ---');
const qRatio = calculateBepFlowRatio(2.1, 3.5); // 60%
if (!shouldRecommendSmallerPumpByBep(qRatio, 0.7)) {
    throw new Error(`Expected smaller-pump recommendation for Q*/Q_BEP=${qRatio}.`);
}

const qRatioOk = calculateBepFlowRatio(3.0, 3.5); // 85.7%
if (shouldRecommendSmallerPumpByBep(qRatioOk, 0.7)) {
    throw new Error(`Did not expect smaller-pump recommendation for Q*/Q_BEP=${qRatioOk}.`);
}
console.log('OK BEP recommendation criterion passed');
