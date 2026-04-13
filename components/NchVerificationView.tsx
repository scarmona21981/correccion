import React from 'react';
import { PressureResults } from '../hydraulics/types';
import { DataTable } from './common/DataTable';
import { StatusBadge } from './common/StatusBadge';

interface NchVerificationViewProps {
    results: PressureResults | null;
}

interface RowItem {
    id: string;
    criterio: string;
    requerido: string;
    actual: string;
    status: 'APTO' | 'NO APTO' | 'CONDICIONAL' | 'INFO';
    detalle: string;
}

const format = (value: number | undefined, decimals = 2): string => {
    if (value === undefined || !Number.isFinite(value)) return '—';
    return value.toFixed(decimals);
};

const mapCheckStatus = (status: string): 'APTO' | 'NO APTO' | 'CONDICIONAL' | 'INFO' => {
    if (status === 'PASS') return 'APTO';
    if (status === 'FAIL') return 'NO APTO';
    if (status === 'WARN') return 'CONDICIONAL';
    return 'INFO';
};

const formatLimit = (limitValue: number | string | undefined, unit?: string): string => {
    if (limitValue === undefined) return '—';
    if (typeof limitValue === 'number') {
        return unit ? `${format(limitValue)} ${unit}` : format(limitValue);
    }
    return unit ? `${limitValue} ${unit}` : limitValue;
};

const formatMeasured = (measuredValue: number | undefined, unit?: string): string => {
    if (measuredValue === undefined || !Number.isFinite(measuredValue)) return '—';
    return unit ? `${format(measuredValue)} ${unit}` : format(measuredValue);
};

export const NchVerificationView: React.FC<NchVerificationViewProps> = ({ results }) => {
    const verification = results?.nchVerification;

    if (!verification) {
        return <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>Pendiente de datos.</div>;
    }

    const rows: RowItem[] = verification.checks && verification.checks.length > 0
        ? verification.checks.map(check => ({
            id: check.id,
            criterio: check.label,
            requerido: formatLimit(check.limitValue, check.unit),
            actual: formatMeasured(check.measuredValue, check.unit),
            status: mapCheckStatus(check.status),
            detalle: check.message
        }))
        : [
            {
                id: 'retention',
                criterio: 'Tiempo de retención',
                requerido: 'TR <= 30 min',
                actual: `${format(verification.retentionTime.value, 1)} min`,
                status: verification.complianceChecklist.retention ? 'APTO' : 'NO APTO',
                detalle: verification.retentionTime.message
            },
            {
                id: 'cycle',
                criterio: 'Tiempo de ciclo',
                requerido: 'Tc >= 10 min',
                actual: `${format(verification.cycleTime.value, 1)} min`,
                status: verification.complianceChecklist.cycle ? 'APTO' : 'NO APTO',
                detalle: verification.cycleTime.message
            },
            {
                id: 'redundancy',
                criterio: 'Redundancia bombas',
                requerido: '>= 2 bombas',
                actual: verification.redundancy.current,
                status: verification.complianceChecklist.redundancy ? 'APTO' : 'NO APTO',
                detalle: verification.redundancy.message
            },
            {
                id: 'volume',
                criterio: 'Volumen útil',
                requerido: `${format(verification.usefulVolume.minimalRequired, 2)} m3 mínimo`,
                actual: `${format(verification.usefulVolume.current, 2)} m3`,
                status: verification.complianceChecklist.volume ? 'APTO' : 'NO APTO',
                detalle: verification.usefulVolume.message
            },
            {
                id: 'velocity',
                criterio: 'Velocidad de impulsión',
                requerido: '0.60 - 3.00 m/s',
                actual: `${format(verification.velocity.current, 2)} m/s`,
                status: verification.complianceChecklist.velocity ? 'APTO' : 'NO APTO',
                detalle: verification.velocity.message
            },
            {
                id: 'margin',
                criterio: 'Margen de seguridad',
                requerido: `>= ${format(verification.pumpMargin.required, 1)}%`,
                actual: `${format(verification.pumpMargin.current, 1)}%`,
                status: verification.complianceChecklist.margin ? 'APTO' : 'NO APTO',
                detalle: verification.pumpMargin.message
            },
            {
                id: 'submergence',
                criterio: 'Sumergencia mínima',
                requerido: `${format(verification.submergence.minimalRequired, 2)} m`,
                actual: `${format(verification.submergence.current, 2)} m`,
                status: verification.complianceChecklist.submergence ? 'APTO' : 'NO APTO',
                detalle: verification.submergence.message
            }
        ];

    return (
        <div style={{ padding: '4px' }}>
            <DataTable
                title="Verificación Planta Elevadora"
                subtitle="Criterios de diseño según normativa (TR, Tc, Redundancia, etc.)"
                columns={[
                    { key: 'criterio', header: 'Criterio', width: 200 },
                    { key: 'requerido', header: 'Requerido', width: 150 },
                    { key: 'actual', header: 'Actual', width: 120, align: 'right' },
                    {
                        key: 'status',
                        header: 'Estado',
                        width: 110,
                        align: 'center',
                        format: (v: any) => <StatusBadge status={v} />
                    },
                    { key: 'detalle', header: 'Detalle', width: 250 }
                ]}
                rows={rows}
                rowKey={(row) => row.id}
                density="compact"
                maxHeight="400px"
            />
        </div>
    );
};
