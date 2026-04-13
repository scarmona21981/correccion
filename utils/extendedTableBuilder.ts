import { Chamber, Pipe, ProjectSettings, DescargaHorizVerificationMethod } from '../context/ProjectContext';
import {
    RolNormativo,
    NormCheck,
    TablaInteriorRamalRow,
    TablaDescargaHorizontalRow,
    TablaColectorExteriorRow,
    yDForQ_Ls,
    velocityForQ_Ls,
    getManningAndDiMm,
    DescargaHorizVerificationMethod as TestVerificationMethod
} from '../hydraulics/test';
import { TraceabilityInfo, getTraceabilityForPipe } from '../constants/traceabilityMap';
import { resolveDescargaHorizVerificationMethod } from './pipeRole';
import { resolveHydraulicDiMm } from './diameterMapper';

export interface ExtendedRow {
    id: string;
    tramoName: string;
    camIni: string;
    camFin: string;
    rol: RolNormativo;
    norma: string;
    Lparcial: number | null;
    Lacum: number | null;
    dotacion: number | null;
    poblacion: number | null;
    Qmedio: number | null;
    Qmin: number | null;
    Qmax: number;
    DN: number;
    pendiente_permille: number;
    hD_Qmax: number | null;
    hD_Qmin: number | null;
    V_Qmax: number | null;
    V_Qmin: number | null;
    V_autol: number | null;
    cumple: boolean;
    estado: 'APTO' | 'NO APTO' | 'INFO';
    checks: NormCheck[];
    P_tributaria?: number;
    M_harmon?: number;
    Qmed_Lps?: number;
    Qmax_Lps_edge?: number;
    traceability?: TraceabilityInfo;
    verificationMethod?: TestVerificationMethod;
}

/**
 * Calcula la longitud acumulada topológicamente.
 * Utiliza la ruta más larga hacia la cabecera en caso de ramificaciones.
 */
function computeLacumMap(pipes: Pipe[]): Map<string, number> {
    const lacumMap = new Map<string, number>();
    const pipeMap = new Map<string, Pipe>(pipes.map(p => [p.id, p]));

    // Agrupar pipes por nodo de destino para rastrear aguas arriba
    const pipesByEndNode = new Map<string, Pipe[]>();
    for (const p of pipes) {
        if (!p.endNodeId) continue;
        const list = pipesByEndNode.get(p.endNodeId) || [];
        list.push(p);
        pipesByEndNode.set(p.endNodeId, list);
    }

    const memo = new Map<string, number>();

    function getLacum(pipeId: string): number {
        if (memo.has(pipeId)) return memo.get(pipeId)!;

        const pipe = pipeMap.get(pipeId);
        if (!pipe) return 0;

        const L = Number(pipe.length?.value || pipe.length || 0);

        // Encontrar pipes que terminan donde este empieza
        const upstreamPipes = pipesByEndNode.get(pipe.startNodeId || '') || [];

        let maxUpstream = 0;
        for (const upPipe of upstreamPipes) {
            maxUpstream = Math.max(maxUpstream, getLacum(upPipe.id));
        }

        const total = L + maxUpstream;
        memo.set(pipeId, total);
        return total;
    }

    for (const p of pipes) {
        lacumMap.set(p.id, getLacum(p.id));
    }

    return lacumMap;
}

export function buildExtendedRows(
    interior: TablaInteriorRamalRow[],
    descarga: TablaDescargaHorizontalRow[],
    colector: TablaColectorExteriorRow[],
    chambers: Chamber[],
    pipes: Pipe[],
    settings: ProjectSettings
): ExtendedRow[] {
    const chamberMap = new Map<string, Chamber>(chambers.map(c => [c.id, c]));
    const pipeMap = new Map<string, Pipe>(pipes.map(p => [p.id, p]));
    const lacumMap = computeLacumMap(pipes);

    const getChamberName = (id?: string) => {
        if (!id) return '—';
        const c = chamberMap.get(id);
        return c ? (c.userDefinedId || c.id) : '—';
    };

    const extendedRows: ExtendedRow[] = [];

    // 1. Interior Ramal (Formato simplificado ya que no suele ser Manning en esta planilla)
    interior.forEach(r => {
        const pipe = pipeMap.get(r.idTramo);
        const trace = getTraceabilityForPipe(RolNormativo.INTERIOR_RAMAL);
        
        extendedRows.push({
            id: r.idTramo,
            tramoName: pipe?.userDefinedId || r.idTramo,
            camIni: getChamberName(pipe?.startNodeId),
            camFin: getChamberName(pipe?.endNodeId),
            rol: r.rol,
            norma: 'NCh3371 Anexo A (RIDAA)',
            Lparcial: pipe ? Number(pipe.length?.value || pipe.length || 0) : null,
            Lacum: lacumMap.get(r.idTramo) || null,
            dotacion: null,
            poblacion: null,
            Qmedio: null,
            Qmin: null,
            Qmax: r.qProbable_Ls,
            DN: r.dnProyectado,
            pendiente_permille: r.pendienteProyectada * 10,
            hD_Qmax: null,
            hD_Qmin: null,
            V_Qmax: null,
            V_Qmin: null,
            V_autol: null,
            cumple: r.cumpleGlobal === 'Cumple',
            estado: r.qProbable_Ls > 0 ? (r.cumpleGlobal === 'Cumple' ? 'APTO' : 'NO APTO') : 'INFO',
            checks: r.checks,
            traceability: trace
        });
    });

    // 2. Descarga Horizontal
    descarga.forEach(r => {
        const pipe = pipeMap.get(r.idTramo);
        const verificationMethod = (pipe?.verificationMethod as TestVerificationMethod) ?? r.verificationMethod ?? 'A3_TABLA';
        const trace = getTraceabilityForPipe(RolNormativo.DESCARGA_HORIZ, verificationMethod);
        
        extendedRows.push({
            id: r.idTramo,
            tramoName: pipe?.userDefinedId || r.idTramo,
            camIni: getChamberName(r.idNodoInicio),
            camFin: getChamberName(r.idNodoFin),
            rol: r.rol,
            norma: verificationMethod === 'A3_TABLA' ? 'NCh3371 Anexo A Tabla A.3' : 'NCh3371 B.2.5',
            Lparcial: r.longitud,
            Lacum: lacumMap.get(r.idTramo) || null,
            dotacion: null,
            poblacion: null,
            Qmedio: null,
            Qmin: null,
            Qmax: r.qDiseno_Ls,
            DN: r.dn,
            pendiente_permille: r.pendiente * 10,
            hD_Qmax: r.alturaRelativa,
            hD_Qmin: null,
            V_Qmax: r.velocidad_ms,
            V_Qmin: null,
            V_autol: 0.60,
            cumple: r.cumpleGlobal === 'Cumple',
            estado: r.qDiseno_Ls > 0 ? (r.cumpleGlobal === 'Cumple' ? 'APTO' : 'NO APTO') : 'INFO',
            checks: r.checks,
            traceability: trace,
            verificationMethod: verificationMethod
        });
    });

    // 3. Colector Exterior
    colector.forEach(r => {
        const pipe = pipeMap.get(r.idTramo);
        const { di_mm: di_fallback } = getManningAndDiMm(r.material, r.dn);
        const di_mm = resolveHydraulicDiMm(pipe, di_fallback);
        const D_m = di_mm / 1000;
        const S = r.pendiente / 100;

        const hD = r.qAcumulado_Ls > 0 ? yDForQ_Ls(D_m, S, r.n, r.qAcumulado_Ls) : 0;
        const v = r.qAcumulado_Ls > 0 ? velocityForQ_Ls(D_m, hD, r.qAcumulado_Ls) : 0;
        
        const trace = getTraceabilityForPipe(RolNormativo.COLECTOR_EXTERIOR);

        extendedRows.push({
            id: r.idTramo,
            tramoName: pipe?.userDefinedId || r.idTramo,
            camIni: getChamberName(r.idNodoInicio),
            camFin: getChamberName(r.idNodoFin),
            rol: r.rol,
            norma: 'NCh1105',
            Lparcial: r.longitud,
            Lacum: lacumMap.get(r.idTramo) || null,
            dotacion: null,
            poblacion: pipe?.P_tributaria ?? null,
            Qmedio: pipe?.Qmed_Lps ?? null,
            Qmin: null,
            Qmax: r.qAcumulado_Ls,
            DN: r.dn,
            pendiente_permille: r.pendiente * 10,
            hD_Qmax: hD,
            hD_Qmin: null,
            V_Qmax: v,
            V_Qmin: null,
            V_autol: 0.60,
            cumple: r.cumpleGlobal === 'Cumple',
            estado: r.qAcumulado_Ls > 0 ? (r.cumpleGlobal === 'Cumple' ? 'APTO' : 'NO APTO') : 'INFO',
            checks: r.checks,
            P_tributaria: pipe?.P_tributaria,
            M_harmon: pipe?.M_harmon,
            Qmed_Lps: pipe?.Qmed_Lps,
            Qmax_Lps_edge: pipe?.Qmax_Lps,
            traceability: trace
        });
    });

    return extendedRows;
}
