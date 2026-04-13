import { useTheme } from './ThemeProvider';

export function useThemeStyle() {
  const { theme } = useTheme();
  
  const getColor = (colorVar: string): string => {
    if (typeof window === 'undefined') return colorVar;
    const root = document.documentElement;
    const computed = getComputedStyle(root).getPropertyValue(colorVar).trim();
    return computed || colorVar;
  };
  
  const getColorVar = (colorVar: string): string => {
    return `var(${colorVar})`;
  };

  return {
    theme,
    
    bg: getColorVar('--bg'),
    surface: getColorVar('--surface'),
    surfaceElevated: getColorVar('--surface-elevated'),
    border: getColorVar('--border'),
    
    textPrimary: getColorVar('--text-primary'),
    textSecondary: getColorVar('--text-secondary'),
    textMuted: getColorVar('--text-muted'),
    
    accent: getColorVar('--accent'),
    accentSoft: getColorVar('--accent-soft'),
    accentHover: getColorVar('--accent-hover'),
    accentGlow: getColorVar('--accent-glow'),
    
    success: getColorVar('--success'),
    warning: getColorVar('--warning'),
    danger: getColorVar('--danger'),
    info: getColorVar('--info'),
    
    hoverBg: getColorVar('--hover-bg'),
    activeBg: getColorVar('--active-bg'),
    
    canvasBg: getColorVar('--canvas-bg'),
    gridColor: getColorVar('--grid-color'),
    
    pipeDefault: getColorVar('--pipe-default'),
    pipeSelected: getColorVar('--pipe-selected'),
    nodeDefault: getColorVar('--node-default'),
    nodeSelected: getColorVar('--node-selected'),
    
    scrollbarTrack: getColorVar('--scrollbar-track'),
    scrollbarThumb: getColorVar('--scrollbar-thumb'),
    
    badgeSuccessBg: getColorVar('--badge-success-bg'),
    badgeSuccessText: getColorVar('--badge-success-text'),
    badgeErrorBg: getColorVar('--badge-error-bg'),
    badgeErrorText: getColorVar('--badge-error-text'),
    badgeWarningBg: getColorVar('--badge-warning-bg'),
    badgeWarningText: getColorVar('--badge-warning-text'),
    badgeInfoBg: getColorVar('--badge-info-bg'),
    badgeInfoText: getColorVar('--badge-info-text'),
  };
}

export const themeStyles = {
  appContainer: {
    background: 'var(--bg)',
  },
  
  header: {
    background: 'var(--surface)',
    borderBottom: '1px solid var(--border)',
  },
  
  workspace: {
    background: 'var(--canvas-bg)',
  },
  
  sidebar: {
    background: 'var(--surface)',
    borderRight: '1px solid var(--border)',
  },
  
  resultsDock: {
    background: 'var(--surface)',
    borderLeft: '1px solid var(--border)',
  },
  
  modal: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
  },
  
  button: {
    primary: {
      background: 'var(--accent)',
      color: '#ffffff',
      border: 'none',
    },
    secondary: {
      background: 'var(--surface-elevated)',
      color: 'var(--text-primary)',
      border: '1px solid var(--border)',
    },
  },
  
  input: {
    background: 'var(--bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
  },
  
  table: {
    headerBg: 'var(--table-header-bg)',
    rowHover: 'var(--table-row-hover)',
    rowSelected: 'var(--table-row-selected)',
  },
  
  pipe: {
    default: 'var(--pipe-default)',
    selected: 'var(--pipe-selected)',
  },
  
  node: {
    default: 'var(--node-default)',
    selected: 'var(--node-selected)',
  },
};