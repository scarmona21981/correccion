import React from 'react';
import { X, Calculator, ArrowRight, Info } from 'lucide-react';
import { NormCheck } from '../../hydraulics/normativeEvaluationEngine';
import { HydraulicCalculationOutput } from '../../hydraulics/hydraulicCalculationEngine';
import MathFormula from '../ui/MathFormula';

interface TraceStepData {
  id: string;
  label: string;
  method: string;
  formula?: string;
  inputs: Record<string, number | string | null>;
  intermediates?: Record<string, number | string | null>;
  outputs: Record<string, number | string | null>;
  normRef: {
    code: string;
    clause?: string;
    annex?: string;
    table?: string;
  };
}

interface CalcTraceDrawerProps {
  open: boolean;
  onClose: () => void;
  check: NormCheck | null;
  calculation: HydraulicCalculationOutput | null;
  tramoId: string;
  rol: string;
  embedded?: boolean;
}

interface CheckTracePayload {
  formula: string;
  description: string;
  inputs: Record<string, number | string>;
  result: number | string;
}

const DRAWER_COLORS = {
  overlay: 'rgba(0, 0, 0, 0.6)',
  background: 'var(--surface)',
  header: 'var(--table-header-bg)',
  cardBg: 'var(--surface-elevated)',
  border: 'var(--border)',
  text: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  pass: 'var(--success)',
  fail: 'var(--danger)',
  warn: 'var(--warning)',
  info: 'var(--info)'
};

const CHECK_STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  PASS: { bg: 'var(--badge-success-bg)', text: 'var(--badge-success-text)', border: 'var(--success)' },
  FAIL: { bg: 'var(--badge-error-bg)', text: 'var(--badge-error-text)', border: 'var(--danger)' },
  INFO: { bg: 'var(--badge-info-bg)', text: 'var(--badge-info-text)', border: 'var(--info)' }
};

function formatValue(value: number | string | null | undefined, unit?: string): string {
  if (value === null || value === undefined || value === '') return '—';

  if (typeof value === 'number') {
    let formatted: string;
    if (unit === 'L/s' || unit === 'm/s') {
      formatted = value.toFixed(2);
    } else if (unit === '%') {
      formatted = value.toFixed(2);
    } else if (Math.abs(value) < 0.01 && value !== 0) {
      formatted = value.toExponential(2);
    } else if (Number.isInteger(value)) {
      formatted = value.toString();
    } else {
      formatted = value.toFixed(3);
    }
    return unit ? `${formatted} ${unit}` : formatted;
  }

  return String(value);
}

function parseNormRef(norma: string): { code: string; annex?: string; clause?: string; table?: string } {
  const result: { code: string; annex?: string; clause?: string; table?: string } = { code: '' };

  const nchMatch = norma.match(/NCh\d+/i);
  if (nchMatch) {
    result.code = nchMatch[0];
  }

  const annexMatch = norma.match(/Anexo\s+([A-Z])/i);
  if (annexMatch) {
    result.annex = `Anexo ${annexMatch[1]}`;
  }

  const tableMatch = norma.match(/Tabla\s+([A-Z]?\d+\.?\d*)/i);
  if (tableMatch) {
    result.table = `Tabla ${tableMatch[1]}`;
  }

  const clauseMatch = norma.match(/(\d+\.\d+\.?\d*)/);
  if (clauseMatch) {
    result.clause = clauseMatch[1];
  }

  return result;
}

function buildTraceSteps(check: NormCheck, calculation: HydraulicCalculationOutput | null, rol: string): TraceStepData[] {
  const steps: TraceStepData[] = [];
  const normaUpper = String(check.norma || '').toUpperCase();
  const isNCh1105Check = normaUpper.includes('NCH1105');

  const checkTrace = (check as NormCheck & { trace?: CheckTracePayload }).trace;
  if (checkTrace) {
    steps.push({
      id: `step_trace_${check.id.toLowerCase()}`,
      label: check.titulo,
      method: checkTrace.description || 'Trazabilidad normativa',
      formula: checkTrace.formula,
      inputs: checkTrace.inputs || {},
      outputs: {
        Resultado: checkTrace.result,
        Estado: check.estado
      },
      normRef: parseNormRef(check.norma)
    });

    return steps;
  }

  if (!calculation) return steps;

  const { inputs, flows, hydraulicResults } = calculation;

  if (check.id === 'UEH_TABLA_A3') {
    steps.push({
      id: 'step_ueh_capacity',
      label: 'Capacidad por Tabla A.3',
      method: rol === 'COLECTOR_EXTERIOR' ? 'UEH vs Tabla A.3' : 'Verificación tabular (NCh3371 Anexo A)',
      formula: 'UEH_{tramo} \\le UEH_{max} (Tabla A.3)',
      inputs: {
        UEH_acumuladas: inputs.uehAcumuladas || 0,
        DN: inputs.dn_mm,
        Pendiente: inputs.pendiente_porcentaje
      },
      outputs: {
        UEH_max_tabla: flows.UEH || '—',
        Q_disenio: flows.Q_diseno_Ls
      },
      normRef: parseNormRef(check.norma)
    });
  }

  if (check.id === 'CAPACIDAD' && isNCh1105Check) {
    steps.push({
      id: 'step_capacity_full',
      label: 'Capacidad hidráulica (sección llena)',
      method: 'Manning - Sección llena',
      formula: 'Q_{cap} = \\frac{1}{n} \\cdot A \\cdot R^{2/3} \\cdot S^{1/2}',
      inputs: {
        n_Manning: inputs.n_manning || 0.013,
        DN: inputs.dn_mm,
        DI_mm: inputs.dn_mm,
        Pendiente: inputs.pendiente_porcentaje
      },
      outputs: {
        Q_capacidad: hydraulicResults.qFullCapacity_Ls,
        V_llena: hydraulicResults.vFull_m_s
      },
      normRef: { code: 'NCh1105:2019', clause: '6.10' }
    });
  }

  if (isNCh1105Check && (check.id === 'H_D' || check.id === 'VELOCIDAD_MIN' || check.id === 'VELOCIDAD_MAX')) {
    steps.push({
      id: 'step_hydraulic_results',
      label: 'Resultados hidráulicos',
      method: 'Cálculo Manning',
      formula: 'V = Q / A; \\text{y/D iterado}',
      inputs: {
        Q_disenio: flows.Q_diseno_Ls,
        n_Manning: inputs.n_manning || 0.013,
        DN: inputs.dn_mm,
        Pendiente: inputs.pendiente_porcentaje
      },
      outputs: {
        V: hydraulicResults.velocidad_ms,
        yD: hydraulicResults.alturaRelativa,
        Regimen: hydraulicResults.regimen
      },
      normRef: parseNormRef(check.norma)
    });
  }

  if (check.id === 'DN_MIN') {
    steps.push({
      id: 'step_dn_min',
      label: 'Diámetro mínimo',
      method: 'Verificación normativa',
      inputs: {
        DN_instalado: inputs.dn_mm,
        Material: inputs.material
      },
      outputs: {
        DN_minimo: rol === 'COLECTOR_EXTERIOR' ? 200 : 100
      },
      normRef: parseNormRef(check.norma)
    });
  }

  if (check.id === 'PENDIENTE_MIN') {
    steps.push({
      id: 'step_slope_min',
      label: 'Pendiente mínima',
      method: 'Verificación normativa',
      inputs: {
        Pendiente_instalada: inputs.pendiente_porcentaje,
        DN: inputs.dn_mm
      },
      outputs: {
        Pendiente_minima: rol === 'COLECTOR_EXTERIOR' ? 0.5 : 1.0
      },
      normRef: parseNormRef(check.norma)
    });
  }

  if (steps.length === 0) {
    steps.push({
      id: 'step_generic',
      label: check.titulo,
      method: 'Verificación normativa',
      inputs: {
        DN: inputs.dn_mm,
        Pendiente: inputs.pendiente_porcentaje,
        UEH: inputs.uehAcumuladas || 0,
        Q: flows.Q_diseno_Ls
      },
      outputs: {
        Estado: check.estado
      },
      normRef: parseNormRef(check.norma)
    });
  }

  return steps;
}

const KeyValueRow: React.FC<{ label: string; value: string | number | null | undefined }> = ({ label, value }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
    borderBottom: `1px solid ${DRAWER_COLORS.border}20`
  }}>
    <span style={{ color: DRAWER_COLORS.textSecondary, fontSize: '0.75rem', fontWeight: 500 }}>
      {label}
    </span>
    <span style={{ color: DRAWER_COLORS.text, fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 600 }}>
      {formatValue(value)}
    </span>
  </div>
);

const ValueBlock: React.FC<{ title: string; values: Record<string, number | string | null | undefined> }> = ({ title, values }) => {
  const entries = Object.entries(values).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) return null;

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{
        fontSize: '0.65rem',
        fontWeight: 800,
        color: DRAWER_COLORS.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginBottom: '8px',
        opacity: 0.7
      }}>
        {title}
      </div>
      <div style={{
        background: 'rgba(15, 23, 42, 0.4)',
        borderRadius: '10px',
        padding: '10px 14px',
        border: `1px solid ${DRAWER_COLORS.border}`
      }}>
        {entries.map(([key, val]) => (
          <KeyValueRow key={key} label={key} value={val} />
        ))}
      </div>
    </div>
  );
};

const TraceStepCard: React.FC<{ step: TraceStepData }> = ({ step }) => (
  <div className="trace-step-modern-card" style={{
    background: DRAWER_COLORS.cardBg,
    borderRadius: '16px',
    padding: '24px',
    marginBottom: '20px',
    border: `1px solid ${DRAWER_COLORS.border}`,
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
  }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)' }}></div>
        <span style={{ color: DRAWER_COLORS.text, fontWeight: 700, fontSize: '0.95rem' }}>
          {step.label}
        </span>
      </div>
      <span style={{
        fontSize: '0.65rem',
        background: 'var(--accent-soft)',
        color: 'var(--accent)',
        padding: '2px 10px',
        borderRadius: '100px',
        fontWeight: 700,
        textTransform: 'uppercase'
      }}>
        {step.method}
      </span>
    </div>

    {step.formula && (
      <div style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))',
        borderRadius: '12px',
        padding: '18px',
        marginBottom: '20px',
        border: '1px solid rgba(255,255,255,0.1)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: 'var(--accent)' }}></div>
        <MathFormula latex={step.formula} block={true} />
      </div>
    )}

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
      {step.inputs && Object.keys(step.inputs).length > 0 && (
        <ValueBlock title="Entradas" values={step.inputs} />
      )}

      {step.outputs && Object.keys(step.outputs).length > 0 && (
        <ValueBlock title="Resultados" values={step.outputs} />
      )}
    </div>

    {step.intermediates && Object.keys(step.intermediates).length > 0 && (
      <ValueBlock title="Cálculos Intermedios" values={step.intermediates} />
    )}

    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginTop: '12px',
      paddingTop: '12px',
      borderTop: `1px solid ${DRAWER_COLORS.border}40`
    }}>
      <Info size={12} color={DRAWER_COLORS.textSecondary} />
      <span style={{ color: DRAWER_COLORS.textSecondary, fontSize: '0.65rem', fontWeight: 600 }}>
        REFERENCIA NORMATIVA:
      </span>
      <span style={{ color: DRAWER_COLORS.textSecondary, fontSize: '0.65rem', fontFamily: 'monospace' }}>
        {step.normRef.code}
        {step.normRef.annex && ` – ${step.normRef.annex}`}
        {step.normRef.table && ` – ${step.normRef.table}`}
        {step.normRef.clause && ` – ${step.normRef.clause}`}
      </span>
    </div>
  </div>
);

export const CalcTraceDrawer: React.FC<CalcTraceDrawerProps> = ({
  open,
  onClose,
  check,
  calculation,
  tramoId,
  rol,
  embedded = false
}) => {
  if (!check) {
    return embedded ? (
      <div className="results-empty-state">Sin trazas disponibles para este tramo.</div>
    ) : null;
  }

  if (!embedded && !open) return null;

  const statusColors = CHECK_STATUS_COLORS[check.estado] || CHECK_STATUS_COLORS.INFO;
  const traceSteps = buildTraceSteps(check, calculation, rol);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (embedded) return;
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const content = (
    <div style={{
      width: embedded ? '100%' : '520px',
      maxWidth: embedded ? '100%' : '95vw',
      height: '100%',
      background: DRAWER_COLORS.background,
      display: 'flex',
      flexDirection: 'column',
      border: embedded ? `1px solid ${DRAWER_COLORS.border}` : 'none',
      borderRadius: embedded ? '10px' : 0,
      boxShadow: embedded ? 'var(--shadow-sm)' : '-4px 0 20px rgba(0,0,0,0.5)',
      animation: embedded ? undefined : 'slideIn 0.25s ease-out'
    }}>
      {!embedded && (
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideIn {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
          .trace-step-modern-card .katex { color: var(--text-primary); font-size: 1.15rem; }
          .trace-step-modern-card .katex-display { margin: 0; }
        `}</style>
      )}

      <div style={{
        padding: '16px',
        borderBottom: `1px solid ${DRAWER_COLORS.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: DRAWER_COLORS.header
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Calculator size={18} color={DRAWER_COLORS.textSecondary} />
          <span style={{ color: DRAWER_COLORS.text, fontWeight: 600, fontSize: '0.9rem' }}>
            Memoria de Cálculo
          </span>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 8px',
            borderRadius: '4px',
            background: statusColors.bg,
            color: statusColors.text,
            border: `1px solid ${statusColors.border}`,
            fontSize: '0.7rem',
            fontWeight: 700,
            textTransform: 'uppercase'
          }}>
            {check.estado}
          </span>
        </div>
        {!embedded && (
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: DRAWER_COLORS.textSecondary,
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} />
          </button>
        )}
      </div>

      <div style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${DRAWER_COLORS.border}`,
        background: DRAWER_COLORS.cardBg
      }}>
        <div style={{ color: DRAWER_COLORS.text, fontWeight: 600, fontSize: '0.85rem', marginBottom: '4px' }}>
          {check.titulo}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <span style={{ color: DRAWER_COLORS.textSecondary, fontSize: '0.7rem', fontWeight: 600 }}>
            TRAMO: <span style={{ color: 'var(--accent)' }}>{tramoId}</span>
          </span>
          <span style={{ color: DRAWER_COLORS.textSecondary, fontSize: '0.7rem', fontWeight: 600 }}>
            ROL: <span style={{ color: DRAWER_COLORS.text }}>{rol.replace('_', ' ')}</span>
          </span>
        </div>
      </div>

      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '16px'
      }}>
        <div style={{
          fontSize: '0.7rem',
          fontWeight: 700,
          color: DRAWER_COLORS.textSecondary,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <ArrowRight size={12} />
          Pasos de verificación
        </div>

        {traceSteps.length > 0 ? (
          traceSteps.map((step) => (
            <TraceStepCard key={step.id} step={step} />
          ))
        ) : (
          <div style={{
            textAlign: 'center',
            padding: '24px',
            color: DRAWER_COLORS.textSecondary,
            fontSize: '0.8rem'
          }}>
            Sin trazabilidad disponible para este check
          </div>
        )}
      </div>

      {!embedded && (
        <div style={{
          padding: '12px 16px',
          borderTop: `1px solid ${DRAWER_COLORS.border}`,
          display: 'flex',
          justifyContent: 'flex-end',
          background: DRAWER_COLORS.header
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Cerrar
          </button>
        </div>
      )}
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <div
      className="trace-drawer-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: DRAWER_COLORS.overlay,
        display: 'flex',
        justifyContent: 'flex-end',
        zIndex: 1000,
        animation: 'fadeIn 0.2s ease-out',
        backdropFilter: 'blur(4px)'
      }}
      onClick={handleOverlayClick}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      tabIndex={-1}
    >
      {content}
    </div>
  );
};
