/**
 * Agreement Template Utilities
 * Generate and parse agreement templates in Excel, CSV, and JSON formats
 */

const XLSX = require('xlsx');
const { systemLogger } = require('./logger');

class AgreementTemplateUtils {
  /**
   * Template structure with all required fields
   */
  static getTemplateFields() {
    return {
      file_name: 'Monthly Sales Report',
      file_description: 'Description of the file and its purpose',
      file_creator: 'Creator name or department',
      vendor_contact: 'Contact person at vendor',
      owner_contact: 'Contact person at your organization',
      frequency: 'Daily',
      frequency_description: 'Detailed description of frequency (e.g., "Every business day at 9:00 AM EST")',
      schema: '[{"name":"column1","type":"string","description":"Description of column1"},{"name":"column2","type":"integer","description":"Description of column2"}]'
    };
  }

  /**
   * Generate Excel template
   */
  static generateExcelTemplate() {
    try {
      const fields = this.getTemplateFields();
      
      // Create worksheet with field names in column A and example values in column B
      const data = [
        ['Field Name', 'Value', 'Instructions'],
        ['file_name', fields.file_name, 'Required: Name of the file'],
        ['file_description', fields.file_description, 'Required: Detailed description'],
        ['file_creator', fields.file_creator, 'Creator or source'],
        ['vendor_contact', fields.vendor_contact, 'Vendor contact person'],
        ['owner_contact', fields.owner_contact, 'Owner contact person'],
        ['frequency', fields.frequency, 'Options: Daily, Weekly, Monthly, Quarterly, Yearly, Ad-hoc'],
        ['frequency_description', fields.frequency_description, 'Detailed frequency information'],
        ['schema', fields.schema, 'Required: JSON array of column definitions']
      ];
      
      const ws = XLSX.utils.aoa_to_sheet(data);
      
      // Set column widths
      ws['!cols'] = [
        { wch: 25 },  // Field Name
        { wch: 50 },  // Value
        { wch: 60 }   // Instructions
      ];
      
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Agreement Template');
      
      return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    } catch (error) {
      systemLogger.error('Error generating Excel template', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate CSV template
   */
  static generateCSVTemplate() {
    try {
      const fields = this.getTemplateFields();
      
      const data = [
        ['Field Name', 'Value', 'Instructions'],
        ['file_name', fields.file_name, 'Required: Name of the file'],
        ['file_description', fields.file_description, 'Required: Detailed description'],
        ['file_creator', fields.file_creator, 'Creator or source'],
        ['vendor_contact', fields.vendor_contact, 'Vendor contact person'],
        ['owner_contact', fields.owner_contact, 'Owner contact person'],
        ['frequency', fields.frequency, 'Options: Daily, Weekly, Monthly, Quarterly, Yearly, Ad-hoc'],
        ['frequency_description', fields.frequency_description, 'Detailed frequency information'],
        ['schema', fields.schema, 'Required: JSON array of column definitions']
      ];
      
      // Convert to CSV
      const csvContent = data.map(row => 
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ).join('\n');
      
      return Buffer.from(csvContent, 'utf-8');
    } catch (error) {
      systemLogger.error('Error generating CSV template', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate JSON template
   */
  static generateJSONTemplate() {
    try {
      const fields = this.getTemplateFields();
      
      const template = {
        _instructions: {
          file_name: 'Required: Name of the file',
          file_description: 'Required: Detailed description',
          file_creator: 'Creator or source',
          vendor_contact: 'Vendor contact person',
          owner_contact: 'Owner contact person',
          frequency: 'Options: Daily, Weekly, Monthly, Quarterly, Yearly, Ad-hoc',
          frequency_description: 'Detailed frequency information',
          schema: 'Required: Array of column definitions with name, type, and description'
        },
        file_name: fields.file_name,
        file_description: fields.file_description,
        file_creator: fields.file_creator,
        vendor_contact: fields.vendor_contact,
        owner_contact: fields.owner_contact,
        frequency: 'Daily',
        frequency_description: fields.frequency_description,
        schema: [
          {
            name: 'column1',
            type: 'string',
            description: 'Description of column1'
          },
          {
            name: 'column2',
            type: 'integer',
            description: 'Description of column2'
          }
        ]
      };
      
      return Buffer.from(JSON.stringify(template, null, 2), 'utf-8');
    } catch (error) {
      systemLogger.error('Error generating JSON template', { error: error.message });
      throw error;
    }
  }

  /**
   * Parse Excel template file
   */
  static parseExcelTemplate(buffer) {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
      
      // Extract field-value pairs (skip header row)
      const result = {};
      for (let i = 1; i < data.length; i++) {
        const [fieldName, value] = data[i];
        if (fieldName && value) {
          result[fieldName] = value;
        }
      }
      
      // Parse schema JSON if present
      if (result.schema && typeof result.schema === 'string') {
        result.schema = JSON.parse(result.schema);
      }
      
      return result;
    } catch (error) {
      systemLogger.error('Error parsing Excel template', { error: error.message });
      throw new Error('Failed to parse Excel file. Please ensure it follows the template format.');
    }
  }

  /**
   * Parse CSV template file
   */
  static parseCSVTemplate(buffer) {
    try {
      const csvContent = buffer.toString('utf-8');
      const lines = csvContent.split('\n').map(line => line.trim()).filter(line => line);
      
      // Parse CSV manually (simple approach)
      const result = {};
      
      for (let i = 1; i < lines.length; i++) { // Skip header
        const match = lines[i].match(/^"([^"]+)","([^"]*(?:""[^"]*)*)"/);
        if (match) {
          const fieldName = match[1];
          let value = match[2].replace(/""/g, '"'); // Unescape quotes
          
          if (fieldName && value) {
            result[fieldName] = value;
          }
        }
      }
      
      // Parse schema JSON if present
      if (result.schema && typeof result.schema === 'string') {
        result.schema = JSON.parse(result.schema);
      }
      
      return result;
    } catch (error) {
      systemLogger.error('Error parsing CSV template', { error: error.message });
      throw new Error('Failed to parse CSV file. Please ensure it follows the template format.');
    }
  }

  /**
   * Parse JSON template file
   */
  static parseJSONTemplate(buffer) {
    try {
      const jsonContent = buffer.toString('utf-8');
      const data = JSON.parse(jsonContent);
      
      // Remove instructions field if present
      if (data._instructions) {
        delete data._instructions;
      }
      
      return data;
    } catch (error) {
      systemLogger.error('Error parsing JSON template', { error: error.message });
      throw new Error('Failed to parse JSON file. Please ensure it is valid JSON.');
    }
  }

  /**
   * Validate parsed template data
   */
  static validateTemplateData(data) {
    const errors = [];
    
    // Required fields
    if (!data.file_name || data.file_name.trim() === '') {
      errors.push('file_name is required');
    }
    
    if (!data.file_description || data.file_description.trim() === '') {
      errors.push('file_description is required');
    }
    
    // Validate schema if present
    if (data.schema) {
      if (!Array.isArray(data.schema)) {
        errors.push('schema must be an array');
      } else {
        data.schema.forEach((col, idx) => {
          if (!col.name) {
            errors.push(`schema[${idx}] missing 'name' field`);
          }
          if (!col.type) {
            errors.push(`schema[${idx}] missing 'type' field`);
          }
        });
      }
    }
    
    // Validate frequency if present
    const validFrequencies = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly', 'Ad-hoc'];
    if (data.frequency && !validFrequencies.includes(data.frequency)) {
      errors.push(`Invalid frequency. Must be one of: ${validFrequencies.join(', ')}`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = AgreementTemplateUtils;
