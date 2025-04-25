/**
 * React Query Configuration
 * 
 * This file configures React Query for managing server state.
 * It sets up the QueryClient with default options for all queries and mutations.
 */
import { QueryClient } from '@tanstack/react-query';

// Default options for all queries
const defaultQueryOptions = {
  refetchOnWindowFocus: false,
  refetchOnMount: true,
  refetchOnReconnect: true,
  retry: 1,
  staleTime: 5 * 60 * 1000, // 5 minutes
  cacheTime: 10 * 60 * 1000, // 10 minutes
};

// Default options for all mutations
const defaultMutationOptions = {
  retry: 1,
  onError: (error) => {
    // Global error handling for mutations
    console.error('Mutation error:', error);
  },
};

// Create and configure QueryClient
const queryClient = new QueryClient({
  defaultOptions: {
    queries: defaultQueryOptions,
    mutations: defaultMutationOptions,
  },
});

export default queryClient;

// Query keys for better organization and type safety
export const QueryKeys = {
  // User and authentication related keys
  auth: {
    user: ['auth', 'user'],
    permissions: ['auth', 'permissions'],
    roles: ['auth', 'roles'],
  },
  
  // File related keys
  files: {
    all: ['files'],
    detail: (fileId) => ['files', fileId],
    recent: ['files', 'recent'],
    byType: (type) => ['files', 'type', type],
    history: (fileId) => ['files', fileId, 'history'],
    quality: (fileId) => ['files', fileId, 'quality'],
  },
  
  // Process related keys
  processes: {
    all: ['processes'],
    detail: (processId) => ['processes', processId],
    templates: ['processes', 'templates'],
    active: ['processes', 'active'],
    history: ['processes', 'history'],
  },
  
  // Transformation related keys
  transformations: {
    all: ['transformations'],
    detail: (transformId) => ['transformations', transformId],
    templates: ['transformations', 'templates'],
  },
  
  // Dashboard related keys
  dashboard: {
    stats: ['dashboard', 'stats'],
    alerts: ['dashboard', 'alerts'],
    recentActivity: ['dashboard', 'recentActivity'],
  },
  
  // Statistics related keys
  stats: {
    filesByType: ['stats', 'filesByType'],
    qualityTrends: ['stats', 'qualityTrends'],
    processPerformance: ['stats', 'processPerformance'],
  },
  
  // Settings related keys
  settings: {
    all: ['settings'],
    user: ['settings', 'user'],
    system: ['settings', 'system'],
  },
};

// Custom hooks for common React Query patterns
export const QueryUtils = {
  // Helper to invalidate cache for files
  invalidateFiles: () => {
    return queryClient.invalidateQueries(QueryKeys.files.all);
  },
  
  // Helper to invalidate cache for a specific file
  invalidateFile: (fileId) => {
    return queryClient.invalidateQueries(QueryKeys.files.detail(fileId));
  },
  
  // Helper to invalidate all process-related queries
  invalidateProcesses: () => {
    return queryClient.invalidateQueries(QueryKeys.processes.all);
  },
  
  // Helper to invalidate all dashboard stats
  invalidateDashboard: () => {
    return queryClient.invalidateQueries(QueryKeys.dashboard.stats);
  },
  
  // Helper to update file cache after mutation
  updateFileCache: (fileId, newData) => {
    queryClient.setQueryData(
      QueryKeys.files.detail(fileId),
      (oldData) => ({ ...oldData, ...newData })
    );
  },
  
  // Helper to update user cache after mutation
  updateUserCache: (newData) => {
    queryClient.setQueryData(
      QueryKeys.auth.user,
      (oldData) => ({ ...oldData, ...newData })
    );
  },
};