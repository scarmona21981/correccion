
import { PressureEngine } from '../hydraulics/pressureEngine';
import { PressureJunction, PressurePipe, Pump, WetWell } from '../hydraulics/types';

async function verifyProfilePoints() {
    console.log("Verifying Profile Points Calculation...");

    const engine = new PressureEngine();

    // 1. Setup Data
    const wetWell: WetWell = {
        id: 'ww-1',
        name: 'Cárcamo',
        x: 0, y: 0,
        CR: 10,
        CT: 12,
        CL: 10,
        CI: 10,
        Nmin: 8, Noff: 9, N1on: 10, Nalarm: 10.5
    };

    const pump: Pump = {
        id: 'p-1',
        name: 'Bomba',
        x: 0, y: 0,
        curveMode: 'TABLE',
        curveTable: [
            { Q: 0, H: 50 },
            { Q: 0.05, H: 45 },
            { Q: 0.1, H: 30 }
        ],
        Qnom: 0.05,
        Hnom: 45,
        PN_usuario: 10,
        wetWellId: 'ww-1',
        dischargeLineId: 'pipe-1'
    };

    const pipe: PressurePipe = {
        id: 'pipe-1',
        length: 1000,
        diameter: 200,
        material: 'PVC',
        C_hazen: 140,
        z_start: 10,
        z_end: 20,
        kFactors: [],
        PN: 10,
        x1: 0, y1: 0, x2: 1000, y2: 0,
        profilePoints: [
            { chainage: 250, elevation: 15 },
            { chainage: 500, elevation: 45 }, // EXTREME High point -> Should trigger Air Intake
            { chainage: 750, elevation: 12 }
        ]
    };

    const node: PressureJunction = {
        id: 'node-1',
        boundaryType: 'ATMOSPHERIC',
        elevation: 20,
        x: 1000, y: 0
    };

    // 2. Run Analysis
    const results = engine.analyzePressureNetwork(wetWell, pump, pipe, 'HAZEN_WILLIAMS', node);

    // 3. Verify Points
    const verification = results.verifications['pipe-1'];
    if (!verification) {
        console.error("FAILED: No verification results for pipe-1");
        process.exit(1);
    }

    console.log("\nPressure Profile Points:");
    verification.pressurePoints.forEach(p => {
        const chainage = p.chainage ?? 0;
        console.log(`- ${p.location.padEnd(20)} | Chain: ${chainage.toString().padStart(4)}m | Elev: ${p.elevation.toFixed(1)}m | HGL: ${p.head.toFixed(2)}m | P: ${p.pressure.toFixed(2)} bar | Status: ${p.status}`);
    });

    // Check chainages
    const chainages = verification.pressurePoints.map(p => p.chainage ?? 0);
    const expectedChainages = [0, 0, 250, 500, 750, 1000];
    const chainagesOk = expectedChainages.every(d => chainages.includes(d));

    if (chainagesOk) {
        console.log("\nSUCCESS: All expected chainages found in results.");
    } else {
        console.error("\nFAILED: Some chainages missing. Found:", chainages);
        process.exit(1);
    }

    // Check Diagnostic at 500m (High point)
    const midPoint = verification.pressurePoints.find(p => (p.chainage ?? -1) === 500);
    if (midPoint && midPoint.status === 'Zona con ingreso de aire') {
        console.log("SUCCESS: High point correctly flagged as 'Zona con ingreso de aire'.");
    } else {
        console.error("FAILED: High point diagnostic incorrect. Found:", midPoint?.status);
        process.exit(1);
    }

    const endPoint = verification.pressurePoints[verification.pressurePoints.length - 1];
    if (Math.abs((endPoint?.pressure || 0) - 0) > 1e-4) {
        console.error('FAILED: Descarga atmosférica debe terminar en P=0 bar.');
        process.exit(1);
    }

    const hasEndLowPressureViolation = verification.violations.some(v =>
        v.toLowerCase().includes('presión bajo mínimo')
        && v.toLowerCase().includes((endPoint?.location || '').toLowerCase())
    );

    if (hasEndLowPressureViolation) {
        console.error('FAILED: No debe fallar mínimo de presión en punto final atmosférico.');
        process.exit(1);
    }

    console.log('SUCCESS: Descarga atmosférica con P final=0 bar no gatilla falla por mínimo.');
}

verifyProfilePoints().catch(console.error);
