import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { QueryKeys, STALE_TIMES, CACHE_TIMES } from '../lib/react-query';

const API_URL = '/api';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const fetchExecutiveMetrics = async (days = 30) => {
  const response = await axios.get(`${API_URL}/dashboard/executive-metrics`, {
    params: { days },
    headers: getAuthHeader()
  });
  return response.data;
};

const fetchQualityTrend = async () => {
  const response = await axios.get(`${API_URL}/dashboard/quality-violations-trend`, {
    headers: getAuthHeader()
  });
  return response.data;
};

const fetchJobTrend = async () => {
  const response = await axios.get(`${API_URL}/dashboard/job-trend`, {
    headers: getAuthHeader()
  });
  return response.data;
};

const fetchProjectHealth = async () => {
  const response = await axios.get(`${API_URL}/dashboard/project-health-scores`, {
    headers: getAuthHeader()
  });
  return response.data;
};

const fetchFileTypeDistribution = async () => {
  const response = await axios.get(`${API_URL}/dashboard/file-type-distribution`, {
    headers: getAuthHeader()
  });
  return response.data;
};

const fetchSchemaDriftTrend = async () => {
  const response = await axios.get(`${API_URL}/dashboard/schema-drift-trend`, {
    headers: getAuthHeader()
  });
  return response.data;
};

const fetchMetricTrends = async (granularity = 'daily') => {
  const response = await axios.get(`${API_URL}/dashboard/metric-trends`, {
    params: { granularity },
    headers: getAuthHeader()
  });
  return response.data;
};

export const useExecutiveMetrics = (days = 30, options = {}) => {
  return useQuery({
    queryKey: QueryKeys.dashboard.executiveMetrics(days),
    queryFn: () => fetchExecutiveMetrics(days),
    staleTime: STALE_TIMES.DASHBOARD,
    cacheTime: CACHE_TIMES.STANDARD,
    refetchOnMount: false,
    ...options
  });
};

export const useQualityTrend = (options = {}) => {
  return useQuery({
    queryKey: QueryKeys.dashboard.qualityTrend(),
    queryFn: fetchQualityTrend,
    staleTime: STALE_TIMES.DASHBOARD,
    cacheTime: CACHE_TIMES.STANDARD,
    refetchOnMount: false,
    ...options
  });
};

export const useJobTrend = (options = {}) => {
  return useQuery({
    queryKey: QueryKeys.dashboard.jobTrend(),
    queryFn: fetchJobTrend,
    staleTime: STALE_TIMES.DASHBOARD,
    cacheTime: CACHE_TIMES.STANDARD,
    refetchOnMount: false,
    ...options
  });
};

export const useProjectHealth = (options = {}) => {
  return useQuery({
    queryKey: QueryKeys.dashboard.projectHealth(),
    queryFn: fetchProjectHealth,
    staleTime: STALE_TIMES.DASHBOARD,
    cacheTime: CACHE_TIMES.STANDARD,
    refetchOnMount: false,
    ...options
  });
};

export const useFileTypeDistribution = (options = {}) => {
  return useQuery({
    queryKey: QueryKeys.dashboard.fileTypeDistribution(),
    queryFn: fetchFileTypeDistribution,
    staleTime: STALE_TIMES.DASHBOARD,
    cacheTime: CACHE_TIMES.STANDARD,
    refetchOnMount: false,
    ...options
  });
};

export const useSchemaDriftTrend = (options = {}) => {
  return useQuery({
    queryKey: QueryKeys.dashboard.schemaDriftTrend(),
    queryFn: fetchSchemaDriftTrend,
    staleTime: STALE_TIMES.DASHBOARD,
    cacheTime: CACHE_TIMES.STANDARD,
    refetchOnMount: false,
    ...options
  });
};

export const useMetricTrends = (granularity = 'daily', options = {}) => {
  return useQuery({
    queryKey: QueryKeys.dashboard.metricTrends(granularity),
    queryFn: () => fetchMetricTrends(granularity),
    staleTime: STALE_TIMES.DASHBOARD,
    cacheTime: CACHE_TIMES.STANDARD,
    refetchOnMount: false,
    ...options
  });
};

export const useInvalidateDashboard = () => {
  const queryClient = useQueryClient();
  
  return () => {
    queryClient.invalidateQueries({ queryKey: QueryKeys.dashboard.all });
  };
};
