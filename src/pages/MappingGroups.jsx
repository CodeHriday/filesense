import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiPlayCircle, FiEdit2, FiTrash2, FiPlusCircle } from 'react-icons/fi';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import ConfirmModal from '../components/ConfirmModal';
import ExecuteModal from '../components/ExecuteModal';
import { PageTransition } from '../components/MicroAnimations';
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

  return (
    <PageTransition>
      <div className="mapping-groups-page">
        <PageHeader
          title="Mapping Groups"
          subtitle="Batch execution of transformations with concurrency control"
        />
        
        <div className="page-actions">
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
                {groups.map(group => (
                  <tr key={group.id || group.group_id}>
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
