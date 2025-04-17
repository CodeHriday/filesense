import React, { useState, useEffect } from 'react';
import { Card } from '../components/Card';
import './FileCatalog.css';

export const FileCatalog = ({ onFileSelect }) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedType, setSelectedType] = useState('all');

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // In a real app, this would be an API call
      // For example: const response = await api.getFileCatalog();
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock file catalog data
      const mockFiles = [
        {
          id: 'file_1',
          fileName: 'sales_data.csv',
          fileType: 'csv',
          fileSize: 2450000,
          rows: 15250,
          columns: 12,
          uploadedAt: '2025-04-10T14:30:00Z',
          lastProcessedAt: '2025-04-10T14:32:10Z',
          qualityScore: 92.5,
          tags: ['sales', 'quarterly'],
          owner: 'john.doe@example.com'
        },
        {
          id: 'file_2',
          fileName: 'customer_data.csv',
          fileType: 'csv',
          fileSize: 5250000,
          rows: 42000,
          columns: 18,
          uploadedAt: '2025-04-08T10:15:00Z',
          lastProcessedAt: '2025-04-08T10:20:30Z',
          qualityScore: 87.2,
          tags: ['customers', 'master-data'],
          owner: 'jane.smith@example.com'
        },
        {
          id: 'file_3',
          fileName: 'inventory.json',
          fileType: 'json',
          fileSize: 1240000,
          rows: 8500,
          columns: 9,
          uploadedAt: '2025-04-15T09:45:00Z',
          lastProcessedAt: '2025-04-15T09:47:20Z',
          qualityScore: 95.0,
          tags: ['inventory', 'daily'],
          owner: 'john.doe@example.com'
        },
        {
          id: 'file_4',
          fileName: 'transactions.parquet',
          fileType: 'parquet',
          fileSize: 4800000,
          rows: 125000,
          columns: 15,
          uploadedAt: '2025-04-16T16:20:00Z',
          lastProcessedAt: '2025-04-16T16:25:40Z',
          qualityScore: 79.8,
          tags: ['transactions', 'financial'],
          owner: 'sarah.johnson@example.com'
        },
        {
          id: 'file_5',
          fileName: 'product_catalog.json',
          fileType: 'json',
          fileSize: 980000,
          rows: 5200,
          columns: 24,
          uploadedAt: '2025-04-02T11:10:00Z',
          lastProcessedAt: '2025-04-02T11:12:15Z',
          qualityScore: 88.3,
          tags: ['products', 'master-data'],
          owner: 'jane.smith@example.com'
        }
      ];
      
      setFiles(mockFiles);
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch file catalog. Please try again.');
      console.error('Error fetching files:', err);
      setLoading(false);
    }
  };

  const handleFileSelect = (file) => {
    onFileSelect && onFileSelect(file);
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
      const matchesSearch = file.fileName.toLowerCase().includes(searchLower) || 
                           file.tags.some(tag => tag.toLowerCase().includes(searchLower)) ||
                           file.owner.toLowerCase().includes(searchLower);
      
      // Filter by file type
      const matchesType = selectedType === 'all' || file.fileType === selectedType;
      
      return matchesSearch && matchesType;
    })
    .sort((a, b) => {
      // Sort based on selected criteria
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.fileName.localeCompare(b.fileName);
          break;
        case 'date':
          comparison = new Date(a.uploadedAt) - new Date(b.uploadedAt);
          break;
        case 'size':
          comparison = a.fileSize - b.fileSize;
          break;
        case 'rows':
          comparison = a.rows - b.rows;
          break;
        case 'quality':
          comparison = a.qualityScore - b.qualityScore;
          break;
        default:
          comparison = 0;
      }
      
      // Apply sort order
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  if (loading) {
    return (
      <div className="file-catalog-container">
        <h1 className="page-title">File Catalog</h1>
        <div className="loading">Loading file catalog...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="file-catalog-container">
        <h1 className="page-title">File Catalog</h1>
        <div className="alert alert-error">{error}</div>
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
      
      <div className="file-catalog-results">
        {filteredAndSortedFiles.length === 0 ? (
          <div className="no-results">
            <p>No files found matching your criteria.</p>
          </div>
        ) : (
          filteredAndSortedFiles.map(file => (
            <Card key={file.id} className="file-card">
              <div className="file-card-content">
                <div className="file-icon">
                  {file.fileType === 'csv' ? '📄' : 
                   file.fileType === 'json' ? '🔠' : '📊'}
                </div>
                
                <div className="file-info">
                  <div className="file-header">
                    <h3 className="file-name">{file.fileName}</h3>
                    <div className="file-meta">
                      <span className="file-type">{file.fileType.toUpperCase()}</span>
                      <span className="file-size">{formatBytes(file.fileSize)}</span>
                    </div>
                  </div>
                  
                  <div className="file-stats">
                    <div className="stat">
                      <span className="stat-label">Rows:</span>
                      <span className="stat-value">{file.rows.toLocaleString()}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Columns:</span>
                      <span className="stat-value">{file.columns}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Uploaded:</span>
                      <span className="stat-value" title={formatDate(file.uploadedAt)}>
                        {getTimeSince(file.uploadedAt)}
                      </span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Quality:</span>
                      <span className={`stat-value quality-score ${getQualityClass(file.qualityScore)}`}>
                        {file.qualityScore}%
                      </span>
                    </div>
                  </div>
                  
                  <div className="file-tags">
                    {file.tags.map((tag, index) => (
                      <span key={index} className="tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                  
                  <div className="file-footer">
                    <div className="file-owner">
                      <span className="owner-label">Owner:</span>
                      <span className="owner-value">{file.owner}</span>
                    </div>
                    
                    <div className="file-actions">
                      <button 
                        className="btn"
                        onClick={() => handleFileSelect(file)}
                      >
                        Select
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};