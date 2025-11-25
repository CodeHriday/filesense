import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FiPlayCircle, FiEdit2, FiTrash2, FiPlusCircle } from 'react-icons/fi';
import LoadingSpinner from '../components/LoadingSpinner';
import ConfirmModal from '../components/ConfirmModal';
import ExecuteModal from '../components/ExecuteModal';
import { PageTransition } from '../components/MicroAnimations';
import Pagination from '../components/Pagination';
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
  const [itemsPerPage] = useState(25);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState('all');
  const [selectedSubProject, setSelectedSubProject] = useState('all');

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
      fetchMappingGroups();
    } catch (err) {
      console.error('Error deleting mapping group:', err);
      alert('Failed to delete mapping group');
    }
  };

  const uniqueProjects = useMemo(() => {
    const projects = groups
      .filter(g => g.project_id)
      .map(g => ({ id: g.project_id, name: g.project_name }))
      .filter((p, index, self) => self.findIndex(s => s.id === p.id) === index);
    return projects;
  }, [groups]);

  const uniqueSubProjects = useMemo(() => {
    if (selectedProject === 'all') {
      const subProjects = groups
        .filter(g => g.sub_project_id)
        .map(g => ({ id: g.sub_project_id, name: g.sub_project_name }))
        .filter((sp, index, self) => self.findIndex(s => s.id === sp.id) === index);
      return subProjects;
    }
    
    const subProjects = groups
      .filter(g => g.project_id === selectedProject && g.sub_project_id)
      .map(g => ({ id: g.sub_project_id, name: g.sub_project_name }))
      .filter((sp, index, self) => self.findIndex(s => s.id === sp.id) === index);
    return subProjects;
  }, [groups, selectedProject]);

  const filteredGroups = useMemo(() => {
    return groups.filter(group => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = 
        (group.name || '').toLowerCase().includes(searchLower) ||
        (group.description || '').toLowerCase().includes(searchLower) ||
        (group.project_name || '').toLowerCase().includes(searchLower) ||
        (group.sub_project_name || '').toLowerCase().includes(searchLower);
      
      const matchesProject = selectedProject === 'all' || group.project_id === selectedProject;
      const matchesSubProject = selectedSubProject === 'all' || group.sub_project_id === selectedSubProject;
      
      return matchesSearch && matchesProject && matchesSubProject;
    });
  }, [groups, searchTerm, selectedProject, selectedSubProject]);

  const paginatedGroups = useMemo(() => {
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    return filteredGroups.slice(indexOfFirstItem, indexOfLastItem);
  }, [filteredGroups, currentPage, itemsPerPage]);
  
  const totalPages = Math.ceil(filteredGroups.length / itemsPerPage);

  useEffect(() => {
    setSelectedSubProject('all');
  }, [selectedProject]);

  if (loading) {
    return <LoadingSpinner message="Loading mapping groups..." />;
  }

  return (
    <PageTransition>
      <div className="gps-page-container">
        <div className="gps-page-header">
          <div className="gps-page-header-left">
            <h1 className="gps-page-title">Mapping Job Groups</h1>
            <p className="gps-page-subtitle">Batch execution of transformations with concurrency control</p>
          </div>
          <div className="gps-page-header-right">
            <Link to="/mapping-groups/create" className="gps-btn-primary">
              <FiPlusCircle /> Create Mapping Group
            </Link>
          </div>
        </div>
        
        <div className="gps-filters">
          <input
            type="text"
            placeholder="Search groups..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="gps-search-input"
          />
          
          <select 
            value={selectedProject}
            onChange={(e) => {
              setSelectedProject(e.target.value === 'all' ? 'all' : parseInt(e.target.value));
              setCurrentPage(1);
            }}
            className="gps-filter-select"
          >
            <option value="all">All Projects</option>
            {uniqueProjects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          
          <select 
            value={selectedSubProject}
            onChange={(e) => {
              setSelectedSubProject(e.target.value === 'all' ? 'all' : parseInt(e.target.value));
              setCurrentPage(1);
            }}
            className="gps-filter-select"
          >
            <option value="all">All Subprojects</option>
            {uniqueSubProjects.map(sp => (
              <option key={sp.id} value={sp.id}>{sp.name}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="gps-alert gps-alert-danger">{error}</div>
        )}

        <div className="gps-results-info">
          Showing {paginatedGroups.length} of {filteredGroups.length} mapping groups
        </div>

        {filteredGroups.length === 0 ? (
          <div className="gps-empty-state">
            <p>No mapping groups found. Create one to get started!</p>
          </div>
        ) : (
          <div className="gps-table-container">
            <table className="gps-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Project</th>
                  <th>Subproject</th>
                  <th>Description</th>
                  <th>Members</th>
                  <th>Concurrency</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedGroups.map(group => (
                  <tr key={group.id || group.group_id}>
                    <td style={{ fontWeight: '500' }}>{group.name || group.group_name}</td>
                    <td>{group.project_name || '-'}</td>
                    <td>{group.sub_project_name || '-'}</td>
                    <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {group.description || '-'}
                    </td>
                    <td style={{ textAlign: 'center' }}>{group.mapping_count || group.member_count || 0}</td>
                    <td style={{ textAlign: 'center' }}>{group.max_concurrency || group.concurrency_limit}</td>
                    <td>
                      <span className={`gps-badge gps-badge-${group.status === 'active' ? 'success' : 'secondary'}`}>
                        {group.status || 'active'}
                      </span>
                    </td>
                    <td>{new Date(group.created_at).toLocaleDateString()}</td>
                    <td>
                      <div className="gps-action-buttons">
                        <button
                          onClick={() => handleExecute(group.id || group.group_id, group.name || group.group_name)}
                          disabled={executing === (group.id || group.group_id)}
                          className="gps-icon-btn gps-icon-btn-success"
                          title="Execute"
                        >
                          <FiPlayCircle />
                        </button>
                        <Link 
                          to={`/mapping-groups/${group.id || group.group_id}/edit`} 
                          className="gps-icon-btn gps-icon-btn-primary"
                          title="Edit"
                        >
                          <FiEdit2 />
                        </Link>
                        <button
                          onClick={() => handleDelete(group.id || group.group_id, group.name || group.group_name)}
                          className="gps-icon-btn gps-icon-btn-danger"
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
        
        {filteredGroups.length > 0 && totalPages > 1 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            itemsPerPage={itemsPerPage}
            totalItems={filteredGroups.length}
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
