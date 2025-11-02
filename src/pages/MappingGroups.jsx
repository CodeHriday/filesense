import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiPlayCircle, FiEdit2, FiTrash2, FiPlusCircle, FiSearch } from 'react-icons/fi';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import ConfirmModal from '../components/ConfirmModal';
import ExecuteModal from '../components/ExecuteModal';
import { PageTransition } from '../components/MicroAnimations';
import Pagination from '../components/Pagination';
import '../components/styles/PageActions.css';
import axios from 'axios';

const MappingGroups = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [executing, setExecuting] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedGroupForDelete, setSelectedGroupForDelete] = useState(null);
  const [isExecuteModalOpen, setIsExecuteModalOpen] = useState(false);
  const [executeResult, setExecuteResult] = useState({ success: false, message: '', groupName: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchMappingGroups();
  }, []);

  const fetchMappingGroups = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/mapping-groups');
      const data = response.data.groups || response.data || [];
      setGroups(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      console.error('Error fetching mapping groups:', err);
      setError('Failed to load mapping groups');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async (groupId, groupName) => {
    try {
      setExecuting(groupId);
      await axios.post(`/api/mapping-groups/${groupId}/execute`);
      setExecuteResult({
        success: true,
        message: 'Mapping group execution started successfully! The transformations are now running in the background.',
        groupName: groupName
      });
      setIsExecuteModalOpen(true);
    } catch (err) {
      console.error('Error executing mapping group:', err);
      setExecuteResult({
        success: false,
        message: err.response?.data?.error || 'Failed to execute mapping group. Please try again.',
        groupName: groupName
      });
      setIsExecuteModalOpen(true);
    } finally {
      setExecuting(null);
    }
  };

  const handleDelete = (groupId, groupName) => {
    setSelectedGroupForDelete({ id: groupId, name: groupName });
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedGroupForDelete) return;

    try {
      await axios.delete(`/api/mapping-groups/${selectedGroupForDelete.id}`);
      setIsDeleteModalOpen(false);
      setSelectedGroupForDelete(null);
      // Auto-refresh the list after successful delete
      fetchMappingGroups();
    } catch (err) {
      console.error('Error deleting mapping group:', err);
      alert('Failed to delete mapping group');
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading mapping groups..." />;
  }

  // Filter groups based on search term
  const filteredGroups = groups.filter(group => {
    const searchLower = searchTerm.toLowerCase();
    return (
      (group.name || '').toLowerCase().includes(searchLower) ||
      (group.description || '').toLowerCase().includes(searchLower) ||
      (group.project_name || '').toLowerCase().includes(searchLower) ||
      (group.created_by_name || '').toLowerCase().includes(searchLower)
    );
  });

  // Pagination logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentGroups = filteredGroups.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredGroups.length / itemsPerPage);

  return (
    <PageTransition>
      <div className="mapping-groups-page">
        <PageHeader
          title="Mapping Job Groups"
          subtitle="Batch execution of transformations with concurrency control"
        />
        
        <div className="page-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ position: 'relative', minWidth: '300px' }}>
            <FiSearch style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search groups..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                width: '100%',
                padding: '0.5rem 0.5rem 0.5rem 2.5rem',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />
          </div>
          <Link to="/mapping-groups/create" className="btn btn-primary">
            <FiPlusCircle /> Create Mapping Group
          </Link>
        </div>

        {error && (
          <div className="alert alert-danger">{error}</div>
        )}

        {groups.length === 0 ? (
          <div className="empty-state">
            <p>No mapping groups found. Create one to get started!</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Members</th>
                  <th>Concurrency</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentGroups.map(group => (
                  <tr key={group.id || group.group_id}>
                    <td>{group.project_name || 'Default Project'}</td>
                    <td className="font-weight-bold">{group.name || group.group_name}</td>
                    <td className="description-cell">{group.description || '-'}</td>
                    <td className="text-center">{group.mapping_count || group.member_count || 0}</td>
                    <td className="text-center">{group.max_concurrency || group.concurrency_limit}</td>
                    <td>
                      <span className={`status-badge status-${group.status || 'active'}`}>
                        {group.status || 'active'}
                      </span>
                    </td>
                    <td>{new Date(group.created_at).toLocaleDateString()}</td>
                    <td>
                      <div className="action-icons">
                        <button
                          onClick={() => handleExecute(group.id || group.group_id, group.name || group.group_name)}
                          disabled={executing === (group.id || group.group_id)}
                          className="icon-btn icon-btn-success"
                          title="Execute"
                        >
                          <FiPlayCircle />
                        </button>
                        <Link 
                          to={`/mapping-groups/${group.id || group.group_id}/edit`} 
                          className="icon-btn icon-btn-primary"
                          title="Edit"
                        >
                          <FiEdit2 />
                        </Link>
                        <button
                          onClick={() => handleDelete(group.id || group.group_id, group.name || group.group_name)}
                          className="icon-btn icon-btn-danger"
                          title="Delete"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        {groups.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            itemsPerPage={itemsPerPage}
            totalItems={groups.length}
          />
        )}

        <ConfirmModal
          isOpen={isDeleteModalOpen}
          onClose={() => {
            setIsDeleteModalOpen(false);
            setSelectedGroupForDelete(null);
          }}
          onConfirm={confirmDelete}
          title="Delete Mapping Group"
          message={`Are you sure you want to delete "${selectedGroupForDelete?.name}"? This action cannot be undone.`}
        />

        <ExecuteModal
          isOpen={isExecuteModalOpen}
          onClose={() => setIsExecuteModalOpen(false)}
          success={executeResult.success}
          message={executeResult.message}
          groupName={executeResult.groupName}
        />
      </div>
    </PageTransition>
  );
};

export default MappingGroups;
