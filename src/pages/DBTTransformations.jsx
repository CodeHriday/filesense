import React, { useState, useEffect } from 'react';
import { FaPlay, FaSync, FaCheck, FaTimes, FaClock, FaCode, FaLayerGroup, FaHistory } from 'react-icons/fa';
import axios from 'axios';

const DBTTransformations = () => {
  const [models, setModels] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [selectedModels, setSelectedModels] = useState([]);
  const [activeTab, setActiveTab] = useState('models');
  const [selectedExecution, setSelectedExecution] = useState(null);

  useEffect(() => {
    loadModels();
    loadExecutions();
    const interval = setInterval(loadExecutions, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadModels = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/dbt/models');
      setModels(response.data);
    } catch (error) {
      console.error('Error loading models:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadExecutions = async () => {
    try {
      const response = await axios.get('/api/dbt/executions?limit=20');
      setExecutions(response.data);
    } catch (error) {
      console.error('Error loading executions:', error);
    }
  };

  const handleDiscover = async () => {
    try {
      setDiscovering(true);
      const response = await axios.post('/api/dbt/discover');
      alert(`Discovered ${response.data.discovered} models`);
      await loadModels();
    } catch (error) {
      console.error('Error discovering models:', error);
      alert('Failed to discover models: ' + error.message);
    } finally {
      setDiscovering(false);
    }
  };

  const handleExecute = async (command = 'run', modelsSelector = null) => {
    try {
      setExecuting(true);
      const response = await axios.post('/api/dbt/execute', {
        command,
        modelsSelector
      });
      
      alert(`Execution started: ${response.data.status}`);
      await loadExecutions();
      await loadModels();
    } catch (error) {
      console.error('Error executing DBT:', error);
      alert('Failed to execute: ' + error.response?.data?.message || error.message);
    } finally {
      setExecuting(false);
    }
  };

  const handleRunSelected = () => {
    if (selectedModels.length === 0) {
      alert('Please select at least one model');
      return;
    }
    const selector = selectedModels.join(' ');
    handleExecute('run', selector);
  };

  const toggleModelSelection = (modelName) => {
    setSelectedModels(prev => 
      prev.includes(modelName) 
        ? prev.filter(m => m !== modelName)
        : [...prev, modelName]
    );
  };

  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'success':
        return <FaCheck className="text-green-500" />;
      case 'failed':
      case 'error':
        return <FaTimes className="text-red-500" />;
      case 'running':
        return <FaClock className="text-blue-500 animate-pulse" />;
      default:
        return <FaClock className="text-gray-400" />;
    }
  };

  const formatDuration = (ms) => {
    if (!ms) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${seconds}s`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const viewExecutionDetails = async (executionId) => {
    try {
      const response = await axios.get(`/api/dbt/executions/${executionId}`);
      setSelectedExecution(response.data);
    } catch (error) {
      console.error('Error loading execution details:', error);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">DBT Transformations</h1>
        <p className="text-gray-600">Manage and execute data transformation models using DBT</p>
      </div>

      <div className="mb-6 flex gap-2">
        <button
          onClick={() => setActiveTab('models')}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
            activeTab === 'models' 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          <FaLayerGroup /> Models
        </button>
        <button
          onClick={() => setActiveTab('executions')}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
            activeTab === 'executions' 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          <FaHistory /> Execution History
        </button>
      </div>

      {activeTab === 'models' && (
        <div>
          <div className="mb-6 flex gap-2 flex-wrap">
            <button
              onClick={handleDiscover}
              disabled={discovering}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <FaSync className={discovering ? 'animate-spin' : ''} />
              {discovering ? 'Discovering...' : 'Discover Models'}
            </button>
            <button
              onClick={() => handleExecute('run')}
              disabled={executing}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <FaPlay />
              {executing ? 'Running...' : 'Run All Models'}
            </button>
            <button
              onClick={handleRunSelected}
              disabled={executing || selectedModels.length === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <FaPlay />
              Run Selected ({selectedModels.length})
            </button>
            <button
              onClick={() => handleExecute('test')}
              disabled={executing}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <FaCode />
              {executing ? 'Testing...' : 'Run Tests'}
            </button>
          </div>

          {loading ? (
            <div className="text-center py-8">Loading models...</div>
          ) : models.length === 0 ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
              <p className="text-gray-700 mb-4">No DBT models found. Click "Discover Models" to scan your project.</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <input
                        type="checkbox"
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedModels(models.map(m => m.model_name));
                          } else {
                            setSelectedModels([]);
                          }
                        }}
                        checked={selectedModels.length === models.length && models.length > 0}
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Model</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Materialization</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Run</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tags</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {models.map((model) => (
                    <tr key={model.model_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedModels.includes(model.model_name)}
                          onChange={() => toggleModelSelection(model.model_name)}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <FaCode className="text-gray-400" />
                          <div>
                            <div className="text-sm font-medium text-gray-900">{model.model_name}</div>
                            <div className="text-xs text-gray-500">{model.model_path}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                          {model.model_type || 'staging'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {model.materialization || 'view'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(model.last_run_status)}
                          <span className="text-sm">{model.last_run_status || 'Not run'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(model.last_run_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDuration(model.last_run_duration_ms)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex gap-1 flex-wrap">
                          {model.tags?.map((tag, idx) => (
                            <span key={`tag-${tag}-${idx}`} className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'executions' && (
        <div>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {executions.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No executions yet</div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Command</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Models</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Started</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Results</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Triggered By</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {executions.map((execution) => (
                    <tr key={execution.execution_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(execution.status)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        dbt {execution.command}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {execution.models_selector || 'all'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(execution.started_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDuration(execution.duration_ms)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-xs">
                          <div className="text-green-600">✓ {execution.models_success || 0}</div>
                          {execution.models_failed > 0 && (
                            <div className="text-red-600">✗ {execution.models_failed}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div>
                          <div>{execution.triggered_by}</div>
                          <div className="text-xs text-gray-400">{execution.trigger_type}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => viewExecutionDetails(execution.execution_id)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {selectedExecution && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold">Execution Details</h2>
                  <p className="text-gray-600">Execution #{selectedExecution.execution_id}</p>
                </div>
                <button
                  onClick={() => setSelectedExecution(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <FaTimes size={24} />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label htmlFor="execution-status" className="text-sm font-medium text-gray-600">Status</label>
                  <div id="execution-status" className="flex items-center gap-2 mt-1">
                    {getStatusIcon(selectedExecution.status)}
                    <span className="font-semibold">{selectedExecution.status}</span>
                  </div>
                </div>
                <div>
                  <label htmlFor="execution-command" className="text-sm font-medium text-gray-600">Command</label>
                  <p id="execution-command" className="mt-1">dbt {selectedExecution.command}</p>
                </div>
                <div>
                  <label htmlFor="execution-duration" className="text-sm font-medium text-gray-600">Duration</label>
                  <p id="execution-duration" className="mt-1">{formatDuration(selectedExecution.duration_ms)}</p>
                </div>
                <div>
                  <label htmlFor="execution-models-run" className="text-sm font-medium text-gray-600">Models Run</label>
                  <p id="execution-models-run" className="mt-1">{selectedExecution.models_run || 0}</p>
                </div>
              </div>

              {selectedExecution.error_message && (
                <div className="mb-6">
                  <label htmlFor="execution-error" className="text-sm font-medium text-gray-600">Error</label>
                  <pre id="execution-error" className="mt-1 p-4 bg-red-50 text-red-800 rounded-lg overflow-auto text-sm">
                    {selectedExecution.error_message}
                  </pre>
                </div>
              )}

              {selectedExecution.logs && (
                <div>
                  <label htmlFor="execution-logs" className="text-sm font-medium text-gray-600">Logs</label>
                  <pre id="execution-logs" className="mt-1 p-4 bg-gray-50 rounded-lg overflow-auto text-xs font-mono max-h-96">
                    {selectedExecution.logs}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DBTTransformations;
