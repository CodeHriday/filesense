/**
 * AI Routes
 * 
 * API routes for AI-related functionality
 */

const express = require('express');
const router = express.Router();

/**
 * Register AI routes with the provided DI container
 * 
 * @param {Object} container - DI container with services
 * @returns {Router} Express router
 */
module.exports = function(container) {
  const aiService = container.get('aIService');
  const fileService = container.get('fileService');
  const logger = container.get('systemLogger');
  
  /**
   * Get related datasets for a file
   */
  router.get('/related-datasets/:fileId', async (req, res) => {
    try {
      const { fileId } = req.params;
      const { limit = 5, threshold = 0.5 } = req.query;
      
      logger.info('Finding related datasets', { fileId, limit, threshold });
      
      const relatedDatasets = await aiService.findRelatedDatasets(
        fileId, 
        parseInt(limit, 10), 
        parseFloat(threshold)
      );
      
      res.json(relatedDatasets);
    } catch (error) {
      logger.error('Error finding related datasets', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get explanation of relationship between two datasets
   */
  router.get('/relationship-explanation', async (req, res) => {
    try {
      const { fileId1, fileId2 } = req.query;
      
      if (!fileId1 || !fileId2) {
        return res.status(400).json({ error: 'Both fileId1 and fileId2 are required' });
      }
      
      logger.info('Getting relationship explanation', { fileId1, fileId2 });
      
      const explanation = await aiService.getRelationshipExplanation(fileId1, fileId2);
      
      res.json(explanation);
    } catch (error) {
      logger.error('Error getting relationship explanation', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Generate embedding for a file
   */
  router.get('/file-embedding/:fileId', async (req, res) => {
    try {
      const { fileId } = req.params;
      
      logger.info('Generating file embedding', { fileId });
      
      const fileDetails = await fileService.getFileById(fileId);
      const fileProfile = await fileService.getFileProfile(fileId);
      
      if (!fileDetails || !fileProfile) {
        return res.status(404).json({ error: 'File details or profile not found' });
      }
      
      const embedding = await aiService.generateFileEmbedding(fileDetails, fileProfile);
      
      res.json({
        file_id: fileId,
        embedding_size: embedding.length,
        embedding_type: 'float32',
        success: true
      });
    } catch (error) {
      logger.error('Error generating file embedding', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
