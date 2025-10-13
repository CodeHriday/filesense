import React, { useState } from 'react';
import { FiEye, FiTrash2 } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import LoadingSpinner from '../components/LoadingSpinner';
import DeleteConfirmationModal from '../components/DeleteConfirmationModal';
import { useFileCatalog, useFileDelete } from '../hooks';
import { QueryKeys } from '../lib/react-query';
import { QualityTooltip } from '../components/QualityTooltip';
import { bulkDeleteFiles } from '../api/fileService';
import './FileCatalog.css';

export const FileCatalog = ({ onFileSelect }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedType, setSelectedType] = useState('all');
  const [deletingFileId, setDeletingFileId] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [fileToDelete, setFileToDelete] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  
  // Using React Query to fetch file catalog
  const { 
    data: fileData, 
    isLoading, 
    error, 
    refetch 
  } = useFileCatalog({
    // Refetching options
    refetchOnWindowFocus: false,  // Don't refetch when window regains focus
    staleTime: 5 * 60 * 1000,     // Consider data fresh for 5 minutes
  });
  
  // File delete mutation
  const deleteFileMutation = useFileDelete({
    onSuccess: () => {
      // Invalidate and refetch the file catalog
      queryClient.invalidateQueries({ queryKey: QueryKeys.files.all });
      setDeletingFileId(null);
      setShowDeleteModal(false);
      setFileToDelete(null);
    },
    onError: (error) => {
      alert(`Failed to delete file: ${error.message}`);
      setDeletingFileId(null);
      setShowDeleteModal(false);
      setFileToDelete(null);
    }
  });
  
  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: bulkDeleteFiles,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QueryKeys.files.all });
      setSelectedFiles([]);
      setShowDeleteModal(false);
      alert(`Successfully deleted ${data.deletedCount} file(s)`);
    },
    onError: (error) => {
      alert(`Failed to delete files: ${error.message}`);
      setShowDeleteModal(false);
    }
  });
  
  // Properly handle the file data format from the API
  const files = fileData || [];

  const handleViewDetails = (file) => {
    navigate(`/profile/${file.file_id}`);
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleSortChange = (e) => {
    setSortBy(e.target.value);
  };

  const handleOrderChange = () => {
    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
  };

  const handleTypeChange = (e) => {
    setSelectedType(e.target.value);
  };

  const handleDelete = (file) => {
    setFileToDelete(file);
    setShowDeleteModal(true);
  };

  const confirmDelete = () => {
    if (fileToDelete) {
      setDeletingFileId(fileToDelete.file_id);
      deleteFileMutation.mutate(fileToDelete.file_id);
    } else if (selectedFiles.length > 0) {
      // Bulk delete
      bulkDeleteMutation.mutate(selectedFiles);
    }
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setFileToDelete(null);
  };
  
  const handleSelectFile = (fileId) => {
    setSelectedFiles(prev => {
      if (prev.includes(fileId)) {
        return prev.filter(id => id !== fileId);
      } else {
        return [...prev, fileId];
      }
    });
  };
  
  const handleSelectAll = () => {
    if (selectedFiles.length === filteredAndSortedFiles.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles(filteredAndSortedFiles.map(file => file.file_id));
    }
  };
  
  const handleBulkDelete = () => {
    if (selectedFiles.length > 0) {
      setShowDeleteModal(true);
    }
  };

  const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getTimeSince = (dateString) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
      if (diffHours === 0) {
        const diffMinutes = Math.floor(diffTime / (1000 * 60));
        return `${diffMinutes} minutes ago`;
      }
      return `${diffHours} hours ago`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else {
      return `${diffDays} days ago`;
    }
  };

  const getQualityClass = (score) => {
    if (score >= 90) return 'high';
    if (score >= 70) return 'medium';
    return 'low';
  };

  // Filter and sort the files
  const filteredAndSortedFiles = files
    .filter(file => {
      // Filter by search term
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = file.filename.toLowerCase().includes(searchLower);
      
      // Filter by file type
      const matchesType = selectedType === 'all' || file.file_type === selectedType;
      
      return matchesSearch && matchesType;
    })
    .sort((a, b) => {
      // Sort based on selected criteria
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.filename.localeCompare(b.filename);
          break;
        case 'date':
          comparison = new Date(a.created_at) - new Date(b.created_at);
          break;
        case 'size':
          comparison = parseInt(a.file_size) - parseInt(b.file_size);
          break;
        case 'rows':
          comparison = a.row_count - b.row_count;
          break;
        case 'quality':
          comparison = parseFloat(a.quality_score) - parseFloat(b.quality_score);
          break;
        default:
          comparison = 0;
      }
      
      // Apply sort order
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  if (isLoading) {
    return (
      <div className="file-catalog-container">
        <h1 className="page-title">File Catalog</h1>
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="file-catalog-container">
        <h1 className="page-title">File Catalog</h1>
        <div className="alert alert-error">
          <p>Failed to fetch file catalog: {error.message}</p>
          <button 
            className="btn btn-primary" 
            onClick={() => refetch()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="file-catalog-container">
      <h1 className="page-title">File Catalog</h1>
      
      <div className="catalog-controls">
        <div className="search-container">
          <input
            type="text"
            placeholder="Search files..."
            value={searchTerm}
            onChange={handleSearchChange}
            className="search-input"
          />
        </div>
        
        <div className="filter-container">
          {selectedFiles.length > 0 && (
            <button 
              className="bulk-delete-button"
              onClick={handleBulkDelete}
              disabled={bulkDeleteMutation.isPending}
            >
              <FiTrash2 /> Delete Selected ({selectedFiles.length})
            </button>
          )}
          
          <select 
            value={selectedType}
            onChange={handleTypeChange}
            className="filter-select"
          >
            <option value="all">All Types</option>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
            <option value="parquet">Parquet</option>
          </select>
          
          <select 
            value={sortBy}
            onChange={handleSortChange}
            className="sort-select"
          >
            <option value="date">Sort by Date</option>
            <option value="name">Sort by Name</option>
            <option value="size">Sort by Size</option>
            <option value="rows">Sort by Rows</option>
            <option value="quality">Sort by Quality</option>
          </select>
          
          <button 
            className="order-button"
            onClick={handleOrderChange}
            title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>
      
      <div className="file-catalog-table-container">
        {filteredAndSortedFiles.length === 0 ? (
          <div className="no-results">
            <p>No files found matching your criteria.</p>
          </div>
        ) : (
          <table className="file-catalog-table">
            <thead>
              <tr>
                <th className="checkbox-cell">
                  <input
                    type="checkbox"
                    checked={selectedFiles.length === filteredAndSortedFiles.length && filteredAndSortedFiles.length > 0}
                    onChange={handleSelectAll}
                    title="Select all files"
                  />
                </th>
                <th>File Name</th>
                <th>Type</th>
                <th>Size</th>
                <th>Rows</th>
                <th>Columns</th>
                <th>Uploaded</th>
                <th>Quality</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedFiles.map(file => (
                <tr key={file.file_id}>
                  <td className="checkbox-cell">
                    <input
                      type="checkbox"
                      checked={selectedFiles.includes(file.file_id)}
                      onChange={() => handleSelectFile(file.file_id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="file-name-cell">
                    <span className="file-icon">
                      {file.file_type === 'csv' ? '📄' : 
                       file.file_type === 'json' ? '🔠' : '📊'}
                    </span>
                    <span className="file-name">{file.filename}</span>
                  </td>
                  <td>
                    <span className="file-type-badge">{file.file_type.toUpperCase()}</span>
                  </td>
                  <td>{formatBytes(parseInt(file.file_size))}</td>
                  <td>{file.row_count.toLocaleString()}</td>
                  <td>{file.column_count}</td>
                  <td title={formatDate(file.created_at)}>
                    {getTimeSince(file.created_at)}
                  </td>
                  <td>
                    <QualityTooltip 
                      score={parseFloat(file.quality_score)}
                      components={{
                        completeness: file.quality_components?.completeness || 95,
                        consistency: file.quality_components?.consistency || 85,
                        validity: file.quality_components?.validity || 80,
                        uniqueness: file.quality_components?.uniqueness || 75,
                        timeliness: file.quality_components?.timeliness || 90
                      }}
                      position="top"
                      animated={true}
                    >
                      <span className={`quality-score ${getQualityClass(parseFloat(file.quality_score))}`}>
                        {parseFloat(file.quality_score).toFixed(1)}%
                      </span>
                    </QualityTooltip>
                  </td>
                  <td className="actions-cell">
                    <button
                      className="icon-button view-button"
                      onClick={() => handleViewDetails(file)}
                      title="View Details"
                    >
                      <FiEye />
                    </button>
                    <button
                      className="icon-button delete-button"
                      onClick={() => handleDelete(file)}
                      disabled={deletingFileId === file.file_id}
                      title="Delete"
                    >
                      <FiTrash2 />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={closeDeleteModal}
        onConfirm={confirmDelete}
        fileName={fileToDelete ? fileToDelete.filename : `${selectedFiles.length} files`}
        isDeleting={fileToDelete ? (deletingFileId === fileToDelete.file_id) : bulkDeleteMutation.isPending}
      />
    </div>
  );
};