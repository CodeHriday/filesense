// Node status styling utilities for visual mapping execution

export const getNodeStatusClass = (status) => {
  const statusClasses = {
    'pending': 'node-status-pending',
    'running': 'node-status-running',
    'completed': 'node-status-completed',
    'failed': 'node-status-failed',
    'skipped': 'node-status-skipped'
  };
  return statusClasses[status] || '';
};

export const getNodeStatusBadge = (status) => {
  if (!status) return null;
  
  const badges = {
    'pending': { text: 'Pending', icon: '○', color: '#666' },
    'running': { text: 'Running', icon: '⟳', color: '#025043' },
    'completed': { text: 'Complete', icon: '✓', color: '#0f9960' },
    'failed': { text: 'Failed', icon: '✗', color: '#d32f2f' },
    'skipped': { text: 'Skipped', icon: '⊘', color: '#999' }
  };
  
  return badges[status] || null;
};

export const formatRowCount = (count) => {
  if (!count && count !== 0) return '';
  if (count < 1000) return count.toString();
  if (count < 1000000) return `${(count / 1000).toFixed(1)}K`;
  if (count < 1000000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${(count / 1000000000).toFixed(1)}B`;
};
