import React from 'react';
import { RoutePathGravity } from '../hydraulics/routeEngineGravity';

export interface RouteAlternativeItem {
    route: RoutePathGravity;
    text: string;
}

interface RouteSelectionControllerProps {
    enabled: boolean;
    routeText: string;
    route: RoutePathGravity | null;
    startLabel?: string;
    endLabel?: string;
    toastMessage?: string;
    alternatives: RouteAlternativeItem[];
    selectedAlternativeIndex: number;
    showAlternativesModal: boolean;
    onSelectAlternative: (index: number) => void;
    onConfirmAlternative: () => void;
    onCloseAlternativesModal: () => void;
    onOpenProfilePopout: () => void;
    onResetSelection: () => void;
    onDismissToast: () => void;
}

const panelStyle: React.CSSProperties = {
    position: 'absolute',
    top: 14,
    left: 14,
    zIndex: 1200,
    minWidth: '320px',
    maxWidth: '560px',
    background: 'rgba(15, 23, 42, 0.92)',
    border: '1px solid rgba(148, 163, 184, 0.45)',
    borderRadius: '10px',
    boxShadow: '0 10px 26px rgba(0,0,0,0.35)',
    padding: '10px 12px',
    color: '#e2e8f0'
};

const actionBtnStyle: React.CSSProperties = {
    border: '1px solid rgba(148, 163, 184, 0.4)',
    borderRadius: '8px',
    background: 'rgba(30, 41, 59, 0.65)',
    color: '#e2e8f0',
    padding: '6px 10px',
    cursor: 'pointer',
    fontSize: '0.78rem',
    fontWeight: 700
};

export const RouteSelectionController: React.FC<RouteSelectionControllerProps> = ({
    enabled,
    routeText,
    route,
    startLabel,
    endLabel,
    toastMessage,
    alternatives,
    selectedAlternativeIndex,
    showAlternativesModal,
    onSelectAlternative,
    onConfirmAlternative,
    onCloseAlternativesModal,
    onOpenProfilePopout,
    onResetSelection,
    onDismissToast
}) => {
    const shouldRenderPanel = enabled || !!route;

    return (
        <>
            {shouldRenderPanel && (
                <div style={panelStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 800, letterSpacing: '0.03em' }}>
                            Selección de ruta para perfil
                        </div>
                        <span
                            style={{
                                fontSize: '0.66rem',
                                fontWeight: 800,
                                letterSpacing: '0.06em',
                                borderRadius: '999px',
                                padding: '2px 8px',
                                border: `1px solid ${enabled ? 'var(--success)' : 'var(--border)'}`,
                                color: enabled ? 'var(--success)' : 'var(--text-secondary)'
                            }}
                        >
                            {enabled ? 'ON' : 'OFF'}
                        </span>
                    </div>

                    {!route && (
                        <div style={{ marginTop: '8px', fontSize: '0.78rem', lineHeight: 1.4, color: '#cbd5e1' }}>
                            {!startLabel && '1) Haga clic en la cámara inicial.'}
                            {startLabel && !endLabel && `Inicio seleccionado: ${startLabel}. 2) Haga clic en la cámara final.`}
                        </div>
                    )}

                    {route && (
                        <div style={{ marginTop: '8px', display: 'grid', gap: '6px' }}>
                            <div style={{ fontSize: '0.79rem', lineHeight: 1.4 }}>
                                Ruta: {routeText} ({route.pipeIds.length} tramos)
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <button type="button" onClick={onOpenProfilePopout}                                 style={{ ...actionBtnStyle, borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                                    Ver perfil (popout)
                                </button>
                                <button type="button" onClick={onResetSelection} style={actionBtnStyle}>
                                    Limpiar ruta
                                </button>
                                <button
                                    type="button"
                                    onClick={onResetSelection}
                                    style={{ ...actionBtnStyle, borderColor: 'rgba(248,113,113,0.65)', color: '#fecaca' }}
                                >
                                    Salir
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {toastMessage && (
                <div
                    style={{
                        position: 'absolute',
                        top: shouldRenderPanel ? 120 : 14,
                        left: 14,
                        zIndex: 1250,
                        background: 'rgba(127, 29, 29, 0.95)',
                        border: '1px solid rgba(248, 113, 113, 0.55)',
                        color: '#fecaca',
                        borderRadius: '8px',
                        boxShadow: '0 8px 20px rgba(0,0,0,0.35)',
                        padding: '8px 10px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    <span>{toastMessage}</span>
                    <button
                        type="button"
                        onClick={onDismissToast}
                        style={{
                            border: 'none',
                            borderRadius: '6px',
                            background: 'rgba(15,23,42,0.35)',
                            color: '#fee2e2',
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            padding: '3px 7px'
                        }}
                    >
                        Cerrar
                    </button>
                </div>
            )}

            {showAlternativesModal && (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        zIndex: 1300,
                        background: 'rgba(2, 6, 23, 0.55)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '18px'
                    }}
                    onClick={onCloseAlternativesModal}
                >
                    <div
                        style={{
                            width: 'min(620px, 94vw)',
                            background: '#0f172a',
                            border: '1px solid rgba(148, 163, 184, 0.4)',
                            borderRadius: '12px',
                            boxShadow: '0 16px 34px rgba(0,0,0,0.42)',
                            padding: '14px',
                            color: '#e2e8f0',
                            display: 'grid',
                            gap: '10px'
                        }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div style={{ fontSize: '0.9rem', fontWeight: 800 }}>Elegir ruta</div>
                        <div style={{ fontSize: '0.76rem', color: '#cbd5e1' }}>
                            Se detectaron multiples caminos. Por defecto se selecciona el de menor longitud total.
                        </div>

                        <div style={{ maxHeight: '260px', overflowY: 'auto', display: 'grid', gap: '8px' }}>
                            {alternatives.map((item, index) => (
                                <label
                                    key={`route-option-${index}`}
                                    style={{
                                        border: `1px solid ${index === selectedAlternativeIndex ? 'var(--accent)' : 'var(--border)'}`,
                                        borderRadius: '8px',
                                        padding: '8px',
                                        display: 'grid',
                                        gap: '5px',
                                        cursor: 'pointer',
                                        background: index === selectedAlternativeIndex ? 'var(--accent-soft)' : 'var(--surface)'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input
                                            type="radio"
                                            checked={index === selectedAlternativeIndex}
                                            onChange={() => onSelectAlternative(index)}
                                        />
                                        <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Opcion {index + 1}</span>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#cbd5e1', paddingLeft: '22px' }}>{item.text}</div>
                                </label>
                            ))}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button type="button" onClick={onCloseAlternativesModal} style={actionBtnStyle}>Cancelar</button>
                            <button
                                type="button"
                                onClick={onConfirmAlternative}
                                style={{ ...actionBtnStyle, borderColor: 'var(--success)', color: 'var(--success)' }}
                            >
                                Confirmar ruta
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
