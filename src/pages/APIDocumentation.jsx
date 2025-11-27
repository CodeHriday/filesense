import React, { useState } from 'react';
import PageLayout from '../components/PageLayout';
import './APIDocumentation.css';

const APIDocumentation = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedEndpoint, setSelectedEndpoint] = useState('vendor-upload');
  const [copiedSection, setCopiedSection] = useState(null);

  const copyToClipboard = (text, section) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedSection(section);
      setTimeout(() => setCopiedSection(null), 2000);
    });
  };

  const endpoints = {
    'vendor-upload': {
      title: 'Vendor Agreement Upload',
      method: 'POST',
      path: '/api/upload/vendor-agreements/:agreementId',
      description: 'Upload files to a specific vendor agreement. Files are associated with the agreement project and undergo virus scanning and validation.',
      authentication: 'API Token with vendor_agreements:upload scope',
      pathParams: [
        { name: 'agreementId', type: 'integer', required: true, description: 'ID of the vendor agreement' }
      ],
      bodyParams: [
        { name: 'file', type: 'file', required: true, description: 'File to upload (15+ formats supported)' },
        { name: 'metadata', type: 'object', required: false, description: 'Additional file metadata (JSON string)' }
      ],
      supportedFormats: ['CSV', 'JSON', 'Parquet', 'Excel (.xlsx, .xls)', 'XML', 'ZIP', 'TAR', 'SAS datasets (.sas7bdat)', 'Avro', 'DAT', 'TSV', 'TXT', 'Log files'],
      curlExample: `curl -X POST https://your-app.replit.app/api/upload/vendor-agreements/123 \\
  -H "Authorization: Bearer dfo_your_api_token_here" \\
  -F "file=@data.csv" \\
  -F 'metadata={"source":"daily_export","version":"1.0"}'`,
      jsExample: `const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('metadata', JSON.stringify({
  source: 'daily_export',
  version: '1.0'
}));

const response = await fetch('/api/upload/vendor-agreements/123', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer dfo_your_api_token_here'
  },
  body: formData
});

const result = await response.json();
console.log('Upload batch ID:', result.batchId);`,
      pythonExample: `import requests

url = 'https://your-app.replit.app/api/upload/vendor-agreements/123'
headers = {'Authorization': 'Bearer dfo_your_api_token_here'}
files = {'file': open('data.csv', 'rb')}
data = {'metadata': '{"source":"daily_export","version":"1.0"}'}

response = requests.post(url, headers=headers, files=files, data=data)
result = response.json()
print(f"Upload batch ID: {result['batchId']}")`,
      successResponse: `{
  "success": true,
  "message": "Upload initiated successfully",
  "batchId": "550e8400-e29b-41d4-a716-446655440000",
  "fileId": 42,
  "projectId": 15,
  "processingMode": "async",
  "statusUrl": "/api/upload/status/550e8400-e29b-41d4-a716-446655440000"
}`,
      errorResponse: `{
  "error": "Invalid file format",
  "details": "Only CSV, JSON, Parquet, Excel, XML, ZIP, TAR, SAS, Avro, and DAT files are supported"
}`
    },
    'project-upload': {
      title: 'Internal Project Upload',
      method: 'POST',
      path: '/api/upload/projects/:projectId',
      description: 'Upload files to an internal project. User must have write access to the project.',
      authentication: 'API Token with projects:upload scope',
      pathParams: [
        { name: 'projectId', type: 'integer', required: true, description: 'ID of the internal project' }
      ],
      bodyParams: [
        { name: 'file', type: 'file', required: true, description: 'File to upload (15+ formats supported)' },
        { name: 'metadata', type: 'object', required: false, description: 'Additional file metadata (JSON string)' }
      ],
      supportedFormats: ['CSV', 'JSON', 'Parquet', 'Excel (.xlsx, .xls)', 'XML', 'ZIP', 'TAR', 'SAS datasets (.sas7bdat)', 'Avro', 'DAT', 'TSV', 'TXT', 'Log files'],
      curlExample: `curl -X POST https://your-app.replit.app/api/upload/projects/456 \\
  -H "Authorization: Bearer dfo_your_api_token_here" \\
  -F "file=@analysis.parquet"`,
      jsExample: `const formData = new FormData();
formData.append('file', fileInput.files[0]);

const response = await fetch('/api/upload/projects/456', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer dfo_your_api_token_here'
  },
  body: formData
});

const result = await response.json();
console.log('Upload batch ID:', result.batchId);`,
      pythonExample: `import requests

url = 'https://your-app.replit.app/api/upload/projects/456'
headers = {'Authorization': 'Bearer dfo_your_api_token_here'}
files = {'file': open('analysis.parquet', 'rb')}

response = requests.post(url, headers=headers, files=files)
result = response.json()
print(f"Upload batch ID: {result['batchId']}")`,
      successResponse: `{
  "success": true,
  "message": "Upload initiated successfully",
  "batchId": "550e8400-e29b-41d4-a716-446655440000",
  "fileId": 43,
  "projectId": 456,
  "processingMode": "async",
  "statusUrl": "/api/upload/status/550e8400-e29b-41d4-a716-446655440000"
}`,
      errorResponse: `{
  "error": "Project access denied",
  "details": "You do not have write access to this project"
}`
    },
    'bulk-upload': {
      title: 'Bulk Upload',
      method: 'POST',
      path: '/api/upload/bulk',
      description: 'Upload multiple files at once to a project. All files are processed in batches of 1,000 records per transaction.',
      authentication: 'API Token with bulk:upload scope',
      bodyParams: [
        { name: 'files', type: 'file[]', required: true, description: 'Array of files to upload' },
        { name: 'projectId', type: 'integer', required: true, description: 'ID of the target project' },
        { name: 'metadata', type: 'object', required: false, description: 'Shared metadata for all files (JSON string)' }
      ],
      supportedFormats: ['CSV', 'JSON', 'Parquet', 'Excel (.xlsx, .xls)', 'XML', 'ZIP', 'TAR', 'SAS datasets (.sas7bdat)', 'Avro', 'DAT', 'TSV', 'TXT', 'Log files'],
      curlExample: `curl -X POST https://your-app.replit.app/api/upload/bulk \\
  -H "Authorization: Bearer dfo_your_api_token_here" \\
  -F "files=@file1.csv" \\
  -F "files=@file2.json" \\
  -F "files=@file3.parquet" \\
  -F "projectId=789"`,
      jsExample: `const formData = new FormData();
fileInputs.forEach(input => {
  formData.append('files', input.files[0]);
});
formData.append('projectId', '789');

const response = await fetch('/api/upload/bulk', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer dfo_your_api_token_here'
  },
  body: formData
});

const result = await response.json();
console.log('Batch IDs:', result.batchIds);`,
      pythonExample: `import requests

url = 'https://your-app.replit.app/api/upload/bulk'
headers = {'Authorization': 'Bearer dfo_your_api_token_here'}
files = [
    ('files', open('file1.csv', 'rb')),
    ('files', open('file2.json', 'rb')),
    ('files', open('file3.parquet', 'rb'))
]
data = {'projectId': '789'}

response = requests.post(url, headers=headers, files=files, data=data)
result = response.json()
print(f"Batch IDs: {result['batchIds']}")`,
      successResponse: `{
  "success": true,
  "message": "3 files uploaded successfully",
  "batchIds": [
    "550e8400-e29b-41d4-a716-446655440001",
    "550e8400-e29b-41d4-a716-446655440002",
    "550e8400-e29b-41d4-a716-446655440003"
  ],
  "fileIds": [44, 45, 46],
  "projectId": 789
}`,
      errorResponse: `{
  "error": "Bulk upload failed",
  "details": "projectId is required for bulk uploads"
}`
    },
    'status': {
      title: 'Check Upload Status',
      method: 'GET',
      path: '/api/upload/status/:batchId',
      description: 'Check the processing status of an upload batch. Use this to poll for completion after initiating an async upload.',
      authentication: 'API Token',
      pathParams: [
        { name: 'batchId', type: 'uuid', required: true, description: 'Batch ID returned from upload endpoint' }
      ],
      curlExample: `curl -X GET https://your-app.replit.app/api/upload/status/550e8400-e29b-41d4-a716-446655440000 \\
  -H "Authorization: Bearer dfo_your_api_token_here"`,
      jsExample: `const response = await fetch('/api/upload/status/550e8400-e29b-41d4-a716-446655440000', {
  headers: {
    'Authorization': 'Bearer dfo_your_api_token_here'
  }
});

const status = await response.json();
console.log('Status:', status.status);
console.log('Records processed:', status.recordsProcessed);`,
      pythonExample: `import requests

url = 'https://your-app.replit.app/api/upload/status/550e8400-e29b-41d4-a716-446655440000'
headers = {'Authorization': 'Bearer dfo_your_api_token_here'}

response = requests.get(url, headers=headers)
status = response.json()
print(f"Status: {status['status']}")
print(f"Records processed: {status['recordsProcessed']}")`,
      successResponse: `{
  "batchId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "recordsProcessed": 15000,
  "recordsFailed": 0,
  "fileId": 42,
  "startedAt": "2025-11-14T01:00:00.000Z",
  "completedAt": "2025-11-14T01:02:15.000Z"
}`,
      errorResponse: `{
  "error": "Batch not found",
  "details": "No upload batch found with ID 550e8400-e29b-41d4-a716-446655440000"
}`
    },
    'file-status': {
      title: 'Check File Upload Status',
      method: 'GET',
      path: '/api/upload/file/:fileId',
      description: 'Get detailed status of all batches associated with a file upload.',
      authentication: 'API Token',
      pathParams: [
        { name: 'fileId', type: 'integer', required: true, description: 'File ID returned from upload endpoint' }
      ],
      curlExample: `curl -X GET https://your-app.replit.app/api/upload/file/42 \\
  -H "Authorization: Bearer dfo_your_api_token_here"`,
      jsExample: `const response = await fetch('/api/upload/file/42', {
  headers: {
    'Authorization': 'Bearer dfo_your_api_token_here'
  }
});

const fileStatus = await response.json();
console.log('Overall status:', fileStatus.overallStatus);
console.log('Batches:', fileStatus.batches.length);`,
      pythonExample: `import requests

url = 'https://your-app.replit.app/api/upload/file/42'
headers = {'Authorization': 'Bearer dfo_your_api_token_here'}

response = requests.get(url, headers=headers)
file_status = response.json()
print(f"Overall status: {file_status['overallStatus']}")
print(f"Batches: {len(file_status['batches'])}")`,
      successResponse: `{
  "fileId": 42,
  "overallStatus": "completed",
  "totalRecordsProcessed": 15000,
  "totalRecordsFailed": 0,
  "batches": [
    {
      "batchId": "550e8400-e29b-41d4-a716-446655440000",
      "status": "completed",
      "recordsProcessed": 1000
    }
  ]
}`,
      errorResponse: `{
  "error": "File not found",
  "details": "No file found with ID 42"
}`
    }
  };

  const endpoint = endpoints[selectedEndpoint];

  return (
    <PageLayout title="API Documentation" subtitle="Programmatic file upload API for automated data integration">
      <div className="api-docs-container">
        <div className="api-docs-tabs">
          <button 
            className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button 
            className={`tab-button ${activeTab === 'endpoints' ? 'active' : ''}`}
            onClick={() => setActiveTab('endpoints')}
          >
            Endpoints
          </button>
          <button 
            className={`tab-button ${activeTab === 'authentication' ? 'active' : ''}`}
            onClick={() => setActiveTab('authentication')}
          >
            Authentication
          </button>
          <button 
            className={`tab-button ${activeTab === 'examples' ? 'active' : ''}`}
            onClick={() => setActiveTab('examples')}
          >
            Quick Start
          </button>
        </div>

        <div className="api-docs-content">
          {activeTab === 'overview' && (
            <div className="docs-section">
              <h2>Upload API Overview</h2>
              
              <div className="info-card">
                <h3>Key Features</h3>
                <ul>
                  <li><strong>15+ File Formats:</strong> CSV, JSON, Parquet, Excel, XML, ZIP, TAR, SAS datasets, Avro, DAT, and more</li>
                  <li><strong>Batch Processing:</strong> Records processed in batches of 1,000 per transaction for optimal performance</li>
                  <li><strong>Asynchronous Processing:</strong> Files queued for background processing with status polling</li>
                  <li><strong>Virus Scanning:</strong> All uploads automatically scanned by ClamAV</li>
                  <li><strong>Project Association:</strong> Files linked to vendor agreements or internal projects</li>
                  <li><strong>API Token Security:</strong> Scope-based permissions (vendor_agreements:upload, projects:upload, bulk:upload)</li>
                </ul>
              </div>

              <div className="info-card">
                <h3>Processing Architecture</h3>
                <div className="api-architecture-flow">
                  <div className="api-flow-step">
                    <div className="api-step-number">1</div>
                    <div className="api-step-content">
                      <h4>File Upload</h4>
                      <p>Client sends file via multipart/form-data</p>
                    </div>
                  </div>
                  <div className="api-flow-arrow">→</div>
                  <div className="api-flow-step">
                    <div className="api-step-number">2</div>
                    <div className="api-step-content">
                      <h4>Virus Scan</h4>
                      <p>ClamAV scans file for malware</p>
                    </div>
                  </div>
                  <div className="api-flow-arrow">→</div>
                  <div className="api-flow-step">
                    <div className="api-step-number">3</div>
                    <div className="api-step-content">
                      <h4>Queue Job</h4>
                      <p>BullMQ worker processes file</p>
                    </div>
                  </div>
                  <div className="api-flow-arrow">→</div>
                  <div className="api-flow-step">
                    <div className="api-step-number">4</div>
                    <div className="api-step-content">
                      <h4>Batch Insert</h4>
                      <p>Records inserted to upload_staging</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="info-card">
                <h3>Health Monitoring</h3>
                <p>Check system health and queue status:</p>
                <div className="code-block">
                  <button 
                    className="copy-button"
                    onClick={() => copyToClipboard('GET /api/health', 'health')}
                  >
                    {copiedSection === 'health' ? '✓ Copied' : 'Copy'}
                  </button>
                  <pre>GET /api/health</pre>
                </div>
                <p>Response includes upload queue status and degraded mode indicator.</p>
              </div>

              <div className="warning-card">
                <h3>⚠️ Important Notes</h3>
                <ul>
                  <li>Store API tokens securely - they cannot be retrieved after creation</li>
                  <li>Tokens are rate-limited (default: 100 requests per hour)</li>
                  <li>Large files (&gt;100MB) may take several minutes to process</li>
                  <li>Poll status endpoint every 5-10 seconds until completion</li>
                  <li>When Redis is unavailable, processing falls back to synchronous mode</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'endpoints' && (
            <div className="docs-section">
              <div className="endpoint-selector">
                <select 
                  value={selectedEndpoint} 
                  onChange={(e) => setSelectedEndpoint(e.target.value)}
                  className="endpoint-dropdown"
                >
                  <option value="vendor-upload">Vendor Agreement Upload</option>
                  <option value="project-upload">Internal Project Upload</option>
                  <option value="bulk-upload">Bulk Upload</option>
                  <option value="status">Check Upload Status</option>
                  <option value="file-status">Check File Status</option>
                </select>
              </div>

              <div className="endpoint-details">
                <div className="endpoint-header">
                  <span className={`method-badge ${endpoint.method.toLowerCase()}`}>{endpoint.method}</span>
                  <code className="endpoint-path">{endpoint.path}</code>
                </div>

                <p className="endpoint-description">{endpoint.description}</p>

                {endpoint.authentication && (
                  <div className="auth-info">
                    <strong>Authentication:</strong> {endpoint.authentication}
                  </div>
                )}

                {endpoint.pathParams && (
                  <div className="params-section">
                    <h3>Path Parameters</h3>
                    <table className="params-table">
                      <thead>
                        <tr>
                          <th>Parameter</th>
                          <th>Type</th>
                          <th>Required</th>
                          <th>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {endpoint.pathParams.map(param => (
                          <tr key={param.name}>
                            <td><code>{param.name}</code></td>
                            <td>{param.type}</td>
                            <td>{param.required ? 'Yes' : 'No'}</td>
                            <td>{param.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {endpoint.bodyParams && (
                  <div className="params-section">
                    <h3>Body Parameters</h3>
                    <table className="params-table">
                      <thead>
                        <tr>
                          <th>Parameter</th>
                          <th>Type</th>
                          <th>Required</th>
                          <th>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {endpoint.bodyParams.map(param => (
                          <tr key={param.name}>
                            <td><code>{param.name}</code></td>
                            <td>{param.type}</td>
                            <td>{param.required ? 'Yes' : 'No'}</td>
                            <td>{param.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {endpoint.supportedFormats && (
                  <div className="formats-section">
                    <h3>Supported File Formats</h3>
                    <div className="format-tags">
                      {endpoint.supportedFormats.map(format => (
                        <span key={format} className="format-tag">{format}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="response-section">
                  <h3>Success Response (200)</h3>
                  <div className="code-block">
                    <button 
                      className="copy-button"
                      onClick={() => copyToClipboard(endpoint.successResponse, 'success')}
                    >
                      {copiedSection === 'success' ? '✓ Copied' : 'Copy'}
                    </button>
                    <pre>{endpoint.successResponse}</pre>
                  </div>
                </div>

                <div className="response-section">
                  <h3>Error Response (400/403/500)</h3>
                  <div className="code-block">
                    <button 
                      className="copy-button"
                      onClick={() => copyToClipboard(endpoint.errorResponse, 'error')}
                    >
                      {copiedSection === 'error' ? '✓ Copied' : 'Copy'}
                    </button>
                    <pre>{endpoint.errorResponse}</pre>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'authentication' && (
            <div className="docs-section">
              <h2>Authentication</h2>
              
              <div className="info-card">
                <h3>API Token Format</h3>
                <p>All API requests must include a Bearer token in the Authorization header:</p>
                <div className="code-block">
                  <pre>Authorization: Bearer dfo_your_api_token_here</pre>
                </div>
              </div>

              <div className="info-card">
                <h3>Creating API Tokens</h3>
                <ol>
                  <li>Navigate to <strong>Administration → API Tokens</strong> in the admin menu</li>
                  <li>Click <strong>Create New Token</strong></li>
                  <li>Configure:
                    <ul>
                      <li><strong>Name:</strong> Descriptive name for the token</li>
                      <li><strong>Project:</strong> (Optional) Limit token to specific project</li>
                      <li><strong>Scopes:</strong> Select permissions (vendor_agreements:upload, projects:upload, bulk:upload)</li>
                      <li><strong>Rate Limit:</strong> Maximum requests per time window</li>
                      <li><strong>Expiration:</strong> (Optional) Token expiration date</li>
                    </ul>
                  </li>
                  <li><strong>Copy the token immediately</strong> - it cannot be retrieved later</li>
                </ol>
              </div>

              <div className="info-card">
                <h3>Token Scopes</h3>
                <table className="params-table">
                  <thead>
                    <tr>
                      <th>Scope</th>
                      <th>Description</th>
                      <th>Endpoints</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><code>vendor_agreements:upload</code></td>
                      <td>Upload files to vendor agreements</td>
                      <td>POST /api/upload/vendor-agreements/:agreementId</td>
                    </tr>
                    <tr>
                      <td><code>projects:upload</code></td>
                      <td>Upload files to internal projects</td>
                      <td>POST /api/upload/projects/:projectId</td>
                    </tr>
                    <tr>
                      <td><code>bulk:upload</code></td>
                      <td>Upload multiple files at once</td>
                      <td>POST /api/upload/bulk</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="warning-card">
                <h3>Security Best Practices</h3>
                <ul>
                  <li>Never commit API tokens to version control</li>
                  <li>Use environment variables to store tokens</li>
                  <li>Rotate tokens regularly</li>
                  <li>Use project-specific tokens when possible</li>
                  <li>Set appropriate rate limits</li>
                  <li>Monitor token usage in the admin panel</li>
                  <li>Revoke compromised tokens immediately</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'examples' && (
            <div className="docs-section">
              <h2>Quick Start Examples</h2>

              <div className="example-section">
                <h3>cURL</h3>
                <div className="code-block">
                  <button 
                    className="copy-button"
                    onClick={() => copyToClipboard(endpoint.curlExample, 'curl')}
                  >
                    {copiedSection === 'curl' ? '✓ Copied' : 'Copy'}
                  </button>
                  <pre>{endpoint.curlExample}</pre>
                </div>
              </div>

              <div className="example-section">
                <h3>JavaScript (Fetch API)</h3>
                <div className="code-block">
                  <button 
                    className="copy-button"
                    onClick={() => copyToClipboard(endpoint.jsExample, 'js')}
                  >
                    {copiedSection === 'js' ? '✓ Copied' : 'Copy'}
                  </button>
                  <pre>{endpoint.jsExample}</pre>
                </div>
              </div>

              <div className="example-section">
                <h3>Python (Requests)</h3>
                <div className="code-block">
                  <button 
                    className="copy-button"
                    onClick={() => copyToClipboard(endpoint.pythonExample, 'python')}
                  >
                    {copiedSection === 'python' ? '✓ Copied' : 'Copy'}
                  </button>
                  <pre>{endpoint.pythonExample}</pre>
                </div>
              </div>

              <div className="info-card">
                <h3>Complete Workflow Example</h3>
                <p>Here's a complete example showing upload → poll status → check completion:</p>
                <div className="code-block">
                  <button 
                    className="copy-button"
                    onClick={() => copyToClipboard(`async function uploadAndWait(file, agreementId, token) {
  // 1. Upload file
  const formData = new FormData();
  formData.append('file', file);
  
  const uploadRes = await fetch(\`/api/upload/vendor-agreements/\${agreementId}\`, {
    method: 'POST',
    headers: { 'Authorization': \`Bearer \${token}\` },
    body: formData
  });
  
  const { batchId } = await uploadRes.json();
  console.log('Upload started:', batchId);
  
  // 2. Poll for completion
  while (true) {
    const statusRes = await fetch(\`/api/upload/status/\${batchId}\`, {
      headers: { 'Authorization': \`Bearer \${token}\` }
    });
    
    const status = await statusRes.json();
    
    if (status.status === 'completed') {
      console.log('Processing complete!');
      console.log('Records processed:', status.recordsProcessed);
      break;
    } else if (status.status === 'failed') {
      console.error('Processing failed:', status.error);
      break;
    }
    
    // Wait 5 seconds before next check
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}`, 'workflow')}
                  >
                    {copiedSection === 'workflow' ? '✓ Copied' : 'Copy'}
                  </button>
                  <pre>{`async function uploadAndWait(file, agreementId, token) {
  // 1. Upload file
  const formData = new FormData();
  formData.append('file', file);
  
  const uploadRes = await fetch(\`/api/upload/vendor-agreements/\${agreementId}\`, {
    method: 'POST',
    headers: { 'Authorization': \`Bearer \${token}\` },
    body: formData
  });
  
  const { batchId } = await uploadRes.json();
  console.log('Upload started:', batchId);
  
  // 2. Poll for completion
  while (true) {
    const statusRes = await fetch(\`/api/upload/status/\${batchId}\`, {
      headers: { 'Authorization': \`Bearer \${token}\` }
    });
    
    const status = await statusRes.json();
    
    if (status.status === 'completed') {
      console.log('Processing complete!');
      console.log('Records processed:', status.recordsProcessed);
      break;
    } else if (status.status === 'failed') {
      console.error('Processing failed:', status.error);
      break;
    }
    
    // Wait 5 seconds before next check
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}`}</pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
};

export default APIDocumentation;
