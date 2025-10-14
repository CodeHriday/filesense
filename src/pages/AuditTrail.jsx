import React, { useState, useEffect } from 'react';
import { FiSearch, FiFilter, FiDownload, FiEye, FiClock, FiUser, FiActivity } from 'react-icons/fi';
import axios from 'axios';

const AuditTrail = () => {
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null);
  
  const [filters, setFilters] = useState({
    userId: '',
    entityType: '',
    actionType: '',
    startDate: '',
    endDate: '',
    limit: 100
  });

  const actionTypes = [
    'CREATE', 'UPDATE', 'DELETE', 'READ', 'UPLOAD', 'DOWNLOAD', 'EXECUTE', 'VIEW'
  ];

  const entityTypes = [
    'file', 'schedule', 'job_group', 'transformation', 'quality_check', 
    'profile', 'user', 'audit', 'dbt'
  ];

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.userId) params.append('userId', filters.userId);
      if (filters.entityType) params.append('entityType', filters.entityType);
      if (filters.actionType) params.append('actionType', filters.actionType);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      params.append('limit', filters.limit);

      const response = await axios.get(`/api/audit/logs?${params.toString()}`);
      setAuditLogs(response.data);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleSearch = () => {
    fetchAuditLogs();
  };

  const handleClearFilters = () => {
    setFilters({
      userId: '',
      entityType: '',
      actionType: '',
      startDate: '',
      endDate: '',
      limit: 100
    });
  };

  const handleExport = async () => {
    try {
      const response = await axios.post('/api/audit/export', filters, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `audit-logs-${new Date().toISOString()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Error exporting audit logs:', error);
    }
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'SUCCESS': return 'bg-green-100 text-green-800';
      case 'FAILURE': return 'bg-red-100 text-red-800';
      case 'PARTIAL': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getActionBadgeColor = (action) => {
    switch (action) {
      case 'CREATE': return 'bg-blue-100 text-blue-800';
      case 'UPDATE': return 'bg-purple-100 text-purple-800';
      case 'DELETE': return 'bg-red-100 text-red-800';
      case 'READ':
      case 'VIEW': return 'bg-gray-100 text-gray-800';
      case 'UPLOAD': return 'bg-indigo-100 text-indigo-800';
      case 'DOWNLOAD': return 'bg-cyan-100 text-cyan-800';
      case 'EXECUTE': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const renderDiff = (changes) => {
    if (!changes) return null;
    
    const changesObj = typeof changes === 'string' ? JSON.parse(changes) : changes;
    
    return (
      <div className="space-y-2">
        {Object.entries(changesObj).map(([key, value]) => (
          <div key={key} className="text-sm">
            <span className="font-semibold text-gray-700">{key}:</span>
            <div className="ml-4 space-y-1">
              {value.from !== undefined && (
                <div className="text-red-600">
                  <span className="font-mono text-xs">- </span>
                  {JSON.stringify(value.from)}
                </div>
              )}
              {value.to !== undefined && (
                <div className="text-green-600">
                  <span className="font-mono text-xs">+ </span>
                  {JSON.stringify(value.to)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Audit Trail</h1>
          <p className="text-gray-600">Comprehensive log of all system activities</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm mb-6 p-6">
          <div className="flex items-center gap-2 mb-4">
            <FiFilter className="text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                User ID
              </label>
              <input
                type="text"
                placeholder="Enter user ID"
                value={filters.userId}
                onChange={(e) => handleFilterChange('userId', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Action Type
              </label>
              <select
                value={filters.actionType}
                onChange={(e) => handleFilterChange('actionType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Actions</option>
                {actionTypes.map(action => (
                  <option key={action} value={action}>{action}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Entity Type
              </label>
              <select
                value={filters.entityType}
                onChange={(e) => handleFilterChange('entityType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Entities</option>
                {entityTypes.map(entity => (
                  <option key={entity} value={entity}>{entity.replace('_', ' ').toUpperCase()}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="datetime-local"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="datetime-local"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Limit
              </label>
              <input
                type="number"
                value={filters.limit}
                onChange={(e) => handleFilterChange('limit', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSearch}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
            >
              <FiSearch />
              Search
            </button>
            <button
              onClick={handleClearFilters}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
            >
              Clear Filters
            </button>
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2 ml-auto"
            >
              <FiDownload />
              Export CSV
            </button>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading audit logs...</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Action
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Entity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                        No audit logs found
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.audit_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div className="flex items-center gap-2">
                            <FiClock className="text-gray-400" />
                            {formatTimestamp(log.timestamp)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <FiUser className="text-gray-400" />
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {log.user_email || log.user_id || 'System'}
                              </div>
                              {log.user_role && (
                                <div className="text-xs text-gray-500">{log.user_role}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getActionBadgeColor(log.action_type)}`}>
                            {log.action_type}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {log.entity_type}
                          </div>
                          {log.entity_name && (
                            <div className="text-xs text-gray-500">{log.entity_name}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeColor(log.status)}`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => setSelectedLog(log)}
                            className="text-blue-600 hover:text-blue-900 flex items-center gap-1"
                          >
                            <FiEye />
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {selectedLog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Audit Log Details</h3>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Timestamp</label>
                    <p className="mt-1 text-sm text-gray-900">{formatTimestamp(selectedLog.timestamp)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Request ID</label>
                    <p className="mt-1 text-sm text-gray-900 font-mono">{selectedLog.request_id || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">User</label>
                    <p className="mt-1 text-sm text-gray-900">{selectedLog.user_email || selectedLog.user_id}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">IP Address</label>
                    <p className="mt-1 text-sm text-gray-900">{selectedLog.ip_address || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Action Type</label>
                    <p className="mt-1">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getActionBadgeColor(selectedLog.action_type)}`}>
                        {selectedLog.action_type}
                      </span>
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Status</label>
                    <p className="mt-1">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeColor(selectedLog.status)}`}>
                        {selectedLog.status}
                      </span>
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Entity Type</label>
                    <p className="mt-1 text-sm text-gray-900">{selectedLog.entity_type}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Entity ID</label>
                    <p className="mt-1 text-sm text-gray-900 font-mono">{selectedLog.entity_id}</p>
                  </div>
                </div>

                {selectedLog.error_message && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-4">
                    <label className="text-sm font-medium text-red-800">Error Message</label>
                    <p className="mt-1 text-sm text-red-700">{selectedLog.error_message}</p>
                  </div>
                )}

                {selectedLog.changes && (
                  <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Changes</label>
                    {renderDiff(selectedLog.changes)}
                  </div>
                )}

                {selectedLog.metadata && (
                  <div>
                    <label className="text-sm font-medium text-gray-500 mb-2 block">Metadata</label>
                    <pre className="mt-1 text-xs text-gray-900 bg-gray-50 p-4 rounded-md overflow-x-auto">
                      {JSON.stringify(typeof selectedLog.metadata === 'string' ? JSON.parse(selectedLog.metadata) : selectedLog.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditTrail;
