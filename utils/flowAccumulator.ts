import { Chamber, Pipe, PipeHydraulicsDesign, ProjectSettings } from '../context/ProjectContext';
import { calculateQmdAS_Lps } from './designFlowCalculator';
import { computeNCh1105Peak } from '../calc/gravity/nch1105Peak';
import { getEffectivePipe } from './getEffectivePipe';

export interface FlowResult {
    chambers: Chamber[];
    pipes: Pipe[];
    errors: string[];
}

export interface FlowAccumulatorConfig {
    settings?: Partial<ProjectSettings>;
}

function normalizeNCh1105Settings(settings?: Partial<ProjectSettings>): ProjectSettings['nch1105'] {
    const raw = settings?.nch1105;
    const peakMode = raw?.peakMode === 'FORCE_HARMON' || raw?.peakMode === 'STRICT' || raw?.peakMode === 'AUTO'
        ? raw.peakMode
        : 'AUTO';
    const habPorCasaRaw = Number(raw?.habPorCasa);

    return {
        enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : true,
        peakMode,
        habPorCasa: Number.isFinite(habPorCasaRaw) && habPorCasaRaw > 0 ? habPorCasaRaw : null
    };
}

function toMethodQ(flowMethod: 'HARMON' | 'BSCE' | 'INTERPOLACION' | 'CAUDAL_DIRECTO' | null, fallback: PipeHydraulicsDesign['methodQ'] = 'UEH'): PipeHydraulicsDesign['methodQ'] {
    if (flowMethod === 'BSCE') return 'TABLA';
    if (flowMethod === 'HARMON') return 'HARMON';
    if (flowMethod === 'INTERPOLACION') return 'INTERPOLACION';
    if (flowMethod === 'CAUDAL_DIRECTO') return 'CAUDAL_DIRECTO';
    return fallback;
}

function getSourceIdForChamber(chamber: Chamber): string {
    const groupId = chamber.installationGroupId?.trim();
    return groupId && groupId.length > 0 ? groupId : chamber.id;
}

function buildSourceUEHMap(chambers: Chamber[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const chamber of chambers) {
        const uehLocal = Number(chamber.uehPropias?.value || 0);
        if (uehLocal <= 0) continue;
        const sourceId = getSourceIdForChamber(chamber);
        map.set(sourceId, (map.get(sourceId) || 0) + uehLocal);
    }
    return map;
}

/**
 * Calculates Continuous Flow accumulation (NCh 1105) for a network.
 * Rule: Q_tramo = Sum(Q_in_upstream)
 * 
 * For COLECTOR segments with POBLACION_NCH1105 sizing mode:
 * Uses population-based calculation instead of accumulated flow.
 * 
 * For COLECTOR segments with POBLACION_PONDERADA_UEH sizing mode:
 * Uses weighted population from UEH distribution.
 *
 * SYSTEMATIC RESET RULES:
 * 1. Pipe.qContinuous is RESET to 0 before accumulation.
 * 2. Only Chamber.Qin is considered as a source. Use 0 if undefined.
 */
export const calculateFlowAccumulation = (
    chambers: Chamber[],
    pipes: Pipe[],
    config?: FlowAccumulatorConfig
): FlowResult => {
    const errors: string[] = [];
    const memo = new Map<string, { flow: number, hasInput: boolean }>();
    const visiting = new Set<string>();

    const D_default = Number(config?.settings?.D_L_per_hab_day ?? 150);
    const R_default = Number(config?.settings?.R_recovery ?? 0.8);
    const C_default = Number(config?.settings?.C_capacity ?? 1.0);
    const nch1105Settings = normalizeNCh1105Settings(config?.settings);
    const hasPopulation = config?.settings?.hasPopulation === true;
    const P_total = hasPopulation ? Number(config?.settings?.populationTotal ?? 0) : 0;

    const initialPipes = pipes.map(p => ({
        ...p,
        qContinuous: { value: 0, origin: 'calculated' as const },
        hasUpstreamInput: false
    }));

    const upstreamMap = new Map<string, string[]>();
    initialPipes.forEach(p => {
        if (p.startNodeId && p.endNodeId) {
            const list = upstreamMap.get(p.endNodeId) || [];
            list.push(p.startNodeId);
            upstreamMap.set(p.endNodeId, list);
        }
    });

    const getAccumulatedFlow = (chamberId: string): { flow: number, hasInput: boolean } => {
        if (visiting.has(chamberId)) {
            if (!errors.includes('Error: ciclo de flujo detectado en cámaras (Red Pública).')) {
                errors.push('Error: ciclo de flujo detectado en cámaras (Red Pública).');
            }
            return { flow: 0, hasInput: false };
        }

        if (memo.has(chamberId)) return memo.get(chamberId)!;

        const chamber = chambers.find(c => c.id === chamberId);
        if (!chamber) return { flow: 0, hasInput: false };

        visiting.add(chamberId);

        let sumUpstream = 0;
        let hasInput = false;
        const upstreams = upstreamMap.get(chamberId) || [];

        upstreams.forEach(upId => {
            const res = getAccumulatedFlow(upId);
            sumUpstream += res.flow;
            if (res.hasInput) hasInput = true;
        });

        const localQin = Number(chamber.Qin?.value || 0);
        if (localQin > 0) hasInput = true;

        const total = localQin + sumUpstream;

        visiting.delete(chamberId);
        const result = { flow: total, hasInput };
        memo.set(chamberId, result);
        return result;
    };

    const memoLen = new Map<string, number>();

    const getAccumulatedDN175Length = (chamberId: string): number => {
        if (memoLen.has(chamberId)) return memoLen.get(chamberId)!;
        const incoming = pipes.filter(p => p.endNodeId === chamberId);
        let maxUpstreamLen = 0;
        for (const p of incoming) {
            const dn = Number(p.diameter?.value || 0);
            const len = Number(p.length?.value || 0);
            if (dn === 175) {
                const upLen = getAccumulatedDN175Length(p.startNodeId!);
                maxUpstreamLen = Math.max(maxUpstreamLen, upLen + len);
            }
        }
        memoLen.set(chamberId, maxUpstreamLen);
        return maxUpstreamLen;
    };

    const sourceUEH = buildSourceUEHMap(chambers);
    const UEH_total = Array.from(sourceUEH.values()).reduce((sum, value) => sum + value, 0);

    const updatedPipes = initialPipes.map(p => {
        if (!p.startNodeId) return p;

        const res = getAccumulatedFlow(p.startNodeId);

        // Calculate DN175 length for this pipe
        const my_dn = Number(p.diameter?.value || 0);
        let cumulativeLengthDN175_m = 0;
        if (my_dn === 175) {
            const upLen = getAccumulatedDN175Length(p.startNodeId);
            cumulativeLengthDN175_m = upLen + Number(p.length?.value || 0);
        }

        // Calculate DN reduction flag
        let dnReductionFlag = false;
        let dnReductionMotivo: string | null = null;
        const incomingForNode = pipes.filter(other => other.endNodeId === p.startNodeId);
        if (incomingForNode.length > 0) {
            const maxInDn = Math.max(...incomingForNode.map(inc => Number(inc.diameter?.value || 0)));
            const my_dn_val = Number(p.diameter?.value || 200);
            if (my_dn_val < maxInDn) {
                dnReductionFlag = true;
                dnReductionMotivo = `Reducción de DN aguas abajo: DN_in_max=${maxInDn} mm -> DN_out=${my_dn_val} mm`;
            }
        }

        const eff = getEffectivePipe(p);
        const isPublicoProject = config?.settings?.projectType === 'Público';

        const qwwTransportado = Number(p.qwwTransportado?.value || 0);
        let qContinuousValue = res.flow;
        let flowMethodNCh1105: 'HARMON' | 'BSCE' | 'INTERPOLACION' | 'CAUDAL_DIRECTO' | null = null;
        let P_tributaria: number | undefined;
        let Qmed_Lps: number | undefined;
        let M_harmon: number | undefined;
        let Qmax_Lps: number | undefined;
        
        // CRITICAL: Preserve P_edge from previous population accumulator step
        let P_edge: number | undefined = p.P_edge; 
        
        let sourceMode: PipeHydraulicsDesign['sourceMode'] = 'UEH_Qww';
        let methodQ: PipeHydraulicsDesign['methodQ'] = 'UEH';
        let qDesignValue = qContinuousValue > 0 ? qContinuousValue : qwwTransportado;
        let N_casas: number | undefined;
        let habPorCasaUsado: number | undefined;
        let Qbsce_Lps: number | undefined;
        let peakReason: 'AUTO' | 'FORZADO_HARMON' | 'ESTRICTO' | undefined;
        let peakNote: string | undefined;
        let peakBlocked: boolean | undefined;
        let peakMissingHabPorCasa: boolean | undefined;
        
        const sourceIds = Array.isArray(p.sources) ? p.sources : [];
        const uehFromTopology = sourceIds.reduce((sum, sourceId) => sum + (sourceUEH.get(sourceId) || 0), 0);
        const uehLegacy = Number(p.uehTransportadas?.value || p.UEH_upstream || 0);
        const uehUpstream = uehFromTopology > 0 ? uehFromTopology : uehLegacy;

        // --- NCh1105 Logic: Apply population-based design if project is Public OR role is COLECTOR (if configured) ---
        const shouldUsePopulationDesign = isPublicoProject || (eff.role === 'COLECTOR' && p.designOptions?.collectorSizingMode !== 'UEH_Qww');

        if (shouldUsePopulationDesign) {
            const sizingMode = p.designOptions?.collectorSizingMode || 'POBLACION_NCH1105';
            sourceMode = isPublicoProject ? 'POBLACION_NCH1105' : sizingMode;

            // ── Determine Population to use ──
            const P_used = isPublicoProject
                ? Math.max(0, Number(P_edge ?? 0)) // Uses the fresh P_edge from accumulatePopulation
                : (sizingMode === 'POBLACION_PONDERADA_UEH' 
                    ? (UEH_total > 0 ? (uehUpstream / UEH_total) * P_total : 0)
                    : P_total);

            if (P_used > 0) {
                const QmdAS = calculateQmdAS_Lps({
                    P: P_used,
                    D: D_default,
                    R: R_default,
                    C: C_default
                });
                const popResult = computeNCh1105Peak({
                    P_edge: P_used,
                    QmdAS,
                    settings: nch1105Settings
                });
                qContinuousValue = res.flow;
                flowMethodNCh1105 = popResult.method;
                P_tributaria = P_used;
                P_edge = P_used;
                Qmed_Lps = QmdAS;
                M_harmon = popResult.M;
                Qmax_Lps = popResult.Qmaxh;
                qDesignValue = popResult.Qmaxh;
                methodQ = toMethodQ(popResult.method, 'HARMON');
                N_casas = popResult.Ncasas;
                habPorCasaUsado = popResult.habPorCasaUsado;
                Qbsce_Lps = popResult.method === 'BSCE' ? popResult.Qmaxh : undefined;
                peakReason = popResult.reason;
                peakNote = popResult.note;
                peakBlocked = popResult.blocked;
                peakMissingHabPorCasa = popResult.missingHabPorCasa;
            } else {
                qDesignValue = 0;
                qContinuousValue = 0;
                methodQ = 'HARMON';
                if (isPublicoProject) {
                    // This error will be gathered later if P_edge is still 0
                }
            }
        } else if (eff.role === 'LATERAL' || eff.role === 'CAÑERIA' || eff.role === 'COLECTOR') {
            // Domiciliary or non-population Colector
            qDesignValue = qContinuousValue > 0 ? qContinuousValue : qwwTransportado;
            flowMethodNCh1105 = qDesignValue > 0 ? 'CAUDAL_DIRECTO' : null;
            methodQ = 'UEH';
        } else if (eff.role === 'DESCARGA_HORIZ') {
            qDesignValue = qwwTransportado;
            methodQ = 'UEH';
        } else {
            qDesignValue = qwwTransportado > 0 ? qwwTransportado : qContinuousValue;
            methodQ = 'UEH';
        }

        // Add error if in Public mode and P=0
        if (isPublicoProject && (!P_edge || P_edge <= 0)) {
            errors.push(`Tramo ${p.userDefinedId || p.id}: Sin caudal (P=0). Defina población en cámaras upstream.`);
        }

        const hydraulics: PipeHydraulicsDesign = {
            Q_design_Lps: Math.max(0, qDesignValue || 0),
            methodQ,
            flowMethodNCh1105,
            sourceMode,
            modelHydraulic: 'MANNING',
            inputs: {
                P_total: P_total > 0 ? P_total : undefined,
                P_edge,
                D: D_default,
                R: R_default,
                C: C_default,
                QmdAS_Lps: Qmed_Lps,
                M_harmon: M_harmon,
                UEH_total,
                UEH_upstream: uehUpstream,
                Qww_Lps: qwwTransportado,
                N_casas,
                equivalentHouses: N_casas,
                habPorCasaUsado,
                Qbsce_Lps,
                peakMode: nch1105Settings.peakMode,
                peakReason,
                peakNote,
                peakBlocked,
                peakMissingHabPorCasa,
                habPorCasa: nch1105Settings.habPorCasa ?? null
            }
        };

        return {
            ...p,
            qContinuous: {
                value: qContinuousValue,
                origin: 'calculated' as const
            },
            qinTransportado: {
                value: res.flow,
                origin: 'calculated' as const
            },
            hasUpstreamInput: res.hasInput,
            flowMethodNCh1105,
            P_tributaria,
            P_edge,
            Qmed_Lps,
            M_harmon,
            Qmax_Lps,
            Q_design_Lps: hydraulics.Q_design_Lps,
            hydraulics,
            cumulativeLengthDN175_m,
            dnReductionFlag,
            dnReductionMotivo
        };
    });

    const updatedChambers = chambers.map(c => {
        const res = getAccumulatedFlow(c.id);
        return {
            ...c,
            qinAcumulado: {
                value: res.flow,
                origin: 'calculated' as const
            }
        };
    });

    return {
        chambers: updatedChambers,
        pipes: updatedPipes,
        errors
    };
};
