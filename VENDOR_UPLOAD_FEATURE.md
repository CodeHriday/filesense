# Vendor File Upload Feature

## Overview
The Vendor File Upload feature enables external vendors to upload files to designated cloud storage locations based on their vendor agreements. The system provides granular access control, project-based filtering, and automated file timestamping.

## Architecture

### Database Schema

#### storage_connections Table
- **path** (text, nullable): Optional folder path within the bucket/container for file uploads
- Supports AWS S3, Google Cloud Storage, and Azure Blob Storage
- Path is specified at the connection level for consistent upload locations

#### vendor_agreements Table
- Links vendors to projects and connections
- Includes primary_contact_email and secondary_contact_email for access control
- Requires approval_status = 'fully_approved' and is_locked = true
- Contains drop_location_path for vendor-specific upload paths

### Backend APIs

#### 1. GET /api/vendor-access/projects
**Purpose**: Returns projects accessible to the authenticated vendor user

**Access Control**:
- Requires authentication (JWT token)
- Filters by vendor_agreements where user email matches primary_contact_email OR secondary_contact_email
- Only shows fully approved and locked agreements

**Response**:
```json
{
  "success": true,
  "projects": [
    {
      "id": 123,
      "name": "Project Name",
      "description": "Project Description",
      "project_type": "external"
    }
  ]
}
```

#### 2. GET /api/vendor-access/connections
**Purpose**: Returns connections available to vendor for a specific project

**Query Parameters**:
- `projectId` (required): The project ID to filter connections

**Access Control**:
- Requires authentication (JWT token)
- Filters by vendor_agreements matching the vendor ID and project ID
- User must be primary or secondary contact on the agreement

**Response**:
```json
{
  "success": true,
  "connections": [
    {
      "connection_id": "uuid",
      "name": "Connection Name",
      "type": "aws|gcp|azure",
      "description": "Connection Description",
      "path": "optional/folder/path",
      "drop_location_path": "vendor/specific/path",
      "agreement_id": 456,
      "agreement_code": "AGR-001",
      "region": "us-east-1",
      "bucket": "bucket-name",
      "has_access_key": true,
      "has_secret_key": true
    }
  ]
}
```

**Security**: 
- Credentials are NOT sent to the vendor
- Only metadata and configuration details are included
- Sensitive fields like access_key, secret_key are excluded

#### 3. POST /api/connections/:id/browse
**Purpose**: Browse folders and files within a cloud storage connection

**Request Body**:
```json
{
  "prefix": "optional/folder/prefix/"
}
```

**Access Control**:
- Requires connection:execute permission
- Validates connection is active

**Response**:
```json
{
  "success": true,
  "prefix": "optional/folder/prefix/",
  "items": [
    {
      "name": "subfolder",
      "path": "optional/folder/prefix/subfolder/",
      "type": "folder"
    },
    {
      "name": "file.csv",
      "path": "optional/folder/prefix/file.csv",
      "type": "file",
      "size": 1024,
      "lastModified": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

**Supported Cloud Providers**:
- **AWS S3**: Uses s3.listObjectsV2() with delimiter
- **Google Cloud Storage**: Uses bucket.getFiles() with delimiter
- **Azure Blob Storage**: Uses listBlobsByHierarchy()

#### 4. Connection Routes (POST/PUT)
**Path Field**: Both create and update operations accept an optional `path` field
- Stored in storage_connections.path column
- Used as the base upload location for vendor files
- Combined with drop_location_path from vendor_agreements for full path

### Frontend - Streamlit Vendor Upload

#### Location
`app.py` - `show_vendor_upload()` function

#### User Flow
1. **Authentication**: Vendor enters their email (placeholder for JWT integration)
2. **Project Selection**: Vendor enters project ID they have access to
3. **Load Connections**: System fetches connections via GET /api/vendor-access/connections
4. **Connection Selection**: Vendor selects from available connections
5. **File Upload**: Vendor uploads file with automatic timestamp appending

#### File Naming Convention
- Original: `report.csv`
- Timestamped: `report_20241030_143000.csv`
- Format: `{basename}_{YYYYMMDD_HHMMSS}{extension}`

#### Upload Path Logic
```
Final Path = connection.path + agreement.drop_location_path + timestamped_filename
```

Example:
- connection.path = "vendors/"
- drop_location_path = "acme-corp/"
- file = "report.csv"
- Result: `vendors/acme-corp/report_20241030_143000.csv`

## Security Considerations

### Access Control
1. **Vendor Agreements**: Only users listed as primary or secondary contacts can access
2. **Approval Status**: Agreements must be 'fully_approved' and locked
3. **Project Filtering**: Vendors only see projects they're authorized for
4. **Connection Filtering**: Vendors only see connections associated with their agreements

### Credential Protection
1. Cloud storage credentials are NEVER sent to vendors
2. Actual file uploads require backend integration to use stored credentials
3. Browse endpoint decrypts credentials server-side only
4. Streamlit app shows upload path but doesn't perform actual cloud operations

### Data Isolation
1. Each vendor has their own drop_location_path
2. Paths cannot be modified by vendors
3. Filenames are automatically timestamped to prevent overwrites
4. Vendors cannot browse outside their designated paths

## Integration Requirements

### Production Deployment Checklist
1. **Authentication**: Replace placeholder email authentication with JWT tokens
   - Integrate Streamlit app with backend auth system
   - Pass JWT tokens in API requests
   - Implement token refresh mechanism

2. **Cloud Upload Implementation**: 
   - Backend endpoint to accept file from Streamlit
   - Server-side upload using stored credentials
   - Return success/failure status to Streamlit

3. **Error Handling**:
   - Network timeout handling
   - Invalid credentials detection
   - Permission denied scenarios
   - File size limits

4. **Audit Logging**:
   - Log all vendor file uploads
   - Track who uploaded what, when, and where
   - Alert on suspicious activity

5. **File Validation**:
   - ClamAV virus scanning (already integrated)
   - File type validation
   - File size limits
   - Filename sanitization

## Future Enhancements

### Folder Browsing UI
- Integrate browse API into Streamlit vendor upload page
- Tree view for folder navigation
- Breadcrumb navigation
- Folder creation (if permitted)

### Upload Progress
- Progress bar for large files
- Multi-file upload support
- Drag-and-drop interface

### Notification System
- Email notifications on successful upload
- Alert project managers of new vendor files
- Daily digest of vendor activity

### Analytics
- Dashboard showing vendor upload statistics
- File size trends
- Most active vendors
- Upload success/failure rates

## Testing

### Manual Testing Steps
1. Create vendor agreement with primary/secondary contacts
2. Ensure agreement is fully approved and locked
3. Configure connection with path field
4. Test vendor access APIs with proper authentication
5. Test browse endpoint with different cloud providers
6. Test Streamlit upload flow end-to-end

### Test Cases
- [ ] Vendor can only see their assigned projects
- [ ] Vendor can only see connections for selected project
- [ ] Vendor cannot access unapproved agreements
- [ ] Browse endpoint returns correct folder structure
- [ ] Timestamps are correctly appended to filenames
- [ ] Path concatenation works correctly
- [ ] Credentials are never exposed in responses

## API Usage Examples

### Get Vendor Projects
```bash
curl -H "Authorization: Bearer <JWT_TOKEN>" \
     http://localhost:3000/api/vendor-access/projects
```

### Get Project Connections
```bash
curl -H "Authorization: Bearer <JWT_TOKEN>" \
     "http://localhost:3000/api/vendor-access/connections?projectId=123"
```

### Browse Connection Folder
```bash
curl -X POST \
     -H "Authorization: Bearer <JWT_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"prefix": "vendors/acme-corp/"}' \
     http://localhost:3000/api/connections/abc-123/browse
```

## Configuration

### Environment Variables
- `DATABASE_URL`: PostgreSQL connection string
- `ENCRYPTION_KEY`: For encrypting cloud credentials (already configured)
- `JWT_SECRET`: For JWT token validation (already configured)

### Database Migrations
No manual migrations required. The `path` column has been added to `storage_connections` table.

## Troubleshooting

### Vendor Cannot See Projects
- Verify vendor_user_id is correctly linked to vendors table
- Check vendor_agreements approval_status and is_locked
- Confirm user email matches primary_contact_email or secondary_contact_email

### Browse Endpoint Fails
- Verify cloud credentials are correctly encrypted in database
- Check connection status is 'active'
- Ensure user has connection:execute permission
- Validate cloud provider configuration (region, bucket, etc.)

### Upload Path Incorrect
- Check connection.path value in database
- Verify drop_location_path in vendor_agreements
- Ensure path separator logic is correct (trailing slashes)

## Support
For issues or questions, contact the Data Observatory development team.
