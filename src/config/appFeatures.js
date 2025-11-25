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
  FiXCircle,
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
  FiCheckCircle,
  FiArchive,
  FiKey
} from 'react-icons/fi';

export const APP_FEATURES = [
  // Project & File Management
  { 
    id: 'dashboard', 
    name: 'Dashboard', 
    category: 'Project & File Management',
    icon: FiHome,
    route: '/',
    showInSidebar: false
  },
  { 
    id: 'projects', 
    name: 'Projects', 
    category: 'Project & File Management',
    icon: FiBriefcase,
    route: '/projects',
    showInSidebar: true
  },
  { 
    id: 'vendor_file_upload', 
    name: 'Vendor File Upload', 
    category: 'Project & File Management',
    icon: FiUpload,
    route: '/vendor-file-upload',
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
    category: 'Catalogs',
    icon: FiDatabase,
    route: '/file-catalog',
    showInSidebar: true
  },
  { 
    id: 'processed_catalog', 
    name: 'Processed File Catalog', 
    category: 'Catalogs',
    icon: FiFileText,
    route: '/processed-catalog',
    showInSidebar: true
  },
  { 
    id: 'vendor_file_quality', 
    name: 'Vendor File Catalog', 
    category: 'Catalogs',
    icon: FiCheckCircle,
    route: '/vendor-file-quality',
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
  
  // Archived
  { 
    id: 'transformation', 
    name: 'Mapping Jobs', 
    category: 'Archived', 
    supportsExecute: true,
    icon: FiLink,
    route: '/mappings',
    showInSidebar: true
  },
  
  // Job Design
  { 
    id: 'quality_rules', 
    name: 'Quality Rules', 
    category: 'Job Design',
    icon: FiAlertTriangle,
    route: '/quality-rules',
    showInSidebar: true
  },
  { 
    id: 'visual_mapping_orchestrator', 
    name: 'Visual Mapping Designer', 
    category: 'Job Design',
    supportsExecute: true,
    icon: FiGrid,
    route: '/visual-mappings/manage',
    showInSidebar: true
  },
  { 
    id: 'mapping_group', 
    name: 'Mapping Job Groups', 
    category: 'Job Design', 
    supportsExecute: true,
    icon: FiLayers,
    route: '/mapping-groups',
    showInSidebar: true
  },
  
  // Jobs and Monitoring
  { 
    id: 'workflow', 
    name: 'Workflows', 
    category: 'Archived', 
    supportsExecute: true,
    icon: FiGitBranch,
    route: '/workflows',
    showInSidebar: true
  },
  { 
    id: 'workflow_builder', 
    name: 'Visual Workflow Builder', 
    category: 'Jobs and Monitoring', 
    supportsExecute: true,
    icon: FiGrid,
    route: '/workflow-builder',
    showInSidebar: true
  },
  { 
    id: 'workflow_manager', 
    name: 'Visual Workflows', 
    category: 'Jobs and Monitoring', 
    supportsExecute: true,
    icon: FiGrid,
    route: '/workflow-manager',
    showInSidebar: true
  },
  { 
    id: 'schedule', 
    name: 'Job Schedules', 
    category: 'Jobs and Monitoring', 
    supportsExecute: true,
    icon: FiCalendar,
    route: '/etl-scheduler',
    showInSidebar: true
  },
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
    id: 'error_review', 
    name: 'Quality Violations', 
    category: 'Jobs and Monitoring',
    icon: FiXCircle,
    route: '/error-review',
    showInSidebar: true
  },
  
  // Governance
  { 
    id: 'lineage', 
    name: 'File Lineage', 
    category: 'Archived',
    icon: FiGitBranch,
    route: '/lineage',
    showInSidebar: true
  },
  { 
    id: 'visual_lineage', 
    name: 'Visual Lineage', 
    category: 'Governance',
    icon: FiGitBranch,
    route: '/visual-lineage',
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
    id: 'retention_policies', 
    name: 'Retention & Archival', 
    category: 'Insights',
    icon: FiDatabase,
    route: '/retention-policies',
    showInSidebar: true
  },
  { 
    id: 'archived_files', 
    name: 'Archived Files', 
    category: 'Insights',
    icon: FiArchive,
    route: '/archived-files',
    showInSidebar: true
  },
  { 
    id: 'anomalies', 
    name: 'Anomaly Detection', 
    category: 'Insights',
    icon: FiAlertTriangle,
    route: '/anomalies',
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
    id: 'connection', 
    name: 'Connections', 
    category: 'Administration', 
    supportsExecute: true,
    icon: FiDatabase,
    route: '/connections',
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
    id: 'users', 
    name: 'User Management', 
    category: 'Administration',
    icon: FiUsers,
    route: '/users',
    showInSidebar: true
  },
  { 
    id: 'project_management', 
    name: 'Project Management', 
    category: 'Administration',
    icon: FiBriefcase,
    route: '/project-management',
    showInSidebar: true
  },
  { 
    id: 'access_groups', 
    name: 'Access Groups', 
    category: 'Administration',
    icon: FiUsers,
    route: '/group-management',
    showInSidebar: true
  },
  { 
    id: 'api_tokens', 
    name: 'API Tokens', 
    category: 'Administration',
    icon: FiKey,
    route: '/api-tokens',
    showInSidebar: true
  },
  { 
    id: 'api_documentation', 
    name: 'API Documentation', 
    category: 'Administration',
    icon: FiBookOpen,
    route: '/api-documentation',
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
    isParentOnly: true,
    children: [
      {
        id: 'vendor_roles',
        name: 'Vendor Role Management',
        parentId: 'vendor_management',
        category: 'Administration',
        icon: null,
        route: '/vendor-roles',
        showInSidebar: true
      },
      {
        id: 'vendor_users',
        name: 'Vendor User Management',
        parentId: 'vendor_management',
        category: 'Administration',
        icon: null,
        route: '/vendor-users',
        showInSidebar: true
      },
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
        name: 'Create/Edit Vendors',
        parentId: 'vendor_management',
        category: 'Administration',
        icon: null,
        route: '/vendor-management',
        showInSidebar: true
      },
      {
        id: 'vendor_agreements',
        name: 'Vendor Data Contracts',
        parentId: 'vendor_management',
        category: 'Administration',
        icon: null,
        route: '/vendor-agreements',
        showInSidebar: true
      },
      {
        id: 'sla_monitoring',
        name: 'SLA Monitoring',
        parentId: 'vendor_management',
        category: 'Administration',
        icon: null,
        route: '/sla-monitoring',
        showInSidebar: true
      }
    ]
  },
  {
    id: 'vendor_users',
    name: 'Vendor User Management',
    category: 'Vendor Management',
    parentId: 'vendor_management',
    icon: null,
    route: '/vendor-users',
    showInSidebar: false,
    isVendorSubmodule: true
  },
  {
    id: 'vendor_roles',
    name: 'Vendor Role Management',
    category: 'Vendor Management',
    parentId: 'vendor_management',
    icon: null,
    route: '/vendor-roles',
    showInSidebar: false,
    isVendorSubmodule: true
  },
  {
    id: 'vendor_connections',
    name: 'Vendor Connections',
    category: 'Vendor Management',
    parentId: 'vendor_management',
    icon: null,
    route: '/connections?type=vendor',
    showInSidebar: false,
    isVendorSubmodule: true
  },
  {
    id: 'vendor_details',
    name: 'Create/Edit Vendors',
    category: 'Vendor Management',
    parentId: 'vendor_management',
    icon: null,
    route: '/vendor-management',
    showInSidebar: false,
    isVendorSubmodule: true
  },
  {
    id: 'vendor_agreements',
    name: 'Vendor Data Contracts',
    category: 'Vendor Management',
    parentId: 'vendor_management',
    icon: null,
    route: '/vendor-agreements',
    showInSidebar: false,
    isVendorSubmodule: true,
    supportsApprove: true
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
    id: 'executive_dashboard', 
    name: 'Executive Dashboard', 
    category: 'Insights',
    icon: FiTrendingUp,
    route: '/executive-dashboard',
    showInSidebar: true
  },
  { 
    id: 'file_insights', 
    name: 'File Insights', 
    category: 'Insights',
    icon: FiTrendingUp,
    route: '/file-insights',
    showInSidebar: true
  },
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
  'Administration',
  'Project & File Management',
  'Catalogs',
  'Job Design',
  'Jobs and Monitoring',
  'Governance',
  'Vendor Management',
  'Insights',
  'Archived'
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
    'Project & File Management': 'Projects and Files',
    'Catalogs': 'Catalogs',
    'Job Design': 'Job Design',
    'Jobs and Monitoring': 'Jobs and Monitoring',
    'Governance': 'Data Governance',
    'Administration': 'Administration',
    'Vendor Management': 'Vendor Management',
    'Insights': 'Insights',
    'Archived': 'Archived'
  };
  return mapping[category] || category;
};
