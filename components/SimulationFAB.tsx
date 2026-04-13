import React from 'react';
import { Play, Lock, Loader2 } from 'lucide-react';

interface SimulationFABProps {
    onRun: () => void;
    isLocked: boolean;
    disabled?: boolean;
}

export const SimulationFAB: React.FC<SimulationFABProps> = ({ onRun, isLocked, disabled }) => {
    const handleClick = () => {
        if (isLocked) {
            alert("PROYECTO BLOQUEADO, PARA SEGUIR DESBLOQUEAR");
            return;
        }
        onRun();
    };

    return (
        <button
            onClick={handleClick}
            disabled={disabled}
            style={{
                position: 'absolute',
                bottom: '40px',
                right: '40px',
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: isLocked ? 'var(--bg)' : 'var(--success)', // Green for run
                color: isLocked ? 'var(--text-muted)' : 'var(--text-primary)',
                border: isLocked ? '2px solid var(--border)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isLocked ? 'none' : '0 10px 25px rgba(16, 185, 129, 0.4)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                zIndex: 100,
                transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
            }}
            title={isLocked ? "Simulation Locked" : "Run Simulation"}
        >
            {isLocked ? (
                <Lock size={24} />
            ) : (
                <Play size={28} fill="currentColor" style={{ marginLeft: '4px' }} />
            )}
        </button>
    );
};
