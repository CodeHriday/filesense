import { QueryClient } from '@tanstack/react-query';

/**
 * Stale time configurations for different data types
 * These define how long data is considered fresh before a background refetch
 */
export const STALE_TIMES = {
  FAST_CHANGING: 1000 * 15,      // 15 seconds - job queues, real-time status
  FILES: 1000 * 30,              // 30 seconds - file catalog (changes via uploads)
  DASHBOARD: 1000 * 60,          // 60 seconds - dashboard metrics
  STANDARD: 1000 * 60 * 2,       // 2 minutes - transformations, mappings, workflows
  SLOW_CHANGING: 1000 * 60 * 5,  // 5 minutes - user permissions, settings
};

/**
 * Cache time configurations
 * These define how long inactive data stays in memory
 */
export const CACHE_TIMES = {
  SHORT: 1000 * 60 * 3,          // 3 minutes
  STANDARD: 1000 * 60 * 10,      // 10 minutes
  LONG: 1000 * 60 * 30,          // 30 minutes
};

/**
 * Create and configure the QueryClient instance
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,                     // Only retry failed queries once by default
      staleTime: STALE_TIMES.STANDARD, // Default: 2 minutes freshness
      cacheTime: CACHE_TIMES.STANDARD, // Cache data for 10 minutes
      refetchOnWindowFocus: false,  // Don't refetch when window regains focus
      refetchOnMount: 'always',     // Only refetch if data is stale on mount
      refetchOnReconnect: true,     // Refetch when reconnecting
      suspense: false,              // Don't use React Suspense for queries
    },
    mutations: {
      retry: 0,                     // Don't retry failed mutations by default
    },
  },
});

/**
 * Define query key factory functions to maintain consistent query keys
 * throughout the application.
 * 
 * Using a structured approach to query keys helps with:
 * 1. Consistent cache invalidation
 * 2. Proper relationship between queries
 * 3. Easier debugging with React Query DevTools
 */
export const QueryKeys = {
  // File-related query keys
  files: {
    all: ['files'],
    list: (projectId, filters) => ['files', 'list', projectId, filters],
    byId: (id) => ['files', id],
    profile: (id) => ['files', id, 'profile'],
    quality: (id) => ['files', id, 'quality'],
    governance: (id) => ['files', id, 'governance'],
    columnGovernance: (id) => ['files', id, 'columnGovernance'],
  },
  
  // Dashboard-related query keys
  dashboard: {
    all: ['dashboard'],
    executiveMetrics: (days) => ['dashboard', 'executiveMetrics', days],
    qualityTrend: () => ['dashboard', 'qualityTrend'],
    jobTrend: () => ['dashboard', 'jobTrend'],
    projectHealth: () => ['dashboard', 'projectHealth'],
    fileTypeDistribution: () => ['dashboard', 'fileTypeDistribution'],
    schemaDriftTrend: () => ['dashboard', 'schemaDriftTrend'],
    metricTrends: (granularity) => ['dashboard', 'metricTrends', granularity],
  },
  
  // Transformation-related query keys
  transformations: {
    all: ['transformations'],
    list: (filters) => ['transformations', 'list', filters],
    byId: (id) => ['transformations', id],
    executions: (id) => ['transformations', id, 'executions'],
    execution: (execId) => ['transformations', 'executions', execId]
  },
  
  // Mapping Groups query keys
  mappingGroups: {
    all: ['mappingGroups'],
    list: (projectId, filters) => ['mappingGroups', 'list', projectId, filters],
    byId: (id) => ['mappingGroups', id],
  },
  
  // Visual Mappings query keys
  visualMappings: {
    all: ['visualMappings'],
    list: (projectId) => ['visualMappings', 'list', projectId],
    byId: (id) => ['visualMappings', id],
  },
  
  // Workflow query keys
  workflows: {
    all: ['workflows'],
    list: (projectId, filters) => ['workflows', 'list', projectId, filters],
    byId: (id) => ['workflows', id],
    executions: (id) => ['workflows', id, 'executions'],
  },
  
  // Scheduler query keys
  schedules: {
    all: ['schedules'],
    list: (projectId, filters) => ['schedules', 'list', projectId, filters],
    byId: (id) => ['schedules', id],
  },
  
  // Jobs query keys
  jobs: {
    all: ['jobs'],
    list: (filters) => ['jobs', 'list', filters],
    byId: (id) => ['jobs', id],
  },
  
  // Projects query keys
  projects: {
    all: ['projects'],
    list: () => ['projects', 'list'],
    byId: (id) => ['projects', id],
  },
  
  // Auth/User query keys
  auth: {
    me: ['auth', 'me'],
    permissions: ['auth', 'permissions'],
  },
  
  // Notifications
  notifications: {
    all: ['notifications'],
    unread: ['notifications', 'unread'],
  },
  
  // SLA Monitoring
  sla: {
    all: ['sla'],
    monitoring: ['sla', 'monitoring'],
    status: ['sla', 'status'],
    violations: ['sla', 'violations'],
    summary: ['sla', 'summary'],
  },
  
  // Vendor Agreements
  vendorAgreements: {
    all: ['vendorAgreements'],
    list: () => ['vendorAgreements', 'list'],
    byId: (id) => ['vendorAgreements', id],
    full: (id) => ['vendorAgreements', id, 'full'],
    initData: ['vendorAgreements', 'initData'],
  },
  
  // Process Wizard
  processWizard: {
    initData: ['processWizard', 'initData'],
  },
  
  // API status
  apiStatus: ['apiStatus']
};

export default queryClient;