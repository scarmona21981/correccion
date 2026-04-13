/**
 * roleUtils.ts
 *
 * Utilitarios para la resolución del rol gravitacional NCh1105 por tramo.
 * Centraliza la lógica de "rol efectivo" (manual > auto > fallback).
 */

import { GravityRole } from './mapTopologyRoleToGravityRole';

/** Tipo reducido de GravityRole para redes públicas (sin INTERCEPTOR/EMISARIO). */
export type GravityRolePublico = 'NACIENTE' | 'LATERAL' | 'COLECTOR';

/** Interfaz mínima que necesita getEffectiveRole */
export interface GravitySegmentLike {
    id?: string;
    gravityRole_auto?: GravityRolePublico;
    gravityRole_manual?: GravityRolePublico | null;
    /** Rol heredado del sistema topológico anterior (compatibilidad) */
    role?: GravityRole;
}

/**
 * Devuelve el rol efectivo NCh1105 para el tramo:
 *   1. Si existe gravityRole_manual → úsalo (override del usuario)
 *   2. Si existe role               → úsalo (rol efectivo pre-resuelto)
 *   3. Si existe gravityRole_auto   → úsalo (calculado por topología)
 *   4. Fallback: "LATERAL"
 */
export function getEffectiveRole(seg: GravitySegmentLike): GravityRole {
    if (seg.gravityRole_manual) return seg.gravityRole_manual;
    if (seg.role) return seg.role;
    if (seg.gravityRole_auto) return seg.gravityRole_auto;
    return 'LATERAL'; // fallback seguro
}

/**
 * Devuelve si el rol fue sobreescrito manualmente.
 */
export function isRoleManual(seg: GravitySegmentLike): boolean {
    if (seg.gravityRole_manual != null) return true;
    if (seg.role && seg.gravityRole_auto) return seg.role !== seg.gravityRole_auto;
    return false;
}

/**
 * Devuelve si el rol manual difiere del auto (warning visual).
 */
export function hasRoleConflict(seg: GravitySegmentLike): boolean {
    return (
        seg.gravityRole_manual != null &&
        seg.gravityRole_auto != null &&
        seg.gravityRole_manual !== seg.gravityRole_auto
    );
}

/**
 * Clasifica automáticamente el rol de un tramo según topología de red.
 * Reglas NCh1105 (hidráulicas):
 *   - NACIENTE: nodo inicio SIN tramos entrantes → primer tramo de la red.
 *   - LATERAL: nodo inicio CON tramos entrantes → transporta caudal acumulado.
 *
 * NOTA (2026 UX): Se prefiere LATERAL como default para evitar sobredimensionar.
 * COLECTOR se reserva para overrides manuales o tramos troncales explícitos.
 */
export function classifyRoleAuto(
    segmentId: string,
    startNodeId: string,
    endNodeId: string,
    /** Map: nodeId → lista de segmentIds que llegan a ese nodo */
    incomingMap: Map<string, string[]>
): GravityRolePublico {
    const incomingToStart = incomingMap.get(startNodeId)?.length ?? 0;

    // NACIENTE → nadie llega al nodo inicial (inicio de red)
    if (incomingToStart === 0) return 'NACIENTE';

    // Para evitar sobredimensionar, el default automático es LATERAL.
    return 'LATERAL';
}

/**
 * Construye el mapa de tramos entrantes por nodo para el grafo actual.
 * Util para pasarlo a classifyRoleAuto en batch.
 */
export function buildIncomingMap(
    pipes: { id: string; startNodeId?: string; endNodeId?: string }[]
): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const pipe of pipes) {
        if (!pipe.endNodeId) continue;
        const existing = map.get(pipe.endNodeId) ?? [];
        existing.push(pipe.id);
        map.set(pipe.endNodeId, existing);
    }
    return map;
}
