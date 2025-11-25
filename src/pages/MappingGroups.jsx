import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FiPlayCircle, FiEdit2, FiTrash2, FiPlusCircle, FiSearch, FiChevronDown, FiChevronRight, FiAlertCircle } from 'react-icons/fi';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import ConfirmModal from '../components/ConfirmModal';
import ExecuteModal from '../components/ExecuteModal';
import { PageTransition } from '../components/MicroAnimations';
import Pagination from '../components/Pagination';
import '../components/styles/PageActions.css';
import axios from 'axios';
import { groupMappingGroupsByProject, initializeExpansionState, autoExpandMatchingSections } from '../utils/mappingGroupGrouping';

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
  
  // Hierarchical state
  const [expansionState, setExpansionState] = useState({});
  const [initialized, setInitialized] = useState(false);

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

  // Filter groups based on search term
  const filteredGroups = useMemo(() => {
    return groups.filter(group => {
      const searchLower = searchTerm.toLowerCase();
      return (
        (group.name || '').toLowerCase().includes(searchLower) ||
        (group.description || '').toLowerCase().includes(searchLower) ||
        (group.project_name || '').toLowerCase().includes(searchLower) ||
        (group.created_by_name || '').toLowerCase().includes(searchLower)
      );
    });
  }, [groups, searchTerm]);

  // Pagination logic
  const currentGroups = useMemo(() => {
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    return filteredGroups.slice(indexOfFirstItem, indexOfLastItem);
  }, [filteredGroups, currentPage, itemsPerPage]);
  
  const totalPages = Math.ceil(filteredGroups.length / itemsPerPage);

  // Group mapping groups by project and subproject hierarchy
  const groupedProjects = useMemo(() => {
    return groupMappingGroupsByProject(currentGroups);
  }, [currentGroups]);

  // Initialize expansion state when grouped data changes or search term changes
  useEffect(() => {
    if (groupedProjects.length > 0) {
      if (searchTerm) {
        // Auto-expand sections with search matches
        setExpansionState(prev => autoExpandMatchingSections(groupedProjects, prev));
      } else if (!initialized) {
        // Initialize with all sections collapsed by default (first load)
        setExpansionState(initializeExpansionState(groupedProjects, false));
        setInitialized(true);
      }
    }
  }, [groupedProjects, searchTerm, initialized]);

  if (loading) {
    return <LoadingSpinner message="Loading mapping groups..." />;
  }

  // Toggle expansion for a project or subproject
  const toggleExpansion = (key) => {
    setExpansionState(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  return (
    <PageTransition>
      <div className="gps-page-container">
        <PageHeader
          title="Mapping Job Groups"
          subtitle="Batch execution of transformations with concurrency control"
          hideHomeButton={true}
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

        {groupedProjects.length === 0 ? (
          <div className="empty-state">
            <p>No mapping groups found. Create one to get started!</p>
          </div>
        ) : (
          <div>
            {groupedProjects.map(project => {
              const projectKey = `project-${project.projectId}`;
              const isProjectExpanded = expansionState[projectKey];

              return (
                <div key={project.projectId} style={{ marginBottom: '1.25rem' }}>
                  {/* Project Header */}
                  <div
                    onClick={() => toggleExpansion(projectKey)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      background: 'white',
                      color: '#6b7280',
                      cursor: 'pointer',
                      userSelect: 'none',
                      fontWeight: '500',
                      fontSize: '0.8125rem',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {isProjectExpanded ? (
                      <FiChevronDown size={14} style={{ color: '#6b7280' }} />
                    ) : (
                      <FiChevronRight size={14} style={{ color: '#6b7280' }} />
                    )}
                    <span style={{ flex: 1 }}>Project : {project.projectName}</span>
                    <span
                      style={{
                        color: '#9ca3af',
                        fontSize: '0.75rem',
                        fontWeight: '400'
                      }}
                    >
                      {project.groupsCount} {project.groupsCount === 1 ? 'group' : 'groups'}
                    </span>
                  </div>

                  {/* Project Content - Subprojects */}
                  {isProjectExpanded && (
                    <div style={{ marginTop: '0.75rem', paddingLeft: '0.5rem' }}>
                      {/* Subprojects */}
                      {project.subprojects.map(subproject => {
                        const subprojectKey = `subproject-${project.projectId}-${subproject.subProjectId}`;
                        const isSubprojectExpanded = expansionState[subprojectKey];

                        return (
                          <div key={subproject.subProjectId} style={{ marginBottom: '0.75rem' }}>
                            {/* Subproject Header */}
                            <div
                              onClick={() => toggleExpansion(subprojectKey)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.4rem 0.75rem',
                                background: 'white',
                                cursor: 'pointer',
                                userSelect: 'none',
                                marginLeft: '1.5rem',
                                fontWeight: '400',
                                fontSize: '0.75rem',
                                transition: 'all 0.2s ease'
                              }}
                            >
                              {isSubprojectExpanded ? (
                                <FiChevronDown size={12} style={{ color: '#9ca3af' }} />
                              ) : (
                                <FiChevronRight size={12} style={{ color: '#9ca3af' }} />
                              )}
                              <span style={{ flex: 1, color: '#9ca3af' }}>{subproject.subProjectName}</span>
                              <span
                                style={{
                                  color: '#d1d5db',
                                  fontSize: '0.6875rem',
                                  fontWeight: '400'
                                }}
                              >
                                {subproject.groupsCount}
                              </span>
                            </div>

                            {/* Subproject Groups Table */}
                            {isSubprojectExpanded && subproject.items.length > 0 && (
                              <div style={{ marginLeft: '1.5rem', marginTop: '0.5rem', overflow: 'auto' }}>
                                <table className="gps-table">
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
                                    {subproject.items.map(group => (
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
                          </div>
                        );
                      })}

                      {/* Unassigned Groups (no subproject) */}
                      {project.unassignedGroups.length > 0 && (() => {
                        const unassignedKey = `subproject-${project.projectId}-unassigned`;
                        const isUnassignedExpanded = expansionState[unassignedKey];

                        return (
                          <>
                            {/* Unassigned Header */}
                            <div
                              onClick={() => toggleExpansion(unassignedKey)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.4rem 0.75rem',
                                background: 'white',
                                cursor: 'pointer',
                                userSelect: 'none',
                                marginLeft: '1.5rem',
                                fontWeight: '400',
                                fontSize: '0.75rem',
                                transition: 'all 0.2s ease'
                              }}
                            >
                              {isUnassignedExpanded ? (
                                <FiChevronDown size={12} style={{ color: '#9ca3af' }} />
                              ) : (
                                <FiChevronRight size={12} style={{ color: '#9ca3af' }} />
                              )}
                              <FiAlertCircle size={12} style={{ color: '#d1d5db' }} />
                              <span style={{ flex: 1, color: '#9ca3af' }}>No Subproject</span>
                              <span
                                style={{
                                  color: '#d1d5db',
                                  fontSize: '0.6875rem',
                                  fontWeight: '400'
                                }}
                              >
                                {project.unassignedGroups.length}
                              </span>
                            </div>

                            {/* Unassigned Groups Table */}
                            {isUnassignedExpanded && (
                              <div style={{ marginLeft: '1.5rem', marginTop: '0.5rem', overflow: 'auto' }}>
                                <table className="gps-table">
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
                                    {project.unassignedGroups.map(group => (
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
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
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
