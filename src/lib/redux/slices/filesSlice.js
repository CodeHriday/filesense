/**
 * Files Slice
 * 
 * Redux slice for managing file-related state, including:
 * - File catalog
 * - File upload status
 * - Selected files
 * - File preview data
 */
import { createSlice } from '@reduxjs/toolkit';

// Initial state
const initialState = {
  fileCatalog: {
    files: [],
    loading: false,
    error: null,
    lastUpdated: null,
  },
  uploads: {
    active: [],
    history: [],
    totalUploaded: 0,
    totalFailed: 0,
  },
  selection: {
    selectedFileIds: [],
    currentFileId: null,
  },
  filePreview: {
    data: null,
    loading: false,
    error: null,
  },
  filters: {
    search: '',
    fileTypes: [],
    dateRange: null,
    qualityRange: null,
    sortBy: 'created_at',
    sortDirection: 'desc',
  },
};

// Create slice
const filesSlice = createSlice({
  name: 'files',
  initialState,
  reducers: {
    // File catalog actions
    setFileCatalog: (state, action) => {
      state.fileCatalog.files = action.payload;
      state.fileCatalog.lastUpdated = Date.now();
    },
    addFileToCollection: (state, action) => {
      // Check if file already exists
      const fileExists = state.fileCatalog.files.some(
        file => file.file_id === action.payload.file_id
      );
      
      if (!fileExists) {
        state.fileCatalog.files.unshift(action.payload);
      }
    },
    updateFileInCollection: (state, action) => {
      const { file_id, updates } = action.payload;
      const fileIndex = state.fileCatalog.files.findIndex(
        file => file.file_id === file_id
      );
      
      if (fileIndex !== -1) {
        state.fileCatalog.files[fileIndex] = {
          ...state.fileCatalog.files[fileIndex],
          ...updates,
        };
      }
    },
    removeFileFromCollection: (state, action) => {
      const fileId = action.payload;
      state.fileCatalog.files = state.fileCatalog.files.filter(
        file => file.file_id !== fileId
      );
    },
    setFileCatalogLoading: (state, action) => {
      state.fileCatalog.loading = action.payload;
    },
    setFileCatalogError: (state, action) => {
      state.fileCatalog.error = action.payload;
    },
    
    // Upload actions
    addUpload: (state, action) => {
      state.uploads.active.push(action.payload);
    },
    updateUpload: (state, action) => {
      const { id, updates } = action.payload;
      const uploadIndex = state.uploads.active.findIndex(upload => upload.id === id);
      
      if (uploadIndex !== -1) {
        state.uploads.active[uploadIndex] = {
          ...state.uploads.active[uploadIndex],
          ...updates,
        };
      }
    },
    completeUpload: (state, action) => {
      const { id, success } = action.payload;
      
      // Find the upload
      const uploadIndex = state.uploads.active.findIndex(upload => upload.id === id);
      
      if (uploadIndex !== -1) {
        // Add to history
        state.uploads.history.unshift({
          ...state.uploads.active[uploadIndex],
          completedAt: Date.now(),
          success,
        });
        
        // Update counts
        if (success) {
          state.uploads.totalUploaded += 1;
        } else {
          state.uploads.totalFailed += 1;
        }
        
        // Remove from active
        state.uploads.active.splice(uploadIndex, 1);
      }
    },
    clearCompletedUploads: (state) => {
      state.uploads.history = [];
    },
    
    // Selection actions
    selectFiles: (state, action) => {
      state.selection.selectedFileIds = action.payload;
    },
    addSelectedFile: (state, action) => {
      const fileId = action.payload;
      if (!state.selection.selectedFileIds.includes(fileId)) {
        state.selection.selectedFileIds.push(fileId);
      }
    },
    removeSelectedFile: (state, action) => {
      const fileId = action.payload;
      state.selection.selectedFileIds = state.selection.selectedFileIds.filter(
        id => id !== fileId
      );
    },
    clearSelectedFiles: (state) => {
      state.selection.selectedFileIds = [];
    },
    setCurrentFile: (state, action) => {
      state.selection.currentFileId = action.payload;
    },
    
    // File preview actions
    setFilePreview: (state, action) => {
      state.filePreview.data = action.payload;
      state.filePreview.loading = false;
      state.filePreview.error = null;
    },
    setFilePreviewLoading: (state, action) => {
      state.filePreview.loading = action.payload;
    },
    setFilePreviewError: (state, action) => {
      state.filePreview.error = action.payload;
      state.filePreview.loading = false;
    },
    clearFilePreview: (state) => {
      state.filePreview.data = null;
      state.filePreview.loading = false;
      state.filePreview.error = null;
    },
    
    // Filter actions
    setSearchFilter: (state, action) => {
      state.filters.search = action.payload;
    },
    setFileTypeFilter: (state, action) => {
      state.filters.fileTypes = action.payload;
    },
    setDateRangeFilter: (state, action) => {
      state.filters.dateRange = action.payload;
    },
    setQualityRangeFilter: (state, action) => {
      state.filters.qualityRange = action.payload;
    },
    setSortBy: (state, action) => {
      state.filters.sortBy = action.payload;
    },
    setSortDirection: (state, action) => {
      state.filters.sortDirection = action.payload;
    },
    clearFilters: (state) => {
      state.filters = initialState.filters;
    },
  },
});

// Export actions
export const {
  setFileCatalog,
  addFileToCollection,
  updateFileInCollection,
  removeFileFromCollection,
  setFileCatalogLoading,
  setFileCatalogError,
  addUpload,
  updateUpload,
  completeUpload,
  clearCompletedUploads,
  selectFiles,
  addSelectedFile,
  removeSelectedFile,
  clearSelectedFiles,
  setCurrentFile,
  setFilePreview,
  setFilePreviewLoading,
  setFilePreviewError,
  clearFilePreview,
  setSearchFilter,
  setFileTypeFilter,
  setDateRangeFilter,
  setQualityRangeFilter,
  setSortBy,
  setSortDirection,
  clearFilters,
} = filesSlice.actions;

// Selectors
export const selectFileCatalog = (state) => state.files.fileCatalog.files;
export const selectFileCatalogLoading = (state) => state.files.fileCatalog.loading;
export const selectFileCatalogError = (state) => state.files.fileCatalog.error;
export const selectFileCatalogLastUpdated = (state) => state.files.fileCatalog.lastUpdated;
export const selectActiveUploads = (state) => state.files.uploads.active;
export const selectUploadHistory = (state) => state.files.uploads.history;
export const selectTotalUploaded = (state) => state.files.uploads.totalUploaded;
export const selectTotalFailed = (state) => state.files.uploads.totalFailed;
export const selectSelectedFileIds = (state) => state.files.selection.selectedFileIds;
export const selectCurrentFileId = (state) => state.files.selection.currentFileId;
export const selectFilePreview = (state) => state.files.filePreview.data;
export const selectFilePreviewLoading = (state) => state.files.filePreview.loading;
export const selectFilePreviewError = (state) => state.files.filePreview.error;
export const selectFilters = (state) => state.files.filters;

// Utility selector to get a file by ID
export const selectFileById = (state, fileId) => {
  return state.files.fileCatalog.files.find(file => file.file_id === fileId);
};

// Utility selector to get the current file
export const selectCurrentFile = (state) => {
  const currentFileId = selectCurrentFileId(state);
  return currentFileId ? selectFileById(state, currentFileId) : null;
};

// Utility selector to get filtered files
export const selectFilteredFiles = (state) => {
  const files = selectFileCatalog(state);
  const filters = selectFilters(state);
  
  // Apply search filter
  let filteredFiles = files;
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filteredFiles = filteredFiles.filter(file => 
      file.filename.toLowerCase().includes(searchLower)
    );
  }
  
  // Apply file type filter
  if (filters.fileTypes && filters.fileTypes.length > 0) {
    filteredFiles = filteredFiles.filter(file => 
      filters.fileTypes.includes(file.file_type)
    );
  }
  
  // Apply date range filter
  if (filters.dateRange) {
    const { start, end } = filters.dateRange;
    filteredFiles = filteredFiles.filter(file => {
      const fileDate = new Date(file.created_at);
      if (start && end) {
        return fileDate >= start && fileDate <= end;
      } else if (start) {
        return fileDate >= start;
      } else if (end) {
        return fileDate <= end;
      }
      return true;
    });
  }
  
  // Apply quality range filter
  if (filters.qualityRange) {
    const { min, max } = filters.qualityRange;
    filteredFiles = filteredFiles.filter(file => {
      const quality = parseFloat(file.quality_score);
      if (min !== undefined && max !== undefined) {
        return quality >= min && quality <= max;
      } else if (min !== undefined) {
        return quality >= min;
      } else if (max !== undefined) {
        return quality <= max;
      }
      return true;
    });
  }
  
  // Apply sorting
  const { sortBy, sortDirection } = filters;
  filteredFiles = [...filteredFiles].sort((a, b) => {
    if (sortBy === 'quality_score') {
      const qualityA = parseFloat(a.quality_score) || 0;
      const qualityB = parseFloat(b.quality_score) || 0;
      return sortDirection === 'asc' ? qualityA - qualityB : qualityB - qualityA;
    }
    
    if (sortBy === 'file_size') {
      const sizeA = parseInt(a.file_size, 10) || 0;
      const sizeB = parseInt(b.file_size, 10) || 0;
      return sortDirection === 'asc' ? sizeA - sizeB : sizeB - sizeA;
    }
    
    if (sortBy === 'filename') {
      return sortDirection === 'asc'
        ? a.filename.localeCompare(b.filename)
        : b.filename.localeCompare(a.filename);
    }
    
    // Default sort by date
    const dateA = new Date(a[sortBy] || a.created_at);
    const dateB = new Date(b[sortBy] || b.created_at);
    return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
  });
  
  return filteredFiles;
};

export default filesSlice.reducer;