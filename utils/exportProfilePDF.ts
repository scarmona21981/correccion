/**
 * exportProfilePDF.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Genera PDF y DXF del perfil longitudinal de alcantarillado gravitacional
 * con formato tipo plano técnico (estilo DWG).
 *
 * Mantiene la firma de exportProfileToPDF(data, svgElement, opts) que usa
 * ExportProfileDialog, pero ignora svgElement y dibuja directamente con jsPDF.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import jsPDF from 'jspdf';
import type {
    GravityRouteProfileData,
} from '../hydraulics/routeEngineGravity';

// ════════════════════════════════════════════════════════════════════════════
// Public types — compatible con ExportProfileDialog
// ════════════════════════════════════════════════════════════════════════════

export interface ProfileExportOptions {
    projectName?: string;
    routeLabel?: string;
    engineerName?: string;
    includeDiagram?: boolean; // ignorado (siempre dibuja)
    includeTable?: boolean;   // ignorado (siempre incluye)
    orientation?: 'portrait' | 'landscape';
    paperSize?: 'a4' | 'a3' | 'a2' | 'a1';
}

// ════════════════════════════════════════════════════════════════════════════
// Internal helpers
// ════════════════════════════════════════════════════════════════════════════

const isFin = (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v);

const fmt = (v: number | undefined, d = 2): string =>
    isFin(v) ? v.toFixed(d) : '--';

const COL = {
    terrain:   [220, 38,  38]  as [number, number, number],
    radier:    [22,  163, 74]  as [number, number, number],
    chamber:   [30,  41,  59]  as [number, number, number],
    grid:      [203, 213, 225] as [number, number, number],
    gridText:  [100, 116, 139] as [number, number, number],
    text:      [15,  23,  42]  as [number, number, number],
    textSec:   [71,  85,  105] as [number, number, number],
    blue:      [37,  99,  235] as [number, number, number],
    tblHeader: [241, 245, 249] as [number, number, number],
    tblBorder: [148, 163, 184] as [number, number, number],
    white:     [255, 255, 255] as [number, number, number],
    black:     [0,   0,   0]   as [number, number, number],
};

const PAPER: Record<string, [number, number]> = {
    a4: [297, 210], a3: [420, 297], a2: [594, 420], a1: [841, 594],
};

function niceTicks(min: number, max: number, target = 6): number[] {
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
    if (min === max) return [min];
    const span = Math.abs(max - min);
    const rough = span / Math.max(1, target);
    const p10 = Math.pow(10, Math.floor(Math.log10(rough)));
    const err = rough / p10;
    let step = p10;
    if (err >= 5) step = 5 * p10;
    else if (err >= 2) step = 2 * p10;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const t: number[] = [];
    for (let v = lo; v <= hi + step * 0.5; v += step) {
        t.push(Math.abs(v) < 1e-12 ? 0 : v);
        if (t.length > 100) break;
    }
    return t;
}

function fmtChainage(m: number): string {
    const km = Math.floor(m / 1000);
    const rem = m - km * 1000;
    return `${km}+${rem.toFixed(0).padStart(3, '0')}`;
}

function drawDashed(
    doc: jsPDF, x1: number, y1: number, x2: number, y2: number,
    pat: [number, number] = [2, 1.5]
): void {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.01) return;
    const ux = dx / len, uy = dy / len;
    let pos = 0;
    let on = true;
    while (pos < len) {
        const seg = on ? pat[0] : pat[1];
        const end = Math.min(pos + seg, len);
        if (on) doc.line(x1 + ux * pos, y1 + uy * pos, x1 + ux * end, y1 + uy * end);
        pos = end;
        on = !on;
    }
}

// ════════════════════════════════════════════════════════════════════════════
// exportProfileToPDF — PLANO TÉCNICO
// ════════════════════════════════════════════════════════════════════════════

export async function exportProfileToPDF(
    data: GravityRouteProfileData,
    _svgElement: SVGSVGElement | null,
    options: ProfileExportOptions = {}
): Promise<void> {
    const {
        projectName  = '',
        routeLabel   = '',
        engineerName = '',
        orientation  = 'landscape',
        paperSize    = 'a3',
    } = options;

    const [pw, ph] = PAPER[paperSize] || PAPER.a3;
    const pageW = orientation === 'landscape' ? pw : ph;
    const pageH = orientation === 'landscape' ? ph : pw;
    const doc = new jsPDF({ orientation, unit: 'mm', format: [pageW, pageH] });

    const ML = 15, MR = 15, MT = 10;
    const drawW = pageW - ML - MR;
    const GLYPH_H = 16, CHAINAGE_H = 7, TABLE_H = 30, TITLE_H = 22, MBOT = 4;
    const plotTop = MT + GLYPH_H + CHAINAGE_H;
    const plotBot = pageH - MBOT - TITLE_H - TABLE_H;
    const plotH = plotBot - plotTop;

    if (plotH < 20) {
        doc.setFontSize(10);
        doc.text('Espacio insuficiente para el perfil.', pageW / 2, pageH / 2, { align: 'center' });
        doc.save('perfil_error.pdf');
        return;
    }

    const maxCh = Math.max(1, ...data.nodes.map(n => n.chainage));
    const allElev: number[] = [];
    data.nodes.forEach(n => {
        if (isFin(n.ct))  allElev.push(n.ct as number);
        if (isFin(n.cre)) allElev.push(n.cre as number);
        if (isFin(n.crs)) allElev.push(n.crs as number);
    });
    data.segments.forEach(s => {
        if (isFin(s.invertStart)) allElev.push(s.invertStart as number);
        if (isFin(s.invertEnd))   allElev.push(s.invertEnd as number);
    });

    if (allElev.length === 0) {
        doc.setFontSize(12);
        doc.text('Sin datos suficientes para generar el perfil.', pageW / 2, pageH / 2, { align: 'center' });
        doc.save('perfil_sin_datos.pdf');
        return;
    }

    const elevMin = Math.min(...allElev);
    const elevMax = Math.max(...allElev);
    const padE = Math.max((elevMax - elevMin) * 0.12, 0.5);
    const yMin = elevMin - padE;
    const yMax = elevMax + padE;
    const scaleH = Math.round(1000 / (drawW / maxCh));
    const scaleV = Math.round(1000 / (plotH / (yMax - yMin)));

    const xMM = (ch: number) => ML + (ch / maxCh) * drawW;
    const yMM = (el: number) => plotBot - ((el - yMin) / (yMax - yMin)) * plotH;

    // ── 1) FRAME ─────────────────────────────────────────────────────────
    doc.setDrawColor(...COL.black);
    doc.setLineWidth(0.4);
    doc.rect(ML - 1, MT - 1, drawW + 2, pageH - MT - MBOT + 1);

    // ── 2) CHAINAGE AXIS ─────────────────────────────────────────────────
    const chY = MT + GLYPH_H;
    doc.setDrawColor(...COL.black);
    doc.setLineWidth(0.25);
    doc.line(ML, chY + CHAINAGE_H, ML + drawW, chY + CHAINAGE_H);

    const chTicks = niceTicks(0, maxCh, Math.min(Math.floor(drawW / 16), 30));
    doc.setFontSize(4.5);
    doc.setTextColor(...COL.gridText);
    chTicks.forEach(ch => {
        const x = xMM(ch);
        if (x < ML - 1 || x > ML + drawW + 1) return;
        doc.setDrawColor(...COL.black);
        doc.setLineWidth(0.15);
        doc.line(x, chY + CHAINAGE_H - 2, x, chY + CHAINAGE_H);
        doc.text(fmtChainage(ch), x, chY + CHAINAGE_H - 3, { align: 'center' });
        doc.setDrawColor(...COL.grid);
        doc.setLineWidth(0.06);
        doc.line(x, plotTop, x, plotBot);
    });

    // ── 3) ELEVATION AXIS + GRID ─────────────────────────────────────────
    const eTicks = niceTicks(yMin, yMax, Math.min(Math.floor(plotH / 7), 20));
    doc.setFontSize(5);
    eTicks.forEach(el => {
        const y = yMM(el);
        if (y < plotTop - 1 || y > plotBot + 1) return;
        doc.setDrawColor(...COL.grid);
        doc.setLineWidth(0.06);
        doc.line(ML, y, ML + drawW, y);
        doc.setTextColor(...COL.gridText);
        doc.text(fmt(el, 1), ML + drawW + 1.5, y + 1, { align: 'left' });
        doc.text(fmt(el, 1), ML - 1.5, y + 1, { align: 'right' });
    });
    doc.setDrawColor(...COL.black);
    doc.setLineWidth(0.2);
    doc.rect(ML, plotTop, drawW, plotH);

    // ── 4) TERRAIN (rojo punteado) ───────────────────────────────────────
    doc.setDrawColor(...COL.terrain);
    doc.setLineWidth(0.45);
    const tPts: { x: number; y: number }[] = [];
    data.nodes.forEach(n => {
        if (isFin(n.ct)) tPts.push({ x: xMM(n.chainage), y: yMM(n.ct as number) });
    });
    for (let i = 0; i < tPts.length - 1; i++) {
        drawDashed(doc, tPts[i].x, tPts[i].y, tPts[i + 1].x, tPts[i + 1].y, [2, 1.2]);
    }
    if (tPts.length > 1) {
        const mid = tPts[Math.floor(tPts.length * 0.6)];
        doc.setFontSize(4.5);
        doc.setTextColor(...COL.terrain);
        doc.text('TERRENO NATURAL', mid.x + 2, mid.y - 2.5);
    }

    // ── 5) RADIER (verde continua) ───────────────────────────────────────
    doc.setDrawColor(...COL.radier);
    doc.setLineWidth(0.45);
    data.segments.forEach(seg => {
        if (!isFin(seg.invertStart) || !isFin(seg.invertEnd)) return;
        doc.line(xMM(seg.chainageStart), yMM(seg.invertStart as number),
                 xMM(seg.chainageEnd),   yMM(seg.invertEnd as number));
    });

    // ── 6) CHAMBERS ──────────────────────────────────────────────────────
    data.nodes.forEach((node, ni) => {
        const x = xMM(node.chainage);
        const inverts = [node.cre, node.crs].filter(isFin) as number[];
        const minInv = inverts.length > 0 ? Math.min(...inverts) : undefined;
        const ctY = isFin(node.ct) ? yMM(node.ct as number) : undefined;
        const invY = isFin(minInv) ? yMM(minInv as number) : undefined;

        if (ctY !== undefined && invY !== undefined) {
            doc.setDrawColor(...COL.chamber);
            doc.setLineWidth(0.3);
            doc.line(x, ctY, x, invY);
            const tw = 1.8;
            doc.line(x - tw, ctY, x + tw, ctY);
            doc.line(x - tw, invY, x + tw, invY);
            const hVal = (node.ct as number) - (minInv as number);
            if (hVal > 0) {
                doc.setFontSize(4);
                doc.setTextColor(...COL.text);
                doc.text(fmt(hVal, 2), x + 2.2, (ctY + invY) / 2 + 1);
            }
        }

        // Label + C.I.
        doc.setFontSize(4.5);
        doc.setTextColor(...COL.blue);
        doc.text(node.label || `C${ni + 1}`, x, MT + GLYPH_H - 6, { align: 'center' });
        doc.setFontSize(4);
        doc.setTextColor(...COL.text);
        doc.text(`C.I. N°${ni + 1}`, x, MT + 3, { align: 'center' });

        // Glyph
        doc.setDrawColor(...COL.grid);
        doc.setLineWidth(0.08);
        doc.line(x, chY + CHAINAGE_H, x, plotTop);
        const gY = MT + GLYPH_H - 11;
        doc.setDrawColor(...COL.black);
        doc.setLineWidth(0.18);
        doc.circle(x, gY, 2.8);
        if (ni < data.segments.length) {
            const seg = data.segments[ni];
            const desc = isFin(seg.invertStart) && isFin(seg.invertEnd) && (seg.invertStart as number) >= (seg.invertEnd as number);
            const dir = desc ? 1 : -1;
            doc.setLineWidth(0.12);
            doc.line(x - 1.2 * dir, gY, x + 1.2 * dir, gY);
            doc.line(x + 1.2 * dir, gY, x + 0.4 * dir, gY - 0.8);
            doc.line(x + 1.2 * dir, gY, x + 0.4 * dir, gY + 0.8);
        }
    });

    // ── 7) DATA TABLE ────────────────────────────────────────────────────
    const tblTop = plotBot + 1;
    const RH = 7;
    const ROWS = [
        'DISTANCIAS PARCIALES\nY ACUMULADAS',
        'COTA DE TERRENO',
        'COTA DE RADIER',
        'CARACTERÍSTICAS DEL TRAMO',
    ];
    const labelW = 36;

    ROWS.forEach((label, ri) => {
        const ry = tblTop + ri * RH;
        if (ri === 0) { doc.setFillColor(...COL.tblHeader); doc.rect(ML, ry, drawW, RH, 'F'); }
        doc.setDrawColor(...COL.tblBorder); doc.setLineWidth(0.15);
        doc.rect(ML, ry, drawW, RH);
        doc.rect(ML, ry, labelW, RH);
        doc.setFontSize(4); doc.setTextColor(...COL.text); doc.setFont('helvetica', 'bold');
        const lines = label.split('\n');
        if (lines.length > 1) { doc.text(lines[0], ML + 1.2, ry + 2.8); doc.text(lines[1], ML + 1.2, ry + 5.5); }
        else doc.text(label, ML + 1.2, ry + RH / 2 + 1);
    });

    doc.setFont('helvetica', 'normal');
    data.nodes.forEach((node, ni) => {
        const x = xMM(node.chainage);
        doc.setDrawColor(...COL.tblBorder); doc.setLineWidth(0.08);
        ROWS.forEach((_, ri) => doc.line(x, tblTop + ri * RH, x, tblTop + ri * RH + RH));

        doc.setFontSize(3.5); doc.setTextColor(...COL.text);
        if (ni > 0) {
            const seg = data.segments[ni - 1];
            const prevX = xMM(data.nodes[ni - 1].chainage);
            doc.text(fmt(seg.length, 2), (prevX + x) / 2, tblTop + 2.8, { align: 'center' });
        }
        doc.text(fmt(node.chainage, 2), x, tblTop + 5.8, { align: 'center' });
        doc.text(fmt(node.ct as number | undefined, 2), x, tblTop + RH + RH / 2 + 0.8, { align: 'center' });
        doc.setFontSize(3.2);
        doc.text(fmt(node.cre as number | undefined, 2), x, tblTop + 2 * RH + 2.5, { align: 'center' });
        doc.text(fmt(node.crs as number | undefined, 2), x, tblTop + 2 * RH + 5.2, { align: 'center' });
        doc.setFontSize(3.5);
    });

    data.segments.forEach((seg, si) => {
        const x1 = xMM(seg.chainageStart), x2 = xMM(seg.chainageEnd);
        const midX = (x1 + x2) / 2;
        const segW = Math.abs(x2 - x1);
        const dn = isFin(seg.diameter) ? Math.round(seg.diameter as number) : '--';
        const sVal = isFin(seg.slope) ? fmt(seg.slope as number, 2) : '--';
        const lVal = isFin(seg.length) ? fmt(seg.length, 2) : '--';
        const label = seg.label || `T${si + 1}`;
        const charText = `${label} PVC T-II Ø${dn}mm L=${lVal}m i=${sVal}%`;
        doc.setFontSize(segW > 22 ? 3.3 : 2.8);
        doc.text(charText, midX, tblTop + 3 * RH + RH / 2 + 0.8, { align: 'center' });
    });

    // ── 8) TITLE BLOCK ───────────────────────────────────────────────────
    const titleY = pageH - MBOT - TITLE_H;
    doc.setFillColor(...COL.blue); doc.rect(ML, titleY, drawW, 0.8, 'F');

    const titleText = routeLabel ? `PERFIL LONGITUDINAL ${routeLabel}`.toUpperCase() : 'PERFIL LONGITUDINAL';
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...COL.text);
    doc.text(titleText, ML + 2, titleY + 7);
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...COL.textSec);
    doc.text(`Escala Horizontal 1:${scaleH} - Escala Vertical 1:${scaleV}`, ML + drawW / 2, titleY + 14, { align: 'center' });
    if (projectName || engineerName) {
        doc.setFontSize(5.5); let iy = titleY + 5;
        if (projectName) { doc.text(`Proyecto: ${projectName}`, ML + drawW - 2, iy, { align: 'right' }); iy += 3.5; }
        if (engineerName) { doc.text(`Ingeniero: ${engineerName}`, ML + drawW - 2, iy, { align: 'right' }); iy += 3.5; }
        doc.text(`Fecha: ${new Date().toLocaleDateString('es-CL')}`, ML + drawW - 2, iy, { align: 'right' });
    }

    // ── 9) LEGEND ────────────────────────────────────────────────────────
    const legX = ML + drawW - 42, legY = plotTop + 2;
    doc.setFillColor(...COL.white); doc.setDrawColor(...COL.grid); doc.setLineWidth(0.15);
    doc.roundedRect(legX, legY, 40, 14, 1, 1, 'FD');
    doc.setFontSize(4.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...COL.text);
    doc.text('LEYENDA', legX + 1.5, legY + 3.5);
    doc.setFont('helvetica', 'normal');
    doc.setDrawColor(...COL.terrain); doc.setLineWidth(0.35);
    drawDashed(doc, legX + 1.5, legY + 7, legX + 10, legY + 7, [1.5, 1]);
    doc.setFontSize(4); doc.setTextColor(...COL.text);
    doc.text('Terreno Natural', legX + 12, legY + 7.8);
    doc.setDrawColor(...COL.radier); doc.setLineWidth(0.35);
    doc.line(legX + 1.5, legY + 11, legX + 10, legY + 11);
    doc.text('Cota Radier', legX + 12, legY + 11.8);

    // ── SAVE ─────────────────────────────────────────────────────────────
    const rp = routeLabel ? routeLabel.replace(/\s*->\s*/g, '-').replace(/\s+/g, '_').slice(0, 30) : 'ruta';
    doc.save(`Perfil_Longitudinal_${rp}_${new Date().toISOString().split('T')[0]}.pdf`);
}

// ════════════════════════════════════════════════════════════════════════════
// exportProfileToDXF
// ════════════════════════════════════════════════════════════════════════════

export function exportProfileToDXF(
    data: GravityRouteProfileData,
    options: ProfileExportOptions = {}
): void {
    const { projectName = '', routeLabel = '' } = options;
    const L: string[] = [];

    L.push('0', 'SECTION', '2', 'HEADER');
    L.push('9', '$ACADVER', '1', 'AC1015');
    L.push('9', '$INSUNITS', '70', '6');
    const allEl: number[] = [];
    data.nodes.forEach(n => { if (isFin(n.ct)) allEl.push(n.ct as number); });
    data.segments.forEach(s => {
        if (isFin(s.invertStart)) allEl.push(s.invertStart as number);
        if (isFin(s.invertEnd)) allEl.push(s.invertEnd as number);
    });
    const eMin = allEl.length ? Math.min(...allEl) : 0;
    const eMax = allEl.length ? Math.max(...allEl) : 10;
    const totalL = data.route.totalLength || 100;
    L.push('9', '$EXTMIN', '10', '0', '20', (eMin - 5).toFixed(4), '30', '0');
    L.push('9', '$EXTMAX', '10', totalL.toFixed(4), '20', (eMax + 5).toFixed(4), '30', '0');
    L.push('0', 'ENDSEC');

    L.push('0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', '5');
    const addLyr = (n: string, c: number, lt = 'CONTINUOUS') => { L.push('0', 'LAYER', '2', n, '70', '0', '62', String(c), '6', lt); };
    addLyr('TERRENO', 1, 'DASHED'); addLyr('RADIER', 3); addLyr('CAMARAS', 7); addLyr('TEXTOS', 7); addLyr('GRILLA', 8);
    L.push('0', 'ENDTAB', '0', 'ENDSEC');

    L.push('0', 'SECTION', '2', 'ENTITIES');
    const addLn = (ly: string, x1: number, y1: number, x2: number, y2: number) => {
        L.push('0', 'LINE', '8', ly, '10', x1.toFixed(4), '20', y1.toFixed(4), '30', '0', '11', x2.toFixed(4), '21', y2.toFixed(4), '31', '0');
    };
    const addTx = (ly: string, x: number, y: number, h: number, t: string, a = 0) => {
        L.push('0', 'TEXT', '8', ly, '10', x.toFixed(4), '20', y.toFixed(4), '30', '0', '40', h.toFixed(3), '1', t);
        if (a) L.push('72', String(a), '11', x.toFixed(4), '21', y.toFixed(4), '31', '0');
    };

    const tN = data.nodes.filter(n => isFin(n.ct));
    for (let i = 0; i < tN.length - 1; i++) addLn('TERRENO', tN[i].chainage, tN[i].ct as number, tN[i + 1].chainage, tN[i + 1].ct as number);

    data.segments.forEach(s => {
        if (isFin(s.invertStart) && isFin(s.invertEnd)) addLn('RADIER', s.chainageStart, s.invertStart as number, s.chainageEnd, s.invertEnd as number);
    });

    data.nodes.forEach((n, ni) => {
        const inv = [n.cre, n.crs].filter(isFin) as number[];
        const mI = inv.length ? Math.min(...inv) : undefined;
        if (isFin(n.ct) && isFin(mI)) addLn('CAMARAS', n.chainage, mI as number, n.chainage, n.ct as number);
        addTx('TEXTOS', n.chainage, ((n.ct as number) || 0) + 0.5, 0.4, n.label || `C${ni + 1}`, 1);
        if (isFin(n.ct)) addTx('TEXTOS', n.chainage + 0.3, n.ct as number, 0.25, `CT=${fmt(n.ct as number, 2)}`);
        if (isFin(n.cre)) addTx('TEXTOS', n.chainage + 0.3, (n.cre as number) - 0.15, 0.2, `Cre=${fmt(n.cre as number, 2)}`);
        if (isFin(n.crs)) addTx('TEXTOS', n.chainage + 0.3, (n.crs as number) - 0.4, 0.2, `CRS=${fmt(n.crs as number, 2)}`);
    });

    data.segments.forEach((s, si) => {
        const mx = (s.chainageStart + s.chainageEnd) / 2;
        const me = (isFin(s.invertStart) && isFin(s.invertEnd)) ? ((s.invertStart as number) + (s.invertEnd as number)) / 2 : eMin;
        const dn = isFin(s.diameter) ? Math.round(s.diameter as number) : 0;
        addTx('TEXTOS', mx, me - 0.6, 0.2, `${s.label || `T${si + 1}`} Ø${dn}mm L=${fmt(s.length, 2)}m i=${fmt(s.slope, 2)}%`, 1);
    });

    addTx('TEXTOS', 0, eMin - 3, 0.8, routeLabel ? `PERFIL LONGITUDINAL ${routeLabel}` : 'PERFIL LONGITUDINAL');
    addTx('TEXTOS', 0, eMin - 4.2, 0.4, `Esc. H 1:1000 - Esc. V 1:100 - ${new Date().toLocaleDateString('es-CL')}`);
    if (projectName) addTx('TEXTOS', 0, eMin - 5.2, 0.35, `Proyecto: ${projectName}`);

    L.push('0', 'ENDSEC', '0', 'EOF');

    const blob = new Blob([L.join('\n')], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const lnk = document.createElement('a');
    const rp = routeLabel ? routeLabel.replace(/\s*->\s*/g, '-').replace(/\s+/g, '_').slice(0, 30) : 'ruta';
    lnk.href = url;
    lnk.download = `Perfil_Longitudinal_${rp}_${new Date().toISOString().split('T')[0]}.dxf`;
    lnk.click();
    URL.revokeObjectURL(url);
}
