import React from 'react';
import { GravityRouteProfileData } from '../hydraulics/routeEngineGravity';
import { useProject } from '../context/ProjectContext';
import { ChamberConnectionGlyphSvg } from './network/ChamberConnectionGlyph';

interface RouteProfileViewProps {
    data: GravityRouteProfileData | null;
    svgRef?: React.RefObject<SVGSVGElement>;
}

// ── SVG coord space ──────────────────────────────────────────────────────────
const SVG_W = 1200;
const SVG_H = 620;
const M = { top: 28, right: 60, bottom: 180, left: 140 };
const PLOT_W = SVG_W - M.left - M.right;   // 1070
const PLOT_H = SVG_H - M.top - M.bottom;   // 412

// ── Tabular strip ────────────────────────────────────────────────────────────
const STRIP_TOP    = M.top + PLOT_H + 2;   // 442
const STRIP_ROW_H  = 22;
const STRIP_LABEL_W = 128;
const STRIP_ROWS   = ['Progresiva (m)', 'C. Terreno (m)', 'C. Radier (m)', 'Pendiente (%)', 'Diámetro (mm)', 'Largo (m)'];
const STRIP_H      = STRIP_ROWS.length * STRIP_ROW_H; // 132

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
    radierLo:       'var(--pipe-line-dark)', radierHi:      'var(--pipe-line)', radierGlow:    'var(--pipe-glow)',
    radierSelLo:    'var(--pipe-selected-dark)', radierSelHi:   'var(--pipe-selected)', radierSelGlow: 'var(--pipe-selected-glow)',
    terrain:        'var(--terrain-line)',
    terrainFillTop: 'var(--terrain-fill-top)', terrainFillBot: 'var(--terrain-fill-bottom)',
    grid:      'var(--grid-color)',
    axisLine:  'var(--border)', axisText: 'var(--text-secondary)', axisLabel: 'var(--text-muted)',
    startDot:  'var(--success)', endDot: 'var(--danger)', midDot: 'var(--accent)', selDot: 'var(--warning)',
    camLine:   'var(--cam-line)', camLineSel: 'var(--cam-line-selected)',
    warnTxt:   'var(--warning)', plotBg: 'var(--bg)', canvasBg: 'var(--bg)', plotBorder: 'var(--border)',
    segTxt:    'var(--text-secondary)',
    panelBg:   'var(--surface)', panelBorder: 'var(--border)', rowBg: 'var(--surface-elevated)',
    rowHover:  'var(--hover-bg)', rowSel: 'var(--accent-soft)', rowCamSel: 'var(--accent-soft)',
    accent:    'var(--accent)', accentSeg: 'var(--warning)',
    txtP:      'var(--text-primary)', txtS: 'var(--text-secondary)', txtD: 'var(--text-muted)', separator: 'var(--border)',
    crosshair: 'var(--crosshair)', tooltipBg: 'var(--surface-elevated)',
    stripBg:   'var(--strip-bg)', stripBgAlt: 'var(--strip-bg-alt)',
    stripBorder: 'var(--strip-border)', stripLabel: 'var(--text-secondary)', stripValue: 'var(--text-primary)',
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const isFin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const fmt   = (v: number | undefined, d = 2) => isFin(v) ? v.toFixed(d) : '--';
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function niceTicks(min: number, max: number, targetCount = 6): number[] {
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
    if (min === max) return [min];
    const span = Math.abs(max - min);
    const roughStep = span / Math.max(1, targetCount);
    const pow10 = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const err = roughStep / pow10;
    let step = pow10;
    if (err >= 5) step = 5 * pow10;
    else if (err >= 2) step = 2 * pow10;
    const niceMin = Math.floor(min / step) * step;
    const niceMax = Math.ceil(max / step) * step;
    const ticks: number[] = [];
    for (let v = niceMin; v <= niceMax + step * 0.5; v += step) {
        ticks.push(Math.abs(v) < 1e-12 ? 0 : v);
        if (ticks.length > 100) break;
    }
    return ticks;
}

const safeExtent = (values: (number | undefined | null)[], fallback: [number, number]): [number, number] => {
    const f = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (f.length === 0) return fallback;
    const mn = Math.min(...f), mx = Math.max(...f);
    if (mn === mx) return [mn - 0.5, mx + 0.5];
    return [mn, mx];
};

const buildPath = (
    nodes: GravityRouteProfileData['nodes'],
    xM: (v: number) => number,
    yM: (v: number) => number,
    get: (n: GravityRouteProfileData['nodes'][number]) => number | undefined
) => {
    let p = '', d = false;
    nodes.forEach(n => {
        const v = get(n);
        if (!isFin(v)) { d = false; return; }
        const sx = xM(n.chainage), sy = yM(v);
        p += d ? `L${sx.toFixed(2)} ${sy.toFixed(2)} ` : `M${sx.toFixed(2)} ${sy.toFixed(2)} `;
        d = true;
    });
    return p.trim();
};

type SItem =
    | { type: 'CAM'; ni: number; nodeId: string }
    | { type: 'SEG'; si: number; fromId: string; toId: string; fromLabel: string; toLabel: string };

// ════════════════════════════════════════════════════════════════════════════
export const RouteProfileView: React.FC<RouteProfileViewProps> = ({ data, svgRef }) => {
    const fallbackRef = React.useRef<SVGSVGElement>(null);
    const finalRef    = svgRef ?? fallbackRef;
    const sidebarRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
    const wasDrag     = React.useRef(false);

    const { pipes, chambers } = useProject();

    // ── UI State ──────────────────────────────────────────────────────────────
    const [isFullscreen, setIsFullscreen] = React.useState(false);
    const [showWarn,     setShowWarn]     = React.useState(false);
    const [selCamId,     setSelCamId]     = React.useState<string | null>(null);
    const [selSegKey,    setSelSegKey]    = React.useState<string | null>(null);
    const [openKey,      setOpenKey]      = React.useState<string | null>(null);

    // ── Interaction State ─────────────────────────────────────────────────────
    const [hoverPos, setHoverPos] = React.useState<{ x: number; y: number; valX: number; valY: number } | null>(null);
    const [tooltip,  setTooltip]  = React.useState<null | { type: 'CAM' | 'SEG'; data: any; x: number; y: number }>(null);

    const maxCh = React.useMemo(() => data ? Math.max(1, ...data.nodes.map(n => n.chainage)) : 1, [data]);

    const [view, setView] = React.useState({ x0: 0, x1: maxCh, y0: 0, y1: 1 });
    const viewRef = React.useRef(view);

    const routeKey = data?.route?.nodeIds?.join('>') ?? '';

    React.useEffect(() => {
        if (!data) return;
        const allElev: (number | undefined)[] = [];
        data.nodes.forEach(n => allElev.push(n.ct, n.cre, n.crs));
        data.segments.forEach(s => allElev.push(s.invertStart, s.invertEnd));
        const [yMn, yMx] = safeExtent(allElev, [0, 1]);
        const pad = (yMx - yMn || 1) * 0.15 + 0.5;
        const initView = { x0: 0, x1: maxCh, y0: yMn - pad, y1: yMx + pad };
        setView(initView);
        viewRef.current = initView;
        setSelCamId(null); setSelSegKey(null); setOpenKey(null);
    }, [data, routeKey, maxCh]);

    const toSvgX = (clientX: number) => {
        const r = finalRef.current?.getBoundingClientRect();
        return r ? (clientX - r.left) * (SVG_W / r.width) : 0;
    };
    const toSvgY = (clientY: number) => {
        const r = finalRef.current?.getBoundingClientRect();
        return r ? (clientY - r.top) * (SVG_H / r.height) : 0;
    };

    const xSvg = (c: number) => M.left + (c - view.x0) / (view.x1 - view.x0) * PLOT_W;
    const ySvg = (e: number) => M.top  + (view.y1 - e)  / (view.y1 - view.y0) * PLOT_H;
    const xVal = (sx: number) => view.x0 + (sx - M.left) / PLOT_W * (view.x1 - view.x0);
    const yVal = (sy: number) => view.y1 - (sy - M.top)  / PLOT_H * (view.y1 - view.y0);

    // ── Handlers ──────────────────────────────────────────────────────────────
    const [panning, setPanning] = React.useState<{ sx: number; sy: number; v0: typeof view } | null>(null);

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const sx = toSvgX(e.clientX), sy = toSvgY(e.clientY);
        const { x0, x1, y0, y1 } = viewRef.current;
        const vX = xVal(sx), vY = yVal(sy);
        const zoomF  = e.deltaY > 0 ? 1.15 : 0.85;
        const onlyX  = e.shiftKey && !e.altKey;
        const onlyY  = e.altKey  && !e.shiftKey;
        const zoomXY = !e.shiftKey && !e.altKey;
        const kx = (onlyX || zoomXY) ? zoomF : 1;
        const ky = (onlyY || zoomXY) ? zoomF : 1;
        const nXRange = clamp((x1 - x0) * kx, Math.max(maxCh * 0.0001, 0.1), maxCh * 20);
        const nYRange = (y1 - y0) * ky;
        const xRat = clamp((vX - x0) / (x1 - x0), 0, 1);
        const yRat = clamp((vY - y0) / (y1 - y0), 0, 1);
        const nView = {
            ...viewRef.current,
            x0: vX - xRat * nXRange,       x1: vX + (1 - xRat) * nXRange,
            y0: vY - yRat * nYRange,        y1: vY + (1 - yRat) * nYRange,
        };
        setView(nView); viewRef.current = nView;
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        wasDrag.current = false;
        setPanning({ sx: toSvgX(e.clientX), sy: toSvgY(e.clientY), v0: { ...viewRef.current } });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        const sx = toSvgX(e.clientX), sy = toSvgY(e.clientY);
        setHoverPos({ x: sx, y: sy, valX: xVal(sx), valY: yVal(sy) });
        if (panning) {
            wasDrag.current = true;
            const dx = sx - panning.sx, dy = sy - panning.sy;
            const { x0, x1, y0, y1 } = panning.v0;
            const xR = x1 - x0, yR = y1 - y0;
            const nView = {
                ...panning.v0,
                x0: x0 - (dx / PLOT_W) * xR, x1: x1 - (dx / PLOT_W) * xR,
                y0: y0 + (dy / PLOT_H) * yR,  y1: y1 + (dy / PLOT_H) * yR,
            };
            setView(nView); viewRef.current = nView;
        }
    };

    const handleMouseUp = () => setPanning(null);

    const handleDblClick = () => {
        if (!data) return;
        const allElev: (number | undefined)[] = [];
        data.nodes.forEach(n => allElev.push(n.ct, n.cre, n.crs));
        data.segments.forEach(s => allElev.push(s.invertStart, s.invertEnd));
        const [yMn, yMx] = safeExtent(allElev, [0, 1]);
        const pad = (yMx - yMn || 1) * 0.15 + 0.5;
        const rView = { x0: 0, x1: maxCh, y0: yMn - pad, y1: yMx + pad };
        setView(rView); viewRef.current = rView;
    };

    // ── Node interactions ─────────────────────────────────────────────────────
    const camShort = (nodeId: string) => {
        const idx = data?.nodes.findIndex(n => n.nodeId === nodeId) ?? -1;
        if (idx < 0) return '?';
        const lbl = data!.nodes[idx].label;
        return (lbl && lbl.length <= 6) ? lbl : `C${idx + 1}`;
    };

    const onCamSelect = (nodeId: string) => {
        if (wasDrag.current) return;
        setSelCamId(p => p === nodeId ? null : nodeId);
        setSelSegKey(null);
        setOpenKey(`cam:${nodeId}`);
        setTimeout(() => sidebarRefs.current[`cam:${nodeId}`]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
    };

    const onSegSelect = (si: number, key: string) => {
        if (wasDrag.current) return;
        setSelSegKey(p => p === key ? null : key);
        setSelCamId(null);
        setOpenKey(`seg:${si}`);
        setTimeout(() => sidebarRefs.current[`seg:${si}`]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
    };

    const onSidebarItem = (item: SItem) => {
        if (item.type === 'CAM') {
            setSelCamId(item.nodeId); setSelSegKey(null); setOpenKey(`cam:${item.nodeId}`);
            const node = data?.nodes[item.ni];
            if (node) {
                const r = viewRef.current.x1 - viewRef.current.x0;
                setView(v => ({ ...v, x0: node.chainage - r / 2, x1: node.chainage + r / 2 }));
                viewRef.current = { ...viewRef.current, x0: node.chainage - r / 2, x1: node.chainage + r / 2 };
            }
        } else {
            const key = `${item.fromId}→${item.toId}`;
            setSelSegKey(key); setSelCamId(null); setOpenKey(`seg:${item.si}`);
            const seg = data?.segments[item.si];
            if (seg) {
                const mid = (seg.chainageStart + seg.chainageEnd) / 2;
                const r   = viewRef.current.x1 - viewRef.current.x0;
                setView(v => ({ ...v, x0: mid - r / 2, x1: mid + r / 2 }));
                viewRef.current = { ...viewRef.current, x0: mid - r / 2, x1: mid + r / 2 };
            }
        }
    };

    if (!data || !data.nodes.length)
        return <div className="results-empty-state">Perfil de ruta: sin datos.</div>;

    const terrain  = buildPath(data.nodes, xSvg, ySvg, n => n.ct);
    const hasDraw  = data.nodes.some(n => isFin(n.ct)) || data.segments.some(s => isFin(s.invertStart));
    const sideItems: SItem[] = [];
    data.nodes.forEach((n, i) => {
        sideItems.push({ type: 'CAM', ni: i, nodeId: n.nodeId });
        if (data.segments[i]) {
            sideItems.push({
                type: 'SEG', si: i,
                fromId: n.nodeId, toId: data.nodes[i + 1]?.nodeId ?? '?',
                fromLabel: camShort(n.nodeId), toLabel: camShort(data.nodes[i + 1]?.nodeId ?? '?'),
            });
        }
    });

    const zoomLevel    = PLOT_W / (view.x1 - view.x0);
    const showAllLabels = zoomLevel > 3.0;
    const segmentAnnotationBands = [0.9, 0.82, 0.74, 0.66];

    // ── Scale bar ─────────────────────────────────────────────────────────────
    const xRange   = view.x1 - view.x0;
    const sbTarget = xRange * 0.15;
    const sbPow    = Math.pow(10, Math.floor(Math.log10(Math.max(sbTarget, 0.1))));
    const sbNice   = ([1, 2, 5, 10].map(m => m * sbPow).find(v => v >= sbTarget * 0.5)) ?? sbPow;
    const sbPx     = sbNice / xRange * PLOT_W;
    const sbX      = M.left + PLOT_W - 14 - sbPx;
    const sbY      = M.top + PLOT_H - 18;
    const sbLabel  = sbNice >= 1000 ? `${(sbNice / 1000).toFixed(1)} km` : `${sbNice.toFixed(sbNice < 1 ? 1 : 0)} m`;

    // ── Crosshair: only inside plot ───────────────────────────────────────────
    const hoverInPlot = hoverPos
        && hoverPos.x >= M.left && hoverPos.x <= M.left + PLOT_W
        && hoverPos.y >= M.top  && hoverPos.y <= M.top  + PLOT_H;

    // ── X-axis tick Y baseline (below strip) ──────────────────────────────────
    const xAxisTickY = STRIP_TOP + STRIP_H + 4;

    // ════════════════════════════════════════════════════════════════════════
    return (
        <div style={{ display: 'flex', height: '100%', width: '100%', minHeight: 0, background: C.canvasBg, overflow: 'hidden' }}>

            {/* ── LEFT: MAIN CANVAS ─────────────────────────────────────────── */}
            <div style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>

                {/* HUD */}
                <div style={{ position: 'absolute', top: 12, left: 16, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                     <button onClick={() => setIsFullscreen(!isFullscreen)}
                         style={{ background: 'var(--hover-bg)', border: '1px solid var(--accent)', color: 'var(--text-primary)', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
                        {isFullscreen ? '⊙ Salir Pantalla Completa' : '⛶ Pantalla Completa'}
                    </button>
                     {data.warnings.length > 0 && (
                         <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', borderRadius: 4, padding: '4px 8px', cursor: 'pointer' }}
                             onClick={() => setShowWarn(!showWarn)}>
                             <span style={{ color: 'var(--warning)', fontSize: '0.72rem', fontWeight: 800 }}>⚠ {data.warnings.length}</span>
                         </div>
                     )}
                </div>

                <div style={{ position: 'absolute', bottom: 12, right: 16, zIndex: 10, fontSize: '0.65rem', color: C.txtS, background: 'rgba(0,0,0,0.4)', padding: '2px 8px', borderRadius: 4, pointerEvents: 'none' }}>
                    S: {fmt(hoverPos?.valX)} m | C: {fmt(hoverPos?.valY)} m | Shift: Solo X | Alt: Solo Y
                </div>

                {showWarn && (
                    <div style={{ position: 'absolute', top: 50, left: 16, zIndex: 11, background: 'rgba(15,23,42,0.95)', border: '1px solid #fb923c', borderRadius: 6, padding: '10px', maxWidth: 400, maxHeight: 200, overflow: 'auto' }}>
                         <div style={{ fontSize: '0.7rem', color: 'var(--warning)' }}>{data.warnings.map((w, i) => <div key={i}>· {w}</div>)}</div>
                    </div>
                )}

                {/* ── SVG ── */}
                <svg ref={finalRef} viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                    style={{ flex: 1, cursor: panning ? 'grabbing' : 'crosshair', userSelect: 'none', touchAction: 'none' }}
                    onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
                    onMouseLeave={() => { handleMouseUp(); setHoverPos(null); }}
                    onMouseUp={handleMouseUp} onDoubleClick={handleDblClick}
                >
                    <defs>
                        {/* Radier gradients */}
                        <linearGradient id="rpv-r"  x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"   stopColor={C.radierHi} />
                            <stop offset="100%" stopColor={C.radierLo} />
                        </linearGradient>
                        <linearGradient id="rpv-rs" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"   stopColor={C.radierSelHi} />
                            <stop offset="100%" stopColor={C.radierSelLo} />
                        </linearGradient>
                        {/* Glow filter */}
                        <filter id="rpv-gs">
                            <feGaussianBlur stdDeviation="3.5" result="b" />
                            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                        {/* Plot clip */}
                        <clipPath id="rpv-clip">
                            <rect x={M.left} y={M.top} width={PLOT_W} height={PLOT_H} />
                        </clipPath>
                        {/* Terrain gradient */}
                        <linearGradient id="rpv-tg" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"   stopColor={C.terrainFillTop} />
                            <stop offset="100%" stopColor={C.terrainFillBot} />
                        </linearGradient>
                        {/* Terrain diagonal stripe pattern */}
                        <pattern id="rpv-tp" x="0" y="0" width="6" height="6"
                            patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                            <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(146,64,14,0.08)" strokeWidth="3" />
                        </pattern>
                    </defs>

                    {/* Canvas background */}
                    <rect x={0} y={0} width={SVG_W} height={SVG_H} fill={C.canvasBg} />

                    {!hasDraw && (
                        <text x={SVG_W / 2} y={SVG_H / 2} textAnchor="middle" fill={C.txtS} fontSize={14} fontWeight={800}>
                            Sin datos suficientes para dibujar perfil
                        </text>
                    )}

                    {/* ── CLIPPED PLOT CONTENT ── */}
                    <g clipPath="url(#rpv-clip)">

                        {/* Grid — behind everything */}
                        <g opacity={0.45}>
                            {niceTicks(view.y0, view.y1, 5).map(v => (
                                <line key={`gy-${v}`} x1={M.left} y1={ySvg(v)} x2={M.left + PLOT_W} y2={ySvg(v)} stroke={C.grid} strokeWidth={0.5} />
                            ))}
                            {niceTicks(view.x0, view.x1, 8).map(v => (
                                <line key={`gx-${v}`} x1={xSvg(v)} y1={M.top} x2={xSvg(v)} y2={M.top + PLOT_H} stroke={C.grid} strokeWidth={0.5} />
                            ))}
                        </g>

                        {/* Camera vertical dotted lines (before segments) */}
                        {data.nodes.map(node => {
                            const x = xSvg(node.chainage);
                            if (x < M.left - 1 || x > M.left + PLOT_W + 1) return null;
                            const isSel = selCamId === node.nodeId;
                            const ctY   = isFin(node.ct) ? ySvg(node.ct as number) : M.top;
                            return (
                                <line key={`cvl-${node.nodeId}`}
                                    x1={x} y1={ctY} x2={x} y2={M.top + PLOT_H}
                                    stroke={isSel ? C.camLineSel : C.camLine}
                                    strokeWidth={isSel ? 1.5 : 0.8}
                                    strokeDasharray="3 3"
                                />
                            );
                        })}

                        {/* Terrain: gradient fill + stripe fill + dashed stroke */}
                        {terrain && (() => {
                            const fv = data.nodes.find(n => isFin(n.ct));
                            const lv = [...data.nodes].reverse().find(n => isFin(n.ct));
                            if (!fv || !lv) return null;
                            const yB = ySvg(view.y0 - 100);
                            const closedPath = `${terrain} L${xSvg(lv.chainage)} ${yB} L${xSvg(fv.chainage)} ${yB} Z`;
                            return (
                                <>
                                    <path d={closedPath} fill="url(#rpv-tg)" />
                                    <path d={closedPath} fill="url(#rpv-tp)" />
                                    <path d={terrain} fill="none" stroke={C.terrain} strokeWidth={2} strokeDasharray="8 4" opacity={0.85} />
                                </>
                            );
                        })()}

                        {/* Segments */}
                        {data.segments.map((seg, si) => {
                            if (!isFin(seg.invertStart) || !isFin(seg.invertEnd)) return null;
                            const x1 = xSvg(seg.chainageStart), x2 = xSvg(seg.chainageEnd);
                            if (x2 < 0 || x1 > SVG_W) return null;
                            const y1 = ySvg(seg.invertStart as number), y2 = ySvg(seg.invertEnd as number);
                            const key   = `${seg.fromNodeId}→${seg.toNodeId}`;
                            const isSel = selSegKey === key;
                            const isHov = tooltip?.type === 'SEG' && tooltip.data.pipeId === seg.pipeId;
                            const pxPerMeter  = PLOT_W / (view.x1 - view.x0);
                            const segWidthPx  = Math.abs(x2 - x1);
                            const showLabel   = pxPerMeter > 1.2 && segWidthPx > 90;
                            const labelOpacity    = clamp((pxPerMeter - 1.2) / 1.5, 0, 1) * 0.9;
                            const labelFontSize   = clamp(9 + (pxPerMeter - 1.2) * 1.05, 9, 11);
                            const midX    = (x1 + x2) / 2;
                            const midY    = (y1 + y2) / 2;
                            const bandY = M.top + PLOT_H * segmentAnnotationBands[si % segmentAnnotationBands.length];
                            const snappedY = Math.round((bandY - 14) / 4) * 4;
                            const finalX  = clamp(midX, M.left + 50, SVG_W - M.right - 50);
                            const finalY  = clamp(snappedY, M.top + 20, M.top + PLOT_H - 20);

                            return (
                                <g key={key} onClick={() => onSegSelect(si, key)} style={{ cursor: 'pointer' }}
                                    onMouseEnter={() => setTooltip({ type: 'SEG', data: { ...seg, si }, x: midX, y: midY - 20 })}
                                    onMouseLeave={() => setTooltip(null)}>
                                    <line x1={x1} y1={y1} x2={x2} y2={y2}
                                        stroke={isSel ? C.radierSelGlow : (isHov ? 'rgba(96,165,250,0.1)' : 'none')}
                                        strokeWidth={isSel ? 16 : 14} strokeLinecap="round" />
                                    <line x1={x1} y1={y1} x2={x2} y2={y2}
                                        stroke={isSel ? 'url(#rpv-rs)' : 'url(#rpv-r)'}
                                        strokeWidth={isSel ? 5 : 3.5} strokeLinecap="round"
                                        filter={isSel ? 'url(#rpv-gs)' : 'none'} />
                                    {(isSel || isHov || showLabel) && (
                                        <g transform={`translate(${finalX}, ${finalY})`}
                                            opacity={isSel || isHov ? 1 : labelOpacity}
                                            style={{ transition: 'opacity 0.2s' }}>
                                            <text textAnchor="middle" fontSize={labelFontSize} fontWeight={800}
                                                fill={isSel ? '#fbbf24' : C.txtP}
                                                style={{ pointerEvents: 'none', paintOrder: 'stroke', stroke: C.canvasBg, strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                                                {`L=${fmt(seg.length)} | i=${fmt(seg.slope)}% | DN${fmt(seg.diameter, 0)}`}
                                            </text>
                                        </g>
                                    )}
                                </g>
                            );
                        })}

                        {/* Camera labels (above glyph) */}
                        {data.nodes.map((node, ni) => {
                            const x = xSvg(node.chainage);
                            if (!isFin(node.ct) || x < M.left - 20 || x > M.left + PLOT_W + 20) return null;
                            const ctY     = ySvg(node.ct as number);
                            const hasGlyph = !!chambers.find(c => c.id === node.nodeId);
                            const verticalOffset = hasGlyph ? 58 : 42;
                            const labelY = clamp(ctY - verticalOffset, M.top + 16, M.top + PLOT_H - 14);
                            const isSel   = selCamId === node.nodeId;
                            return (
                                <text key={`cl-${node.nodeId}`}
                                    x={x} y={labelY} textAnchor="middle"
                                    fontSize={8} fontWeight={800}
                                    fill={isSel ? '#fbbf24' : C.txtP}
                                    style={{ paintOrder: 'stroke', stroke: C.canvasBg, strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round', pointerEvents: 'none' }}>
                                    {camShort(node.nodeId)}
                                </text>
                            );
                        })}

                        {/* Cameras */}
                        {data.nodes.map((node, ni) => {
                            const x = xSvg(node.chainage);
                            if (x < -20 || x > SVG_W + 20) return null;
                            const ctY  = isFin(node.ct)  ? ySvg(node.ct  as number) : undefined;
                            const crsY = isFin(node.crs) ? ySvg(node.crs as number) : undefined;
                            const creY = isFin(node.cre) ? ySvg(node.cre as number) : undefined;
                            const mIY  = isFin(crsY) && isFin(creY) ? Math.max(crsY, creY) : (crsY ?? creY);
                            const isSel  = selCamId === node.nodeId;
                            const isHov  = tooltip?.type === 'CAM' && tooltip.data.ni === ni;
                            const dc     = isSel ? C.selDot : ni === 0 ? C.startDot : ni === data.nodes.length - 1 ? C.endDot : C.midDot;
                            const invs   = [node.cre, node.crs].filter(isFin) as number[];
                            const minInv = invs.length ? Math.min(...invs) : undefined;
                            const hVal   = isFin(node.ct) && isFin(minInv) ? (node.ct as number) - minInv : 0;
                            const chamber = chambers.find(c => c.id === node.nodeId);

                            return (
                                <g key={node.nodeId} onClick={() => onCamSelect(node.nodeId)} style={{ cursor: 'pointer' }}
                                    onMouseEnter={() => setTooltip({ type: 'CAM', data: { ...node, ni, hVal }, x, y: (mIY ?? 100) - 20 })}
                                    onMouseLeave={() => setTooltip(null)}>
                                    {isFin(ctY) && isFin(mIY) && <line x1={x} y1={ctY} x2={x} y2={mIY} stroke={isSel ? '#fbbf24' : 'rgba(148,163,184,0.4)'} strokeWidth={isSel ? 4 : 2.5} />}
                                    {isFin(creY) && <line x1={x - 10} y1={creY} x2={x + 10} y2={creY} stroke={isSel ? '#fbbf24' : '#38bdf8'} strokeWidth={isSel ? 5 : 3} strokeLinecap="round" />}
                                    {isFin(crsY) && <line x1={x - 10} y1={crsY} x2={x + 10} y2={crsY} stroke={isSel ? '#fbbf24' : '#818cf8'} strokeWidth={isSel ? 5 : 3} strokeLinecap="round" />}
                                    {isFin(mIY) && (
                                        <g>
                                            {isSel && <circle cx={x} cy={mIY} r={14} fill="var(--warning-bg)" />}
                                            <circle cx={x} cy={mIY} r={isSel ? 8 : 5} fill={dc} stroke={isSel ? '#fff' : 'none'} strokeWidth={1.5} />
                                        </g>
                                    )}
                                    {chamber && isFin(ctY) && (
                                        <g transform={`translate(${x - 16}, ${ctY - 36})`}>
                                            <circle cx={16} cy={16} r={15} fill="rgba(255,255,255,0.95)" stroke="#e2e8f0" strokeWidth={1.5} />
                                            <g transform="translate(2, 2)">
                                                <ChamberConnectionGlyphSvg chamber={chamber} pipes={pipes} chambers={chambers} size={28} />
                                            </g>
                                        </g>
                                    )}
                                </g>
                            );
                        })}

                        {/* Scale bar */}
                        <g pointerEvents="none">
                            <rect x={sbX - 6} y={sbY - 14} width={sbPx + 12} height={22} rx={3} fill="rgba(0,0,0,0.35)" />
                            <line x1={sbX} y1={sbY} x2={sbX + sbPx} y2={sbY} stroke="#fff" strokeWidth={1.5} />
                            <line x1={sbX}        y1={sbY - 4} x2={sbX}        y2={sbY + 4} stroke="#fff" strokeWidth={1.5} />
                            <line x1={sbX + sbPx} y1={sbY - 4} x2={sbX + sbPx} y2={sbY + 4} stroke="#fff" strokeWidth={1.5} />
                            <text x={sbX + sbPx / 2} y={sbY - 5} textAnchor="middle" fontSize={8} fontWeight={700} fill="#fff">{sbLabel}</text>
                        </g>

                    </g>{/* end clip */}

                    {/* Plot border */}
                    <rect x={M.left} y={M.top} width={PLOT_W} height={PLOT_H} fill="none" stroke={C.plotBorder} strokeWidth={0.8} />

                    {/* ── Y-AXIS ── */}
                    <g>
                        <text x={28} y={M.top + PLOT_H / 2} textAnchor="middle" fontSize={9} fill={C.axisLabel}
                            transform={`rotate(-90, 28, ${M.top + PLOT_H / 2})`}>Cota (m)</text>
                        {niceTicks(view.y0, view.y1, 5).map(v => {
                            const y = ySvg(v);
                            if (y < M.top - 1 || y > M.top + PLOT_H + 1) return null;
                            return (
                                <g key={`ya-${v}`}>
                                    <line x1={M.left - 5} y1={y} x2={M.left} y2={y} stroke={C.axisLine} strokeWidth={0.8} />
                                    <text x={M.left - 10} y={y + 3.5} textAnchor="end" fontSize={8} fontWeight={600} fill={C.axisText}>
                                        {v.toFixed(1)}
                                    </text>
                                </g>
                            );
                        })}
                    </g>

                    {/* ── DATA STRIP ── */}
                    <g>
                        {/* Row backgrounds + label column */}
                        {STRIP_ROWS.map((label, ri) => {
                            const ry = STRIP_TOP + ri * STRIP_ROW_H;
                            return (
                                <g key={`sr-${ri}`}>
                                    <rect x={M.left} y={ry} width={PLOT_W} height={STRIP_ROW_H}
                                        fill={ri % 2 === 0 ? C.stripBg : C.stripBgAlt} />
                                    <rect x={M.left - STRIP_LABEL_W} y={ry} width={STRIP_LABEL_W} height={STRIP_ROW_H}
                                        fill={ri % 2 === 0 ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.06)'} />
                                    <text x={M.left - 8} y={ry + STRIP_ROW_H / 2 + 3}
                                        textAnchor="end" fontSize={7.5} fontWeight={700} fill={C.stripLabel}>{label}</text>
                                    <line x1={M.left - STRIP_LABEL_W} y1={ry + STRIP_ROW_H} x2={M.left + PLOT_W} y2={ry + STRIP_ROW_H}
                                        stroke={C.stripBorder} strokeWidth={0.5} />
                                </g>
                            );
                        })}

                        {/* Strip outer border */}
                        <rect x={M.left - STRIP_LABEL_W} y={STRIP_TOP} width={PLOT_W + STRIP_LABEL_W} height={STRIP_H}
                            fill="none" stroke={C.stripBorder} strokeWidth={0.8} />
                        <line x1={M.left} y1={STRIP_TOP} x2={M.left} y2={STRIP_TOP + STRIP_H}
                            stroke={C.stripBorder} strokeWidth={0.8} />

                        {/* Node values (rows 0-2) + vertical separators */}
                        {data.nodes.map((node, ni) => {
                            const x = xSvg(node.chainage);
                            if (x < M.left || x > M.left + PLOT_W) return null;
                            const vals = [
                                fmt(node.chainage, 2),
                                fmt(node.ct  as number | undefined, 2),
                                fmt(node.crs as number | undefined, 2),
                            ];
                            return (
                                <g key={`sv-${ni}`}>
                                    <line x1={x} y1={STRIP_TOP} x2={x} y2={STRIP_TOP + STRIP_H}
                                        stroke={C.stripBorder} strokeWidth={0.5} />
                                    {vals.map((val, ri) => (
                                        <text key={ri} x={x} y={STRIP_TOP + ri * STRIP_ROW_H + STRIP_ROW_H / 2 + 3}
                                            textAnchor="middle" fontSize={7.5} fontWeight={600} fill={C.stripValue}>{val}</text>
                                    ))}
                                </g>
                            );
                        })}

                        {/* Segment values (rows 3-5) */}
                        {data.segments.map((seg, si) => {
                            const midX = (xSvg(seg.chainageStart) + xSvg(seg.chainageEnd)) / 2;
                            if (midX < M.left || midX > M.left + PLOT_W) return null;
                            const vals = [
                                fmt(seg.slope    as number | undefined, 3),
                                fmt(seg.diameter as number | undefined, 0),
                                fmt(seg.length, 2),
                            ];
                            return vals.map((val, ri) => (
                                <text key={`ssv-${si}-${ri}`}
                                    x={midX} y={STRIP_TOP + (ri + 3) * STRIP_ROW_H + STRIP_ROW_H / 2 + 3}
                                    textAnchor="middle" fontSize={7.5} fontWeight={600} fill={C.stripValue}>{val}</text>
                            ));
                        })}
                    </g>

                    {/* ── X-AXIS (below strip) ── */}
                    <g>
                        <line x1={M.left} y1={xAxisTickY} x2={M.left + PLOT_W} y2={xAxisTickY}
                            stroke={C.axisLine} strokeWidth={0.5} />
                        {niceTicks(view.x0, view.x1, 8).map(v => {
                            const x = xSvg(v);
                            if (x < M.left - 1 || x > M.left + PLOT_W + 1) return null;
                            return (
                                <g key={`xa-${v}`}>
                                    <line x1={x} y1={xAxisTickY} x2={x} y2={xAxisTickY + 5} stroke={C.axisLine} strokeWidth={0.8} />
                                    <text x={x} y={xAxisTickY + 16} textAnchor="middle" fontSize={8} fill={C.axisText}>{v.toFixed(0)}</text>
                                </g>
                            );
                        })}
                        <text x={M.left + PLOT_W / 2} y={SVG_H - 3}
                            textAnchor="middle" fontSize={9} fill={C.axisLabel}>Distancia acumulada (m)</text>
                    </g>

                    {/* ── CROSSHAIR (only inside plot) ── */}
                    {hoverInPlot && (
                        <g pointerEvents="none">
                            <line x1={hoverPos!.x} y1={M.top} x2={hoverPos!.x} y2={M.top + PLOT_H}
                                stroke={C.crosshair} strokeWidth={1} strokeDasharray="3 3" />
                            <line x1={M.left} y1={hoverPos!.y} x2={M.left + PLOT_W} y2={hoverPos!.y}
                                stroke={C.crosshair} strokeWidth={1} strokeDasharray="3 3" />
                        </g>
                    )}

                    {/* ── TOOLTIP ── */}
                    {tooltip && (() => {
                        const isCAM = tooltip.type === 'CAM';
                        const entries: { pipeLabel: string; cre: number; delta: number }[] =
                            isCAM ? (tooltip.data.incomingEntries ?? []) : [];
                        const nEnt = entries.length;
                        // Filas fijas CAM: Prog, CT, CRs, H = 4 → última en y+80
                        // Filas por tramo (2 por tramo): y+94 + i*28 (CRe) y y+108 + i*28 (Δ)
                        // Si no hay incomingEntries: layout clásico (CRe+Δ únicos) → th=142
                        const camThBase = nEnt > 0 ? 100 + nEnt * 28 : 142;
                        const tw = 175, th = isCAM ? camThBase : 108;
                        const tx = clamp(tooltip.x + 10, M.left, SVG_W - tw - 4);
                        const ty = clamp(tooltip.y - 48, M.top + 4, SVG_H - th - 4);
                        return (
                            <g opacity={1} style={{ transition: 'all 0.1s' }} pointerEvents="none">
                                <rect x={tx} y={ty} width={tw} height={th} rx={6}
                                    fill={C.tooltipBg} stroke={C.panelBorder} strokeWidth={1}
                                    filter="drop-shadow(0 4px 6px rgba(0,0,0,0.5))" />
                                <text x={tx + 8} y={ty + 14} fontSize={10} fontWeight={900} fill={C.accent}>
                                    {isCAM ? `Cámara ${camShort(tooltip.data.nodeId)}` : `Tubería ${tooltip.data.label || tooltip.data.pipeId}`}
                                </text>
                                {!isCAM && (
                                    <text x={tx + 8} y={ty + 26} fontSize={8} fill={C.txtS}>
                                        ({camShort(tooltip.data.fromNodeId)} → {camShort(tooltip.data.toNodeId)})
                                    </text>
                                )}
                                {isCAM ? (
                                    <>
                                        <text x={tx + 8} y={ty + 38} fontSize={9} fill={C.txtS}>Prog: <tspan fill={C.txtP} fontWeight={700}>{fmt(tooltip.data.chainage)} m</tspan></text>
                                        <text x={tx + 8} y={ty + 52} fontSize={9} fill={C.txtS}>CT: <tspan fill={C.txtP} fontWeight={700}>{fmt(tooltip.data.ct)}</tspan></text>
                                        <text x={tx + 8} y={ty + 66} fontSize={9} fill={C.txtS}>CRs: <tspan fill={C.txtP} fontWeight={700}>{fmt(tooltip.data.crs)}</tspan></text>
                                        <text x={tx + 8} y={ty + 80} fontSize={9} fill={C.txtS}>H: <tspan fill={C.txtP} fontWeight={700}>{fmt(tooltip.data.h)} m</tspan></text>
                                        {nEnt > 0 ? (
                                            <>
                                                {/* separador */}
                                                <line x1={tx + 6} y1={ty + 88} x2={tx + tw - 6} y2={ty + 88}
                                                    stroke={C.separator} strokeWidth={0.5} opacity={0.5} />
                                                {entries.map((e, i) => (
                                                    <React.Fragment key={e.pipeLabel}>
                                                        <text x={tx + 8} y={ty + 100 + i * 28} fontSize={9} fill={C.txtS}>
                                                            CRe <tspan fontWeight={600}>{e.pipeLabel}</tspan>: <tspan fill={C.txtP} fontWeight={700}>{e.cre.toFixed(2)}</tspan>
                                                        </text>
                                                        <text x={tx + 8} y={ty + 114 + i * 28} fontSize={9} fill={C.txtS}>
                                                            Δ <tspan fontWeight={600}>{e.pipeLabel}</tspan>: <tspan fill={C.txtP} fontWeight={700}>{e.delta.toFixed(3)} m</tspan>
                                                        </text>
                                                    </React.Fragment>
                                                ))}
                                            </>
                                        ) : (
                                            <>
                                                <text x={tx + 8} y={ty + 94} fontSize={9} fill={C.txtS}>CRe: <tspan fill={C.txtP} fontWeight={700}>{fmt(tooltip.data.cre)}</tspan></text>
                                                <text x={tx + 8} y={ty + 108} fontSize={9} fill={C.txtS}>Δ: <tspan fill={C.txtP} fontWeight={700}>{fmt(tooltip.data.delta)} m</tspan></text>
                                            </>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <text x={tx + 8} y={ty + 42} fontSize={9} fill={C.txtS}>L: <tspan fill={C.txtP} fontWeight={700}>{fmt(tooltip.data.length)} m</tspan></text>
                                        <text x={tx + 8} y={ty + 56} fontSize={9} fill={C.txtS}>Pend: <tspan fill={C.txtP} fontWeight={700}>{fmt(tooltip.data.slope)} %</tspan></text>
                                        <text x={tx + 8} y={ty + 70} fontSize={9} fill={C.txtS}>DN: <tspan fill={C.txtP} fontWeight={700}>{fmt(tooltip.data.diameter, 0)} mm</tspan></text>
                                        <text x={tx + 8} y={ty + 84} fontSize={9} fill={C.txtS}>Inv: <tspan fill={C.txtP} fontWeight={700}>{fmt(tooltip.data.invertStart)} → {fmt(tooltip.data.invertEnd)}</tspan></text>
                                    </>
                                )}
                            </g>
                        );
                    })()}
                </svg>
            </div>

            {/* ── RIGHT: SIDEBAR ────────────────────────────────────────────── */}
            {!isFullscreen && (
                <div style={{ flex: '0 0 300px', width: 300, display: 'flex', flexDirection: 'column', background: C.panelBg, borderLeft: '1px solid #1e3a5f' }}>

                    {/* Header */}
                         <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-elevated)' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 900, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Perfil de Ruta</div>
                        <div style={{ fontSize: '0.65rem', color: C.txtS, marginTop: 4 }}>
                            {data.nodes.length} cámaras · {data.segments.length} tramos · {fmt(maxCh, 1)} m
                        </div>
                        {/* Legend */}
                        <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                            {([
                                { label: 'Terreno', color: '#92400e', type: 'dash' },
                                { label: 'Radier',  color: '#3b82f6', type: 'line' },
                                { label: 'Inicio',  color: '#22c55e', type: 'dot'  },
                                { label: 'Fin',     color: '#ef4444', type: 'dot'  },
                            ] as const).map(({ label, color, type }) => (
                                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.6rem', color: C.txtS }}>
                                    {type === 'dot'
                                        ? <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                        : <div style={{ width: 18, height: 0, borderBottom: `2.5px ${type === 'dash' ? 'dashed' : 'solid'} ${color}`, flexShrink: 0 }} />
                                    }
                                    <span>{label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Items list */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {sideItems.map(item => {
                            const isCam = item.type === 'CAM';
                            const key   = isCam ? `cam:${item.nodeId}` : `seg:${item.si}`;
                            const isOpen = openKey === key;
                            const isSel  = isCam ? selCamId === item.nodeId : selSegKey === `${item.fromId}→${item.toId}`;

                            return (
                                <div key={key} ref={el => { sidebarRefs.current[key] = el; }}
                                    style={{ borderBottom: '1px solid #142844' }}>
                                    <div onClick={() => onSidebarItem(item)}
                                        style={{ padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: isSel ? 'var(--accent-soft)' : 'transparent', borderLeft: `3px solid ${isSel ? (isCam ? C.accent : C.accentSeg) : 'transparent'}` }}>
                                        <div style={{ width: 8, height: isCam ? 8 : 2, borderRadius: isCam ? '50%' : 1, background: isCam ? C.midDot : C.accent, flexShrink: 0 }} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: isSel ? '#93c5fd' : C.txtP }}>
                                                {isCam ? `Cámara ${camShort(item.nodeId)}` : `Tramo ${item.fromLabel}→${item.toLabel}`}
                                            </div>
                                            {!isCam && (
                                                <div style={{ fontSize: '0.65rem', color: C.txtS }}>
                                                    {fmt(data.segments[item.si].length)} m | {fmt(data.segments[item.si].slope)}%
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.6rem', color: C.txtD, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</div>
                                    </div>

                                    {isOpen && (
                                        <div style={{ padding: '10px 20px 12px', background: 'rgba(0,0,0,0.2)', fontSize: '0.7rem' }}>
                                            {isCam ? (() => {
                                                const n = data.nodes[item.ni];
                                                const ents = n.incomingEntries ?? [];
                                                return (
                                                    <>
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                                            <div><span style={{ color: C.txtS }}>Prog:</span> <strong style={{ color: C.txtP }}>{fmt(n.chainage)}</strong></div>
                                                            <div><span style={{ color: C.txtS }}>CT:</span>   <strong style={{ color: C.txtP }}>{fmt(n.ct)}</strong></div>
                                                            <div><span style={{ color: C.txtS }}>CRs:</span>  <strong style={{ color: C.txtP }}>{fmt(n.crs)}</strong></div>
                                                            <div><span style={{ color: C.txtS }}>H:</span>    <strong style={{ color: C.txtP }}>{fmt(n.h)}</strong></div>
                                                            <div><span style={{ color: C.txtS }}>Tipo:</span> <strong style={{ color: C.txtP }}>{n.type || '--'}</strong></div>
                                                        </div>
                                                        {ents.length > 0 && (
                                                            <>
                                                                <div style={{ height: 1, background: C.separator, margin: '8px 0', opacity: 0.4 }} />
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                    {ents.map(e => (
                                                                        <div key={e.pipeLabel} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                                                            <div>
                                                                                <span style={{ color: C.txtS }}>CRe </span>
                                                                                <strong style={{ color: C.accentSeg }}>{e.pipeLabel}</strong>
                                                                                <span style={{ color: C.txtS }}>:</span>{' '}
                                                                                <strong style={{ color: C.txtP }}>{e.cre.toFixed(3)}</strong>
                                                                            </div>
                                                                            <div>
                                                                                <span style={{ color: C.txtS }}>Δ </span>
                                                                                <strong style={{ color: C.accentSeg }}>{e.pipeLabel}</strong>
                                                                                <span style={{ color: C.txtS }}>:</span>{' '}
                                                                                <strong style={{ color: C.txtP }}>{e.delta.toFixed(3)}</strong>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </>
                                                        )}
                                                    </>
                                                );
                                            })() : (() => {
                                                const s = data.segments[item.si];
                                                return (
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                                        <div><span style={{ color: C.txtS }}>L:</span>       <strong style={{ color: C.txtP }}>{fmt(s.length)}</strong></div>
                                                        <div><span style={{ color: C.txtS }}>i:</span>       <strong style={{ color: C.txtP }}>{fmt(s.slope)}%</strong></div>
                                                        <div><span style={{ color: C.txtS }}>DN:</span>      <strong style={{ color: C.txtP }}>{fmt(s.diameter, 0)}</strong></div>
                                                        <div><span style={{ color: C.txtS }}>Inv ini:</span> <strong style={{ color: C.txtP }}>{fmt(s.invertStart)}</strong></div>
                                                        <div><span style={{ color: C.txtS }}>Inv fin:</span> <strong style={{ color: C.txtP }}>{fmt(s.invertEnd)}</strong></div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

