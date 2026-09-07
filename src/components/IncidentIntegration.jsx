import React, { useState, useEffect, useRef } from 'react';
import LoadingSpinner from './LoadingSpinner';
import PropTypes from 'prop-types';
import { 
  FiAlertTriangle, 
  FiSlack, 
  FiMail, 
  FiMessageCircle, 
  FiPlus, 
  FiEdit2, 
  FiTrash2,
  FiCheck,
  FiSave,
  FiSettings,
  FiFilter,
  FiExternalLink
} from 'react-icons/fi';
import { ContextualTooltip } from './ContextualTooltip';
import { ToggleSwitch, CollapsiblePanel } from './MicroInteractions';
import { LoadingSkeleton } from './LoadingSkeleton';
import ConfirmModal from './ConfirmModal';
import './IncidentIntegration.css';

/**
 * Component for integrating with incident management systems
 */
const IncidentIntegration = ({
  loading = false,
  onSaveIntegration,
  onTestIntegration,
  onDeleteIntegration,
  className = '',
  style = {}
}) => {
  // Supported incident management systems
  const INTEGRATION_TYPES = {
    jira: {
      name: 'Jira',
      icon: 'jira-icon.svg',
      fields: ['url', 'username', 'apiToken', 'projectKey'],
      description: 'Create issues in Jira when data quality incidents occur',
      color: '#0052CC'
    },
    servicenow: {
      name: 'ServiceNow',
      icon: 'servicenow-icon.svg',
      fields: ['instanceUrl', 'username', 'password'],
      description: 'Create incidents in ServiceNow for data quality issues',
      color: '#81B5A1'
    },
    pagerduty: {
      name: 'PagerDuty',
      icon: 'pagerduty-icon.svg',
      fields: ['apiKey', 'serviceId'],
      description: 'Trigger PagerDuty alerts for critical data issues',
      color: '#06AC38'
    },
    slack: {
      name: 'Slack',
      icon: 'slack-icon.svg',
      fields: ['webhookUrl', 'channelName'],
      description: 'Send notifications to Slack channels',
      color: '#4A154B'
    },
    teams: {
      name: 'Microsoft Teams',
      icon: 'teams-icon.svg',
      fields: ['webhookUrl'],
      description: 'Send notifications to Microsoft Teams channels',
      color: '#6264A7'
    },
    email: {
      name: 'Email Notifications',
      icon: 'email-icon.svg',
      fields: ['recipients', 'smtpSettings'],
      description: 'Send email notifications for data incidents',
      color: '#EA4335'
    },
    opsgenie: {
      name: 'Opsgenie',
      icon: 'opsgenie-icon.svg',
      fields: ['apiKey', 'region'],
      description: 'Create alerts in Opsgenie for data incidents',
      color: '#0052CC'
    },
    custom: {
      name: 'Custom Webhook',
      icon: 'webhook-icon.svg',
      fields: ['url', 'headers', 'payloadTemplate'],
      description: 'Send custom webhooks to any endpoint',
      color: '#607D8B'
    }
  };
  
  // State for integrations
  const [integrations, setIntegrations] = useState([]);
  const [editingIntegration, setEditingIntegration] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newIntegration, setNewIntegration] = useState({
    type: 'slack',
    name: '',
    settings: {},
    active: true,
    triggerConditions: {
      severity: ['critical', 'high'],
      metricTypes: ['completeness', 'accuracy'],
      thresholds: {
        qualityScore: 70
      }
    }
  });
  const [testResult, setTestResult] = useState(null);
  const [activeTab, setActiveTab] = useState('integrations');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBySeverity, setFilterBySeverity] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, action: null, message: '', title: '' });
  
  // Refs
  const addFormRef = useRef(null);
  
  // Load integrations on component mount
  useEffect(() => {
    loadIntegrations();
    loadIncidents();
  }, []);
  
  // Close add/edit form when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (addFormRef.current && !addFormRef.current.contains(event.target)) {
        setShowAddForm(false);
        setEditingIntegration(null);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  // Load existing integrations — real Jira connections from backend + localStorage for others
  const loadIntegrations = async () => {
    try {
      const token = localStorage.getItem('token');
      const { default: axios } = await import('axios');
      const { API_BASE_URL } = await import('../config');

      // Load real Jira connections from backend
      let jiraIntegrations = [];
      try {
        const jiraRes = await axios.get(`${API_BASE_URL}/api/jira/connections`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        jiraIntegrations = (jiraRes.data || []).map(conn => ({
          id: conn.connection_id,
          type: 'jira',
          name: conn.name,
          status: conn.status,
          settings: {
            url:             conn.instance_url,
            projectKey:      conn.project_key,
            // The form renders 'username' (from INTEGRATION_TYPES.jira.fields).
            // Keep it empty so unchanged saves never send the masked display value
            // to the backend as a real credential. Use email_display only for UI.
            username:      '',
            email_display: conn.email_display,
            apiToken:      ''
          },
          active: conn.status === 'active',
          isRealConnection: true,
          lastTriggered: conn.updated_at
        }));
      } catch (jiraErr) {
        console.warn('Could not load Jira connections:', jiraErr.message);
      }

      // Load non-Jira integrations from localStorage (legacy)
      const savedIntegrations = localStorage.getItem('dfo-incident-integrations');
      let otherIntegrations = [];
      if (savedIntegrations) {
        try {
          const parsed = JSON.parse(savedIntegrations);
          otherIntegrations = parsed.filter(i => i.type !== 'jira');
        } catch (e) {
          otherIntegrations = [];
        }
      }

      setIntegrations([...jiraIntegrations, ...otherIntegrations]);
    } catch (error) {
      console.error('Error loading integrations:', error);
      setIntegrations([]);
    }
  };
  
  // Load existing incidents
  const loadIncidents = () => {
    // Simulated API call - in a real app, this would call the backend
    setTimeout(() => {
      const demoIncidents = [
        {
          id: 'inc-001',
          title: 'Critical Completeness Issue in Sales Data',
          description: 'Sales data is missing 30% of values in the customer_id column',
          severity: 'critical',
          status: 'open',
          createdAt: '2025-04-18T05:30:45Z',
          resolvedAt: null,
          fileId: 'file-001',
          fileName: 'sales_data_2025.csv',
          metricType: 'completeness',
          qualityScore: 65,
          assignee: 'John Doe',
          integrations: ['int-001', 'int-002'],
          externalLinks: [
            {
              name: 'Jira Issue',
              url: 'https://example.atlassian.net/browse/DQ-123'
            },
            {
              name: 'Slack Thread',
              url: 'https://example.slack.com/archives/C0123456789/p1586023456000200'
            }
          ],
          timeline: [
            {
              timestamp: '2025-04-18T05:30:45Z',
              event: 'Incident detected',
              details: 'Automated system detected completeness issue'
            },
            {
              timestamp: '2025-04-18T05:32:10Z',
              event: 'Notification sent',
              details: 'Slack notification sent to #data-quality-alerts'
            },
            {
              timestamp: '2025-04-18T05:35:22Z',
              event: 'Jira issue created',
              details: 'Issue DQ-123 created in Jira'
            }
          ]
        },
        {
          id: 'inc-002',
          title: 'High Accuracy Issue in Customer Data',
          description: 'Customer data contains invalid email addresses in 15% of records',
          severity: 'high',
          status: 'investigating',
          createdAt: '2025-04-17T14:22:30Z',
          resolvedAt: null,
          fileId: 'file-002',
          fileName: 'customer_database_export.csv',
          metricType: 'accuracy',
          qualityScore: 78,
          assignee: 'Jane Smith',
          integrations: ['int-001'],
          externalLinks: [
            {
              name: 'Slack Thread',
              url: 'https://example.slack.com/archives/C0123456789/p1586023456000201'
            }
          ],
          timeline: [
            {
              timestamp: '2025-04-17T14:22:30Z',
              event: 'Incident detected',
              details: 'Automated system detected accuracy issue'
            },
            {
              timestamp: '2025-04-17T14:25:05Z',
              event: 'Notification sent',
              details: 'Slack notification sent to #data-quality-alerts'
            },
            {
              timestamp: '2025-04-17T15:10:45Z',
              event: 'Status updated',
              details: 'Changed from "open" to "investigating"'
            }
          ]
        },
        {
          id: 'inc-003',
          title: 'Medium Timeliness Issue in Inventory Data',
          description: 'Inventory data is 3 days out of date',
          severity: 'medium',
          status: 'resolved',
          createdAt: '2025-04-15T09:15:00Z',
          resolvedAt: '2025-04-15T11:45:22Z',
          fileId: 'file-003',
          fileName: 'inventory_levels.csv',
          metricType: 'timeliness',
          qualityScore: 82,
          assignee: 'Alex Johnson',
          integrations: ['int-001'],
          externalLinks: [
            {
              name: 'Slack Thread',
              url: 'https://example.slack.com/archives/C0123456789/p1586023456000202'
            }
          ],
          timeline: [
            {
              timestamp: '2025-04-15T09:15:00Z',
              event: 'Incident detected',
              details: 'Automated system detected timeliness issue'
            },
            {
              timestamp: '2025-04-15T09:18:32Z',
              event: 'Notification sent',
              details: 'Slack notification sent to #data-quality-alerts'
            },
            {
              timestamp: '2025-04-15T10:05:15Z',
              event: 'Status updated',
              details: 'Changed from "open" to "investigating"'
            },
            {
              timestamp: '2025-04-15T11:45:22Z',
              event: 'Incident resolved',
              details: 'Data refresh process completed successfully'
            }
          ]
        }
      ];
      
      setIncidents(demoIncidents);
    }, 700);
  };
  
  // Handle form input changes
  const handleInputChange = (field, value) => {
    if (editingIntegration !== null) {
      // Editing existing integration
      const updatedIntegrations = [...integrations];
      
      if (field.startsWith('settings.')) {
        // Handle nested settings field
        const settingField = field.replace('settings.', '');
        updatedIntegrations[editingIntegration].settings = {
          ...updatedIntegrations[editingIntegration].settings,
          [settingField]: value
        };
      } else if (field === 'active') {
        updatedIntegrations[editingIntegration].active = value;
      } else {
        updatedIntegrations[editingIntegration][field] = value;
      }
      
      setIntegrations(updatedIntegrations);
    } else {
      // Adding new integration
      if (field.startsWith('settings.')) {
        // Handle nested settings field
        const settingField = field.replace('settings.', '');
        setNewIntegration(prev => ({
          ...prev,
          settings: {
            ...prev.settings,
            [settingField]: value
          }
        }));
      } else if (field.startsWith('triggerConditions.')) {
        // Handle nested trigger conditions
        const parts = field.split('.');
        if (parts.length === 3) {
          // Handle deeply nested fields like triggerConditions.thresholds.qualityScore
          setNewIntegration(prev => ({
            ...prev,
            triggerConditions: {
              ...prev.triggerConditions,
              [parts[1]]: {
                ...prev.triggerConditions[parts[1]],
                [parts[2]]: value
              }
            }
          }));
        } else {
          // Handle regular nested fields like triggerConditions.severity
          setNewIntegration(prev => ({
            ...prev,
            triggerConditions: {
              ...prev.triggerConditions,
              [parts[1]]: value
            }
          }));
        }
      } else {
        // Handle top-level fields
        setNewIntegration(prev => ({
          ...prev,
          [field]: value
        }));
      }
    }
  };
  
  // Save integration
  const handleSaveIntegration = async () => {
    const token = localStorage.getItem('token');
    const { default: axios } = await import('axios');
    const { API_BASE_URL } = await import('../config');

    if (editingIntegration !== null) {
      const integration = integrations[editingIntegration];

      if (integration.type === 'jira') {
        // Update Jira connection via real backend.
        // Only send email / apiToken if the admin explicitly typed new values —
        // the backend will keep the existing encrypted credentials otherwise.
        // NEVER send settings.email_display (masked value) as a credential.
        try {
          const updatePayload = {
            name:        integration.name,
            instanceUrl: integration.settings?.url,
            projectKey:  integration.settings?.projectKey
          };
          // The Jira form field is named 'username' (see INTEGRATION_TYPES.jira).
          // Only include credentials if the admin entered new values.
          const newEmail    = (integration.settings?.username || '').trim();
          const newApiToken = (integration.settings?.apiToken || '').trim();
          if (newEmail)    updatePayload.email    = newEmail;
          if (newApiToken) updatePayload.apiToken = newApiToken;

          await axios.put(`${API_BASE_URL}/api/jira/connections/${integration.id}`, updatePayload,
            { headers: { Authorization: `Bearer ${token}` } });
          await loadIntegrations();
        } catch (err) {
          console.error('Failed to update Jira connection', err);
        }
      } else {
        localStorage.setItem('dfo-incident-integrations', JSON.stringify(integrations));
      }

      setEditingIntegration(null);
      if (onSaveIntegration) onSaveIntegration(integration);
    } else {
      // Add new integration
      if (newIntegration.type === 'jira') {
        // Create Jira connection via real backend
        try {
          await axios.post(`${API_BASE_URL}/api/jira/connections`, {
            name: newIntegration.name || 'Jira Connection',
            instanceUrl: newIntegration.settings?.url,
            email: newIntegration.settings?.username,
            apiToken: newIntegration.settings?.apiToken,
            projectKey: newIntegration.settings?.projectKey
          }, { headers: { Authorization: `Bearer ${token}` } });
          await loadIntegrations();
        } catch (err) {
          console.error('Failed to create Jira connection', err);
        }
      } else {
        const integration = {
          ...newIntegration,
          id: `int-${Date.now()}`,
          lastTriggered: null
        };
        const updatedIntegrations = [...integrations.filter(i => i.type !== 'jira'), integration];
        setIntegrations(updatedIntegrations);
        localStorage.setItem('dfo-incident-integrations', JSON.stringify(updatedIntegrations.filter(i => i.type !== 'jira')));
        if (onSaveIntegration) onSaveIntegration(integration);
      }

      setShowAddForm(false);
      setNewIntegration({
        type: 'slack',
        name: '',
        settings: {},
        active: true,
        triggerConditions: {
          severity: ['critical', 'high'],
          metricTypes: ['completeness', 'accuracy'],
          thresholds: { qualityScore: 70 }
        }
      });
    }
  };
  
  // Delete integration
  const handleDeleteIntegration = (index) => {
    setConfirmModal({
      isOpen: true,
      title: 'Confirm Deletion',
      message: 'Are you sure you want to delete this integration?',
      action: async () => {
        const integrationToDelete = integrations[index];

        if (integrationToDelete.type === 'jira' && integrationToDelete.isRealConnection) {
          // Delete real Jira connection via backend
          try {
            const token = localStorage.getItem('token');
            const { default: axios } = await import('axios');
            const { API_BASE_URL } = await import('../config');
            await axios.delete(`${API_BASE_URL}/api/jira/connections/${integrationToDelete.id}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
          } catch (err) {
            console.error('Failed to delete Jira connection', err);
          }
          await loadIntegrations();
        } else {
          const updatedIntegrations = integrations.filter((_, i) => i !== index);
          setIntegrations(updatedIntegrations);
          localStorage.setItem('dfo-incident-integrations', JSON.stringify(updatedIntegrations.filter(i => i.type !== 'jira')));
        }

        if (editingIntegration === index) setEditingIntegration(null);
        if (onDeleteIntegration) onDeleteIntegration(integrationToDelete);
      }
    });
  };
  
  // Test integration
  const handleTestIntegration = async (index) => {
    const integration = editingIntegration !== null 
      ? integrations[editingIntegration] 
      : newIntegration;
    
    setTestResult({
      status: 'testing',
      message: `Testing ${INTEGRATION_TYPES[integration.type]?.name || integration.type} integration...`
    });
    
    try {
      if (integration.type === 'jira') {
        const token = localStorage.getItem('token');
        const { default: axios } = await import('axios');
        const { API_BASE_URL } = await import('../config');

        // For existing (real) connections the backend always uses the stored
        // encrypted credentials. Only send overrides if the admin has typed new
        // credentials into the form — never forward settings.email_display.
        const testPayload = {};
        if (integration.isRealConnection) {
          testPayload.connectionId = integration.id;
          // The form field is 'username' — only forward if the admin typed a new value.
          const newEmail    = (integration.settings?.username || '').trim();
          const newApiToken = (integration.settings?.apiToken || '').trim();
          if (newEmail)    testPayload.email    = newEmail;
          if (newApiToken) testPayload.apiToken = newApiToken;
        } else {
          testPayload.instanceUrl = integration.settings?.url;
          testPayload.email       = (integration.settings?.username || '').trim();
          testPayload.apiToken    = (integration.settings?.apiToken || '').trim();
        }

        const res = await axios.post(`${API_BASE_URL}/api/jira/connections/test`, testPayload,
          { headers: { Authorization: `Bearer ${token}` } });

        if (res.data?.success) {
          setTestResult({
            status: 'success',
            message: `Connected to Jira${res.data.displayName ? ` as ${res.data.displayName}` : ''}.`
          });
        } else {
          setTestResult({
            status: 'error',
            message: `Jira connection failed: ${res.data?.error || 'unknown error'}`
          });
        }
      } else {
        // Non-Jira: simulated test
        await new Promise(resolve => setTimeout(resolve, 1500));
        setTestResult({
          status: 'success',
          message: `Successfully connected to ${INTEGRATION_TYPES[integration.type]?.name || integration.type}.`
        });
      }

      if (onTestIntegration) onTestIntegration(integration);
    } catch (error) {
      setTestResult({
        status: 'error',
        message: `Failed to connect: ${error.response?.data?.error || error.message}`
      });
    }
    
    setTimeout(() => setTestResult(null), 5000);
  };
  
  // Render settings fields for the selected integration type
  const renderSettingsFields = (type, settings = {}) => {
    const integrationType = INTEGRATION_TYPES[type] || INTEGRATION_TYPES.custom;
    
    return (
      <div className="settings-fields">
        {/* Map through required fields for this integration type */}
        {integrationType.fields.map(field => {
          let fieldLabel = field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1');
          let fieldType = 'text';
          let placeholder = `Enter ${fieldLabel}`;
          
          // Special handling for certain fields
          if (field.includes('password') || field.includes('apiToken') || field.includes('apiKey')) {
            fieldType = 'password';
          } else if (field === 'recipients') {
            placeholder = 'Enter comma-separated email addresses';
          } else if (field === 'webhookUrl' || field === 'url') {
            placeholder = 'https://';
          }
          
          return (
            <div key={field} className="form-group">
              <label htmlFor={`integration-${field}`}>{fieldLabel}</label>
              <input
                type={fieldType}
                id={`integration-${field}`}
                name={field}
                value={settings[field] || ''}
                onChange={(e) => handleInputChange(`settings.${field}`, e.target.value)}
                placeholder={placeholder}
              />
              {field === 'webhookUrl' && type === 'slack' && (
                <div className="field-help">
                  <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noopener noreferrer">
                    Learn how to create a Slack webhook
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };
  
  // Filter incidents based on search term and filters
  const filteredIncidents = incidents.filter(incident => {
    const matchesSearch = incident.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          incident.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          incident.fileName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesSeverity = filterBySeverity.length === 0 || 
                          filterBySeverity.includes(incident.severity);
    
    return matchesSearch && matchesSeverity;
  });
  
  // Format datetime
  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'N/A';
    
    const date = new Date(dateStr);
    return date.toLocaleString();
  };
  
  // Get status label class
  const getStatusClass = (status) => {
    switch (status) {
      case 'open':
        return 'status-open';
      case 'investigating':
        return 'status-investigating';
      case 'resolved':
        return 'status-resolved';
      default:
        return '';
    }
  };
  
  // Get severity label class
  const getSeverityClass = (severity) => {
    switch (severity) {
      case 'critical':
        return 'severity-critical';
      case 'high':
        return 'severity-high';
      case 'medium':
        return 'severity-medium';
      case 'low':
        return 'severity-low';
      default:
        return '';
    }
  };
  
  // Get integration type icon
  const getIntegrationTypeIcon = (type) => {
    switch (type) {
      case 'slack':
        return <FiSlack />;
      case 'email':
        return <FiMail />;
      case 'teams':
        return <FiMessageCircle />;
      default:
        return <FiAlertTriangle />;
    }
  };
  
  // Render loading state
  if (loading) {
    return (
      <div className={`incident-integration loading ${className}`} style={style}>
        <div className="integration-header">
          <LoadingSkeleton type="text" width="250px" height="24px" />
          <div className="header-tabs">
            <LoadingSkeleton type="rectangle" width="120px" height="36px" borderRadius="18px" />
            <LoadingSkeleton type="rectangle" width="120px" height="36px" borderRadius="18px" />
          </div>
        </div>
        
        <div className="integration-content">
          <LoadingSkeleton type="rectangle" width="100%" height="60px" borderRadius="8px" className="search-skeleton" />
          
          <div className="integration-list">
            {[1, 2, 3].map(i => (
              <LoadingSkeleton
                key={i}
                type="rectangle"
                width="100%"
                height="80px"
                borderRadius="8px"
                className="integration-skeleton"
              />
            ))}
          </div>
          
          <LoadingSkeleton
            type="rectangle"
            width="200px"
            height="40px"
            borderRadius="20px"
            className="add-button-skeleton"
          />
        </div>
      </div>
    );
  }
  
  return (
    <div className={`incident-integration ${className}`} style={style}>
      <div className="integration-header">
        <h2>
          <FiAlertTriangle className="header-icon" />
          Incident Management
          <ContextualTooltip
            content="Connect to incident management systems to automatically create tickets, send notifications, and track data quality incidents."
            position="right"
            interactive={true}
          />
        </h2>
        
        <div className="header-tabs">
          <button 
            className={`tab-button ${activeTab === 'integrations' ? 'active' : ''}`}
            onClick={() => setActiveTab('integrations')}
          >
            Integrations
          </button>
          <button 
            className={`tab-button ${activeTab === 'incidents' ? 'active' : ''}`}
            onClick={() => setActiveTab('incidents')}
          >
            Incidents
          </button>
        </div>
      </div>
      
      <div className="integration-content">
        {activeTab === 'integrations' ? (
          /* INTEGRATIONS TAB */
          <>
            <div className="integrations-list">
              {integrations.map((integration, index) => (
                <div key={integration.id} className="integration-card">
                  <div className="integration-header">
                    <div 
                      className="integration-icon" 
                      style={{ backgroundColor: INTEGRATION_TYPES[integration.type]?.color || '#607D8B' }}
                    >
                      {getIntegrationTypeIcon(integration.type)}
                    </div>
                    
                    <div className="integration-info">
                      <h3 className="integration-name">{integration.name}</h3>
                      <div className="integration-type">
                        {INTEGRATION_TYPES[integration.type]?.name || 'Custom Integration'}
                      </div>
                    </div>
                    
                    <div className="integration-toggle">
                      <ToggleSwitch
                        isOn={integration.active}
                        onToggle={(value) => {
                          const updatedIntegrations = [...integrations];
                          updatedIntegrations[index].active = value;
                          setIntegrations(updatedIntegrations);
                          localStorage.setItem('dfo-incident-integrations', JSON.stringify(updatedIntegrations));
                        }}
                        size="small"
                      />
                    </div>
                  </div>
                  
                  <div className="integration-details">
                    <div className="integration-triggers">
                      <div className="trigger-title">Triggers on:</div>
                      <div className="trigger-conditions">
                        {integration.triggerConditions.severity && (
                          <div className="trigger-group">
                            <span className="trigger-label">Severity:</span>
                            <div className="trigger-tags">
                              {integration.triggerConditions.severity.map(severity => (
                                <span key={severity} className={`severity-tag ${severity}`}>
                                  {severity.charAt(0).toUpperCase() + severity.slice(1)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {integration.triggerConditions.metricTypes && (
                          <div className="trigger-group">
                            <span className="trigger-label">Metrics:</span>
                            <div className="trigger-tags">
                              {integration.triggerConditions.metricTypes.map(metric => (
                                <span key={metric} className="metric-tag">
                                  {metric.charAt(0).toUpperCase() + metric.slice(1)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {integration.triggerConditions.thresholds?.qualityScore && (
                          <div className="trigger-threshold">
                            Quality Score &lt; {integration.triggerConditions.thresholds.qualityScore}%
                          </div>
                        )}
                        
                        {integration.triggerConditions.schedule && (
                          <div className="trigger-schedule">
                            Scheduled: {integration.triggerConditions.schedule}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="integration-actions">
                      <button 
                        className="edit-button"
                        onClick={() => setEditingIntegration(index)}
                      >
                        <FiEdit2 />
                        Edit
                      </button>
                      
                      <button 
                        className="delete-button"
                        onClick={() => handleDeleteIntegration(index)}
                      >
                        <FiTrash2 />
                        Delete
                      </button>
                    </div>
                  </div>
                  
                  <div className="integration-footer">
                    <div className="integration-status">
                      {integration.lastTriggered ? (
                        <span>
                          Last triggered: {new Date(integration.lastTriggered).toLocaleString()}
                        </span>
                      ) : (
                        <span>Never triggered</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {integrations.length === 0 && (
                <div className="no-integrations">
                  <div className="no-data-icon">
                    <FiAlertTriangle />
                  </div>
                  <h3>No integrations configured</h3>
                  <p>Connect to incident management systems to automatically handle data quality issues.</p>
                </div>
              )}
            </div>
            
            {/* Add Integration Button */}
            <button 
              className="add-integration-button"
              onClick={() => setShowAddForm(true)}
            >
              <FiPlus />
              Add Integration
            </button>
            
            {/* Add/Edit Integration Form */}
            {(showAddForm || editingIntegration !== null) && (
              <div className="integration-form-overlay">
                <div className="integration-form" ref={addFormRef}>
                  <div className="form-header">
                    <h3>{editingIntegration !== null ? 'Edit Integration' : 'Add Integration'}</h3>
                    <button 
                      className="close-button"
                      onClick={() => {
                        setShowAddForm(false);
                        setEditingIntegration(null);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  
                  <div className="form-content">
                    <div className="form-group">
                      <label htmlFor="integration-name">Integration Name</label>
                      <input
                        type="text"
                        id="integration-name"
                        name="name"
                        value={editingIntegration !== null ? integrations[editingIntegration].name : newIntegration.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        placeholder="Enter a name for this integration"
                        required
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="integration-type">Integration Type</label>
                      <select
                        id="integration-type"
                        name="type"
                        value={editingIntegration !== null ? integrations[editingIntegration].type : newIntegration.type}
                        onChange={(e) => handleInputChange('type', e.target.value)}
                      >
                        {Object.entries(INTEGRATION_TYPES).map(([key, value]) => (
                          <option key={key} value={key}>
                            {value.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="form-section">
                      <h4>Connection Settings</h4>
                      {editingIntegration !== null
                        ? renderSettingsFields(
                            integrations[editingIntegration].type,
                            integrations[editingIntegration].settings
                          )
                        : renderSettingsFields(newIntegration.type, newIntegration.settings)
                      }
                    </div>
                    
                    <CollapsiblePanel
                      header={
                        <div className="trigger-conditions-header">
                          <h4>Trigger Conditions</h4>
                          <span className="panel-hint">Configure when this integration is triggered</span>
                        </div>
                      }
                      initialExpanded={false}
                    >
                      <div className="trigger-conditions-form">
                        <div className="form-group">
                          <label htmlFor="severityLevels">Severity Levels</label>
                          <div id="severityLevels" className="checkbox-group">
                            {['critical', 'high', 'medium', 'low'].map(severity => (
                              <label key={severity} htmlFor={`severity-${severity}`} className="checkbox-label">
                                <input
                                  id={`severity-${severity}`}
                                  type="checkbox"
                                  checked={editingIntegration !== null
                                    ? integrations[editingIntegration].triggerConditions.severity?.includes(severity)
                                    : newIntegration.triggerConditions.severity?.includes(severity)
                                  }
                                  onChange={(e) => {
                                    const currentSeverities = editingIntegration !== null
                                      ? [...integrations[editingIntegration].triggerConditions.severity || []]
                                      : [...newIntegration.triggerConditions.severity || []];
                                    
                                    if (e.target.checked) {
                                      // Add severity
                                      if (!currentSeverities.includes(severity)) {
                                        currentSeverities.push(severity);
                                      }
                                    } else {
                                      // Remove severity
                                      const index = currentSeverities.indexOf(severity);
                                      if (index !== -1) {
                                        currentSeverities.splice(index, 1);
                                      }
                                    }
                                    
                                    handleInputChange('triggerConditions.severity', currentSeverities);
                                  }}
                                />
                                <span className={`severity-indicator ${severity}`} />
                                {severity.charAt(0).toUpperCase() + severity.slice(1)}
                              </label>
                            ))}
                          </div>
                        </div>
                        
                        <div className="form-group">
                          <label htmlFor="metricTypes">Metric Types</label>
                          <div id="metricTypes" className="checkbox-group">
                            {['completeness', 'accuracy', 'consistency', 'timeliness', 'uniqueness'].map(metric => (
                              <label key={metric} htmlFor={`metric-${metric}`} className="checkbox-label">
                                <input
                                  id={`metric-${metric}`}
                                  type="checkbox"
                                  checked={editingIntegration !== null
                                    ? integrations[editingIntegration].triggerConditions.metricTypes?.includes(metric)
                                    : newIntegration.triggerConditions.metricTypes?.includes(metric)
                                  }
                                  onChange={(e) => {
                                    const currentMetrics = editingIntegration !== null
                                      ? [...integrations[editingIntegration].triggerConditions.metricTypes || []]
                                      : [...newIntegration.triggerConditions.metricTypes || []];
                                    
                                    if (e.target.checked) {
                                      // Add metric
                                      if (!currentMetrics.includes(metric)) {
                                        currentMetrics.push(metric);
                                      }
                                    } else {
                                      // Remove metric
                                      const index = currentMetrics.indexOf(metric);
                                      if (index !== -1) {
                                        currentMetrics.splice(index, 1);
                                      }
                                    }
                                    
                                    handleInputChange('triggerConditions.metricTypes', currentMetrics);
                                  }}
                                />
                                {metric.charAt(0).toUpperCase() + metric.slice(1)}
                              </label>
                            ))}
                          </div>
                        </div>
                        
                        <div className="form-group">
                          <label htmlFor="quality-threshold">Quality Score Threshold (%)</label>
                          <input
                            type="number"
                            id="quality-threshold"
                            min="0"
                            max="100"
                            value={editingIntegration !== null
                              ? integrations[editingIntegration].triggerConditions.thresholds?.qualityScore || 70
                              : newIntegration.triggerConditions.thresholds?.qualityScore || 70
                            }
                            onChange={(e) => handleInputChange(
                              'triggerConditions.thresholds.qualityScore',
                              parseInt(e.target.value, 10)
                            )}
                          />
                          <div className="field-help">
                            Integration will trigger when quality score falls below this threshold
                          </div>
                        </div>
                      </div>
                    </CollapsiblePanel>
                    
                    <div className="form-group">
                      <label className="active-label">
                        <span>Active</span>
                        <ToggleSwitch
                          isOn={editingIntegration !== null ? integrations[editingIntegration].active : newIntegration.active}
                          onToggle={(value) => handleInputChange('active', value)}
                          size="small"
                        />
                      </label>
                    </div>
                    
                    {testResult && (
                      <div className={`test-result ${testResult.status}`}>
                        {testResult.status === 'testing' && <LoadingSpinner size="small" />}
                        {testResult.status === 'success' && <FiCheck className="result-icon" />}
                        {testResult.status === 'error' && <FiAlertTriangle className="result-icon" />}
                        <span>{testResult.message}</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="form-actions">
                    <button 
                      className="test-button"
                      onClick={handleTestIntegration}
                      disabled={testResult?.status === 'testing'}
                    >
                      Test Connection
                    </button>
                    
                    <button 
                      className="save-button"
                      onClick={handleSaveIntegration}
                      disabled={
                        (editingIntegration !== null ? !integrations[editingIntegration].name : !newIntegration.name) ||
                        testResult?.status === 'testing'
                      }
                    >
                      <FiSave />
                      Save Integration
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          /* INCIDENTS TAB */
          <>
            <div className="incidents-toolbar">
              <div className="search-container">
                <label htmlFor="incidentSearch" className="sr-only">Search incidents</label>
                <input
                  id="incidentSearch"
                  type="text"
                  placeholder="Search incidents..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>
              
              <div className="filter-container">
                <button 
                  className={`filter-button ${filterBySeverity.length > 0 ? 'active' : ''}`}
                  onClick={() => setFilterBySeverity(filterBySeverity.length ? [] : ['critical', 'high'])}
                >
                  <FiFilter />
                  Filter
                </button>
                
                <div className="filter-options">
                  <label className="filter-label">Severity:</label>
                  {['critical', 'high', 'medium', 'low'].map(severity => (
                    <label key={severity} htmlFor={`filter-${severity}`} className="filter-checkbox">
                      <input
                        id={`filter-${severity}`}
                        type="checkbox"
                        checked={filterBySeverity.includes(severity)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFilterBySeverity([...filterBySeverity, severity]);
                          } else {
                            setFilterBySeverity(filterBySeverity.filter(s => s !== severity));
                          }
                        }}
                      />
                      <span className={`filter-severity ${severity}`}>
                        {severity.charAt(0).toUpperCase() + severity.slice(1)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="incidents-container">
              <div className="incidents-list">
                {filteredIncidents.length > 0 ? (
                  filteredIncidents.map(incident => (
                    <div 
                      key={incident.id} 
                      className={`incident-item ${selectedIncident?.id === incident.id ? 'selected' : ''}`}
                      onClick={() => setSelectedIncident(incident)}
                    >
                      <div className="incident-header">
                        <div className={`severity-indicator ${incident.severity}`} />
                        <h3 className="incident-title">{incident.title}</h3>
                      </div>
                      
                      <div className="incident-info">
                        <div className="incident-file">
                          <span className="info-label">File:</span> {incident.fileName}
                        </div>
                        
                        <div className="incident-metric">
                          <span className="info-label">Metric:</span> {incident.metricType}
                        </div>
                        
                        <div className="incident-score">
                          <span className="info-label">Quality Score:</span> {incident.qualityScore}%
                        </div>
                      </div>
                      
                      <div className="incident-footer">
                        <div className="incident-time">
                          {formatDateTime(incident.createdAt)}
                        </div>
                        
                        <div className={`incident-status ${getStatusClass(incident.status)}`}>
                          {incident.status.charAt(0).toUpperCase() + incident.status.slice(1)}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="no-incidents">
                    <div className="no-data-icon">
                      <FiAlertTriangle />
                    </div>
                    <h3>No incidents found</h3>
                    <p>No incidents match your current search or filter criteria.</p>
                  </div>
                )}
              </div>
              
              <div className="incident-details-panel">
                {selectedIncident ? (
                  <div className="incident-details">
                    <div className="incident-details-header">
                      <div className={`severity-badge ${selectedIncident.severity}`}>
                        {selectedIncident.severity.toUpperCase()}
                      </div>
                      
                      <h2 className="details-title">{selectedIncident.title}</h2>
                      
                      <div className={`status-badge ${getStatusClass(selectedIncident.status)}`}>
                        {selectedIncident.status.toUpperCase()}
                      </div>
                    </div>
                    
                    <div className="incident-meta">
                      <div className="meta-item">
                        <span className="meta-label">Created:</span>
                        <span className="meta-value">{formatDateTime(selectedIncident.createdAt)}</span>
                      </div>
                      
                      <div className="meta-item">
                        <span className="meta-label">File:</span>
                        <span className="meta-value">{selectedIncident.fileName}</span>
                      </div>
                      
                      <div className="meta-item">
                        <span className="meta-label">Assignee:</span>
                        <span className="meta-value">{selectedIncident.assignee || 'Unassigned'}</span>
                      </div>
                      
                      {selectedIncident.resolvedAt && (
                        <div className="meta-item">
                          <span className="meta-label">Resolved:</span>
                          <span className="meta-value">{formatDateTime(selectedIncident.resolvedAt)}</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="incident-description">
                      <h3 className="section-title">Description</h3>
                      <p>{selectedIncident.description}</p>
                    </div>
                    
                    {selectedIncident.externalLinks && selectedIncident.externalLinks.length > 0 && (
                      <div className="external-links">
                        <h3 className="section-title">External Links</h3>
                        <div className="links-list">
                          {selectedIncident.externalLinks.map((link, index) => (
                            <a
                              key={`link-${link.url || link.title || index}`}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="external-link"
                            >
                              <FiExternalLink />
                              {link.name}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {selectedIncident.timeline && selectedIncident.timeline.length > 0 && (
                      <div className="incident-timeline">
                        <h3 className="section-title">Timeline</h3>
                        <div className="timeline-events">
                          {selectedIncident.timeline.map((event, index) => (
                            <div key={`event-${event.timestamp || event.id || index}`} className="timeline-event">
                              <div className="event-time">
                                {formatDateTime(event.timestamp)}
                              </div>
                              <div className="event-content">
                                <div className="event-title">{event.event}</div>
                                <div className="event-details">{event.details}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="incident-actions">
                      <button className="primary-action">
                        Update Status
                      </button>
                      
                      <button className="secondary-action">
                        Add Comment
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="no-incident-selected">
                    <div className="no-selection-icon">
                      <FiAlertTriangle />
                    </div>
                    <h3>No incident selected</h3>
                    <p>Select an incident from the list to view details</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={() => {
          confirmModal.action?.();
          setConfirmModal({ ...confirmModal, isOpen: false });
        }}
        title={confirmModal.title}
        message={confirmModal.message}
        variant="danger"
      />
    </div>
  );
};

IncidentIntegration.propTypes = {
  loading: PropTypes.bool,
  onSaveIntegration: PropTypes.func,
  onTestIntegration: PropTypes.func,
  onDeleteIntegration: PropTypes.func,
  className: PropTypes.string,
  style: PropTypes.object
};

IncidentIntegration.defaultProps = {
  loading: false,
  className: '',
  style: {}
};

export default IncidentIntegration;