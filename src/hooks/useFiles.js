/**
 * Files Hook
 * 
 * Custom hook for managing file operations and state.
 */
import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  setFileCatalog, 
  addFileToCollection, 
  updateFileInCollection,
  removeFileFromCollection,
  setFileCatalogLoading,
  setFileCatalogError,
  addUpload,
  updateUpload,
  completeUpload,
  selectFiles,
  setCurrentFile,
  setFilePreview,
  setFilePreviewLoading,
  setFilePreviewError,
  clearFilePreview,
  selectFileCatalog,
  selectFileCatalogLoading,
  selectFileCatalogError,
  selectActiveUploads,
  selectUploadHistory,
  selectSelectedFileIds,
  selectCurrentFileId,
  selectFilePreview,
  selectFilePreviewLoading,
  selectFilePreviewError,
  selectFilteredFiles
} from '../lib/redux/slices/filesSlice';
import { QueryKeys, QueryUtils } from '../lib/react-query';
import { API_BASE_URL } from '../config';
import { v4 as uuidv4 } from 'uuid';

/**
 * Main hook for file operations
 */
export const useFiles = () => {
  const dispatch = useDispatch();
  const queryClient = useQueryClient();
  
  // Selectors
  const files = useSelector(selectFileCatalog);
  const isLoading = useSelector(selectFileCatalogLoading);
  const error = useSelector(selectFileCatalogError);
  const activeUploads = useSelector(selectActiveUploads);
  const uploadHistory = useSelector(selectUploadHistory);
  const selectedFileIds = useSelector(selectSelectedFileIds);
  const currentFileId = useSelector(selectCurrentFileId);
  const filePreview = useSelector(selectFilePreview);
  const filePreviewLoading = useSelector(selectFilePreviewLoading);
  const filePreviewError = useSelector(selectFilePreviewError);
  const filteredFiles = useSelector(selectFilteredFiles);
  
  // API functions
  const fetchFiles = async () => {
    const response = await fetch(`${API_BASE_URL}/api/files`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to fetch files');
    }
    
    return await response.json();
  };
  
  const fetchFileDetails = async (fileId) => {
    const response = await fetch(`${API_BASE_URL}/api/files/${fileId}`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to fetch file details');
    }
    
    return await response.json();
  };
  
  const fetchFilePreview = async (fileId) => {
    const response = await fetch(`${API_BASE_URL}/api/files/${fileId}/preview`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to fetch file preview');
    }
    
    return await response.json();
  };
  
  const deleteFile = async (fileId) => {
    const response = await fetch(`${API_BASE_URL}/api/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to delete file');
    }
    
    return await response.json();
  };
  
  const uploadFile = async ({ file, options = {} }) => {
    // Create a unique upload ID
    const uploadId = uuidv4();
    
    // Add upload to state
    dispatch(addUpload({
      id: uploadId,
      filename: file.name,
      size: file.size,
      type: file.type,
      progress: 0,
      status: 'preparing',
      startedAt: Date.now(),
      error: null,
      ...options,
    }));
    
    try {
      // Create FormData
      const formData = new FormData();
      formData.append('file', file);
      
      // Add options to FormData
      if (options.description) {
        formData.append('description', options.description);
      }
      
      if (options.tags) {
        formData.append('tags', JSON.stringify(options.tags));
      }
      
      // Create upload request
      const xhr = new XMLHttpRequest();
      
      // Setup progress handler
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded * 100) / event.total);
          
          dispatch(updateUpload({
            id: uploadId,
            updates: {
              progress,
              status: progress < 100 ? 'uploading' : 'processing',
            },
          }));
        }
      });
      
      // Create promise for response
      const uploadPromise = new Promise((resolve, reject) => {
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } else {
            let errorMessage = 'Upload failed';
            try {
              const errorResponse = JSON.parse(xhr.responseText);
              errorMessage = errorResponse.message || errorMessage;
            } catch (e) {
              // Ignore parse error
            }
            reject(new Error(errorMessage));
          }
        });
        
        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'));
        });
        
        xhr.addEventListener('abort', () => {
          reject(new Error('Upload aborted'));
        });
      });
      
      // Start upload
      xhr.open('POST', `${API_BASE_URL}/api/files/upload`);
      xhr.send(formData);
      
      // Wait for response
      const response = await uploadPromise;
      
      // Update upload status
      dispatch(completeUpload({
        id: uploadId,
        success: true,
      }));
      
      // Add file to catalog
      dispatch(addFileToCollection(response));
      
      // Invalidate file queries
      QueryUtils.invalidateFiles();
      
      return response;
    } catch (error) {
      // Update upload with error
      dispatch(updateUpload({
        id: uploadId,
        updates: {
          status: 'error',
          error: error.message,
        },
      }));
      
      // Mark upload as failed
      dispatch(completeUpload({
        id: uploadId,
        success: false,
      }));
      
      throw error;
    }
  };
  
  // Queries
  const filesQuery = useQuery({
    queryKey: QueryKeys.files.all,
    queryFn: fetchFiles,
    onSuccess: (data) => {
      dispatch(setFileCatalog(data));
    },
    onError: (error) => {
      dispatch(setFileCatalogError(error.message));
    },
  });
  
  const fileDetailsQuery = (fileId) => useQuery({
    queryKey: QueryKeys.files.detail(fileId),
    queryFn: () => fetchFileDetails(fileId),
    enabled: !!fileId,
  });
  
  const filePreviewQuery = (fileId) => useQuery({
    queryKey: QueryKeys.files.preview(fileId),
    queryFn: () => fetchFilePreview(fileId),
    enabled: !!fileId,
    onSuccess: (data) => {
      dispatch(setFilePreview(data));
    },
    onError: (error) => {
      dispatch(setFilePreviewError(error.message));
    },
  });
  
  // Mutations
  const uploadFileMutation = useMutation({
    mutationFn: uploadFile,
  });
  
  const deleteFileMutation = useMutation({
    mutationFn: deleteFile,
    onSuccess: (_, fileId) => {
      dispatch(removeFileFromCollection(fileId));
      QueryUtils.invalidateFiles();
    },
  });
  
  // Action handlers
  const handleFetchFiles = useCallback(() => {
    dispatch(setFileCatalogLoading(true));
    return filesQuery.refetch();
  }, [dispatch, filesQuery]);
  
  const handleUploadFile = useCallback((file, options) => {
    return uploadFileMutation.mutateAsync({ file, options });
  }, [uploadFileMutation]);
  
  const handleDeleteFile = useCallback((fileId) => {
    return deleteFileMutation.mutateAsync(fileId);
  }, [deleteFileMutation]);
  
  const handleSelectFiles = useCallback((fileIds) => {
    dispatch(selectFiles(Array.isArray(fileIds) ? fileIds : [fileIds]));
  }, [dispatch]);
  
  const handleSetCurrentFile = useCallback((fileId) => {
    dispatch(setCurrentFile(fileId));
  }, [dispatch]);
  
  const handleFetchFilePreview = useCallback((fileId) => {
    dispatch(setFilePreviewLoading(true));
    return filePreviewQuery(fileId).refetch();
  }, [dispatch, filePreviewQuery]);
  
  const handleClearFilePreview = useCallback(() => {
    dispatch(clearFilePreview());
  }, [dispatch]);
  
  return {
    // State
    files,
    filteredFiles,
    isLoading,
    error,
    activeUploads,
    uploadHistory,
    selectedFileIds,
    currentFileId,
    filePreview,
    filePreviewLoading,
    filePreviewError,
    
    // Queries
    filesQuery,
    fileDetailsQuery,
    filePreviewQuery,
    
    // Actions
    fetchFiles: handleFetchFiles,
    uploadFile: handleUploadFile,
    deleteFile: handleDeleteFile,
    selectFiles: handleSelectFiles,
    setCurrentFile: handleSetCurrentFile,
    fetchFilePreview: handleFetchFilePreview,
    clearFilePreview: handleClearFilePreview,
  };
};

export default useFiles;