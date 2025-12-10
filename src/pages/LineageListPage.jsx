import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPlus, FiRefreshCw, FiEdit, FiTrash2, FiEye, FiSearch, FiFilter } from 'react-icons/fi';
import { FaProjectDiagram } from 'react-icons/fa';
import PageLayout from '../components/PageLayout';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import { useToast } from '../context/ToastContext';
import {
  fetchSavedLineageGraphs,
  deleteSavedLineageGraph,
  refreshSavedLineageGraph
} from '../services/lineageGraphService';
import './LineageListPage.css';

const LineageListPage = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  
  const [graphs, setGraphs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalGraphs, setTotalGraphs] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshingId, setRefreshingId] = useState(null);

  const loadGraphs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchSavedLineageGraphs({
        page,
        limit: pageSize
      });
      
      if (response.success) {
        setGraphs(response.graphs || []);
        setTotalGraphs(response.pagination?.total || 0);
        setError('');
      } else {
        setError(response.error || 'Failed to load lineage graphs');
      }
    } catch (err) {
      console.error('Error loading lineage graphs:', err);
      setError('Failed to load lineage graphs');
      setGraphs([]);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    loadGraphs();
  }, [loadGraphs]);

  const handleCreateNew = () => {
    navigate('/lineage/new');
  };

  const handleView = (graphId) => {
    navigate(`/lineage/${graphId}`);
  };

  const handleEdit = (graphId) => {
    navigate(`/lineage/${graphId}/edit`);
  };

  const handleRefresh = async (graphId) => {
    setRefreshingId(graphId);
    try {
      const response = await refreshSavedLineageGraph(graphId);
      if (response.success) {
        addToast('success', 'Graph Refreshed', 'Lineage graph has been refreshed with latest data');
        loadGraphs();
      } else {
        addToast('error', 'Refresh Failed', response.error || 'Failed to refresh graph');
      }
    } catch (err) {
      console.error('Error refreshing graph:', err);
      addToast('error', 'Refresh Failed', err.message || 'Failed to refresh graph');
    } finally {
      setRefreshingId(null);
    }
  };

  const handleDelete = async (graphId, graphName) => {
    if (!window.confirm(`Are you sure you want to delete "${graphName}"?`)) return;

    try {
      const response = await deleteSavedLineageGraph(graphId);
      if (response.success) {
        addToast('success', 'Graph Deleted', 'Lineage graph has been deleted');
        loadGraphs();
      } else {
        addToast('error', 'Delete Failed', response.error || 'Failed to delete graph');
      }
    } catch (err) {
      console.error('Error deleting graph:', err);
      addToast('error', 'Delete Failed', err.message || 'Failed to delete graph');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getRootTypeBadge = (rootType) => {
    const typeColors = {
      vendorAgreement: 'badge-vendor',
      file: 'badge-file',
      mapping: 'badge-mapping',
      job: 'badge-job'
    };
    const typeLabels = {
      vendorAgreement: 'Vendor Agreement',
      file: 'File',
      mapping: 'Mapping',
      job: 'Job'
    };
    return (
      <span className={`lineage-type-badge ${typeColors[rootType] || 'badge-default'}`}>
        {typeLabels[rootType] || rootType}
      </span>
    );
  };

  const filteredGraphs = graphs.filter(graph =>
    graph.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    graph.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(totalGraphs / pageSize);

  return (
    <PageLayout title="Visual Lineage">
      <div className="lineage-list-container">
        <div className="lineage-list-header">
          <div className="lineage-list-search">
            <FiSearch className="search-icon" />
            <input
              type="text"
              placeholder="Search lineage graphs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="lineage-list-actions">
            <button
              className="btn btn-secondary"
              onClick={loadGraphs}
              disabled={loading}
            >
              <FiRefreshCw className={loading ? 'spinning' : ''} /> Refresh
            </button>
            <button
              className="btn btn-primary"
              onClick={handleCreateNew}
            >
              <FiPlus /> Create New Graph
            </button>
          </div>
        </div>

        {error && (
          <div className="lineage-list-error">
            {error}
          </div>
        )}

        {loading ? (
          <div className="lineage-list-loading">
            <LoadingSpinner />
          </div>
        ) : filteredGraphs.length === 0 ? (
          <div className="lineage-list-empty">
            <FaProjectDiagram className="empty-icon" />
            <h3>No Lineage Graphs</h3>
            <p>Create your first lineage graph to visualize data relationships.</p>
            <button className="btn btn-primary" onClick={handleCreateNew}>
              <FiPlus /> Create New Graph
            </button>
          </div>
        ) : (
          <>
            <div className="lineage-list-table-wrapper">
              <table className="lineage-list-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Description</th>
                    <th>Root Type</th>
                    <th>Nodes</th>
                    <th>Edges</th>
                    <th>Project</th>
                    <th>Created By</th>
                    <th>Updated At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGraphs.map(graph => (
                    <tr key={graph.id}>
                      <td className="name-cell">
                        <span 
                          className="graph-name-link" 
                          onClick={() => handleView(graph.id)}
                          title="Click to view graph"
                        >
                          {graph.name}
                        </span>
                      </td>
                      <td className="description-cell">
                        {graph.description || '-'}
                      </td>
                      <td>{getRootTypeBadge(graph.root_type)}</td>
                      <td className="count-cell">{graph.node_count || 0}</td>
                      <td className="count-cell">{graph.edge_count || 0}</td>
                      <td>{graph.project_name || '-'}</td>
                      <td>{graph.created_by_name || '-'}</td>
                      <td>{formatDate(graph.updated_at)}</td>
                      <td className="actions-cell">
                        <button
                          className="action-btn view-btn"
                          onClick={() => handleView(graph.id)}
                          title="View Graph"
                        >
                          <FiEye />
                        </button>
                        <button
                          className="action-btn edit-btn"
                          onClick={() => handleEdit(graph.id)}
                          title="Edit Graph"
                        >
                          <FiEdit />
                        </button>
                        <button
                          className="action-btn refresh-btn"
                          onClick={() => handleRefresh(graph.id)}
                          disabled={refreshingId === graph.id}
                          title="Refresh Graph Data"
                        >
                          <FiRefreshCw className={refreshingId === graph.id ? 'spinning' : ''} />
                        </button>
                        <button
                          className="action-btn delete-btn"
                          onClick={() => handleDelete(graph.id, graph.name)}
                          title="Delete Graph"
                        >
                          <FiTrash2 />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="lineage-list-pagination">
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                />
              </div>
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
};

export default LineageListPage;
