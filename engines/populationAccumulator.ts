/**
 * populationAccumulator.ts
 *
 * Calcula P_acum por cámara y P_edge por tramo para proyectos Públicos (NCh1105).
 * La lógica es equivalente a la acumulación de UEH/Qin, pero para población (hab).
 *
 * Reglas:
 * - P_node(c) = max(0, c.populationLocal ?? 0)
 * - P_acum(c) = P_node(c) + sum(P_acum(upstream_chamber)) para cada tramo entrante
 * - P_edge(pipe) = P_acum(pipe.startNodeId)  [población acumulada que ENTRA al tramo]
 *
 * Solo se usa cuando settings.projectType === 'Público'.
 * Es seguro ante ciclos (detección y fallback 0 con warning).
 */

import { Chamber, Pipe } from '../context/ProjectContext';

export interface PopulationAccumulatorResult {
    chambers: Chamber[];
    pipes: Pipe[];
    warnings: string[];
}

export function accumulatePopulation(
    chambers: Chamber[],
    pipes: Pipe[]
): PopulationAccumulatorResult {
    const warnings: string[] = [];

    // Mapa inicial de P_local por cámara
    const pLocal = new Map<string, number>();
    for (const c of chambers) {
        const p = Math.max(0, Number(c.populationLocal ?? 0));
        pLocal.set(c.id, p);
    }

    // Mapa de cámaras upstream: para cada chamberId, lista de chamberIds que le envían flujo
    // (es decir, los startNodeId de tramos cuyo endNodeId === chamberId)
    const upstreamMap = new Map<string, string[]>();
    for (const pipe of pipes) {
        if (!pipe.startNodeId || !pipe.endNodeId) continue;
        const existing = upstreamMap.get(pipe.endNodeId) || [];
        existing.push(pipe.startNodeId);
        upstreamMap.set(pipe.endNodeId, existing);
    }

    // Caché de P_acum calculado por cámara
    const memo = new Map<string, number>();
    const visiting = new Set<string>(); // detección de ciclos

    function getPAcum(chamberId: string): number {
        if (memo.has(chamberId)) return memo.get(chamberId)!;
        if (visiting.has(chamberId)) {
            if (!warnings.some(w => w.includes(chamberId))) {
                warnings.push(`[PopAcum] Ciclo detectado en cámara ${chamberId}. P_acum = 0 (fallback).`);
            }
            return 0;
        }

        visiting.add(chamberId);

        const p_node = pLocal.get(chamberId) ?? 0;
        const upstreamIds = upstreamMap.get(chamberId) || [];
        let sumUpstream = 0;
        for (const upId of upstreamIds) {
            sumUpstream += getPAcum(upId);
        }

        visiting.delete(chamberId);
        const p_acum = p_node + sumUpstream;
        memo.set(chamberId, p_acum);
        return p_acum;
    }

    // Calcular P_acum para todas las cámaras
    for (const c of chambers) {
        getPAcum(c.id);
    }

    // Actualizar cámaras con P_acum calculado
    const updatedChambers: Chamber[] = chambers.map(c => ({
        ...c,
        P_acum: memo.get(c.id) ?? 0
    }));

    // Actualizar pipes con P_edge = P_acum de la cámara startNode
    const updatedPipes: Pipe[] = pipes.map(pipe => {
        if (!pipe.startNodeId) return pipe;
        const p_edge = memo.get(pipe.startNodeId) ?? 0;
        return {
            ...pipe,
            P_edge: p_edge
        };
    });

    return {
        chambers: updatedChambers,
        pipes: updatedPipes,
        warnings
    };
}
