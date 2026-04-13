import React from 'react';

export type StatusType = 'APTO' | 'NO APTO' | 'CONDICIONAL' | 'INFO' | 'FUERA ALCANCE' | 'APTO CON OBSERVACIÓN' | 'APTO CON ADVERTENCIA' | 'INCOMPLETO' | 'NO_APTO' | 'SIN CAUDAL' | 'REVISAR';

interface StatusBadgeProps {
    status: string; // broadened to accept strings from engines
    label?: string;
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
    'APTO': {
        bg: 'var(--badge-success-bg)',
        text: 'var(--badge-success-text)',
        label: 'APTO'
    },
    'CUMPLE': {
        bg: 'var(--badge-success-bg)',
        text: 'var(--badge-success-text)',
        label: 'CUMPLE'
    },
    'NO APTO': {
        bg: 'var(--badge-error-bg)',
        text: 'var(--badge-error-text)',
        label: 'NO APTO'
    },
    'NO_APTO': {
        bg: 'var(--badge-error-bg)',
        text: 'var(--badge-error-text)',
        label: 'NO APTO'
    },
    'CONDICIONAL': {
        bg: 'var(--badge-warning-bg)',
        text: 'var(--badge-warning-text)',
        label: 'CONDICIONAL'
    },
    'INFO': {
        bg: 'var(--badge-info-bg)',
        text: 'var(--badge-info-text)',
        label: 'INFO'
    },
    'FUERA ALCANCE': {
        bg: 'var(--badge-info-bg)',
        text: 'var(--badge-info-text)',
        label: 'N/A'
    },
    'APTO CON OBSERVACIÓN': {
        bg: 'var(--badge-warning-bg)',
        text: 'var(--badge-warning-text)',
        label: 'OBSERVACIÓN'
    },
    'APTO CON ADVERTENCIA': {
        bg: 'var(--badge-warning-bg)',
        text: 'var(--badge-warning-text)',
        label: 'ADVERTENCIA'
    },
    'INCOMPLETO': {
        bg: 'var(--role-neutral-bg)',
        text: 'var(--role-neutral)',
        label: 'INCOMPLETO'
    },
    'SIN CAUDAL': {
        bg: 'var(--warning-bg)',
        text: 'var(--warning)',
        label: 'SIN CAUDAL'
    },
    'REVISAR': {
        bg: 'var(--badge-error-bg)',
        text: 'var(--badge-error-text)',
        label: 'REVISAR'
    },
    'ACEPTABLE': {
        bg: 'var(--badge-warning-bg)',
        text: 'var(--badge-warning-text)',
        label: 'ACEPTABLE'
    },
    'NO_CUMPLE': {
        bg: 'var(--badge-error-bg)',
        text: 'var(--badge-error-text)',
        label: 'NO CUMPLE'
    }
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label }) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG['INFO'];

    return (
        <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px 10px',
            borderRadius: '999px',
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            background: config.bg,
            color: config.text,
            minWidth: 'var(--badge-min-width, 80px)',
            border: `1px solid ${config.text}33`,
            whiteSpace: 'nowrap'
        }}>
            {label || config.label}
        </span>
    );
};
