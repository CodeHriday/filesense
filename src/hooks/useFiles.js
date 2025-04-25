import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getFileCatalog, 
  getFileDetails, 
  getFileProfile, 
  getFileQuality, 
  uploadFile, 
  runQualityCheck, 
  deleteFile 
} from '../api/fileService';
import { QueryKeys } from '../lib/react-query';

/**
 * Hook for fetching the file catalog
 */
export const useFileCatalog = (options = {}) => {
  return useQuery({
    queryKey: QueryKeys.files.all,
    queryFn: getFileCatalog,
    ...options
  });
};

/**
 * Hook for fetching a specific file's details
 */
export const useFileDetails = (fileId, options = {}) => {
  return useQuery({
    queryKey: QueryKeys.files.byId(fileId),
    queryFn: () => getFileDetails(fileId),
    enabled: !!fileId, // Only run the query if fileId is provided
    ...options
  });
};

/**
 * Hook for fetching a file's profile information
 */
export const useFileProfile = (fileId, options = {}) => {
  return useQuery({
    queryKey: QueryKeys.files.profile(fileId),
    queryFn: () => getFileProfile(fileId),
    enabled: !!fileId,
    ...options
  });
};

/**
 * Hook for fetching a file's quality metrics
 */
export const useFileQuality = (fileId, options = {}) => {
  return useQuery({
    queryKey: QueryKeys.files.quality(fileId),
    queryFn: () => getFileQuality(fileId),
    enabled: !!fileId,
    ...options
  });
};

/**
 * Hook for uploading a file
 */
export const useFileUpload = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ file, progressCallback }) => uploadFile(file, progressCallback),
    onSuccess: () => {
      // Invalidate and refetch the file catalog query after successful upload
      queryClient.invalidateQueries({ queryKey: QueryKeys.files.all });
    },
    ...options
  });
};

/**
 * Hook for running quality checks on a file
 */
export const useRunQualityCheck = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ fileId, rules }) => runQualityCheck(fileId, rules),
    onSuccess: (data, variables) => {
      // Invalidate and refetch the quality data for this file
      queryClient.invalidateQueries({ 
        queryKey: QueryKeys.files.quality(variables.fileId) 
      });
    },
    ...options
  });
};

/**
 * Hook for deleting a file
 */
export const useFileDelete = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (fileId) => deleteFile(fileId),
    onSuccess: () => {
      // Invalidate and refetch the file catalog query after successful deletion
      queryClient.invalidateQueries({ queryKey: QueryKeys.files.all });
    },
    ...options
  });
};