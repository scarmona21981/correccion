import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save, FileText, FileSpreadsheet } from 'lucide-react';
import { NCH3371_TABLE_A1 } from '../../hydraulics/uehTables';
import { ChamberFixtureLoad, getFixtureQD, getKByUsageClass, NCH3371_TABLE_B1, normalizeUsageClass, SanitarySystemType } from '../../hydraulics/qwwTables';
import * as XLSX from 'xlsx';
import { DataTable } from './DataTable';

interface ArtifactRow {
    id: string;
    type: string;
    clase: number;
    ueh: number;
    quantity: number;
}

interface ArtifactCalculatorSavePayload {
    totalUEH: number;
    totalQww: number;
    fixtureLoads: ChamberFixtureLoad[];
}

interface ArtifactCalculatorProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (payload: ArtifactCalculatorSavePayload) => void;
    sanitarySystemType?: SanitarySystemType;
    initialFixtures?: ChamberFixtureLoad[]; // Artefactos ya persistidos en la cámara
}

const USAGE_CLASS_OPTIONS = [1, 2, 3, 4];

const UEH_BY_B1_FIXTURE_AND_CLASS: Record<string, Partial<Record<number, number>>> = {
    LAVAMANOS_BIDET: { 1: 1, 2: 2, 3: 2 },
    BANO_LLUVIA: { 1: 2, 2: 6, 3: 6 },
    URINARIO_DESCARGA_EMBOLO: { 2: 3, 3: 3 },
    URINARIO_DESCARGA_DIRECTA: { 2: 1, 3: 1 },
    URINARIO_TUBERIA_PERFORADA: { 2: 5, 3: 5 },
    BANO_TINA: { 1: 3, 2: 4, 3: 4 },
    LAVAPLATOS: { 1: 3, 2: 3, 3: 6 },
    LAVAVAJILLAS_DOMESTICO: { 1: 3, 2: 3, 3: 6 },
    LAVADORA_ROPA_DOMESTICA: { 1: 3, 2: 6, 3: 6 },
    INODORO_ESTANQUE_O_FLUSH: { 1: 3, 2: 5, 3: 6 },
    PILETA_BOTA_AGUA: { 1: 3, 2: 3, 3: 3 },
    PILETA_DE_PISO: { 1: 0, 2: 0, 3: 0, 4: 0 }
};

export const getUEHForFixtureByClass = (fixtureKey: string, usageClass: number): number => {
    const mapped = UEH_BY_B1_FIXTURE_AND_CLASS[fixtureKey];
    if (mapped && mapped[usageClass] !== undefined) return Number(mapped[usageClass] || 0);

    const fromA1 = (NCH3371_TABLE_A1 as Record<string, any>)[fixtureKey];
    if (fromA1?.uehByClass && fromA1.uehByClass[usageClass] !== undefined) {
        return Number(fromA1.uehByClass[usageClass] || 0);
    }

    return 0;
};

export const ArtifactCalculator: React.FC<ArtifactCalculatorProps> = ({ isOpen, onClose, onSave, sanitarySystemType = 'I', initialFixtures }) => {
    const [rows, setRows] = useState<ArtifactRow[]>([]);
    const [totalUEH, setTotalUEH] = useState(0);
    const [totalQww, setTotalQww] = useState(0);

    // CRÍTICO: Inicializar el borrador desde los artefactos persistidos de la cámara.
    // Este effect SOLO corre al abrir el modal (isOpen cambia a true).
    // Si hay artefactos previos (initialFixtures), se cargan como borrador (copia profunda).
    // Si no hay artefactos, se agrega UNA fila vacía por defecto para mejor UX.
    // NUNCA resetear si el modal ya estaba abierto.
    const prevIsOpen = React.useRef(false);
    useEffect(() => {
        if (isOpen && !prevIsOpen.current) {
            // El modal acaba de abrirse: inicializar borrador desde datos persistidos
            if (initialFixtures && initialFixtures.length > 0) {
                // Convertir ChamberFixtureLoad[] → ArtifactRow[] (copia profunda)
                const loadedRows: ArtifactRow[] = initialFixtures.map((fl, idx) => ({
                    id: `loaded-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
                    type: fl.fixtureKey,
                    clase: typeof fl.usageClass === 'number' ? fl.usageClass : 1,
                    ueh: getUEHForFixtureByClass(fl.fixtureKey, typeof fl.usageClass === 'number' ? fl.usageClass : 1),
                    quantity: fl.quantity
                }));
                setRows(loadedRows);
            } else {
                // Sin artefactos previos: empezar con una fila vacía por defecto
                const firstFixture = Object.keys(NCH3371_TABLE_B1)[0];
                const defaultClase = 1;
                setRows([{
                    id: `new-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                    type: firstFixture,
                    clase: defaultClase,
                    ueh: getUEHForFixtureByClass(firstFixture, defaultClase),
                    quantity: 1
                }]);
            }
        }
        prevIsOpen.current = isOpen;
    }, [isOpen, initialFixtures]);

    useEffect(() => {
        const nextTotalUEH = rows.reduce((sum, row) => sum + (row.ueh * row.quantity), 0);
        setTotalUEH(nextTotalUEH);

        const qwwSquares = rows.reduce((sum, row) => {
            const qd = getFixtureQD(row.type, sanitarySystemType);
            const k = getKByUsageClass(normalizeUsageClass(row.clase));
            return sum + ((k * k * qd * row.quantity) / 60);
        }, 0);
        setTotalQww(Math.sqrt(Math.max(0, qwwSquares)));
    }, [rows, sanitarySystemType]);

    if (!isOpen) return null;

    const handleAddRow = () => {
        const firstFixture = Object.keys(NCH3371_TABLE_B1)[0];
        const defaultClase = 1;
        const newRow: ArtifactRow = {
            id: `row-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            type: firstFixture,
            clase: defaultClase,
            ueh: getUEHForFixtureByClass(firstFixture, defaultClase),
            quantity: 1
        };
        setRows([...rows, newRow]);
    };

    const handleUpdateRow = (id: string, field: keyof ArtifactRow, value: string | number) => {
        setRows(rows.map(row => {
            if (row.id === id) {
                const updatedRow: ArtifactRow = { ...row, [field]: value } as ArtifactRow;

                // Auto-update UEH and clase if type changes
                if (field === 'type') {
                    const defaultClase = 1;
                    updatedRow.clase = defaultClase;
                    updatedRow.ueh = getUEHForFixtureByClass(value as string, defaultClase);
                }
                // Auto-update UEH if clase changes
                else if (field === 'clase') {
                    updatedRow.ueh = getUEHForFixtureByClass(updatedRow.type, Number(value));
                }

                return updatedRow;
            }
            return row;
        }));
    };

    const handleDeleteRow = (id: string) => {
        setRows(rows.filter(r => r.id !== id));
    };

    const handleSave = () => {
        const fixtureLoads: ChamberFixtureLoad[] = rows
            .filter(row => row.type && row.quantity > 0)
            .map(row => ({
                fixtureKey: row.type,
                quantity: row.quantity,
                usageClass: normalizeUsageClass(row.clase)
            }));

        onSave({
            totalUEH,
            totalQww,
            fixtureLoads
        });
        onClose();
    };

    const exportToPDF = (e: React.MouseEvent) => {
        e.stopPropagation();
        window.print();
    };

    const exportToExcel = (e: React.MouseEvent) => {
        e.stopPropagation();
        const data: any[] = rows.map(row => ({
            'Tipo de Artefacto': NCH3371_TABLE_B1[row.type as keyof typeof NCH3371_TABLE_B1]?.name || row.type,
            'Clase': `Clase ${row.clase}`,
            'UEH Unitario': row.ueh,
            'QD (L/min)': getFixtureQD(row.type, sanitarySystemType),
            'Cantidad': row.quantity,
            'Subtotal UEH': (row.ueh * row.quantity).toFixed(2)
        }));

        // Add total row
        data.push({
            'Tipo de Artefacto': '',
            'Clase': '',
            'UEH Unitario': '' as any,
            'QD (L/min)': '' as any,
            'Cantidad': 'TOTAL UEH:' as any,
            'Subtotal UEH': totalUEH.toFixed(2)
        });



        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Cálculo UEH-Qww");

        const now = new Date();
        const filename = `calculo_ueh_${now.toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, filename);
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999
        }}>
            <div style={{
                background: 'var(--bg-color)',
                width: '600px',
                borderRadius: '8px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '80vh',
                border: '1px solid var(--border-color)',
                color: 'var(--text-main)'
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'var(--sidebar-bg)',
                    borderTopLeftRadius: '8px',
                    borderTopRightRadius: '8px'
                }}>
                    <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1rem' }}>Calculadora de UEH por Artefacto</h3>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button
                            onClick={exportToPDF}
                            disabled={rows.length === 0}
                            title="Exportar PDF"
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: '28px', height: '28px',
                                backgroundColor: rows.length === 0 ? 'rgba(100, 116, 139, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                                color: rows.length === 0 ? '#64748b' : '#3b82f6',
                                border: `1px solid ${rows.length === 0 ? 'rgba(100, 116, 139, 0.2)' : 'rgba(59, 130, 246, 0.2)'}`,
                                borderRadius: '6px',
                                cursor: rows.length === 0 ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s',
                                opacity: rows.length === 0 ? 0.5 : 1
                            }}
                        >
                            <FileText size={14} />
                        </button>
                        <button
                            onClick={exportToExcel}
                            disabled={rows.length === 0}
                            title="Exportar Excel"
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: '28px', height: '28px',
                                backgroundColor: rows.length === 0 ? 'rgba(100, 116, 139, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                color: rows.length === 0 ? '#64748b' : '#10b981',
                                border: `1px solid ${rows.length === 0 ? 'rgba(100, 116, 139, 0.2)' : 'rgba(16, 185, 129, 0.2)'}`,
                                borderRadius: '6px',
                                cursor: rows.length === 0 ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s',
                                opacity: rows.length === 0 ? 0.5 : 1
                            }}
                        >
                            <FileSpreadsheet size={14} />
                        </button>
                        <button
                            onClick={onClose}
                            title="Cerrar"
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: '28px', height: '28px',
                                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                color: '#ef4444',
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                {/* Content */}
                <div style={{ padding: '16px', overflowY: 'auto', flex: 1, background: 'var(--bg-color)' }}>
                    <DataTable
                        title="Detalle de Artefactos"
                        subtitle="Cálculo de Unidades de Equivalencia Hidráulica (UEH)"
                        columns={[
                            {
                                key: 'type',
                                header: 'Tipo Artefacto',
                                width: 'auto',
                                align: 'left',
                                format: (v: string, row: ArtifactRow) => (
                                    <div
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={(e) => e.stopPropagation()}
                                        style={{ position: 'relative', zIndex: 10 }}
                                    >
                                        <select
                                            value={v}
                                            onChange={(e) => handleUpdateRow(row.id, 'type', e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '6px 4px',
                                                background: 'var(--input-bg, #2a2a2a)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '4px',
                                                color: 'var(--text-main)',
                                                fontSize: '11px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <option value="" disabled>Seleccionar...</option>
                                            {Object.entries(NCH3371_TABLE_B1).map(([key, entry]) => (
                                                <option key={key} value={key}>{entry.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )
                            },
                            {
                                key: 'clase',
                                header: 'Clase',
                                width: 90,
                                align: 'center',
                                format: (v: number, row: ArtifactRow) => (
                                    <div
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={(e) => e.stopPropagation()}
                                        style={{ position: 'relative', zIndex: 10 }}
                                    >
                                        <select
                                            value={v}
                                            onChange={(e) => handleUpdateRow(row.id, 'clase', parseInt(e.target.value))}
                                            style={{
                                                width: '100%',
                                                padding: '6px 4px',
                                                background: 'var(--input-bg, #2a2a2a)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '4px',
                                                color: 'var(--text-main)',
                                                fontSize: '11px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {USAGE_CLASS_OPTIONS.map(c => (
                                                <option key={c} value={c}>Clase {c}</option>
                                            ))}
                                        </select>
                                    </div>
                                )
                            },
                            {
                                key: 'ueh',
                                header: 'UEH',
                                width: 60,
                                align: 'right',
                                format: (v: number) => <span style={{ fontWeight: 600, paddingRight: '4px' }}>{v || '—'}</span>
                            },
                            {
                                key: 'quantity',
                                header: 'Cant.',
                                width: 80,
                                align: 'center',
                                format: (v: number, row: ArtifactRow) => (
                                    <div onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                                        <input
                                            type="number"
                                            min="1"
                                            step="1"
                                            value={v}
                                            onChange={(e) => handleUpdateRow(row.id, 'quantity', parseInt(e.target.value) || 0)}
                                            style={{
                                                width: '100%',
                                                padding: '6px 4px',
                                                background: 'var(--input-bg, #2a2a2a)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '4px',
                                                color: 'var(--text-main)',
                                                fontSize: '11px',
                                                textAlign: 'center'
                                            }}
                                        />
                                    </div>
                                )
                            },
                            {
                                key: 'id',
                                header: '',
                                width: 40,
                                align: 'center',
                                format: (_: string, row: ArtifactRow) => (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteRow(row.id);
                                        }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            color: '#ef4444',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            padding: '4px',
                                            borderRadius: '4px'
                                        }}
                                        title="Eliminar fila"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                )
                            }
                        ]}
                        rows={rows}
                        rowKey={(r: ArtifactRow) => r.id}
                        density="compact"
                        maxHeight="350px"
                        emptyState="No hay artefactos definidos."
                    />

                    <div style={{ padding: '8px 0' }}>
                        <button
                            onClick={handleAddRow}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                background: 'rgba(59, 130, 246, 0.05)',
                                border: '1px dashed var(--accent)',
                                width: '100%',
                                padding: '10px',
                                justifyContent: 'center',
                                borderRadius: '6px',
                                color: 'var(--accent)',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                transition: 'all 0.2s'
                            }}
                        >
                            <Plus size={16} /> Agregar Artefacto
                        </button>
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '16px',
                    borderTop: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'var(--sidebar-bg)',
                    borderBottomLeftRadius: '8px',
                    borderBottomRightRadius: '8px'
                }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>
                        Total UEH: <span style={{ color: 'var(--accent)', fontSize: '1.2rem', fontWeight: 800, marginLeft: '8px' }}>{totalUEH.toFixed(2)}</span>
                        <span style={{ marginLeft: '12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Qww: {totalQww.toFixed(3)} l/s</span>
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                            onClick={onClose}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '4px',
                                border: '1px solid var(--border-color)',
                                background: 'transparent',
                                color: 'var(--text-main)',
                                cursor: 'pointer',
                                fontSize: '0.9rem'
                            }}
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            style={{
                                padding: '8px 20px',
                                borderRadius: '4px',
                                border: 'none',
                                background: 'var(--accent)',
                                color: 'white',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                fontSize: '0.9rem',
                                fontWeight: 700
                            }}
                        >
                            <Save size={16} /> Aplicar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
