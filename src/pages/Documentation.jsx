import React, { useState } from 'react';
import { FiChevronDown, FiChevronRight, FiSearch, FiBook, FiHome, FiUpload, FiDatabase, FiGrid, FiGitBranch, FiCalendar, FiMonitor, FiAlertTriangle, FiXCircle, FiTrendingUp, FiShield, FiTag, FiUsers, FiFileText, FiSettings, FiBookOpen, FiBriefcase, FiTruck, FiCheckCircle, FiArchive, FiKey, FiMail, FiPlay } from 'react-icons/fi';
import PageLayout from '../components/PageLayout';
import './Documentation.css';

const documentationSections = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: FiBook,
    content: `
## Welcome to FileSense Data Observatory

FileSense is an enterprise-grade data management platform designed for monitoring, analyzing, and ensuring data file integrity. The platform provides comprehensive capabilities for data quality checks, profiling, and visualization across various file types.

### Key Capabilities

- **File Processing**: Support for 15+ file formats including CSV, JSON, XLSX, XML, Parquet, DAT, and password-protected archives
- **Data Quality**: Automated quality checks for completeness, consistency, validity, and uniqueness
- **ETL Workflows**: Visual workflow designer for data transformations with 27+ field transformation types
- **Vendor Management**: Complete vendor onboarding with data contracts and SLA monitoring
- **Governance**: Enterprise-grade audit logging, role-based access control, and data lineage tracking

### Quick Start

1. **Create a Project**: Navigate to Projects and create your first project to organize your data files
2. **Upload Files**: Use File Upload to add files to your project for processing
3. **View Profiles**: Access the File Catalog to see file metadata and data profiles
4. **Create Workflows**: Use the Visual Mapping Designer to build ETL transformations
5. **Schedule Jobs**: Set up automated job schedules to run your workflows

### User Roles

- **Administrator**: Full access to all features including user management and system configuration
- **Analyst**: Access to file upload, catalogs, job design, and monitoring features
- **Viewer**: Read-only access to catalogs and reports
- **Vendor User**: Limited access to vendor-specific file upload and quality views
    `
  },
  {
    id: 'administration',
    title: 'Administration',
    icon: FiSettings,
    subsections: [
      {
        id: 'connections',
        title: 'Connections',
        icon: FiDatabase,
        content: `
## Connections

Connections allow you to configure external data sources and destinations for your ETL workflows.

### Supported Connection Types

- **AWS S3**: Amazon S3 buckets for cloud file storage
- **Google Cloud Storage**: GCS buckets for cloud file storage
- **Azure Blob Storage**: Azure containers for cloud file storage
- **Snowflake**: Cloud data warehouse connections
- **PostgreSQL**: Database connections for data loading

### Creating a Connection

1. Click "Add Connection" and select the connection type
2. Enter the connection name and configure credentials
3. Test the connection to verify connectivity
4. Save the connection for use in workflows

### Security

All credentials are encrypted using AES-256-GCM encryption and stored securely. Access to connections is controlled through role-based permissions.
        `
      },
      {
        id: 'roles',
        title: 'Role Management',
        icon: FiShield,
        content: `
## Role Management

Define custom roles with granular permissions for controlling user access across the platform.

### Permission Structure

Permissions follow the format \`feature:action\` where actions include:
- **read**: View access to the feature
- **write**: Create and edit capabilities
- **execute**: Run jobs and workflows
- **approve**: Approve vendor agreements and changes
- **delete**: Remove items

### Built-in Roles

- **admin**: Full access to all platform features
- **analyst**: Standard user with read/write access to most features
- **viewer**: Read-only access for reporting and monitoring
- **vendor**: Limited access for external vendor users

### Creating Custom Roles

1. Navigate to Role Management
2. Click "Create Role" and enter a name and description
3. Select permissions for each feature category
4. Save the role and assign it to users
        `
      },
      {
        id: 'users',
        title: 'User Management',
        icon: FiUsers,
        content: `
## User Management

Manage user accounts, roles, and authentication settings.

### User Account Features

- **Local Authentication**: Username and password authentication with strong password policies
- **Okta SSO**: Enterprise single sign-on integration
- **Multi-Role Support**: Users can have multiple roles assigned
- **Project Access**: Control which projects users can access

### Creating Users

1. Navigate to User Management
2. Click "Add User" and enter user details
3. Assign one or more roles
4. Set project access permissions
5. User receives email notification with login credentials

### Password Policies

- Minimum 8 characters
- Requires uppercase, lowercase, numbers, and special characters
- Password expiration after 90 days
- Account lockout after 5 failed attempts
        `
      },
      {
        id: 'projects',
        title: 'Project Management',
        icon: FiBriefcase,
        content: `
## Project Management

Projects are the organizational unit for grouping related files, workflows, and configurations.

### Project Types

- **Internal Projects**: For internal data processing and analytics
- **External Projects**: Created automatically for vendor integrations

### Project Features

- **File Organization**: Group related files within a project context
- **Access Control**: Assign users and groups to projects
- **Workflow Isolation**: Workflows and jobs are scoped to projects
- **Audit Trail**: Track all changes within a project

### Creating Projects

1. Navigate to Project Management
2. Click "Create Project"
3. Enter project name, description, and type
4. Assign users or access groups
5. Configure project-specific settings
        `
      },
      {
        id: 'groups',
        title: 'Access Groups',
        icon: FiUsers,
        content: `
## Access Groups

Access groups simplify permission management by allowing you to assign project access to groups of users.

### How Groups Work

- Users inherit project access from their group memberships
- A user can belong to multiple groups
- Groups can have multiple projects assigned
- Changes to group membership apply immediately

### Managing Groups

1. Navigate to Access Groups
2. Create a group with a descriptive name
3. Add users to the group
4. Assign projects to the group
5. All group members now have access to assigned projects
        `
      },
      {
        id: 'api-tokens',
        title: 'API Tokens',
        icon: FiKey,
        content: `
## API Tokens

Generate API tokens for programmatic access to the FileSense platform.

### Token Types

- **Upload Tokens**: For automated file uploads via API
- **Read Tokens**: For querying data and reports
- **Admin Tokens**: Full API access (admin users only)

### Creating Tokens

1. Navigate to API Tokens
2. Click "Generate Token"
3. Select token type and expiration
4. Copy and securely store the token (shown only once)
5. Use the token in API requests via Authorization header

### API Usage

\`\`\`bash
curl -X POST https://your-instance/api/upload \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -F "file=@data.csv"
\`\`\`
        `
      },
      {
        id: 'api-documentation',
        title: 'API Documentation',
        icon: FiBookOpen,
        content: `
## API Documentation

Complete REST API documentation for integrating with FileSense.

### Available Endpoints

- **POST /api/upload**: Upload files for processing
- **GET /api/files**: List files in the catalog
- **GET /api/files/:id**: Get file details and metadata
- **POST /api/jobs/:id/execute**: Trigger job execution
- **GET /api/jobs/:id/status**: Check job status

### Authentication

All API requests require authentication via:
- JWT token (session-based)
- API token (programmatic access)

### Rate Limiting

- 100 requests per minute for standard endpoints
- 10 requests per minute for file uploads
- Rate limits apply per user/token
        `
      },
      {
        id: 'email-providers',
        title: 'Email Providers',
        icon: FiMail,
        content: `
## Email Providers

Configure email providers for sending notifications and alerts.

### Supported Providers

- **SMTP**: Standard email server configuration
- **SendGrid**: Cloud email delivery service
- **AWS SES**: Amazon Simple Email Service
- **Mailgun**: Email API provider
- **Postmark**: Transactional email service
- **SparkPost**: Email delivery platform
- **Mandrill**: Mailchimp transactional email

### Configuration

1. Navigate to Email Providers
2. Select your email provider type
3. Enter credentials and configuration
4. Test the connection by sending a test email
5. Set as default provider for system notifications

### Email Templates

System emails use Handlebars templates for:
- Job completion notifications
- Error alerts
- SLA breach notifications
- User account emails
        `
      },
      {
        id: 'vendor-management',
        title: 'Vendor Management',
        icon: FiTruck,
        content: `
## Vendor Management

Complete vendor lifecycle management for external data providers.

### Vendor Onboarding

1. **Create Vendor**: Add vendor details and contact information
2. **Create Connection**: Configure vendor's file source (S3, SFTP, etc.)
3. **Define Data Contracts**: Specify expected file schemas and quality rules
4. **Create Vendor Users**: Provide vendor access for file uploads
5. **Monitor SLAs**: Track vendor compliance with delivery schedules

### Vendor Data Contracts

Data contracts define the agreement between your organization and the vendor:
- **File Patterns**: Expected file naming conventions
- **Schema Definition**: Required columns, data types, and formats
- **Quality Rules**: Data quality requirements (null checks, uniqueness, etc.)
- **Delivery Schedule**: Expected file delivery times

### Schema Validation

Uploaded files are validated against vendor agreement schemas:
- Column name and order verification
- Data type validation
- Required field checks
- Quality rule enforcement

### SLA Monitoring

Track vendor performance against agreed SLAs:
- File delivery timeliness
- Data quality scores
- Volume thresholds
- Breach notifications
        `
      },
      {
        id: 'audit-trail',
        title: 'Audit Trail',
        icon: FiFileText,
        content: `
## Audit Trail

Comprehensive, immutable audit logging for compliance and security.

### Audit Categories

- **User Actions**: Login, logout, permission changes
- **File Operations**: Upload, download, delete, profile
- **Job Execution**: Start, complete, fail, retry
- **Configuration Changes**: Settings, connections, workflows
- **Data Access**: File views, exports, data queries

### Audit Log Fields

- Timestamp
- User ID and username
- Action type
- Resource affected
- Old and new values (for changes)
- IP address
- Session ID

### Retention

- Audit logs are retained for 7 years by default
- Logs are immutable and cannot be modified or deleted
- Export to external systems available for long-term archival
        `
      },
      {
        id: 'system-cleanup',
        title: 'System Cleanup',
        icon: FiSettings,
        content: `
## System Cleanup

Maintain system performance by cleaning up old data and temporary files.

### Cleanup Operations

- **Orphaned Files**: Remove files not linked to any catalog entry
- **Expired Sessions**: Clear old session data
- **Temporary Files**: Remove processing temporary files
- **Old Audit Logs**: Archive logs beyond retention period
- **Failed Job Artifacts**: Clean up failed job outputs

### Scheduling

Cleanup jobs can be scheduled to run:
- Daily at off-peak hours
- Weekly for less critical tasks
- On-demand for immediate cleanup

### Safety Features

- Preview mode to see what would be deleted
- Confirmation required for destructive operations
- Audit logging of all cleanup actions
        `
      },
      {
        id: 'dashboard-settings',
        title: 'Dashboard Settings',
        icon: FiSettings,
        content: `
## Dashboard Settings

Customize your dashboard display preferences.

### Available Settings

- **Default View**: Choose which dashboard loads on login
- **Metric Display**: Select which metrics appear on the main dashboard
- **Refresh Interval**: Set auto-refresh frequency for real-time data
- **Theme**: Light or dark mode preference
- **Time Zone**: Display times in your local timezone

### Widget Configuration

- Drag and drop widgets to rearrange
- Show/hide individual metrics
- Configure chart types and date ranges
        `
      }
    ]
  },
  {
    id: 'project-file-management',
    title: 'Projects and Files',
    icon: FiBriefcase,
    subsections: [
      {
        id: 'projects-page',
        title: 'Projects',
        icon: FiBriefcase,
        content: `
## Projects

View and manage your projects from the Projects dashboard.

### Project Overview

Each project card displays:
- Project name and description
- File count and total size
- Last activity date
- Assigned users count

### Project Actions

- **View Files**: See all files in the project
- **Upload Files**: Add new files to the project
- **Edit**: Modify project settings
- **Delete**: Remove project (requires admin permission)

### Filtering

Filter projects by:
- Project type (internal/external)
- Status (active/archived)
- Your access level
        `
      },
      {
        id: 'file-upload',
        title: 'File Upload & Profile',
        icon: FiUpload,
        content: `
## File Upload & Profile

Upload files for processing and automatic profiling.

### Supported File Types

| Format | Extensions | Notes |
|--------|------------|-------|
| CSV | .csv | Comma, tab, pipe delimited |
| JSON | .json | Array or object format |
| Excel | .xlsx, .xls | Multiple sheets supported |
| XML | .xml | Hierarchical data |
| Parquet | .parquet | Columnar format |
| DAT | .dat | Fixed-width or delimited |
| Archives | .zip, .7z, .tar.gz | Password-protected supported |

### Upload Process

1. **Select Project**: Choose the destination project
2. **Choose Files**: Drag and drop or browse for files
3. **Configure Options**: Set delimiter, encoding, etc.
4. **Upload**: Files are uploaded and virus scanned
5. **Profile**: Automatic data profiling begins

### Automatic Profiling

For each file, the system generates:
- Row and column counts
- Data type detection per column
- Null value analysis
- Unique value counts
- Statistical summaries (min, max, mean, etc.)
- Pattern detection
        `
      },
      {
        id: 'vendor-file-upload',
        title: 'Vendor File Upload',
        icon: FiUpload,
        content: `
## Vendor File Upload

Specialized upload interface for vendor file deliveries.

### Vendor Upload Features

- **Agreement Selection**: Choose the vendor agreement for validation
- **Schema Validation**: Automatic validation against expected schema
- **Quality Checks**: Run quality rules defined in the agreement
- **Status Tracking**: View validation results and quality scores

### Upload Workflow

1. Select your vendor and agreement
2. Upload the file(s)
3. System validates against schema
4. Quality rules are executed
5. Results displayed with pass/fail status
6. File moved to appropriate catalog
        `
      }
    ]
  },
  {
    id: 'catalogs',
    title: 'Catalogs',
    icon: FiDatabase,
    subsections: [
      {
        id: 'file-catalog',
        title: 'File Catalog',
        icon: FiDatabase,
        content: `
## File Catalog

Central repository for all uploaded files and their metadata.

### Catalog Features

- **Search**: Find files by name, type, or metadata
- **Filter**: Filter by project, date, status, or tags
- **Sort**: Order by name, date, size, or quality score
- **Bulk Actions**: Select multiple files for operations

### File Details

Click any file to view:
- **Metadata**: Size, format, upload date, uploader
- **Profile**: Column statistics and data quality metrics
- **Preview**: Sample data rows
- **Lineage**: Where this file is used in workflows
- **History**: Version history and changes

### Actions

- **Download**: Retrieve the original file
- **Re-profile**: Regenerate data profile
- **Delete**: Remove file from catalog
- **Tag**: Add tags for organization
        `
      },
      {
        id: 'processed-catalog',
        title: 'Processed File Catalog',
        icon: FiFileText,
        content: `
## Processed File Catalog

View files that have been processed through ETL workflows.

### Processed File Information

- **Source Files**: Original input files
- **Workflow**: Which workflow processed the file
- **Job**: Job execution details
- **Transformations**: What changes were applied
- **Output Location**: Where the output was written

### Tracking Lineage

Each processed file maintains complete lineage:
- Input sources
- Transformation steps applied
- Quality checks performed
- Output destinations
        `
      },
      {
        id: 'vendor-file-quality',
        title: 'Vendor File Catalog',
        icon: FiCheckCircle,
        content: `
## Vendor File Catalog

View all vendor-submitted files and their quality status.

### Quality Dashboard

- **Pass Rate**: Percentage of files passing validation
- **Common Issues**: Most frequent quality violations
- **Vendor Comparison**: Quality metrics by vendor
- **Trend Analysis**: Quality over time

### File Status

Each vendor file shows:
- Validation status (pass/fail)
- Quality score percentage
- Specific rule violations
- Remediation recommendations
        `
      }
    ]
  },
  {
    id: 'job-design',
    title: 'Job Design',
    icon: FiGrid,
    subsections: [
      {
        id: 'visual-mapping-designer',
        title: 'Visual Mapping Designer',
        icon: FiGrid,
        content: `
## Visual Mapping Designer

Create ETL transformations using a visual drag-and-drop interface.

### Mapping Components

- **Source Nodes**: Input files or database tables
- **Target Nodes**: Output destinations
- **Transformation Nodes**: Data transformation operations
- **Connection Lines**: Data flow between nodes

### Transformation Types

The platform supports 27+ transformation types:
- **String**: Uppercase, lowercase, trim, substring, replace
- **Numeric**: Round, floor, ceiling, absolute, format
- **Date**: Parse, format, add/subtract, extract parts
- **Conditional**: If-else, case-when, null handling
- **Aggregate**: Sum, count, average, min, max
- **Lookup**: Reference data lookups, crosswalks
- **Custom**: JavaScript expressions

### Multi-Source Joins

Join data from multiple sources:
- **INNER JOIN**: Only matching records
- **LEFT JOIN**: All left records with matches
- **LEFT OUTER JOIN**: Left records without matches

### Schema Drift Handling

Configure how to handle schema changes:
- **Strict**: Fail on any schema difference
- **Flexible**: Allow new columns
- **Ignore**: Process regardless of schema changes
        `
      },
      {
        id: 'visual-workflows',
        title: 'Visual Workflows',
        icon: FiGitBranch,
        content: `
## Visual Workflows

Orchestrate multiple mappings and jobs into complex workflows.

### Workflow Components

- **Start Node**: Entry point for the workflow
- **Mapping Nodes**: Execute visual mappings
- **Condition Nodes**: Branch based on conditions
- **Parallel Nodes**: Execute multiple steps simultaneously
- **End Node**: Workflow completion

### Dependency Management

- Define execution order through connections
- Set retry policies for failed steps
- Configure timeout limits
- Handle errors with fallback paths

### Workflow Execution

- **Manual**: Trigger from the UI
- **Scheduled**: Run on a cron schedule
- **Event-Driven**: Trigger on file arrival (coming soon)
- **API**: Trigger via REST API

### Monitoring

- Real-time execution progress
- Step-by-step status updates
- Error details and logs
- Execution history
        `
      }
    ]
  },
  {
    id: 'jobs-monitoring',
    title: 'Jobs and Monitoring',
    icon: FiMonitor,
    subsections: [
      {
        id: 'job-schedules',
        title: 'Job Schedules',
        icon: FiCalendar,
        content: `
## Job Schedules

Schedule automated execution of workflows and mappings.

### Schedule Types

- **Cron-Based**: Standard cron expressions for complex schedules
- **Interval-Based**: Run every X minutes/hours
- **One-Time**: Single scheduled execution

### Schedule Configuration

1. Select the workflow or mapping to schedule
2. Choose schedule type
3. Set the timing (cron expression or interval)
4. Configure notification preferences
5. Enable or disable the schedule

### Cron Expression Examples

| Expression | Description |
|------------|-------------|
| 0 8 * * * | Daily at 8:00 AM |
| 0 */2 * * * | Every 2 hours |
| 0 0 * * 1 | Every Monday at midnight |
| 0 6,18 * * * | At 6:00 AM and 6:00 PM |

### Schedule Management

- View all active schedules
- Pause/resume schedules
- View execution history
- Modify timing without recreating
        `
      },
      {
        id: 'monitor',
        title: 'Monitor',
        icon: FiMonitor,
        content: `
## Monitor

Real-time monitoring of all job executions across the platform.

### Dashboard View

- **Running Jobs**: Currently executing jobs
- **Completed**: Recent successful completions
- **Failed**: Jobs that encountered errors
- **Queued**: Jobs waiting to execute

### Job Details

Click any job to see:
- Execution timeline
- Step-by-step progress
- Log output
- Error messages (if failed)
- Performance metrics

### Actions

- **Retry**: Re-run failed jobs
- **Cancel**: Stop running jobs
- **View Logs**: Access detailed execution logs
- **Download Output**: Get job output files
        `
      },
      {
        id: 'quality-violations',
        title: 'Quality Violations',
        icon: FiXCircle,
        content: `
## Quality Violations

Review and manage data quality rule violations.

### Violation Dashboard

- **By Rule**: Group violations by quality rule
- **By File**: Group violations by source file
- **By Severity**: Critical, warning, info levels
- **Trend**: Violation count over time

### Violation Details

Each violation shows:
- Rule name and description
- Affected column and sample values
- Violation count
- Suggested remediation

### Resolution Workflow

1. Review violation details
2. Investigate source data
3. Apply fix (edit data or update rules)
4. Mark as resolved
5. Re-run quality checks
        `
      },
      {
        id: 'data-stories',
        title: 'Data Stories',
        icon: FiBookOpen,
        content: `
## Data Stories

Create narrative reports combining data, visualizations, and insights.

### Story Components

- **Text Blocks**: Narrative explanations
- **Charts**: Embedded visualizations
- **Metrics**: Key performance indicators
- **Tables**: Data summaries
- **Images**: Screenshots and diagrams

### Creating Stories

1. Click "New Story"
2. Add a title and description
3. Drag components onto the canvas
4. Configure each component's data source
5. Publish or share the story

### Use Cases

- Executive summaries
- Data quality reports
- Trend analysis presentations
- Vendor performance reviews
        `
      },
      {
        id: 'jobs',
        title: 'Jobs',
        icon: FiPlay,
        content: `
## Jobs

Manage and organize jobs for batch processing.

### Job Types

- **Mapping Jobs**: Execute visual mappings
- **Workflow Jobs**: Execute visual workflows
- **Profile Jobs**: Re-profile files
- **Quality Jobs**: Run quality checks

### Job Groups

Organize related jobs into groups:
- Run all jobs in a group sequentially
- Track group-level metrics
- Configure group-level notifications

### Job History

- Execution timestamps
- Duration and performance
- Status and error details
- Output file locations
        `
      }
    ]
  },
  {
    id: 'governance',
    title: 'Data Governance',
    icon: FiShield,
    subsections: [
      {
        id: 'quality-rules',
        title: 'Quality Rules',
        icon: FiAlertTriangle,
        content: `
## Quality Rules

Define and manage data quality rules for automated validation.

### Rule Types

- **null_check**: Verify non-null values
- **duplicate_check**: Identify duplicate records
- **email_validity**: Validate email format
- **phone_validity**: Validate phone number format
- **completeness**: Required field presence
- **validity**: Value within allowed set
- **uniqueness**: Column uniqueness
- **range_check**: Numeric range validation
- **length_check**: String length validation
- **date_format**: Date format validation
- **timestamp_format**: Timestamp format validation
- **column_completeness**: Column population percentage

### Creating Rules

1. Navigate to Quality Rules
2. Click "Create Rule"
3. Select rule type
4. Configure parameters (column, threshold, etc.)
5. Set severity level
6. Associate with files or agreements
        `
      },
      {
        id: 'executive-dashboard',
        title: 'Executive Dashboard',
        icon: FiTrendingUp,
        content: `
## Executive Dashboard

High-level metrics and KPIs for data management.

### Dashboard Widgets

- **File Volume**: Total files processed over time
- **Quality Score**: Overall data quality percentage
- **Job Success Rate**: Percentage of successful jobs
- **Vendor Performance**: Quality by vendor
- **Processing Time**: Average job duration trends

### Customization

- Configure date ranges
- Filter by project or vendor
- Export reports to PDF
- Schedule automated report delivery
        `
      },
      {
        id: 'visual-lineage',
        title: 'Visual Lineage',
        icon: FiGitBranch,
        content: `
## Visual Lineage

Trace data flow from source to destination.

### Lineage Types

- **Forward Lineage**: Where does this data go?
- **Backward Lineage**: Where did this data come from?
- **Impact Analysis**: What is affected by changes?

### Visualization

- Interactive graph showing data flow
- Zoom and pan navigation
- Click nodes for details
- Highlight specific paths

### Use Cases

- Impact analysis for schema changes
- Regulatory compliance (data provenance)
- Debugging data issues
- Documentation generation
        `
      },
      {
        id: 'policies',
        title: 'Policies',
        icon: FiShield,
        content: `
## Policies

Configure data masking and column-level security policies.

### Policy Types

- **Column Masking**: Hide sensitive data values
- **Row Filtering**: Restrict visible rows by criteria
- **Encryption**: Encrypt data at rest
- **Retention**: Automatic data expiration

### Masking Options

- **Full Mask**: Replace with ****
- **Partial Mask**: Show first/last N characters
- **Hash**: One-way hash of value
- **Tokenize**: Replace with token reference
- **Null**: Replace with null value

### Policy Assignment

- Assign policies to specific columns
- Apply policies to user roles
- Configure exceptions for authorized users
        `
      },
      {
        id: 'tags',
        title: 'Tags',
        icon: FiTag,
        content: `
## Tags

Organize and categorize files and resources with tags.

### Tag Features

- Create custom tag names
- Assign colors for visual identification
- Apply multiple tags to resources
- Filter catalogs by tags

### Tag Management

1. Navigate to Tags
2. Create tags with name, color, and description
3. Apply tags to files from the catalog
4. Use tags to filter and find files

### Common Tag Strategies

- **By Source**: Vendor, internal, external
- **By Status**: Draft, review, approved
- **By Domain**: Finance, HR, Sales
- **By Sensitivity**: Public, internal, confidential
        `
      }
    ]
  },
  {
    id: 'insights',
    title: 'Insights',
    icon: FiTrendingUp,
    subsections: [
      {
        id: 'retention-policies',
        title: 'Retention & Archival',
        icon: FiDatabase,
        content: `
## Retention & Archival

Manage data lifecycle with retention policies.

### Retention Policy Configuration

- **Retention Period**: Days, months, or years
- **Action**: Archive or delete after period
- **Scope**: Apply to specific projects, file types, or tags
- **Notifications**: Alert before expiration

### Archive Storage

Archived files are:
- Moved to cost-effective storage
- Compressed for space savings
- Retrievable on demand
- Tracked in the Archived Files catalog

### Compliance

- Regulatory retention requirements
- Legal hold capabilities
- Audit trail for deletions
- Export for long-term preservation
        `
      },
      {
        id: 'archived-files',
        title: 'Archived Files',
        icon: FiArchive,
        content: `
## Archived Files

Access and manage files that have been archived.

### Archived File Features

- View archived file metadata
- Restore files to active catalog
- Permanently delete archived files
- Export archived file list

### Restoration

1. Search for archived file
2. Click "Restore"
3. Select destination project
4. File is moved back to active catalog
        `
      },
      {
        id: 'anomaly-detection',
        title: 'Anomaly Detection',
        icon: FiAlertTriangle,
        content: `
## Anomaly Detection

AI-powered detection of unusual patterns in your data.

### Detection Types

- **Volume Anomalies**: Unusual file sizes or row counts
- **Pattern Anomalies**: Unexpected data patterns
- **Timing Anomalies**: Files arriving at unusual times
- **Quality Anomalies**: Sudden quality score changes

### Configuration

- Set sensitivity thresholds
- Define baseline periods
- Configure alert notifications
- Customize detection rules

### Alert Actions

- Email notifications
- Dashboard alerts
- Integration with monitoring tools
- Automatic ticket creation
        `
      }
    ]
  }
];

function Documentation() {
  const [expandedSections, setExpandedSections] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSection, setSelectedSection] = useState('getting-started');
  
  const toggleSection = (sectionId) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };
  
  const selectSection = (sectionId) => {
    setSelectedSection(sectionId);
  };
  
  const findSection = (sectionId) => {
    for (const section of documentationSections) {
      if (section.id === sectionId) {
        return section;
      }
      if (section.subsections) {
        const subsection = section.subsections.find(sub => sub.id === sectionId);
        if (subsection) {
          return subsection;
        }
      }
    }
    return null;
  };
  
  const currentSection = findSection(selectedSection);
  
  const filteredSections = documentationSections.filter(section => {
    const matchesSearch = searchQuery === '' || 
      section.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (section.content && section.content.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (section.subsections && section.subsections.some(sub => 
        sub.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sub.content.toLowerCase().includes(searchQuery.toLowerCase())
      ));
    return matchesSearch;
  });
  
  const renderMarkdown = (content) => {
    if (!content) return null;
    
    const lines = content.trim().split('\n');
    const elements = [];
    let inCodeBlock = false;
    let codeContent = [];
    let codeLanguage = '';
    let inTable = false;
    let tableRows = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          elements.push(
            <pre key={`code-${i}`} className="doc-code-block">
              <code className={`language-${codeLanguage}`}>
                {codeContent.join('\n')}
              </code>
            </pre>
          );
          codeContent = [];
          inCodeBlock = false;
        } else {
          codeLanguage = line.slice(3).trim() || 'text';
          inCodeBlock = true;
        }
        continue;
      }
      
      if (inCodeBlock) {
        codeContent.push(line);
        continue;
      }
      
      if (line.startsWith('|') && line.endsWith('|')) {
        if (!inTable) {
          inTable = true;
          tableRows = [];
        }
        if (!line.includes('---')) {
          tableRows.push(line.split('|').filter(cell => cell.trim()));
        }
        continue;
      } else if (inTable) {
        elements.push(
          <table key={`table-${i}`} className="doc-table">
            <thead>
              <tr>
                {tableRows[0].map((cell, idx) => (
                  <th key={idx}>{cell.trim()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.slice(1).map((row, rowIdx) => (
                <tr key={rowIdx}>
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx}>{cell.trim()}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
        inTable = false;
        tableRows = [];
      }
      
      if (line.startsWith('## ')) {
        elements.push(<h2 key={i} className="doc-h2">{line.slice(3)}</h2>);
      } else if (line.startsWith('### ')) {
        elements.push(<h3 key={i} className="doc-h3">{line.slice(4)}</h3>);
      } else if (line.startsWith('#### ')) {
        elements.push(<h4 key={i} className="doc-h4">{line.slice(5)}</h4>);
      } else if (line.startsWith('- ')) {
        const listItems = [line.slice(2)];
        while (i + 1 < lines.length && lines[i + 1].startsWith('- ')) {
          i++;
          listItems.push(lines[i].slice(2));
        }
        elements.push(
          <ul key={i} className="doc-list">
            {listItems.map((item, idx) => (
              <li key={idx}>{renderInlineMarkdown(item)}</li>
            ))}
          </ul>
        );
      } else if (/^\d+\. /.test(line)) {
        const listItems = [line.replace(/^\d+\. /, '')];
        while (i + 1 < lines.length && /^\d+\. /.test(lines[i + 1])) {
          i++;
          listItems.push(lines[i].replace(/^\d+\. /, ''));
        }
        elements.push(
          <ol key={i} className="doc-list-ordered">
            {listItems.map((item, idx) => (
              <li key={idx}>{renderInlineMarkdown(item)}</li>
            ))}
          </ol>
        );
      } else if (line.trim() !== '') {
        elements.push(<p key={i} className="doc-paragraph">{renderInlineMarkdown(line)}</p>);
      }
    }
    
    if (inTable && tableRows.length > 0) {
      elements.push(
        <table key="table-final" className="doc-table">
          <thead>
            <tr>
              {tableRows[0].map((cell, idx) => (
                <th key={idx}>{cell.trim()}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.slice(1).map((row, rowIdx) => (
              <tr key={rowIdx}>
                {row.map((cell, cellIdx) => (
                  <td key={cellIdx}>{cell.trim()}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    
    return elements;
  };
  
  const renderInlineMarkdown = (text) => {
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={idx} className="doc-inline-code">{part.slice(1, -1)}</code>;
      } else if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={idx}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };
  
  return (
    <PageLayout title="Documentation" subtitle="Complete guide to using FileSense Data Observatory">
      <div className="documentation-container">
        <div className="doc-sidebar">
          <div className="doc-search">
            <FiSearch className="doc-search-icon" />
            <input
              type="text"
              placeholder="Search documentation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="doc-search-input"
            />
          </div>
          
          <nav className="doc-nav">
            {filteredSections.map(section => (
              <div key={section.id} className="doc-nav-section">
                {section.subsections ? (
                  <>
                    <button
                      className="doc-nav-header"
                      onClick={() => toggleSection(section.id)}
                    >
                      {section.icon && <section.icon className="doc-nav-icon" />}
                      <span>{section.title}</span>
                      {expandedSections[section.id] ? (
                        <FiChevronDown className="doc-nav-chevron" />
                      ) : (
                        <FiChevronRight className="doc-nav-chevron" />
                      )}
                    </button>
                    {expandedSections[section.id] && (
                      <div className="doc-nav-subsections">
                        {section.subsections.map(sub => (
                          <button
                            key={sub.id}
                            className={`doc-nav-item ${selectedSection === sub.id ? 'active' : ''}`}
                            onClick={() => selectSection(sub.id)}
                          >
                            {sub.icon && <sub.icon className="doc-nav-icon-small" />}
                            <span>{sub.title}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <button
                    className={`doc-nav-item doc-nav-item-top ${selectedSection === section.id ? 'active' : ''}`}
                    onClick={() => selectSection(section.id)}
                  >
                    {section.icon && <section.icon className="doc-nav-icon" />}
                    <span>{section.title}</span>
                  </button>
                )}
              </div>
            ))}
          </nav>
        </div>
        
        <div className="doc-content">
          {currentSection && (
            <div className="doc-article">
              <div className="doc-article-header">
                {currentSection.icon && <currentSection.icon className="doc-article-icon" />}
                <h1>{currentSection.title}</h1>
              </div>
              <div className="doc-article-body">
                {renderMarkdown(currentSection.content)}
              </div>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}

export default Documentation;
