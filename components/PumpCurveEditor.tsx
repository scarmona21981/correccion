import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot, Legend } from 'recharts';
import { Plus, Trash2, AlertCircle } from 'lucide-react';
import type { PumpCurvePoint, PumpCurveMode } from '../hydraulics/types';
import { toM3sFromLps, toLpsFromM3s } from '../hydraulics/flowUnits';
import { DataTable } from './common/DataTable';

interface PumpCurveEditorProps {
    mode: PumpCurveMode;
    curveData: PumpCurvePoint[];
    onModeChange: (mode: PumpCurveMode) => void;
    onCurveChange: (data: PumpCurvePoint[]) => void;
    disabled?: boolean;
    readOnlyResults?: boolean;
    systemCurveData?: PumpCurvePoint[];
    operatingPoint?: { Q: number; H: number } | null;
    flowControl?: {
        clamped?: boolean;
        qOp_Lps?: number;
        mode?: 'STRICT' | 'CLAMP';
        reason?: string;
    } | null;
    npshSummary?: string;
}

interface DraftCurveRow {
    id: string;
    qLps: string;
    hM: string;
}

const MIN_FLOW_AXIS_MAX_LPS = 3;
const FLOW_AXIS_TARGET_SEGMENTS = 6;
const MIN_HEAD_AXIS_SPAN_M = 6;
const HEAD_AXIS_TARGET_SEGMENTS = 5;
const PUMP_HEAD_MONOTONIC_EPS_M = 1e-6;

const pickNiceAxisStep = (roughStep: number): number => {
    if (!Number.isFinite(roughStep) || roughStep <= 0) return 1;

    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const normalized = roughStep / magnitude;

    if (normalized <= 1) return 1 * magnitude;
    if (normalized <= 2) return 2 * magnitude;
    if (normalized <= 3) return 3 * magnitude;
    if (normalized <= 5) return 5 * magnitude;
    return 10 * magnitude;
};

const buildFlowAxisScale = (maxFlowLps: number): { max: number; ticks: number[] } => {
    const safeMax = Number.isFinite(maxFlowLps) && maxFlowLps > 0
        ? maxFlowLps
        : MIN_FLOW_AXIS_MAX_LPS;

    const paddedMax = Math.max(MIN_FLOW_AXIS_MAX_LPS, safeMax * 1.05);
    const roughStep = paddedMax / FLOW_AXIS_TARGET_SEGMENTS;
    const step = pickNiceAxisStep(roughStep);
    const axisMax = Math.max(MIN_FLOW_AXIS_MAX_LPS, Math.ceil(paddedMax / step) * step);

    const ticks: number[] = [];
    for (let value = 0; value <= axisMax + step * 0.25; value += step) {
        ticks.push(Number(value.toFixed(4)));
    }

    if (ticks.length === 0) {
        ticks.push(0, axisMax);
    }

    const lastTick = ticks[ticks.length - 1];
    if (Math.abs(lastTick - axisMax) > 1e-6) {
        ticks.push(Number(axisMax.toFixed(4)));
    }

    return { max: axisMax, ticks };
};

const buildHeadAxisScale = (headValues: number[]): { min: number; max: number; ticks: number[] } => {
    const finiteValues = headValues.filter(value => Number.isFinite(value));

    if (finiteValues.length === 0) {
        return {
            min: 0,
            max: MIN_HEAD_AXIS_SPAN_M,
            ticks: [0, 2, 4, 6]
        };
    }

    const rawMin = Math.min(...finiteValues);
    const rawMax = Math.max(...finiteValues);
    const rawSpan = Math.max(rawMax - rawMin, 0);
    const padding = Math.max(rawSpan * 0.12, 0.5);

    let minCandidate = rawMin - padding;
    let maxCandidate = rawMax + padding;

    if ((maxCandidate - minCandidate) < MIN_HEAD_AXIS_SPAN_M) {
        const midpoint = (rawMin + rawMax) / 2;
        minCandidate = midpoint - MIN_HEAD_AXIS_SPAN_M / 2;
        maxCandidate = midpoint + MIN_HEAD_AXIS_SPAN_M / 2;
    }

    const roughStep = Math.max((maxCandidate - minCandidate) / HEAD_AXIS_TARGET_SEGMENTS, 0.5);
    const step = pickNiceAxisStep(roughStep);

    let axisMin = Math.floor(minCandidate / step) * step;
    let axisMax = Math.ceil(maxCandidate / step) * step;

    if (rawMin >= 0 && axisMin < 0) {
        axisMin = 0;
    }

    if (axisMax <= axisMin) {
        axisMax = axisMin + step;
    }

    const ticks: number[] = [];
    for (let value = axisMin; value <= axisMax + step * 0.25; value += step) {
        ticks.push(Number(value.toFixed(4)));
    }

    if (ticks.length === 0) {
        ticks.push(Number(axisMin.toFixed(4)), Number(axisMax.toFixed(4)));
    }

    const lastTick = ticks[ticks.length - 1];
    if (Math.abs(lastTick - axisMax) > 1e-6) {
        ticks.push(Number(axisMax.toFixed(4)));
    }

    return {
        min: Number(axisMin.toFixed(4)),
        max: Number(axisMax.toFixed(4)),
        ticks
    };
};

const formatFlowTick = (value: number): string => {
    if (!Number.isFinite(value)) return '';
    const rounded = Number(value.toFixed(2));
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(/\.0$/, '');
};

const formatHeadTick = (value: number): string => {
    if (!Number.isFinite(value)) return '';
    const rounded = Number(value.toFixed(2));
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(/\.0$/, '');
};

const parseDraftNumber = (value: string): number | undefined => {
    const normalized = String(value ?? '').trim().replace(',', '.');
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
};

const cleanCurvePoints = (points: PumpCurvePoint[]): PumpCurvePoint[] => {
    const finitePoints = (points || []).filter(point => Number.isFinite(point?.Q) && Number.isFinite(point?.H));
    if (finitePoints.length <= 12) return finitePoints;

    const sorted = [...finitePoints].sort((left, right) => left.Q - right.Q);
    const steps: number[] = [];

    for (let i = 1; i < sorted.length; i += 1) {
        const delta = sorted[i].Q - sorted[i - 1].Q;
        if (Number.isFinite(delta) && delta > 0) {
            steps.push(delta);
        }
    }

    if (steps.length < 10) return finitePoints;

    const meanStep = steps.reduce((sum, value) => sum + value, 0) / steps.length;
    if (!(meanStep > 0)) return finitePoints;

    let varianceAccumulator = 0;
    for (const step of steps) {
        const deviation = step - meanStep;
        varianceAccumulator += deviation * deviation;
    }

    const stepCv = Math.sqrt(varianceAccumulator / steps.length) / meanStep;
    if (stepCv < 0.03) {
        const middle = sorted[Math.floor(sorted.length / 2)];
        return [sorted[0], middle, sorted[sorted.length - 1]];
    }

    return finitePoints;
};

const draftRowsFromPoints = (points: PumpCurvePoint[]): DraftCurveRow[] => (
    cleanCurvePoints(points).map((point, idx) => ({
        id: `row-${idx}-${Date.now()}-${Math.random()}`,
        qLps: Number.isFinite(point?.Q) ? String(toLpsFromM3s(point.Q)) : '',
        hM: Number.isFinite(point?.H) ? String(point.H) : ''
    }))
);

const ensureThreeRows = (rows: DraftCurveRow[]): DraftCurveRow[] => {
    const normalized = [...rows];
    while (normalized.length < 3) {
        const index = normalized.length;
        normalized.push({
            id: `row-init-${index}-${Date.now()}`,
            qLps: String(index === 0 ? 0 : index * 2),
            hM: String(index === 0 ? 30 : index === 1 ? 25 : 20)
        });
    }
    return normalized.slice(0, 3);
};

const rowsAreEqual = (left: DraftCurveRow[], right: DraftCurveRow[]): boolean => {
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) {
        if (left[i].qLps !== right[i].qLps || left[i].hM !== right[i].hM) return false;
    }
    return true;
};

const normalizeDraftRowsToPoints = (rows: DraftCurveRow[]): PumpCurvePoint[] => {
    const deduped = new Map<string, { qLps: number; hM: number; rowIndex: number }>();

    rows.forEach((row, rowIndex) => {
        const qLpsValue = parseDraftNumber(row.qLps);
        const hMValue = parseDraftNumber(row.hM);
        if (!Number.isFinite(qLpsValue) || !Number.isFinite(hMValue)) return;
        const qLps = qLpsValue as number;
        const hM = hMValue as number;
        deduped.set(String(qLps), { qLps, hM, rowIndex });
    });

    return Array.from(deduped.values())
        .sort((a, b) => {
            if (Math.abs(a.qLps - b.qLps) > 1e-9) return a.qLps - b.qLps;
            return a.rowIndex - b.rowIndex;
        })
        .map(point => ({
            Q: toM3sFromLps(point.qLps),
            H: point.hM
        }));
};

export const PumpCurveEditor: React.FC<PumpCurveEditorProps> = ({
    mode,
    curveData,
    onModeChange,
    onCurveChange,
    disabled = false,
    readOnlyResults = false,
    systemCurveData = [],
    operatingPoint = null,
    flowControl = null,
    npshSummary = ''
}) => {
    const isDisabled = Boolean(disabled || readOnlyResults);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [pumpName, setPumpName] = useState('');
    const [savedPumps, setSavedPumps] = useState<{ name: string; points: PumpCurvePoint[] }[]>([]);
    const [selectedPump, setSelectedPump] = useState<string>('');
    const [tableRowsDraft, setTableRowsDraft] = useState<DraftCurveRow[]>(() => draftRowsFromPoints(curveData));
    const [threePointDraft, setThreePointDraft] = useState<DraftCurveRow[]>(() => ensureThreeRows(draftRowsFromPoints(curveData)));

    const STORAGE_KEY = 'SMCALC_SAVED_PUMPS';

    // Load saved pumps
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                setSavedPumps(JSON.parse(stored));
            } catch {
                setSavedPumps([]);
            }
        }
    }, []);

    const persistPumps = (pumps: { name: string; points: PumpCurvePoint[] }[]) => {
        setSavedPumps(pumps);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(pumps));
    };

    useEffect(() => {
        const incoming = draftRowsFromPoints(curveData);
        if (mode === 'TABLE') {
            setTableRowsDraft(prev => (rowsAreEqual(prev, incoming) ? prev : incoming));
            return;
        }

        const normalizedIncoming = ensureThreeRows(incoming);
        setThreePointDraft(prev => (rowsAreEqual(prev, normalizedIncoming) ? prev : normalizedIncoming));
    }, [curveData, mode]);

    const activeDraftRows = mode === 'TABLE' ? tableRowsDraft : threePointDraft;

    const previewCurvePoints = React.useMemo(() => {
        const normalized = normalizeDraftRowsToPoints(activeDraftRows);
        return mode === '3_POINTS' ? normalized.slice(0, 3) : normalized;
    }, [activeDraftRows, mode]);

    const emitCurveChange = (rows: DraftCurveRow[], targetMode: PumpCurveMode = mode) => {
        const normalized = normalizeDraftRowsToPoints(rows);
        const nextPoints = targetMode === '3_POINTS'
            ? normalized.slice(0, 3)
            : cleanCurvePoints(normalized);
        onCurveChange(nextPoints);
    };

    const savePump = () => {
        if (isDisabled) return;
        if (!pumpName.trim()) {
            alert('Ingrese un nombre para la bomba');
            return;
        }
        const newPump = { name: pumpName.trim(), points: previewCurvePoints };
        const updated = [...savedPumps.filter(p => p.name !== newPump.name), newPump];
        persistPumps(updated);
        setPumpName('');
        alert('Bomba guardada correctamente');
    };

    const loadPump = () => {
        if (isDisabled) return;
        const pump = savedPumps.find(p => p.name === selectedPump);
        if (pump) {
            const loadedRows = draftRowsFromPoints(pump.points || []);
            if (mode === 'TABLE') {
                setTableRowsDraft(loadedRows);
                emitCurveChange(loadedRows, 'TABLE');
                return;
            }

            const loadedThreeRows = ensureThreeRows(loadedRows);
            setThreePointDraft(loadedThreeRows);
            emitCurveChange(loadedThreeRows, '3_POINTS');
        }
    };

    const deletePump = () => {
        if (isDisabled) return;
        const updated = savedPumps.filter(p => p.name !== selectedPump);
        persistPumps(updated);
        setSelectedPump('');
    };

    // Validate current draft data used for preview
    useEffect(() => {
        const errors: string[] = [];

        if (previewCurvePoints.length < 3) {
            errors.push('Se requieren mínimo 3 puntos');
        }

        // Check Q values are increasing
        for (let i = 1; i < previewCurvePoints.length; i++) {
            if (previewCurvePoints[i].Q <= previewCurvePoints[i - 1].Q) {
                errors.push(`Q debe ser creciente (punto ${i + 1})`);
                break;
            }
        }

        // Check H values are decreasing
        for (let i = 1; i < previewCurvePoints.length; i++) {
            if (previewCurvePoints[i].H > (previewCurvePoints[i - 1].H + PUMP_HEAD_MONOTONIC_EPS_M)) {
                errors.push(`H no debe aumentar (punto ${i + 1})`);
                break;
            }
        }

        // Check for non-negative values
        if (previewCurvePoints.some(p => p.Q < 0 || p.H < 0)) {
            errors.push('Q y H deben ser valores positivos');
        }

        setValidationErrors(errors);
    }, [previewCurvePoints]);

    const handlePointChange = (index: number, field: 'Q' | 'H', value: string) => {
        if (isDisabled) return;

        if (mode === 'TABLE') {
            const updatedRows = tableRowsDraft.map((row, rowIndex) => {
                if (rowIndex !== index) return row;
                return field === 'Q' ? { ...row, qLps: value } : { ...row, hM: value };
            });
            setTableRowsDraft(updatedRows);
            emitCurveChange(updatedRows, 'TABLE');
            return;
        }

        const updatedRows = threePointDraft.map((row, rowIndex) => {
            if (rowIndex !== index) return row;
            return field === 'Q' ? { ...row, qLps: value } : { ...row, hM: value };
        });
        const normalizedRows = ensureThreeRows(updatedRows);
        setThreePointDraft(normalizedRows);
        emitCurveChange(normalizedRows, '3_POINTS');
    };

    const addPoint = () => {
        if (isDisabled) return;
        if (mode !== 'TABLE') return;

        const normalizedPoints = normalizeDraftRowsToPoints(tableRowsDraft);
        const lastPoint = normalizedPoints[normalizedPoints.length - 1];
        const newPoint: DraftCurveRow = {
            id: `row-new-${Date.now()}`,
            qLps: String(lastPoint ? toLpsFromM3s(lastPoint.Q) + 0.5 : 1),
            hM: String(lastPoint ? lastPoint.H - 2 : 20)
        };

        const updatedRows = [...tableRowsDraft, newPoint];
        setTableRowsDraft(updatedRows);
        emitCurveChange(updatedRows, 'TABLE');
    };

    const removePoint = (index: number) => {
        if (isDisabled) return;
        if (mode !== 'TABLE') return;
        if (tableRowsDraft.length <= 3) {
            alert('No se pueden eliminar más puntos (mínimo 3)');
            return;
        }

        const updatedRows = tableRowsDraft.filter((_, i) => i !== index);
        setTableRowsDraft(updatedRows);
        emitCurveChange(updatedRows, 'TABLE');
    };

    const pumpLineData = React.useMemo(
        () => previewCurvePoints
            .filter(point => Number.isFinite(point?.Q) && Number.isFinite(point?.H))
            .sort((a, b) => a.Q - b.Q)
            .map(point => ({
                Q_display: toLpsFromM3s(point.Q),
                pumpH: point.H
            })),
        [previewCurvePoints]
    );

    const rawSystemLineData = React.useMemo(
        () => systemCurveData
            .filter(point => Number.isFinite(point?.Q) && Number.isFinite(point?.H))
            .sort((a, b) => a.Q - b.Q)
            .map(point => ({
                Q_display: toLpsFromM3s(point.Q),
                systemH: point.H
            })),
        [systemCurveData]
    );

    const maxPumpFlowLps = React.useMemo(
        () => pumpLineData.reduce((maxFlow, point) => Math.max(maxFlow, point.Q_display), 0),
        [pumpLineData]
    );

    const maxSystemFlowLps = React.useMemo(
        () => rawSystemLineData.reduce((maxFlow, point) => Math.max(maxFlow, point.Q_display), 0),
        [rawSystemLineData]
    );

    const operatingOrClampFlowLps = React.useMemo(() => {
        const qStarLps = operatingPoint ? toLpsFromM3s(operatingPoint.Q) : 0;
        const qClampLps = Number.isFinite(flowControl?.qOp_Lps) ? Number(flowControl?.qOp_Lps) : 0;
        return Math.max(qStarLps, qClampLps, 0);
    }, [operatingPoint, flowControl?.qOp_Lps]);

    const flowAxisScale = React.useMemo(() => {
        const preferredMax = Math.max(maxPumpFlowLps, operatingOrClampFlowLps, 0);
        const fallbackMax = maxSystemFlowLps;
        return buildFlowAxisScale(preferredMax > 0 ? preferredMax : fallbackMax);
    }, [maxPumpFlowLps, operatingOrClampFlowLps, maxSystemFlowLps]);

    const systemLineData = React.useMemo(
        () => rawSystemLineData.filter(point => point.Q_display <= flowAxisScale.max + 1e-6),
        [rawSystemLineData, flowAxisScale.max]
    );

    const headAxisScale = React.useMemo(() => {
        const values: number[] = [];

        pumpLineData.forEach(point => {
            if (Number.isFinite(point.pumpH)) values.push(point.pumpH);
        });

        systemLineData.forEach(point => {
            if (Number.isFinite(point.systemH)) values.push(point.systemH);
        });

        if (operatingPoint && Number.isFinite(operatingPoint.H)) {
            values.push(operatingPoint.H);
        }

        return buildHeadAxisScale(values);
    }, [pumpLineData, systemLineData, operatingPoint]);

    const chartData = React.useMemo(() => {
        const rows = new Map<number, { Q_display: number }>();
        [...pumpLineData, ...systemLineData].forEach(point => {
            const key = Math.round(point.Q_display * 1000) / 1000;
            rows.set(key, { Q_display: point.Q_display });
        });
        return Array.from(rows.values()).sort((a, b) => a.Q_display - b.Q_display);
    }, [pumpLineData, systemLineData]);

    return (
        <div style={{
            background: 'var(--surface)',
            borderRadius: 'var(--radius-lg)',
            padding: '16px',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)'
        }}>
            <div style={{ marginBottom: '12px' }}>
                <label style={{
                    color: 'var(--text-secondary)',
                    fontSize: '12px',
                    fontWeight: 600,
                    display: 'block',
                    marginBottom: '8px'
                }}>
                    Modo de Curva
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => {
                            if (isDisabled) return;
                            onModeChange('3_POINTS');
                            emitCurveChange(ensureThreeRows(threePointDraft), '3_POINTS');
                        }}
                        disabled={isDisabled}
                        style={{
                            flex: 1,
                            padding: '8px',
                            background: mode === '3_POINTS' ? 'var(--accent-soft)' : 'var(--surface-elevated)',
                            color: mode === '3_POINTS' ? 'var(--accent)' : 'var(--text-primary)',
                            border: `1px solid ${mode === '3_POINTS' ? 'var(--accent)' : 'var(--border)'}`,
                            borderRadius: '6px',
                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                            fontSize: '13px',
                            opacity: isDisabled ? 0.6 : 1
                        }}
                    >
                        3 Puntos
                    </button>
                    <button
                        onClick={() => {
                            if (isDisabled) return;
                            onModeChange('TABLE');
                            emitCurveChange(tableRowsDraft, 'TABLE');
                        }}
                        disabled={isDisabled}
                        style={{
                            flex: 1,
                            padding: '8px',
                            background: mode === 'TABLE' ? 'var(--accent-soft)' : 'var(--surface-elevated)',
                            color: mode === 'TABLE' ? 'var(--accent)' : 'var(--text-primary)',
                            border: `1px solid ${mode === 'TABLE' ? 'var(--accent)' : 'var(--border)'}`,
                            borderRadius: '6px',
                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                            fontSize: '13px',
                            opacity: isDisabled ? 0.6 : 1
                        }}
                    >
                        Tabla
                    </button>
                </div>
            </div>

            {(flowControl?.clamped || npshSummary) && (
                <div style={{
                    display: 'flex',
                    gap: '8px',
                    flexWrap: 'wrap',
                    marginBottom: '10px'
                }}>
                    {flowControl?.clamped && (
                        <span
                            title={flowControl.reason || ''}
                            style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                color: '#92400e',
                                background: '#fef3c7',
                                border: '1px solid #fcd34d',
                                borderRadius: '999px',
                                padding: '4px 8px'
                            }}
                        >
                            CLAMP {Number.isFinite(flowControl.qOp_Lps) ? `${(flowControl.qOp_Lps as number).toFixed(3)} L/s` : ''}
                        </span>
                    )}
                    {npshSummary && (
                        <span
                            style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: 'var(--text-secondary)',
                                background: 'var(--surface-elevated)',
                                border: '1px solid var(--border)',
                                borderRadius: '999px',
                                padding: '4px 8px'
                            }}
                        >
                            {npshSummary}
                        </span>
                    )}
                </div>
            )}

            {/* Validation Errors */}
            {validationErrors.length > 0 && (
                <div style={{
                    background: 'var(--badge-error-bg)',
                    border: '1px solid var(--danger)',
                    borderRadius: '6px',
                    padding: '8px',
                    marginBottom: '12px'
                }}>
                    {validationErrors.map((error, i) => (
                        <div key={i} style={{
                            color: 'var(--badge-error-text)',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}>
                            <AlertCircle size={14} />
                            {error}
                        </div>
                    ))}
                </div>
            )}

            {/* Curve Data Table Area */}
            <DataTable
                columns={[
                    {
                        key: 'puntos',
                        header: mode === '3_POINTS' ? 'Punto' : '#',
                        width: 100,
                        align: 'left',
                        format: (_: any, __: any, index: number | undefined) => (
                            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                                {mode === '3_POINTS'
                                    ? (index === 0 ? 'Shutoff' : index === 1 ? 'Nominal' : 'Máximo')
                                    : (index !== undefined ? index + 1 : '')
                                }
                            </span>
                        )
                    },
                    {
                        key: 'qLps',
                        header: 'Q (L/s)',
                        width: 'auto',
                        align: 'left',
                        format: (v: string, _: any, index: number | undefined) => (
                            <input
                                type="number"
                                step="0.01"
                                value={v}
                                onChange={(e) => index !== undefined && handlePointChange(index, 'Q', e.target.value)}
                                disabled={isDisabled}
                                style={{
                                    width: '100%',
                                    background: isDisabled ? 'transparent' : 'var(--surface)',
                                    border: isDisabled ? '1px solid transparent' : '1px solid var(--border)',
                                    borderRadius: '4px',
                                    padding: '4px 8px',
                                    color: 'var(--text-primary)',
                                    fontSize: '11px',
                                    fontWeight: 600
                                }}
                            />
                        )
                    },
                    {
                        key: 'hM',
                        header: 'H (m)',
                        width: 'auto',
                        align: 'left',
                        format: (v: string, _: any, index: number | undefined) => (
                            <input
                                type="number"
                                step="0.1"
                                value={v}
                                onChange={(e) => index !== undefined && handlePointChange(index, 'H', e.target.value)}
                                disabled={isDisabled}
                                style={{
                                    width: '100%',
                                    background: isDisabled ? 'transparent' : 'var(--surface)',
                                    border: isDisabled ? '1px solid transparent' : '1px solid var(--border)',
                                    borderRadius: '4px',
                                    padding: '4px 8px',
                                    color: 'var(--text-primary)',
                                    fontSize: '11px',
                                    fontWeight: 600
                                }}
                            />
                        )
                    },
                    ...(mode === 'TABLE' ? [{
                        key: 'actions',
                        header: '',
                        width: 40,
                        align: 'center',
                        format: (_: any, __: any, index: number | undefined) => (
                            <button
                                onClick={() => index !== undefined && removePoint(index)}
                                disabled={isDisabled || tableRowsDraft.length <= 3}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: tableRowsDraft.length <= 3 ? 'var(--text-muted)' : 'var(--danger)',
                                    cursor: isDisabled || tableRowsDraft.length <= 3 ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    opacity: isDisabled ? 0.6 : 1
                                }}
                            >
                                <Trash2 size={14} />
                            </button>
                        )
                    }] as any[] : [])
                ]}
                rows={activeDraftRows}
                rowKey={(r: DraftCurveRow) => r.id}
                density="compact"
                maxHeight="250px"
                footer={mode === 'TABLE' && (
                    <button
                        onClick={addPoint}
                        disabled={isDisabled}
                        style={{
                            width: '100%',
                            padding: '8px',
                            background: 'var(--accent-soft)',
                            border: 'none',
                            color: 'var(--accent)',
                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            fontWeight: 700,
                            opacity: isDisabled ? 0.6 : 1
                        }}
                    >
                        <Plus size={14} />
                        Agregar Punto
                    </button>
                )}
            />

            {/* Guardar / Cargar Bombas */}
            {mode === 'TABLE' && !readOnlyResults && (
                <div style={{
                    background: 'var(--surface-elevated)',
                    borderRadius: '6px',
                    padding: '12px',
                    margin: '12px 0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                            type="text"
                            placeholder="Nombre de la bomba"
                            value={pumpName}
                            onChange={(e) => setPumpName(e.target.value)}
                            disabled={isDisabled}
                            style={{
                                flex: 1,
                                background: isDisabled ? 'var(--surface-elevated)' : 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: '4px',
                                padding: '6px 8px',
                                color: 'var(--text-primary)',
                                fontSize: '12px',
                                cursor: isDisabled ? 'not-allowed' : 'text'
                            }}
                        />
                        <button
                            onClick={savePump}
                            disabled={isDisabled}
                            style={{
                                padding: '6px 10px',
                                background: isDisabled ? 'color-mix(in srgb, var(--success) 40%, transparent)' : 'var(--success)',
                                border: 'none',
                                borderRadius: '4px',
                                color: '#fff',
                                cursor: isDisabled ? 'not-allowed' : 'pointer',
                                fontSize: '12px',
                                opacity: isDisabled ? 0.6 : 1
                            }}
                        >
                            Guardar
                        </button>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <select
                            value={selectedPump}
                            onChange={(e) => setSelectedPump(e.target.value)}
                            disabled={isDisabled}
                            style={{
                                flex: 1,
                                background: isDisabled ? 'var(--surface-elevated)' : 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: '4px',
                                padding: '6px 8px',
                                color: 'var(--text-primary)',
                                fontSize: '12px',
                                cursor: isDisabled ? 'not-allowed' : 'pointer'
                            }}
                        >
                            <option value="">Bombas guardadas</option>
                            {savedPumps.map((pump, i) => (
                                <option key={i} value={pump.name}>{pump.name}</option>
                            ))}
                        </select>
                        <button
                            onClick={loadPump}
                            disabled={isDisabled || !selectedPump}
                            style={{
                                padding: '6px 10px',
                                background: isDisabled ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'var(--accent)',
                                border: 'none',
                                borderRadius: '4px',
                                color: '#fff',
                                cursor: isDisabled || !selectedPump ? 'not-allowed' : 'pointer',
                                fontSize: '12px',
                                opacity: isDisabled ? 0.6 : 1
                            }}
                        >
                            Cargar
                        </button>
                        <button
                            onClick={deletePump}
                            disabled={isDisabled || !selectedPump}
                            style={{
                                padding: '6px 10px',
                                background: isDisabled ? 'color-mix(in srgb, var(--danger) 40%, transparent)' : 'var(--danger)',
                                border: 'none',
                                borderRadius: '4px',
                                color: '#fff',
                                cursor: isDisabled || !selectedPump ? 'not-allowed' : 'pointer',
                                fontSize: '12px',
                                opacity: isDisabled ? 0.6 : 1
                            }}
                        >
                            Eliminar
                        </button>
                    </div>
                </div>
            )}

            {/* Visual Preview */}
            <div style={{
                background: 'var(--surface-elevated)',
                borderRadius: '6px',
                padding: '12px'
            }}>
                <div style={{
                    color: 'var(--text-secondary)',
                    fontSize: '11px',
                    fontWeight: 600,
                    marginBottom: '8px'
                }}>
                    Preview de Curva
                </div>
                <ResponsiveContainer width="100%" height={150}>
                    <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis
                            type="number"
                            dataKey="Q_display"
                            domain={[0, flowAxisScale.max]}
                            ticks={flowAxisScale.ticks}
                            allowDataOverflow
                            stroke="var(--text-secondary)"
                            tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                            tickFormatter={(value: number) => formatFlowTick(value)}
                            label={{ value: 'Q (L/s)', position: 'insideBottom', offset: -5, fill: 'var(--text-secondary)', fontSize: 10 }}
                        />
                        <YAxis
                            domain={[headAxisScale.min, headAxisScale.max]}
                            ticks={headAxisScale.ticks}
                            stroke="var(--text-secondary)"
                            tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                            tickFormatter={(value: number) => formatHeadTick(value)}
                            label={{ value: 'H (m)', angle: -90, position: 'insideLeft', fill: 'var(--text-secondary)', fontSize: 10 }}
                        />
                        <Tooltip
                            contentStyle={{
                                background: 'var(--surface)',
                                border: '1px solid var(--border)',
                                color: 'var(--text-primary)',
                                borderRadius: '4px',
                                fontSize: '11px'
                            }}
                            formatter={(value: number | undefined, name: any) => [
                                value !== undefined ? `${value.toFixed(2)}` : value,
                                name === 'pumpH' ? 'Curva bomba (H)' : name === 'systemH' ? 'Curva sistema (H)' : name
                            ]}
                        />
                        <Legend wrapperStyle={{ fontSize: 10, color: 'var(--text-secondary)' }} />
                        <Line
                            data={pumpLineData}
                            type="linear"
                            dataKey="pumpH"
                            name="Curva bomba"
                            stroke={validationErrors.length > 0 ? 'var(--danger)' : 'var(--accent)'}
                            strokeWidth={2}
                            dot={{ fill: validationErrors.length > 0 ? 'var(--danger)' : 'var(--accent)', r: 2.8 }}
                            connectNulls
                        />
                        {systemLineData.length > 0 && (
                            <Line
                                data={systemLineData}
                                type="linear"
                                dataKey="systemH"
                                name="Curva sistema"
                                stroke="var(--info)"
                                strokeWidth={2}
                                dot={false}
                                connectNulls
                            />
                        )}
                        {operatingPoint && (
                            <ReferenceDot
                                x={toLpsFromM3s(operatingPoint.Q)}
                                y={operatingPoint.H}
                                r={4}
                                fill="var(--warning)"
                                stroke="var(--surface)"
                                label={{ value: 'Q*', position: 'top', fill: 'var(--text-secondary)', fontSize: 10 }}
                            />
                        )}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
