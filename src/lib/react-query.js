/**
 * React Query Client Configuration
 * 
 * This file sets up the React Query client with optimized configurations
 * for caching, retries, and error handling.
 */
import { QueryClient } from '@tanstack/react-query';

// Default options for react-query
const defaultQueryOptions = {
  queries: {
    retry: (failureCount, error) => {
      // Don't retry on 404s
      if (error?.response?.status === 404) return false;
      // Don't retry on 401 or 403 (auth issues)
      if (error?.response?.status === 401 || error?.response?.status === 403) return false;
      // Retry 3 times on other errors
      return failureCount < 3;
    },
    refetchOnWindowFocus: process.env.NODE_ENV === 'production',
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
    onError: (error) => {
      console.error('Query Error:', error);
    }
  },
  mutations: {
    retry: false,
    onError: (error) => {
      console.error('Mutation Error:', error);
    }
  }
};

// Create the client with default options
export const queryClient = new QueryClient({
  defaultOptions: defaultQueryOptions
});

// Common query keys for caching
export const QueryKeys = {
  // Auth
  auth: {
    currentUser: ['currentUser'],
    permissions: ['permissions']
  },
  // Files
  files: {
    all: ['files'],
    byId: (id) => ['files', id],
    profile: (id) => ['files', id, 'profile'],
    quality: (id) => ['files', id, 'quality'],
    lineage: (id) => ['files', id, 'lineage']
  },
  // Transformations
  transformations: {
    all: ['transformations'],
    byId: (id) => ['transformations', id]
  },
  // Business Processes
  businessProcesses: {
    all: ['businessProcesses'],
    byId: (id) => ['businessProcesses', id]
  },
  // Groups
  groups: {
    all: ['groups'],
    byId: (id) => ['groups', id]
  },
  // Jobs
  jobs: {
    all: ['jobs'],
    byId: (id) => ['jobs', id],
    byProcess: (processId) => ['jobs', 'process', processId]
  },
  // Dashboard
  dashboard: {
    stats: ['dashboard', 'stats'],
    charts: ['dashboard', 'charts']
  }
};

// Helper for invalidating query caches
export const invalidateQueries = async (queryKey) => {
  return await queryClient.invalidateQueries({ queryKey });
};

// Helper for refreshing query data
export const refetchQueries = async (queryKey) => {
  return await queryClient.refetchQueries({ queryKey });
};

export default queryClient;