/**
 * AI Service
 * 
 * This service handles AI-related functionality for the application including:
 * - Embedding generation for dataset similarity (MiniLM)
 * - Chat with dataset functionality (lightweight LLM)
 */

const NodeCache = require('node-cache');
const path = require('path');
const fs = require('fs'); 
const { systemLogger: logger } = require('../utils/logger');

// Use dynamic import for ES modules
let pipeline;
(async () => {
  try {
    const transformers = await import('@xenova/transformers');
    pipeline = transformers.pipeline;
    logger.info('Successfully imported @xenova/transformers');
  } catch (error) {
    logger.error('Failed to import @xenova/transformers', { error: error.message });
  }
})();

// Cache for embeddings and model instances
const embeddingCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });
const responseCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

// Model configuration
const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';

class AIService {
  constructor(fileService, dbPool) {
    this.fileService = fileService;
    this.dbPool = dbPool;
    this.embeddingPipeline = null;
    this.initializeModels();
  }

  /**
   * Initialize AI models and pipelines
   */
  async initializeModels() {
    try {
      // Check if pipeline function is available yet
      if (!pipeline) {
        logger.info('Waiting for transformers module to load...');
        // Retry after 3 seconds
        setTimeout(() => this.initializeModels(), 3000);
        return;
      }

      logger.info('Initializing embedding model...');
      this.embeddingPipeline = await pipeline('feature-extraction', EMBEDDING_MODEL);
      logger.info('Embedding model initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize AI models', { error: error.message });
      // Set a timeout to retry model initialization
      setTimeout(() => this.initializeModels(), 30000);
    }
  }

  /**
   * Generate embeddings for text
   * 
   * @param {string} text - Text to embed
   * @returns {Promise<Float32Array>} - Embedding vector
   */
  async generateEmbedding(text) {
    try {
      // Check cache first
      const cacheKey = `emb_${Buffer.from(text).toString('base64').substring(0, 40)}`;
      
      if (embeddingCache.has(cacheKey)) {
        logger.debug('Using cached embedding');
        return embeddingCache.get(cacheKey);
      }

      if (!this.embeddingPipeline) {
        logger.warn('Embedding model not initialized yet, retrying initialization');
        await this.initializeModels();
        if (!this.embeddingPipeline) {
          throw new Error('Embedding model failed to initialize');
        }
      }

      // Generate embedding
      const result = await this.embeddingPipeline(text, {
        pooling: 'mean',
        normalize: true
      });

      // Extract the embedding from the model output
      const embedding = result.data;
      
      // Cache the result
      embeddingCache.set(cacheKey, embedding);
      
      return embedding;
    } catch (error) {
      logger.error('Error generating embedding', { error: error.message });
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  /**
   * Calculate the cosine similarity between two vectors
   * 
   * @param {Float32Array} vec1 - First vector
   * @param {Float32Array} vec2 - Second vector
   * @returns {number} - Similarity score (0-1)
   */
  calculateSimilarity(vec1, vec2) {
    if (!vec1 || !vec2 || vec1.length !== vec2.length) {
      logger.warn('Invalid vectors for similarity calculation');
      return 0;
    }

    try {
      // Calculate dot product
      let dotProduct = 0;
      for (let i = 0; i < vec1.length; i++) {
        dotProduct += vec1[i] * vec2[i];
      }

      // Cosine similarity (vectors are already normalized)
      return Math.max(0, Math.min(1, dotProduct));
    } catch (error) {
      logger.error('Error calculating similarity', { error: error.message });
      return 0;
    }
  }

  /**
   * Find related datasets based on column similarity
   * 
   * @param {string} fileId - File ID to find related datasets for
   * @param {number} limit - Maximum number of related datasets to return
   * @param {number} threshold - Minimum similarity threshold (0-1)
   * @returns {Promise<Array>} - Array of related datasets with similarity scores
   */
  async findRelatedDatasets(fileId, limit = 5, threshold = 0.7) {
    try {
      // Get the target file details and profile
      const fileDetails = await this.fileService.getFileById(fileId);
      const fileProfile = await this.fileService.getFileProfile(fileId);
      
      if (!fileDetails || !fileProfile) {
        logger.warn('File details or profile not found', { fileId });
        return [];
      }

      // Get all files except the target file
      const allFiles = await this.fileService.getAllFiles();
      const otherFiles = allFiles.filter(file => file.file_id !== fileId);
      
      if (otherFiles.length === 0) {
        logger.info('No other files to compare with');
        return [];
      }

      // Generate embedding for the target file
      const targetEmbedding = await this.generateFileEmbedding(fileDetails, fileProfile);
      
      // Calculate similarity with other files
      const similarityResults = [];
      
      for (const file of otherFiles) {
        // Get profile for comparison file
        const comparisonProfile = await this.fileService.getFileProfile(file.file_id);
        
        if (!comparisonProfile) {
          logger.warn('Comparison file profile not found', { fileId: file.file_id });
          continue;
        }
        
        // Generate embedding for comparison file
        const comparisonEmbedding = await this.generateFileEmbedding(file, comparisonProfile);
        
        // Calculate similarity
        const similarity = this.calculateSimilarity(targetEmbedding, comparisonEmbedding);
        
        // Add to results if above threshold
        if (similarity >= threshold) {
          similarityResults.push({
            file_id: file.file_id,
            filename: file.filename,
            similarity: similarity,
            file_type: file.file_type,
            created_at: file.created_at,
            quality_score: file.quality_score
          });
        }
      }
      
      // Sort by similarity (descending) and limit results
      return similarityResults
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
      
    } catch (error) {
      logger.error('Error finding related datasets', { error: error.message, fileId });
      throw new Error(`Failed to find related datasets: ${error.message}`);
    }
  }

  /**
   * Generate an embedding for a file based on its metadata and profile
   * 
   * @param {Object} fileDetails - File details object
   * @param {Object} fileProfile - File profile object
   * @returns {Promise<Float32Array>} - File embedding
   */
  async generateFileEmbedding(fileDetails, fileProfile) {
    try {
      // Check cache first
      const cacheKey = `file_emb_${fileDetails.file_id}`;
      
      if (embeddingCache.has(cacheKey)) {
        logger.debug('Using cached file embedding', { fileId: fileDetails.file_id });
        return embeddingCache.get(cacheKey);
      }

      // Create a text representation of the file for embedding
      let textRepresentation = `Filename: ${fileDetails.filename}\n`;
      textRepresentation += `Type: ${fileDetails.file_type}\n`;
      textRepresentation += `Rows: ${fileDetails.row_count}\n`;
      textRepresentation += `Columns: ${fileDetails.column_count}\n\n`;
      
      // Add column information if available
      if (fileProfile && fileProfile.columns) {
        textRepresentation += 'Columns:\n';
        fileProfile.columns.forEach(column => {
          textRepresentation += `${column.name} (${column.type}): `;
          textRepresentation += `${column.description || 'No description'}\n`;
          
          // Add some statistical information
          if (column.stats) {
            if (column.stats.unique_count) textRepresentation += `Unique values: ${column.stats.unique_count}\n`;
            if (column.stats.min_value) textRepresentation += `Min: ${column.stats.min_value}\n`;
            if (column.stats.max_value) textRepresentation += `Max: ${column.stats.max_value}\n`;
            if (column.stats.avg_value) textRepresentation += `Average: ${column.stats.avg_value}\n`;
            if (column.stats.missing_count) textRepresentation += `Missing values: ${column.stats.missing_count}\n`;
          }
        });
      }

      // Generate embedding from text representation
      const embedding = await this.generateEmbedding(textRepresentation);
      
      // Cache the embedding
      embeddingCache.set(cacheKey, embedding);
      
      return embedding;
    } catch (error) {
      logger.error('Error generating file embedding', { 
        error: error.message, 
        fileId: fileDetails.file_id 
      });
      throw new Error(`Failed to generate file embedding: ${error.message}`);
    }
  }

  /**
   * Get explanation of why two datasets are related
   * 
   * @param {string} fileId1 - First file ID
   * @param {string} fileId2 - Second file ID
   * @returns {Promise<Object>} - Explanation object with details
   */
  async getRelationshipExplanation(fileId1, fileId2) {
    try {
      // Get file details and profiles
      const file1 = await this.fileService.getFileById(fileId1);
      const profile1 = await this.fileService.getFileProfile(fileId1);
      
      const file2 = await this.fileService.getFileById(fileId2);
      const profile2 = await this.fileService.getFileProfile(fileId2);
      
      if (!file1 || !profile1 || !file2 || !profile2) {
        logger.warn('File details or profiles not found');
        return {
          relationship_type: 'unknown',
          explanation: 'Unable to determine relationship due to missing file information.'
        };
      }

      // Compare file types
      const sameFileType = file1.file_type === file2.file_type;
      
      // Compare column structures
      const columns1 = profile1.columns || [];
      const columns2 = profile2.columns || [];
      
      // Find matching column names
      const matchingColumns = columns1.filter(col1 => 
        columns2.some(col2 => col2.name.toLowerCase() === col1.name.toLowerCase())
      );
      
      // Calculate column overlap percentage
      const overlapPercentage = (matchingColumns.length / Math.max(columns1.length, columns2.length)) * 100;
      
      // Determine relationship type based on overlap
      let relationshipType = 'unknown';
      let explanation = '';
      
      if (overlapPercentage >= 80) {
        relationshipType = 'nearly_identical';
        explanation = `The datasets appear to be nearly identical with ${Math.round(overlapPercentage)}% column overlap.`;
      } else if (overlapPercentage >= 50) {
        relationshipType = 'strongly_related';
        explanation = `The datasets are strongly related with ${Math.round(overlapPercentage)}% column overlap.`;
      } else if (overlapPercentage >= 30) {
        relationshipType = 'moderately_related';
        explanation = `The datasets are moderately related with ${Math.round(overlapPercentage)}% column overlap.`;
      } else {
        relationshipType = 'weakly_related';
        explanation = `The datasets appear to be only weakly related with ${Math.round(overlapPercentage)}% column overlap.`;
      }
      
      // Add file type information
      if (sameFileType) {
        explanation += ` Both are ${file1.file_type.toUpperCase()} files.`;
      } else {
        explanation += ` File types differ: ${file1.file_type.toUpperCase()} vs ${file2.file_type.toUpperCase()}.`;
      }
      
      // Add column details
      if (matchingColumns.length > 0) {
        explanation += ` Matching columns include: ${matchingColumns.map(col => col.name).join(', ')}.`;
      }
      
      return {
        relationship_type: relationshipType,
        explanation: explanation,
        matching_columns: matchingColumns.map(col => col.name),
        overlap_percentage: Math.round(overlapPercentage),
        same_file_type: sameFileType
      };
    } catch (error) {
      logger.error('Error generating relationship explanation', { 
        error: error.message,
        fileId1,
        fileId2
      });
      return {
        relationship_type: 'error',
        explanation: `Error analyzing relationship: ${error.message}`
      };
    }
  }
}

// Export with both capitalization formats to avoid DI container issues
module.exports = AIService;
