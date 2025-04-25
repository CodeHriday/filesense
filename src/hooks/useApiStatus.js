import { useQuery } from '@tanstack/react-query';
import { testApiConnection } from '../api/fileService';

/**
 * Hook for checking the API connection status
 * This can be useful for displaying global error states or retrying operations
 */
export const useApiStatus = (options = {}) => {
  return useQuery({
    queryKey: ['apiStatus'],
    queryFn: testApiConnection,
    // Refresh the status check every minute
    refetchInterval: 60000,
    // Don't refetch on window focus by default (would be annoying)
    refetchOnWindowFocus: false,
    // More aggressive retry for API connection
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    ...options
  });
};

export default useApiStatus;