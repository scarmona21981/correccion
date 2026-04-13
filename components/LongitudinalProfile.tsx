import React from 'react';
import {
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ReferenceDot,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';
import { DataTable } from './common/DataTable';
import {
    buildTerrainPolyline,
    interpolatePipeElevationFromTerrain,
    interpolateTerrainFromPolyline
} from '../hydraulics/profileGeometry';

interface ProfileNodeLike {
    id: string;
    userDefinedId?: string;
    name?: string;
    x?: number;
    y?: number;
    CT?: number | string | { value: number | string };
    CRS?: number | string | { value: number | string };
    Cre?: number | string | { value: number | string };
    CL?: number | string | { value: number | string };
    CI?: number | string | { value: number | string };
    elevation?: number;
    z?: number;
}

interface TerrainPointLike {
    id?: string;
    chainage: number;
    elevation: number;
}

interface PressurePointLike {
    location?: string;
    chainage?: number;
    head: number;
    elevation: number;
    pressure?: number;
    status?: string;
}

interface HydraulicSampleLike {
    x: number;
    hgl: number;
    elevation: number;
    pressure: number;
}

interface AirValveRecommendationLike {
    chainage: number;
    elevation: number;
    pressure?: number;
    reason?: string;
    type?: string;
    priority?: string;
    avId?: string;
}

interface ProfilePipeLike {
    id: string;
    userDefinedId?: string;
    startNodeId?: string;
    endNodeId?: string;
    length?: number | string | { value: number | string };
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
    z_start?: number;
    z_end?: number;
    z_start_terreno?: number;
    z_end_terreno?: number;
    cover_m?: number;
    diameter?: number | string | { value: number | string };
    PN?: number;
    inlineNodes?: Array<{
        id?: string;
        chainage: number;
        elevation?: number;
        airValveType?: string;
    }>;
    profilePoints?: TerrainPointLike[];
}

interface PressureVerificationLike {
    pipeId?: string;
    pressurePoints?: PressurePointLike[];
    samples?: HydraulicSampleLike[];
    velocity?: number;
    h_singular?: number;
    h_friction?: number;
    pressureMca_start?: number;
    pressureMcaStart?: number;
    airValves?: AirValveRecommendationLike[];
}

interface LongitudinalProfileProps {
    mode: 'gravedad' | 'impulsion';
    nodes: ProfileNodeLike[];
    pipes: ProfilePipeLike[];
    pressureVerifications?: Record<string, PressureVerificationLike>;
    onInsertAirValve?: (payload: LongitudinalProfileAirValveInsertPayload) => void;
}

export interface LongitudinalProfileAirValveInsertPayload {
    pipeId: string;
    chainageLocal: number;
    elevation: number;
    type?: string;
    avId?: string;
}

interface ValveMarker {
    id: string;
    chainage: number;
    elevation: number;
    pressureBar?: number;
    pressureMca?: number;
    source: 'recommended' | 'existing';
}

interface CriticalMarker {
    id: string;
    chainage: number;
    elevation: number;
    pressureBar: number;
    pressureMca: number;
    type: 'subpresion' | 'sobrepresion';
    maxAllowedBar?: number;
}

interface ChartPoint {
    chainage: number;
    terreno?: number;
    pipeAxis?: number;
    hgl?: number;
    egl?: number;
    pressureBar?: number;
    pressureMca?: number;
    velocity?: number;
    hFriction?: number;
    hSingular?: number;
    label?: string;
    isNode?: boolean;
    valves?: ValveMarker[];
    criticals?: CriticalMarker[];
}

interface PressureProfileSample {
    chainage: number;
    axisElevation: number;
    hgl: number;
    pressureBar?: number;
    location?: string;
}

interface AirValveRecommendationRow {
    pipeId: string;
    chainageLocal: number;
    chainageGlobal: number;
    elevation: number;
    pressureBar: number;
    type?: string;
    avId: string;
}

const G = 9.81;
const BAR_TO_MCA = 10.1972;

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const toOptionalNumber = (value: unknown): number | undefined => {
    if (value && typeof value === 'object' && 'value' in (value as Record<string, unknown>)) {
        const nested = Number((value as { value: unknown }).value);
        return Number.isFinite(nested) ? nested : undefined;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
};

const toNumber = (value: unknown): number => toOptionalNumber(value) ?? 0;

const firstFinite = (...values: Array<number | undefined>): number => {
    for (const value of values) {
        if (isFiniteNumber(value)) return value;
    }
    return 0;
};

const firstFiniteOptional = (...values: Array<number | undefined>): number | undefined => {
    for (const value of values) {
        if (isFiniteNumber(value)) return value;
    }

    return undefined;
};

const clamp = (value: number, min: number, max: number): number => {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
};

const getNodeLabel = (node: ProfileNodeLike): string => node.userDefinedId || node.name || node.id;

const getTerrainElevationOptional = (node?: ProfileNodeLike): number | undefined => {
    if (!node) return undefined;

    return firstFiniteOptional(
        toOptionalNumber(node.CT),
        toOptionalNumber(node.elevation),
        toOptionalNumber(node.z),
        toOptionalNumber(node.CRS),
        toOptionalNumber(node.CL)
    );
};

const getPipeAxisElevationOptional = (
    node: ProfileNodeLike | undefined,
    mode: 'gravedad' | 'impulsion'
): number | undefined => {
    if (!node) return undefined;

    if (mode === 'gravedad') {
        return firstFiniteOptional(
            toOptionalNumber(node.CRS),
            toOptionalNumber(node.Cre),
            toOptionalNumber(node.CL),
            toOptionalNumber(node.CI),
            toOptionalNumber(node.elevation),
            getTerrainElevationOptional(node)
        );
    }

    return firstFiniteOptional(
        toOptionalNumber(node.CL),
        toOptionalNumber(node.CI),
        toOptionalNumber(node.elevation),
        toOptionalNumber(node.z),
        getTerrainElevationOptional(node)
    );
};

const getHydraulicElevationOptional = (
    node: ProfileNodeLike | undefined,
    mode: 'gravedad' | 'impulsion'
): number | undefined => {
    if (!node) return undefined;

    if (mode === 'gravedad') {
        return firstFiniteOptional(
            toOptionalNumber(node.CRS),
            toOptionalNumber(node.Cre),
            getPipeAxisElevationOptional(node, mode)
        );
    }

    return firstFiniteOptional(toOptionalNumber(node.CL), toOptionalNumber(node.elevation), getPipeAxisElevationOptional(node, mode));
};

const getPipeLength = (pipe: ProfilePipeLike, startNode?: ProfileNodeLike, endNode?: ProfileNodeLike): number => {
    const explicitLength = toNumber(pipe.length);
    if (explicitLength > 0) return explicitLength;

    const x1 = toNumber(pipe.x1 || startNode?.x);
    const y1 = toNumber(pipe.y1 || startNode?.y);
    const x2 = toNumber(pipe.x2 || endNode?.x);
    const y2 = toNumber(pipe.y2 || endNode?.y);
    const geometric = Math.hypot(x2 - x1, y2 - y1);

    return geometric > 0 ? geometric : 1;
};

const findConnectingPipe = (fromNodeId: string, toNodeId: string, pipes: ProfilePipeLike[]): ProfilePipeLike | undefined => {
    return pipes.find(pipe => (
        (pipe.startNodeId === fromNodeId && pipe.endNodeId === toNodeId)
        || (pipe.startNodeId === toNodeId && pipe.endNodeId === fromNodeId)
    ));
};

const sortTerrainPoints = (pipe: ProfilePipeLike | undefined): TerrainPointLike[] => {
    return (pipe?.profilePoints || []).slice().sort((a, b) => a.chainage - b.chainage);
};

const buildTerrainSegmentPolyline = (
    segmentLength: number,
    startTerrain: number,
    endTerrain: number,
    pipe?: ProfilePipeLike
): TerrainPointLike[] => {
    return buildTerrainPolyline({
        length: segmentLength,
        zStartApprox: startTerrain,
        zEndApprox: endTerrain,
        zStartTerrain: toOptionalNumber(pipe?.z_start_terreno),
        zEndTerrain: toOptionalNumber(pipe?.z_end_terreno),
        profilePoints: sortTerrainPoints(pipe).map(point => ({
            chainage: toNumber(point.chainage),
            elevation: toNumber(point.elevation),
            id: point.id
        }))
    });
};

const interpolateValue = (
    chainage: number,
    segmentLength: number,
    startValue: number,
    endValue: number,
    controlPoints: Array<{ chainage: number; elevation: number }>
): number => {
    const clamped = clamp(chainage, 0, segmentLength);
    const points = [
        { chainage: 0, elevation: startValue },
        ...controlPoints.filter(point => Number.isFinite(point.chainage) && Number.isFinite(point.elevation)),
        { chainage: segmentLength, elevation: endValue }
    ]
        .map(point => ({ chainage: clamp(point.chainage, 0, segmentLength), elevation: point.elevation }))
        .sort((a, b) => a.chainage - b.chainage);

    if (points.length === 0) return startValue;
    if (clamped <= points[0].chainage) return points[0].elevation;
    if (clamped >= points[points.length - 1].chainage) return points[points.length - 1].elevation;

    for (let index = 0; index < points.length - 1; index += 1) {
        const from = points[index];
        const to = points[index + 1];
        if (clamped >= from.chainage && clamped <= to.chainage) {
            const span = to.chainage - from.chainage;
            if (span <= 1e-9) return to.elevation;
            const factor = (clamped - from.chainage) / span;
            return from.elevation + factor * (to.elevation - from.elevation);
        }
    }

    return endValue;
};

const interpolateTerrainElevation = (
    localChainage: number,
    segmentLength: number,
    startTerrain: number,
    endTerrain: number,
    pipe?: ProfilePipeLike,
    fallback?: number
): number => {
    const terrainPolyline = buildTerrainSegmentPolyline(segmentLength, startTerrain, endTerrain, pipe);
    const terrain = interpolateTerrainFromPolyline(localChainage, terrainPolyline, segmentLength);
    if (Number.isFinite(terrain)) return terrain;
    return fallback ?? startTerrain;
};

const interpolatePipeAxisElevation = (
    localChainage: number,
    segmentLength: number,
    startAxis: number,
    endAxis: number,
    startTerrain: number,
    endTerrain: number,
    mode: 'gravedad' | 'impulsion',
    pipe?: ProfilePipeLike
): number => {
    if (mode === 'impulsion') {
        return interpolatePipeElevationFromTerrain(localChainage, {
            length: segmentLength,
            zStartApprox: startTerrain,
            zEndApprox: endTerrain,
            zStartTerrain: toOptionalNumber(pipe?.z_start_terreno),
            zEndTerrain: toOptionalNumber(pipe?.z_end_terreno),
            cover_m: toOptionalNumber(pipe?.cover_m),
            diameter_mm: toOptionalNumber(pipe?.diameter),
            profilePoints: sortTerrainPoints(pipe).map(point => ({
                chainage: toNumber(point.chainage),
                elevation: toNumber(point.elevation),
                id: point.id
            })),
            reference: 'axis'
        });
    }

    const zStart = toOptionalNumber(pipe?.z_start);
    const zEnd = toOptionalNumber(pipe?.z_end);
    const axisStart = isFiniteNumber(zStart) ? zStart : startAxis;
    const axisEnd = isFiniteNumber(zEnd) ? zEnd : endAxis;
    return interpolateValue(localChainage, segmentLength, axisStart, axisEnd, []);
};

const buildPressureSamples = (
    verification: PressureVerificationLike | undefined,
    segmentLength: number
): PressureProfileSample[] => {
    if (!verification) return [];

    if (Array.isArray(verification.samples) && verification.samples.length > 0) {
        return verification.samples
            .map(sample => ({
                chainage: clamp(toNumber(sample.x), 0, segmentLength),
                axisElevation: toNumber(sample.elevation),
                hgl: toNumber(sample.hgl),
                pressureBar: toOptionalNumber(sample.pressure)
            }))
            .sort((a, b) => a.chainage - b.chainage);
    }

    const points = verification.pressurePoints || [];
    if (points.length === 0) return [];

    return points
        .map((point, index) => {
            const fallbackChainage = points.length > 1 ? (index / (points.length - 1)) * segmentLength : 0;
            const chainage = clamp(toOptionalNumber(point.chainage) ?? fallbackChainage, 0, segmentLength);
            const axisElevation = toNumber(point.elevation);
            const hgl = toNumber(point.head);
            const pressureBar = toOptionalNumber(point.pressure);

            return {
                chainage,
                axisElevation,
                hgl,
                pressureBar,
                location: point.location
            };
        })
        .sort((a, b) => a.chainage - b.chainage);
};

const resolvePressureVerification = (
    verifications: Record<string, PressureVerificationLike> | undefined,
    pipe: ProfilePipeLike | undefined
): PressureVerificationLike | undefined => {
    if (!verifications || !pipe) return undefined;

    const byId = verifications[pipe.id];
    if (byId) return byId;

    const userDefinedId = (pipe.userDefinedId || '').trim();
    if (userDefinedId && verifications[userDefinedId]) return verifications[userDefinedId];

    const byPipeIdField = Object.values(verifications).find(verification => {
        const verificationPipeId = typeof verification?.pipeId === 'string' ? verification.pipeId.trim() : '';
        return verificationPipeId === pipe.id || (userDefinedId && verificationPipeId === userDefinedId);
    });

    return byPipeIdField;
};

const findNearestPressureBar = (samples: PressureProfileSample[], chainage: number): number | undefined => {
    if (samples.length === 0) return undefined;

    let nearest: PressureProfileSample | undefined;
    let distance = Number.POSITIVE_INFINITY;

    samples.forEach(sample => {
        const currentDistance = Math.abs(sample.chainage - chainage);
        if (currentDistance < distance) {
            nearest = sample;
            distance = currentDistance;
        }
    });

    return nearest?.pressureBar;
};

const mergeDistinctById = <T extends { id: string }>(base: T[] = [], incoming: T[] = []): T[] => {
    const map = new Map<string, T>();
    [...base, ...incoming].forEach(item => map.set(item.id, item));
    return Array.from(map.values());
};

const formatMeters = (value: number | undefined): string => {
    if (!isFiniteNumber(value)) return '--';
    return `${value.toFixed(2)} m`;
};

const formatBar = (value: number | undefined): string => {
    if (!isFiniteNumber(value)) return '--';
    return `${value.toFixed(2)} bar`;
};

const formatAirValveTypeLabel = (value?: string): string => {
    if (!value || typeof value !== 'string') return 'SIN DEFINIR';
    return value.replace(/_/g, ' ');
};

const isDoubleAirValveType = (value?: string): boolean => value === 'EXPULSION_ANTI_GOLPE' || value === 'ANTI_SURGE';

const InvertedTriangleMarker: React.FC<{ cx?: number; cy?: number }> = ({ cx = 0, cy = 0 }) => {
    const size = 6;
    return (
        <path
            d={`M${cx - size},${cy - size / 2} L${cx + size},${cy - size / 2} L${cx},${cy + size} Z`}
            fill="#dc2626"
            stroke="var(--surface)"
            strokeWidth={1}
        />
    );
};

const renderProfileTooltip = ({ active, payload, label }: any): React.ReactNode => {
    if (!active || !Array.isArray(payload) || payload.length === 0) return null;

    const point = payload[0]?.payload as ChartPoint | undefined;
    if (!point) return null;

    const valves = point.valves || [];
    const criticals = point.criticals || [];

    return (
        <div
            style={{
                background: 'var(--surface-elevated)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                borderRadius: '8px',
                padding: '10px 12px',
                minWidth: '230px'
            }}
        >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
                Distancia: {Number(label || 0).toFixed(2)} m
            </div>
            {point.label && <div>Nodo: {point.label}</div>}
            <div>Terreno: {formatMeters(point.terreno)}</div>
            <div>Eje tubería: {formatMeters(point.pipeAxis)}</div>
            <div>HGL: {formatMeters(point.hgl)}</div>
            <div>EGL: {formatMeters(point.egl)}</div>
            <div>Presión: {formatMeters(point.pressureMca)} ({formatBar(point.pressureBar)})</div>
            {isFiniteNumber(point.velocity) && <div>Velocidad: {point.velocity.toFixed(2)} m/s</div>}
            {isFiniteNumber(point.hSingular) && <div>Pérdida local: {point.hSingular.toFixed(2)} m</div>}
            {isFiniteNumber(point.hFriction) && <div>Pérdida distribuida: {point.hFriction.toFixed(2)} m</div>}

            {valves.map(valve => (
                <div key={valve.id} style={{ marginTop: 6, color: '#ef4444', fontWeight: 600 }}>
                    {valve.source === 'existing' ? 'Ventosa existente' : 'Ventosa recomendada'}
                    <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                        Presión local: {formatMeters(valve.pressureMca)} ({formatBar(valve.pressureBar)})
                    </div>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                        Cota: {formatMeters(valve.elevation)}
                    </div>
                </div>
            ))}

            {criticals.map(critical => (
                <div
                    key={critical.id}
                    style={{
                        marginTop: 6,
                        color: critical.type === 'subpresion' ? '#dc2626' : '#f59e0b',
                        fontWeight: 700
                    }}
                >
                    {critical.type === 'subpresion' ? 'Subpresión' : 'Sobrepresión'}
                    <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                        Presión: {critical.pressureMca.toFixed(2)} mca ({critical.pressureBar.toFixed(2)} bar)
                    </div>
                    {isFiniteNumber(critical.maxAllowedBar) && (
                        <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                            Límite: {critical.maxAllowedBar.toFixed(2)} bar
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

export const LongitudinalProfile: React.FC<LongitudinalProfileProps> = ({
    mode,
    nodes,
    pipes,
    pressureVerifications,
    onInsertAirValve
}) => {
    const nodesSignature = nodes
        .map(node => [
            node.id,
            node.userDefinedId || '',
            toOptionalNumber(node.CT) ?? '',
            toOptionalNumber(node.CRS) ?? '',
            toOptionalNumber(node.CL) ?? '',
            toOptionalNumber(node.CI) ?? '',
            toOptionalNumber(node.elevation) ?? '',
            toOptionalNumber(node.z) ?? ''
        ].join(':'))
        .join('|');

    const pipesSignature = pipes
        .map(pipe => [
            pipe.id,
            pipe.userDefinedId || '',
            pipe.startNodeId || '',
            pipe.endNodeId || '',
            toOptionalNumber(pipe.length) ?? '',
            toOptionalNumber(pipe.diameter) ?? '',
            toOptionalNumber(pipe.z_start) ?? '',
            toOptionalNumber(pipe.z_end) ?? '',
            toOptionalNumber(pipe.z_start_terreno) ?? '',
            toOptionalNumber(pipe.z_end_terreno) ?? '',
            toOptionalNumber(pipe.cover_m) ?? '',
            (pipe.profilePoints || []).map(point => `${toOptionalNumber(point.chainage) ?? ''}:${toOptionalNumber(point.elevation) ?? ''}`).join(','),
            (pipe.inlineNodes || []).map(node => `${node.id || ''}:${toOptionalNumber(node.chainage) ?? ''}:${toOptionalNumber(node.elevation) ?? ''}`).join(',')
        ].join(':'))
        .join('|');

    const pressureVerificationsSignature = Object.entries(pressureVerifications || {})
        .map(([key, verification]) => [
            key,
            verification?.pipeId || '',
            (verification?.samples || []).length,
            (verification?.pressurePoints || []).length,
            (verification?.airValves || []).length
        ].join(':'))
        .join('|');

    const nodeById = React.useMemo(() => {
        const map = new Map<string, ProfileNodeLike>();
        nodes.forEach(node => map.set(node.id, node));
        return map;
    }, [nodes, nodesSignature]);

    const nodeOptions = React.useMemo(() => {
        return nodes.map(node => ({ id: node.id, label: getNodeLabel(node) }));
    }, [nodes, nodesSignature]);

    const [startNodeId, setStartNodeId] = React.useState<string>('');
    const [endNodeId, setEndNodeId] = React.useState<string>('');

    React.useEffect(() => {
        if (nodeOptions.length === 0) {
            setStartNodeId('');
            setEndNodeId('');
            return;
        }

        setStartNodeId(prev => {
            if (prev && nodeOptions.some(node => node.id === prev)) return prev;
            return nodeOptions[0].id;
        });
        setEndNodeId(prev => {
            if (prev && nodeOptions.some(node => node.id === prev)) return prev;
            return nodeOptions[Math.min(1, nodeOptions.length - 1)].id;
        });
    }, [nodeOptions]);

    const findPath = React.useCallback((startId: string, endId: string): string[] => {
        if (!startId || !endId) return [];
        if (startId === endId) return [startId];

        const visited = new Set<string>();
        const path: string[] = [];

        const dfs = (currentId: string): boolean => {
            visited.add(currentId);
            path.push(currentId);

            if (currentId === endId) return true;

            const connected = pipes
                .filter(pipe => pipe.startNodeId === currentId || pipe.endNodeId === currentId)
                .map(pipe => (pipe.startNodeId === currentId ? pipe.endNodeId : pipe.startNodeId))
                .filter((id): id is string => !!id);

            for (const nextId of connected) {
                if (visited.has(nextId)) continue;
                if (dfs(nextId)) return true;
            }

            path.pop();
            return false;
        };

        return dfs(startId) ? path : [];
    }, [pipes, pipesSignature]);

    const route = React.useMemo(() => findPath(startNodeId, endNodeId), [findPath, startNodeId, endNodeId]);

    const airValveRows = React.useMemo<AirValveRecommendationRow[]>(() => {
        if (mode !== 'impulsion' || route.length < 2) return [];

        let cumulative = 0;
        const rows: Array<Omit<AirValveRecommendationRow, 'avId'>> = [];

        for (let index = 1; index < route.length; index += 1) {
            const nodeId = route[index];
            const prevNodeId = route[index - 1];
            const node = nodeById.get(nodeId);
            const prevNode = nodeById.get(prevNodeId);
            if (!node) continue;

            const pipe = findConnectingPipe(prevNodeId, nodeId, pipes);
            const segmentLength = getPipeLength(pipe || { id: `seg-${index}` }, prevNode, node);

            const startTerrain = prevNode
                ? firstFinite(
                    getTerrainElevationOptional(prevNode),
                    toOptionalNumber(pipe?.z_start_terreno),
                    toOptionalNumber(pipe?.z_start),
                    getTerrainElevationOptional(node)
                )
                : firstFinite(
                    toOptionalNumber(pipe?.z_start_terreno),
                    toOptionalNumber(pipe?.z_start),
                    getTerrainElevationOptional(node)
                );

            const endTerrain = firstFinite(
                getTerrainElevationOptional(node),
                toOptionalNumber(pipe?.z_end_terreno),
                toOptionalNumber(pipe?.z_end),
                startTerrain
            );

            const startAxisLegacy = prevNode
                ? firstFinite(
                    getPipeAxisElevationOptional(prevNode, mode),
                    toOptionalNumber(pipe?.z_start),
                    getPipeAxisElevationOptional(node, mode)
                )
                : firstFinite(toOptionalNumber(pipe?.z_start), getPipeAxisElevationOptional(node, mode));
            const endAxisLegacy = firstFinite(
                getPipeAxisElevationOptional(node, mode),
                toOptionalNumber(pipe?.z_end),
                startAxisLegacy
            );
            const startAxis = interpolatePipeAxisElevation(
                0,
                segmentLength,
                startAxisLegacy,
                endAxisLegacy,
                startTerrain,
                endTerrain,
                mode,
                pipe
            );
            const startHgl = prevNode ? firstFinite(getHydraulicElevationOptional(prevNode, mode), startAxis) : startAxis;

            if (pipe) {
                const verification = resolvePressureVerification(pressureVerifications, pipe);
                const pressureSamples = buildPressureSamples(verification, segmentLength);

                (verification?.airValves || []).forEach((valve) => {
                    const chainageLocal = clamp(toNumber(valve.chainage), 0, segmentLength);
                    const chainageGlobal = cumulative + chainageLocal;
                    const elevation = firstFinite(
                        toOptionalNumber(valve.elevation),
                        interpolatePipeAxisElevation(
                            chainageLocal,
                            segmentLength,
                            startAxisLegacy,
                            endAxisLegacy,
                            startTerrain,
                            endTerrain,
                            mode,
                            pipe
                        )
                    );
                    const pressureBar = firstFinite(
                        toOptionalNumber(valve.pressure),
                        findNearestPressureBar(pressureSamples, chainageLocal),
                        (startHgl - elevation) / BAR_TO_MCA
                    );

                    rows.push({
                        pipeId: pipe.id,
                        chainageLocal,
                        chainageGlobal,
                        elevation,
                        pressureBar,
                        type: valve.type
                    });
                });
            }

            cumulative += segmentLength;
        }

        const ordered = rows
            .slice()
            .sort((a, b) => {
                if (Math.abs(a.chainageGlobal - b.chainageGlobal) > 1e-6) {
                    return a.chainageGlobal - b.chainageGlobal;
                }
                if (a.pipeId !== b.pipeId) return a.pipeId.localeCompare(b.pipeId);
                return a.chainageLocal - b.chainageLocal;
            });

        return ordered.map((row, index) => ({
            ...row,
            avId: `AV-${index + 1}`
        }));
    }, [mode, nodeById, pipes, pressureVerifications, pressureVerificationsSignature, route]);

    const showAirValveRecommendations = mode === 'impulsion' && route.length >= 2;

    const chartData = React.useMemo<ChartPoint[]>(() => {
        if (route.length < 2) return [];

        let cumulative = 0;
        const points: ChartPoint[] = [];

        for (let index = 1; index < route.length; index += 1) {
            const nodeId = route[index];
            const prevNodeId = route[index - 1];
            const node = nodeById.get(nodeId);
            const prevNode = nodeById.get(prevNodeId);
            if (!node) continue;

            const pipe = findConnectingPipe(prevNodeId, nodeId, pipes);
            const segmentLength = getPipeLength(pipe || { id: `seg-${index}` }, prevNode, node);

            // En bombas pueden faltar CT/CL/CI en nodo; usamos z_start/z_end del tramo como respaldo.
            const startTerrain = prevNode
                ? firstFinite(
                    getTerrainElevationOptional(prevNode),
                    toOptionalNumber(pipe?.z_start_terreno),
                    toOptionalNumber(pipe?.z_start),
                    getTerrainElevationOptional(node)
                )
                : firstFinite(
                    toOptionalNumber(pipe?.z_start_terreno),
                    toOptionalNumber(pipe?.z_start),
                    getTerrainElevationOptional(node)
                );

            const startAxisLegacy = prevNode
                ? firstFinite(
                    getPipeAxisElevationOptional(prevNode, mode),
                    toOptionalNumber(pipe?.z_start),
                    getPipeAxisElevationOptional(node, mode)
                )
                : firstFinite(toOptionalNumber(pipe?.z_start), getPipeAxisElevationOptional(node, mode));

            const endTerrain = firstFinite(
                getTerrainElevationOptional(node),
                toOptionalNumber(pipe?.z_end_terreno),
                toOptionalNumber(pipe?.z_end),
                startTerrain
            );
            const endAxisLegacy = firstFinite(
                getPipeAxisElevationOptional(node, mode),
                toOptionalNumber(pipe?.z_end),
                startAxisLegacy
            );

            const startAxis = interpolatePipeAxisElevation(
                0,
                segmentLength,
                startAxisLegacy,
                endAxisLegacy,
                startTerrain,
                endTerrain,
                mode,
                pipe
            );
            const endAxis = interpolatePipeAxisElevation(
                segmentLength,
                segmentLength,
                startAxisLegacy,
                endAxisLegacy,
                startTerrain,
                endTerrain,
                mode,
                pipe
            );
            if (mode === 'impulsion' && pipe) {
                const verification = resolvePressureVerification(pressureVerifications, pipe);
                const velocity = toOptionalNumber(verification?.velocity);
                const velocityHead = isFiniteNumber(velocity) ? (velocity * velocity) / (2 * G) : undefined;
                const hFriction = toOptionalNumber(verification?.h_friction);
                const hSingular = toOptionalNumber(verification?.h_singular);
                const hTotalLoss = Math.max(0, (hFriction ?? 0) + (hSingular ?? 0));
                const maxAllowedBar = toOptionalNumber(pipe.PN);

                const pressureSamples = buildPressureSamples(verification, segmentLength);
                const verificationUnknown = verification as Record<string, unknown> | undefined;
                const firstPressurePoint = verification?.pressurePoints?.[0];
                const firstPointHead = toOptionalNumber(firstPressurePoint?.head);
                const firstPointElevation = toOptionalNumber(firstPressurePoint?.elevation);
                const pressureMcaFromFirstPointHead = isFiniteNumber(firstPointHead) && isFiniteNumber(firstPointElevation)
                    ? firstPointHead - firstPointElevation
                    : undefined;
                const firstPointPressureBar = toOptionalNumber(firstPressurePoint?.pressure);
                const pressureMcaFromFirstPointPressure = isFiniteNumber(firstPointPressureBar)
                    ? firstPointPressureBar * BAR_TO_MCA
                    : undefined;
                const startPressureMca = firstFiniteOptional(
                    toOptionalNumber(verification?.pressureMca_start),
                    toOptionalNumber(verification?.pressureMcaStart),
                    toOptionalNumber(verificationUnknown?.pressureMca_start),
                    toOptionalNumber(verificationUnknown?.pressureMcaStart),
                    pressureMcaFromFirstPointHead,
                    pressureMcaFromFirstPointPressure
                ) ?? 0;
                const hglStartFromHydraulic = startAxis + startPressureMca;
                const hglFromLosses = (localX: number): number => {
                    if (segmentLength <= 1e-9) return hglStartFromHydraulic;
                    const ratio = clamp(localX, 0, segmentLength) / segmentLength;
                    return hglStartFromHydraulic - (hTotalLoss * ratio);
                };
                const startSample = pressureSamples[0];
                const startHglProfile = isFiniteNumber(startSample?.hgl) ? startSample.hgl : hglFromLosses(0);
                const segmentStartChainage = cumulative;
                const segmentEndChainage = cumulative + segmentLength;
                const lastPoint = points[points.length - 1];

                if (!lastPoint || Math.abs(lastPoint.chainage - segmentStartChainage) > 0.001) {
                    points.push({
                        chainage: segmentStartChainage,
                        terreno: startTerrain,
                        pipeAxis: startAxis,
                        hgl: startHglProfile,
                        egl: isFiniteNumber(velocityHead) ? startHglProfile + velocityHead : undefined,
                        pressureMca: startHglProfile - startAxis,
                        pressureBar: (startHglProfile - startAxis) / BAR_TO_MCA,
                        velocity,
                        hFriction,
                        hSingular,
                        label: prevNode ? getNodeLabel(prevNode) : undefined,
                        isNode: true
                    });
                }

                if (pressureSamples.length > 0) {
                    pressureSamples.forEach((sample, sampleIndex) => {
                        const localX = clamp(sample.chainage, 0, segmentLength);
                        const globalX = cumulative + localX;
                        const pipeAxis = firstFinite(
                            sample.axisElevation,
                            interpolatePipeAxisElevation(
                                localX,
                                segmentLength,
                                startAxisLegacy,
                                endAxisLegacy,
                                startTerrain,
                                endTerrain,
                                mode,
                                pipe
                            )
                        );
                        const hgl = sample.hgl;
                        const pressureBar = firstFinite(sample.pressureBar, (hgl - pipeAxis) / BAR_TO_MCA);
                        const pressureMca = hgl - pipeAxis;
                        const terrain = interpolateTerrainElevation(localX, segmentLength, startTerrain, endTerrain, pipe, pipeAxis);

                        const criticals: CriticalMarker[] = [];
                        if (pressureBar < 0) {
                            criticals.push({
                                id: `${pipe.id}-critical-sub-${sampleIndex}`,
                                chainage: globalX,
                                elevation: pipeAxis,
                                pressureBar,
                                pressureMca,
                                type: 'subpresion'
                            });
                        }

                        if (isFiniteNumber(maxAllowedBar) && maxAllowedBar > 0 && pressureBar > maxAllowedBar) {
                            criticals.push({
                                id: `${pipe.id}-critical-over-${sampleIndex}`,
                                chainage: globalX,
                                elevation: pipeAxis,
                                pressureBar,
                                pressureMca,
                                type: 'sobrepresion',
                                maxAllowedBar
                            });
                        }

                        points.push({
                            chainage: globalX,
                            terreno: terrain,
                            pipeAxis,
                            hgl,
                            egl: isFiniteNumber(velocityHead) ? hgl + velocityHead : undefined,
                            pressureBar,
                            pressureMca,
                            velocity,
                            hFriction,
                            hSingular,
                            label: sample.location || (sampleIndex === pressureSamples.length - 1 ? getNodeLabel(node) : undefined),
                            isNode: sampleIndex === pressureSamples.length - 1,
                            criticals
                        });
                    });

                    const valveMarkers: ValveMarker[] = [];

                    (verification?.airValves || []).forEach((valve, valveIndex) => {
                        const localX = clamp(toNumber(valve.chainage), 0, segmentLength);
                        const globalX = cumulative + localX;
                        const elevation = firstFinite(
                            toOptionalNumber(valve.elevation),
                            interpolatePipeAxisElevation(
                                localX,
                                segmentLength,
                                startAxisLegacy,
                                endAxisLegacy,
                                startTerrain,
                                endTerrain,
                                mode,
                                pipe
                            )
                        );
                        const pressureBar = firstFinite(
                            toOptionalNumber(valve.pressure),
                            findNearestPressureBar(pressureSamples, localX),
                            (hglFromLosses(localX) - elevation) / BAR_TO_MCA
                        );

                        valveMarkers.push({
                            id: `${pipe.id}-valve-rec-${valveIndex}`,
                            chainage: globalX,
                            elevation,
                            pressureBar,
                            pressureMca: pressureBar * BAR_TO_MCA,
                            source: 'recommended'
                        });
                    });

                    (pipe.inlineNodes || []).forEach((valve, valveIndex) => {
                        const localX = clamp(toNumber(valve.chainage), 0, segmentLength);
                        const globalX = cumulative + localX;
                        const elevation = firstFinite(
                            toOptionalNumber(valve.elevation),
                            interpolatePipeAxisElevation(
                                localX,
                                segmentLength,
                                startAxisLegacy,
                                endAxisLegacy,
                                startTerrain,
                                endTerrain,
                                mode,
                                pipe
                            )
                        );
                        const pressureBar = firstFinite(
                            findNearestPressureBar(pressureSamples, localX),
                            (hglFromLosses(localX) - elevation) / BAR_TO_MCA
                        );

                        valveMarkers.push({
                            id: `${pipe.id}-valve-existing-${valveIndex}`,
                            chainage: globalX,
                            elevation,
                            pressureBar,
                            pressureMca: pressureBar * BAR_TO_MCA,
                            source: 'existing'
                        });
                    });

                    valveMarkers.forEach(marker => {
                        points.push({
                            chainage: marker.chainage,
                            terreno: interpolateTerrainElevation(
                                marker.chainage - cumulative,
                                segmentLength,
                                startTerrain,
                                endTerrain,
                                pipe,
                                marker.elevation
                            ),
                            pipeAxis: marker.elevation,
                            valves: [marker]
                        });
                    });
                } else {
                    const terrainPoints = sortTerrainPoints(pipe);
                    terrainPoints.forEach((intermediate, terrainIndex) => {
                        const localX = clamp(toNumber(intermediate.chainage), 0, segmentLength);
                        const globalX = cumulative + localX;
                        const pipeAxis = interpolatePipeAxisElevation(
                            localX,
                            segmentLength,
                            startAxisLegacy,
                            endAxisLegacy,
                            startTerrain,
                            endTerrain,
                            mode,
                            pipe
                        );
                        const hgl = hglFromLosses(localX);

                        points.push({
                            chainage: globalX,
                            terreno: toNumber(intermediate.elevation),
                            pipeAxis,
                            hgl,
                            egl: isFiniteNumber(velocityHead) ? hgl + velocityHead : undefined,
                            pressureMca: hgl - pipeAxis,
                            pressureBar: (hgl - pipeAxis) / BAR_TO_MCA,
                            velocity,
                            hFriction,
                            hSingular,
                            label: terrainIndex === terrainPoints.length - 1 ? getNodeLabel(node) : undefined
                        });
                    });

                    const endHglFromHydraulic = hglFromLosses(segmentLength);
                    points.push({
                        chainage: segmentEndChainage,
                        terreno: endTerrain,
                        pipeAxis: endAxis,
                        hgl: endHglFromHydraulic,
                        egl: isFiniteNumber(velocityHead) ? endHglFromHydraulic + velocityHead : undefined,
                        pressureMca: endHglFromHydraulic - endAxis,
                        pressureBar: (endHglFromHydraulic - endAxis) / BAR_TO_MCA,
                        velocity,
                        hFriction,
                        hSingular,
                        label: getNodeLabel(node),
                        isNode: true
                    });
                }
            } else {
                const startHgl = prevNode ? firstFinite(getHydraulicElevationOptional(prevNode, mode), startAxis) : startAxis;
                const endHgl = firstFinite(getHydraulicElevationOptional(node, mode), endAxis);

                if (points.length === 0) {
                    points.push({
                        chainage: 0,
                        terreno: startTerrain,
                        pipeAxis: startAxis,
                        hgl: startHgl,
                        pressureMca: startHgl - startAxis,
                        pressureBar: (startHgl - startAxis) / BAR_TO_MCA,
                        label: prevNode ? getNodeLabel(prevNode) : undefined,
                        isNode: true
                    });
                }

                const terrainPoints = sortTerrainPoints(pipe);
                terrainPoints.forEach(intermediate => {
                    const localX = clamp(toNumber(intermediate.chainage), 0, segmentLength);
                    const globalX = cumulative + localX;
                    const terrain = toNumber(intermediate.elevation);
                    const pipeAxis = interpolatePipeAxisElevation(
                        localX,
                        segmentLength,
                        startAxisLegacy,
                        endAxisLegacy,
                        startTerrain,
                        endTerrain,
                        mode,
                        pipe
                    );
                    const hgl = interpolateValue(localX, segmentLength, startHgl, endHgl, []);

                    points.push({
                        chainage: globalX,
                        terreno: terrain,
                        pipeAxis,
                        hgl,
                        pressureMca: hgl - pipeAxis,
                        pressureBar: (hgl - pipeAxis) / BAR_TO_MCA
                    });
                });

                points.push({
                    chainage: cumulative + segmentLength,
                    terreno: endTerrain,
                    pipeAxis: endAxis,
                    hgl: endHgl,
                    pressureMca: endHgl - endAxis,
                    pressureBar: (endHgl - endAxis) / BAR_TO_MCA,
                    label: getNodeLabel(node),
                    isNode: true
                });
            }

            cumulative += segmentLength;
        }

        return points
            .sort((a, b) => a.chainage - b.chainage)
            .reduce<ChartPoint[]>((acc, point) => {
                const last = acc[acc.length - 1];
                if (last && Math.abs(last.chainage - point.chainage) < 0.001) {
                    acc[acc.length - 1] = {
                        ...last,
                        ...point,
                        terreno: point.terreno ?? last.terreno,
                        pipeAxis: point.pipeAxis ?? last.pipeAxis,
                        hgl: point.hgl ?? last.hgl,
                        egl: point.egl ?? last.egl,
                        pressureBar: point.pressureBar ?? last.pressureBar,
                        pressureMca: point.pressureMca ?? last.pressureMca,
                        velocity: point.velocity ?? last.velocity,
                        hFriction: point.hFriction ?? last.hFriction,
                        hSingular: point.hSingular ?? last.hSingular,
                        label: point.label || last.label,
                        isNode: point.isNode || last.isNode,
                        valves: mergeDistinctById(last.valves, point.valves),
                        criticals: mergeDistinctById(last.criticals, point.criticals)
                    };
                    return acc;
                }

                acc.push({
                    ...point,
                    valves: point.valves || [],
                    criticals: point.criticals || []
                });
                return acc;
            }, []);
    }, [mode, nodeById, pipes, pressureVerifications, pressureVerificationsSignature, route]);

    const displayChartData = chartData;

    const valveMarkers = React.useMemo(() => {
        const flattened = displayChartData.flatMap(point => point.valves || []);
        return mergeDistinctById([], flattened);
    }, [displayChartData]);

    const criticalMarkers = React.useMemo(() => {
        const flattened = displayChartData.flatMap(point => point.criticals || []);
        return mergeDistinctById([], flattened);
    }, [displayChartData]);

    const hasPipeAxisSeries = displayChartData.some(point => isFiniteNumber(point.pipeAxis));
    const hasHydraulicSeries = displayChartData.some(point => isFiniteNumber(point.hgl));
    const hasEnergySeries = displayChartData.some(point => isFiniteNumber(point.egl));
    const hasPressureSeries = displayChartData.some(point => isFiniteNumber(point.pressureBar));

    const yAxisDomain = React.useMemo<[number, number] | ['auto', 'auto']>(() => {
        const values: number[] = [];

        displayChartData.forEach(point => {
            [point.terreno, point.pipeAxis, point.hgl, point.egl].forEach(value => {
                if (isFiniteNumber(value)) values.push(value);
            });
        });

        valveMarkers.forEach(marker => {
            if (isFiniteNumber(marker.elevation)) values.push(marker.elevation);
        });

        criticalMarkers.forEach(marker => {
            if (isFiniteNumber(marker.elevation)) values.push(marker.elevation);
        });

        if (values.length === 0) return ['auto', 'auto'];

        let min = Math.min(...values);
        let max = Math.max(...values);

        if (!Number.isFinite(min) || !Number.isFinite(max)) return ['auto', 'auto'];

        const span = Math.max(max - min, 0);
        const minSpan = 6;
        const effectiveSpan = Math.max(span, minSpan);
        const padding = Math.max(effectiveSpan * 0.12, 1.2);

        min -= padding;
        max += padding;

        if (max - min < minSpan) {
            const middle = (max + min) / 2;
            min = middle - minSpan / 2;
            max = middle + minSpan / 2;
        }

        const roundStep = effectiveSpan >= 80 ? 5 : effectiveSpan >= 30 ? 2 : 1;
        const domainMin = Math.floor(min / roundStep) * roundStep;
        const domainMax = Math.ceil(max / roundStep) * roundStep;

        return [domainMin, domainMax];
    }, [criticalMarkers, displayChartData, valveMarkers]);
    // ── Zoom / Pan — viewport state ─────────────────────────────────────────
    const totalLength = displayChartData.length
        ? displayChartData[displayChartData.length - 1].chainage
        : 0;

    // Y-global bounds: tight-fit with 8% padding (min 0.2 m) to eliminate white space
    const { yGlobalMin, yGlobalMax } = React.useMemo(() => {
        const raw0 = Array.isArray(yAxisDomain) && typeof yAxisDomain[0] === 'number' ? yAxisDomain[0] : 0;
        const raw1 = Array.isArray(yAxisDomain) && typeof yAxisDomain[1] === 'number' ? yAxisDomain[1] : raw0 + 10;
        return { yGlobalMin: raw0, yGlobalMax: raw1 };
    }, [yAxisDomain]);

    // Initial view = full extent
    const makeFullView = React.useCallback(
        () => ({ xMin: 0, xMax: Math.max(totalLength, 1), yMin: yGlobalMin, yMax: yGlobalMax }),
        [totalLength, yGlobalMin, yGlobalMax]
    );

    const [view, setView] = React.useState(makeFullView);
    const viewRef = React.useRef(view); // always-current ref to avoid stale closures

    const [isPanning, setIsPanning] = React.useState(false);
    const panRef = React.useRef({ startCX: 0, startCY: 0, startView: view });
    // Last known mouse position in data-space and pixel-space inside the chart
    const lastMouseRef = React.useRef({
        isInPlot: false,
        xData: 0,
        yData: 0,
        chartX: 0,
        chartY: 0,
        plotW: 1,
        plotH: 1
    });

    const MIN_XSPAN = Math.max(totalLength * 0.01, 5);
    const MIN_YSPAN = Math.max((yGlobalMax - yGlobalMin) * 0.01, 0.5);

    // Recharts chart margins (must match the margin prop on LineChart)
    const CHART_MARGIN = React.useMemo(
        () => ({ top: 18, right: hasPressureSeries ? 40 : 24, left: 140, bottom: 18 }),
        [hasPressureSeries]
    );

    // Re-initialize view whenever the data changes (new route or different nodes)
    React.useEffect(() => {
        const v = makeFullView();
        setView(v);
        viewRef.current = v;
    }, [makeFullView]);

    // ── Event handlers ───────────────────────────────────────────────────────

    /** Called by LineChart.onMouseMove; updates lastMouseRef with in-plot status and data coords */
    const handleChartMouseMove = React.useCallback((st: any) => {
        const isInPlot = !!st?.isTooltipActive;
        const chartX: number = st?.activeCoordinate?.x ?? lastMouseRef.current.chartX;
        const chartY: number = st?.activeCoordinate?.y ?? lastMouseRef.current.chartY;
        // Compute plot area size (SVG inner area minus margins)
        const svgW: number = st?.width ?? (lastMouseRef.current.plotW + CHART_MARGIN.left + CHART_MARGIN.right);
        const svgH: number = st?.height ?? (lastMouseRef.current.plotH + CHART_MARGIN.top + CHART_MARGIN.bottom);
        const plotW = Math.max(svgW - CHART_MARGIN.left - CHART_MARGIN.right, 1);
        const plotH = Math.max(svgH - CHART_MARGIN.top - CHART_MARGIN.bottom, 1);
        // X data from activeLabel (recharts sets it to the dataKey value)
        const xData = isFiniteNumber(Number(st?.activeLabel)) ? Number(st.activeLabel) : lastMouseRef.current.xData;
        // Y data from pixel position relative to plot area (Y axis is top-to-bottom in SVG)
        const { yMin, yMax } = viewRef.current;
        const pixelInPlotY = chartY; // recharts gives pixel offset from plot top
        const yData = yMax - (pixelInPlotY / plotH) * (yMax - yMin);
        lastMouseRef.current = { isInPlot, xData, yData, chartX, chartY, plotW, plotH };
    }, [CHART_MARGIN]);

    /** Wheel handler — zoom centered on cursor, only inside the plot */
    const handleWheel = React.useCallback((e: React.WheelEvent<HTMLDivElement>) => {
        if (!lastMouseRef.current.isInPlot) return;
        e.preventDefault();
        const zoomIn = e.deltaY < 0;
        const factor = zoomIn ? 0.82 : 1 / 0.82;
        const { xMin, xMax, yMin, yMax } = viewRef.current;
        const xRange = xMax - xMin;
        const yRange = yMax - yMin;
        const { xData: xC, yData: yC } = lastMouseRef.current;
        // New ranges clamped to min/max
        const nxRange = clamp(xRange * factor, MIN_XSPAN, Math.max(totalLength, MIN_XSPAN));
        const nyRange = clamp(yRange * factor, MIN_YSPAN, Math.max(yGlobalMax - yGlobalMin, MIN_YSPAN));
        // Zoom centered on cursor
        const xLeftRatio = xRange > 0 ? clamp((xC - xMin) / xRange, 0, 1) : 0.5;
        const yBotRatio = yRange > 0 ? clamp((yC - yMin) / yRange, 0, 1) : 0.5;
        let nxMin = xC - xLeftRatio * nxRange;
        let nxMax = nxMin + nxRange;
        let nyMin = yC - yBotRatio * nyRange;
        let nyMax = nyMin + nyRange;
        // Clamp to global bounds
        if (nxMin < 0) { nxMax -= nxMin; nxMin = 0; }
        if (nxMax > totalLength) { nxMin -= (nxMax - totalLength); nxMax = totalLength; nxMin = Math.max(nxMin, 0); }
        if (nyMin < yGlobalMin) { nyMax -= (nyMin - yGlobalMin); nyMin = yGlobalMin; }
        if (nyMax > yGlobalMax) { nyMin -= (nyMax - yGlobalMax); nyMax = yGlobalMax; nyMin = Math.max(nyMin, yGlobalMin); }
        const newView = { xMin: nxMin, xMax: nxMax, yMin: nyMin, yMax: nyMax };
        viewRef.current = newView;
        setView(newView);
    }, [MIN_XSPAN, MIN_YSPAN, totalLength, yGlobalMin, yGlobalMax]);

    /** mouseDown on the wrapper div — starts panning if inside the plot */
    const handleMouseDown = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!lastMouseRef.current.isInPlot) return;
        e.preventDefault();
        setIsPanning(true);
        panRef.current = {
            startCX: lastMouseRef.current.chartX,
            startCY: lastMouseRef.current.chartY,
            startView: viewRef.current
        };
    }, []);

    /** mouseMove on the wrapper div — continues pan */
    const handleWrapperMouseMove = React.useCallback((_e: React.MouseEvent<HTMLDivElement>) => {
        if (!isPanning) return;
        const { startCX, startCY, startView } = panRef.current;
        const { chartX, chartY, plotW, plotH } = lastMouseRef.current;
        const dxPix = chartX - startCX;
        const dyPix = chartY - startCY;
        const xRange = startView.xMax - startView.xMin;
        const yRange = startView.yMax - startView.yMin;
        const dxData = -dxPix * (xRange / Math.max(plotW, 1));
        const dyData = dyPix * (yRange / Math.max(plotH, 1)); // +dyPix = moving down = lower yData
        let nxMin = startView.xMin + dxData;
        let nxMax = startView.xMax + dxData;
        let nyMin = startView.yMin + dyData;
        let nyMax = startView.yMax + dyData;
        // Clamp to global bounds
        if (nxMin < 0) { nxMax -= nxMin; nxMin = 0; }
        if (nxMax > totalLength) { nxMin -= (nxMax - totalLength); nxMax = totalLength; nxMin = Math.max(nxMin, 0); }
        if (nyMin < yGlobalMin) { nyMax -= (nyMin - yGlobalMin); nyMin = yGlobalMin; }
        if (nyMax > yGlobalMax) { nyMin -= (nyMax - yGlobalMax); nyMax = yGlobalMax; nyMin = Math.max(nyMin, yGlobalMin); }
        const newView = { xMin: nxMin, xMax: nxMax, yMin: nyMin, yMax: nyMax };
        viewRef.current = newView;
        setView(newView);
    }, [isPanning, totalLength, yGlobalMin, yGlobalMax]);

    /** mouseUp / mouseLeave on wrapper — ends panning */
    const handleMouseUp = React.useCallback(() => setIsPanning(false), []);

    /** Double-click inside plot — resets view to full extent */
    const handleDoubleClick = React.useCallback(() => {
        if (!lastMouseRef.current.isInPlot) return;
        const v = makeFullView();
        viewRef.current = v;
        setView(v);
    }, [makeFullView]);

    /** Reset button handler */
    const handleResetView = React.useCallback(() => {
        const v = makeFullView();
        viewRef.current = v;
        setView(v);
    }, [makeFullView]);

    const pressureAxisDomain = React.useMemo<[number, number] | ['auto', 'auto']>(() => {
        const values = displayChartData
            .map(point => point.pressureBar)
            .filter((value): value is number => isFiniteNumber(value));

        if (values.length === 0) return ['auto', 'auto'];

        let min = Math.min(...values);
        let max = Math.max(...values);

        if (!Number.isFinite(min) || !Number.isFinite(max)) return ['auto', 'auto'];

        const span = Math.max(max - min, 0);
        const effectiveSpan = Math.max(span, 0.4);
        const padding = Math.max(effectiveSpan * 0.15, 0.08);

        min -= padding;
        max += padding;

        if (max - min < 0.4) {
            const middle = (max + min) / 2;
            min = middle - 0.2;
            max = middle + 0.2;
        }

        const domainMin = Math.floor(min * 10) / 10;
        const domainMax = Math.ceil(max * 10) / 10;

        return [domainMin, domainMax];
    }, [displayChartData]);

    if (nodes.length < 2 || pipes.length === 0) {
        return <div className="results-empty-state">Perfil longitudinal: sin datos aun.</div>;
    }

    return (
        <div className="longitudinal-profile-embedded">
            <div className="longitudinal-profile-controls">
                <label>
                    Inicio
                    <select value={startNodeId} onChange={event => setStartNodeId(event.target.value)}>
                        {nodeOptions.map(node => (
                            <option key={`start-${node.id}`} value={node.id}>{node.label}</option>
                        ))}
                    </select>
                </label>
                <label>
                    Fin
                    <select value={endNodeId} onChange={event => setEndNodeId(event.target.value)}>
                        {nodeOptions.map(node => (
                            <option key={`end-${node.id}`} value={node.id}>{node.label}</option>
                        ))}
                    </select>
                </label>
                <button
                    type="button"
                    onClick={() => {
                        const start = startNodeId;
                        setStartNodeId(endNodeId);
                        setEndNodeId(start);
                    }}
                >
                    Invertir
                </button>
                <button type="button" onClick={handleResetView} title="Restablecer zoom y posición">
                    Reset vista
                </button>
            </div>

            {route.length < 2 || displayChartData.length < 2 ? (
                <div className="results-empty-state">Seleccione nodos conectados para visualizar el perfil.</div>
            ) : (
                <>
                    {/* Wrapper div captures wheel/drag events but only acts inside the plot area */}
                    <div
                        className="longitudinal-profile-chart"
                        style={{ position: 'relative', userSelect: 'none', cursor: isPanning ? 'grabbing' : 'default' }}
                        onWheel={handleWheel}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleWrapperMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        onDoubleClick={handleDoubleClick}
                    >
                        <ResponsiveContainer width="100%" height={340}>
                            <LineChart
                                data={displayChartData}
                                margin={CHART_MARGIN}
                                onMouseMove={handleChartMouseMove}
                                onMouseLeave={() => { lastMouseRef.current.isInPlot = false; }}
                            >
                                <CartesianGrid strokeDasharray="4 4" stroke="var(--grid-color)" />
                                <XAxis
                                    type="number"
                                    dataKey="chainage"
                                    stroke="var(--text-secondary)"
                                    tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                                    domain={[view.xMin, view.xMax]}
                                    label={{ value: 'Distancia acumulada (m)', position: 'insideBottom', offset: -8, fill: 'var(--text-secondary)', fontSize: 11 }}
                                />
                                <YAxis
                                    yAxisId="elevation"
                                    stroke="var(--text-secondary)"
                                    width={140}
                                    tickMargin={10}
                                    tick={{ fill: 'var(--text-secondary)', fontSize: 10, textAnchor: 'end' }}
                                    domain={[view.yMin, view.yMax]}
                                    tickCount={7}
                                    label={{ value: 'Altura (m)', angle: -90, position: 'insideLeft', fill: 'var(--text-secondary)', fontSize: 11 }}
                                />
                                {hasPressureSeries && (
                                    <YAxis
                                        yAxisId="pressure"
                                        orientation="right"
                                        stroke="var(--danger, #ef4444)"
                                        tick={{ fill: 'var(--danger, #ef4444)', fontSize: 11 }}
                                        domain={pressureAxisDomain}
                                        tickCount={6}
                                        label={{ value: 'Presión (bar)', angle: 90, position: 'insideRight', fill: 'var(--danger, #ef4444)', fontSize: 11 }}
                                    />
                                )}

                                <Legend
                                    verticalAlign="top"
                                    align="left"
                                    wrapperStyle={{ color: 'var(--text-secondary)', fontSize: '12px', paddingBottom: '8px' }}
                                />

                                <Tooltip
                                    content={renderProfileTooltip}
                                    labelFormatter={(value: unknown) => Number(value || 0).toFixed(2)}
                                />

                                {hasPipeAxisSeries && (
                                    <Line
                                        yAxisId="elevation"
                                        type="linear"
                                        dataKey="pipeAxis"
                                        stroke="var(--pipe-line, #1f4f86)"
                                        strokeWidth={2}
                                        dot={false}
                                        name="Eje tubería"
                                        connectNulls
                                    />
                                )}

                                {hasHydraulicSeries && (
                                    <Line
                                        yAxisId="elevation"
                                        type="linear"
                                        dataKey="hgl"
                                        stroke="var(--hgl-line, #0ea5e9)"
                                        strokeWidth={2}
                                        dot={false}
                                        connectNulls
                                        name="HGL"
                                    />
                                )}

                                {hasEnergySeries && (
                                    <Line
                                        yAxisId="elevation"
                                        type="linear"
                                        dataKey="egl"
                                        stroke="var(--egl-line, #d97706)"
                                        strokeWidth={2}
                                        strokeDasharray="6 4"
                                        dot={false}
                                        connectNulls
                                        name="EGL"
                                    />
                                )}

                                {hasPressureSeries && (
                                    <Line
                                        yAxisId="pressure"
                                        type="linear"
                                        dataKey="pressureBar"
                                        stroke="var(--danger, #ef4444)"
                                        strokeWidth={1.8}
                                        dot={false}
                                        connectNulls
                                        name="Presión"
                                    />
                                )}

                                <Line
                                    yAxisId="elevation"
                                    type="linear"
                                    dataKey="terreno"
                                    stroke="var(--terrain-line, #8a7b6b)"
                                    strokeWidth={2.2}
                                    dot={false}
                                    strokeDasharray="4 2"
                                    name="Terreno"
                                    connectNulls
                                />

                                {valveMarkers.map(marker => (
                                    <ReferenceDot
                                        key={marker.id}
                                        yAxisId="elevation"
                                        x={marker.chainage}
                                        y={marker.elevation}
                                        shape={<InvertedTriangleMarker />}
                                    />
                                ))}

                                {criticalMarkers.map(marker => (
                                    <ReferenceDot
                                        key={marker.id}
                                        yAxisId="elevation"
                                        x={marker.chainage}
                                        y={marker.elevation}
                                        r={4}
                                        fill={marker.type === 'subpresion' ? '#dc2626' : '#f59e0b'}
                                        stroke="var(--surface)"
                                        strokeWidth={1.2}
                                    />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    {showAirValveRecommendations && (
                        <DataTable
                            title="Recomendaciones de Ventosas"
                            subtitle="Ubicaciones sugeridas para la instalación de válvulas de aire según el perfil hidráulico y geométrico."
                            columns={[
                                {
                                    key: 'chainageGlobal',
                                    header: 'Progresiva (m)',
                                    width: 'auto',
                                    align: 'left',
                                    format: (v) => v.toFixed(2)
                                },
                                {
                                    key: 'elevation',
                                    header: 'Cota (m)',
                                    width: 'auto',
                                    align: 'left',
                                    format: (v) => v.toFixed(2)
                                },
                                {
                                    key: 'pressureBar',
                                    header: 'Presión (bar)',
                                    width: 'auto',
                                    align: 'left',
                                    format: (v) => {
                                        const highPressure = v > 1;
                                        return (
                                            <span style={{
                                                color: highPressure ? '#ef4444' : 'var(--text-primary)',
                                                fontWeight: highPressure ? 700 : 500
                                            }}>
                                                {v.toFixed(2)}
                                            </span>
                                        );
                                    }
                                },
                                {
                                    key: 'type',
                                    header: 'Tipo Sugerido',
                                    width: 'auto',
                                    align: 'left',
                                    format: (v) => {
                                        const isDoubleType = isDoubleAirValveType(v);
                                        return (
                                            <span style={{
                                                display: 'inline-block',
                                                borderRadius: '999px',
                                                padding: '3px 8px',
                                                fontSize: '10px',
                                                fontWeight: 700,
                                                letterSpacing: '0.03em',
                                                background: isDoubleType ? 'rgba(239, 68, 68, 0.14)' : 'rgba(148, 163, 184, 0.18)',
                                                color: isDoubleType ? '#fca5a5' : 'var(--text-secondary)',
                                                border: `1px solid ${isDoubleType ? 'rgba(239, 68, 68, 0.4)' : 'var(--border)'}`
                                            }}>
                                                {formatAirValveTypeLabel(v)}
                                            </span>
                                        );
                                    }
                                },
                                {
                                    key: 'actions',
                                    header: 'Acción',
                                    width: 130,
                                    align: 'center',
                                    format: (_, row) => (
                                        <button
                                            type="button"
                                            onClick={() => onInsertAirValve?.({
                                                pipeId: row.pipeId,
                                                chainageLocal: row.chainageLocal,
                                                elevation: row.elevation,
                                                type: row.type,
                                                avId: row.avId
                                            })}
                                            disabled={!onInsertAirValve}
                                            style={{
                                                border: 'none',
                                                borderRadius: '6px',
                                                background: onInsertAirValve ? 'var(--accent)' : 'rgba(148, 163, 184, 0.35)',
                                                color: 'white',
                                                padding: '6px 10px',
                                                fontSize: '11px',
                                                fontWeight: 700,
                                                cursor: onInsertAirValve ? 'pointer' : 'not-allowed',
                                                opacity: onInsertAirValve ? 1 : 0.75,
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            Insertar ventosa
                                        </button>
                                    )
                                }
                            ]}
                            rows={airValveRows}
                            rowKey={(r) => `${r.pipeId}-${r.chainageLocal}`}
                            density="compact"
                            emptyState="No se detectan recomendaciones de ventosas para la ruta seleccionada."
                        />
                    )}
                </>
            )}
        </div>
    );
};
