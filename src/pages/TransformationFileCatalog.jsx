import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiFileText, FiClock, FiDatabase, FiArrowRight } from 'react-icons/fi';
import axios from 'axios';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import { PageTransition } from '../components/MicroAnimations';
import { formatBytes, formatDate } from '../utils/formatters';

const TransformationFileCatalog = () => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchTransformationFiles();
  }, []);

  const fetchTransformationFiles = async () => {
    try {
      setLoading(true);
      // Fetch file audit records for transformation-generated files
      const response = await axios.get('/api/file-audit', {
        params: {
          load_type: 'etl_transformation',
          file_role: 'target'
        }
      });
      
      setFiles(response.data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching transformation files:', err);
      setError('Failed to load transformation file catalog');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <PageTransition>
        <div className="transformation-catalog-page">
          <PageHeader
            title="Transformation File Catalog"
            subtitle="Files created by ETL transformations"
          />
          <LoadingSpinner />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="transformation-catalog-page">
        <PageHeader
          title="Transformation File Catalog"
          subtitle="Files created by ETL transformations with profiling history"
        />

        {error && (
          <div className="alert alert-danger">{error}</div>
        )}

        <div className="catalog-stats">
          <div className="stat-card">
            <FiFileText className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{files.length}</span>
              <span className="stat-label">Total Files</span>
            </div>
          </div>
          <div className="stat-card">
            <FiDatabase className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">
                {formatBytes(files.reduce((sum, f) => sum + (f.file_size_bytes || 0), 0))}
              </span>
              <span className="stat-label">Total Size</span>
            </div>
          </div>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>File Name</th>
                <th>Source File</th>
                <th>Mapping</th>
                <th>Records</th>
                <th>Size</th>
                <th>Created</th>
                <th>Project</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {files.length === 0 ? (
                <tr>
                  <td colSpan="8" className="empty-state">
                    <p>No transformation files found. Transform data using ETL Mappings to see files here.</p>
                  </td>
                </tr>
              ) : (
                files.map((file) => (
                  <tr key={file.id}>
                    <td>
                      <div className="file-name-cell">
                        <FiFileText className="file-icon" />
                        <span>{file.file_name}</span>
                      </div>
                    </td>
                    <td>{file.source_path || '-'}</td>
                    <td>
                      {file.mapping_name ? (
                        <Link 
                          to={`/mappings`} 
                          className="mapping-link"
                          title="View mapping"
                        >
                          {file.mapping_name}
                        </Link>
                      ) : '-'}
                    </td>
                    <td>{file.load_step1_rec_cnt?.toLocaleString() || '-'}</td>
                    <td>{file.file_size_bytes ? formatBytes(file.file_size_bytes) : '-'}</td>
                    <td>
                      <div className="datetime-cell">
                        <FiClock className="time-icon" />
                        {formatDate(file.created_at)}
                      </div>
                    </td>
                    <td>{file.project_name || 'Default Project'}</td>
                    <td>
                      <Link to={`/jobs/${file.transformation_job_id}`} className="btn btn-sm btn-primary">
                        View Job <FiArrowRight />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageTransition>
  );
};

export default TransformationFileCatalog;
