import { Chamber, Pipe, ProjectSettings } from '../context/ProjectContext';
import { resolveEffectivePipeRole } from '../utils/pipeRole';

import { runTopologyAndApply, TopologyPipelineConfig, TopologyPipelineResult } from '../sanitary/topology/runTopologyPipeline';
import { executeSanitaryEngine, SanitaryEngineResult } from '../sanitary/sanitaryEngine';
import { executeHydraulicEngine, HydraulicEngineResult } from '../hydraulics/hydraulicEngine';
import { calculateGeometry } from '../utils/geometryEngine';
import { calculateUEHAccumulation, UEHResult } from '../utils/uehAccumulator';
import { calculateQwwAccumulation, QwwResult } from '../utils/qwwAccumulator';
import { calculateFlowAccumulation, FlowResult } from '../utils/flowAccumulator';
import { SanitarySystemType } from '../hydraulics/qwwTables';
import { VerificationMatrix, buildVerificationMatrix } from '../verification/verificationMatrix';
import { accumulatePopulation } from './populationAccumulator';
import { buildIncomingMap, classifyRoleAuto } from '../domain/gravity/roleUtils';
import { resolveInternalDiameter } from '../utils/diameterMapper';

export interface RecalcProjectResult {
    chambers: Chamber[];
    pipes: Pipe[];
    topologyResult: TopologyPipelineResult;
    sanitaryResult: SanitaryEngineResult;
    hydraulicResult: HydraulicEngineResult;
    uehResult: UEHResult;
    qwwResult: QwwResult;
    flowResult: FlowResult;
    verificationMatrix: VerificationMatrix;
    errors: string[];
    warnings: string[];
}

export interface RecalcProjectConfig {
    projectType?: import('../context/ProjectContext').ProjectType;
    hasPopulation?: boolean;
    populationTotal?: number;
    D_L_per_hab_day?: number;
    R_recovery?: number;
    C_capacity?: number;
    nch1105?: ProjectSettings['nch1105'];
    sanitarySystemType?: SanitarySystemType;
    flowDesignModeCollectors?: 'POPULATION_NCH1105' | 'DIRECT_Q';
}

export function recalcProject(
    chambers: Chamber[],
    pipes: Pipe[],
    config: RecalcProjectConfig = {}
): RecalcProjectResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    let currentChambers = chambers;
    let currentPipes = pipes;

    const geoRes = calculateGeometry(currentChambers, currentPipes);
    currentChambers = geoRes.chambers;
    currentPipes = geoRes.pipes;

    // ── Resolver Diámetro Interior (DINT) ──
    currentPipes = currentPipes.map(pipe => {
        const res = resolveInternalDiameter(pipe);
        if (res.warning) warnings.push(res.warning);
        return {
            ...pipe,
            internalDiameterResolved: res.di_mm,
            internalDiameterSource: res.source
        };
    });

    const topologyConfig: TopologyPipelineConfig = {
        hasPopulation: config.hasPopulation ?? false,
        populationTotal: config.populationTotal,
        D_L_per_hab_day: config.D_L_per_hab_day,
        R_recovery: config.R_recovery,
        C_capacity: config.C_capacity,
        flowDesignMode: config.flowDesignModeCollectors
    };

    const topologyApplyResult = runTopologyAndApply(currentChambers, currentPipes, topologyConfig);
    currentChambers = topologyApplyResult.chambers;
    currentPipes = topologyApplyResult.pipes;
    const topologyResult = topologyApplyResult.topologyResult;

    currentPipes = currentPipes.map(pipe => {
        if (pipe.override?.enabled) {
            return pipe;
        }

        if (!pipe.auto) {
            return pipe;
        }

        return {
            ...pipe,
            topologyRole: pipe.auto.topologyRole,
            topologyRegime: pipe.auto.topologyRegime
        };
    });

    // Evita heredar rol manual NCh1105 cuando el tramo ya no es colector exterior.
    currentPipes = currentPipes.map(pipe => {
        const effectiveRole = resolveEffectivePipeRole(pipe);
        if (effectiveRole !== 'COLECTOR_EXTERIOR' && pipe.gravityRole_manual != null) {
            return {
                ...pipe,
                gravityRole_manual: null
            };
        }
        return pipe;
    });

    if (topologyResult.propagationResult.errors.length > 0) {
        errors.push(...topologyResult.propagationResult.errors);
    }
    if (topologyResult.propagationResult.warnings.length > 0) {
        warnings.push(...topologyResult.propagationResult.warnings);
    }

    const uehResult = calculateUEHAccumulation(currentChambers, currentPipes);
    currentChambers = uehResult.chambers;
    currentPipes = uehResult.pipes;
    errors.push(...uehResult.errors);

    // ── Clasificación automática de rol gravitacional NCh1105 (gravityRole_auto) ──
    // Se calcula SIEMPRE (no solo en Público) para que el selector funcione.
    // Reglas: NACIENTE (inDegree_start=0), COLECTOR (inDegree_end≥2), LATERAL (resto).
    // gravityRole_manual NO se toca aquí — persiste el override del usuario.
    {
        const incomingMap = buildIncomingMap(currentPipes);
        currentPipes = currentPipes.map(pipe => {
            const autoRole = classifyRoleAuto(
                pipe.id,
                pipe.startNodeId ?? '',
                pipe.endNodeId ?? '',
                incomingMap
            );
            return {
                ...pipe,
                gravityRole_auto: autoRole
            };
        });
    }

    // ── Para proyectos Públicos: acumular población (P_local → P_edge) ──
    if (config.projectType === 'Público') {
        const popResult = accumulatePopulation(currentChambers, currentPipes);
        currentChambers = popResult.chambers;
        currentPipes = popResult.pipes;
        warnings.push(...popResult.warnings);

        // Forzar POBLACION_NCH1105 en todos los colectores exteriores
        // (sin requerir que el usuario edite cada tramo manualmente)
        currentPipes = currentPipes.map(pipe => {
            if (resolveEffectivePipeRole(pipe) === 'COLECTOR_EXTERIOR') {
                return {
                    ...pipe,
                    designOptions: {
                        ...pipe.designOptions,
                        collectorSizingMode: 'POBLACION_NCH1105' as const
                    }
                };
            }
            return pipe;
        });
    }

    const sanitarySystemType = config.sanitarySystemType ?? 'I';
    const qwwResult = calculateQwwAccumulation(currentChambers, currentPipes, sanitarySystemType);
    currentChambers = qwwResult.chambers;
    currentPipes = qwwResult.pipes;

    const flowResult = calculateFlowAccumulation(currentChambers, currentPipes, { settings: config });
    currentChambers = flowResult.chambers;
    currentPipes = flowResult.pipes;
    errors.push(...flowResult.errors);

    const sanitaryResult = executeSanitaryEngine(currentChambers, currentPipes, { settings: config });
    errors.push(...sanitaryResult.errors);
    warnings.push(...sanitaryResult.warnings);

    const hydraulicResult = executeHydraulicEngine(currentPipes, sanitaryResult, config as unknown as ProjectSettings);
    errors.push(...hydraulicResult.errors);
    warnings.push(...hydraulicResult.warnings);

    const verificationMatrix = buildVerificationMatrix(currentChambers, currentPipes, {
        ...config,
        nch1105: config.nch1105 || { enabled: true, peakMode: 'AUTO', habPorCasa: null }
    } as ProjectSettings);

    // Attach verification results to pipes for the summary table
    currentPipes = currentPipes.map(pipe => {
        const maxRow = verificationMatrix.table16_max.find(r => r.segmentId === pipe.id);
        const minRow = verificationMatrix.table17_min.find(r => r.segmentId === pipe.id);

        if (maxRow && minRow) {
            return {
                ...pipe,
                qMin_Ls: minRow.qmin_lps || 0,
                verificacion1105: {
                    max: {
                        apto: maxRow.status === 'OK',
                        motivo: maxRow.observation || 'OK'
                    },
                    min: {
                        apto: minRow.status === 'OK',
                        motivo: minRow.observation || 'OK'
                    }
                }
            };
        }
        return pipe;
    });

    return {
        chambers: currentChambers,
        pipes: currentPipes,
        topologyResult,
        sanitaryResult,
        hydraulicResult,
        uehResult,
        qwwResult,
        flowResult,
        verificationMatrix,
        errors: [...new Set(errors)],
        warnings: [...new Set(warnings)]
    };
}

export function recalcProjectFromSettings(
    chambers: Chamber[],
    pipes: Pipe[],
    settings: ProjectSettings
): RecalcProjectResult {
    return recalcProject(chambers, pipes, {
        projectType: settings.projectType,
        sanitarySystemType: settings.sanitarySystemType,
        flowDesignModeCollectors: settings.flowDesignModeCollectors,
        hasPopulation: settings.hasPopulation,
        populationTotal: settings.populationTotal,
        D_L_per_hab_day: settings.D_L_per_hab_day,
        R_recovery: settings.R_recovery,
        C_capacity: settings.C_capacity,
        nch1105: settings.nch1105
    });
}

export type { TopologyPipelineResult, SanitaryEngineResult, HydraulicEngineResult };
