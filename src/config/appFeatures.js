// Shared application features configuration
// Used by both RoleManagement and Sidebar for consistent permission handling

import {
  FiHome,
  FiUpload,
  FiDatabase,
  FiLink,
  FiLayers,
  FiGitBranch,
  FiCalendar,
  FiGrid,
  FiPlay,
  FiMonitor,
  FiAlertTriangle,
  FiTrendingUp,
  FiShield,
  FiTag,
  FiUsers,
  FiFileText,
  FiSettings,
  FiMessageSquare,
  FiBookOpen,
  FiBriefcase,
  FiTruck,
  FiCheckCircle
} from 'react-icons/fi';

export const APP_FEATURES = [
  // Project & File Management
  { 
    id: 'dashboard', 
    name: 'Dashboard', 
    category: 'Project & File Management',
    icon: FiHome,
    route: '/',
    showInSidebar: true
  },
  { 
    id: 'projects', 
    name: 'Projects', 
    category: 'Project & File Management',
    icon: FiBriefcase,
    route: '/project-management',
    showInSidebar: true
  },
  { 
    id: 'access_groups', 
    name: 'Access Groups', 
    category: 'Project & File Management',
    icon: FiUsers,
    route: '/group-management',
    showInSidebar: true
  },
  { 
    id: 'file_upload', 
    name: 'File Upload & Profile', 
    category: 'Project & File Management',
    icon: FiUpload,
    route: '/upload',
    showInSidebar: false
  },
  { 
    id: 'file_drop', 
    name: 'Drop File', 
    category: 'Project & File Management',
    icon: FiDatabase,
    route: '/drop',
    showInSidebar: false // Not shown in sidebar
  },
  { 
    id: 'file_catalog', 
    name: 'File Catalog', 
    category: 'Project & File Management',
    icon: FiDatabase,
    route: '/file-catalog',
    showInSidebar: true
  },
  { 
    id: 'file_profile', 
    name: 'Data Profile', 
    category: 'Project & File Management', 
    parentId: 'file_catalog', 
    isNested: true,
    icon: null,
    route: null,
    showInSidebar: false // Accessed via file catalog
  },
  { 
    id: 'file_preview', 
    name: 'Data Preview', 
    category: 'Project & File Management', 
    parentId: 'file_catalog', 
    isNested: true,
    icon: null,
    route: null,
    showInSidebar: false // Accessed via file catalog
  },
  
  // Process Management
  { 
    id: 'connection', 
    name: 'Connections', 
    category: 'Process Management', 
    supportsExecute: true,
    icon: FiDatabase,
    route: '/connections',
    showInSidebar: true
  },
  { 
    id: 'transformation', 
    name: 'Mappings', 
    category: 'Process Management', 
    supportsExecute: true,
    icon: FiLink,
    route: '/mappings',
    showInSidebar: true
  },
  { 
    id: 'mapping_group', 
    name: 'Batch Groups', 
    category: 'Process Management', 
    supportsExecute: true,
    icon: FiLayers,
    route: '/mapping-groups',
    showInSidebar: true
  },
  { 
    id: 'workflow', 
    name: 'Workflows', 
    category: 'Process Management', 
    supportsExecute: true,
    icon: FiGitBranch,
    route: '/workflows',
    showInSidebar: true
  },
  { 
    id: 'schedule', 
    name: 'ETL Scheduler', 
    category: 'Process Management', 
    supportsExecute: true,
    icon: FiCalendar,
    route: '/etl-scheduler',
    showInSidebar: true
  },
  
  // Jobs and Monitoring
  { 
    id: 'jobs', 
    name: 'Jobs', 
    category: 'Jobs and Monitoring',
    icon: FiPlay,
    route: '/jobs',
    showInSidebar: true
  },
  { 
    id: 'monitor', 
    name: 'Monitor', 
    category: 'Jobs and Monitoring',
    icon: FiMonitor,
    route: '/monitor',
    showInSidebar: true
  },
  { 
    id: 'transformation_catalog', 
    name: 'Transformation File Catalog', 
    category: 'Jobs and Monitoring',
    icon: FiFileText,
    route: '/transformation-catalog',
    showInSidebar: true
  },
  { 
    id: 'alerts', 
    name: 'Alerts', 
    category: 'Jobs and Monitoring',
    icon: FiAlertTriangle,
    route: '/alerts',
    showInSidebar: true
  },
  { 
    id: 'file_insights', 
    name: 'File Insights', 
    category: 'Jobs and Monitoring',
    icon: FiTrendingUp,
    route: '/file-insights',
    showInSidebar: true
  },
  
  // Governance
  { 
    id: 'lineage', 
    name: 'File Lineage', 
    category: 'Governance',
    icon: FiGitBranch,
    route: '/lineage',
    showInSidebar: true
  },
  { 
    id: 'policies', 
    name: 'Policies', 
    category: 'Governance',
    icon: FiShield,
    route: '/policy-management',
    showInSidebar: true
  },
  { 
    id: 'tags', 
    name: 'Tags', 
    category: 'Governance',
    icon: FiTag,
    route: '/tag-management',
    showInSidebar: true
  },
  
  // Administration
  { 
    id: 'users', 
    name: 'User Management', 
    category: 'Administration',
    icon: FiUsers,
    route: '/users',
    showInSidebar: true
  },
  { 
    id: 'roles', 
    name: 'Role Management', 
    category: 'Administration',
    icon: FiShield,
    route: '/roles',
    showInSidebar: true
  },
  { 
    id: 'vendor_management', 
    name: 'Vendor Management', 
    category: 'Administration',
    icon: FiTruck,
    route: null,
    showInSidebar: true,
    isCollapsible: true,
    children: [
      {
        id: 'vendor_connections',
        name: 'Vendor Connections',
        parentId: 'vendor_management',
        category: 'Administration',
        icon: null,
        route: '/connections?type=vendor',
        showInSidebar: true
      },
      {
        id: 'vendor_details',
        name: 'Vendor Details',
        parentId: 'vendor_management',
        category: 'Administration',
        icon: null,
        route: '/vendor-management',
        showInSidebar: true
      },
      {
        id: 'vendor_agreements',
        name: 'Vendor Agreements',
        parentId: 'vendor_management',
        category: 'Administration',
        icon: null,
        route: '/vendor-agreements',
        showInSidebar: true
      }
    ]
  },
  { 
    id: 'system_cleanup', 
    name: 'System Cleanup', 
    category: 'Administration',
    icon: FiSettings,
    route: '/system-cleanup',
    showInSidebar: true
  },
  { 
    id: 'audit_trail', 
    name: 'Audit Trail', 
    category: 'Administration',
    icon: FiFileText,
    route: '/audit-trail',
    showInSidebar: true
  },
  { 
    id: 'settings', 
    name: 'Dashboard Settings', 
    category: 'Administration',
    icon: FiSettings,
    route: '/dashboard-settings',
    showInSidebar: true
  },
  
  // Insights
  { 
    id: 'recommendations', 
    name: 'Recommendations', 
    category: 'Insights',
    icon: FiTrendingUp,
    route: '/recommendations',
    showInSidebar: true
  },
  { 
    id: 'insights', 
    name: 'All Insights', 
    category: 'Insights',
    icon: FiMessageSquare,
    route: '/insights',
    showInSidebar: true
  },
  { 
    id: 'stories', 
    name: 'Data Stories', 
    category: 'Insights',
    icon: FiBookOpen,
    route: '/stories',
    showInSidebar: true
  }
];

// Category display names and ordering
export const FEATURE_CATEGORIES_ORDER = [
  'Project & File Management',
  'Process Management',
  'Jobs and Monitoring',
  'Governance',
  'Administration',
  'Insights'
];

// Group features by category (used by RoleManagement)
export const FEATURE_CATEGORIES = APP_FEATURES.reduce((acc, feature) => {
  if (!acc[feature.category]) {
    acc[feature.category] = [];
  }
  acc[feature.category].push(feature);
  return acc;
}, {});

// Get sidebar display name for category
export const getSidebarCategoryName = (category) => {
  const mapping = {
    'Project & File Management': 'Ad Hoc Process',
    'Process Management': 'Process Management',
    'Jobs and Monitoring': 'Jobs and Monitoring',
    'Governance': 'Data Governance',
    'Administration': 'Administration',
    'Insights': 'Insights'
  };
  return mapping[category] || category;
};
