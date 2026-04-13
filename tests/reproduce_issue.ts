import { verifyPipes } from '../hydraulics/verificationEngine';
import { Conduit } from '../hydraulics/types';

// Reproduction Test for Private Network Classification
// Scenario: A -> B -> C
// Pipe 1: A -> B (NACIENTE / Initial)
// Pipe 2: B -> C (COLECTOR / Non-Initial)

const pipes: Conduit[] = [
    {
        id: 'pipe1',
        from: 'chamberA',
        to: 'chamberB',
        diameter: 0.175, // 175mm -> Normative 175
        nominalDiameter: 0.175,
        slope: 0.01, // 1.0% (OK for initial)
        length: 20,
        uehTransported: 10,
        material: 'PVC',
        roughness_n: 0.010
    },
    {
        id: 'pipe2',
        from: 'chamberB',
        to: 'chamberC',
        diameter: 0.175, // 175mm
        nominalDiameter: 0.175,
        slope: 0.005, // 0.5% (Fail for 3371 generic, OK for 1105 Non-Initial)
        length: 20,
        // Assuming accumulated UEH from previous pipe
        uehTransported: 20,
        material: 'PVC',
        roughness_n: 0.010,
        // Crucial: This pipe has upstream input effectively because pipe1 feeds into B
    }
];

const result = verifyPipes(pipes, 'UEH_MANNING');

console.log("--- Reproduction Test Results ---");
console.log("Pipe 1 (Initial) Status:", result.results['pipe1'].status);
console.log("Pipe 1 Min Slope Violations:", result.results['pipe1'].uehResult.violations);

console.log("Pipe 2 (Non-Initial) Status:", result.results['pipe2'].status);
console.log("Pipe 2 Min Slope Violations:", result.results['pipe2'].uehResult.violations);

// Expected Current Behavior: Pipe 2 Fails because UEH defaults to 1% min slope.
// Desired Behavior (implied): Pipe 2 MIGHT pass or at least identify as Non-Initial if using NCh 1105 logic.
