import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiTrash2, FiSearch, FiGitBranch, FiBarChart2 } from 'react-icons/fi';
import axios from 'axios';
import PageLayout from '../components/PageLayout';
import LoadingSpinner from '../components/LoadingSpinner';
import TransformationProfilingModal from '../components/TransformationProfilingModal';
import { formatDate } from '../utils/formatters';
import ConfirmModal from '../components/ConfirmModal';
import '../styles/global-page-styles.css';

const ProcessedFileCatalog = () => {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [showProfilingModal, setShowProfilingModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMapping, setSelectedMapping] = useState('all');
  const [selectedProject, setSelectedProject] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, action: null, message: '', title: '' });

  const [allMappings, setAllMappings] = useState([]);
  const [allProjects, setAllProjects] = useState([]);

  const fetchTransformationFiles = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        load_type: 'etl_transformation',
        file_role: 'target',
        limit: 10000  // Fetch all files to ensure dropdown has all mappings
      };

      const response = await axios.get('/api/file-audit', { params });
      const audits = response.data.audits || [];
      setFiles(audits);
      
      // Extract unique mappings and projects from all files for dropdowns
      const mappingsSet = new Set();
      const projectsMap = new Map();
      audits.forEach(f => {
        if (f.mapping_name) mappingsSet.add(f.mapping_name);
        if (f.project_id && f.project_name) {
          projectsMap.set(f.project_id, { id: f.project_id, name: f.project_name });
        }
      });
      setAllMappings(Array.from(mappingsSet).sort());
      setAllProjects(Array.from(projectsMap.values()).sort((a, b) => a.name.localeCompare(b.name)));
      
      setError(null);
    } catch (err) {
      console.error('Error fetching transformation files:', err);
      setError('Failed to load transformation file catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTransformationFiles();
  }, [fetchTransformationFiles]);

  useEffect(() => {
    const handleFileUploaded = (event) => {
      console.log('Vendor file uploaded, refreshing processed catalog...', event.detail);
      fetchTransformationFiles();
    };

    window.addEventListener('vendorFileUploaded', handleFileUploaded);
    return () => {
      window.removeEventListener('vendorFileUploaded', handleFileUploaded);
    };
  }, [fetchTransformationFiles]);

  // Use allMappings and allProjects from dedicated API endpoint
  // (more efficient than extracting from paginated file results)

  const filteredFiles = useMemo(() => {
    let result = files;

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(f => 
        f.file_name?.toLowerCase().includes(term) ||
        f.source_path?.toLowerCase().includes(term) ||
        f.mapping_name?.toLowerCase().includes(term)
      );
    }

    if (selectedMapping !== 'all') {
      result = result.filter(f => f.mapping_name === selectedMapping);
    }

    if (selectedProject !== 'all') {
      result = result.filter(f => f.project_id === selectedProject);
    }

    result.sort((a, b) => new Date(b.created_dt) - new Date(a.created_dt));

    return result;
  }, [files, searchTerm, selectedMapping, selectedProject]);

  const totalItems = filteredFiles.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedFiles = filteredFiles.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedMapping, selectedProject, itemsPerPage]);

  const handleDeleteProfiling = async (correlationId, fileName) => {
    setConfirmModal({
      isOpen: true,
      title: 'Confirm Deletion',
      message: `Are you sure you want to delete all profiling results for "${fileName}"? This will remove both source and target profiling data.`,
      action: async () => {
        try {
          await axios.delete(`/api/file-audit/correlation/${correlationId}`);
          await fetchTransformationFiles();
        } catch (err) {
          console.error('Error deleting profiling results:', err);
          alert('Failed to delete profiling results. Please try again.');
        }
      }
    });
  };

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
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

  if (loading) {
    return (
      <PageLayout 
        title="Processed File Catalog"
        subtitle="Files created by ETL transformations with profiling history"
      >
        <LoadingSpinner />
      </PageLayout>
    );
  }

  return (
    <PageLayout 
      title="Processed File Catalog"
      subtitle="Files created by ETL transformations with profiling history"
    >
      <div className="gps-card">
        <div className="gps-card-header">
          <h3 className="gps-card-title">Transformation Files</h3>
        </div>
        
        <div className="gps-card-body">
          <div className="gps-filter-row">
            <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '150px', maxWidth: '300px' }}>
              <FiSearch style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#666', pointerEvents: 'none', zIndex: 1 }} />
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                maxLength={100}
                className="gps-form-input"
                style={{ paddingLeft: '36px', width: '100%' }}
              />
            </div>
            <select
              value={selectedMapping}
              onChange={(e) => setSelectedMapping(e.target.value)}
              className="gps-form-select"
              style={{ flex: '0 1 160px' }}
            >
              <option value="all">All Mappings</option>
              {allMappings.map(mapping => (
                <option key={mapping} value={mapping}>{mapping}</option>
              ))}
            </select>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="gps-form-select"
              style={{ flex: '0 1 160px' }}
            >
              <option value="all">All Projects</option>
              {allProjects.map(project => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </div>

          {error && (
            <div className="gps-alert gps-alert--danger" style={{ marginBottom: '16px' }}>{error}</div>
          )}

          {paginatedFiles.length === 0 ? (
            <div className="gps-empty-state">
              <p>No transformation files found. Transform data using ETL Mappings to see files here.</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', marginBottom: '8px', fontSize: '10px', color: '#666' }}>
                <span>Showing {startIndex + 1}-{Math.min(endIndex, totalItems)} of {totalItems} files</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ fontSize: '10px', color: '#666' }}>Items per page:</label>
                  <select 
                    value={itemsPerPage} 
                    onChange={(e) => setItemsPerPage(Number(e.target.value))}
                    className="gps-form-select"
                    style={{ minWidth: '60px', padding: '4px 8px' }}
                  >
                    <option value="10">10</option>
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                  </select>
                </div>
              </div>
              
              <div style={{ overflowX: 'auto' }}>
                <table className="gps-table">
                  <thead>
                    <tr>
                      <th>Mapping</th>
                      <th>Source File</th>
                      <th>Target File</th>
                      <th>Created</th>
                      <th>Project</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedFiles.map((file) => (
                      <tr key={file.id}>
                        <td>
                          <span className="gps-badge gps-badge--muted" style={{ fontSize: '9px', padding: '2px 8px' }}>
                            {file.mapping_name || 'Unknown'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>{file.source_path || '-'}</span>
                            {file.has_schema_changes && (
                              <span 
                                className="gps-badge gps-badge--warning"
                                style={{ fontSize: '9px', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                title="Schema has changed from previous upload"
                              >
                                <FiGitBranch size={10} /> Schema Changed
                              </span>
                            )}
                          </div>
                        </td>
                        <td>{file.file_name}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {file.created_dt ? formatDate(file.created_dt) : '-'}
                        </td>
                        <td>{file.project_name || 'Default Project'}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button 
                              className="gps-icon-btn gps-icon-btn--success"
                              onClick={() => {
                                setSelectedJobId(file.job_id);
                                setShowProfilingModal(true);
                              }}
                              disabled={!file.job_id}
                              title="Source File Profile"
                            >
                              <FiBarChart2 size={14} />
                            </button>
                            <button 
                              className="gps-icon-btn gps-icon-btn--view"
                              onClick={() => navigate(`/profile/${encodeURIComponent(file.file_id)}`)}
                              disabled={!file.file_id}
                              title="Target File Profile"
                            >
                              <FiBarChart2 size={14} />
                            </button>
                            <button 
                              className="gps-icon-btn gps-icon-btn--delete"
                              onClick={() => handleDeleteProfiling(file.correlation_id, file.file_name)}
                              disabled={!file.correlation_id}
                              title="Delete profiling results"
                            >
                              <FiTrash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            
              {totalPages > 1 && (
                <div className="gps-pagination">
                  <button
                    className="gps-btn gps-btn--secondary gps-btn--sm"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </button>
                  
                  <div className="gps-pagination-numbers">
                    {getPageNumbers().map((page, index) => (
                      page === '...' ? (
                        <span key={`ellipsis-${index}`} className="gps-pagination-ellipsis">...</span>
                      ) : (
                        <button
                          key={page}
                          className={`gps-pagination-number ${currentPage === page ? 'active' : ''}`}
                          onClick={() => handlePageChange(page)}
                        >
                          {page}
                        </button>
                      )
                    ))}
                  </div>
                  
                  <button
                    className="gps-btn gps-btn--secondary gps-btn--sm"
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
      </div>

      {showProfilingModal && selectedJobId && (
        <TransformationProfilingModal
          jobId={selectedJobId}
          onClose={() => {
            setShowProfilingModal(false);
            setSelectedJobId(null);
          }}
        />
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={() => {
          confirmModal.action?.();
          setConfirmModal({ ...confirmModal, isOpen: false });
        }}
        title={confirmModal.title}
        message={confirmModal.message}
        variant="danger"
      />
    </PageLayout>
  );
};

export default ProcessedFileCatalog;
