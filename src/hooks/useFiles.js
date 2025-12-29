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
import { QueryKeys, STALE_TIMES, CACHE_TIMES } from '../lib/react-query';

/**
 * Hook for fetching the file catalog
 * Uses 30-second stale time for fast-changing file data
 * refetchOnMount: false - reuses cache on navigation, only refetches if stale
 */
export const useFileCatalog = (options = {}) => {
  return useQuery({
    queryKey: QueryKeys.files.all,
    queryFn: getFileCatalog,
    staleTime: STALE_TIMES.FILES,
    cacheTime: CACHE_TIMES.SHORT,
    refetchOnMount: false,
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
    enabled: !!fileId,
    staleTime: STALE_TIMES.FILES,
    cacheTime: CACHE_TIMES.SHORT,
    refetchOnMount: false,
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
    staleTime: STALE_TIMES.STANDARD,
    cacheTime: CACHE_TIMES.STANDARD,
    refetchOnMount: false,
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
    staleTime: STALE_TIMES.STANDARD,
    cacheTime: CACHE_TIMES.STANDARD,
    refetchOnMount: false,
    ...options
  });
};

/**
 * Hook for uploading a file
 * Invalidates file catalog cache immediately after upload
 */
export const useFileUpload = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ file, progressCallback }) => uploadFile(file, progressCallback),
    onSuccess: () => {
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
      queryClient.invalidateQueries({ 
        queryKey: QueryKeys.files.quality(variables.fileId) 
      });
    },
    ...options
  });
};

/**
 * Hook for deleting a file
 * Invalidates file catalog cache immediately after deletion
 */
export const useFileDelete = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (fileId) => deleteFile(fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QueryKeys.files.all });
    },
    ...options
  });
};

/**
 * Utility hook to invalidate all file-related caches
 * Use after bulk operations or when data needs immediate refresh
 */
export const useInvalidateFiles = () => {
  const queryClient = useQueryClient();
  
  return {
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: QueryKeys.files.all }),
    invalidateFile: (fileId) => queryClient.invalidateQueries({ queryKey: QueryKeys.files.byId(fileId) }),
    invalidateProfile: (fileId) => queryClient.invalidateQueries({ queryKey: QueryKeys.files.profile(fileId) }),
    invalidateQuality: (fileId) => queryClient.invalidateQueries({ queryKey: QueryKeys.files.quality(fileId) }),
  };
};