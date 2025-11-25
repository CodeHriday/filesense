import React, { useState, useEffect } from 'react';
import { FiEye, FiTrash2, FiAlertTriangle, FiGitBranch, FiLock } from 'react-icons/fi';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import LoadingSpinner from '../components/LoadingSpinner';
import ConfirmationModal from '../components/ConfirmationModal';
import SimpleSuccessModal from '../components/SimpleSuccessModal';
import PageHeader from '../components/PageHeader';
import { useFileCatalog, useFileDelete } from '../hooks';
import { QueryKeys } from '../lib/react-query';
import { QualityTooltip } from '../components/QualityTooltip';
import { DLQBadge } from '../components/DLQBadge';
import { PasswordInputModal } from '../components/PasswordInputModal';
import { bulkDeleteFiles, submitFilePassword } from '../api/fileService';
import './FileCatalog.css';

export const FileCatalog = ({ onFileSelect }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedProject, setSelectedProject] = useState('all');
  const [selectedSubProject, setSelectedSubProject] = useState('all');
  const [deletingFileId, setDeletingFileId] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [fileToDelete, setFileToDelete] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordModalFile, setPasswordModalFile] = useState(null);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  
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

  // Auto-refresh file catalog when navigating to this page
  useEffect(() => {
    // Refetch the file catalog to show newly uploaded files
    refetch();
  }, []); // Empty dependency array means this runs once when component mounts
  
  // Handle project filter from URL parameter
  useEffect(() => {
    const projectParam = searchParams.get('project');
    if (projectParam) {
      setSelectedProject(parseInt(projectParam));
    } else {
      setSelectedProject(null);
    }
  }, [searchParams]);
  
  // File delete mutation
  const deleteFileMutation = useFileDelete({
    onSuccess: () => {
      // Invalidate and refetch the file catalog
      queryClient.invalidateQueries({ queryKey: QueryKeys.files.all });
      setDeletingFileId(null);
      setShowDeleteModal(false);
      setFileToDelete(null);
      setSuccessMessage('File deleted successfully');
      setShowSuccessModal(true);
    },
    onError: (error) => {
      setErrorMessage(`Failed to delete file: ${error.message}`);
      setShowErrorModal(true);
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
      setSuccessMessage(`Successfully deleted ${data.deletedCount} file(s)`);
      setShowSuccessModal(true);
    },
    onError: (error) => {
      setErrorMessage(`Failed to delete files: ${error.message}`);
      setShowErrorModal(true);
      setShowDeleteModal(false);
    }
  });
  
  // Properly handle the file data format from the API
  const files = fileData || [];
  
  // Get unique projects for filtering
  const uniqueProjects = React.useMemo(() => {
    const projects = files
      .filter(f => f.project_id)
      .map(f => ({ id: f.project_id, name: f.project_name }))
      .filter((p, index, self) => self.findIndex(s => s.id === p.id) === index);
    return projects;
  }, [files]);
  
  // Get unique sub-projects for the selected project
  const uniqueSubProjects = React.useMemo(() => {
    if (selectedProject === 'all') return [];
    
    const subProjects = files
      .filter(f => f.project_id === selectedProject && f.sub_project_id)
      .map(f => ({ id: f.sub_project_id, name: f.sub_project_name }))
      .filter((sp, index, self) => self.findIndex(s => s.id === sp.id) === index);
    return subProjects;
  }, [files, selectedProject]);
  
  // Auto-select first project and subproject on initial load
  useEffect(() => {
    if (uniqueProjects.length > 0 && selectedProject === 'all') {
      setSelectedProject(uniqueProjects[0].id);
    }
  }, [uniqueProjects]);
  
  // Auto-select "Select a subproject" when project changes
  useEffect(() => {
    if (selectedProject !== 'all') {
      setSelectedSubProject('none');
    }
  }, [selectedProject, uniqueSubProjects]);

  const handleViewDetails = (file) => {
    navigate(`/profile/${encodeURIComponent(file.file_id)}`);
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
    console.log('[DELETE BUTTON CLICKED] File:', file);
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
    const currentPageFileIds = paginatedFiles.map(file => file.file_id);
    const allCurrentPageSelected = currentPageFileIds.every(id => selectedFiles.includes(id));
    
    if (allCurrentPageSelected) {
      // Deselect all files on current page
      setSelectedFiles(prev => prev.filter(id => !currentPageFileIds.includes(id)));
    } else {
      // Select all files on current page
      const newSelection = [...new Set([...selectedFiles, ...currentPageFileIds])];
      setSelectedFiles(newSelection);
    }
  };
  
  const handleBulkDelete = () => {
    if (selectedFiles.length > 0) {
      setShowDeleteModal(true);
    }
  };

  // Password modal handlers
  const handleProvidePassword = (file) => {
    setPasswordModalFile(file);
    setShowPasswordModal(true);
  };

  const closePasswordModal = () => {
    setShowPasswordModal(false);
    setPasswordModalFile(null);
    setIsSubmittingPassword(false);
  };

  // Password submission mutation
  const passwordSubmissionMutation = useMutation({
    mutationFn: ({ fileId, password }) => submitFilePassword(fileId, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QueryKeys.files.all });
      closePasswordModal();
      setSuccessMessage('Password submitted successfully. File processing has been requeued.');
      setShowSuccessModal(true);
    },
    onError: (error) => {
      setErrorMessage(`Failed to submit password: ${error.message}`);
      setShowErrorModal(true);
      setIsSubmittingPassword(false);
    }
  });

  const handleSubmitPassword = (password) => {
    if (!passwordModalFile) return;
    
    setIsSubmittingPassword(true);
    passwordSubmissionMutation.mutate({
      fileId: passwordModalFile.file_id,
      password
    });
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

  const getHeaderValidationInfo = (file) => {
    const headerValidation = file.metadata?.header_validation;
    if (!headerValidation) return null;
    
    const hasIssues = headerValidation.issues_found > 0 || headerValidation.status !== 'healthy';
    if (!hasIssues) return null;
    
    return {
      issuesCount: headerValidation.issues_found || 0,
      status: headerValidation.status || 'warning',
      issues: headerValidation.issues || []
    };
  };

  // Filter and sort the files (MUST be before any conditional returns)
  const filteredAndSortedFiles = files
    .filter(file => {
      // Filter by search term
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = file.filename.toLowerCase().includes(searchLower) ||
        (file.project_name || '').toLowerCase().includes(searchLower) ||
        (file.sub_project_name || '').toLowerCase().includes(searchLower);
      
      // Filter by file type
      const matchesType = selectedType === 'all' || file.file_type === selectedType;
      
      // Filter by project
      const matchesProject = selectedProject === 'all' || file.project_id === selectedProject;
      
      // Filter by sub-project
      let matchesSubProject;
      if (selectedSubProject === 'all') {
        matchesSubProject = true;
      } else if (selectedSubProject === 'none') {
        matchesSubProject = !file.sub_project_id;
      } else {
        matchesSubProject = file.sub_project_id === selectedSubProject;
      }
      
      return matchesSearch && matchesType && matchesProject && matchesSubProject;
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

  // Pagination calculations
  const totalItems = filteredAndSortedFiles.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedFiles = filteredAndSortedFiles.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedType, sortBy, sortOrder, selectedProject]);

  // Pagination handlers
  const handlePageChange = (page) => {
    setCurrentPage(page);
    setSelectedFiles([]); // Clear selection when changing pages
  };

  const handleItemsPerPageChange = (e) => {
    setItemsPerPage(Number(e.target.value));
    setCurrentPage(1);
    setSelectedFiles([]);
  };

  // Render individual file row
  const renderFileRow = (file) => {
    const headerInfo = getHeaderValidationInfo(file);
    
    return (
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}>
            <span className="file-name">{file.filename}</span>
            {file.has_schema_changes && (
              <span 
                className="schema-changed-indicator" 
                title="Schema has changed from previous upload"
              >
                <FiGitBranch /> Schema Changed
              </span>
            )}
            {file.processing_error && (
              <span 
                className="file-error-indicator" 
                title={`Processing failed: ${file.processing_error}`}
              >
                ⚠️
              </span>
            )}
          </div>
        </td>
        <td>
          <span className="file-type-badge">{file.file_type?.toUpperCase() || 'N/A'}</span>
        </td>
        <td>{file.file_size ? formatBytes(parseInt(file.file_size)) : '-'}</td>
        <td>
          {file.processing_error ? (
            <DLQBadge 
              reasonCode={file.failure_reason_code} 
              errorMessage={file.processing_error}
              compact={true}
            />
          ) : (
            file.row_count != null ? file.row_count.toLocaleString() : '-'
          )}
        </td>
        <td>
          {file.processing_error ? (
            <DLQBadge 
              reasonCode={file.failure_reason_code} 
              errorMessage={file.processing_error}
              compact={false}
            />
          ) : (
            file.column_count || '-'
          )}
        </td>
        <td title={file.created_at ? formatDate(file.created_at) : ''}>
          {file.created_at ? getTimeSince(file.created_at) : '-'}
        </td>
        <td>
          <div className="quality-cell">
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
            {headerInfo && (
              <span 
                className={`header-validation-badge ${headerInfo.status === 'critical' ? 'critical' : 'warning'}`}
                title={headerInfo.issues.map(issue => issue.message).join('; ')}
              >
                <FiAlertTriangle /> {headerInfo.issuesCount}
              </span>
            )}
          </div>
        </td>
        <td className="actions-cell">
          <div style={{ display: 'flex', gap: '0.5rem', whiteSpace: 'nowrap' }}>
            {file.failure_reason_code === 'password_missing' && (
              <button
                className="action-icon-btn password-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleProvidePassword(file);
                }}
                title="Provide Password"
              >
                <FiLock />
              </button>
            )}
            <button
              className="action-icon-btn view-btn"
              onClick={() => handleViewDetails(file)}
              title="View Details"
            >
              <FiEye />
            </button>
            <button
              className="action-icon-btn delete-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(file);
              }}
              disabled={deletingFileId === file.file_id}
              title="Delete"
            >
              <FiTrash2 />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 7;
    
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 4) {
        for (let i = 1; i <= 5; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 3) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  if (isLoading) {
    return (
      <div className="gps-page-container">
        <PageHeader
          title="File Catalog"
          subtitle="All uploaded files with quality metrics and metadata"
          hideHomeButton={true}
        />
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="gps-page-container">
        <PageHeader
          title="File Catalog"
          subtitle="All uploaded files with quality metrics and metadata"
          hideHomeButton={true}
        />
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
    <div className="gps-page-container">
      <PageHeader
        title="File Catalog"
        subtitle="All uploaded files with quality metrics and metadata"
        hideHomeButton={true}
        actions={
          <div className="catalog-file-count">
            <strong>{files.length}</strong>
            <span>Total Files</span>
          </div>
        }
      />
      
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
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
            className="filter-select"
          >
            <option value="all">All Projects</option>
            {uniqueProjects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          
          <select 
            value={selectedSubProject}
            onChange={(e) => {
              const value = e.target.value;
              if (value === 'all' || value === 'none') {
                setSelectedSubProject(value);
              } else {
                setSelectedSubProject(parseInt(value));
              }
            }}
            className="filter-select"
            disabled={selectedProject === 'all'}
          >
            <option value="none">Select a subproject</option>
            <option value="all">All Sub-Projects</option>
            {uniqueSubProjects.map(sp => (
              <option key={sp.id} value={sp.id}>{sp.name}</option>
            ))}
          </select>
          
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
          <>
            <div className="pagination-info">
              <span>
                Showing {startIndex + 1}-{Math.min(endIndex, totalItems)} of {totalItems} files
              </span>
              <div className="items-per-page">
                <label htmlFor="itemsPerPage">Items per page:</label>
                <select 
                  id="itemsPerPage"
                  value={itemsPerPage} 
                  onChange={handleItemsPerPageChange}
                  className="items-per-page-select"
                >
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="200">200</option>
                </select>
              </div>
            </div>
            
            <div className="file-table-wrapper">
              <table className="gps-table">
                <thead>
                  <tr>
                    <th className="checkbox-cell">
                      <input
                        type="checkbox"
                        checked={paginatedFiles.length > 0 && paginatedFiles.every(f => selectedFiles.includes(f.file_id))}
                        onChange={() => {
                          const allSelected = paginatedFiles.every(f => selectedFiles.includes(f.file_id));
                          if (allSelected) {
                            setSelectedFiles(prev => prev.filter(id => !paginatedFiles.some(f => f.file_id === id)));
                          } else {
                            const newIds = paginatedFiles.map(f => f.file_id);
                            setSelectedFiles(prev => [...new Set([...prev, ...newIds])]);
                          }
                        }}
                        title="Select all files on this page"
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
                  {paginatedFiles.map(file => renderFileRow(file))}
                </tbody>
              </table>
            </div>
          
            {totalPages > 1 && (
              <div className="pagination-controls">
                <button
                  className="pagination-button"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  Previous
                </button>
                
                <div className="pagination-numbers">
                  {getPageNumbers().map((page, index) => (
                    page === '...' ? (
                      <span key={`ellipsis-${index}`} className="pagination-ellipsis">...</span>
                    ) : (
                      <button
                        key={page}
                        className={`pagination-number ${currentPage === page ? 'active' : ''}`}
                        onClick={() => handlePageChange(page)}
                      >
                        {page}
                      </button>
                    )
                  ))}
                </div>
                
                <button
                  className="pagination-button"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={closeDeleteModal}
        onConfirm={confirmDelete}
        title="Delete File"
        message={`Are you sure you want to delete ${fileToDelete ? fileToDelete.filename : `${selectedFiles.length} files`}? This action cannot be undone.`}
        confirmText={fileToDelete ? (deletingFileId === fileToDelete.file_id ? 'Deleting...' : 'Delete') : (bulkDeleteMutation.isPending ? 'Deleting...' : 'Delete')}
        cancelText="Cancel"
        confirmButtonStyle={{ background: '#dc2626' }}
      />
      
      <SimpleSuccessModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        message={successMessage}
      />
      
      <SimpleSuccessModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        title="Error"
        message={errorMessage}
      />
      
      <PasswordInputModal
        isOpen={showPasswordModal}
        onClose={closePasswordModal}
        onSubmit={handleSubmitPassword}
        fileName={passwordModalFile?.filename}
        isSubmitting={isSubmittingPassword}
      />
    </div>
  );
};