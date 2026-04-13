import React from 'react';

interface CoordinateIndicatorProps {
    className?: string;
    style?: React.CSSProperties;
}

export const CoordinateIndicator: React.FC<CoordinateIndicatorProps> = ({ style }) => {
    return (
        <div
            className="coordinate-indicator"
            style={{
                width: '52px',
                height: '52px',
                position: 'relative',
                pointerEvents: 'none',
                ...style
            }}
        >
            <svg width="52" height="52" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Y Axis */}
                <line x1="10" y1="50" x2="10" y2="12" stroke="var(--accent, #3b82f6)" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M7 15L10 8L13 15" stroke="var(--accent, #3b82f6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <text x="16" y="15" fill="var(--accent, #3b82f6)" fontSize="9" fontWeight="700" fontFamily="var(--font-family, sans-serif)">Y</text>

                {/* X Axis */}
                <line x1="10" y1="50" x2="48" y2="50" stroke="var(--danger, #ef4444)" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M45 47L52 50L45 53" stroke="var(--danger, #ef4444)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <text x="48" y="44" fill="var(--danger, #ef4444)" fontSize="9" fontWeight="700" fontFamily="var(--font-family, sans-serif)">X</text>

                {/* Origin */}
                <circle cx="10" cy="50" r="2.5" fill="var(--text-muted, #64748b)" />
            </svg>
        </div>
    );
};
