import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiPlayCircle, FiEdit2, FiTrash2, FiPlusCircle } from 'react-icons/fi';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import { PageTransition } from '../components/MicroAnimations';
import axios from 'axios';

const MappingGroups = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [executing, setExecuting] = useState(null);

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

  const handleExecute = async (groupId) => {
    try {
      setExecuting(groupId);
      await axios.post(`/api/mapping-groups/${groupId}/execute`);
      alert('Mapping group execution started successfully!');
    } catch (err) {
      console.error('Error executing mapping group:', err);
      alert('Failed to execute mapping group');
    } finally {
      setExecuting(null);
    }
  };

  const handleDelete = async (groupId) => {
    if (!window.confirm('Are you sure you want to delete this mapping group?')) {
      return;
    }

    try {
      await axios.delete(`/api/mapping-groups/${groupId}`);
      setGroups(groups.filter(g => g.group_id !== groupId));
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
          actions={
            <Link to="/mapping-groups/create" className="btn btn-primary">
              <FiPlusCircle /> Create Mapping Group
            </Link>
          }
        />

        {error && (
          <div className="alert alert-danger">{error}</div>
        )}

        {groups.length === 0 ? (
          <div className="empty-state">
            <p>No mapping groups found. Create one to get started!</p>
          </div>
        ) : (
          <div className="groups-grid">
            {groups.map(group => (
              <div key={group.group_id} className="group-card">
                <h3>{group.group_name}</h3>
                {group.description && <p className="description">{group.description}</p>}
                <div className="group-meta">
                  <span className="meta-item">Members: {group.member_count || 0}</span>
                  <span className="meta-item">Concurrency: {group.concurrency_limit}</span>
                  <span className="meta-item">Created: {new Date(group.created_at).toLocaleDateString()}</span>
                </div>
                <div className="group-actions">
                  <button
                    onClick={() => handleExecute(group.group_id)}
                    disabled={executing === group.group_id}
                    className="btn btn-success btn-sm"
                  >
                    <FiPlayCircle /> {executing === group.group_id ? 'Executing...' : 'Execute'}
                  </button>
                  <Link to={`/mapping-groups/${group.group_id}/edit`} className="btn btn-primary btn-sm">
                    <FiEdit2 /> Edit
                  </Link>
                  <button onClick={() => handleDelete(group.group_id)} className="btn btn-danger btn-sm">
                    <FiTrash2 /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
};

export default MappingGroups;
