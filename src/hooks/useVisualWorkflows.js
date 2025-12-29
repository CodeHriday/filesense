import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { QueryKeys, STALE_TIMES, CACHE_TIMES } from '../lib/react-query';

const API_URL = '/api';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const fetchVisualWorkflows = async (projectId = null) => {
  const params = projectId ? { project_id: projectId } : {};
  const response = await axios.get(`${API_URL}/visual-workflows`, {
    params,
    headers: getAuthHeader()
  });
  return response.data;
};

const fetchVisualWorkflowById = async (id) => {
  const response = await axios.get(`${API_URL}/visual-workflows/${id}`, {
    headers: getAuthHeader()
  });
  return response.data;
};

const createVisualWorkflow = async (data) => {
  const response = await axios.post(`${API_URL}/visual-workflows`, data, {
    headers: getAuthHeader()
  });
  return response.data;
};

const updateVisualWorkflow = async ({ id, data }) => {
  const response = await axios.put(`${API_URL}/visual-workflows/${id}`, data, {
    headers: getAuthHeader()
  });
  return response.data;
};

const deleteVisualWorkflow = async (id) => {
  const response = await axios.delete(`${API_URL}/visual-workflows/${id}`, {
    headers: getAuthHeader()
  });
  return response.data;
};

const executeVisualWorkflow = async (id) => {
  const response = await axios.post(`${API_URL}/visual-workflows/${id}/execute`, {}, {
    headers: getAuthHeader()
  });
  return response.data;
};

export const useVisualWorkflows = (projectId = null, options = {}) => {
  return useQuery({
    queryKey: ['visualWorkflows', 'list', projectId],
    queryFn: () => fetchVisualWorkflows(projectId),
    staleTime: STALE_TIMES.STANDARD,
    gcTime: CACHE_TIMES.STANDARD,
    refetchOnMount: false,
    ...options
  });
};

export const useVisualWorkflow = (id, options = {}) => {
  return useQuery({
    queryKey: ['visualWorkflows', id],
    queryFn: () => fetchVisualWorkflowById(id),
    enabled: !!id,
    staleTime: STALE_TIMES.STANDARD,
    gcTime: CACHE_TIMES.STANDARD,
    refetchOnMount: false,
    ...options
  });
};

export const useCreateVisualWorkflow = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: createVisualWorkflow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visualWorkflows'] });
    },
    ...options
  });
};

export const useUpdateVisualWorkflow = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: updateVisualWorkflow,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['visualWorkflows', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['visualWorkflows', 'list'] });
    },
    ...options
  });
};

export const useDeleteVisualWorkflow = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: deleteVisualWorkflow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visualWorkflows'] });
    },
    ...options
  });
};

export const useExecuteVisualWorkflow = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: executeVisualWorkflow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QueryKeys.jobs.all });
    },
    ...options
  });
};

export const useInvalidateVisualWorkflows = () => {
  const queryClient = useQueryClient();
  
  return {
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: ['visualWorkflows'] }),
    invalidateOne: (id) => queryClient.invalidateQueries({ queryKey: ['visualWorkflows', id] }),
  };
};
