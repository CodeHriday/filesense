import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { QueryKeys, STALE_TIMES, CACHE_TIMES } from '../lib/react-query';

const API_URL = '/api';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const fetchExecutiveMetrics = async (days = 30, projectId = null) => {
  const params = { days };
  if (projectId) params.project_id = projectId;
  const response = await axios.get(`${API_URL}/dashboard/executive-metrics`, {
    params,
    headers: getAuthHeader()
  });
  return response.data;
};

const fetchQualityTrend = async (projectId = null) => {
  const params = projectId ? { project_id: projectId } : {};
  const response = await axios.get(`${API_URL}/dashboard/quality-violations-trend`, {
    params,
    headers: getAuthHeader()
  });
  return response.data;
};

const fetchJobTrend = async (days = 30, projectId = null) => {
  const params = { days };
  if (projectId) params.project_id = projectId;
  const response = await axios.get(`${API_URL}/dashboard/job-trend`, {
    params,
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

const fetchFileTypeDistribution = async (projectId = null) => {
  const params = projectId ? { project_id: projectId } : {};
  const response = await axios.get(`${API_URL}/dashboard/file-type-distribution`, {
    params,
    headers: getAuthHeader()
  });
  return response.data;
};

const fetchSchemaDriftTrend = async (days = 30, projectId = null) => {
  const params = { days };
  if (projectId) params.project_id = projectId;
  const response = await axios.get(`${API_URL}/dashboard/schema-drift-trend`, {
    params,
    headers: getAuthHeader()
  });
  return response.data;
};

const fetchMetricTrends = async (granularity = 'daily', projectId = null) => {
  const params = { granularity };
  if (projectId) params.project_id = projectId;
  const response = await axios.get(`${API_URL}/dashboard/metric-trends`, {
    params,
    headers: getAuthHeader()
  });
  return response.data;
};

const fetchProjects = async () => {
  const response = await axios.get(`${API_URL}/projects`, {
    headers: getAuthHeader()
  });
  return response.data;
};

export const useExecutiveMetrics = (days = 30, projectId = null, options = {}) => {
  return useQuery({
    queryKey: [...QueryKeys.dashboard.executiveMetrics(days), projectId],
    queryFn: () => fetchExecutiveMetrics(days, projectId),
    staleTime: STALE_TIMES.DASHBOARD,
    gcTime: CACHE_TIMES.STANDARD,
    refetchOnMount: false,
    ...options
  });
};

export const useQualityTrend = (projectId = null, options = {}) => {
  return useQuery({
    queryKey: [...QueryKeys.dashboard.qualityTrend(), projectId],
    queryFn: () => fetchQualityTrend(projectId),
    staleTime: STALE_TIMES.DASHBOARD,
    gcTime: CACHE_TIMES.STANDARD,
    refetchOnMount: false,
    ...options
  });
};

export const useJobTrend = (days = 30, projectId = null, options = {}) => {
  return useQuery({
    queryKey: [...QueryKeys.dashboard.jobTrend(), days, projectId],
    queryFn: () => fetchJobTrend(days, projectId),
    staleTime: STALE_TIMES.DASHBOARD,
    gcTime: CACHE_TIMES.STANDARD,
    refetchOnMount: false,
    ...options
  });
};

export const useProjectHealth = (options = {}) => {
  return useQuery({
    queryKey: QueryKeys.dashboard.projectHealth(),
    queryFn: fetchProjectHealth,
    staleTime: STALE_TIMES.DASHBOARD,
    gcTime: CACHE_TIMES.STANDARD,
    refetchOnMount: false,
    ...options
  });
};

export const useFileTypeDistribution = (projectId = null, options = {}) => {
  return useQuery({
    queryKey: [...QueryKeys.dashboard.fileTypeDistribution(), projectId],
    queryFn: () => fetchFileTypeDistribution(projectId),
    staleTime: STALE_TIMES.DASHBOARD,
    gcTime: CACHE_TIMES.STANDARD,
    refetchOnMount: false,
    ...options
  });
};

export const useSchemaDriftTrend = (days = 30, projectId = null, options = {}) => {
  return useQuery({
    queryKey: [...QueryKeys.dashboard.schemaDriftTrend(), days, projectId],
    queryFn: () => fetchSchemaDriftTrend(days, projectId),
    staleTime: STALE_TIMES.DASHBOARD,
    gcTime: CACHE_TIMES.STANDARD,
    refetchOnMount: false,
    ...options
  });
};

export const useMetricTrends = (granularity = 'daily', projectId = null, options = {}) => {
  return useQuery({
    queryKey: [...QueryKeys.dashboard.metricTrends(granularity), projectId],
    queryFn: () => fetchMetricTrends(granularity, projectId),
    staleTime: STALE_TIMES.DASHBOARD,
    gcTime: CACHE_TIMES.STANDARD,
    refetchOnMount: false,
    ...options
  });
};

export const useProjects = (options = {}) => {
  return useQuery({
    queryKey: QueryKeys.projects.list(),
    queryFn: fetchProjects,
    staleTime: STALE_TIMES.SLOW_CHANGING,
    gcTime: CACHE_TIMES.LONG,
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
