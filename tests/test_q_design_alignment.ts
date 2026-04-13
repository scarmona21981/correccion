import { Chamber, Pipe, ProjectSettings } from '../context/ProjectContext';
import { calculateFlowAccumulation } from '../utils/flowAccumulator';
import { executeHydraulicCalculation, RolNormativo } from '../hydraulics/hydraulicCalculationEngine';

const attr = (value: number | string, origin: 'manual' | 'calculated' = 'manual') => ({ value, origin });

const assertClose = (actual: number, expected: number, tolerance: number, label: string) => {
    if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
        throw new Error(`${label}: esperado ${expected.toFixed(3)} +/- ${tolerance}, obtenido ${actual}`);
    }
};

const createChamber = (id: string, uehPropias: number): Chamber => ({
    id,
    userDefinedId: id,
    x: 0,
    y: 0,
    CT: attr(100),
    H: attr(2),
    Cre: attr(99),
    CRS: attr(98),
    delta: attr(1),
    deltaMode: 'auto',
    Qin: attr(0),
    uehPropias: attr(uehPropias),
    uehAcumuladas: attr(uehPropias),
    chamberType: 'Pública',
    chamberDimension: 'Estandar'
});

const createCollectorPipe = (mode: 'POBLACION_NCH1105' | 'POBLACION_PONDERADA_UEH', uehUpstream = 108, pipeId = 'T3'): Pipe => ({
    id: pipeId,
    userDefinedId: pipeId,
    x1: 0,
    y1: 0,
    x2: 10,
    y2: 0,
    startNodeId: 'C1',
    endNodeId: 'C2',
    material: attr('PVC'),
    diameter: attr(200),
    length: attr(40),
    slope: attr(1),
    uehTransportadas: attr(uehUpstream),
    pipeRole: 'COLECTOR_EXTERIOR',
    designOptions: {
        collectorSizingMode: mode
    }
});

const settingsBase: Partial<ProjectSettings> = {
    hasPopulation: true,
    populationTotal: 1500,
    D_L_per_hab_day: 150,
    C_capacity: 1
};

const assertViewAlignment = (pipe: Pipe, expectedQ: number) => {
    const qPanel = Number(pipe.hydraulics?.Q_design_Lps || 0);
    const qRol = Number(pipe.hydraulics?.Q_design_Lps || 0);

    const calc = executeHydraulicCalculation({
        id: 'T3',
        rol: RolNormativo.COLECTOR_EXTERIOR,
        longitud_m: Number(pipe.length.value),
        dn_mm: Number(pipe.diameter.value),
        pendiente_porcentaje: Number(pipe.slope.value),
        material: String(pipe.material.value),
        uehAcumuladas: Number(pipe.uehTransportadas.value),
        qDiseno_Ls: qPanel,
        populationTributaria: pipe.hydraulics?.inputs?.P_edge,
        populationTotal: pipe.hydraulics?.inputs?.P_total,
        collectorSizingMode: pipe.hydraulics?.sourceMode,
        designFlowMeta: {
            method: (pipe.hydraulics?.sourceMode || 'UEH_Qww') as 'UEH_Qww' | 'POBLACION_NCH1105' | 'POBLACION_PONDERADA_UEH',
            flowMethodNCh1105: pipe.hydraulics?.flowMethodNCh1105 || null
        }
    });

    const qVerification = calc.flows.Q_diseno_Ls;

    assertClose(qPanel, expectedQ, 0.05, 'Q panel');
    assertClose(qRol, expectedQ, 0.05, 'Q Rol Normativo');
    assertClose(qVerification, expectedQ, 0.05, 'Q verificación (Qd)');
};

(() => {
    const chambers = [createChamber('C1', 90), createChamber('C2', 18)];

    const caseR1 = calculateFlowAccumulation(
        chambers,
        [createCollectorPipe('POBLACION_NCH1105')],
        { settings: { ...settingsBase, R_recovery: 1 } }
    ).pipes[0];

    assertViewAlignment(caseR1, 9.58);

    const caseR083 = calculateFlowAccumulation(
        chambers,
        [createCollectorPipe('POBLACION_NCH1105')],
        { settings: { ...settingsBase, R_recovery: 0.83 } }
    ).pipes[0];

    assertViewAlignment(caseR083, 7.95);

    const weighted108 = calculateFlowAccumulation(
        chambers,
        [createCollectorPipe('POBLACION_PONDERADA_UEH', 108)],
        { settings: { ...settingsBase, R_recovery: 1 } }
    ).pipes[0];

    assertClose(Number(weighted108.hydraulics?.inputs?.UEH_total || 0), 108, 0.01, 'UEH_total ponderada');
    assertClose(Number(weighted108.hydraulics?.inputs?.P_edge || 0), 1500, 0.5, 'P_edge ponderada (108)');
    assertViewAlignment(weighted108, 9.58);
    if (weighted108.hydraulics?.flowMethodNCh1105 !== 'HARMON') {
        throw new Error(`Método ponderada (108): esperado HARMON, obtenido ${weighted108.hydraulics?.flowMethodNCh1105}`);
    }

    const weighted90 = calculateFlowAccumulation(
        chambers,
        [createCollectorPipe('POBLACION_PONDERADA_UEH', 90)],
        { settings: { ...settingsBase, R_recovery: 1 } }
    ).pipes[0];

    assertClose(Number(weighted90.hydraulics?.inputs?.P_edge || 0), 1250, 0.5, 'P_edge ponderada (90)');
    assertViewAlignment(weighted90, 8.11);
    if (weighted90.hydraulics?.flowMethodNCh1105 !== 'HARMON') {
        throw new Error(`Método ponderada (90): esperado HARMON, obtenido ${weighted90.hydraulics?.flowMethodNCh1105}`);
    }

    const weighted18 = calculateFlowAccumulation(
        chambers,
        [createCollectorPipe('POBLACION_PONDERADA_UEH', 18)],
        { settings: { ...settingsBase, R_recovery: 1 } }
    ).pipes[0];

    assertClose(Number(weighted18.hydraulics?.inputs?.P_edge || 0), 250, 0.5, 'P_edge ponderada (18)');
    assertViewAlignment(weighted18, 1.78);
    if (weighted18.hydraulics?.flowMethodNCh1105 !== 'HARMON') {
        throw new Error(`Método ponderada (18): esperado HARMON (AUTO sin hab/casa), obtenido ${weighted18.hydraulics?.flowMethodNCh1105}`);
    }

    const weightedNetwork = calculateFlowAccumulation(
        chambers,
        [
            createCollectorPipe('POBLACION_PONDERADA_UEH', 90, 'T1'),
            createCollectorPipe('POBLACION_PONDERADA_UEH', 18, 'T2'),
            createCollectorPipe('POBLACION_PONDERADA_UEH', 108, 'T3')
        ],
        { settings: { ...settingsBase, R_recovery: 1 } }
    ).pipes;

    const pipeT1 = weightedNetwork.find(p => p.id === 'T1');
    const pipeT2 = weightedNetwork.find(p => p.id === 'T2');
    const pipeT3 = weightedNetwork.find(p => p.id === 'T3');

    if (!pipeT1 || !pipeT2 || !pipeT3) {
        throw new Error('No se encontraron todos los tramos ponderados (T1/T2/T3)');
    }

    assertClose(Number(pipeT1.hydraulics?.inputs?.P_edge || 0), 1250, 0.5, 'P_edge red T1 (90)');
    assertClose(Number(pipeT2.hydraulics?.inputs?.P_edge || 0), 250, 0.5, 'P_edge red T2 (18)');
    assertClose(Number(pipeT3.hydraulics?.inputs?.P_edge || 0), 1500, 0.5, 'P_edge red T3 (108)');
    assertClose(Number(pipeT1.hydraulics?.Q_design_Lps || 0), 8.11, 0.05, 'Qmax red T1 (90)');
    assertClose(Number(pipeT2.hydraulics?.Q_design_Lps || 0), 1.78, 0.05, 'Qmax red T2 (18)');
    assertClose(Number(pipeT3.hydraulics?.Q_design_Lps || 0), 9.58, 0.05, 'Qmax red T3 (108)');

    console.log('OK test_q_design_alignment: Q_design unificado en panel/rol/verificación.');
})();
