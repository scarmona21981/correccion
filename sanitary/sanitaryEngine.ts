import { Chamber, Pipe, ProjectSettings } from '../context/ProjectContext';
import { calculateUEHAccumulation, UEHResult } from '../utils/uehAccumulator';
import { calculateFlowAccumulation, FlowResult } from '../utils/flowAccumulator';
import { PipeRole, resolveEffectivePipeRole } from '../utils/pipeRole';
import { getDesignFlow, DesignFlowResult, harmonCoefficient, calculatePeakFlow_NCh1105 } from '../utils/designFlowCalculator';
import { getEffectivePipe } from '../utils/getEffectivePipe';

export interface SanitaryEngineConfig {
    settings?: Partial<ProjectSettings>;
}

export interface SanitaryPipeResult {
    pipeId: string;
    chamberId: string;
    pipeRole?: PipeRole;
    uehPropias: number;
    uehAcumuladas: number;
    qinPropio_Ls: number;
    qinAcumulado_Ls: number;
    qDiseno_Ls: number;
    qww_Ls: number;
    qContinuous_Ls: number;
    hasUpstreamInput: boolean;
    isSourceNode: boolean;
    calculationMethod: 'UEH' | 'QWW' | 'Q_CONTINUOUS' | 'NONE';
    errors: string[];
}

export interface SanitaryChamberResult {
    chamberId: string;
    uehPropias: number;
    uehAcumuladas: number;
    qinPropio_Ls: number;
    qinAcumulado_Ls: number;
    hasUpstreamInput: boolean;
}

export interface SanitaryEngineResult {
    pipes: SanitaryPipeResult[];
    chambers: SanitaryChamberResult[];
    errors: string[];
    warnings: string[];
}

export function executeSanitaryEngine(
    chambers: Chamber[],
    pipes: Pipe[],
    config?: SanitaryEngineConfig
): SanitaryEngineResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!chambers || chambers.length === 0) {
        errors.push('No hay camaras definidas en el proyecto');
        return { pipes: [], chambers: [], errors, warnings };
    }

    if (!pipes || pipes.length === 0) {
        errors.push('No hay tuberias definidas en el proyecto');
        return { pipes: [], chambers: [], errors, warnings };
    }

    let uehResult: UEHResult;
    try {
        uehResult = calculateUEHAccumulation(chambers, pipes);
        if (uehResult.errors.length > 0) {
            errors.push(...uehResult.errors);
        }
    } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Error desconocido en acumulacion UEH';
        errors.push(`Error en calculo UEH: ${errMsg}`);
        return { pipes: [], chambers: [], errors, warnings };
    }

    let flowResult: FlowResult;
    try {
        flowResult = calculateFlowAccumulation(uehResult.chambers, uehResult.pipes, { settings: config?.settings });
        if (flowResult.errors.length > 0) {
            errors.push(...flowResult.errors);
        }
    } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Error desconocido en acumulacion de flujo';
        errors.push(`Error en calculo de flujo: ${errMsg}`);
        return { pipes: [], chambers: [], errors, warnings };
    }

    const chamberMap = new Map<string, SanitaryChamberResult>();
    for (const c of flowResult.chambers) {
        chamberMap.set(c.id, {
            chamberId: c.id,
            uehPropias: Number(c.uehPropias?.value || 0),
            uehAcumuladas: Number(c.uehAcumuladas?.value || 0),
            qinPropio_Ls: Number(c.Qin?.value || 0),
            qinAcumulado_Ls: Number(c.qinAcumulado?.value || 0),
            hasUpstreamInput: !!(c.qinAcumulado && Number(c.qinAcumulado.value) > 0)
        });
    }

    const upstreamCountByNode = new Map<string, number>();
    for (const p of pipes) {
        if (p.endNodeId) {
            upstreamCountByNode.set(p.endNodeId, (upstreamCountByNode.get(p.endNodeId) || 0) + 1);
        }
    }

    const pipeResults: SanitaryPipeResult[] = flowResult.pipes.map(pipe => {
        const chamberId = pipe.startNodeId || '';
        const chamberResult = chamberMap.get(chamberId);
        const pipeRole = resolveEffectivePipeRole(pipe);
        const eff = getEffectivePipe(pipe);

        const uehAcc = Number(pipe.uehTransportadas?.value || 0);
        const qContinuous = Number(pipe.qContinuous?.value || 0);
        const qww_Ls = Number(pipe.qwwTransportado?.value || 0);

        let qDiseno_Ls = 0;
        let calculationMethod: SanitaryPipeResult['calculationMethod'] = 'NONE';

        if (eff.role === 'COLECTOR') {
            const qDesignHydraulic = Number(pipe.hydraulics?.Q_design_Lps || 0);
            if (qDesignHydraulic > 0 || pipe.hydraulics) {
                qDiseno_Ls = qDesignHydraulic;
                calculationMethod = 'Q_CONTINUOUS';
            } else {
                const designFlow = getDesignFlow(pipe, config?.settings as any);
                qDiseno_Ls = designFlow.Q_used_Lps;
                calculationMethod = 'Q_CONTINUOUS';
            }
        } else if (eff.role === 'LATERAL' || eff.role === 'DESCARGA_HORIZ') {
            qDiseno_Ls = Number(pipe.hydraulics?.Q_design_Lps || qww_Ls);
            calculationMethod = qww_Ls > 0 ? 'QWW' : 'NONE'
        } else if (eff.role === 'INTERIOR_RAMAL') {
            qDiseno_Ls = Number(pipe.hydraulics?.Q_design_Lps || 0);
            calculationMethod = uehAcc > 0 ? 'UEH' : 'NONE'
        } else {
            if (qww_Ls > 0) {
                qDiseno_Ls = qww_Ls;
                calculationMethod = 'QWW';
            } else if (qContinuous > 0) {
                qDiseno_Ls = qContinuous;
                calculationMethod = 'Q_CONTINUOUS';
            } else if (uehAcc > 0) {
                calculationMethod = 'UEH';
            }
        }

        const startUpstream = chamberId ? (upstreamCountByNode.get(chamberId) || 0) : 0;
        const isSourceNode = startUpstream === 0;

        if (chamberId && !chamberResult) {
            warnings.push(`Pipe ${pipe.id}: camara de inicio no encontrada`);
        }

        return {
            pipeId: pipe.id,
            chamberId,
            pipeRole,
            uehPropias: chamberResult?.uehPropias || 0,
            uehAcumuladas: uehAcc,
            qinPropio_Ls: chamberResult?.qinPropio_Ls || 0,
            qinAcumulado_Ls: chamberResult?.qinAcumulado_Ls || 0,
            qDiseno_Ls,
            qww_Ls,
            qContinuous_Ls: qContinuous,
            hasUpstreamInput: chamberResult?.hasUpstreamInput || qContinuous > 0 || uehAcc > 0,
            isSourceNode,
            calculationMethod,
            errors: []
        };
    });

    const pipesWithoutFlow = pipeResults.filter((p) => {
        const srcPipe = flowResult.pipes.find(pipe => pipe.id === p.pipeId);
        if (!srcPipe) return false;
        return p.qDiseno_Ls <= 0 && getEffectivePipe(srcPipe).role === 'COLECTOR';
    });
    if (pipesWithoutFlow.length > 0) {
        warnings.push(
            `${pipesWithoutFlow.length} tramo(s) colector(es) sin caudal acumulado. ` +
            `Verificar conexiones de red.`
        );
    }

    const chambersWithDownstream = new Set<string>();
    for (const p of pipes) {
        if (p.startNodeId) chambersWithDownstream.add(p.startNodeId);
    }

    for (const c of flowResult.chambers) {
        if (!chambersWithDownstream.has(c.id)) {
            const hasFlow = chamberMap.get(c.id)?.qinAcumulado_Ls || 0;
            if (hasFlow > 0) {
                warnings.push(`Camara ${c.userDefinedId}: terminal con caudal ${hasFlow.toFixed(2)} L/s sin salida`);
            }
        }
    }

    return {
        pipes: pipeResults,
        chambers: Array.from(chamberMap.values()),
        errors: [...new Set(errors)],
        warnings: [...new Set(warnings)]
    };
}

export function getDesignFlowForPipe(
    pipeId: string,
    sanitaryResult: SanitaryEngineResult
): number | null {
    const pipe = sanitaryResult.pipes.find(p => p.pipeId === pipeId);
    if (!pipe) return null;
    return pipe.qDiseno_Ls > 0 ? pipe.qDiseno_Ls : null;
}

export function getSanitaryDataForPipe(
    pipeId: string,
    sanitaryResult: SanitaryEngineResult
): SanitaryPipeResult | null {
    return sanitaryResult.pipes.find(p => p.pipeId === pipeId) || null;
}

export function hasValidFlow(
    sanitaryResult: SanitaryEngineResult
): boolean {
    return sanitaryResult.pipes.some(p => p.qDiseno_Ls > 0);
}

export function getFlowMap(
    sanitaryResult: SanitaryEngineResult
): Map<string, number> {
    const map = new Map<string, number>();
    for (const p of sanitaryResult.pipes) {
        map.set(p.pipeId, p.qDiseno_Ls);
    }
    return map;
}
