
import { analyzePressureSystem } from '../hydraulics/pressureEngine';
import { Pump, WetWell, PressurePipe } from '../hydraulics/types';

// Mock Data
const wetWell: WetWell = {
    id: 'well-1',
    x: 0, y: 0,
    CR: 0,
    CT: 10,
    CL: 5, // Water Level at 5m
    CI: 0,
    Nmin: 1,
    Noff: 2,
    N1on: 4,
    Nalarm: 9,
    diameter: 2
};

const pump: Pump = {
    id: 'pump-1',
    x: 0, y: 0,
    curveMode: '3_POINTS',
    Qnom: 0.05, // 50 l/s
    Hnom: 30, // 30m
    maxStartsPerHour: 10,
    minRunTime: 5,
    maxRunTime: 30,
    PN_usuario: 10,
    wetWellId: 'well-1',
    dischargeLineId: 'pipe-1',
    point0: { Q: 0, H: 40 },
    pointNom: { Q: 0.05, H: 30 },
    pointMax: { Q: 0.1, H: 10 },
    hydraulicFlowMode: 'OPERATING_POINT_QSTAR'
};

const pipe: PressurePipe = {
    id: 'pipe-1',
    x1: 0, y1: 0,
    x2: 100, y2: 0,
    startNodeId: 'well-1',
    endNodeId: 'out-1',
    length: 1000,
    diameter: 200, // 200mm
    material: 'HDPE',
    PN: 10,
    z_start: 0, // Relative to pump suction (0)
    z_end: 20, // Discharge at +20m relative to suction (Static Head = 20m)
    kFactors: [],
    C_hazen: 140
};

console.log("---------------------------------------------------------");
console.log("VERIFYING NUMERICAL OPERATING POINT SOLVER");
console.log("---------------------------------------------------------");

try {
    const results = analyzePressureSystem(wetWell, pump, pipe);
    const { Q, H } = results.operatingPoint;
    const hydraulicState = results.hydraulicState;

    const qinLs = hydraulicState?.Q_medio_sanitario_Ls ?? (wetWell.inflowRate || 0);
    const qStarLs = hydraulicState?.Qb_real_Ls ?? (Q * 1000);
    const qUsedLs = hydraulicState?.Q_hydraulic_used_Ls ?? (Q * 1000);
    const mode = hydraulicState?.hydraulicFlowMode || results.hydraulicFlowMode || 'OPERATING_POINT_QSTAR';

    console.log(`Operating Point Found:`);
    console.log(`Qin     = ${qinLs.toFixed(2)} l/s`);
    console.log(`Q*      = ${qStarLs.toFixed(2)} l/s`);
    console.log(`Q_used  = ${qUsedLs.toFixed(2)} l/s`);
    console.log(`Mode    = ${mode}`);
    console.log(`H*      = ${H.toFixed(2)} m`);

    // Verify Force Balance: H_pump = H_system
    // H_system = H_static + Friction + Minor

    // Calculate static head with same datum used by the engine.
    // Engine uses N1on as hydraulic reference when available, else CL.
    const zRef = Number.isFinite(wetWell.N1on) ? wetWell.N1on : wetWell.CL;
    const H_static = pipe.z_end - zRef;

    // Calculate expected friction (Hazen-Williams) manually
    // hf = 10.67 * L * Q^1.852 / (C^1.852 * D^4.87)
    const C = 140;
    const D = 0.2;
    const L = 1000;
    const hf = 10.67 * L * Math.pow(Q, 1.852) / (Math.pow(C, 1.852) * Math.pow(D, 4.87));

    // H_system calculated manually
    const H_system_calc = H_static + hf;

    console.log(`\nVerification:`);
    console.log(`H_pump(Q*) Solver = ${H.toFixed(4)} m`);
    console.log(`H_system (Manual) = ${H_system_calc.toFixed(4)} m`);

    const diff = Math.abs(H - H_system_calc);
    console.log(`Difference        = ${diff.toFixed(6)} m`);

    if (diff < 0.05) {
        console.log("\n✅ SUCCESS: Operating point satisfies hydraulic equation.");
    } else {
        console.error("\n❌ FAILURE: Significant discrepancy in energy balance.");
        process.exit(1);
    }

    const strictPump: Pump = {
        ...pump,
        operatingLimits: {
            mode: 'STRICT',
            qMin_Lps: qStarLs + 1
        }
    };
    const strictResults = analyzePressureSystem(wetWell, strictPump, pipe);
    const strictVerification = strictResults.verifications[pipe.id];
    if (strictVerification.status !== 'NO_CONFORME') {
        throw new Error('STRICT debía marcar NO_CONFORME por Q* fuera de rango.');
    }

    const clampPump: Pump = {
        ...pump,
        operatingLimits: {
            mode: 'CLAMP',
            qMin_Lps: qStarLs + 1
        }
    };
    const clampResults = analyzePressureSystem(wetWell, clampPump, pipe);
    const clampVerification = clampResults.verifications[pipe.id];
    const qExpectedLps = (clampPump.operatingLimits?.qMin_Lps as number);
    const qUsedLps = clampVerification.Q_operating * 1000;

    if (!clampResults.flowControl?.clamped) {
        throw new Error('CLAMP debía aplicarse cuando Q* queda bajo Qmin.');
    }
    if (Math.abs(qUsedLps - qExpectedLps) > 1e-6) {
        throw new Error(`CLAMP no aplicó Qop correcto. Esperado=${qExpectedLps}, obtenido=${qUsedLps}`);
    }
    console.log('✅ SUCCESS: STRICT/CLAMP de límites de caudal verificados.');

} catch (error) {
    console.error("\n❌ ERROR:", error);
    process.exit(1);
}
