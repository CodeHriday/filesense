import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { QueryKeys, STALE_TIMES, CACHE_TIMES } from '../lib/react-query';

const API_URL = '/api';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const fetchWorkflows = async (projectId = null) => {
  const params = projectId ? { project_id: projectId } : {};
  const response = await axios.get(`${API_URL}/workflows`, {
    params,
    headers: getAuthHeader()
  });
  return response.data;
};

const fetchWorkflowById = async (id) => {
  const response = await axios.get(`${API_URL}/workflows/${id}`, {
    headers: getAuthHeader()
  });
  return response.data;
};

const createWorkflow = async (data) => {
  const response = await axios.post(`${API_URL}/workflows`, data, {
    headers: getAuthHeader()
  });
  return response.data;
};

const updateWorkflow = async ({ id, data }) => {
  const response = await axios.put(`${API_URL}/workflows/${id}`, data, {
    headers: getAuthHeader()
  });
  return response.data;
};

const deleteWorkflow = async (id) => {
  const response = await axios.delete(`${API_URL}/workflows/${id}`, {
    headers: getAuthHeader()
  });
  return response.data;
};

const executeWorkflow = async (id) => {
  const response = await axios.post(`${API_URL}/workflows/${id}/execute`, {}, {
    headers: getAuthHeader()
  });
  return response.data;
};

const fetchWorkflowExecutions = async (id) => {
  const response = await axios.get(`${API_URL}/workflows/${id}/executions`, {
    headers: getAuthHeader()
  });
  return response.data;
};

export const useWorkflows = (projectId = null, options = {}) => {
  return useQuery({
    queryKey: QueryKeys.workflows.list(projectId, null),
    queryFn: () => fetchWorkflows(projectId),
    staleTime: STALE_TIMES.STANDARD,
    cacheTime: CACHE_TIMES.STANDARD,
    refetchOnMount: false,
    ...options
  });
};

export const useWorkflow = (id, options = {}) => {
  return useQuery({
    queryKey: QueryKeys.workflows.byId(id),
    queryFn: () => fetchWorkflowById(id),
    enabled: !!id,
    staleTime: STALE_TIMES.STANDARD,
    cacheTime: CACHE_TIMES.STANDARD,
    refetchOnMount: false,
    ...options
  });
};

export const useWorkflowExecutions = (id, options = {}) => {
  return useQuery({
    queryKey: QueryKeys.workflows.executions(id),
    queryFn: () => fetchWorkflowExecutions(id),
    enabled: !!id,
    staleTime: STALE_TIMES.FAST_CHANGING,
    cacheTime: CACHE_TIMES.SHORT,
    refetchOnMount: false,
    ...options
  });
};

export const useCreateWorkflow = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: createWorkflow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QueryKeys.workflows.all });
    },
    ...options
  });
};

export const useUpdateWorkflow = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: updateWorkflow,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: QueryKeys.workflows.byId(variables.id) });
      queryClient.invalidateQueries({ queryKey: QueryKeys.workflows.all });
    },
    ...options
  });
};

export const useDeleteWorkflow = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: deleteWorkflow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QueryKeys.workflows.all });
    },
    ...options
  });
};

export const useExecuteWorkflow = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: executeWorkflow,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: QueryKeys.workflows.executions(variables) });
      queryClient.invalidateQueries({ queryKey: QueryKeys.jobs.all });
    },
    ...options
  });
};

export const useInvalidateWorkflows = () => {
  const queryClient = useQueryClient();
  
  return {
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: QueryKeys.workflows.all }),
    invalidateOne: (id) => queryClient.invalidateQueries({ queryKey: QueryKeys.workflows.byId(id) }),
    invalidateExecutions: (id) => queryClient.invalidateQueries({ queryKey: QueryKeys.workflows.executions(id) }),
  };
};
