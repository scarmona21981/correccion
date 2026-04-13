import React from 'react';

interface TooltipProps {
    content: string;
    children: React.ReactNode;
    position?: 'top' | 'bottom' | 'left' | 'right';
    variant?: 'default' | 'technical';
    technicalDetails?: {
        label?: string;
        value?: string;
    };
}

export const Tooltip: React.FC<TooltipProps> = ({
    content,
    children,
    position = 'top',
    variant = 'default',
    technicalDetails
}) => {
    const [isVisible, setIsVisible] = React.useState(false);

    const getPositionStyles = (): React.CSSProperties => {
        const baseStyles: React.CSSProperties = {
            position: 'absolute',
            zIndex: 600,
            padding: '8px 12px',
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            boxShadow: 'var(--shadow-lg)',
            fontSize: '12px',
            color: 'var(--text-primary)',
            whiteSpace: 'normal',
            maxWidth: '300px',
            pointerEvents: 'none',
            opacity: 0,
            visibility: 'hidden',
            transition: 'opacity 120ms ease, visibility 120ms ease'
        };

        switch (position) {
            case 'top':
                return {
                    ...baseStyles,
                    bottom: 'calc(100% + 8px)',
                    left: '50%',
                    transform: 'translateX(-50%)'
                };
            case 'bottom':
                return {
                    ...baseStyles,
                    top: 'calc(100% + 8px)',
                    left: '50%',
                    transform: 'translateX(-50%)'
                };
            case 'left':
                return {
                    ...baseStyles,
                    right: 'calc(100% + 8px)',
                    top: '50%',
                    transform: 'translateY(-50%)'
                };
            case 'right':
                return {
                    ...baseStyles,
                    left: 'calc(100% + 8px)',
                    top: '50%',
                    transform: 'translateY(-50%)'
                };
            default:
                return baseStyles;
        }
    };

    const getTechnicalStyles = (): React.CSSProperties => {
        if (variant !== 'technical') return {};

        return {
            display: 'flex',
            flexDirection: 'column' as const,
            gap: '4px',
            minWidth: '200px',
            padding: '10px 14px'
        };
    };

    return (
        <div
            style={{ position: 'relative', display: 'inline-block' }}
            onMouseEnter={() => setIsVisible(true)}
            onMouseLeave={() => setIsVisible(false)}
        >
            {children}
            {isVisible && (
                <div
                    className="tooltip-content"
                    style={{
                        ...getPositionStyles(),
                        ...getTechnicalStyles(),
                        opacity: 1,
                        visibility: 'visible'
                    }}
                >
                    {variant === 'technical' && technicalDetails?.label && (
                        <div style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            textTransform: 'uppercase' as const,
                            letterSpacing: '0.08em',
                            color: 'var(--text-muted)',
                            marginBottom: '2px'
                        }}>
                            {technicalDetails.label}
                        </div>
                    )}
                    {variant === 'technical' && technicalDetails?.value && (
                        <div style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            fontFamily: 'var(--font-family-numeric)'
                        }}>
                            {technicalDetails.value}
                        </div>
                    )}
                    <div style={{ marginTop: variant === 'technical' ? '6px' : '0' }}>
                        {content}
                    </div>
                </div>
            )}
        </div>
    );
};

interface TooltipLabelProps {
    label: string;
    tooltip: string;
    technicalValue?: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
}

export const TooltipLabel: React.FC<TooltipLabelProps> = ({
    label,
    tooltip,
    technicalValue,
    position = 'top'
}) => {
    return (
        <Tooltip
            content={tooltip}
            position={position}
            variant={technicalValue ? 'technical' : 'default'}
            technicalDetails={technicalValue ? { label: tooltip, value: technicalValue } : undefined}
        >
            <span 
                style={{ 
                    cursor: 'help',
                    borderBottom: '1px dotted var(--text-muted)',
                    display: 'inline-block'
                }}
            >
                {label}
            </span>
        </Tooltip>
    );
};