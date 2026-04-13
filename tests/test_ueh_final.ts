import { verifyPipe } from '../hydraulics/verificationEngine';
import { Conduit } from '../hydraulics/types';

async function runTests() {
    console.log("=== VERIFICACIÓN FINAL UEH / NCh 3371 / NCh 1105 ===");

    const tests = [
        {
            name: "Caso Base: DN 110, S 3%, UEH 10 (Dentro de tabla)",
            conduit: {
                id: 'T1',
                diameter: 0.110,
                slope: 0.03,
                uehTransported: 10,
                material: 'PVC',
                length: 10
            } as Conduit
        },
        {
            name: "Caso Límite: DN 110, S 0.5% (Fuera de tabla, bajo min) -> Fallback Manning",
            conduit: {
                id: 'T2',
                diameter: 0.110,
                slope: 0.005,
                uehTransported: 10,
                material: 'PVC',
                length: 10
            } as Conduit
        },
        {
            name: "Caso Excedido: DN 110, S 3%, UEH 100 (Excede 60) -> Fallback Manning",
            conduit: {
                id: 'T3',
                diameter: 0.110,
                slope: 0.03,
                uehTransported: 100,
                material: 'PVC',
                length: 10
            } as Conduit
        },
        {
            name: "Caso Pendiente Alta: DN 110, S 20% -> Control Velocidad (NCh 1105)",
            conduit: {
                id: 'T4',
                diameter: 0.110,
                slope: 0.20,
                uehTransported: 20,
                material: 'PVC',
                length: 10
            } as Conduit
        }
    ];

    for (const test of tests) {
        console.log(`\nProbando: ${test.name}`);
        const result = verifyPipe(test.conduit, 'UEH_MANNING');
        console.log(`Status: ${result.status}`);
        console.log(`Referencia: ${result.normativeReference}`);
        console.log(`Modalidad: ${result.manningModeLabel || 'UEH Estándar'}`);
        console.log(`Justificación: ${result.justification}`);
        if (result.manningExecuted) {
            console.log(`Manning: V=${result.manningResult?.velocity.toFixed(2)}m/s, h/D=${result.manningResult?.fillPercentage.toFixed(1)}%`);
        }
    }
}

runTests();
