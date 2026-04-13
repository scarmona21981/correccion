import { Chamber, Pipe, ProjectSettings } from '../context/ProjectContext';
import { calculatePeakFlow_NCh1105 } from '../utils/designFlowCalculator';
import { runSMCAL_GRAV } from '../hydraulics/nch1105Engine';
import { buildVerificationMatrix } from '../verification/verificationMatrix';

const attr = (value: number | string, origin: 'manual' | 'calculated' = 'manual') => ({ value, origin });

const assertClose = (actual: number, expected: number, tolerance: number, label: string) => {
    if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
        throw new Error(`${label}: esperado ${expected.toFixed(3)} +/- ${tolerance}, obtenido ${actual}`);
    }
};

const createChambers = (): Chamber[] => ([
    {
        id: 'C1',
        userDefinedId: 'C1',
        x: 0,
        y: 0,
        CT: attr(100),
        H: attr(2),
        Cre: attr(99),
        CRS: attr(98),
        delta: attr(1),
        deltaMode: 'auto',
        Qin: attr(0),
        uehPropias: attr(0),
        uehAcumuladas: attr(0),
        chamberType: 'Pública',
        chamberDimension: 'Estandar',
        populationLocal: 24,
        P_acum: 24
    },
    {
        id: 'C2',
        userDefinedId: 'C2',
        x: 10,
        y: 0,
        CT: attr(99),
        H: attr(2),
        Cre: attr(98),
        CRS: attr(97),
        delta: attr(1),
        deltaMode: 'auto',
        Qin: attr(0),
        uehPropias: attr(0),
        uehAcumuladas: attr(0),
        chamberType: 'Pública',
        chamberDimension: 'Estandar',
        populationLocal: 0,
        P_acum: 24
    }
]);

const createPipe = (): Pipe => ({
    id: 'T1',
    userDefinedId: 'T1',
    x1: 0,
    y1: 0,
    x2: 10,
    y2: 0,
    startNodeId: 'C1',
    endNodeId: 'C2',
    material: attr('PVC'),
    diameter: attr(200),
    length: attr(20),
    slope: attr(1),
    uehTransportadas: attr(0),
    pipeRole: 'COLECTOR_EXTERIOR',
    designOptions: {
        collectorSizingMode: 'POBLACION_NCH1105'
    },
    P_edge: 24
});

const createSettings = (habPorCasa: number): ProjectSettings => ({
    mapDimensions: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
    units: 'Meters',
    projectType: 'Público',
    sanitarySystemType: 'I',
    flowDesignModeCollectors: 'POPULATION_NCH1105',
    verificationMode: 'UEH_MANNING',
    hasPopulation: true,
    populationTotal: 24,
    D_L_per_hab_day: 150,
    R_recovery: 0.8,
    C_capacity: 1,
    nch1105: {
        enabled: true,
        peakMode: 'STRICT',
        habPorCasa
    },
    manning: { value: 0.013, source: 'global' }
});

(() => {
    // Caso 1
    const case1 = calculatePeakFlow_NCh1105(24, 150, 0.8, 1, 'STRICT', 4);
    if (case1.method !== 'BSCE') throw new Error(`Caso 1 método esperado BSCE, obtenido ${case1.method}`);
    if (case1.equivalentHouses !== 6) throw new Error(`Caso 1 BSCE esperado 6, obtenido ${case1.equivalentHouses}`);
    assertClose(case1.Qmax, 1.70, 0.001, 'Caso 1 QMAX.H');

    // Caso 2
    const case2 = calculatePeakFlow_NCh1105(24, 150, 0.8, 1, 'STRICT', 5);
    if (case2.method !== 'BSCE') throw new Error(`Caso 2 método esperado BSCE, obtenido ${case2.method}`);
    if (case2.equivalentHouses !== 5) throw new Error(`Caso 2 BSCE esperado 5, obtenido ${case2.equivalentHouses}`);
    assertClose(case2.Qmax, 1.58, 0.001, 'Caso 2 QMAX.H');

    // Caso 3: cambio hab/casa y recálculo sincronizado motor/tabla
    const chambers = createChambers();
    const result4 = runSMCAL_GRAV(chambers, [createPipe()], createSettings(4));
    const result5 = runSMCAL_GRAV(chambers, [createPipe()], createSettings(5));

    const row4 = result4.tabla16Calculo[0];
    const row5 = result5.tabla16Calculo[0];
    if (!row4 || !row5) throw new Error('No se obtuvo fila de Tabla 16 para validar BSCE/QMAX/FP.');

    if (row4.metodo_qmax !== 'BSCE' || row5.metodo_qmax !== 'BSCE') {
        throw new Error(`Método esperado BSCE en ambos casos. Obtenido: ${row4.metodo_qmax} y ${row5.metodo_qmax}`);
    }

    if (row4.houses_bsce !== 6 || row5.houses_bsce !== 5) {
        throw new Error(`BSCE visible inconsistente. Esperado 6/5, obtenido ${row4.houses_bsce}/${row5.houses_bsce}`);
    }

    assertClose(row4.q_max_h, 1.70, 0.001, 'Tabla16 QMAX.H (hab/casa=4)');
    assertClose(row5.q_max_h, 1.58, 0.001, 'Tabla16 QMAX.H (hab/casa=5)');
    assertClose(row4.hab_por_casa_usado || 0, 4, 0.001, 'Tabla16 hab/casa usado (4)');
    assertClose(row5.hab_por_casa_usado || 0, 5, 0.001, 'Tabla16 hab/casa usado (5)');

    if (Math.abs(row4.fp - row5.fp) < 1e-4) {
        throw new Error('FP no cambió al modificar hab/casa, posible valor cacheado.');
    }

    // Caso 4: salida de verificación (export/report) consistente con motor
    const matrix4 = buildVerificationMatrix(chambers, [createPipe()], createSettings(4));
    const matrix5 = buildVerificationMatrix(chambers, [createPipe()], createSettings(5));
    const max4 = matrix4.table16_max[0];
    const max5 = matrix5.table16_max[0];

    if (!max4 || !max5) throw new Error('No se obtuvo fila de verificación Tabla 16 para comparar exportación.');

    assertClose(max4.qmaxh_lps, row4.q_max_h, 0.001, 'Verificación QMAX.H vs motor (hab/casa=4)');
    assertClose(max5.qmaxh_lps, row5.q_max_h, 0.001, 'Verificación QMAX.H vs motor (hab/casa=5)');

    if (max4.equivalent_houses !== 6 || max5.equivalent_houses !== 5) {
        throw new Error(`Verificación equivalent_houses inconsistente. Esperado 6/5, obtenido ${max4.equivalent_houses}/${max5.equivalent_houses}`);
    }

    console.log('OK test_nch1105_bsce_consistency: BSCE/QMAX.H sincronizados en motor, tabla y verificación.');
})();
