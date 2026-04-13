import { Chamber, Pipe, ProjectSettings } from '../context/ProjectContext';
import { getManningAndDiMm } from '../hydraulics/hydraulicCalculationEngine';
import { runSMCAL_GRAV } from '../hydraulics/nch1105Engine';
import { computeDomesticVerification } from '../domain/gravity/domesticEngine';
import { DomesticSegmentInput } from '../domain/gravity/domesticTypes';
import { resolveHydraulicDiMm, resolveInternalDiameter } from '../utils/diameterMapper';

const attr = (value: number | string, origin: 'manual' | 'calculated' = 'manual') => ({ value, origin });

const assertEqual = (actual: unknown, expected: unknown, label: string) => {
    if (actual !== expected) {
        throw new Error(`${label}: esperado ${String(expected)}, obtenido ${String(actual)}`);
    }
};

const assertClose = (actual: number, expected: number, tolerance: number, label: string) => {
    if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
        throw new Error(`${label}: esperado ${expected.toFixed(4)} +/- ${tolerance}, obtenido ${actual}`);
    }
};

const basePipe = (): Pipe => ({
    id: 'T1',
    userDefinedId: 'T1',
    x1: 0,
    y1: 0,
    x2: 10,
    y2: 0,
    startNodeId: 'C1',
    endNodeId: 'C2',
    material: attr('PVC'),
    diameter: attr(180),
    sdr: attr('SDR17'),
    length: attr(20),
    slope: attr(1.2),
    uehTransportadas: attr(0),
    pipeRole: 'COLECTOR_EXTERIOR',
    gravityRole_auto: 'COLECTOR',
    internalDiameterMode: 'AUTO'
});

const chambers: Chamber[] = [
    {
        id: 'C1', userDefinedId: 'C1', x: 0, y: 0,
        CT: attr(100), H: attr(2), Cre: attr(99), CRS: attr(98), delta: attr(1), deltaMode: 'auto',
        Qin: attr(0), uehPropias: attr(0), uehAcumuladas: attr(0), chamberType: 'Pública', chamberDimension: 'Estandar',
        populationLocal: 30, P_acum: 30
    },
    {
        id: 'C2', userDefinedId: 'C2', x: 10, y: 0,
        CT: attr(99), H: attr(2), Cre: attr(98), CRS: attr(97), delta: attr(1), deltaMode: 'auto',
        Qin: attr(0), uehPropias: attr(0), uehAcumuladas: attr(0), chamberType: 'Pública', chamberDimension: 'Estandar',
        populationLocal: 0, P_acum: 30
    }
];

const settings: ProjectSettings = {
    mapDimensions: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
    units: 'Meters',
    projectType: 'Público',
    sanitarySystemType: 'I',
    flowDesignModeCollectors: 'POPULATION_NCH1105',
    verificationMode: 'UEH_MANNING',
    hasPopulation: true,
    populationTotal: 30,
    D_L_per_hab_day: 150,
    R_recovery: 0.8,
    C_capacity: 1,
    nch1105: { enabled: true, peakMode: 'STRICT', habPorCasa: 5 },
    manning: { value: 0.013, source: 'global' }
};

const applyPipeUpdateWithImmediateResolution = (pipe: Pipe, updates: Partial<Pipe>): Pipe => {
    const merged = { ...pipe, ...updates } as Pipe;
    const dint = resolveInternalDiameter(merged);
    return {
        ...merged,
        internalDiameterResolved: dint.di_mm,
        internalDiameterSource: dint.source
    };
};

(() => {
    // a) MANUAL 173.6 => internalDiameterResolved = 173.6
    const manualPipe = {
        ...basePipe(),
        internalDiameterMode: 'MANUAL' as const,
        internalDiameterManual: attr(173.6)
    };
    const manualRes = resolveInternalDiameter(manualPipe);
    assertClose(manualRes.di_mm, 173.6, 1e-9, 'a) DINT manual');
    assertEqual(manualRes.source, 'MANUAL', 'a) origen manual');

    // b) AUTO -> MANUAL refresca inmediato
    const autoPipe = {
        ...basePipe(),
        internalDiameterMode: 'AUTO' as const,
        internalDiameterResolved: 180,
        internalDiameterSource: 'FALLBACK_DN' as const
    };
    const switched = applyPipeUpdateWithImmediateResolution(autoPipe, {
        internalDiameterMode: 'MANUAL',
        internalDiameterManual: attr(173.6)
    });
    assertClose(Number(switched.internalDiameterResolved), 173.6, 1e-9, 'b) refresco al pasar a MANUAL');
    assertEqual(switched.internalDiameterSource, 'MANUAL', 'b) fuente al pasar a MANUAL');

    // c) Cambios de DN/material/SDR en AUTO recalculan DINT
    const autoUpdated = applyPipeUpdateWithImmediateResolution(basePipe(), {
        internalDiameterMode: 'AUTO',
        material: attr('HDPE_LISO'),
        diameter: attr(200),
        sdr: attr('SDR21')
    });
    assertClose(Number(autoUpdated.internalDiameterResolved), 180.8, 1e-9, 'c) recálculo AUTO por material/DN/SDR');
    assertEqual(autoUpdated.internalDiameterSource, 'AUTO', 'c) fuente AUTO');

    // d) Si no hay tabla, usar FALLBACK_DN
    const fallbackPipe = {
        ...basePipe(),
        internalDiameterMode: 'AUTO' as const,
        material: attr('HDPE_CORRUGADO'),
        diameter: attr(180)
    };
    const fallbackRes = resolveInternalDiameter(fallbackPipe);
    assertClose(fallbackRes.di_mm, 180, 1e-9, 'd) fallback DN');
    assertEqual(fallbackRes.source, 'FALLBACK_DN', 'd) fuente fallback DN');

    // e) NCh1105 / NCh3371 consumen el mismo DINT resuelto actual
    const pipeResolved = {
        ...basePipe(),
        internalDiameterMode: 'MANUAL' as const,
        internalDiameterManual: attr(173.6),
        internalDiameterResolved: 173.6,
        internalDiameterSource: 'MANUAL' as const,
        P_edge: 30
    };

    const row1105 = runSMCAL_GRAV(chambers, [pipeResolved], settings).tabla16Calculo[0];
    if (!row1105) throw new Error('e) runSMCAL_GRAV no devolvió fila Tabla 16');
    assertClose(row1105.d_int_mm, 173.6, 1e-9, 'e) NCh1105 usa DINT resuelto');

    const { di_mm: diTable } = getManningAndDiMm('PVC', 180, 'SDR17');
    const diFor3371 = resolveHydraulicDiMm(pipeResolved, diTable);
    const domInput: DomesticSegmentInput[] = [{
        id: 'T1',
        cIni: 'C1',
        cFin: 'C2',
        role: 'RAMAL',
        L_m: 20,
        DN_mm: 180,
        Dint_mm: diFor3371,
        slope_pct: 1.2,
        ueh_acum: 3
    }];
    const row3371 = computeDomesticVerification(domInput)[0];
    if (!row3371) throw new Error('e) computeDomesticVerification no devolvió fila');
    assertClose(row3371.Dint_mm, 173.6, 1e-9, 'e) NCh3371 usa DINT resuelto');

    console.log('OK test_internal_diameter_resolution: DINT manual/auto/fallback y propagación inmediata validados.');
})();
