import React from 'react';
import { useView, LabelType } from '../context/ViewContext';
import { Settings2 } from 'lucide-react';

export const LabelSelector: React.FC = () => {
    const { visibleLabelTypes, toggleLabelType } = useView();
    const [isOpen, setIsOpen] = React.useState(false);

    const labels: { id: LabelType; label: string; group: string }[] = [
        { id: 'chamber_id', label: 'ID Cámara', group: 'Cámaras' },
        { id: 'chamber_ct', label: 'Cota Terreno (CT)', group: 'Cámaras' },
        { id: 'chamber_cre', label: 'Cotas Entrada (Cre)', group: 'Cámaras' },
        { id: 'chamber_h', label: 'Alturas Entrada (H)', group: 'Cámaras' },
        { id: 'chamber_crs', label: 'Cota Radier (CRS)', group: 'Cámaras' },
        { id: 'pipe_id', label: 'ID Tubería', group: 'Tuberías' },
        { id: 'pipe_material', label: 'Material', group: 'Tuberías' },
        { id: 'pipe_diameter', label: 'Diámetro', group: 'Tuberías' },
        { id: 'pipe_slope', label: 'Pendiente', group: 'Tuberías' },
        { id: 'pipe_length', label: 'Longitud', group: 'Tuberías' },
        { id: 'pipe_velocity', label: 'Velocidad', group: 'Tuberías' },
    ];

    const groups = ['Cámaras', 'Tuberías'];

    return (
        <div style={{ position: 'relative' }}>
            <button
                className={`button-icon ${isOpen ? 'active' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                title="Seleccionar Etiquetas"
            >
                <Settings2 size={20} />
            </button>

            {isOpen && (
                <div style={{
                    position: 'absolute',
                    right: '48px',
                    top: '0',
                    backgroundColor: 'var(--sidebar-bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    boxShadow: 'var(--shadow-lg)',
                    padding: '12px',
                    width: '200px',
                    zIndex: 1000,
                    fontFamily: 'var(--font-family)',
                    color: 'var(--text-main)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)'
                }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: 'var(--text-main)' }}>Etiquetas a Mostrar</h4>

                    {groups.map(group => (
                        <div key={group} style={{ marginBottom: '12px' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                                {group}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {labels.filter(l => l.group === group).map(label => (
                                    <label key={label.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-main)' }}>
                                        <input
                                            type="checkbox"
                                            checked={visibleLabelTypes.has(label.id)}
                                            onChange={() => toggleLabelType(label.id)}
                                            style={{ cursor: 'pointer', accentColor: 'var(--accent-color)' }}
                                        />
                                        <span>{label.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                    <button
                        onClick={() => setIsOpen(false)}
                        style={{
                            width: '100%',
                            padding: '6px',
                            backgroundColor: 'var(--active-bg)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-main)',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            marginTop: '4px'
                        }}
                    >
                        Cerrar
                    </button>
                </div>
            )}
        </div>
    );
};
