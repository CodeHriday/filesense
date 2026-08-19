// Shared application features configuration
// Used by both RoleManagement and Sidebar for consistent permission handling

import {
  FiHome,
  FiUpload,
  FiDatabase,
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
  FiBookOpen,
  FiBriefcase,
  FiTruck,
  FiCheckCircle,
  FiArchive,
  FiKey,
  FiMail
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
  
  // Job Design
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
    id: 'workflow_manager', 
    name: 'Visual Workflows', 
    category: 'Job Design', 
    supportsExecute: true,
    icon: FiGitBranch,
    route: '/workflow-manager',
    showInSidebar: true
  },
  
  // Jobs and Monitoring
  { 
    id: 'workflow_builder', 
    name: 'Visual Workflow Builder', 
    category: 'Job Design', 
    supportsExecute: true,
    icon: FiGrid,
    route: '/workflow-builder',
    showInSidebar: false
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
  {
    id: 'sla_monitoring',
    name: 'SLA Monitoring',
    category: 'Jobs and Monitoring',
    icon: FiMonitor,
    route: '/sla-monitoring',
    showInSidebar: true
  },
  
  // Governance
  { 
    id: 'quality_rules', 
    name: 'Quality Rules', 
    category: 'Governance',
    icon: FiAlertTriangle,
    route: '/quality-rules',
    showInSidebar: true
  },
  { 
    id: 'executive_dashboard', 
    name: 'Executive Dashboard', 
    category: 'Governance',
    icon: FiTrendingUp,
    route: '/executive-dashboard',
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
    id: 'access_groups', 
    name: 'Access Groups', 
    category: 'Administration',
    icon: FiUsers,
    route: '/group-management',
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
    id: 'email_providers', 
    name: 'Email Providers', 
    category: 'Administration',
    icon: FiMail,
    route: '/email-providers',
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
        name: 'Data Sharing Agreements',
        parentId: 'vendor_management',
        category: 'Administration',
        icon: null,
        route: '/vendor-agreements',
        showInSidebar: true
      }
    ]
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
    name: 'Data Sharing Agreements',
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
  {
    id: 'digest_subscriptions',
    name: 'Digest Subscriptions',
    category: 'Administration',
    icon: FiMail,
    route: '/digest-subscriptions',
    showInSidebar: true
  },
  
  // Data Stories & Jobs - ARCHIVED
  { 
    id: 'stories', 
    name: 'Data Stories', 
    category: 'Jobs and Monitoring',
    icon: FiBookOpen,
    route: '/stories',
    showInSidebar: false // ARCHIVED - not in use
  },
  { 
    id: 'jobs', 
    name: 'Jobs', 
    category: 'Jobs and Monitoring',
    icon: FiPlay,
    route: '/jobs',
    showInSidebar: false
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
  'Vendor Management'
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
    'Vendor Management': 'Vendor Management'
  };
  return mapping[category] || category;
};
