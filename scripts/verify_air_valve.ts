
import {
    WetWell,
    Pump,
    PressurePipe,
    PressureResults,
    PressureJunction
} from '../hydraulics/types';
import { analyzePressureSystem } from '../hydraulics/pressureEngine';

// Mock Data
const wetWell: WetWell = {
    id: 'WW-1',
    CR: 0,
    CT: 5,
    CL: 2, // Reference Z = 2m
    CI: 1,
    Nmin: 1.5,
    Noff: 3,
    N1on: 4,
    Nalarm: 4.5,
    x: 0, y: 0
};

// Case 1: Negative Pressure Scenario (Pump Shutoff < Static Head)
// Pump Max Head = 30m
// Discharge Elev = 40m (Static Head = 38m)
// Expect P < 0 without valve, P = 0 with valve.
const pumpWeak: Pump = {
    id: 'P-Weak',
    curveMode: '3_POINTS',
    point0: { Q: 0, H: 30 },   // Shutoff 30m
    pointNom: { Q: 0.015, H: 25 },
    pointMax: { Q: 0.030, H: 10 },
    Qnom: 0.015,
    Hnom: 25,
    PN_usuario: 10,
    wetWellId: 'WW-1',
    dischargeLineId: 'Pipe-1',
    x: 0, y: 0
};

// Case 2: Positive Pressure Scenario
// Pump Max Head = 60m
// Discharge Elev = 40m
// Expect P > 0
const pumpStrong: Pump = {
    id: 'P-Strong',
    curveMode: '3_POINTS',
    point0: { Q: 0, H: 60 },   // Shutoff 60m
    pointNom: { Q: 0.015, H: 50 },
    pointMax: { Q: 0.030, H: 40 },
    Qnom: 0.015,
    Hnom: 50,
    PN_usuario: 10,
    wetWellId: 'WW-1',
    dischargeLineId: 'Pipe-1',
    x: 0, y: 0
};

const pipe: PressurePipe = {
    id: 'Pipe-1',
    length: 1000,
    diameter: 110, // mm
    material: 'PVC',
    PN: 10,
    z_start: 2,    // WetWell CL
    z_end: 42,     // 40m elevation + 2m base? No, absolute Z = 42
    x1: 0, y1: 0, x2: 100, y2: 0,
    kFactors: []
};

// Node Definition with Air Valve
const airValveNode: PressureJunction = {
    id: 'AV-1',
    boundaryType: 'INTERNAL', // Normal continuity node
    elevation: 42,
    x: 100, y: 0,
    hasAirValve: true,
    airValveType: 'triple'
};

// Node with Air Valve and positive pressure (Fixed Head at 50m)
const fixedHeadNode: PressureJunction = {
    id: 'AV-Pos',
    boundaryType: 'FIXED_HEAD',
    elevation: 42,
    fixedHead: 52, // 10m above node
    x: 100, y: 0,
    hasAirValve: true,
    airValveType: 'triple'
};

// Node without Air Valve (Control)
const normalNode: PressureJunction = {
    id: 'Node-1',
    boundaryType: 'INTERNAL',
    elevation: 42,
    x: 100, y: 0,
    hasAirValve: false
};

console.log("=== Testing Air Valve Logic ===");

function runTest(testName: string, pump: Pump, node: PressureJunction, expectedState: string | undefined, expectedPressure: 'ZERO' | 'NEGATIVE' | 'POSITIVE') {
    console.log(`\nRunning: ${testName}`);

    // We modify the PressureEngine to accept destinationNode
    const result = analyzePressureSystem(wetWell, pump, pipe, 'HAZEN_WILLIAMS'); // This helper doesn't take destinationNode...

    // Need to access the engine class or modify the helper. 
    // Wait, analyzePressureSystem is just a wrapper.
    // I should instantiate PressureEngine directly.

    console.log(`[DEBUG] Loading PressureEngine from: ${require.resolve('../hydraulics/pressureEngine')}`);
    const { PressureEngine } = require('../hydraulics/pressureEngine');
    const engine = new PressureEngine();
    const res: PressureResults = engine.analyzePressureNetwork(wetWell, pump, pipe, 'HAZEN_WILLIAMS', node);

    const lastPt = res.verifications[pipe.id].pressurePoints.pop();
    if (!lastPt) {
        console.error("❌ No pressure points found");
        return;
    }

    const pressure = lastPt.pressure;
    const airState = node.airState;

    console.log(`  Pressure: ${pressure.toFixed(6)} bar`);
    console.log(`  Head (HGL): ${lastPt.head.toFixed(4)} m`);
    console.log(`  Elevation (Z): ${lastPt.elevation.toFixed(4)} m`);
    console.log(`  Diff (HGL - Z): ${(lastPt.head - lastPt.elevation).toFixed(6)} m`);
    console.log(`  Air State: ${airState}`);

    // Verification
    let pCheck = false;
    if (expectedPressure === 'ZERO') pCheck = Math.abs(pressure) < 0.001;
    if (expectedPressure === 'NEGATIVE') pCheck = pressure < -0.001;
    if (expectedPressure === 'POSITIVE') pCheck = pressure > 0.001;

    let sCheck = airState === expectedState;

    if (pCheck && sCheck) {
        console.log("✅ PASSED");
    } else {
        console.error(`❌ FAILED. Expected P=${expectedPressure}, State=${expectedState}`);
    }
}

// 1. Weak Pump + NO Air Valve -> Should be NEGATIVE
runTest('Weak Pump - No Valve', pumpWeak, normalNode, undefined, 'NEGATIVE');

// 2. Weak Pump + Air Valve -> Should be ZERO (Air Intake)
runTest('Weak Pump - With Valve', pumpWeak, airValveNode, 'air_intake', 'ZERO');

// 3. Strong Pump + Air Valve + Fixed Head -> Should be POSITIVE (Closed)
runTest('Strong Pump - With Valve & High Head', pumpStrong, fixedHeadNode, 'closed', 'POSITIVE');
