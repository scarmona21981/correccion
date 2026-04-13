import React from 'react';
import { useView, LabelType } from '../context/ViewContext';
import { Eye, Map as MapIcon, Hash, Ruler, Thermometer, Settings2, Check, ChevronRight } from 'lucide-react';

interface VisibilitySelectorProps {
    onClose?: () => void;
}

export const VisibilitySelector: React.FC<VisibilitySelectorProps> = () => {
    const { visibleLabelTypes, toggleLabelType, showChamberDiagrams, setShowChamberDiagrams } = useView();

    const sections = [
        {
            id: 'chambers',
            title: 'Cámaras',
            icon: <Eye size={16} />,
            items: [
                { id: 'chamber_ct', label: 'Cota Terreno (CT)', type: 'chamber_ct' },
                { id: 'chamber_crs', label: 'Cota Radier (CRS)', type: 'chamber_crs' },
                { id: 'chamber_diagram', label: 'Diagrama de Llegada', type: 'special_diagram' },
            ]
        },
        {
            id: 'pipes',
            title: 'Tuberías',
            icon: <MapIcon size={16} />,
            items: [
                { id: 'pipe_material', label: 'Material', type: 'pipe_material' },
                { id: 'pipe_diameter', label: 'Diámetro (DN)', type: 'pipe_diameter' },
                { id: 'pipe_slope', label: 'Pendiente (%)', type: 'pipe_slope' },
                { id: 'pipe_length', label: 'Longitud (L)', type: 'pipe_length' },
                { id: 'pipe_velocity', label: 'Velocidad (V)', type: 'pipe_velocity' },
            ]
        }
    ];

    return (
        <div style={{
            width: '280px',
            backgroundColor: 'rgba(30, 30, 31, 0.95)',
            backdropFilter: 'blur(20px)',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            padding: '16px',
            color: 'white',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            zIndex: 1000
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '12px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                <Settings2 size={18} color="var(--accent-color)" />
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Visibilidad de Etiquetas</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {sections.map(section => (
                    <div key={section.id}>
                        <div style={{
                            fontSize: '0.7rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            color: 'rgba(255, 255, 255, 0.4)',
                            fontWeight: 700,
                            marginBottom: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}>
                            {section.icon}
                            {section.title}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {section.items.map(item => {
                                const isSpecialDiagram = item.type === 'special_diagram';
                                const isActive = isSpecialDiagram ? showChamberDiagrams : visibleLabelTypes.has(item.type as LabelType);

                                const handleClick = () => {
                                    if (isSpecialDiagram) {
                                        setShowChamberDiagrams(!showChamberDiagrams);
                                    } else {
                                        toggleLabelType(item.type as LabelType);
                                    }
                                };

                                return (
                                    <button
                                        key={item.id}
                                        onClick={handleClick}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '8px 12px',
                                            borderRadius: '8px',
                                            backgroundColor: isActive ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                                            border: 'none',
                                            color: isActive ? '#3B82F6' : 'rgba(255, 255, 255, 0.7)',
                                            cursor: 'pointer',
                                            fontSize: '0.85rem',
                                            textAlign: 'left',
                                            transition: 'all 0.2s ease'
                                        }}
                                        className="visibility-item-btn"
                                    >
                                        <span>{item.label}</span>
                                        {isActive && <Check size={14} />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            <div style={{
                marginTop: '8px',
                padding: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '8px',
                fontSize: '0.75rem',
                color: 'rgba(255, 255, 255, 0.5)',
                lineHeight: '1.4'
            }}>
                Pista: Las etiquetas se escalan automáticamente según el nivel de zoom.
            </div>
        </div>
    );
};
