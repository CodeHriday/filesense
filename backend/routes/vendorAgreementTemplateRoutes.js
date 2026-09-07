const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const authenticateToken = require('../middleware/authenticate');
const vendorAgreementTemplateService = require('../services/vendorAgreementTemplateService');
const pool = require('../db');

const upload = multer({ 
  dest: 'uploads/templates/',
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
  }
});

const schemaUpload = multer({ 
  dest: 'uploads/schemas/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.json') {
      cb(null, true);
    } else {
      cb(new Error('Only JSON files (.json) are allowed for schema upload'));
    }
  }
});

router.get('/vendor-agreement-template/download', authenticateToken, async (req, res) => {
  try {
    const workbook = vendorAgreementTemplateService.generateTemplate();
    
    const buffer = XLSX.write(workbook, { 
      type: 'buffer', 
      bookType: 'xlsx',
      compression: true 
    });
    
    const filename = `vendor_agreement_template_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    
    res.send(buffer);
  } catch (error) {
    console.error('Error generating template:', error);
    res.status(500).json({ 
      error: 'Failed to generate template', 
      details: error.message 
    });
  }
});

router.post('/vendor-agreement-template/upload', authenticateToken, upload.single('template'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('Processing template file:', req.file.path);
    const result = vendorAgreementTemplateService.parseTemplateUpload(req.file.path);
    console.log('Template parse result:', { success: result.success, validRows: result.validRows, totalRows: result.totalRows });
    
    fs.unlinkSync(req.file.path);
    
    if (!result.success) {
      console.log('Template validation failed:', result.errors);
      return res.status(400).json({
        error: 'Template validation failed',
        details: result.errors,
        totalRows: result.totalRows,
        validRows: result.validRows
      });
    }
    
    // Resolve quality_rules type strings to existing DB rule IDs so the
    // schemaRuleEnforcer's candidate-ID lookup fires for template-uploaded contracts.
    try {
      const allFileConfigs = result.agreements.flatMap(a => a.fileConfigurations || []);
      await vendorAgreementTemplateService.resolveQualityRuleIds(pool, allFileConfigs);
    } catch (resolveErr) {
      // Non-fatal — the broad-type lookup in schemaRuleEnforcer is a safe fallback
      console.warn('resolveQualityRuleIds failed (non-fatal):', resolveErr.message);
    }

    console.log('Template parsed successfully, returning agreements:', result.agreements.length);
    res.json({
      success: true,
      message: `Successfully parsed ${result.validRows} vendor agreement(s)`,
      agreements: result.agreements,
      totalRows: result.totalRows,
      validRows: result.validRows
    });
    
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    console.error('Error uploading template:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to process template', 
      message: error.message,
      details: error.stack 
    });
  }
});

router.post('/vendor-agreement-template/upload-schema', authenticateToken, schemaUpload.single('schema'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('Processing schema file:', req.file.originalname);
    
    const fileContent = fs.readFileSync(req.file.path, 'utf8');
    
    fs.unlinkSync(req.file.path);
    
    let parsedSchema;
    try {
      parsedSchema = JSON.parse(fileContent);
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid JSON format',
        details: parseError.message
      });
    }
    
    if (!Array.isArray(parsedSchema)) {
      return res.status(400).json({
        success: false,
        error: 'Schema must be a JSON array of field definitions'
      });
    }
    
    const validationErrors = [];
    const normalizedSchema = parsedSchema.map((field, index) => {
      // Ensure each element is an object
      if (typeof field !== 'object' || field === null || Array.isArray(field)) {
        validationErrors.push(`Field ${index + 1}: Must be an object with field definitions`);
        return null;
      }
      
      const hasNewFormat = field.name && field.type;
      const hasOldFormat = field.column_name && field.data_type;
      
      if (!hasNewFormat && !hasOldFormat) {
        validationErrors.push(`Field ${index + 1}: Must have name+type or column_name+data_type`);
        return null;
      }
      
      const normalized = { ...field };
      if (hasOldFormat && !hasNewFormat) {
        normalized.name = field.column_name;
        normalized.type = field.data_type;
        delete normalized.column_name;
        delete normalized.data_type;
      }
      
      // Validate type is a valid string
      if (typeof normalized.type !== 'string') {
        validationErrors.push(`Field ${index + 1} (${normalized.name}): Type must be a string`);
        return null;
      }
      
      if (normalized.pii === undefined || normalized.pii === null) {
        normalized.pii = false;
      }
      if (normalized.nullable === undefined || normalized.nullable === null) {
        normalized.nullable = true;
      }
      
      return normalized;
    }).filter(f => f !== null);
    
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Schema validation failed',
        details: validationErrors
      });
    }
    
    console.log(`Schema parsed successfully: ${normalizedSchema.length} fields`);
    
    res.json({
      success: true,
      message: `Successfully parsed schema with ${normalizedSchema.length} field(s)`,
      schema: normalizedSchema,
      fieldCount: normalizedSchema.length,
      originalFilename: req.file.originalname
    });
    
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    console.error('Error uploading schema:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to process schema file', 
      details: error.message
    });
  }
});

module.exports = router;
