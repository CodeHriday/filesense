import React, { useState } from 'react';
import { Card } from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import { useFileCatalog } from '../hooks';
import { QualityTooltip } from '../components/QualityTooltip';
import './FileCatalog.css';

export const FileCatalog = ({ onFileSelect }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedType, setSelectedType] = useState('all');
  
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
  
  // Properly handle the file data format from the API
  const files = fileData || [];

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
                      <QualityTooltip 
                        score={file.qualityScore}
                        components={{
                          completeness: file.qualityComponents?.completeness || 95,
                          consistency: file.qualityComponents?.consistency || 85,
                          validity: file.qualityComponents?.validity || 80,
                          uniqueness: file.qualityComponents?.uniqueness || 75,
                          timeliness: file.qualityComponents?.timeliness || 90
                        }}
                        position="top"
                        animated={true}
                      >
                        <span className={`stat-value quality-score ${getQualityClass(file.qualityScore)}`}>
                          {file.qualityScore}%
                        </span>
                      </QualityTooltip>
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