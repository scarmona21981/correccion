import React from 'react';
import { PressureResults } from '../hydraulics/types';
import { DataTable } from './common/DataTable';
import { StatusBadge } from './common/StatusBadge';

interface PressureResultsViewProps {
    results: PressureResults;
    mode?: 'results' | 'checks';
    onClose?: () => void;
}

interface PressureRow {
    id: string;
    qLs: number;
    hReq: number;
    hStatic: number;
    hFriction: number;
    hSingular: number;
    hLosses: number;
    velocity: number;
    pMax: number;
    safetyMargin: number;
    velocityOk: boolean;
    pressureOk: boolean;
    status: 'APTO' | 'NO APTO';
    statusReason: string;
    clampApplied: boolean;
    flowNote: string;
    npshNote: string;
    notes: string;
}

const fmt = (value: number | undefined, decimals = 2): string => {
    if (value === undefined || !Number.isFinite(value)) return '—';
    return value.toFixed(decimals);
};

export const PressureResultsView: React.FC<PressureResultsViewProps> = ({ results, mode = 'results' }) => {
    const flowControl = results.flowControl;
    const npsh = results.npsh;

    const rows: PressureRow[] = Object.entries(results.verifications || {}).map(([pipeId, verification]) => ({
        id: pipeId,
        qLs: verification.Q_operating * 1000,
        hReq: verification.H_required,
        hStatic: Number.isFinite(verification.H_static) ? verification.H_static : 0,
        hFriction: Number.isFinite(verification.h_friction) ? verification.h_friction : 0,
        hSingular: Number.isFinite(verification.h_singular) ? verification.h_singular : 0,
        hLosses: (Number.isFinite(verification.h_friction) ? verification.h_friction : 0)
            + (Number.isFinite(verification.h_singular) ? verification.h_singular : 0),
        velocity: verification.velocity,
        pMax: verification.maxPressure,
        safetyMargin: verification.safetyMargin,
        velocityOk: verification.velocityCompliant,
        pressureOk: verification.pressureCompliant,
        status: verification.status === 'CONFORME' ? 'APTO' : 'NO APTO',
        statusReason: verification.statusReason || verification.violations[0] || '—',
        clampApplied: Boolean(flowControl?.clamped),
        flowNote: flowControl
            ? `${flowControl.clamped ? 'CLAMP' : 'Q*'}: ${flowControl.qOp_Lps.toFixed(3)} L/s`
            : '—',
        npshNote: npsh
            ? `NPSHa ${fmt(npsh.npshAvailable_m, 2)} m${npsh.npshRequired_m !== undefined ? ` / NPSHr ${fmt(npsh.npshRequired_m, 2)} m` : ''}`
            : '—',
        notes: verification.violations.length > 0 ? verification.violations.join(' | ') : (verification.recommendations[0] || '—')
    }));

    if (rows.length === 0) {
        return <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>No hay resultados de impulsión para mostrar.</div>;
    }

    const resultColumns = [
        { key: 'id', header: 'ID_TRAMO', width: 90, sticky: 'left' },
        {
            key: 'qLs',
            header: 'Q op. (L/s)',
            width: 140,
            align: 'right',
            tooltip: (row: PressureRow) => row.flowNote,
            format: (v: number, row: PressureRow) => row.clampApplied ? `${fmt(v, 3)} (CLAMP)` : fmt(v, 3)
        },
        { key: 'hReq', header: 'H req (m)', width: 110, align: 'right', format: (v: number) => fmt(v, 2) },
        { key: 'hStatic', header: 'H est (m)', width: 100, align: 'right', format: (v: number) => fmt(v, 2) },
        { key: 'hFriction', header: 'h fric (m)', width: 100, align: 'right', format: (v: number) => fmt(v, 2) },
        { key: 'hLosses', header: 'h perd (m)', width: 100, align: 'right', format: (v: number) => fmt(v, 2) },
        { key: 'npshNote', header: 'NPSH', width: 170 },
        { key: 'velocity', header: 'V (m/s)', width: 80, align: 'right', format: (v: number) => fmt(v, 2) },
        { key: 'pMax', header: 'P max (bar)', width: 110, align: 'right', format: (v: number) => fmt(v, 2) },
        { key: 'status', header: 'Estado', width: 120, align: 'center', format: (v: any) => <StatusBadge status={v} /> },
        { key: 'statusReason', header: 'Motivo', width: 180 }
    ];

    const checksColumns = [
        { key: 'id', header: 'ID_TRAMO', width: 90, sticky: 'left' },
        { key: 'safetyMargin', header: 'Margen (%)', width: 100, align: 'right', format: (v: number) => fmt(v, 1) },
        { key: 'velocityOk', header: 'Velocidad', width: 120, align: 'center', format: (v: boolean) => <StatusBadge status={v ? 'APTO' : 'NO APTO'} /> },
        { key: 'pressureOk', header: 'Presión', width: 120, align: 'center', format: (v: boolean) => <StatusBadge status={v ? 'APTO' : 'NO APTO'} /> },
        { key: 'status', header: 'Global', width: 120, align: 'center', format: (v: any) => <StatusBadge status={v} /> },
        { key: 'notes', header: 'Observaciones', width: 180 }
    ];

    return (
        <div style={{ padding: '4px' }}>
            <DataTable
                title={mode === 'results' ? "Resultados de Impulsión" : "Verificaciones de Impulsión"}
                columns={mode === 'results' ? resultColumns : (checksColumns as any)}
                rows={rows}
                rowKey={(row) => row.id}
                density="compact"
                maxHeight="500px"
            />
        </div>
    );
};
