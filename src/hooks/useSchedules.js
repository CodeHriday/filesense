import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { QueryKeys, STALE_TIMES, CACHE_TIMES } from '../lib/react-query';

const API_URL = '/api';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const fetchSchedules = async (projectId = null) => {
  const params = projectId ? { project_id: projectId } : {};
  const response = await axios.get(`${API_URL}/schedules`, {
    params,
    headers: getAuthHeader()
  });
  return response.data;
};

const fetchScheduleById = async (id) => {
  const response = await axios.get(`${API_URL}/schedules/${id}`, {
    headers: getAuthHeader()
  });
  return response.data;
};

const createSchedule = async (data) => {
  const response = await axios.post(`${API_URL}/schedules`, data, {
    headers: getAuthHeader()
  });
  return response.data;
};

const updateSchedule = async ({ id, data }) => {
  const response = await axios.put(`${API_URL}/schedules/${id}`, data, {
    headers: getAuthHeader()
  });
  return response.data;
};

const deleteSchedule = async (id) => {
  const response = await axios.delete(`${API_URL}/schedules/${id}`, {
    headers: getAuthHeader()
  });
  return response.data;
};

const toggleSchedule = async ({ id, enabled }) => {
  const response = await axios.patch(`${API_URL}/schedules/${id}/toggle`, { enabled }, {
    headers: getAuthHeader()
  });
  return response.data;
};

export const useSchedules = (projectId = null, options = {}) => {
  return useQuery({
    queryKey: QueryKeys.schedules.list(projectId, null),
    queryFn: () => fetchSchedules(projectId),
    staleTime: STALE_TIMES.STANDARD,
    cacheTime: CACHE_TIMES.STANDARD,
    refetchOnMount: false,
    ...options
  });
};

export const useSchedule = (id, options = {}) => {
  return useQuery({
    queryKey: QueryKeys.schedules.byId(id),
    queryFn: () => fetchScheduleById(id),
    enabled: !!id,
    staleTime: STALE_TIMES.STANDARD,
    cacheTime: CACHE_TIMES.STANDARD,
    refetchOnMount: false,
    ...options
  });
};

export const useCreateSchedule = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: createSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QueryKeys.schedules.all });
    },
    ...options
  });
};

export const useUpdateSchedule = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: updateSchedule,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: QueryKeys.schedules.byId(variables.id) });
      queryClient.invalidateQueries({ queryKey: QueryKeys.schedules.all });
    },
    ...options
  });
};

export const useDeleteSchedule = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: deleteSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QueryKeys.schedules.all });
    },
    ...options
  });
};

export const useToggleSchedule = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: toggleSchedule,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: QueryKeys.schedules.byId(variables.id) });
      queryClient.invalidateQueries({ queryKey: QueryKeys.schedules.all });
    },
    ...options
  });
};

export const useInvalidateSchedules = () => {
  const queryClient = useQueryClient();
  
  return {
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: QueryKeys.schedules.all }),
    invalidateOne: (id) => queryClient.invalidateQueries({ queryKey: QueryKeys.schedules.byId(id) }),
  };
};
