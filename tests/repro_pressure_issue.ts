
import { PressureEngine } from '../hydraulics/pressureEngine';
import { Pump, WetWell, PressurePipe } from '../hydraulics/types';

const assertBetween = (value: number, min: number, max: number, label: string) => {
    if (value < min || value > max) {
        throw new Error(`${label}: expected between ${min} and ${max}, got ${value.toFixed(3)}`);
    }
};

// Mock Data with HIGH ELEVATION (e.g. 2000m)
const highElevation = 2000;

const mockWetWell: WetWell = {
    id: 'well-1',
    x: 0, y: 0,
    CR: highElevation,       // 2000m
    CT: highElevation + 5,   // 2005m
    CL: highElevation + 2,   // 2002m - Water Level
    CI: highElevation + 1,
    Nmin: highElevation + 0.5,
    Noff: highElevation + 1.5,
    N1on: highElevation + 2.5,
    Nalarm: highElevation + 4,
};

const mockPump: Pump = {
    id: 'pump-1',
    x: 10, y: 10,
    curveMode: '3_POINTS',
    Qnom: 0.050, // 50 L/s
    Hnom: 30,    // 30m Head
    PN_usuario: 10,
    wetWellId: 'well-1',
    dischargeLineId: 'pipe-1',
    point0: { Q: 0, H: 40 },
    pointNom: { Q: 0.050, H: 30 },
    pointMax: { Q: 0.100, H: 10 },
};

const mockPipe: PressurePipe = {
    id: 'pipe-1',
    x1: 10, y1: 10,
    x2: 100, y2: 100,
    length: 1000,
    diameter: 200, // mm
    material: 'PVC',
    PN: 10,
    z_start: highElevation + 2, // 2002m
    z_end: highElevation + 20,  // 2020m (18m static head)
    kFactors: [],
    C_hazen: 140
};

const fs = require('fs');
let output = '';
const log = (msg: string) => { console.log(msg); output += msg + '\n'; };

log(`Running Pressure Analysis at Elevation ~${highElevation}m...`);
const engine = new PressureEngine();
const result = engine.analyzePressureNetwork(mockWetWell, mockPump, mockPipe);

log('--- Results ---');
log(`Operating Flow: ${(result.operatingPoint.Q * 1000).toFixed(2)} L/s`);
log(`Operating Head (TDH): ${result.operatingPoint.H.toFixed(2)} m`);
log(`Static Head: ${result.verifications['pipe-1'].H_static.toFixed(2)} m`);

log('\n--- Pressure Profile ---');
result.verifications['pipe-1'].pressurePoints.forEach(p => {
    log(`${p.location}: Elevation=${p.elevation.toFixed(2)}m, Head=${p.head.toFixed(2)}m, Pressure=${p.pressure.toFixed(2)} bar`);
});

const firstPoint = result.verifications['pipe-1'].pressurePoints[0];
if (firstPoint.pressure < -10) {
    log('\n[FAIL] DETECTED BUG: Massive negative pressure.');
} else {
    log('\n[PASS] Pressure looks reasonable.');
}

// -----------------------------------------------------------------------------
// Additional regression: expected required head around 17 m at Q = 180 L/min
// -----------------------------------------------------------------------------

const wetWell180: WetWell = {
    id: 'well-180',
    x: 0, y: 0,
    CR: 95,
    CT: 102,
    CL: 100,
    CI: 96,
    Nmin: 96,
    Noff: 97,
    N1on: 100,
    Nalarm: 101.5,
    inflowRate: 3 // L/s = 180 L/min
};

const pump180: Pump = {
    id: 'pump-180',
    x: 0, y: 0,
    curveMode: '3_POINTS',
    Qnom: 0.003,
    Hnom: 20,
    PN_usuario: 10,
    wetWellId: 'well-180',
    dischargeLineId: 'pipe-180',
    hydraulicFlowMode: 'IMPOSED_QIN',
    point0: { Q: 0, H: 25 },
    pointNom: { Q: 0.003, H: 20 },
    pointMax: { Q: 0.006, H: 12 }
};

const pipe180: PressurePipe = {
    id: 'pipe-180',
    x1: 0, y1: 0,
    x2: 10, y2: 10,
    length: 1800,
    diameter: 110,
    material: 'PVC',
    PN: 10,
    z_start: 100,
    z_end: 115,
    kFactors: [],
    C_hazen: 140
};

const result180 = engine.analyzePressureNetwork(wetWell180, pump180, pipe180);
const verification180 = result180.verifications['pipe-180'];
const requiredHead180 = verification180.H_static + verification180.h_friction + verification180.h_singular;
const qUsed180Lmin = (result180.hydraulicState?.Q_hydraulic_used_Ls || 0) * 60;

log('\n--- Regression Q=180 L/min ---');
log(`Flow used: ${qUsed180Lmin.toFixed(1)} L/min`);
log(`Required head (static+losses): ${requiredHead180.toFixed(2)} m`);
assertBetween(requiredHead180, 16.0, 18.0, 'Required head at 180 L/min');
log('[PASS] Required head near 17 m at 180 L/min.');

const npshPump: Pump = {
    ...mockPump,
    npshRequired_m: 9,
    npshMargin_m: 0.5,
    environmentalConditions: {
        mode: 'AUTO',
        altitude_m: 3200,
        waterTemperature_C: 30
    }
};

const npshResult = engine.analyzePressureNetwork(mockWetWell, npshPump, mockPipe);
const npshStatus = npshResult.npsh;

if (!npshStatus || npshStatus.compliant) {
    throw new Error('NPSH debía fallar en condición exigente de altitud/temperatura.');
}

log(`[PASS] NPSH fail detectado: ${npshStatus.message}`);

fs.writeFileSync('repro_output.txt', output);
