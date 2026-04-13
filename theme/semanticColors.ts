export const SemanticColors = {
  success: {
    primary: '#10b981',
    light: '#22c55e',
    muted: '#059669',
  },
  error: {
    primary: '#ef4444',
    light: '#dc2626',
    dark: '#b91c1c',
  },
  warning: {
    primary: '#f59e0b',
    light: '#fbbf24',
    amber: '#d97706',
  },
  info: {
    primary: '#3b82f6',
    light: '#60a5fa',
    cyan: '#06b6d4',
  },
  neutral: {
    gray: '#64748b',
    slate: '#94a3b8',
    dark: '#475569',
  },
  accent: {
    blue: '#3b82f6',
    purple: '#8b5cf6',
    cyan: '#06b6d4',
    orange: '#f97316',
  },
  pipe: {
    default: '#4b5563',
    selected: '#3b82f6',
    active: '#10b981',
  },
  node: {
    default: '#60a5fa',
    selected: '#ffffff',
    active: '#f59e0b',
  },
  systemPalette: [
    '#3b82f6',
    '#10b981',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#06b6d4',
    '#f97316',
    '#22c55e',
  ],
} as const;

export const themeAware = {
  success: 'var(--success)',
  error: 'var(--danger)',
  warning: 'var(--warning)',
  info: 'var(--info)',
  accent: 'var(--accent)',
  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
  surface: 'var(--surface)',
  surfaceElevated: 'var(--surface-elevated)',
  border: 'var(--border)',
  hoverBg: 'var(--hover-bg)',
  activeBg: 'var(--active-bg)',
};

export type SemanticColorKey = keyof typeof SemanticColors;