import { calculateGeometry } from '../utils/geometryEngine';
import type { Chamber, Pipe } from '../context/ProjectContext';
import { withCalculatedPipeLength } from '../utils/pipeLengthMode';

const attr = (value: number | string, origin: 'manual' | 'calculated' = 'manual') => ({ value, origin });

const testChamberTemplate: Chamber = {
    id: '',
    userDefinedId: '',
    x: 0,
    y: 0,
    CT: attr(247, 'manual'),
    H: attr(0, 'calculated'),
    heightLocked: false,
    Cre: attr(0, 'calculated'),
    CRS: attr(0, 'calculated'),
    delta: attr(0.02, 'manual'),
    deltaMode: 'manual',
    Qin: attr(0, 'manual'),
    uehPropias: attr(0, 'manual'),
    uehAcumuladas: attr(0, 'calculated'),
    chamberType: 'Pública',
    chamberDimension: '120 cm'
};

const testPipeTemplate: Pipe = {
    id: '', userDefinedId: '', x1: 0, y1: 0, x2: 17.40, y2: 0,
    startNodeId: '', endNodeId: '',
    material: attr('PVC', 'manual'),
    diameter: attr(200, 'manual'),
    length: attr(16.96, 'manual'),
    lengthMode: 'manual',
    slope: attr(0, 'calculated'),
    slopeLocked: false,
    isSlopeManual: false,
    uehTransportadas: attr(0, 'calculated')
};

console.log('--- Geometry Engine Tests ---');

let passed = true;
const assert = (condition: boolean, msg: string) => {
    if (!condition) {
        console.error('❌ FAIL:', msg);
        passed = false;
    } else {
        console.log('✅ PASS:', msg);
    }
}

const almostEqual = (actual: number | undefined, expected: number, epsilon = 1e-4) => {
    if (typeof actual !== 'number' || Number.isNaN(actual)) return false;
    return Math.abs(actual - expected) <= epsilon;
};

// TEST 1: Pendiente fija manda cuando la cámara no tiene altura fija
const slopeLockedChambers: Chamber[] = [
    {
        ...testChamberTemplate,
        id: 'c_up',
        userDefinedId: 'C_UP',
        CT: attr(247, 'manual'),
        H: attr(0.4, 'manual'),
        heightLocked: true,
        delta: attr(0.02, 'manual')
    },
    {
        ...testChamberTemplate,
        id: 'c_down',
        userDefinedId: 'C_DOWN',
        CT: attr(247, 'manual'),
        H: attr(0, 'calculated'),
        heightLocked: false,
        delta: attr(0.02, 'manual')
    }
];

const slopeLockedPipe: Pipe[] = [
    {
        ...testPipeTemplate,
        id: 'p1',
        userDefinedId: 'P1',
        startNodeId: 'c_up',
        endNodeId: 'c_down',
        length: attr(16.96, 'manual'),
        lengthMode: 'manual',
        slopeLocked: true,
        isSlopeManual: true,
        manualSlope: attr(2, 'manual')
    }
];

const slopeLockedResult = calculateGeometry(slopeLockedChambers, slopeLockedPipe);
const downFromSlope = slopeLockedResult.chambers.find((c: Chamber) => c.id === 'c_down');

assert(almostEqual(Number(downFromSlope?.Cre.value), 246.2608), `T1: CRe esperado 246.2608 (actual: ${downFromSlope?.Cre.value})`);
assert(almostEqual(Number(downFromSlope?.CRS.value), 246.2408), `T1: CRS esperado 246.2408 (actual: ${downFromSlope?.CRS.value})`);
assert(almostEqual(Number(downFromSlope?.H.value), 0.7592), `T1: H esperado 0.7592 (actual: ${downFromSlope?.H.value})`);

// TEST 2: Altura fija manda sobre la pendiente del tramo
const heightLockedChambers: Chamber[] = [
    {
        ...testChamberTemplate,
        id: 'c_up_h',
        userDefinedId: 'C_UP_H',
        CT: attr(247, 'manual'),
        H: attr(0.4, 'manual'),
        heightLocked: true,
        delta: attr(0.02, 'manual')
    },
    {
        ...testChamberTemplate,
        id: 'c_down_h',
        userDefinedId: 'C_DOWN_H',
        CT: attr(247, 'manual'),
        H: attr(0.768, 'manual'),
        heightLocked: true,
        delta: attr(0.02, 'manual')
    }
];

const heightLockedPipe: Pipe[] = [
    {
        ...testPipeTemplate,
        id: 'p2',
        userDefinedId: 'P2',
        startNodeId: 'c_up_h',
        endNodeId: 'c_down_h',
        length: attr(16.96, 'manual'),
        lengthMode: 'manual',
        slopeLocked: true,
        isSlopeManual: true,
        manualSlope: attr(2, 'manual')
    }
];

const heightLockedResult = calculateGeometry(heightLockedChambers, heightLockedPipe);
const downFromHeight = heightLockedResult.chambers.find((c: Chamber) => c.id === 'c_down_h');

assert(almostEqual(Number(downFromHeight?.CRS.value), 246.232), `T2: CRS esperado 246.232 (actual: ${downFromHeight?.CRS.value})`);
assert(almostEqual(Number(downFromHeight?.Cre.value), 246.252), `T2: CRe esperado 246.252 (actual: ${downFromHeight?.Cre.value})`);

// TEST 3: No regresión - la longitud manual no se sobrescribe con longitud geométrica
const manualLengthPipe: Pipe = {
    ...testPipeTemplate,
    id: 'p_manual',
    userDefinedId: 'P_MAN',
    length: attr(16.96, 'manual'),
    lengthMode: 'manual'
};

const autoLengthPipe: Pipe = {
    ...testPipeTemplate,
    id: 'p_auto',
    userDefinedId: 'P_AUTO',
    length: attr(16.96, 'calculated'),
    lengthMode: 'auto'
};

const manualAfterGeometryMove = withCalculatedPipeLength(manualLengthPipe, 17.4);
const autoAfterGeometryMove = withCalculatedPipeLength(autoLengthPipe, 17.4);

assert(Number(manualAfterGeometryMove.length.value) === 16.96, 'T3: Longitud manual permanece en 16.96 al mover geometría');
assert(manualAfterGeometryMove.lengthMode === 'manual', 'T3: pipe.lengthMode permanece manual');
assert(Number(autoAfterGeometryMove.length.value) === 17.4, 'T3: Longitud auto se recalcula a 17.40');
assert(autoAfterGeometryMove.length.origin === 'calculated', 'T3: Longitud auto queda con origin=calculated');

if (passed) {
    console.log('\n✅ All geometric engine tests PASSED.\n');
} else {
    console.log('\n❌ Some tests FAILED.\n');
}
