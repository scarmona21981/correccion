import { SourceEdge, PipeAutoClassification, PipeOverride, PipeEffective } from '../sourcePropagationEngine';
import { PipeRole } from '../../utils/pipeRole';
import { TopologyRegime, TopologyRole } from './roleMapping';

export interface OverrideResult {
    edge: SourceEdge;
    changed: boolean;
}

export function getRegimeForPipeRole(pipeRole: PipeRole): TopologyRegime {
    return pipeRole === 'COLECTOR_EXTERIOR' ? 'NCH1105' : 'NCH3371';
}

export function getTopologyRoleForPipeRole(pipeRole: PipeRole): TopologyRole {
    switch (pipeRole) {
        case 'COLECTOR_EXTERIOR':
            return 'COLECTOR';
        case 'DESCARGA_HORIZ':
            return 'LATERAL';
        case 'INTERIOR_RAMAL':
        default:
            return 'RAMAL_INTERIOR';
    }
}

export function applyPipeOverride(edge: SourceEdge): OverrideResult {
    if (!edge.auto) {
        edge.auto = {
            sources: edge.sources || [],
            pipeRole: edge.pipeRole,
            topologyRegime: edge.topologyRegime,
            topologyRole: edge.topologyRole
        };
    }

    // We no longer persist 'effective'. 
    // The source of truth is `auto` and `override` resolving through `resolveNormativeState(edge)`.
    return { edge, changed: true }; // changed is handled by caller when setting overrides
}

export function applyAllPipeOverrides(edges: SourceEdge[]): { edges: SourceEdge[]; changedCount: number } {
    let changedCount = 0;

    for (const edge of edges) {
        const result = applyPipeOverride(edge);
        if (result.changed) changedCount++;
    }

    return { edges, changedCount };
}

export function setPipeOverride(
    edge: SourceEdge,
    enabled: boolean,
    pipeRole?: PipeRole,
    reason?: string
): SourceEdge {
    const now = new Date().toISOString();

    if (!edge.override || edge.override.enabled !== enabled) {
        edge.override = {
            enabled,
            pipeRole: enabled ? pipeRole : undefined,
            reason: enabled ? reason : undefined,
            changedAt: now
        };
    } else if (enabled && pipeRole && edge.override.pipeRole !== pipeRole) {
        edge.override = {
            ...edge.override,
            pipeRole,
            reason: reason || edge.override.reason,
            changedAt: now
        };
    }

    return applyPipeOverride(edge).edge;
}

export function clearPipeOverride(edge: SourceEdge): SourceEdge {
    edge.override = { enabled: false };
    return applyPipeOverride(edge).edge;
}

export function migrateLegacyEdge(edge: SourceEdge): SourceEdge {
    if (!edge.auto && (edge.pipeRole || edge.topologyRegime || edge.topologyRole)) {
        const legacyRole = edge.pipeRole || 'DESCARGA_HORIZ';
        edge.auto = {
            sources: edge.sources || [],
            pipeRole: legacyRole,
            topologyRegime: edge.topologyRegime || getRegimeForPipeRole(legacyRole),
            topologyRole: edge.topologyRole || getTopologyRoleForPipeRole(legacyRole)
        };
    }

    if (!edge.override) {
        edge.override = { enabled: false };
    }

    // Explicitly clear legacy 'effective' data from being the source of truth
    if (edge.effective) {
        edge.effective = undefined;
    }

    return edge;
}
