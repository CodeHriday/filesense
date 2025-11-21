export const COLORS = {
  primary: '#2563EB',
  success: '#16A34A',
  warning: '#F59E0B',
  danger: '#DC2626',
  
  teal: '#0EA5E9',
  purple: '#8B5CF6',
  cyan: '#06B6D4',
  
  neutralBg: '#F8FAFC',
  textPrimary: '#0F172A',
  textSecondary: '#6B7280',
};

export const STATUS_COLORS = {
  excellent: COLORS.success,
  good: COLORS.primary,
  warning: COLORS.warning,
  critical: COLORS.danger,
};

export const PILLAR_GRADIENTS = {
  dataHealth: 'linear-gradient(135deg, #16A34A 0%, #22C55E 100%)',
  pipelineReliability: 'linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)',
  governance: 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)',
  automation: 'linear-gradient(135deg, #0EA5E9 0%, #38BDF8 100%)',
};

export const getStatusColor = (status) => {
  return STATUS_COLORS[status] || COLORS.primary;
};
