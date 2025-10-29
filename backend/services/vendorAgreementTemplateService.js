const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

class VendorAgreementTemplateService {
  constructor() {
    this.templateFields = [
      { field: 'file_name', label: 'File Name *', type: 'text', required: true },
      { field: 'file_description', label: 'File Description *', type: 'text', required: true },
      { field: 'vendor_department_team', label: 'Vendor Department/Team *', type: 'text', required: true },
      { field: 'vendor_department_email', label: 'Vendor Department Email *', type: 'text', required: true },
      { field: 'schema', label: 'Schema (JSON)', type: 'text', required: false },
      { field: 'frequency', label: 'Frequency *', type: 'dropdown', required: true, options: ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annual', 'Ad-hoc'] },
      { field: 'frequency_description', label: 'Frequency Description', type: 'text', required: false },
      { field: 'contains_pii', label: 'Contains PII', type: 'boolean', required: false },
      { field: 'file_type', label: 'File Type', type: 'text', required: false },
      { field: 'data_classification', label: 'Data Classification', type: 'dropdown', required: false, options: ['Public', 'Internal', 'Confidential', 'Restricted'] },
      { field: 'domain', label: 'Domain', type: 'text', required: false },
      { field: 'retention_days', label: 'Retention Days', type: 'number', required: false },
      { field: 'expected_arrival_time', label: 'Expected Arrival Time', type: 'text', required: false },
      { field: 'delivery_method', label: 'Delivery Method', type: 'dropdown', required: false, options: ['SFTP', 'API', 'Email', 'Manual Upload', 'Cloud Storage'] }
    ];
  }

  generateTemplate() {
    const headers = this.templateFields.map(f => f.label);
    const exampleRow = this.templateFields.map(f => this._getExampleValue(f));
    const instructionsRow = this.templateFields.map(f => this._getInstructions(f));

    const wsData = [
      headers,
      instructionsRow,
      exampleRow,
      Array(this.templateFields.length).fill('')
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    const colWidths = this.templateFields.map(f => ({
      wch: Math.max(f.label.length, 20)
    }));
    ws['!cols'] = colWidths;

    ws['!rows'] = [
      { hpt: 25 },
      { hpt: 40 },
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

      const instructionCell = XLSX.utils.encode_cell({ r: 1, c: C });
      if (!ws[instructionCell]) continue;
      ws[instructionCell].s = {
        font: { italic: true, color: { rgb: '666666' } },
        fill: { fgColor: { rgb: 'F2F2F2' } },
        alignment: { horizontal: 'left', vertical: 'top', wrapText: true }
      };

      const exampleCell = XLSX.utils.encode_cell({ r: 2, c: C });
      if (!ws[exampleCell]) continue;
      ws[exampleCell].s = {
        font: { color: { rgb: '999999' } },
        fill: { fgColor: { rgb: 'FFFACD' } },
        alignment: { horizontal: 'left', vertical: 'center' }
      };
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vendor Agreements');

    const instructionsWs = this._createInstructionsSheet();
    XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions');

    return wb;
  }

  _getExampleValue(field) {
    switch (field.field) {
      case 'file_name':
        return 'customer_data_export.csv';
      case 'file_description':
        return 'Daily export of customer information';
      case 'schema':
        return '[{"name":"ID","type":"integer","description":"Primary Key"},{"name":"Name","type":"string","description":"Customer name"},{"name":"Email","type":"string","description":"Email address"}]';
      case 'frequency':
        return 'Daily';
      case 'frequency_description':
        return 'Delivered every day at 6 AM EST';
      case 'vendor_department_team':
        return 'Data Engineering Team';
      case 'vendor_department_email':
        return 'data-team@vendor.com';
      case 'contains_pii':
        return 'TRUE';
      case 'file_type':
        return 'CSV';
      case 'data_classification':
        return 'Confidential';
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
      ['This template allows you to create multiple vendor agreements at once by filling in the spreadsheet and uploading it.'],
      [''],
      ['How to Use:'],
      ['1. Go to the "Vendor Agreements" sheet'],
      ['2. Row 1 contains the field names (do not modify)'],
      ['3. Row 2 contains instructions for each field'],
      ['4. Row 3 contains example values'],
      ['5. Start entering your data from Row 4 onwards'],
      ['6. Fields marked with * are required'],
      ['7. For dropdown fields, use only the values listed in the instructions'],
      ['8. For boolean fields (like Contains PII), use TRUE or FALSE'],
      ['9. For Schema field, use JSON array format: [{"name":"Col","type":"datatype","description":"info"}]'],
      [''],
      ['Important Notes:'],
      ['- Admin-only fields (Vendor, Project, Connections, Contacts, File Owner) will be set in the creation form'],
      ['- Make sure all required fields are filled'],
      ['- Invalid data will be flagged during upload'],
      ['- Template upload auto-populates the agreement creation form for review before submission'],
      [''],
      ['Field Descriptions:'],
      [''],
      ['File Name: The name of the data file (e.g., customer_export.csv)'],
      ['File Description: A description of what the file contains'],
      ['Vendor Department/Team: Name of the vendor department/team responsible'],
      ['Vendor Department Email: Contact email for the vendor department/team'],
      ['Schema: JSON array of column definitions. Format: [{"name":"ColumnName","type":"datatype","description":"details"}]'],
      ['  Example: [{"name":"ID","type":"integer","description":"Primary Key"},{"name":"Sales","type":"integer","description":"Total sales"}]'],
      ['Frequency: How often the file is delivered (Daily, Weekly, etc.)'],
      ['Frequency Description: Details about delivery timing'],
      ['Contains PII: Whether the file contains personally identifiable information'],
      ['File Type: Type of file (CSV, JSON, XML, etc.)'],
      ['Data Classification: Security classification level'],
      ['Domain: Business domain or category'],
      ['Retention Days: How long to keep the data'],
      ['Expected Arrival Time: When the file typically arrives'],
      ['Delivery Method: How the file is delivered (SFTP, API, etc.)']
    ];

    const ws = XLSX.utils.aoa_to_sheet(instructions);
    
    ws['!cols'] = [{ wch: 100 }];
    
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
      const sheetName = 'Vendor Agreements';
      
      if (!workbook.SheetNames.includes(sheetName)) {
        throw new Error('Invalid template: "Vendor Agreements" sheet not found');
      }

      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1,
        defval: '',
        raw: false
      });

      if (data.length < 4) {
        throw new Error('Template must have at least 4 rows (headers, instructions, example, and data)');
      }

      const headers = data[0];
      const dataRows = data.slice(3);

      const agreements = [];
      const errors = [];

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        
        if (row.every(cell => !cell || cell.toString().trim() === '')) {
          continue;
        }

        const agreement = {};
        const rowErrors = [];

        for (let j = 0; j < headers.length; j++) {
          const header = headers[j];
          const fieldDef = this.templateFields.find(f => f.label === header);
          
          if (!fieldDef) {
            continue;
          }

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
            row: i + 4,
            errors: rowErrors
          });
        } else {
          agreements.push(agreement);
        }
      }

      return {
        success: errors.length === 0,
        agreements,
        errors,
        totalRows: dataRows.filter(row => !row.every(cell => !cell || cell.toString().trim() === '')).length,
        validRows: agreements.length
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
        if (fieldDef.field.includes('json') && strValue) {
          try {
            JSON.parse(strValue);
          } catch (e) {
            return {
              valid: false,
              error: 'Must be valid JSON'
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
