import { migrateProjectSchema } from '../context/projectMigration';
import { CURRENT_PROJECT_SCHEMA_VERSION } from '../context/projectSchema';
import type { Chamber, Pipe, ProjectSettings } from '../context/ProjectContext';
import { withCalculatedPipeLength } from '../utils/pipeLengthMode';
import { calculateGeometry } from '../utils/geometryEngine';

const attr = (value: number | string, origin: 'manual' | 'calculated' = 'manual') => ({ value, origin });

const baseSettings: ProjectSettings = {
    mapDimensions: { minX: 0, minY: 0, maxX: 1000, maxY: 1000 },
    units: 'Meters',
    projectType: 'Público',
    sanitarySystemType: 'I',
    flowDesignModeCollectors: 'DIRECT_Q',
    verificationMode: 'UEH_MANNING',
    hasPopulation: false,
    populationTotal: 0,
    D_L_per_hab_day: 150,
    R_recovery: 0.8,
    C_capacity: 1.0,
    nch1105: {
        enabled: true,
        peakMode: 'AUTO',
        habPorCasa: null
    },
    manning: { value: 0.013, source: 'global' }
};

const chamberTemplate: Chamber = {
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

const pipeTemplate: Pipe = {
    id: '',
    userDefinedId: '',
    x1: 0,
    y1: 0,
    x2: 16.96,
    y2: 0,
    startNodeId: '',
    endNodeId: '',
    material: attr('PVC', 'manual'),
    diameter: attr(200, 'manual'),
    length: attr(16.96, 'manual'),
    lengthMode: 'manual',
    slope: attr(0, 'calculated'),
    slopeLocked: false,
    isSlopeManual: false,
    manualSlope: attr(0, 'manual'),
    uehTransportadas: attr(0, 'calculated')
};

let passed = true;
const assert = (condition: boolean, msg: string) => {
    if (!condition) {
        console.error('FAIL:', msg);
        passed = false;
    } else {
        console.log('PASS:', msg);
    }
};

const almostEqual = (value: number | undefined, expected: number, eps = 1e-4) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return false;
    return Math.abs(value - expected) <= eps;
};

console.log('--- Project Migration Tests ---');

// TEST 1: LEGACY ALTURA FIJA
{
    const legacyProject = {
        version: 1,
        chambers: [
            { ...chamberTemplate, id: 'c_up', userDefinedId: 'C_UP', H: attr(0.4, 'manual') },
            { ...chamberTemplate, id: 'c_down', userDefinedId: 'C_DOWN', H: attr(0.768, 'manual') }
        ],
        pipes: [
            {
                ...pipeTemplate,
                id: 'p1',
                userDefinedId: 'P1',
                startNodeId: 'c_up',
                endNodeId: 'c_down',
                isSlopeManual: true,
                manualSlope: attr(2, 'manual')
            }
        ],
        settings: baseSettings
    };

    const migration = migrateProjectSchema(legacyProject);
    const migratedDown = migration.project.chambers.find((c: any) => c.id === 'c_down');
    assert(migratedDown?.heightLocked === true, 'T1: cámara legacy con H manual migra a heightLocked=true');

    const geometry = calculateGeometry(migration.project.chambers as Chamber[], migration.project.pipes as Pipe[]);
    const down = geometry.chambers.find(c => c.id === 'c_down');
    assert(almostEqual(Number(down?.CRS.value), 246.232), `T1: CRS = CT - H (actual ${down?.CRS.value})`);
    assert(almostEqual(Number(down?.Cre.value), 246.252), `T1: CRe = CRS + delta (actual ${down?.Cre.value})`);
}

// TEST 2: LEGACY PENDIENTE FIJA
{
    const legacyProject = {
        version: 1,
        chambers: [
            { ...chamberTemplate, id: 'c_up', userDefinedId: 'C_UP', H: attr(0.4, 'manual') },
            { ...chamberTemplate, id: 'c_down', userDefinedId: 'C_DOWN', H: attr(0, 'calculated') }
        ],
        pipes: [
            {
                ...pipeTemplate,
                id: 'p1',
                userDefinedId: 'P1',
                startNodeId: 'c_up',
                endNodeId: 'c_down',
                isSlopeManual: true,
                manualSlope: attr(2, 'manual')
            }
        ],
        settings: baseSettings
    };

    const migration = migrateProjectSchema(legacyProject);
    const migratedPipe = migration.project.pipes.find((p: any) => p.id === 'p1');
    assert(migratedPipe?.slopeLocked === true, 'T2: tramo legacy con pendiente manual migra a slopeLocked=true');

    const geometry = calculateGeometry(migration.project.chambers as Chamber[], migration.project.pipes as Pipe[]);
    const down = geometry.chambers.find(c => c.id === 'c_down');
    assert(almostEqual(Number(down?.Cre.value), 246.2608), `T2: CRe = CRS_up - L*i (actual ${down?.Cre.value})`);
}

// TEST 3: LEGACY LONGITUD MANUAL
{
    const legacyProject = {
        version: 1,
        chambers: [
            { ...chamberTemplate, id: 'c1', userDefinedId: 'C1', H: attr(0.4, 'manual') },
            { ...chamberTemplate, id: 'c2', userDefinedId: 'C2', H: attr(0.4, 'manual') }
        ],
        pipes: [
            {
                ...pipeTemplate,
                id: 'p_manual',
                userDefinedId: 'P_MAN',
                startNodeId: 'c1',
                endNodeId: 'c2',
                length: attr(16.96, 'manual')
            }
        ],
        settings: baseSettings
    };

    const migration = migrateProjectSchema(legacyProject);
    const pipe = migration.project.pipes.find((p: any) => p.id === 'p_manual') as Pipe;
    assert(pipe.lengthMode === 'manual', 'T3: tramo legacy con L manual queda en lengthMode=manual');

    const moved = withCalculatedPipeLength(pipe, 17.4);
    assert(Number(moved.length.value) === 16.96, 'T3: mover cámaras no altera longitud manual');
}

// TEST 4: LEGACY LONGITUD AUTO
{
    const legacyProject = {
        version: 1,
        chambers: [
            { ...chamberTemplate, id: 'c1', userDefinedId: 'C1', H: attr(0.4, 'manual') },
            { ...chamberTemplate, id: 'c2', userDefinedId: 'C2', H: attr(0.4, 'manual') }
        ],
        pipes: [
            {
                ...pipeTemplate,
                id: 'p_auto',
                userDefinedId: 'P_AUTO',
                startNodeId: 'c1',
                endNodeId: 'c2',
                autoLength: true,
                length: attr(16.96, 'manual')
            }
        ],
        settings: baseSettings
    };

    const migration = migrateProjectSchema(legacyProject);
    const pipe = migration.project.pipes.find((p: any) => p.id === 'p_auto') as Pipe;
    assert(pipe.lengthMode === 'auto', 'T4: tramo legacy autoLength migra a lengthMode=auto');
    assert(pipe.length.origin === 'calculated', 'T4: longitud auto queda con origin=calculated');

    const moved = withCalculatedPipeLength(pipe, 17.4);
    assert(Number(moved.length.value) === 17.4, 'T4: mover nodos recalcula longitud en modo auto');
}

// TEST 5: NO REGRESIÓN PROYECTO NUEVO
{
    const currentProject = {
        version: 1,
        schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
        chambers: [
            { ...chamberTemplate, id: 'c1', userDefinedId: 'C1', H: attr(0.4, 'manual'), heightLocked: true },
            { ...chamberTemplate, id: 'c2', userDefinedId: 'C2', H: attr(0, 'calculated'), heightLocked: false }
        ],
        pipes: [
            {
                ...pipeTemplate,
                id: 'p1',
                userDefinedId: 'P1',
                startNodeId: 'c1',
                endNodeId: 'c2',
                lengthMode: 'manual',
                slopeLocked: true,
                isSlopeManual: true,
                manualSlope: attr(2, 'manual')
            }
        ],
        settings: baseSettings
    };

    const migration = migrateProjectSchema(currentProject);
    const pipe = migration.project.pipes.find((p: any) => p.id === 'p1');
    assert(migration.meta.schemaMigrated === false, 'T5: proyecto nuevo no se migra innecesariamente');
    assert(pipe?.lengthMode === 'manual', 'T5: lengthMode se conserva');
    assert(pipe?.slopeLocked === true, 'T5: slopeLocked se conserva');
}

if (passed) {
    console.log('\nAll project migration tests PASSED.\n');
} else {
    console.log('\nSome project migration tests FAILED.\n');
}
