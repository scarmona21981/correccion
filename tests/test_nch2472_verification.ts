import { calculateNchVerification } from '../hydraulics/pressureModule';
import { HydraulicState, Pump, WetWell } from '../hydraulics/types';

const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
};

const assertEqual = <T>(value: T, expected: T, message: string) => {
    if (value !== expected) {
        throw new Error(message + '. Esperado=' + String(expected) + ', obtenido=' + String(value));
    }
};

const getCheckStatus = (result: ReturnType<typeof calculateNchVerification>, id: string) => {
    const check = result.checks?.find(item => item.id === id);
    if (!check) throw new Error('No se encontro check ' + id);
    return check.status;
};

const baseWetWell: WetWell = {
    id: 'ww-nch2472',
    x: 0,
    y: 0,
    CR: 99,
    CT: 105,
    CL: 101,
    CI: 100,
    Nmin: 100,
    Noff: 101.5,
    N1on: 102,
    Nalarm: 104,
    geometryType: 'circular',
    diameter: 2,
    inflowRate: 3,
    safetyMarginRequirement: 15,
    submergenceRequirement: 0.5
};

const basePump: Pump = {
    id: 'pump-nch2472',
    x: 0,
    y: 0,
    curveMode: '3_POINTS',
    point0: { Q: 0, H: 30 },
    pointNom: { Q: 0.009, H: 24 },
    pointMax: { Q: 0.018, H: 16 },
    Qnom: 0.009,
    Hnom: 24,
    PN_usuario: 10,
    wetWellId: 'ww-nch2472',
    dischargeLineId: 'pp-nch2472',
    pumpCount: 2
};

const baseHydraulicState: HydraulicState = {
    hydraulicFlowMode: 'OPERATING_POINT_QSTAR',
    Q_medio_sanitario_Ls: 3,
    Qb_real_Ls: 7,
    Q_hydraulic_used_Ls: 4,
    Q_neto_Ls: 4,
    H_required_m: 20,
    H_pump_available_m: 24,
    H_hydraulic_used_m: 22,
    margin: 20,
    velocity_ms: 0.63,
    hydraulicVelocityFlow_Ls: 4,
    impulsionDiameter_m: 0.09,
    blockageError: false
};

console.log('--- Test NCh2472 Caso 1: todo cumple ---');
const case1 = calculateNchVerification(baseWetWell, basePump, baseHydraulicState);
assertEqual(case1.overallStatus, 'COMPLIANT', 'Caso 1 debe ser COMPLIANT');
assertEqual(case1.checks?.length, 7, 'Caso 1 debe tener 7 checks');
assert(case1.checks?.every(check => check.status === 'PASS'), 'Caso 1: todos los checks deben estar en PASS');

console.log('--- Test NCh2472 Caso 2: falla TR ---');
const case2 = calculateNchVerification(
    { ...baseWetWell, Noff: 103 },
    basePump,
    baseHydraulicState
);
assertEqual(case2.overallStatus, 'NON_COMPLIANT', 'Caso 2 debe ser NON_COMPLIANT');
assertEqual(getCheckStatus(case2, 'NCH2472_TR_MAX_30'), 'FAIL', 'Caso 2: TR debe fallar');

console.log('--- Test NCh2472 Caso 3: falla sumergencia con normativos OK ---');
const case3 = calculateNchVerification(
    { ...baseWetWell, Nmin: 99.3, Noff: 100.8 },
    basePump,
    baseHydraulicState
);
assertEqual(case3.overallStatus, 'PARTIAL', 'Caso 3 debe ser PARTIAL');
assertEqual(getCheckStatus(case3, 'NCH2472_SUBMERGENCE_MIN'), 'FAIL', 'Caso 3: sumergencia debe fallar');
assert(
    ['NCH2472_TR_MAX_30', 'NCH2472_TC_MIN_10', 'NCH2472_USEFUL_VOLUME_MIN', 'NCH2472_IMPULSION_VELOCITY_RANGE', 'NCH2472_MIN_PUMP_COUNT_2']
        .every(id => getCheckStatus(case3, id) === 'PASS'),
    'Caso 3: todos los checks normativos deben estar en PASS'
);

console.log('--- Test NCh2472 Caso 4: datos insuficientes en velocidad ---');
const case4 = calculateNchVerification(
    baseWetWell,
    basePump,
    {
        ...baseHydraulicState,
        Q_hydraulic_used_Ls: Number.NaN,
        hydraulicVelocityFlow_Ls: Number.NaN,
        impulsionDiameter_m: undefined,
        velocity_ms: Number.NaN
    }
);
const case4VelocityStatus = getCheckStatus(case4, 'NCH2472_IMPULSION_VELOCITY_RANGE');
assert(
    case4VelocityStatus === 'NA' || case4VelocityStatus === 'WARN',
    'Caso 4: velocidad debe quedar en NA/WARN por falta de datos'
);
assert(case4.overallStatus !== 'COMPLIANT', 'Caso 4 no puede quedar COMPLIANT');

console.log('OK: verificacion NCh2472 (7 puntos) validada');
