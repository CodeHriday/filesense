import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSLAStatus, getSLAViolations, getSLASummary, runManualSLACheck } from '../api/slaService';
import { QueryKeys, STALE_TIMES, CACHE_TIMES } from '../lib/react-query';

const SLA_REFETCH_INTERVAL = 1000 * 60;

const fetchSLAData = async () => {
  const [summaryRes, statusRes, violationsRes] = await Promise.all([
    getSLASummary(),
    getSLAStatus(),
    getSLAViolations({ resolved: false, limit: 50 })
  ]);
  
  return {
    summary: summaryRes.data,
    status: statusRes.data,
    violations: violationsRes.data
  };
};

export const useSLAMonitoring = (options = {}) => {
  return useQuery({
    queryKey: QueryKeys.sla?.monitoring || ['sla', 'monitoring'],
    queryFn: fetchSLAData,
    staleTime: STALE_TIMES.FAST_CHANGING,
    gcTime: CACHE_TIMES.SHORT,
    refetchInterval: SLA_REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
    refetchOnMount: false,
    ...options
  });
};

export const useManualSLACheck = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: runManualSLACheck,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QueryKeys.sla?.monitoring || ['sla', 'monitoring'] });
    },
    ...options
  });
};
