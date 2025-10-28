const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const authenticateToken = require('../middleware/authenticate');
const vendorAgreementTemplateService = require('../services/vendorAgreementTemplateService');

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

    const result = vendorAgreementTemplateService.parseTemplateUpload(req.file.path);
    
    fs.unlinkSync(req.file.path);
    
    if (!result.success) {
      return res.status(400).json({
        error: 'Template validation failed',
        details: result.errors,
        totalRows: result.totalRows,
        validRows: result.validRows
      });
    }
    
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
    res.status(500).json({ 
      error: 'Failed to process template', 
      details: error.message 
    });
  }
});

module.exports = router;
