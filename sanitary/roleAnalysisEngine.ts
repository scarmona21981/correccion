import { Pipe, Chamber } from '../context/ProjectContext';
import { SanitaryEngineResult, SanitaryPipeResult } from './sanitaryEngine';
import { executeHydraulicEngine, HydraulicEngineResult } from '../hydraulics/hydraulicEngine';
import { executeNormativeEngine, NormativeEngineResult, NormativePipeResult } from '../normative/normativeEngine';
import { PipeRole, resolveEffectivePipeRole } from '../utils/pipeRole';

export interface RoleAnalysisOptions {
    localQwwByNode?: Record<string, number>;
    localQwwByPipe?: Record<string, number>;
    qwwTolerance?: number;
}

export interface RoleAnalysisRow {
    pipeId: string;
    displayName: string;
    role: PipeRole;
    dn: number;
    length: number;
    slope: number;
    material: string;
    nManning: number;
    fromNode: string;
    toNode: string;
    qin_Ls: number;
    qlocal_Ls: number;
    qUpstreamSum_Ls: number;
    qwwTransportado?: number;
    qcap_Ls?: number;
    vActual_m_s?: number;
    fillPercentage?: number;
    normStatus?: NormativePipeResult['status'];
    normReason?: string;
    normChecks?: NormativePipeResult['checks'];
    warnings: string[];
    methodLabel: string;
    stateLabel: string;
}

export interface RoleAnalysisTables {
    interior: RoleAnalysisRow[];
    descarga: RoleAnalysisRow[];
    colector: RoleAnalysisRow[];
}

export interface RoleAnalysisResult {
    tables: RoleAnalysisTables;
    errors: string[];
    warnings: string[];
}

interface PipeBuilder {
    pipe: Pipe;
    qin: number;
    qlocal: number;
    upstreamSum: number;
    hasUpstream: boolean;
    startNodeId: string;
    isSourceNode: boolean;
    displayName: string;
    warnings: string[];
}

function shortId(id: string): string {
    if (!id) return 'tramo-unknown';
    return id.slice(-6);
}

function getDisplayName(pipe: Pipe): string {
    const extras = pipe as Record<string, any>;
    const candidate = extras.name || extras.label || extras.meta?.title;
    if (candidate) return String(candidate);
    if (pipe.userDefinedId) return String(pipe.userDefinedId);
    return `Tramo ${shortId(pipe.id)}`;
}

function buildSanitaryResult(
    builders: PipeBuilder[],
    chambers: Chamber[]
): SanitaryEngineResult {
    const results: SanitaryPipeResult[] = builders.map(b => ({
        pipeId: b.pipe.id,
        chamberId: b.startNodeId,
        uehPropias: 0,
        uehAcumuladas: 0,
        qinPropio_Ls: b.qlocal,
        qinAcumulado_Ls: b.qin,
        qDiseno_Ls: b.qin,
        qww_Ls: b.qlocal,
        qContinuous_Ls: b.qin,
        hasUpstreamInput: b.hasUpstream,
        isSourceNode: b.isSourceNode,
        calculationMethod: b.qlocal > 0 ? 'QWW' : 'Q_CONTINUOUS',
        errors: b.warnings
    }));

    const chamberResults = chambers.map(c => ({
        chamberId: c.id,
        uehPropias: Number(c.uehPropias?.value || 0),
        uehAcumuladas: Number(c.uehAcumuladas?.value || 0),
        qinPropio_Ls: Number(c.Qin?.value || 0),
        qinAcumulado_Ls: Number(c.qinAcumulado?.value || 0),
        hasUpstreamInput: !!c.qinAcumulado?.value && Number(c.qinAcumulado.value) > 0
    }));

    return {
        pipes: results,
        chambers: chamberResults,
        errors: [],
        warnings: []
    };
}

function accumulateQin(
    pipes: Pipe[],
    options: RoleAnalysisOptions,
    warnings: string[]
): Map<string, PipeBuilder> {
    const nodeIncoming = new Map<string, number>();
    const outgoingPipes = new Map<string, Pipe[]>();
    const localNodeQww = options.localQwwByNode || {};
    const localPipeQww = options.localQwwByPipe || {};

    const nodes = new Set<string>();
    for (const pipe of pipes) {
        const start = pipe.startNodeId || '';
        const end = pipe.endNodeId || '';
        nodes.add(start);
        nodes.add(end);

        nodeIncoming.set(end, (nodeIncoming.get(end) || 0) + 1);
        const list = outgoingPipes.get(start) || [];
        list.push(pipe);
        outgoingPipes.set(start, list);
    }

    const queue: string[] = [];
    nodes.forEach(node => {
        if (!nodeIncoming.has(node) || nodeIncoming.get(node) === 0) {
            queue.push(node);
        }
    });

    const nodeUpstreamSums = new Map<string, number>();
    const builderMap = new Map<string, PipeBuilder>();
    const totalNodes = nodes.size;
    let processedNodes = 0;

    while (queue.length) {
        const nodeId = queue.shift()!;
        processedNodes += 1;
        const upstreamSum = nodeUpstreamSums.get(nodeId) || 0;
        const outgoing = outgoingPipes.get(nodeId) || [];
        const nodeLocal = localNodeQww[nodeId] || 0;

        for (const pipe of outgoing) {
            const extras = pipe as Record<string, any>;
            const hasPipeLocal = localPipeQww[pipe.id] ?? extras.localQww ?? 0;
            const qlocalPipe = hasPipeLocal + nodeLocal;
            const qin = upstreamSum + qlocalPipe;
            const downstream = pipe.endNodeId || '';
            const prev = nodeUpstreamSums.get(downstream) || 0;
            nodeUpstreamSums.set(downstream, prev + qin);

            const indeg = nodeIncoming.get(downstream) ?? 0;
            nodeIncoming.set(downstream, indeg - 1);
            if (nodeIncoming.get(downstream) === 0) {
                queue.push(downstream);
            }

            const builder: PipeBuilder = {
                pipe,
                qin,
                qlocal: qlocalPipe,
                upstreamSum,
                hasUpstream: upstreamSum > 0,
                startNodeId: nodeId,
                isSourceNode: upstreamSum === 0 && qlocalPipe > 0,
                displayName: getDisplayName(pipe),
                warnings: []
            };
            builderMap.set(pipe.id, builder);

            const qwwTransportado = Number(pipe.qwwTransportado?.value || 0);
            if (qwwTransportado > 0) {
                const diff = Math.abs(qin - qwwTransportado);
                const tolerance = options.qwwTolerance ?? 1e-6;
                if (diff > tolerance) {
                    const msg = `QwwTransportado (${qwwTransportado.toFixed(3)}) difiere de Qin (${qin.toFixed(3)}) en ${diff.toFixed(3)}`;
                    builder.warnings.push(msg);
                    warnings.push(msg);
                }
            }
            if (nodeLocal > 0 && outgoing.length > 1 && hasPipeLocal === 0) {
                const msg = `Nodo ${nodeId} aporta ${nodeLocal.toFixed(3)} L/s pero tiene ${outgoing.length} salidas`; 
                builder.warnings.push(msg);
                warnings.push(msg);
            }
        }
    }

    if (processedNodes < totalNodes) {
        warnings.push('Ciclo detectado en la red de caudales');
    }

    return builderMap;
}

function createTables(
    builders: Map<string, PipeBuilder>,
    pipes: Pipe[],
    hydraulicResult: HydraulicEngineResult,
    normativeResult: NormativeEngineResult
): RoleAnalysisTables {
    const hydraulicMap = new Map(hydraulicResult.pipes.map(p => [p.pipeId, p]));
    const normativeMap = new Map(normativeResult.pipes.map(p => [p.pipeId, p]));

    const interior: RoleAnalysisRow[] = [];
    const descarga: RoleAnalysisRow[] = [];
    const colector: RoleAnalysisRow[] = [];

    for (const pipe of pipes) {
        const builder = builders.get(pipe.id);
        if (!builder) continue;

        const hydData = hydraulicMap.get(pipe.id);
        const normData = normativeMap.get(pipe.id);
        const row: RoleAnalysisRow = {
            pipeId: pipe.id,
            displayName: builder.displayName,
            role: resolveEffectivePipeRole(pipe),
            dn: Number(pipe.diameter?.value || pipe.diameter || 0),
            length: Number(pipe.length?.value || pipe.length || 0),
            slope: Number(pipe.slope?.value || pipe.slope || 0),
            material: String(pipe.material?.value || pipe.material || 'PVC'),
            nManning: hydData?.nManning ?? 0,
            fromNode: builder.startNodeId,
            toNode: pipe.endNodeId || '',
            qin_Ls: builder.qin,
            qlocal_Ls: builder.qlocal,
            qUpstreamSum_Ls: builder.upstreamSum,
            qwwTransportado: Number(pipe.qwwTransportado?.value || 0),
            qcap_Ls: hydData?.qFullCapacity_Ls,
            vActual_m_s: hydData?.vActual_m_s,
            fillPercentage: hydData?.fillPercentage,
            normStatus: normData?.status,
            normReason: normData?.motivo,
            normChecks: normData?.checks,
            warnings: builder.warnings,
            methodLabel: '',
            stateLabel: normData?.status ?? 'NO_APTO'
        };

        row.methodLabel =
            row.role === 'INTERIOR_RAMAL'
                ? 'Tablas UD/UEH'
                : row.role === 'COLECTOR_EXTERIOR'
                    ? 'Manning + NCh1105'
                    : 'Manning (B.2.5)';

        switch (row.role) {
            case 'INTERIOR_RAMAL':
                interior.push(row);
                break;
            case 'DESCARGA_HORIZ':
                descarga.push(row);
                break;
            case 'COLECTOR_EXTERIOR':
                colector.push(row);
                break;
        }
    }

    return { interior, descarga, colector };
}

export function analyzeTramosByRole(
    chambers: Chamber[],
    pipes: Pipe[],
    options: RoleAnalysisOptions = {}
): RoleAnalysisResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const builders = accumulateQin(pipes, options, warnings);
    if (builders.size !== pipes.length) {
        errors.push('No se pudo calcular Qin para todos los tramos (posible ciclo)');
    }

    const sanitaryResult = buildSanitaryResult(Array.from(builders.values()), chambers);
    const hydraulicResult = executeHydraulicEngine(pipes, sanitaryResult);
    const normativeResult = executeNormativeEngine(pipes, sanitaryResult, hydraulicResult);

    const tables = createTables(builders, pipes, hydraulicResult, normativeResult);
    return { tables, errors, warnings };
}
