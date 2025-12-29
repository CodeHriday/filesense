import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { QueryKeys, STALE_TIMES, CACHE_TIMES } from '../lib/react-query';

const API_URL = '/api';

/**
 * Get all transformations
 */
const getTransformations = async (options = {}) => {
  const { sortBy, sortOrder, limit, offset } = options;
  const params = new URLSearchParams();
  
  if (sortBy) params.append('sortBy', sortBy);
  if (sortOrder) params.append('sortOrder', sortOrder);
  if (limit) params.append('limit', limit);
  if (offset) params.append('offset', offset);
  
  const response = await axios.get(`${API_URL}/transformations${params.toString() ? `?${params.toString()}` : ''}`);
  return response.data;
};

/**
 * Get a transformation by ID
 */
const getTransformationById = async (id) => {
  const response = await axios.get(`${API_URL}/transformations/${id}`);
  return response.data;
};

/**
 * Create a new transformation
 */
const createTransformation = async (transformationData) => {
  const response = await axios.post(`${API_URL}/transformations`, transformationData);
  return response.data;
};

/**
 * Update a transformation
 */
const updateTransformation = async ({ id, data }) => {
  const response = await axios.put(`${API_URL}/transformations/${id}`, data);
  return response.data;
};

/**
 * Delete a transformation
 */
const deleteTransformation = async (id) => {
  const response = await axios.delete(`${API_URL}/transformations/${id}`);
  return response.data;
};

/**
 * Execute a transformation
 */
const executeTransformation = async ({ id, parameters = {} }) => {
  const response = await axios.post(`${API_URL}/transformations/${id}/execute`, { parameters });
  return response.data;
};

/**
 * Get execution history for a transformation
 */
const getExecutionHistory = async ({ id, limit = 20, offset = 0 }) => {
  const params = new URLSearchParams();
  params.append('limit', limit);
  params.append('offset', offset);
  
  const response = await axios.get(`${API_URL}/transformations/${id}/executions?${params.toString()}`);
  return response.data;
};

/**
 * Get execution details
 */
const getExecutionDetails = async (executionId) => {
  const response = await axios.get(`${API_URL}/transformations/executions/${executionId}`);
  return response.data;
};

/**
 * Hook for fetching all transformations
 * Uses 2-minute stale time - transformations change less frequently
 */
export const useTransformations = (options = {}) => {
  return useQuery({
    queryKey: QueryKeys.transformations.all,
    queryFn: () => getTransformations(options),
    staleTime: STALE_TIMES.STANDARD,
    gcTime: CACHE_TIMES.STANDARD,
    refetchOnMount: false,
    ...options
  });
};

/**
 * Hook for fetching a specific transformation
 */
export const useTransformation = (id, options = {}) => {
  return useQuery({
    queryKey: QueryKeys.transformations.byId(id),
    queryFn: () => getTransformationById(id),
    enabled: !!id,
    staleTime: STALE_TIMES.STANDARD,
    gcTime: CACHE_TIMES.STANDARD,
    refetchOnMount: false,
    ...options
  });
};

/**
 * Hook for creating a transformation
 */
export const useCreateTransformation = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: createTransformation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QueryKeys.transformations.all });
    },
    ...options
  });
};

/**
 * Hook for updating a transformation
 */
export const useUpdateTransformation = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: updateTransformation,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: QueryKeys.transformations.byId(variables.id)
      });
      queryClient.invalidateQueries({ 
        queryKey: QueryKeys.transformations.all
      });
    },
    ...options
  });
};

/**
 * Hook for deleting a transformation
 */
export const useDeleteTransformation = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: deleteTransformation,
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: QueryKeys.transformations.all
      });
    },
    ...options
  });
};

/**
 * Hook for executing a transformation
 */
export const useExecuteTransformation = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: executeTransformation,
    onSuccess: (data, variables) => {
      // Invalidate the execution history for this transformation
      queryClient.invalidateQueries({ 
        queryKey: ['transformations', variables.id, 'executions']
      });
    },
    ...options
  });
};

/**
 * Hook for fetching execution history
 */
export const useExecutionHistory = (transformationId, options = {}) => {
  return useQuery({
    queryKey: ['transformations', transformationId, 'executions'],
    queryFn: () => getExecutionHistory({ 
      id: transformationId, 
      limit: options.limit, 
      offset: options.offset 
    }),
    enabled: !!transformationId,
    ...options
  });
};

/**
 * Hook for fetching execution details
 */
export const useExecutionDetails = (executionId, options = {}) => {
  return useQuery({
    queryKey: ['transformations', 'executions', executionId],
    queryFn: () => getExecutionDetails(executionId),
    enabled: !!executionId,
    ...options
  });
};