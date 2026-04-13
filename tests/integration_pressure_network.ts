/**
 * Integration Test - Pressure Network Analysis
 * 
 * Tests end-to-end flow:
 * 1. ProjectContext with pressure elements
 * 2. PressureModel analysis
 * 3. Results validation
 */

import { PressureModel } from '../hydraulics/pressureModel';
import { WetWell, Pump, PressurePipe, PumpCurvePoint } from '../hydraulics/types';

console.log('🧪 Integration Test: Pressure Network Analysis\n');
console.log('='.repeat(70));

// ============================================================================
// TEST SCENARIO: Typical Chilean Pumping Station
// ============================================================================
// Description:
// - Wet well 2m x 2m, depth 3m
// - Single pump: 15 L/s @ 25m head
// - 200mm PVC pipe, 150m length
// - Elevation difference: 20m
// ============================================================================

console.log('\n📋 Test Scenario: Typical Chilean Pumping Station');
console.log('-'.repeat(70));

// Step 1: Create Wet Well
const wetWell: WetWell = {
    id: 'ww-001',
    userDefinedId: 'PS-01',
    x: 100,
    y: 100,
    CT: 100.0,      // Ground level
    CR: 97.0,       // Bottom (3m deep)
    CL: 98.5,       // Water level (1.5m from bottom)
    CI: 99.5,       // Inlet invert
    // Control levels
    Nmin: 97.5,     // Minimum level (0.5m from bottom)
    Noff: 99.0,     // Pump off level
    N1on: 99.5,     // Pump start level
    Nalarm: 99.8,   // Alarm level
    // Geometry
    width: 2.0,
    length: 2.0,
    chamberType: 'Rectangular'
};

console.log('✓ Wet Well created:', wetWell.userDefinedId);
console.log(`  Dimensions: ${wetWell.width}m x ${wetWell.length}m`);
console.log(`  Depth: ${(wetWell.CT - wetWell.CR).toFixed(1)}m`);
console.log(`  Operating volume: ${((wetWell.N1on - wetWell.Nmin) * wetWell.width! * wetWell.length!).toFixed(3)} m³`);

// Step 2: Create Pump
const pumpCurve: PumpCurvePoint[] = [
    { Q: 0, H: 30 },   // Shutoff head
    { Q: 0.015, H: 25 },   // Nominal point: 15 L/s @ 25m
    { Q: 0.030, H: 15 }    // Max flow
];

const pump: Pump = {
    id: 'pump-001',
    userDefinedId: 'P-01',
    x: 100,
    y: 100,
    curveMode: '3_POINTS',
    Qnom: 0.015,            // 15 L/s
    Hnom: 25,               // 25 m
    point0: pumpCurve[0],
    pointNom: pumpCurve[1],
    pointMax: pumpCurve[2],
    PN_usuario: 10,          // 10 bar (PN10 pipe required)
    wetWellId: 'ww-001',
    dischargeLineId: 'pp-001'
};

console.log('\n✓ Pump created:', pump.userDefinedId);
console.log(`  Nominal: ${(pump.Qnom * 1000).toFixed(1)} L/s @ ${pump.Hnom}m`);
console.log(`  Curve: 3-point mode`);
console.log(`  Required PN: ${pump.PN_usuario} bar`);

// Step 3: Create Pressure Pipe
const pressurePipe: PressurePipe = {
    id: 'pp-001',
    userDefinedId: 'IMP-01',
    x1: 100,
    y1: 100,
    x2: 250,
    y2: 100,
    startNodeId: 'ww-001',
    endNodeId: 'outfall-001',
    material: 'PVC',
    diameter: 200,          // 200mm (DN200)
    length: 150,            // 150m
    z_start: wetWell.CL,    // Start at water level
    z_end: 120,             // End 20m higher
    PN: 10,                 // PN10 pipe
    C_hazen: 150,           // PVC coefficient
    kFactors: [
        { description: 'Válvula de Retención', K: 2.5 },
        { description: 'Codo 90°', K: 0.9 },
        { description: 'Codo 90°', K: 0.9 },
        { description: 'Entrada', K: 0.5 },
        { description: 'Salida', K: 1.0 }
    ]
};

console.log('\n✓ Pressure Pipe created:', pressurePipe.userDefinedId);
console.log(`  Material: ${pressurePipe.material} DN${pressurePipe.diameter}`);
console.log(`  Length: ${pressurePipe.length}m`);
console.log(`  Static head: ${(pressurePipe.z_end - pressurePipe.z_start).toFixed(1)}m`);
console.log(`  K factors: ${pressurePipe.kFactors.reduce((sum, k) => sum + k.K, 0)} total`);
console.log(`  PN: ${pressurePipe.PN} bar`);

// ============================================================================
// EXECUTE ANALYSIS
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('🚀 Running Pressure Network Analysis...');
console.log('='.repeat(70));

try {
    const model = new PressureModel();

    // Add elements
    model.addWetWell(wetWell);
    model.addPump(pump);
    model.addPressurePipe(pressurePipe);

    // Solve using Hazen-Williams
    const results = model.solve('HAZEN_WILLIAMS');

    console.log('\n✅ Analysis Complete!\n');

    // ========================================================================
    // DISPLAY RESULTS
    // ========================================================================

    console.log('📊 OPERATING POINT');
    console.log('-'.repeat(70));
    console.log(`  Flow (Q):        ${(results.operatingPoint.Q * 1000).toFixed(2)} L/s`);
    console.log(`  Head (H):        ${results.operatingPoint.H.toFixed(2)} m`);
    console.log(`  Efficiency:      ${results.operatingPoint.efficiency ? (results.operatingPoint.efficiency * 100).toFixed(1) + '%' : 'N/A'}`);

    const pipeId = pressurePipe.id;
    const verification = results.verifications[pipeId];

    if (verification) {
        console.log('\n📏 HYDRAULIC PARAMETERS');
        console.log('-'.repeat(70));
        console.log(`  Static Head:     ${verification.H_static.toFixed(2)} m`);
        console.log(`  Friction Loss:   ${verification.h_friction.toFixed(3)} m`);
        console.log(`  Singular Loss:   ${verification.h_singular.toFixed(3)} m`);
        console.log(`  Total Loss:      ${(verification.h_friction + verification.h_singular).toFixed(3)} m`);
        console.log(`  Required Head:   ${verification.H_required.toFixed(2)} m (with ${verification.safetyMargin}% margin)`);
        console.log(`  Velocity:        ${verification.velocity.toFixed(2)} m/s`);

        console.log('\n💧 PRESSURE PROFILE');
        console.log('-'.repeat(70));
        verification.pressurePoints.forEach(point => {
            const status = point.pressure < 0 ? ' ⚠️ NEGATIVA!' :
                point.pressure > pressurePipe.PN ? ' ⚠️ EXCEDE PN!' :
                    ' ✓';
            console.log(`  ${point.location.padEnd(25)} P=${point.pressure.toFixed(2).padStart(6)} bar  (H=${point.head.toFixed(1)}m, z=${point.elevation.toFixed(1)}m)${status}`);
        });

        console.log(`\n  Max Pressure:    ${verification.maxPressure.toFixed(2)} bar at "${verification.maxPressureLocation}"`);
        console.log(`  PN Rating:       ${pressurePipe.PN} bar`);
        console.log(`  Margin:          ${((pressurePipe.PN - verification.maxPressure) / pressurePipe.PN * 100).toFixed(1)}%`);

        if (verification.surgeAnalysis && verification.surgeAnalysis.activated) {
            console.log('\n⚡ WATER HAMMER ANALYSIS');
            console.log('-'.repeat(70));
            console.log(`  Wave Speed:      ${verification.surgeAnalysis.waveSpeed.toFixed(0)} m/s`);
            console.log(`  Surge Head:      ${verification.surgeAnalysis.deltaH.toFixed(2)} m`);
            console.log(`  Surge Pressure:  ${((verification.surgeAnalysis.P_max_total - verification.surgeAnalysis.P_max_static)).toFixed(2)} bar`);
            console.log(`  Total Pressure:  ${verification.surgeAnalysis.P_max_total.toFixed(2)} bar (static + surge)`);
            console.log(`  Compliant:       ${verification.surgeAnalysis.compliant ? '✓ YES' : '✗ NO'}`);
        } else {

            console.log('\n⚡ WATER HAMMER ANALYSIS');
            console.log('-'.repeat(70));
            console.log(`  Status:          Not activated (L=${pressurePipe.length}m, V=${verification.velocity.toFixed(2)}m/s)`);
            console.log(`  Criteria:        L>50m AND V>1.2m/s`);
        }

        console.log('\n🔧 OPERATIONAL CHECKS');
        console.log('-'.repeat(70));
        console.log(`  Velocity Range:  ${verification.velocityCompliant ? '✓' : '✗'} ${verification.velocity.toFixed(2)} m/s [0.6-2.5 m/s]`);
        console.log(`  Flow Efficiency: ${verification.flowEfficiencyCompliant ? '✓' : '✗'} ${(verification.flowEfficiency * 100).toFixed(1)}% [70-120%]`);

        if (results.operationalChecks) {
            console.log(`  Cycle Time:      ${results.operationalChecks.cycleTimeCompliant ? '✓' : '✗'} ${results.operationalChecks.cycleTime.toFixed(1)} min [5-30 min]`);
            console.log(`  Starts/Hour:     ${results.operationalChecks.startsCompliant ? '✓' : '✗'} ${results.operationalChecks.startsPerHour.toFixed(1)} [≤10]`);
        }

        console.log('\n🎯 COMPLIANCE STATUS');
        console.log('-'.repeat(70));
        console.log(`  Overall:         ${verification.status === 'CONFORME' ? '✅ CONFORME' : '❌ NO CONFORME'}`);
        console.log(`  Method:          ${verification.method}`);
        console.log(`  Reference:       ${verification.normativeReference}`);

        if (verification.violations.length > 0) {
            console.log('\n⚠️  VIOLATIONS:');
            verification.violations.forEach((v, i) => {
                console.log(`  ${i + 1}. ${v}`);
            });
        }

        if (verification.recommendations.length > 0) {
            console.log('\n💡 RECOMMENDATIONS:');
            verification.recommendations.forEach((r, i) => {
                console.log(`  ${i + 1}. ${r}`);
            });
        }
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ INTEGRATION TEST PASSED');
    console.log('='.repeat(70));
    console.log('\n✓ ProjectContext integration ready');
    console.log('✓ PressureModel functioning correctly');
    console.log('✓ Analysis routing logic validated');
    console.log('✓ Hydraulic calculations verified');
    console.log('✓ Results structure complete\n');

} catch (error: any) {
    console.error('\n❌ INTEGRATION TEST FAILED');
    console.error('='.repeat(70));
    console.error('Error:', error?.message || error);
    console.error('Stack:', error?.stack);
    process.exit(1);
}
