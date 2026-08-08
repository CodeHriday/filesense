import{j as e}from"./vendor-ui-Bc7Vbh5h.js";import{r as l}from"./vendor-react-CxX1lkEQ.js";import{P as h}from"./index-CA4WM7bH.js";import"./index-BOM5PANd.js";import"./vendor-query--hX2HCYM.js";import"./vendor-utils-ChAQLjxL.js";const y=()=>{const[a,i]=l.useState("overview"),[n,c]=l.useState("vendor-upload"),[r,d]=l.useState(null),o=(t,p)=>{navigator.clipboard.writeText(t).then(()=>{d(p),setTimeout(()=>d(null),2e3)})},s={"vendor-upload":{title:"Vendor Agreement Upload",method:"POST",path:"/api/upload/vendor-agreements/:agreementId",description:"Upload files to a specific vendor agreement. Files are associated with the agreement project and undergo virus scanning and validation.",authentication:"API Token with vendor_agreements:upload scope",pathParams:[{name:"agreementId",type:"integer",required:!0,description:"ID of the vendor agreement"}],bodyParams:[{name:"file",type:"file",required:!0,description:"File to upload (15+ formats supported)"},{name:"metadata",type:"object",required:!1,description:"Additional file metadata (JSON string)"}],supportedFormats:["CSV","JSON","Parquet","Excel (.xlsx, .xls)","XML","ZIP","TAR","SAS datasets (.sas7bdat)","Avro","DAT","TSV","TXT","Log files"],curlExample:`curl -X POST https://your-app.replit.app/api/upload/vendor-agreements/123 \\
  -H "Authorization: Bearer dfo_your_api_token_here" \\
  -F "file=@data.csv" \\
  -F 'metadata={"source":"daily_export","version":"1.0"}'`,jsExample:`const formData = new FormData();
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
console.log('Upload batch ID:', result.batchId);`,pythonExample:`import requests

url = 'https://your-app.replit.app/api/upload/vendor-agreements/123'
headers = {'Authorization': 'Bearer dfo_your_api_token_here'}
files = {'file': open('data.csv', 'rb')}
data = {'metadata': '{"source":"daily_export","version":"1.0"}'}

response = requests.post(url, headers=headers, files=files, data=data)
result = response.json()
print(f"Upload batch ID: {result['batchId']}")`,successResponse:`{
  "success": true,
  "message": "Upload initiated successfully",
  "batchId": "550e8400-e29b-41d4-a716-446655440000",
  "fileId": 42,
  "projectId": 15,
  "processingMode": "async",
  "statusUrl": "/api/upload/status/550e8400-e29b-41d4-a716-446655440000"
}`,errorResponse:`{
  "error": "Invalid file format",
  "details": "Only CSV, JSON, Parquet, Excel, XML, ZIP, TAR, SAS, Avro, and DAT files are supported"
}`},"project-upload":{title:"Internal Project Upload",method:"POST",path:"/api/upload/projects/:projectId",description:"Upload files to an internal project. User must have write access to the project.",authentication:"API Token with projects:upload scope",pathParams:[{name:"projectId",type:"integer",required:!0,description:"ID of the internal project"}],bodyParams:[{name:"file",type:"file",required:!0,description:"File to upload (15+ formats supported)"},{name:"metadata",type:"object",required:!1,description:"Additional file metadata (JSON string)"}],supportedFormats:["CSV","JSON","Parquet","Excel (.xlsx, .xls)","XML","ZIP","TAR","SAS datasets (.sas7bdat)","Avro","DAT","TSV","TXT","Log files"],curlExample:`curl -X POST https://your-app.replit.app/api/upload/projects/456 \\
  -H "Authorization: Bearer dfo_your_api_token_here" \\
  -F "file=@analysis.parquet"`,jsExample:`const formData = new FormData();
formData.append('file', fileInput.files[0]);

const response = await fetch('/api/upload/projects/456', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer dfo_your_api_token_here'
  },
  body: formData
});

const result = await response.json();
console.log('Upload batch ID:', result.batchId);`,pythonExample:`import requests

url = 'https://your-app.replit.app/api/upload/projects/456'
headers = {'Authorization': 'Bearer dfo_your_api_token_here'}
files = {'file': open('analysis.parquet', 'rb')}

response = requests.post(url, headers=headers, files=files)
result = response.json()
print(f"Upload batch ID: {result['batchId']}")`,successResponse:`{
  "success": true,
  "message": "Upload initiated successfully",
  "batchId": "550e8400-e29b-41d4-a716-446655440000",
  "fileId": 43,
  "projectId": 456,
  "processingMode": "async",
  "statusUrl": "/api/upload/status/550e8400-e29b-41d4-a716-446655440000"
}`,errorResponse:`{
  "error": "Project access denied",
  "details": "You do not have write access to this project"
}`},"bulk-upload":{title:"Bulk Upload",method:"POST",path:"/api/upload/bulk",description:"Upload multiple files at once to a project. All files are processed in batches of 1,000 records per transaction.",authentication:"API Token with bulk:upload scope",bodyParams:[{name:"files",type:"file[]",required:!0,description:"Array of files to upload"},{name:"projectId",type:"integer",required:!0,description:"ID of the target project"},{name:"metadata",type:"object",required:!1,description:"Shared metadata for all files (JSON string)"}],supportedFormats:["CSV","JSON","Parquet","Excel (.xlsx, .xls)","XML","ZIP","TAR","SAS datasets (.sas7bdat)","Avro","DAT","TSV","TXT","Log files"],curlExample:`curl -X POST https://your-app.replit.app/api/upload/bulk \\
  -H "Authorization: Bearer dfo_your_api_token_here" \\
  -F "files=@file1.csv" \\
  -F "files=@file2.json" \\
  -F "files=@file3.parquet" \\
  -F "projectId=789"`,jsExample:`const formData = new FormData();
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
console.log('Batch IDs:', result.batchIds);`,pythonExample:`import requests

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
print(f"Batch IDs: {result['batchIds']}")`,successResponse:`{
  "success": true,
  "message": "3 files uploaded successfully",
  "batchIds": [
    "550e8400-e29b-41d4-a716-446655440001",
    "550e8400-e29b-41d4-a716-446655440002",
    "550e8400-e29b-41d4-a716-446655440003"
  ],
  "fileIds": [44, 45, 46],
  "projectId": 789
}`,errorResponse:`{
  "error": "Bulk upload failed",
  "details": "projectId is required for bulk uploads"
}`},status:{title:"Check Upload Status",method:"GET",path:"/api/upload/status/:batchId",description:"Check the processing status of an upload batch. Use this to poll for completion after initiating an async upload.",authentication:"API Token",pathParams:[{name:"batchId",type:"uuid",required:!0,description:"Batch ID returned from upload endpoint"}],curlExample:`curl -X GET https://your-app.replit.app/api/upload/status/550e8400-e29b-41d4-a716-446655440000 \\
  -H "Authorization: Bearer dfo_your_api_token_here"`,jsExample:`const response = await fetch('/api/upload/status/550e8400-e29b-41d4-a716-446655440000', {
  headers: {
    'Authorization': 'Bearer dfo_your_api_token_here'
  }
});

const status = await response.json();
console.log('Status:', status.status);
console.log('Records processed:', status.recordsProcessed);`,pythonExample:`import requests

url = 'https://your-app.replit.app/api/upload/status/550e8400-e29b-41d4-a716-446655440000'
headers = {'Authorization': 'Bearer dfo_your_api_token_here'}

response = requests.get(url, headers=headers)
status = response.json()
print(f"Status: {status['status']}")
print(f"Records processed: {status['recordsProcessed']}")`,successResponse:`{
  "batchId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "recordsProcessed": 15000,
  "recordsFailed": 0,
  "fileId": 42,
  "startedAt": "2025-11-14T01:00:00.000Z",
  "completedAt": "2025-11-14T01:02:15.000Z"
}`,errorResponse:`{
  "error": "Batch not found",
  "details": "No upload batch found with ID 550e8400-e29b-41d4-a716-446655440000"
}`},"file-status":{title:"Check File Upload Status",method:"GET",path:"/api/upload/file/:fileId",description:"Get detailed status of all batches associated with a file upload.",authentication:"API Token",pathParams:[{name:"fileId",type:"integer",required:!0,description:"File ID returned from upload endpoint"}],curlExample:`curl -X GET https://your-app.replit.app/api/upload/file/42 \\
  -H "Authorization: Bearer dfo_your_api_token_here"`,jsExample:`const response = await fetch('/api/upload/file/42', {
  headers: {
    'Authorization': 'Bearer dfo_your_api_token_here'
  }
});

const fileStatus = await response.json();
console.log('Overall status:', fileStatus.overallStatus);
console.log('Batches:', fileStatus.batches.length);`,pythonExample:`import requests

url = 'https://your-app.replit.app/api/upload/file/42'
headers = {'Authorization': 'Bearer dfo_your_api_token_here'}

response = requests.get(url, headers=headers)
file_status = response.json()
print(f"Overall status: {file_status['overallStatus']}")
print(f"Batches: {len(file_status['batches'])}")`,successResponse:`{
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
}`,errorResponse:`{
  "error": "File not found",
  "details": "No file found with ID 42"
}`}}[n];return e.jsx(h,{title:"API Documentation",subtitle:"Programmatic file upload API for automated data integration",children:e.jsxs("div",{className:"api-docs-container",children:[e.jsxs("div",{className:"api-docs-tabs",children:[e.jsx("button",{className:`tab-button ${a==="overview"?"active":""}`,onClick:()=>i("overview"),children:"Overview"}),e.jsx("button",{className:`tab-button ${a==="endpoints"?"active":""}`,onClick:()=>i("endpoints"),children:"Endpoints"}),e.jsx("button",{className:`tab-button ${a==="authentication"?"active":""}`,onClick:()=>i("authentication"),children:"Authentication"}),e.jsx("button",{className:`tab-button ${a==="examples"?"active":""}`,onClick:()=>i("examples"),children:"Quick Start"})]}),e.jsxs("div",{className:"api-docs-content",children:[a==="overview"&&e.jsxs("div",{className:"docs-section",children:[e.jsx("h2",{children:"Upload API Overview"}),e.jsxs("div",{className:"info-card",children:[e.jsx("h3",{children:"Key Features"}),e.jsxs("ul",{children:[e.jsxs("li",{children:[e.jsx("strong",{children:"15+ File Formats:"})," CSV, JSON, Parquet, Excel, XML, ZIP, TAR, SAS datasets, Avro, DAT, and more"]}),e.jsxs("li",{children:[e.jsx("strong",{children:"Batch Processing:"})," Records processed in batches of 1,000 per transaction for optimal performance"]}),e.jsxs("li",{children:[e.jsx("strong",{children:"Asynchronous Processing:"})," Files queued for background processing with status polling"]}),e.jsxs("li",{children:[e.jsx("strong",{children:"Virus Scanning:"})," All uploads automatically scanned by ClamAV"]}),e.jsxs("li",{children:[e.jsx("strong",{children:"Project Association:"})," Files linked to vendor agreements or internal projects"]}),e.jsxs("li",{children:[e.jsx("strong",{children:"API Token Security:"})," Scope-based permissions (vendor_agreements:upload, projects:upload, bulk:upload)"]})]})]}),e.jsxs("div",{className:"info-card",children:[e.jsx("h3",{children:"Processing Architecture"}),e.jsxs("div",{className:"api-architecture-flow",children:[e.jsxs("div",{className:"api-flow-step",children:[e.jsx("div",{className:"api-step-number",children:"1"}),e.jsxs("div",{className:"api-step-content",children:[e.jsx("h4",{children:"File Upload"}),e.jsx("p",{children:"Client sends file via multipart/form-data"})]})]}),e.jsx("div",{className:"api-flow-arrow",children:"→"}),e.jsxs("div",{className:"api-flow-step",children:[e.jsx("div",{className:"api-step-number",children:"2"}),e.jsxs("div",{className:"api-step-content",children:[e.jsx("h4",{children:"Virus Scan"}),e.jsx("p",{children:"ClamAV scans file for malware"})]})]}),e.jsx("div",{className:"api-flow-arrow",children:"→"}),e.jsxs("div",{className:"api-flow-step",children:[e.jsx("div",{className:"api-step-number",children:"3"}),e.jsxs("div",{className:"api-step-content",children:[e.jsx("h4",{children:"Queue Job"}),e.jsx("p",{children:"BullMQ worker processes file"})]})]}),e.jsx("div",{className:"api-flow-arrow",children:"→"}),e.jsxs("div",{className:"api-flow-step",children:[e.jsx("div",{className:"api-step-number",children:"4"}),e.jsxs("div",{className:"api-step-content",children:[e.jsx("h4",{children:"Batch Insert"}),e.jsx("p",{children:"Records inserted to upload_staging"})]})]})]})]}),e.jsxs("div",{className:"info-card",children:[e.jsx("h3",{children:"Health Monitoring"}),e.jsx("p",{children:"Check system health and queue status:"}),e.jsxs("div",{className:"code-block",children:[e.jsx("button",{className:"copy-button",onClick:()=>o("GET /api/health","health"),children:r==="health"?"✓ Copied":"Copy"}),e.jsx("pre",{children:"GET /api/health"})]}),e.jsx("p",{children:"Response includes upload queue status and degraded mode indicator."})]}),e.jsxs("div",{className:"warning-card",children:[e.jsx("h3",{children:"⚠️ Important Notes"}),e.jsxs("ul",{children:[e.jsx("li",{children:"Store API tokens securely - they cannot be retrieved after creation"}),e.jsx("li",{children:"Tokens are rate-limited (default: 100 requests per hour)"}),e.jsx("li",{children:"Large files (>100MB) may take several minutes to process"}),e.jsx("li",{children:"Poll status endpoint every 5-10 seconds until completion"}),e.jsx("li",{children:"When Redis is unavailable, processing falls back to synchronous mode"})]})]})]}),a==="endpoints"&&e.jsxs("div",{className:"docs-section",children:[e.jsx("div",{className:"endpoint-selector",children:e.jsxs("select",{value:n,onChange:t=>c(t.target.value),className:"endpoint-dropdown",children:[e.jsx("option",{value:"vendor-upload",children:"Vendor Agreement Upload"}),e.jsx("option",{value:"project-upload",children:"Internal Project Upload"}),e.jsx("option",{value:"bulk-upload",children:"Bulk Upload"}),e.jsx("option",{value:"status",children:"Check Upload Status"}),e.jsx("option",{value:"file-status",children:"Check File Status"})]})}),e.jsxs("div",{className:"endpoint-details",children:[e.jsxs("div",{className:"endpoint-header",children:[e.jsx("span",{className:`method-badge ${s.method.toLowerCase()}`,children:s.method}),e.jsx("code",{className:"endpoint-path",children:s.path})]}),e.jsx("p",{className:"endpoint-description",children:s.description}),s.authentication&&e.jsxs("div",{className:"auth-info",children:[e.jsx("strong",{children:"Authentication:"})," ",s.authentication]}),s.pathParams&&e.jsxs("div",{className:"params-section",children:[e.jsx("h3",{children:"Path Parameters"}),e.jsxs("table",{className:"params-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Parameter"}),e.jsx("th",{children:"Type"}),e.jsx("th",{children:"Required"}),e.jsx("th",{children:"Description"})]})}),e.jsx("tbody",{children:s.pathParams.map(t=>e.jsxs("tr",{children:[e.jsx("td",{children:e.jsx("code",{children:t.name})}),e.jsx("td",{children:t.type}),e.jsx("td",{children:t.required?"Yes":"No"}),e.jsx("td",{children:t.description})]},t.name))})]})]}),s.bodyParams&&e.jsxs("div",{className:"params-section",children:[e.jsx("h3",{children:"Body Parameters"}),e.jsxs("table",{className:"params-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Parameter"}),e.jsx("th",{children:"Type"}),e.jsx("th",{children:"Required"}),e.jsx("th",{children:"Description"})]})}),e.jsx("tbody",{children:s.bodyParams.map(t=>e.jsxs("tr",{children:[e.jsx("td",{children:e.jsx("code",{children:t.name})}),e.jsx("td",{children:t.type}),e.jsx("td",{children:t.required?"Yes":"No"}),e.jsx("td",{children:t.description})]},t.name))})]})]}),s.supportedFormats&&e.jsxs("div",{className:"formats-section",children:[e.jsx("h3",{children:"Supported File Formats"}),e.jsx("div",{className:"format-tags",children:s.supportedFormats.map(t=>e.jsx("span",{className:"format-tag",children:t},t))})]}),e.jsxs("div",{className:"response-section",children:[e.jsx("h3",{children:"Success Response (200)"}),e.jsxs("div",{className:"code-block",children:[e.jsx("button",{className:"copy-button",onClick:()=>o(s.successResponse,"success"),children:r==="success"?"✓ Copied":"Copy"}),e.jsx("pre",{children:s.successResponse})]})]}),e.jsxs("div",{className:"response-section",children:[e.jsx("h3",{children:"Error Response (400/403/500)"}),e.jsxs("div",{className:"code-block",children:[e.jsx("button",{className:"copy-button",onClick:()=>o(s.errorResponse,"error"),children:r==="error"?"✓ Copied":"Copy"}),e.jsx("pre",{children:s.errorResponse})]})]})]})]}),a==="authentication"&&e.jsxs("div",{className:"docs-section",children:[e.jsx("h2",{children:"Authentication"}),e.jsxs("div",{className:"info-card",children:[e.jsx("h3",{children:"API Token Format"}),e.jsx("p",{children:"All API requests must include a Bearer token in the Authorization header:"}),e.jsx("div",{className:"code-block",children:e.jsx("pre",{children:"Authorization: Bearer dfo_your_api_token_here"})})]}),e.jsxs("div",{className:"info-card",children:[e.jsx("h3",{children:"Creating API Tokens"}),e.jsxs("ol",{children:[e.jsxs("li",{children:["Navigate to ",e.jsx("strong",{children:"Administration → API Tokens"})," in the admin menu"]}),e.jsxs("li",{children:["Click ",e.jsx("strong",{children:"Create New Token"})]}),e.jsxs("li",{children:["Configure:",e.jsxs("ul",{children:[e.jsxs("li",{children:[e.jsx("strong",{children:"Name:"})," Descriptive name for the token"]}),e.jsxs("li",{children:[e.jsx("strong",{children:"Project:"})," (Optional) Limit token to specific project"]}),e.jsxs("li",{children:[e.jsx("strong",{children:"Scopes:"})," Select permissions (vendor_agreements:upload, projects:upload, bulk:upload)"]}),e.jsxs("li",{children:[e.jsx("strong",{children:"Rate Limit:"})," Maximum requests per time window"]}),e.jsxs("li",{children:[e.jsx("strong",{children:"Expiration:"})," (Optional) Token expiration date"]})]})]}),e.jsxs("li",{children:[e.jsx("strong",{children:"Copy the token immediately"})," - it cannot be retrieved later"]})]})]}),e.jsxs("div",{className:"info-card",children:[e.jsx("h3",{children:"Token Scopes"}),e.jsxs("table",{className:"params-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Scope"}),e.jsx("th",{children:"Description"}),e.jsx("th",{children:"Endpoints"})]})}),e.jsxs("tbody",{children:[e.jsxs("tr",{children:[e.jsx("td",{children:e.jsx("code",{children:"vendor_agreements:upload"})}),e.jsx("td",{children:"Upload files to vendor agreements"}),e.jsx("td",{children:"POST /api/upload/vendor-agreements/:agreementId"})]}),e.jsxs("tr",{children:[e.jsx("td",{children:e.jsx("code",{children:"projects:upload"})}),e.jsx("td",{children:"Upload files to internal projects"}),e.jsx("td",{children:"POST /api/upload/projects/:projectId"})]}),e.jsxs("tr",{children:[e.jsx("td",{children:e.jsx("code",{children:"bulk:upload"})}),e.jsx("td",{children:"Upload multiple files at once"}),e.jsx("td",{children:"POST /api/upload/bulk"})]})]})]})]}),e.jsxs("div",{className:"warning-card",children:[e.jsx("h3",{children:"Security Best Practices"}),e.jsxs("ul",{children:[e.jsx("li",{children:"Never commit API tokens to version control"}),e.jsx("li",{children:"Use environment variables to store tokens"}),e.jsx("li",{children:"Rotate tokens regularly"}),e.jsx("li",{children:"Use project-specific tokens when possible"}),e.jsx("li",{children:"Set appropriate rate limits"}),e.jsx("li",{children:"Monitor token usage in the admin panel"}),e.jsx("li",{children:"Revoke compromised tokens immediately"})]})]})]}),a==="examples"&&e.jsxs("div",{className:"docs-section",children:[e.jsx("h2",{children:"Quick Start Examples"}),e.jsxs("div",{className:"example-section",children:[e.jsx("h3",{children:"cURL"}),e.jsxs("div",{className:"code-block",children:[e.jsx("button",{className:"copy-button",onClick:()=>o(s.curlExample,"curl"),children:r==="curl"?"✓ Copied":"Copy"}),e.jsx("pre",{children:s.curlExample})]})]}),e.jsxs("div",{className:"example-section",children:[e.jsx("h3",{children:"JavaScript (Fetch API)"}),e.jsxs("div",{className:"code-block",children:[e.jsx("button",{className:"copy-button",onClick:()=>o(s.jsExample,"js"),children:r==="js"?"✓ Copied":"Copy"}),e.jsx("pre",{children:s.jsExample})]})]}),e.jsxs("div",{className:"example-section",children:[e.jsx("h3",{children:"Python (Requests)"}),e.jsxs("div",{className:"code-block",children:[e.jsx("button",{className:"copy-button",onClick:()=>o(s.pythonExample,"python"),children:r==="python"?"✓ Copied":"Copy"}),e.jsx("pre",{children:s.pythonExample})]})]}),e.jsxs("div",{className:"info-card",children:[e.jsx("h3",{children:"Complete Workflow Example"}),e.jsx("p",{children:"Here's a complete example showing upload → poll status → check completion:"}),e.jsxs("div",{className:"code-block",children:[e.jsx("button",{className:"copy-button",onClick:()=>o(`async function uploadAndWait(file, agreementId, token) {
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
}`,"workflow"),children:r==="workflow"?"✓ Copied":"Copy"}),e.jsx("pre",{children:`async function uploadAndWait(file, agreementId, token) {
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
}`})]})]})]})]})]})})};export{y as default};
