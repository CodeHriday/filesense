# Vendor Onboarding Module - Documentation

## Overview

The Vendor Onboarding Module provides a comprehensive system for managing vendor relationships, vendor-specific file connections, and a dual-approval vendor agreement workflow with schema management.

## Features

### 1. Vendor Management (Admin Only)
- **Create and manage vendors** with detailed profiles
- **Assign vendors to projects** for project-based access control
- **Configure drop locations** for vendor file uploads
- **Set file name patterns** for automated file validation
- **Manage vendor status** (active/inactive/suspended)

### 2. Role-Based Access Control
- **Admin**: Full access to all vendor management features
- **Vendor**: Limited access to own profile, file drop, and file catalog (filtered to their files only)
- **File Owners**: Can create agreements with vendors and approve them

### 3. Vendor Agreement System

#### Dual Approval Workflow
1. **Agreement Creation**: File owner creates agreement with vendor
2. **Schema Upload**: Upload Excel (.xlsx/.xls), CSV, or JSON file defining expected data schema
3. **Vendor Approval**: Vendor reviews and approves/rejects agreement
4. **Owner Approval**: File owner reviews and approves/rejects agreement
5. **Auto-Lock**: Agreement automatically locks after both parties approve
6. **Re-approval**: Any admin edit requires both parties to re-approve

#### Schema Upload Support
The system accepts schema definitions in three formats:

**Excel Format (.xlsx/.xls):**
```
Column Name | Data Type | Precision | Scale | Nullable
---------------------------------------------------------
customer_id | INTEGER   | 10        | 0     | NO
amount      | DECIMAL   | 10        | 2     | YES
name        | VARCHAR   | 255       | 0     | NO
```

**CSV Format:**
```csv
column_name,data_type,precision,scale,nullable
customer_id,INTEGER,10,0,NO
amount,DECIMAL,10,2,YES
name,VARCHAR,255,0,NO
```

**JSON Format:**
```json
[
  {
    "column_name": "customer_id",
    "data_type": "INTEGER",
    "precision": 10,
    "scale": 0,
    "nullable": "NO"
  },
  {
    "column_name": "amount",
    "data_type": "DECIMAL",
    "precision": 10,
    "scale": 2,
    "nullable": "YES"
  }
]
```

#### Complete Audit Trail
The system tracks:
- **Approval History**: All approvals and rejections with timestamps, user info, and IP addresses
- **Change History**: All edits to agreements with before/after values
- **User Actions**: Who did what and when

### 4. Integration with ETL Mappings

Approved vendor agreements can be used as source configurations in transformation mappings:

1. Go to **Mappings** → **Create Mapping**
2. In **Step 2: Source Configuration**, select **Source Type**: "Vendor Agreement"
3. Select an approved vendor agreement from the dropdown
4. Connection, file path, and schema details are **auto-populated** from the agreement
5. Continue with field mapping and transformation configuration

### 5. Vendor File Catalog Filtering

Vendors automatically see only their files in the file catalog:
- Files are filtered by the vendor's **drop location path**
- Vendors cannot access files from other vendors or general system files
- Admins see all files without restrictions

## Database Schema

### Tables

1. **vendors**: Vendor profile information
   - id, vendor_name, vendor_user_id, contact_email, contact_phone
   - drop_location_path, file_name_pattern, connection_id
   - project_id, status, created_at, updated_at

2. **vendor_agreements**: Vendor agreement details
   - id, vendor_id, agreement_name, file_name, connection_id
   - drop_location_path, file_name_pattern, expected_schema
   - vendor_approved, vendor_approved_by, vendor_approved_at
   - owner_approved, owner_approved_by, owner_approved_at
   - status, is_locked, notes, created_at, updated_at

3. **vendor_agreement_approvals**: Approval/rejection audit trail
   - id, agreement_id, user_id, action, comments
   - ip_address, user_agent, created_at

4. **vendor_agreement_changes**: Change history audit trail
   - id, agreement_id, changed_by, field_name
   - old_value, new_value, change_reason, ip_address, created_at

## API Endpoints

### Vendor Management
- `GET /api/vendors` - List all vendors (Admin only)
- `POST /api/vendors` - Create new vendor (Admin only)
- `GET /api/vendors/:id` - Get vendor details
- `PUT /api/vendors/:id` - Update vendor (Admin only)
- `DELETE /api/vendors/:id` - Delete vendor (Admin only)

### Vendor Agreements
- `GET /api/vendor-agreements` - List agreements (filtered by access)
- `POST /api/vendor-agreements` - Create new agreement
- `GET /api/vendor-agreements/:id` - Get agreement details
- `PUT /api/vendor-agreements/:id` - Update agreement
- `POST /api/vendor-agreements/:id/approve` - Approve agreement
- `POST /api/vendor-agreements/:id/reject` - Reject agreement
- `GET /api/vendor-agreements/:id/approvals` - Get approval history
- `GET /api/vendor-agreements/:id/changes` - Get change history

## Frontend Pages

### 1. Vendor Management (`/vendor-management`)
- View all vendors in a table
- Create new vendors with detailed forms
- Edit vendor information
- View vendor assignments and agreements
- Admin-only access

### 2. Vendor Agreements (`/vendor-agreements`)
- List all agreements with status indicators
- Create new agreements with schema upload
- View agreement details with approval status
- Approve/reject agreements (role-based buttons)
- View approval history and change history tabs
- Locked state prevents further edits (except by admin)

## Testing Workflow

### Complete End-to-End Test

1. **Create Vendor** (as Admin)
   - Navigate to Vendor Management
   - Click "Add Vendor"
   - Fill in vendor details (name, email, phone, drop location)
   - Assign to a project
   - Save

2. **Create Vendor Agreement** (as File Owner)
   - Navigate to Vendor Agreements
   - Click "Create Agreement"
   - Select vendor and fill in agreement details
   - Upload schema file (Excel/CSV/JSON)
   - Save

3. **Vendor Approval** (as Vendor User)
   - Log in as vendor user
   - Navigate to Vendor Agreements
   - Open the agreement
   - Review details and schema
   - Click "Approve" (or "Reject" with comments)

4. **Owner Approval** (as File Owner)
   - Navigate back to agreement
   - Review vendor approval
   - Click "Approve" (or "Reject" with comments)

5. **Verify Locked State**
   - Agreement should show status "Approved"
   - `is_locked` should be true
   - Non-admin users cannot edit

6. **Admin Edit (Triggers Re-approval)**
   - Log in as Admin
   - Edit agreement details
   - Save changes
   - Verify approval status reset to "Pending"
   - Both vendor and owner must re-approve

7. **Verify Audit Trail**
   - Open agreement details
   - Check "Approval History" tab
   - Check "Change History" tab
   - Verify all actions are logged with timestamps and user info

8. **Use in ETL Mapping**
   - Navigate to Mappings → Create Mapping
   - Select source type "Vendor Agreement"
   - Select the approved agreement
   - Verify connection and schema auto-populate
   - Complete mapping configuration

9. **Vendor File Catalog Test**
   - Log in as vendor user
   - Navigate to File Catalog
   - Verify only files from vendor's drop location are visible
   - Log in as admin
   - Verify all files are visible

## Security Considerations

1. **Authentication Required**: All endpoints require valid JWT token
2. **Role-Based Authorization**: Admin, Vendor, and File Owner roles enforced
3. **Vendor Isolation**: Vendors can only access their own data
4. **Agreement Access Control**: Users can only access agreements they're party to
5. **Audit Logging**: All approvals, rejections, and changes are logged with IP addresses
6. **File Upload Validation**: Schema files validated for format and structure
7. **SQL Injection Prevention**: Parameterized queries used throughout

## Troubleshooting

### Common Issues

**Issue**: Vendor cannot see files in catalog
- **Solution**: Check that vendor's drop_location_path is correctly set and matches file locations

**Issue**: Agreement won't lock after both approvals
- **Solution**: Verify both vendor_approved and owner_approved are true, check backend logs for errors

**Issue**: Schema upload fails
- **Solution**: Verify file format matches one of the supported types (Excel/CSV/JSON), check column names match expected format

**Issue**: Vendor user gets "Access Denied" error
- **Solution**: Verify user has "Vendor" role assigned, check that vendor profile exists and status is "active"

## Future Enhancements

- Email notifications for approval requests
- Automated schema validation against actual file uploads
- Version control for agreement changes
- Bulk vendor import from CSV
- Vendor portal with custom branding
- Integration with external vendor management systems

## Support

For issues or questions, contact the Data File Observatory support team.
