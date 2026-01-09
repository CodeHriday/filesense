import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import { QUERY_KEYS } from '../lib/react-query';

const fetchJobs = async (limit = 100) => {
  const response = await axios.get(`${API_BASE_URL}/api/jobs?limit=${limit}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });
  return response.data?.jobs || [];
};

const fetchJobFull = async (jobId) => {
  const response = await axios.get(`${API_BASE_URL}/api/jobs/${jobId}/full`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });
  return response.data;
};

const getAdaptivePollingInterval = (job) => {
  if (!job || job.status !== 'running') {
    return false;
  }
  
  const startTime = job.started_at ? new Date(job.started_at) : new Date(job.created_at);
  const runtimeMs = Date.now() - startTime.getTime();
  const runtimeMinutes = runtimeMs / (1000 * 60);
  
  if (runtimeMinutes < 1) {
    return 5000;
  } else if (runtimeMinutes < 10) {
    return 10000;
  } else {
    return 30000;
  }
};

export const useJobs = (limit = 100, options = {}) => {
  return useQuery({
    queryKey: ['jobs', limit],
    queryFn: () => fetchJobs(limit),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 90 * 1000, // Increased from 60s to 90s for API optimization
    refetchOnMount: false,
    ...options
  });
};

export const useJobFull = (jobId, options = {}) => {
  return useQuery({
    queryKey: ['job', jobId, 'full'],
    queryFn: () => fetchJobFull(jobId),
    enabled: !!jobId,
    staleTime: 5 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: (query) => {
      const data = query?.state?.data;
      return getAdaptivePollingInterval(data?.job);
    },
    refetchOnMount: false,
    ...options
  });
};

export const useInvalidateJobs = () => {
  const queryClient = useQueryClient();
  
  return () => {
    queryClient.invalidateQueries({ queryKey: ['jobs'] });
    queryClient.invalidateQueries({ queryKey: ['job'] });
  };
};
