import React, { useState, useEffect } from 'react';
import {
    FileText,
    Settings,
    CloudRain,
    Waves,
    Droplets,
    BarChart,
    Activity,
    Clock,
    Map as MapIcon,
    ChevronRight,
    ChevronDown,
    LucideIcon,
    Table,
    Minus,
    Circle,
    Zap,
    ArrowUp
} from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider';
import { useProject } from '../context/ProjectContext';
import { useView } from '../context/ViewContext';
import { getEffectivePipe } from '../utils/getEffectivePipe';

interface TreeItem {
    id: string;
    label: string;
    icon: LucideIcon;
    type?: 'tramos' | 'camaras' | 'bombas' | 'elevadora' | 'notes';
}

const mainCategories: TreeItem[] = [
    { id: 'notes', label: 'Title/Notes', icon: FileText, type: 'notes' },
    { id: 'tramos', label: 'Tramos', icon: Minus, type: 'tramos' },
    { id: 'camaras', label: 'Cámaras', icon: Circle, type: 'camaras' },
    { id: 'bombas', label: 'Bombas', icon: Zap, type: 'bombas' },
    { id: 'elevadora', label: 'Cámara Elevadora', icon: ArrowUp, type: 'elevadora' },
];

export const Sidebar: React.FC = () => {
    const { settings, setSettings, pipes, chambers, filePath } = useProject();
    const { editingObjectId, setEditingObjectId, isLocked } = useView();
    const [expanded, setExpanded] = useState<Record<string, boolean>>({
        tramos: true,
        camaras: true
    });
    
    const { themeVersion } = useTheme();
    
    useEffect(() => {
        // Force re-render when theme changes
    }, [themeVersion]);

    // Extract project name from file path
    const projectName = filePath
        ? filePath.split(/[/\\]/).pop()?.replace('.json', '') || 'Proyecto sin nombre'
        : 'Proyecto sin nombre';

    const toggleExpand = (id: string) => {
        setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
    };

    return (
        <aside className="sidebar">
            <div className="sidebar-header" style={{ borderBottom: '1px solid var(--border)', padding: '12px 14px' }}>
                <div>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-color)' }}>Project</span>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', fontWeight: 500 }}>
                        {projectName}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                    <ChevronDown size={14} className="text-muted" />
                </div>
            </div>

            <div className="tree-view" style={{ flex: 1, overflowY: 'auto' }}>
                {mainCategories.map((item) => (
                    <div key={item.id}>
                        <div
                            className={`tree-item ${item.id === 'notes' ? 'active' : ''}`}
                            onClick={() => (item.id !== 'notes' && toggleExpand(item.id))}
                            style={{ cursor: 'pointer' }}
                        >
                            {['tramos', 'camaras'].includes(item.id) ? (
                                expanded[item.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                            ) : (
                                <div style={{ width: 14 }} />
                            )}
                            <item.icon size={16} className="tree-item-icon" />
                            <span>{item.label}</span>
                        </div>

                        {item.id === 'tramos' && expanded.tramos && (
                            <div className="tree-sub-items">
                                {pipes.length === 0 && <div className="tree-sub-item text-muted" style={{ paddingLeft: '44px', fontStyle: 'italic' }}>Sin tramos</div>}
                                {pipes.map(pipe => (
                                    (() => {
                                        const eff = getEffectivePipe(pipe as any);
                                        const roleBadge = eff.role === 'INTERIOR_RAMAL'
                                            ? 'RAMAL_INTERIOR'
                                            : (eff.role === 'DESCARGA_HORIZ' ? 'RAMAL_CONEXION' : eff.role);
                                        return (
                                    <div
                                        key={pipe.id}
                                        className="tree-sub-item"
                                        style={{ paddingLeft: '44px', fontSize: '0.75rem', padding: '4px 0', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                                        onClick={() => {
                                            if (editingObjectId?.id === pipe.id && editingObjectId?.type === 'pipe') {
                                                setEditingObjectId(null);
                                            } else {
                                                setEditingObjectId({ id: pipe.id, type: 'pipe' });
                                            }
                                        }}
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            setEditingObjectId({ id: pipe.id, type: 'pipe' });
                                        }}
                                    >
                                        <div style={{ width: '8px', height: '1px', background: 'var(--border)' }} />
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                                            <span style={{ fontWeight: 600 }}>{pipe.userDefinedId || `Pipe ${pipe.id.slice(0, 4)}`}</span>
                                            {roleBadge && (
<div style={{
                                                    fontSize: '0.6rem',
                                                    padding: '1px 4px',
                                                    borderRadius: '3px',
                                                    width: 'fit-content',
                                                    fontWeight: 700,
                                                    background: roleBadge === 'LATERAL' ? 'var(--accent-soft)' :
                                                        roleBadge === 'COLECTOR' ? 'var(--role-colector-bg)' :
                                                            'var(--role-neutral-bg)',
                                                    color: roleBadge === 'LATERAL' ? 'var(--accent)' :
                                                        roleBadge === 'COLECTOR' ? 'var(--role-colector)' :
                                                            'var(--text-muted)',
                                                    border: `1px solid ${roleBadge === 'LATERAL' ? 'var(--accent)' :
                                                        roleBadge === 'COLECTOR' ? 'var(--role-colector)' :
                                                            'var(--role-neutral)'}`
                                                }}>
                                                    {roleBadge}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                        );
                                    })()
                                ))}
                            </div>
                        )}

                        {item.id === 'camaras' && expanded.camaras && (
                            <div className="tree-sub-items">
                                {chambers.length === 0 && <div className="tree-sub-item text-muted" style={{ paddingLeft: '44px', fontStyle: 'italic' }}>Sin cámaras</div>}
                                {chambers.map(chamber => (
                                    <div
                                        key={chamber.id}
                                        className="tree-sub-item"
                                        style={{ paddingLeft: '44px', fontSize: '0.75rem', padding: '4px 0', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                                        onClick={() => {
                                            if (editingObjectId?.id === chamber.id && editingObjectId?.type === 'chamber') {
                                                setEditingObjectId(null);
                                            } else {
                                                setEditingObjectId({ id: chamber.id, type: 'chamber' });
                                            }
                                        }}
onContextMenu={(e) => {
                                            e.preventDefault();
                                            setEditingObjectId({ id: chamber.id, type: 'chamber' });
                                        }}
                                    >
                                        <div style={{ width: '8px', height: '1px', background: 'var(--border)' }} />
                                        <span>{chamber.userDefinedId || `CH ${chamber.id.slice(0, 4)}`}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </aside>
    );
};
