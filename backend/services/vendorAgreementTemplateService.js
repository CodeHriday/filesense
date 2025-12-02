const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

class VendorAgreementTemplateService {
  constructor() {
    // Archive file types that support password protection
    this.ARCHIVE_FILE_TYPES = ['zip', '7z', 'tar', 'tar.gz', 'tar.bz2'];
    
    // Agreement-level fields
    this.agreementFields = [
      { field: 'agreement_id', label: 'Agreement ID *', type: 'text', required: true },
      { field: 'description', label: 'Description', type: 'text', required: false },
      { field: 'vendor_department_team', label: 'Vendor Department/Team *', type: 'text', required: true },
      { field: 'vendor_department_email', label: 'Vendor Department Email *', type: 'text', required: true },
      { field: 'frequency', label: 'Frequency *', type: 'dropdown', required: true, options: ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annual', 'Ad-hoc'] },
      { field: 'frequency_description', label: 'Frequency Description', type: 'text', required: false },
      { field: 'domain', label: 'Domain', type: 'text', required: false },
      { field: 'retention_days', label: 'Retention Days', type: 'number', required: false },
      { field: 'expected_arrival_time', label: 'Expected Arrival Time', type: 'text', required: false },
      { field: 'delivery_method', label: 'Delivery Method', type: 'dropdown', required: false, options: ['SFTP', 'S3', 'API', 'Email', 'Manual'] }
    ];

    // Fixed width file types that require header definition
    this.FIXED_WIDTH_FILE_TYPES = ['fixed_width', 'binary', 'dat'];
    
    // File configuration fields (multiple per agreement)
    this.fileConfigFields = [
      { field: 'agreement_id', label: 'Agreement ID *', type: 'text', required: true },
      { field: 'file_name_pattern', label: 'File Name Pattern *', type: 'text', required: true },
      { field: 'file_description', label: 'File Description', type: 'text', required: false },
      { field: 'file_type', label: 'File Type *', type: 'dropdown', required: true, options: ['csv', 'json', 'xml', 'xlsx', 'parquet', 'fixed_width', 'binary', 'dat', 'sas7bdat', 'avro', 'zip', '7z', 'tar', 'tar.gz', 'tar.bz2'] },
      { field: 'archive_password', label: 'Archive Password', type: 'text', required: false },
      { field: 'has_header', label: 'Has Header', type: 'boolean', required: false },
      { field: 'schema', label: 'Schema (JSON)', type: 'text', required: false },
      { field: 'priority', label: 'Priority', type: 'number', required: false },
      { field: 'contains_pii', label: 'Contains PII', type: 'boolean', required: false },
      { field: 'data_classification', label: 'Data Classification', type: 'dropdown', required: false, options: ['Public', 'Internal', 'Confidential', 'Highly Confidential'] },
      { field: 'quality_rule_ids', label: 'Quality Rule IDs', type: 'text', required: false }
    ];
  }

  generateTemplate() {
    const wb = XLSX.utils.book_new();

    // Create Agreement Info sheet
    const agreementWs = this._createSheetFromFields(this.agreementFields, 'AGR001');
    XLSX.utils.book_append_sheet(wb, agreementWs, 'Agreement Info');

    // Create File Configurations sheet
    const fileConfigWs = this._createFileConfigSheet();
    XLSX.utils.book_append_sheet(wb, fileConfigWs, 'File Configurations');

    // Create Instructions sheet
    const instructionsWs = this._createInstructionsSheet();
    XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions');

    return wb;
  }

  _createSheetFromFields(fields, exampleAgreementId) {
    const headers = fields.map(f => f.label);
    const exampleRow = fields.map(f => this._getExampleValue(f, exampleAgreementId));

    const wsData = [
      headers,
      exampleRow,
      Array(fields.length).fill('')
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    const colWidths = fields.map(f => ({
      wch: Math.max(f.label.length, 20)
    }));
    ws['!cols'] = colWidths;

    ws['!rows'] = [
      { hpt: 25 },
      { hpt: 20 }
    ];

    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let C = range.s.c; C <= range.e.c; C++) {
      const headerCell = XLSX.utils.encode_cell({ r: 0, c: C });
      if (!ws[headerCell]) continue;
      ws[headerCell].s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '4472C4' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
      };

      const exampleCell = XLSX.utils.encode_cell({ r: 1, c: C });
      if (!ws[exampleCell]) continue;
      ws[exampleCell].s = {
        font: { color: { rgb: '999999' } },
        fill: { fgColor: { rgb: 'FFFACD' } },
        alignment: { horizontal: 'left', vertical: 'center' }
      };
    }

    return ws;
  }

  _createFileConfigSheet() {
    const headers = this.fileConfigFields.map(f => f.label);
    const exampleRow1 = this.fileConfigFields.map(f => this._getExampleFileConfigValue(f, 'AGR001', 1));
    const exampleRow2 = this.fileConfigFields.map(f => this._getExampleFileConfigValue(f, 'AGR001', 2));

    const wsData = [
      headers,
      exampleRow1,
      exampleRow2,
      Array(this.fileConfigFields.length).fill('')
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    const colWidths = this.fileConfigFields.map(f => ({
      wch: Math.max(f.label.length, 25)
    }));
    ws['!cols'] = colWidths;

    ws['!rows'] = [
      { hpt: 25 },
      { hpt: 20 },
      { hpt: 20 }
    ];

    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let C = range.s.c; C <= range.e.c; C++) {
      const headerCell = XLSX.utils.encode_cell({ r: 0, c: C });
      if (!ws[headerCell]) continue;
      ws[headerCell].s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '4472C4' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
      };

      for (let R = 1; R <= 2; R++) {
        const exampleCell = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[exampleCell]) continue;
        ws[exampleCell].s = {
          font: { color: { rgb: '999999' } },
          fill: { fgColor: { rgb: 'FFFACD' } },
          alignment: { horizontal: 'left', vertical: 'center' }
        };
      }
    }

    return ws;
  }

  _getExampleValue(field, agreementId = 'AGR001') {
    switch (field.field) {
      case 'agreement_id':
        return agreementId;
      case 'description':
        return 'Customer data export agreement';
      case 'frequency':
        return 'Daily';
      case 'frequency_description':
        return 'Delivered every day at 6 AM EST';
      case 'vendor_department_team':
        return 'Data Engineering Team';
      case 'vendor_department_email':
        return 'data-team@vendor.com';
      case 'domain':
        return 'Customer Data';
      case 'retention_days':
        return '90';
      case 'expected_arrival_time':
        return '06:00 EST';
      case 'delivery_method':
        return 'SFTP';
      default:
        return '';
    }
  }

  _getExampleFileConfigValue(field, agreementId = 'AGR001', fileNum = 1) {
    switch (field.field) {
      case 'agreement_id':
        return agreementId;
      case 'file_name_pattern':
        return fileNum === 1 ? 'customer_data' : 'legacy_transactions';
      case 'file_description':
        return fileNum === 1 ? 'Daily customer information export' : 'Fixed-width transaction file from legacy system';
      case 'file_type':
        return fileNum === 1 ? 'csv' : 'fixed_width';
      case 'archive_password':
        return '';
      case 'has_header':
        return fileNum === 1 ? 'TRUE' : 'FALSE';
      case 'schema':
        return fileNum === 1 
          ? '[{"name":"ID","type":"integer","description":"Customer ID","nullable":false,"pii":false},{"name":"Name","type":"string","description":"Customer name","nullable":true,"pii":false},{"name":"Email","type":"string","description":"Customer email","nullable":true,"pii":true}]'
          : '[{"name":"transaction_id","type":"string","width":15,"start_position":0,"nullable":false,"pii":false},{"name":"amount","type":"float","width":12,"start_position":15,"precision":10,"scale":2,"nullable":false,"pii":false},{"name":"customer_name","type":"string","width":50,"start_position":27,"nullable":true,"pii":false},{"name":"timestamp","type":"timestamp","width":19,"start_position":77,"nullable":false,"pii":false}]';
      case 'priority':
        return fileNum === 1 ? '100' : '200';
      case 'contains_pii':
        return fileNum === 1 ? 'TRUE' : 'FALSE';
      case 'data_classification':
        return fileNum === 1 ? 'Highly Confidential' : 'Internal';
      case 'quality_rule_ids':
        return fileNum === 1 ? '1,2,3' : '2,4';
      default:
        return '';
    }
  }

  _getInstructions(field) {
    const base = field.required ? 'REQUIRED. ' : 'Optional. ';
    
    switch (field.type) {
      case 'dropdown':
        return `${base}Choose from: ${field.options.join(', ')}`;
      case 'boolean':
        return `${base}Enter TRUE or FALSE`;
      case 'number':
        return `${base}Enter a number`;
      case 'date':
        return `${base}Enter date in YYYY-MM-DD format (e.g., 2025-01-15)`;
      case 'text':
        if (field.field.includes('json')) {
          return `${base}Enter valid JSON format`;
        }
        return `${base}Enter text`;
      default:
        return base.trim();
    }
  }

  _createInstructionsSheet() {
    const instructions = [
      ['Vendor Agreement Template - Instructions'],
      [''],
      ['Overview:'],
      ['This template allows you to create vendor agreements with multiple file configurations in a single upload.'],
      ['The template now has TWO sheets: "Agreement Info" for agreement-level details and "File Configurations" for individual files.'],
      [''],
      ['How to Use:'],
      ['1. Agreement Info Sheet:'],
      ['   - Each row represents one vendor agreement'],
      ['   - Row 1 contains headers (do not modify)'],
      ['   - Row 2 has example data'],
      ['   - Start entering data from Row 3'],
      ['   - Assign a unique Agreement ID (e.g., AGR001, AGR002) to link file configurations'],
      [''],
      ['2. File Configurations Sheet:'],
      ['   - Each row represents one file pattern within an agreement'],
      ['   - Multiple files can share the same Agreement ID'],
      ['   - Row 1 contains headers (do not modify)'],
      ['   - Rows 2-3 show examples (both linked to AGR001)'],
      ['   - Start entering data from Row 4'],
      [''],
      ['3. Linking Files to Agreements:'],
      ['   - Use the same Agreement ID in both sheets to link them'],
      ['   - Example: If Agreement Info has "AGR001", all File Configurations with "AGR001" belong to that agreement'],
      ['   - You can have multiple file configurations per agreement'],
      [''],
      ['Important Notes:'],
      ['- Fields marked with * are required'],
      ['- For dropdown fields, use only the exact values listed below'],
      ['- For boolean fields (Contains PII), use TRUE or FALSE'],
      ['- For Schema field, use JSON array format: [{"column_name":"Name","data_type":"string"}]'],
      ['- Quality Rule IDs should be comma-separated numbers (e.g., 1,2,3)'],
      ['- Admin-only fields (Vendor, Project, Connections, Contacts) will be set in the creation form'],
      ['- Template upload auto-populates the form for review before submission'],
      [''],
      ['Agreement Info Fields:'],
      [''],
      ['Agreement ID: Unique identifier to link with file configurations (e.g., AGR001) - REQUIRED'],
      ['Vendor Department/Team: Name of vendor department/team responsible - REQUIRED'],
      ['Vendor Department Email: Contact email for vendor department/team - REQUIRED'],
      ['Frequency: Delivery frequency - REQUIRED. Values: Daily, Weekly, Monthly, Quarterly, Annual, Ad-hoc'],
      ['Frequency Description: Details about delivery timing (optional)'],
      ['Domain: Business domain or category (optional)'],
      ['Retention Days: Data retention period in days - enter a number (optional)'],
      ['Expected Arrival Time: When file typically arrives, e.g., 06:00 EST (optional)'],
      ['Delivery Method: How file is delivered (optional). Values: SFTP, S3, API, Email, Manual'],
      [''],
      ['File Configuration Fields:'],
      [''],
      ['Agreement ID: Must match an Agreement ID from Agreement Info sheet - REQUIRED'],
      ['File Name Pattern: Base pattern without extension, e.g., customer_data - REQUIRED'],
      ['File Description: What the file contains (optional)'],
      ['File Type: Type of file - REQUIRED. Values: csv, json, xml, xlsx, parquet, fixed_width, binary, dat, sas7bdat, avro, zip, 7z, tar, tar.gz, tar.bz2'],
      ['Archive Password: Password for encrypted archives - ONLY allowed for archive file types (zip, 7z, tar, tar.gz, tar.bz2). Leave blank for non-archive types.'],
      ['Has Header: TRUE or FALSE - indicates if file has a header row. For fixed_width, binary, dat file types this should be FALSE.'],
      [''],
      ['Schema: JSON array of field definitions. Enhanced format supports all file types including fixed-width and headerless files.'],
      [''],
      ['  FOR LARGE SCHEMAS (200+ fields): Use reference tokens instead of JSON - attach schema file separately after upload:'],
      ['    @external                  - Schema will be uploaded as a separate JSON file after template import'],
      ['    @schema:my_schema.json     - Reference a specific schema filename (upload the JSON file after import)'],
      [''],
      ['  STANDARD FORMAT (for files with headers - csv, json, xlsx, etc.):'],
      ['  [{"name":"FieldName","type":"string","description":"Field description","nullable":true,"pii":false}]'],
      [''],
      ['  EXTENDED FORMAT (for fixed-width, binary, dat files OR headerless files):'],
      ['  [{"name":"FieldName","type":"string","width":10,"start_position":0,"nullable":true,"pii":false}]'],
      [''],
      ['  Available field properties:'],
      ['    - name: Field name (required)'],
      ['    - type: Data type (required): string, integer, float, boolean, date, timestamp, json'],
      ['    - description: Field description (optional)'],
      ['    - nullable: TRUE or FALSE - whether field allows null values (optional, defaults to true)'],
      ['    - pii: TRUE or FALSE - mark as personally identifiable information (optional, defaults to false)'],
      ['    - width: Field width in characters - REQUIRED for fixed-width/binary/dat files (optional for others)'],
      ['    - start_position: Starting character position (0-based) - for fixed-width files (optional)'],
      ['    - precision: Number of digits for numeric types (optional)'],
      ['    - scale: Number of decimal places for numeric types (optional)'],
      [''],
      ['  Example for CSV with header:'],
      ['  [{"name":"ID","type":"integer","description":"Customer ID","pii":false},{"name":"Email","type":"string","pii":true}]'],
      [''],
      ['  Example for fixed-width file (must specify width and start_position):'],
      ['  [{"name":"ID","type":"integer","width":10,"start_position":0},{"name":"Name","type":"string","width":50,"start_position":10},{"name":"Amount","type":"float","width":15,"start_position":60,"precision":10,"scale":2}]'],
      [''],
      ['Priority: Match priority (lower numbers match first). Default: 100 (optional)'],
      ['Contains PII: Does file contain personally identifiable information? TRUE or FALSE (optional)'],
      ['Data Classification: Security level (optional). Values: Public, Internal, Confidential, Highly Confidential'],
      ['Quality Rule IDs: Comma-separated rule IDs, e.g., 1,2,3 (optional)'],
      [''],
      ['Example Structure:'],
      [''],
      ['Agreement Info sheet has:'],
      ['  Row 3: AGR001, Data Team, data@vendor.com, Daily, ...'],
      ['  Row 4: AGR002, Analytics Team, analytics@vendor.com, Weekly, ...'],
      [''],
      ['File Configurations sheet has:'],
      ['  Row 4: AGR001, customer_data, Customer info, csv, [...], 100, TRUE, Highly Confidential, 1,2'],
      ['  Row 5: AGR001, transaction_log, Transactions, json, [...], 200, FALSE, Internal, 2,4'],
      ['  Row 6: AGR002, weekly_report, Reports, xlsx, [...], 100, FALSE, Public, '],
      [''],
      ['This creates 2 agreements: AGR001 with 2 files, AGR002 with 1 file.']
    ];

    const ws = XLSX.utils.aoa_to_sheet(instructions);
    
    ws['!cols'] = [{ wch: 110 }];
    
    const titleCell = 'A1';
    ws[titleCell].s = {
      font: { bold: true, sz: 14, color: { rgb: '4472C4' } },
      alignment: { horizontal: 'left', vertical: 'center' }
    };

    return ws;
  }

  parseTemplateUpload(filePath) {
    try {
      const workbook = XLSX.readFile(filePath);
      
      // Check for required sheets
      if (!workbook.SheetNames.includes('Agreement Info')) {
        throw new Error('Invalid template: "Agreement Info" sheet not found');
      }
      if (!workbook.SheetNames.includes('File Configurations')) {
        throw new Error('Invalid template: "File Configurations" sheet not found');
      }

      // Parse Agreement Info sheet
      const agreementWs = workbook.Sheets['Agreement Info'];
      const agreementData = XLSX.utils.sheet_to_json(agreementWs, { 
        header: 1,
        defval: '',
        raw: false
      });

      // Parse File Configurations sheet
      const fileConfigWs = workbook.Sheets['File Configurations'];
      const fileConfigData = XLSX.utils.sheet_to_json(fileConfigWs, { 
        header: 1,
        defval: '',
        raw: false
      });

      if (agreementData.length < 2) {
        throw new Error('Agreement Info sheet must have at least 2 rows (headers and data)');
      }
      if (fileConfigData.length < 2) {
        throw new Error('File Configurations sheet must have at least 2 rows (headers and data)');
      }

      const agreementHeaders = agreementData[0];
      
      // Smart row detection: skip example rows if present (rows starting with "e.g." or containing example markers)
      // Check if row 2 looks like an example row
      const isAgreementExampleRow = (row) => {
        if (!row || row.length === 0) return false;
        const firstCell = String(row[0] || '').toLowerCase().trim();
        return firstCell.startsWith('e.g.') || firstCell.startsWith('example') || firstCell === '';
      };
      
      // Skip example row if present (row index 1), otherwise start from row 1
      let agreementStartRow = 1;
      if (agreementData.length > 2 && isAgreementExampleRow(agreementData[1])) {
        agreementStartRow = 2;
      }
      const agreementRows = agreementData.slice(agreementStartRow);
      
      const fileConfigHeaders = fileConfigData[0];
      
      // For file configurations, check if rows 1-2 are example rows
      const isFileConfigExampleRow = (row) => {
        if (!row || row.length === 0) return false;
        const firstCell = String(row[0] || '').toLowerCase().trim();
        return firstCell.startsWith('e.g.') || firstCell.startsWith('example') || 
               firstCell.includes('acme') || firstCell === '' || firstCell.startsWith('agr-');
      };
      
      // Determine where data rows start by checking for example rows
      let fileConfigStartRow = 1;
      if (fileConfigData.length > 2 && isFileConfigExampleRow(fileConfigData[1])) {
        fileConfigStartRow = 2;
        if (fileConfigData.length > 3 && isFileConfigExampleRow(fileConfigData[2])) {
          fileConfigStartRow = 3;
        }
      }
      const fileConfigRows = fileConfigData.slice(fileConfigStartRow);

      const agreements = {};
      const errors = [];

      // Parse agreements
      for (let i = 0; i < agreementRows.length; i++) {
        const row = agreementRows[i];
        
        if (row.every(cell => !cell || cell.toString().trim() === '')) {
          continue;
        }

        const agreement = {};
        const rowErrors = [];

        for (let j = 0; j < agreementHeaders.length; j++) {
          const header = agreementHeaders[j];
          const fieldDef = this.agreementFields.find(f => f.label === header);
          
          if (!fieldDef) continue;

          const value = row[j];
          const validationResult = this._validateField(fieldDef, value);
          
          if (!validationResult.valid) {
            rowErrors.push(`${fieldDef.label}: ${validationResult.error}`);
          } else {
            agreement[fieldDef.field] = validationResult.value;
          }
        }

        if (rowErrors.length > 0) {
          errors.push({
            sheet: 'Agreement Info',
            row: i + 3,
            errors: rowErrors
          });
        } else if (agreement.agreement_id) {
          agreement.fileConfigurations = [];
          agreements[agreement.agreement_id] = agreement;
        }
      }

      // Parse file configurations
      for (let i = 0; i < fileConfigRows.length; i++) {
        const row = fileConfigRows[i];
        
        if (row.every(cell => !cell || cell.toString().trim() === '')) {
          continue;
        }

        const fileConfig = {};
        const rowErrors = [];
        let agreementId = null;

        for (let j = 0; j < fileConfigHeaders.length; j++) {
          const header = fileConfigHeaders[j];
          const fieldDef = this.fileConfigFields.find(f => f.label === header);
          
          if (!fieldDef) continue;

          const value = row[j];
          
          if (fieldDef.field === 'agreement_id') {
            agreementId = value ? value.toString().trim() : null;
            continue;
          }

          const validationResult = this._validateField(fieldDef, value);
          
          if (!validationResult.valid) {
            rowErrors.push(`${fieldDef.label}: ${validationResult.error}`);
          } else {
            fileConfig[fieldDef.field] = validationResult.value;
          }
        }

        if (!agreementId) {
          rowErrors.push('Agreement ID is required to link file to agreement');
        } else if (!agreements[agreementId]) {
          rowErrors.push(`Agreement ID "${agreementId}" not found in Agreement Info sheet`);
        }

        // Validate archive_password only allowed for archive file types
        const fileType = fileConfig.file_type || 'csv';
        const archivePassword = fileConfig.archive_password || '';
        if (archivePassword && !this.ARCHIVE_FILE_TYPES.includes(fileType)) {
          rowErrors.push(`Archive Password: Only allowed for archive file types (${this.ARCHIVE_FILE_TYPES.join(', ')}). Current file type is "${fileType}".`);
        }

        // Determine has_header value - defaults to true unless explicitly false or fixed-width type
        let hasHeader = fileConfig.has_header;
        if (hasHeader === null || hasHeader === undefined) {
          hasHeader = !this.FIXED_WIDTH_FILE_TYPES.includes(fileType);
        }
        
        // For fixed-width types, has_header should be false
        if (this.FIXED_WIDTH_FILE_TYPES.includes(fileType) && hasHeader) {
          rowErrors.push(`Has Header: Fixed width/binary/dat file types should have Has Header set to FALSE.`);
        }

        // Validate that headerless files have schema defined (for non-archive types)
        if (!hasHeader && !fileConfig.schema && !this.ARCHIVE_FILE_TYPES.includes(fileType)) {
          rowErrors.push(`Schema: Required when Has Header is FALSE. Provide field definitions with name, type, and width.`);
        }

        if (rowErrors.length > 0) {
          errors.push({
            sheet: 'File Configurations',
            row: i + 4,
            errors: rowErrors
          });
        } else if (agreementId && agreements[agreementId]) {
          // Build the file configuration with derived pattern
          const basePattern = fileConfig.file_name_pattern || '';
          
          const fullConfig = {
            file_name_pattern_base: basePattern,
            file_type: fileType,
            file_name_pattern: `${basePattern}*.${fileType}`,
            file_description: fileConfig.file_description || '',
            archive_password: archivePassword,
            has_header: hasHeader,
            header_definition: !hasHeader ? fileConfig.schema : null,
            schema: fileConfig.schema || null,
            priority: fileConfig.priority ?? 100,
            is_active: true,
            contains_pii: fileConfig.contains_pii || false,
            data_classification: fileConfig.data_classification || null,
            quality_rule_ids: fileConfig.quality_rule_ids || []
          };

          agreements[agreementId].fileConfigurations.push(fullConfig);
        }
      }

      // Convert to array and filter agreements with at least one file config
      const agreementArray = Object.values(agreements).filter(agr => agr.fileConfigurations.length > 0);

      // Add warning for agreements without files
      const agreementsWithoutFiles = Object.values(agreements).filter(agr => agr.fileConfigurations.length === 0);
      if (agreementsWithoutFiles.length > 0) {
        agreementsWithoutFiles.forEach(agr => {
          errors.push({
            sheet: 'Agreement Info',
            row: '?',
            errors: [`Agreement "${agr.agreement_id}" has no file configurations`]
          });
        });
      }

      return {
        success: errors.length === 0,
        agreements: agreementArray,
        errors,
        totalRows: agreementRows.filter(r => !r.every(c => !c || c.toString().trim() === '')).length,
        validRows: agreementArray.length
      };

    } catch (error) {
      throw new Error(`Failed to parse template: ${error.message}`);
    }
  }

  _validateField(fieldDef, value) {
    const strValue = value ? value.toString().trim() : '';

    if (fieldDef.required && !strValue) {
      return {
        valid: false,
        error: 'This field is required'
      };
    }

    if (!strValue) {
      return { valid: true, value: null };
    }

    // Special handling for quality_rule_ids
    if (fieldDef.field === 'quality_rule_ids') {
      const ids = strValue.split(',').map(id => id.trim()).filter(id => id);
      const validIds = ids.every(id => /^\d+$/.test(id));
      
      if (!validIds) {
        return {
          valid: false,
          error: 'Must be comma-separated numbers (e.g., 1,2,3)'
        };
      }
      
      return { 
        valid: true, 
        value: ids.map(id => parseInt(id, 10))
      };
    }

    switch (fieldDef.type) {
      case 'dropdown':
        if (!fieldDef.options.includes(strValue)) {
          return {
            valid: false,
            error: `Must be one of: ${fieldDef.options.join(', ')}`
          };
        }
        return { valid: true, value: strValue };

      case 'boolean':
        const boolValue = strValue.toUpperCase();
        if (boolValue !== 'TRUE' && boolValue !== 'FALSE') {
          return {
            valid: false,
            error: 'Must be TRUE or FALSE'
          };
        }
        return { valid: true, value: boolValue === 'TRUE' };

      case 'number':
        const num = parseInt(strValue, 10);
        if (isNaN(num)) {
          return {
            valid: false,
            error: 'Must be a valid number'
          };
        }
        return { valid: true, value: num };

      case 'date':
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(strValue)) {
          return {
            valid: false,
            error: 'Must be in YYYY-MM-DD format (e.g., 2025-01-15)'
          };
        }
        const dateObj = new Date(strValue);
        if (isNaN(dateObj.getTime())) {
          return {
            valid: false,
            error: 'Must be a valid date'
          };
        }
        return { valid: true, value: strValue };

      case 'text':
        // Special handling for schema field
        if (fieldDef.field === 'schema' && strValue) {
          // Check for schema reference tokens (for large schemas that don't fit in Excel cells)
          const schemaRefPattern = /^@schema:(.+)$/i;
          const externalRefPattern = /^@external$/i;
          
          if (schemaRefPattern.test(strValue)) {
            // Schema reference token - extract filename and mark as pending attachment
            const match = strValue.match(schemaRefPattern);
            return { 
              valid: true, 
              value: {
                _schemaRef: true,
                _refType: 'file',
                _refFilename: match[1].trim(),
                _pendingUpload: true
              }
            };
          }
          
          if (externalRefPattern.test(strValue)) {
            // External reference - mark as pending attachment without specific filename
            return { 
              valid: true, 
              value: {
                _schemaRef: true,
                _refType: 'external',
                _pendingUpload: true
              }
            };
          }
          
          try {
            const parsed = JSON.parse(strValue);
            // Validate it's an array with proper structure
            if (!Array.isArray(parsed)) {
              return {
                valid: false,
                error: 'Schema must be a JSON array'
              };
            }
            // Check each item has required fields (support both old and new format)
            for (const col of parsed) {
              // New format: name + type
              const hasNewFormat = col.name && col.type;
              // Old format (backwards compatibility): column_name + data_type
              const hasOldFormat = col.column_name && col.data_type;
              
              if (!hasNewFormat && !hasOldFormat) {
                return {
                  valid: false,
                  error: 'Each schema field must have name+type or column_name+data_type'
                };
              }
              
              // Normalize to new format
              if (hasOldFormat && !hasNewFormat) {
                col.name = col.column_name;
                col.type = col.data_type;
                delete col.column_name;
                delete col.data_type;
              }
              
              // Set default for pii if not provided
              if (col.pii === undefined || col.pii === null) {
                col.pii = false;
              }
              
              // Set default for nullable if not provided
              if (col.nullable === undefined || col.nullable === null) {
                col.nullable = true;
              }
              
              // Preserve extended properties for fixed-width/binary files
              // width, start_position, precision, scale are already in col if provided
            }
            return { valid: true, value: parsed };
          } catch (e) {
            return {
              valid: false,
              error: 'Must be valid JSON array format'
            };
          }
        }
        return { valid: true, value: strValue };

      default:
        return { valid: true, value: strValue };
    }
  }
}

module.exports = new VendorAgreementTemplateService();
