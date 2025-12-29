import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { QueryKeys, STALE_TIMES, CACHE_TIMES } from '../lib/react-query';

const API_URL = '/api';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const fetchMappingGroups = async (projectId = null) => {
  const params = projectId ? { project_id: projectId } : {};
  const response = await axios.get(`${API_URL}/mapping-groups`, {
    params,
    headers: getAuthHeader()
  });
  return response.data;
};

const fetchMappingGroupById = async (id) => {
  const response = await axios.get(`${API_URL}/mapping-groups/${id}`, {
    headers: getAuthHeader()
  });
  return response.data;
};

const createMappingGroup = async (data) => {
  const response = await axios.post(`${API_URL}/mapping-groups`, data, {
    headers: getAuthHeader()
  });
  return response.data;
};

const updateMappingGroup = async ({ id, data }) => {
  const response = await axios.put(`${API_URL}/mapping-groups/${id}`, data, {
    headers: getAuthHeader()
  });
  return response.data;
};

const deleteMappingGroup = async (id) => {
  const response = await axios.delete(`${API_URL}/mapping-groups/${id}`, {
    headers: getAuthHeader()
  });
  return response.data;
};

const executeMappingGroup = async (id) => {
  const response = await axios.post(`${API_URL}/mapping-groups/${id}/execute`, {}, {
    headers: getAuthHeader()
  });
  return response.data;
};

export const useMappingGroups = (projectId = null, options = {}) => {
  return useQuery({
    queryKey: QueryKeys.mappingGroups.list(projectId, null),
    queryFn: () => fetchMappingGroups(projectId),
    staleTime: STALE_TIMES.STANDARD,
    cacheTime: CACHE_TIMES.STANDARD,
    refetchOnMount: false,
    ...options
  });
};

export const useMappingGroup = (id, options = {}) => {
  return useQuery({
    queryKey: QueryKeys.mappingGroups.byId(id),
    queryFn: () => fetchMappingGroupById(id),
    enabled: !!id,
    staleTime: STALE_TIMES.STANDARD,
    cacheTime: CACHE_TIMES.STANDARD,
    refetchOnMount: false,
    ...options
  });
};

export const useCreateMappingGroup = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: createMappingGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QueryKeys.mappingGroups.all });
    },
    ...options
  });
};

export const useUpdateMappingGroup = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: updateMappingGroup,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: QueryKeys.mappingGroups.byId(variables.id) });
      queryClient.invalidateQueries({ queryKey: QueryKeys.mappingGroups.all });
    },
    ...options
  });
};

export const useDeleteMappingGroup = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: deleteMappingGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QueryKeys.mappingGroups.all });
    },
    ...options
  });
};

export const useExecuteMappingGroup = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: executeMappingGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QueryKeys.jobs.all });
    },
    ...options
  });
};

export const useInvalidateMappingGroups = () => {
  const queryClient = useQueryClient();
  
  return {
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: QueryKeys.mappingGroups.all }),
    invalidateOne: (id) => queryClient.invalidateQueries({ queryKey: QueryKeys.mappingGroups.byId(id) }),
  };
};
