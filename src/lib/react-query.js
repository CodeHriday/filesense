import { QueryClient } from '@tanstack/react-query';

/**
 * Create and configure the QueryClient instance
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,                     // Only retry failed queries once by default
      staleTime: 1000 * 60 * 5,     // Consider data fresh for 5 minutes
      cacheTime: 1000 * 60 * 30,    // Cache data for 30 minutes
      refetchOnWindowFocus: false,  // Don't refetch when window regains focus
      refetchOnMount: true,         // Refetch data when component mounts
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
    byId: (id) => ['files', id],
    profile: (id) => ['files', id, 'profile'],
    quality: (id) => ['files', id, 'quality']
  },
  
  // Transformation-related query keys
  transformations: {
    all: ['transformations'],
    byId: (id) => ['transformations', id],
    executions: (id) => ['transformations', id, 'executions'],
    execution: (execId) => ['transformations', 'executions', execId]
  },
  
  // API status
  apiStatus: ['apiStatus']
};

export default queryClient;