import React from 'react';

// Domain Types
export interface GlyphPipe {
    id: string;
    startNodeId?: string;
    endNodeId?: string;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
    vertices?: Array<{
        x: number;
        y: number;
    }>;
}

export interface GlyphNode {
    id: string;
    x: number;
    y: number;
}

export type ChamberGlyphType =
    | 'START'
    | 'TERMINAL'
    | 'STRAIGHT'
    | 'TURN'
    | 'CONFLUENCE'
    | 'BIFURCATION'
    | 'COMPLEX';

export const DIRECTIONS = {
    RIGHT: 0,
    DOWN_RIGHT: 1,
    DOWN: 2,
    DOWN_LEFT: 3,
    LEFT: 4,
    UP_LEFT: 5,
    UP: 6,
    UP_RIGHT: 7
};

export interface ChamberGlyphModel {
    type: ChamberGlyphType;
    inputDirs: number[]; // Discrete directions 0-7
    outputDirs: number[]; // Discrete directions 0-7
}

// ── Helpers ──

export const getConnectedPipesForChamber = (chamberId: string, pipes: GlyphPipe[]) => {
    const inputs = pipes.filter(p => p.endNodeId === chamberId);
    const outputs = pipes.filter(p => p.startNodeId === chamberId);
    return { inputs, outputs };
};

export const getPipeAngleAtChamber = (chamber: GlyphNode, otherNodeId: string, nodes: GlyphNode[]) => {
    const other = nodes.find(n => n.id === otherNodeId);
    if (!other) return 0;
    const dx = other.x - chamber.x;
    const dy = other.y - chamber.y;
    return Math.atan2(dy, dx);
};

const isValidPoint = (point?: { x?: number; y?: number } | null): point is { x: number; y: number } => (
    !!point
    && Number.isFinite(point.x)
    && Number.isFinite(point.y)
);

const getNodePoint = (nodeId: string | undefined, nodes: GlyphNode[]): { x: number; y: number } | null => {
    if (!nodeId) return null;
    const node = nodes.find(n => n.id === nodeId);
    return node ? { x: node.x, y: node.y } : null;
};

const getPipeAdjacentPointAtChamber = (
    chamber: GlyphNode,
    pipe: GlyphPipe,
    nodes: GlyphNode[]
): { x: number; y: number } | null => {
    if (pipe.endNodeId === chamber.id) {
        const lastVertex = pipe.vertices?.[pipe.vertices.length - 1];
        if (isValidPoint(lastVertex)) return lastVertex;
        return getNodePoint(pipe.startNodeId, nodes)
            ?? (isValidPoint({ x: pipe.x1, y: pipe.y1 }) ? { x: pipe.x1 as number, y: pipe.y1 as number } : null);
    }

    if (pipe.startNodeId === chamber.id) {
        const firstVertex = pipe.vertices?.[0];
        if (isValidPoint(firstVertex)) return firstVertex;
        return getNodePoint(pipe.endNodeId, nodes)
            ?? (isValidPoint({ x: pipe.x2, y: pipe.y2 }) ? { x: pipe.x2 as number, y: pipe.y2 as number } : null);
    }

    return null;
};

export const getPipeApproachAngleAtChamber = (chamber: GlyphNode, pipe: GlyphPipe, nodes: GlyphNode[]) => {
    const adjacentPoint = getPipeAdjacentPointAtChamber(chamber, pipe, nodes);
    if (!adjacentPoint) {
        const fallbackNodeId = pipe.endNodeId === chamber.id ? pipe.startNodeId : pipe.endNodeId;
        return getPipeAngleAtChamber(chamber, fallbackNodeId || '', nodes);
    }

    const dx = adjacentPoint.x - chamber.x;
    const dy = adjacentPoint.y - chamber.y;
    return Math.atan2(dy, dx);
};

export const discretizeDirection = (angle: number, allowedDirs?: number[]): number => {
    // Normalize angle to 0..2PI
    let norm = angle % (2 * Math.PI);
    if (norm < 0) norm += 2 * Math.PI;

    let bestDir = -1;
    let minErr = Infinity;

    const dirsToCheck = allowedDirs || [0, 1, 2, 3, 4, 5, 6, 7];

    for (const dir of dirsToCheck) {
        const targetAngle = dir * (Math.PI / 4);
        let err = Math.abs(norm - targetAngle);
        err = Math.min(err, 2 * Math.PI - err); // Wrap around distance
        if (err < minErr) {
            minErr = err;
            bestDir = dir;
        }
    }
    return bestDir;
};

export const classifyChamberType = (inCount: number, outCount: number, inAngle: number, outAngle: number): ChamberGlyphType => {
    if (inCount === 0 && outCount === 1) return 'START';
    if (inCount === 1 && outCount === 0) return 'TERMINAL';
    if (inCount === 1 && outCount === 1) {
        let diff = Math.abs(inAngle - outAngle);
        diff = Math.min(diff, 2 * Math.PI - diff);
        const diffDeg = diff * (180 / Math.PI);
        if (Math.abs(diffDeg - 180) <= 35) {
            return 'STRAIGHT';
        }
        return 'TURN';
    }
    if (inCount >= 2 && outCount === 1) return 'CONFLUENCE';
    if (inCount === 1 && outCount >= 2) return 'BIFURCATION';
    return 'COMPLEX';
};

export const buildGlyphModel = (chamber: GlyphNode, pipes: GlyphPipe[], chambers: GlyphNode[]): ChamberGlyphModel | null => {
    const { inputs, outputs } = getConnectedPipesForChamber(chamber.id, pipes);

    if (inputs.length === 0 && outputs.length === 0) return null;

    const inAngles = inputs.map(p => getPipeApproachAngleAtChamber(chamber, p, chambers));
    const outAngles = outputs.map(p => getPipeApproachAngleAtChamber(chamber, p, chambers));

    const inAngle0 = inAngles[0] || 0;
    const outAngle0 = outAngles[0] || 0;

    const type = classifyChamberType(inputs.length, outputs.length, inAngle0, outAngle0);

    const inputDirs = Array.from(new Set(inAngles.map(a => discretizeDirection(a))));
    const outputDirs = Array.from(new Set(outAngles.map(a => discretizeDirection(a))));

    return { type, inputDirs, outputDirs };
};

// ── Render Component ──

interface Props {
    chamber: GlyphNode;
    pipes: GlyphPipe[];
    chambers: GlyphNode[];
    size?: number;
}

export const ChamberConnectionGlyphSvg: React.FC<Props> = ({ chamber, pipes, chambers, size = 28 }) => {
    const model = React.useMemo(() => buildGlyphModel(chamber, pipes, chambers), [chamber, pipes, chambers]);

    if (!model) return null;

    const cx = size / 2;
    const cy = size / 2;
    const padding = 6;
    const radius = cx - padding;

    const drawConnection = (dir: number, isIncoming: boolean, index: number) => {
        const angle = dir * (Math.PI / 4);

        let startR = radius;
        let endR = isIncoming ? 4 : 0;

        if (isIncoming) {
            startR = radius + 2;
            endR = 4;
        } else {
            startR = 4;
            endR = radius + 2;
        }

        const x1 = cx + Math.cos(angle) * startR;
        const y1 = cy + Math.sin(angle) * startR;
        const x2 = cx + Math.cos(angle) * endR;
        const y2 = cy + Math.sin(angle) * endR;

        return (
            <g key={`connection-${isIncoming ? 'in' : 'out'}-${index}`}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />
                {isIncoming && (
                    <circle cx={x1} cy={y1} r={2} fill="#0f172a" />
                )}
                {!isIncoming && (
                    <polygon
                        points={`${x2 + 2 * Math.cos(angle)},${y2 + 2 * Math.sin(angle)} ${x2 - 4 * Math.cos(angle - 0.5)},${y2 - 4 * Math.sin(angle - 0.5)} ${x2 - 4 * Math.cos(angle + 0.5)},${y2 - 4 * Math.sin(angle + 0.5)}`}
                        fill="#0f172a"
                    />
                )}
            </g>
        );
    };

    return (
        <svg width={size} height={size} style={{ overflow: 'visible' }}>
            <circle cx={cx} cy={cy} r={size / 2 - 2} fill="none" stroke="#94a3b8" strokeWidth="1.5" />
            <circle cx={cx} cy={cy} r={3} fill="#0f172a" />

            {model.inputDirs.map((dir, i) => drawConnection(dir, true, i))}
            {model.outputDirs.map((dir, i) => drawConnection(dir, false, i))}
        </svg>
    );
};

export const ChamberConnectionGlyph: React.FC<Props> = (props) => {
    return (
        <div style={{
            position: 'absolute',
            top: -42,
            left: '50%',
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
            zIndex: 10,
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '50%',
            boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
            border: '2px solid #e2e8f0',
            width: props.size || 28,
            height: props.size || 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }}>
            <ChamberConnectionGlyphSvg {...props} />
        </div>
    );
};
