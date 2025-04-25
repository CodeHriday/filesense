/**
 * File-related React Query hooks
 * 
 * This file contains React Query hooks for file operations including
 * fetching files, getting file details, and managing file uploads.
 */
import { useQuery, useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { queryClient, QueryKeys } from '../lib/react-query';
import { API_BASE_URL } from '../config';

const API_URL = `${API_BASE_URL}/api`;

/**
 * Hook for fetching file catalog
 */
export const useFileCatalog = (options = {}) => {
  return useQuery({
    queryKey: QueryKeys.files.all,
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/files`);
      return response.data;
    },
    ...options,
  });
};

/**
 * Hook for fetching a single file by ID
 */
export const useFile = (fileId, options = {}) => {
  return useQuery({
    queryKey: QueryKeys.files.byId(fileId),
    queryFn: async () => {
      if (!fileId) return null;
      const response = await axios.get(`${API_URL}/files/${fileId}`);
      return response.data;
    },
    enabled: !!fileId,
    ...options,
  });
};

/**
 * Hook for fetching file profile data
 */
export const useFileProfile = (fileId, options = {}) => {
  return useQuery({
    queryKey: QueryKeys.files.profile(fileId),
    queryFn: async () => {
      if (!fileId) return null;
      const response = await axios.get(`${API_URL}/files/${fileId}/profile`);
      return response.data;
    },
    enabled: !!fileId,
    ...options,
  });
};

/**
 * Hook for fetching file quality data
 */
export const useFileQuality = (fileId, options = {}) => {
  return useQuery({
    queryKey: QueryKeys.files.quality(fileId),
    queryFn: async () => {
      if (!fileId) return null;
      const response = await axios.get(`${API_URL}/files/${fileId}/quality`);
      return response.data;
    },
    enabled: !!fileId,
    ...options,
  });
};

/**
 * Hook for uploading files
 */
export const useFileUpload = (options = {}) => {
  return useMutation({
    mutationFn: async ({ file, progressCallback }) => {
      const formData = new FormData();
      formData.append('file', file);
      
      // Upload configuration
      const config = {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 1800000, // 30 minutes
      };
      
      // Add progress tracking if provided
      if (progressCallback && typeof progressCallback === 'function') {
        config.onUploadProgress = progressCallback;
      }
      
      const response = await axios.post(`${API_URL}/files/upload`, formData, config);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate files cache to trigger a refresh
      queryClient.invalidateQueries({ queryKey: QueryKeys.files.all });
    },
    ...options,
  });
};

/**
 * Hook for running quality checks
 */
export const useRunQualityCheck = (options = {}) => {
  return useMutation({
    mutationFn: async ({ fileId, rules = [] }) => {
      const response = await axios.post(`${API_URL}/files/${fileId}/quality-check`, { 
        rules,
        anomalyDetection: true,
        calculateReliabilityScore: true
      });
      return response.data;
    },
    onSuccess: (_, variables) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: QueryKeys.files.quality(variables.fileId) });
    },
    ...options,
  });
};

/**
 * Hook for deleting a file
 */
export const useDeleteFile = (options = {}) => {
  return useMutation({
    mutationFn: async (fileId) => {
      const response = await axios.delete(`${API_URL}/files/${fileId}`);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate files cache to trigger a refresh
      queryClient.invalidateQueries({ queryKey: QueryKeys.files.all });
    },
    ...options,
  });
};