import { useMemo, CSSProperties } from 'react';

export const useThemeStyles = () => {
  const colors = useMemo(() => ({
    bg: 'var(--bg)',
    surface: 'var(--surface)',
    surfaceElevated: 'var(--surface-elevated)',
    border: 'var(--border)',
    textPrimary: 'var(--text-primary)',
    textSecondary: 'var(--text-secondary)',
    textMuted: 'var(--text-muted)',
    accent: 'var(--accent)',
    accentSoft: 'var(--accent-soft)',
    accentHover: 'var(--accent-hover)',
    accentGlow: 'var(--accent-glow)',
    success: 'var(--success)',
    warning: 'var(--warning)',
    danger: 'var(--danger)',
    info: 'var(--info)',
    hoverBg: 'var(--hover-bg)',
    activeBg: 'var(--active-bg)',
    canvasBg: 'var(--canvas-bg)',
    gridColor: 'var(--grid-color)',
  }), []);

  const semantic = useMemo(() => ({
    white: '#ffffff',
    black: '#000000',
    success: 'var(--success)',
    successBg: 'var(--success-bg)',
    successBorder: 'var(--success-border)',
    error: 'var(--danger)',
    errorBg: 'var(--error-bg)',
    errorBorder: 'var(--error-border)',
    warning: 'var(--warning)',
    warningBg: 'var(--warning-bg)',
    warningBorder: 'var(--warning-border)',
    info: 'var(--info)',
    infoBg: 'var(--info-bg)',
    infoBorder: 'var(--info-border)',
    muted: 'var(--text-muted)',
    light: 'var(--text-secondary)',
    darker: 'var(--text-primary)',
  }), []);

  const pipeColors = useMemo(() => ({
    default: 'var(--pipe-default)',
    selected: 'var(--pipe-selected)',
    active: 'var(--success)',
    warning: 'var(--warning)',
  }), []);

  const nodeColors = useMemo(() => ({
    default: 'var(--node-default)',
    selected: 'var(--node-selected)',
    active: 'var(--warning)',
  }), []);

  const container = (bg?: string): CSSProperties => ({
    background: bg || colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
  });

  const section = (padding = '12px'): CSSProperties => ({
    padding,
    background: colors.surfaceElevated,
    borderBottom: `1px solid ${colors.border}`,
  });

  const input = (options?: { error?: boolean; warning?: boolean }): CSSProperties => {
    let border = colors.border;
    let bg = colors.bg;
    
    if (options?.error) {
      border = semantic.error;
      bg = semantic.errorBg;
    } else if (options?.warning) {
      border = semantic.warning;
      bg = semantic.warningBg;
    }
    
    return {
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: '4px',
      padding: '4px 8px',
      color: colors.textPrimary,
      fontSize: '0.8rem',
    };
  };

  const button = (variant: 'primary' | 'secondary' | 'ghost' | 'danger' = 'primary'): CSSProperties => {
    const variants: Record<string, CSSProperties> = {
      primary: {
        background: colors.accent,
        color: semantic.white,
        border: 'none',
      },
      secondary: {
        background: colors.surfaceElevated,
        color: colors.textPrimary,
        border: `1px solid ${colors.border}`,
      },
      ghost: {
        background: 'transparent',
        color: colors.textSecondary,
        border: colors.border,
      },
      danger: {
        background: semantic.error,
        color: semantic.white,
        border: 'none',
      },
    };
    return {
      ...variants[variant],
      borderRadius: '6px',
      padding: '6px 12px',
      fontSize: '0.8rem',
      fontWeight: 600,
      cursor: 'pointer',
    };
  };

  const badge = (type: 'success' | 'error' | 'warning' | 'info' | 'neutral' = 'neutral'): CSSProperties => {
    const map: Record<string, { bg: string; color: string; border: string }> = {
      success: { bg: semantic.successBg, color: semantic.success, border: semantic.successBorder },
      error: { bg: semantic.errorBg, color: semantic.error, border: semantic.errorBorder },
      warning: { bg: semantic.warningBg, color: semantic.warning, border: semantic.warningBorder },
      info: { bg: semantic.infoBg, color: semantic.info, border: semantic.infoBorder },
      neutral: { bg: 'transparent', color: semantic.muted, border: colors.border },
    };
    const style = map[type];
    return {
      background: style.bg,
      color: style.color,
      border: `1px solid ${style.border}`,
      borderRadius: '4px',
      padding: '2px 6px',
      fontSize: '0.7rem',
      fontWeight: 600,
    };
  };

  const label = (variant: 'primary' | 'secondary' | 'muted' | 'accent' = 'primary'): CSSProperties => {
    const map: Record<string, CSSProperties> = {
      primary: { color: colors.textPrimary, fontSize: '0.9rem', fontWeight: 600 },
      secondary: { color: colors.textSecondary, fontSize: '0.75rem' },
      muted: { color: colors.textMuted, fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' },
      accent: { color: colors.accent, fontSize: '0.8rem', fontWeight: 600 },
    };
    return map[variant];
  };

  const card = (elevated = false): CSSProperties => ({
    background: elevated ? colors.surfaceElevated : colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    padding: '12px',
  });

  const formGroup = (error?: boolean, warning?: boolean): CSSProperties => {
    let borderColor = colors.border;
    let bgColor = colors.bg;
    
    if (error) {
      borderColor = semantic.error;
      bgColor = semantic.errorBg;
    } else if (warning) {
      borderColor = semantic.warning;
      bgColor = semantic.warningBg;
    }
    
    return {
      border: `1px solid ${borderColor}`,
      background: bgColor,
      color: colors.textPrimary,
      borderRadius: '4px',
      padding: '4px 8px',
    };
  };

  const divider = (): CSSProperties => ({
    height: '1px',
    background: colors.border,
    margin: '8px 0',
  });

  const iconButton = (active = false): CSSProperties => ({
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    border: active ? `1px solid ${colors.accent}` : `1px solid ${colors.border}`,
    background: active ? colors.accentSoft : 'transparent',
    color: active ? colors.accent : colors.textMuted,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  });

  const tooltip = (): CSSProperties => ({
    background: colors.surfaceElevated,
    color: colors.textPrimary,
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '0.7rem',
    fontWeight: 600,
    boxShadow: 'var(--shadow-md)',
    border: `1px solid ${colors.border}`,
  });

  return {
    colors,
    semantic,
    pipeColors,
    nodeColors,
    container,
    section,
    input,
    button,
    badge,
    label,
    card,
    formGroup,
    divider,
    iconButton,
    tooltip,
  };
};

export type ThemeStyles = ReturnType<typeof useThemeStyles>;