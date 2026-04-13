import { verifyPipe } from '../hydraulics/verificationEngine';
import { Conduit } from '../hydraulics/types';

async function runTest() {
    console.log("=== PRUEBA DE CONSISTENCIA TOTAL: UEH=0 + FALLOS NORMATIVOS ===");

    const tests = [
        {
            name: "Caso A: Longitud Excedida (UEH 0, Slope OK, Length 80m)",
            conduit: {
                id: 'CONS_A',
                from: 'C1',
                to: 'C2',
                diameter: 0.110,
                slope: 0.03,         // 3% (OK)
                uehTransported: 0,
                material: 'PVC',
                roughness_n: 0.010,
                length: 80.0          // 80m (Exceeds 30m for DN 110)
            } as Conduit
        },
        {
            name: "Caso B: Pendiente Insuficiente (UEH 0, Slope 0.8%, Length 10m)",
            conduit: {
                id: 'CONS_B',
                from: 'C3',
                to: 'C4',
                diameter: 0.200,      // DN 200
                slope: 0.008,         // 0.8% (Below 1% min)
                uehTransported: 0,
                material: 'PVC',
                roughness_n: 0.010,
                length: 10.0          // OK
            } as Conduit
        }
    ];

    for (const test of tests) {
        console.log(`\nProbando: ${test.name}`);
        const result = verifyPipe(test.conduit, 'UEH_MANNING');

        console.log(`Status Resultante: ${result.status} ${result.status === 'NO_CONFORME' ? '✅ (OK)' : '❌ (Falla Consistencia)'}`);
        console.log(`Justificación: ${result.justification}`);
        console.log(`Violaciones:`, result.uehResult.violations);

        if (result.status !== 'NO_CONFORME') {
            console.error(`ERROR: El tramo debería ser NO_CONFORME por incumplimiento normativo.`);
        }
    }
}

runTest().catch(err => {
    console.error("Error al ejecutar test:", err);
});
