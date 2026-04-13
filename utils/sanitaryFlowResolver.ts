/**
 * Sanitary Flow Resolver
 * 
 * Integra los acumuladores UEH y de caudal continuo ANTES de cualquier verificación normativa.
 * Esto asegura que los colectores reciban el caudal acumulado de los ramales conectados.
 */

import { Chamber, Pipe, ProjectSettings } from '../context/ProjectContext';
import { SanitarySystemType } from '../hydraulics/qwwTables';
import { calculateUEHAccumulation, UEHResult } from './uehAccumulator';
import { calculateQwwAccumulation, QwwResult } from './qwwAccumulator';
import { calculateFlowAccumulation, FlowResult } from './flowAccumulator';

export interface SanitaryFlowMap {
    pipeId: string;
    qContinuous_Ls: number;      // Caudal continuo calculado (L/s)
    uehAcumuladas: number;        // UEH acumuladas calculadas
    hasUpstreamInput: boolean;     // Flag: hay aportes aguas arriba
}

export interface SanitaryFlowResult {
    chambers: Chamber[];
    pipes: Pipe[];
    flowMap: Map<string, SanitaryFlowMap>;
    errors: string[];
}

/**
 * Calcula caudales sanitarios para toda la red.
 * Ejecuta en secuencia:
 * 1. Acumulación UEH (cálculo de UEH propias + acumuladas por cámara)
 * 2. Acumulación de flujo continuo (Qin + sum(Q aguas arriba))
 * 
 * @param chambers - Cámaras del proyecto
 * @param pipes - Tuberías del proyecto
 * @returns pipes actualizadas con valores calculados + mapa de flujos por pipeId
 */
export function computeSanitaryFlows(
    chambers: Chamber[],
    pipes: Pipe[],
    sanitarySystemType: SanitarySystemType = 'I',
    settings?: Partial<ProjectSettings>
): SanitaryFlowResult {
    const errors: string[] = [];

    // Paso 1: Calcular UEH acumuladas
    // Esto calcula uehPropias + sum(uehAcumuladas de cámaras aguas arriba)
    // y asigna uehTransportadas a cada pipe basado en la cámara de inicio
    const uehResult: UEHResult = calculateUEHAccumulation(chambers, pipes);

    // Recolectar errores del paso 1
    if (uehResult.errors.length > 0) {
        errors.push(...uehResult.errors);
    }

    // Paso 1.1: Calcular Qww acumulado (NCh3371 Anexo B)
    // CRÍTICO: Necesario para que la tabla normativa lea qwwTransportado correcto
    // en roles INTERIOR_RAMAL y DESCARGA_HORIZ, sin depender del auto-recálculo de React.
    const qwwResult: QwwResult = calculateQwwAccumulation(
        uehResult.chambers,
        uehResult.pipes,
        sanitarySystemType
    );

    if (qwwResult.errors.length > 0) {
        errors.push(...qwwResult.errors);
    }

    // Paso 2: Calcular flujo continuo acumulado
    // IMPORTANTE: Usar las cámaras y pipes actualizadas del paso 1.1
    // El flowAccumulator también resetea todos los qContinuous a 0 antes de calcular
    const flowResult: FlowResult = calculateFlowAccumulation(
        qwwResult.chambers,
        qwwResult.pipes,
        { settings }
    );

    // Recolectar errores del paso 2
    if (flowResult.errors.length > 0) {
        errors.push(...flowResult.errors);
    }

    // Paso 3: Construir mapa de flujos por pipeId
    // Este mapa es útil para acceso rápido durante la verificación
    const flowMap = new Map<string, SanitaryFlowMap>();

    for (const pipe of flowResult.pipes) {
        const qContinuous_Ls = Number(pipe.qContinuous?.value || 0);
        const uehAcumuladas = Number(pipe.uehTransportadas?.value || 0);
        const hasUpstreamInput = pipe.hasUpstreamInput || qContinuous_Ls > 0;

        flowMap.set(pipe.id, {
            pipeId: pipe.id,
            qContinuous_Ls,
            uehAcumuladas,
            hasUpstreamInput
        });
    }

    return {
        chambers: flowResult.chambers,
        pipes: flowResult.pipes,
        flowMap,
        errors: [...new Set(errors)] // Deduplicar errores
    };
}

/**
 * Obtiene el caudal de diseño para un pipe específico.
 * Para COLECTOR_EXTERIOR: usa qContinuous (flujo continuo)
 * Para otros roles: usa qwwTransportado o uehTransportadas según corresponda
 * 
 * @param pipe - Tubería a evaluar
 * @param rol - Rol normativo de la tubería
 * @returns caudal de diseño en L/s, o null si no hay datos
 */
export function getDesignFlowForPipe(
    pipe: Pipe,
    rol: 'INTERIOR_RAMAL' | 'DESCARGA_HORIZ' | 'COLECTOR_EXTERIOR'
): number | null {
    if (rol === 'COLECTOR_EXTERIOR') {
        const q = Number(pipe.qContinuous?.value || 0);
        return q > 0 ? q : null;
    }

    // Para descarga horizontal e interior ramal, usamos qww (caudal probable)
    const qww = Number(pipe.qwwTransportado?.value || 0);
    if (qww > 0) return qww;

    // Fallback: usar UEH transportado como referencia
    const ueh = Number(pipe.uehTransportadas?.value || 0);
    return ueh > 0 ? ueh : null;
}

/**
 * Verifica si un pipe tiene caudal válido para verificación hidráulica.
 * Aplica la regla "fail-closed": si no hay caudal, retorna false.
 * 
 * @param pipe - Tubería a evaluar
 * @param rol - Rol normativo de la tubería
 * @returns true si el pipe tiene caudal válido para análisis
 */
export function hasValidFlowForVerification(
    pipe: Pipe,
    rol: 'INTERIOR_RAMAL' | 'DESCARGA_HORIZ' | 'COLECTOR_EXTERIOR'
): boolean {
    const flow = getDesignFlowForPipe(pipe, rol);
    return flow !== null && flow > 0;
}

/**
 * Obtiene mensaje de error apropiado según el rol cuando no hay caudal.
 * 
 * @param rol - Rol normativo de la tubería
 * @returns mensaje descriptivo
 */
export function getNoFlowMessage(
    rol: 'INTERIOR_RAMAL' | 'DESCARGA_HORIZ' | 'COLECTOR_EXTERIOR'
): string {
    switch (rol) {
        case 'INTERIOR_RAMAL':
            return 'Sin caudal: Q no calculado';
        case 'DESCARGA_HORIZ':
            return 'Sin caudal: Q no disponible';
        case 'COLECTOR_EXTERIOR':
            return 'Sin caudal: falta aguas arriba';
        default:
            return 'Sin caudal';
    }
}
