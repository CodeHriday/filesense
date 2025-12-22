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
const crypto = require('crypto');
const { systemLogger: logger } = require('../utils/logger');

// Use dynamic import for ES modules
let pipeline;
let HF_TOKEN;

// Configure authentication at module level
if (process.env.HUGGING_FACE_TOKEN) {
  HF_TOKEN = process.env.HUGGING_FACE_TOKEN;
  logger.info('Hugging Face token found in environment');
  
  // Set up node-fetch to use in the polyfill
  global.HF_TOKEN = HF_TOKEN;
} else {
  logger.warn('HUGGING_FACE_TOKEN not found in environment variables');
}

// Custom fetch function that adds authentication
const authenticatedFetch = async (url, options = {}) => {
  // Add authentication headers to all requests to huggingface.co
  if (url.includes('huggingface.co') && HF_TOKEN) {
    options.headers = {
      ...options.headers,
      Authorization: `Bearer ${HF_TOKEN}`
    };
  }
  return fetch(url, options);
};

// Patch global fetch for transformers library
const originalFetch = global.fetch;
global.fetch = authenticatedFetch;

(async () => {
  try {
    const transformers = await import('@xenova/transformers');
    pipeline = transformers.pipeline;
    
    // Configure the library to use proper authentication
    transformers.env.allowLocalModels = false;
    transformers.env.useBrowserCache = false;
    
    // Force remote downloads with authentication
    if (HF_TOKEN) {
      // Apply token to all backends
      if (transformers.env.backends && transformers.env.backends.onnx) {
        transformers.env.backends.onnx.httpHeaders = {
          Authorization: `Bearer ${HF_TOKEN}`
        };
      }
      logger.info('Set Hugging Face authentication token for models');
    }
    
    logger.info('Successfully imported @xenova/transformers');
  } catch (error) {
    logger.error('Failed to import @xenova/transformers', { error: error.message });
  }
})();

// Restore original fetch after initialization
setTimeout(() => {
  if (global.fetch === authenticatedFetch) {
    global.fetch = originalFetch;
    logger.info('Restored original fetch after transformers init');
  }
}, 10000); // 10 second timeout to ensure initialization is complete

// Cache for embeddings and model instances with serialization/deserialization handlers
const embeddingCache = new NodeCache({ 
  stdTTL: 3600, 
  checkperiod: 120,
  // Custom serialize/deserialize functions to handle TypedArrays properly
  useClones: false
});

const responseCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

// Helper functions for TypedArray serialization/deserialization
const serializeTypedArray = (arr) => {
  if (arr instanceof Float32Array) {
    return { type: 'Float32Array', values: Array.from(arr) };
  }
  return arr;
};

const deserializeTypedArray = (obj) => {
  if (obj && typeof obj === 'object' && obj.type === 'Float32Array') {
    return new Float32Array(obj.values);
  }
  return obj;
};

// Model configuration
const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';

// Using models that don't require HF Pro access
// Options for smaller LLMs that are publicly available without restrictions
// For text generation, distilgpt2 needs special handling as it's not a chat model but a text completion model
// Using rule-based approach instead of distilgpt2 for better dataset conversations
const CHAT_MODEL = 'rule-based';

// Larger context window size for distilgpt2 to handle our prompts
const MODEL_CONTEXT_SIZE = 512;

class AIService {
  constructor(fileService, dbPool) {
    this.fileService = fileService;
    this.dbPool = dbPool;
    this.embeddingPipeline = null;
    this.chatPipeline = null;
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
      
      // Note: We don't initialize the chat model right away to save resources
      // It will be lazy-loaded when needed
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
        const cachedValue = embeddingCache.get(cacheKey);
        // Ensure we deserialize if needed
        return deserializeTypedArray(cachedValue);
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

      // Extract the embedding from the model output and ensure it's a TypedArray
      let embedding;
      if (result.data) {
        if (result.data instanceof Float32Array) {
          // Already a TypedArray, use directly
          embedding = result.data;
        } else if (typeof result.data === 'object') {
          // Convert from object to Float32Array
          logger.debug('Converting embedding from object to Float32Array');
          const values = Object.values(result.data);
          embedding = new Float32Array(values);
        } else {
          throw new Error('Embedding model returned unexpected data format');
        }
      } else {
        throw new Error('No embedding data returned from model');
      }
      
      // Verify we have a valid embedding
      if (!(embedding instanceof Float32Array)) {
        logger.warn('Embedding is not a Float32Array, converting...', {
          type: typeof embedding,
          isArray: Array.isArray(embedding),
          hasLength: embedding && embedding.length !== undefined
        });
        
        // Make a best effort to convert
        if (Array.isArray(embedding)) {
          embedding = new Float32Array(embedding);
        } else if (embedding && typeof embedding === 'object') {
          embedding = new Float32Array(Object.values(embedding));
        } else {
          throw new Error('Could not convert embedding to Float32Array');
        }
      }
      
      // Cache the result
      embeddingCache.set(cacheKey, serializeTypedArray(embedding));
      
      return embedding;
    } catch (error) {
      logger.error('Error generating embedding', { error: error.message });
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  /**
   * Calculate the cosine similarity between two vectors
   * 
   * @param {Float32Array|Object} vec1 - First vector
   * @param {Float32Array|Object} vec2 - Second vector
   * @returns {number} - Similarity score (0-1)
   */
  calculateSimilarity(vec1, vec2) {
    // Helper function to ensure we're working with array-like objects
    const ensureArrayLike = (vec) => {
      if (!vec) return null;
      
      // If it's already array-like with a length property, use it directly
      if (vec.length !== undefined) return vec;
      
      // If it's an object, convert to array
      if (typeof vec === 'object') {
        return Object.values(vec);
      }
      
      // If we can't handle it, return null
      return null;
    };
    
    // Ensure both vectors are array-like
    const arrayVec1 = ensureArrayLike(vec1);
    const arrayVec2 = ensureArrayLike(vec2);
    
    // Validate vectors
    if (!arrayVec1 || !arrayVec2 || arrayVec1.length !== arrayVec2.length) {
      logger.warn('Invalid vectors for similarity calculation', {
        vec1Type: typeof vec1,
        vec2Type: typeof vec2,
        vec1Length: arrayVec1 ? arrayVec1.length : 'N/A',
        vec2Length: arrayVec2 ? arrayVec2.length : 'N/A'
      });
      return 0;
    }

    try {
      // Calculate dot product
      let dotProduct = 0;
      for (let i = 0; i < arrayVec1.length; i++) {
        dotProduct += arrayVec1[i] * arrayVec2[i];
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
  async findRelatedDatasets(fileId, limit = 5, threshold = 0.5) {
    try {
      // Get the target file details and profile
      const fileDetails = await this.fileService.getFileById(fileId);
      const fileProfile = await this.fileService.getFileProfile(fileId);
      
      if (!fileDetails || !fileProfile) {
        logger.warn('File details or profile not found', { fileId });
        return [];
      }

      // Get all files except the target file
      const allFilesResult = await this.fileService.getAllFiles();
      const allFiles = allFilesResult.files || allFilesResult;
      const otherFiles = allFiles.filter(file => file.file_id !== fileId);
      
      if (otherFiles.length === 0) {
        logger.info('No other files to compare with');
        return [];
      }

      // Generate embedding for the target file
      const targetEmbedding = await this.generateFileEmbedding(fileDetails, fileProfile);
      
      // Calculate similarity with other files
      const similarityResults = [];
      const seenFilenames = new Set(); // Track filenames to avoid duplicates
      
      for (const file of otherFiles) {
        // Skip if we've already seen this filename (prefer the most recent version)
        if (seenFilenames.has(file.filename)) {
          continue;
        }
        
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
          
          // Mark this filename as seen
          seenFilenames.add(file.filename);
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
        const cachedValue = embeddingCache.get(cacheKey);
        // Ensure we deserialize if needed
        return deserializeTypedArray(cachedValue);
      }

      // Create a rich text representation of the file for embedding
      let textRepresentation = '';
      
      // File metadata
      textRepresentation += `Dataset: ${fileDetails.filename}\n`;
      textRepresentation += `Format: ${fileDetails.file_type}\n`;
      textRepresentation += `Size: ${fileDetails.row_count} rows, ${fileDetails.column_count} columns\n`;
      
      // Add quality information if available
      if (fileDetails.quality_score) {
        textRepresentation += `Quality Score: ${fileDetails.quality_score}%\n`;
      }
      
      textRepresentation += '\n';
      
      // Add detailed column information if available
      if (fileProfile && fileProfile.columns) {
        textRepresentation += 'Schema and Statistics:\n';
        fileProfile.columns.forEach((column, index) => {
          textRepresentation += `Column ${index + 1}: ${column.name}\n`;
          textRepresentation += `  Data Type: ${column.type}\n`;
          
          // Add statistical information for better differentiation
          if (column.unique !== undefined) textRepresentation += `  Unique Values: ${column.unique}\n`;
          if (column.missing !== undefined) textRepresentation += `  Missing Values: ${column.missing}\n`;
          if (column.most_frequent_value) textRepresentation += `  Most Frequent: ${column.most_frequent_value}\n`;
          if (column.least_frequent_value) textRepresentation += `  Least Frequent: ${column.least_frequent_value}\n`;
          
          // Add range information for numeric columns
          if (column.min !== null && column.min !== undefined) textRepresentation += `  Min Value: ${column.min}\n`;
          if (column.max !== null && column.max !== undefined) textRepresentation += `  Max Value: ${column.max}\n`;
          
          textRepresentation += '\n';
        });
        
        // Add a summary of column types to help with categorization
        const columnTypes = fileProfile.columns.map(col => col.type);
        const typeFrequency = columnTypes.reduce((acc, type) => {
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {});
        
        textRepresentation += 'Data Types Distribution:\n';
        Object.entries(typeFrequency).forEach(([type, count]) => {
          textRepresentation += `  ${type}: ${count} columns\n`;
        });
      }

      // Generate embedding from rich text representation
      const embedding = await this.generateEmbedding(textRepresentation);
      
      // Cache the embedding (serialize if it's a TypedArray)
      embeddingCache.set(cacheKey, serializeTypedArray(embedding));
      
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
      
      // Get the similarity score to include in the explanation
      const embedding1 = await this.generateFileEmbedding(file1, profile1);
      const embedding2 = await this.generateFileEmbedding(file2, profile2);
      const similarityScore = this.calculateSimilarity(embedding1, embedding2);
      const similarityPercentage = Math.round(similarityScore * 100);
      
      if (overlapPercentage >= 80) {
        relationshipType = 'nearly_identical';
        explanation = `The datasets appear to be nearly identical with ${Math.round(overlapPercentage)}% column structure overlap.`;
      } else if (overlapPercentage >= 50) {
        relationshipType = 'strongly_related';
        explanation = `The datasets are strongly related with ${Math.round(overlapPercentage)}% column structure overlap.`;
      } else if (overlapPercentage >= 30) {
        relationshipType = 'moderately_related';
        explanation = `The datasets are moderately related with ${Math.round(overlapPercentage)}% column structure overlap.`;
      } else {
        relationshipType = 'weakly_related';
        explanation = `The datasets have ${Math.round(overlapPercentage)}% column structure overlap, but show a ${similarityPercentage}% content similarity based on AI analysis.`;
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

  /**
   * Initialize chat model for dataset conversations
   * Lazy-loaded only when needed
   */
  async initializeChatModel() {
    if (this.chatPipeline) {
      return this.chatPipeline;
    }
    
    try {
      if (!pipeline) {
        logger.info('Pipeline not available yet, waiting for transformers module to load...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        return this.initializeChatModel();
      }
      
      logger.info('Initializing chat model...');
      this.chatPipeline = await pipeline('text-generation', CHAT_MODEL);
      logger.info('Chat model initialized successfully');
      return this.chatPipeline;
    } catch (error) {
      logger.error('Failed to initialize chat model', { error: error.message });
      throw new Error(`Failed to initialize chat model: ${error.message}`);
    }
  }
  
  /**
   * Chat with a dataset using intelligent rule-based responses
   * 
   * @param {string} fileId - File ID to chat about
   * @param {string} message - User message
   * @param {Array} chatHistory - Previous chat messages (optional)
   * @returns {Promise<Object>} - AI response
   */
  async chatWithDataset(fileId, message, chatHistory = []) {
    try {
      // Get dataset information
      const fileDetails = await this.fileService.getFileById(fileId);
      const fileProfile = await this.fileService.getFileProfile(fileId);
      
      if (!fileDetails || !fileProfile) {
        logger.warn('File details or profile not found', { fileId });
        return {
          response: 'I don\'t have information about this dataset. Please try another file.',
          error: 'Dataset not found'
        };
      }
      
      // Create a cache key based on the message and file
      const cacheKey = `chat_${fileId}_${Buffer.from(message).toString('base64').substring(0, 40)}`;
      
      // Check if we have a cached response
      if (responseCache.has(cacheKey)) {
        logger.debug('Using cached chat response');
        return responseCache.get(cacheKey);
      }
      
      logger.info('Processing intelligent chat response', { 
        fileId,
        messageLength: message.length
      });
      
      // Use rule-based intelligent response system
      const aiResponse = this.generateIntelligentResponse(message, fileDetails, fileProfile);
      
      // Cache the response
      responseCache.set(cacheKey, { response: aiResponse });
      
      return { response: aiResponse };
    } catch (error) {
      logger.error('Error in chat with dataset', { error: error.message, fileId });
      return {
        response: 'I encountered an error processing your request. Please try again later.',
        error: error.message
      };
    }
  }
  
  /**
   * Generate a context description for the dataset
   * 
   * @param {Object} fileDetails - File details
   * @param {Object} fileProfile - File profile
   * @returns {string} - Dataset context description
   */
  generateDatasetContext(fileDetails, fileProfile) {
    // Create a context description of the dataset to help the model
    let context = `Dataset: ${fileDetails.filename}\n`;
    context += `Type: ${fileDetails.file_type.toUpperCase()}\n`;
    context += `Rows: ${fileDetails.row_count}\n`;
    context += `Columns: ${fileDetails.column_count}\n\n`;
    
    // Basic stats
    if (fileProfile.basic_info) {
      const basicInfo = fileProfile.basic_info;
      context += `Created: ${basicInfo.created_at}\n`;
      context += `Updated: ${basicInfo.updated_at || basicInfo.created_at}\n`;
      context += `Size: ${basicInfo.file_size ? Math.round(basicInfo.file_size / 1024) + ' KB' : 'Unknown'}\n\n`;
    }
    
    // Column information
    if (fileProfile.columns && fileProfile.columns.length > 0) {
      context += 'Column information:\n';
      
      fileProfile.columns.forEach(column => {
        context += `- ${column.name} (${column.type}):\n`;
        
        if (column.unique !== undefined) context += `  * Unique values: ${column.unique}\n`;
        if (column.missing !== undefined) context += `  * Missing values: ${column.missing}\n`;
        
        // Add numeric column stats
        if (column.type === 'integer' || column.type === 'number' || column.type === 'decimal' || column.type === 'float') {
          if (column.min !== undefined) context += `  * Min: ${column.min}\n`;
          if (column.max !== undefined) context += `  * Max: ${column.max}\n`;
          if (column.mean !== undefined) context += `  * Mean: ${column.mean}\n`;
        }
        
        // Add string column stats
        if (column.type === 'string' || column.type === 'text') {
          if (column.most_frequent_value) {
            context += `  * Most frequent: ${column.most_frequent_value} (${column.most_frequent_count || 'unknown'} times)\n`;
          }
        }
      });
    }
    
    return context;
  }
  
  /**
   * Build a prompt for the chat model
   * 
   * @param {string} message - User message
   * @param {string} datasetContext - Dataset context description
   * @param {Array} chatHistory - Previous chat messages
   * @returns {string} - Formatted prompt
   */
  buildChatPrompt(message, datasetContext, chatHistory) {
    // Create a simplified prompt for distilgpt2 - it cannot handle complex instructions
    // like Phi-2 could, so we need to be more straightforward
    
    // Compress the context to fit in smaller context window
    const shortenedContext = this.createCompressedContext(datasetContext);
    
    // Build a simple completion-style prompt rather than a chat-style prompt
    let prompt = `Dataset information: ${shortenedContext}\n\n`;
    
    // Add a simpler instruction to guide the model
    prompt += `Answer this question about the dataset: ${message}\n\n`;
    prompt += `Answer: `;
    
    // Make sure the prompt is not too long for the model's context window
    if (prompt.length > MODEL_CONTEXT_SIZE) {
      // Shorten by removing some dataset context details if needed
      const maxContextLength = MODEL_CONTEXT_SIZE - (message.length + 50);
      const truncatedContext = shortenedContext.substring(0, maxContextLength) + '...';
      
      prompt = `Dataset information: ${truncatedContext}\n\n`;
      prompt += `Answer this question about the dataset: ${message}\n\n`;
      prompt += `Answer: `;
    }
    
    logger.debug('Generated prompt for GPT model', { promptLength: prompt.length });
    return prompt;
  }
  
  /**
   * Create a compressed version of the dataset context for smaller models
   * 
   * @param {string} fullContext - The full dataset context
   * @returns {string} - Shortened context
   */
  createCompressedContext(fullContext) {
    // Split by lines
    const lines = fullContext.split('\n');
    
    // Keep only the most important information
    let compressed = [];
    
    for (const line of lines) {
      // Skip empty lines
      if (!line.trim()) continue;
      
      // Keep important dataset metadata
      if (line.startsWith('Dataset:') || 
          line.startsWith('Type:') || 
          line.startsWith('Rows:') || 
          line.startsWith('Columns:')) {
        compressed.push(line);
      }
      
      // Keep column names but simplify details
      if (line.includes('(') && line.includes(')') && !line.startsWith('  *')) {
        compressed.push(line);
      }
    }
    
    return compressed.join('\n');
  }
  
  /**
   * Extract the AI's response from the generated text
   * 
   * @param {Object|Array|string} result - Result from the model pipeline
   * @param {string} prompt - Original prompt sent to the model
   * @returns {string} - Cleaned AI response
   */
  extractAIResponse(result, prompt) {
    // Log raw response for debugging
    logger.debug('Processing model response', { 
      resultType: typeof result,
      isArray: Array.isArray(result),
      resultKeys: result && typeof result === 'object' ? Object.keys(result) : 'N/A'
    });
    
    let generatedText = '';
    
    // Handle different response formats from distilgpt2
    if (Array.isArray(result) && result.length > 0) {
      // Array format: take the first result
      generatedText = result[0].generated_text || '';
    } else if (result && typeof result === 'object') {
      // Object format: extract generated_text property
      generatedText = result.generated_text || '';
    } else if (typeof result === 'string') {
      // String format: use directly
      generatedText = result;
    }
    
    logger.debug('Extracted generated text', {
      generatedLength: generatedText.length,
      generatedPreview: generatedText.substring(0, 100)
    });
    
    // Check if we have meaningful generated text
    if (!generatedText || generatedText.length === 0) {
      logger.warn('Model returned no meaningful response', {
        result: JSON.stringify(result).substring(0, 200)
      });
      return 'I apologize, but I couldn\'t generate a response. Please try asking in a different way.';
    }
    
    // Since we used return_full_text: false, the result should only contain the generated part
    let response = generatedText.trim();
    
    // If the response somehow still contains the prompt, remove it
    if (response.startsWith(prompt.trim())) {
      response = response.substring(prompt.trim().length).trim();
    }
    
    // Clean up any extra stuff the model might have added
    // For GPT-style models they sometimes continue with conversation markers
    if (response.includes('User:')) {
      response = response.substring(0, response.indexOf('User:')).trim();
    }
    
    // DistilGPT2 often adds weird formatting or continues with repetitive text
    // Look for natural sentence endings
    const sentences = response.split(/[.!?]/);
    if (sentences.length > 1 && sentences[0].length > 10) {
      // Take the first complete sentence
      response = sentences[0].trim() + '.';
    } else {
      // Otherwise limit length to prevent rambling
      const maxLength = 150;
      if (response.length > maxLength) {
        const cutIndex = response.lastIndexOf(' ', maxLength);
        response = response.substring(0, cutIndex > 0 ? cutIndex : maxLength) + '...';
      }
    }
    
    // Check for any common tokens that indicate the model is trying to continue with code or markdown
    const cutoffTokens = ['```', '###', '---', 'python', 'javascript', 'json', '\n\n'];
    for (const token of cutoffTokens) {
      if (response.includes(token)) {
        response = response.substring(0, response.indexOf(token)).trim();
      }
    }
    
    // If we ended up with nothing useful
    if (response.length < 5) {
      logger.warn('Response too short after processing', { response });
      return 'I apologize, but I couldn\'t generate a response. Please try asking in a different way.';
    }
    
    // Add a period at the end if missing
    if (!response.endsWith('.') && !response.endsWith('!') && !response.endsWith('?')) {
      response += '.';
    }
    
    return response;
  }

  /**
   * Generate intelligent responses based on dataset analysis and user questions
   * Uses rule-based logic to provide accurate, contextual answers with conversational tone
   * 
   * @param {string} message - User's question
   * @param {Object} fileDetails - File metadata
   * @param {Object} fileProfile - File profile data
   * @returns {string} - Intelligent response
   */
  generateIntelligentResponse(message, fileDetails, fileProfile) {
    const msg = message.toLowerCase().trim();
    const filename = fileDetails.filename;
    const fileType = fileDetails.file_type.toUpperCase();
    const rowCount = fileDetails.row_count;
    const columnCount = fileDetails.column_count;
    const qualityScore = parseFloat(fileDetails.quality_score || 0);
    const columns = fileProfile.columns || [];

    // Greeting and introduction
    if (msg.includes('hello') || msg.includes('hi') || msg.includes('help')) {
      const greetings = [
        `Hey there! I'm here to help you explore "${filename}". It's a ${fileType} file with ${rowCount} rows and ${columnCount} columns, and I can see it has a quality score of ${qualityScore.toFixed(1)}% - that's pretty good! What would you like to know about your data?`,
        `Hi! I've taken a look at your "${filename}" file, and it looks interesting! With ${rowCount} rows and ${columnCount} columns, there's definitely some good data to explore. What questions do you have about it?`,
        `Hello! I'm your personal data analyst for this session. I can see you've got "${filename}" loaded up - it's a ${fileType} file with ${columnCount} different columns and ${rowCount} records. What would you like to discover about your data?`
      ];
      const randomIndex = crypto.randomInt(0, greetings.length);
      return greetings[randomIndex];
    }

    // File overview questions
    if (msg.includes('how many') && (msg.includes('column') || msg.includes('field'))) {
      const columnNames = columns.map(c => c.name).join(', ');
      return `Great question! Your dataset has ${columnCount} columns in total. Let me list them for you: ${columnNames}. Each of these columns tells us something different about your data - quite a nice variety to work with!`;
    }

    if (msg.includes('how many') && msg.includes('row')) {
      const rowDesc = rowCount > 100 ? 'plenty of data points' : rowCount > 10 ? 'a good amount of data' : 'a few data points';
      return `Your dataset contains ${rowCount} rows of data - that's ${rowDesc} to analyze! Each row represents one complete record, so you have ${rowCount} individual observations to explore.`;
    }

    if (msg.includes('size') || msg.includes('big')) {
      const sizeDesc = rowCount > 10000 ? 'quite large' : rowCount > 1000 ? 'medium-sized' : 'compact';
      const encouragement = rowCount > 1000 ? 'Perfect for detailed analysis!' : 'Great for quick insights!';
      return `This is a ${sizeDesc} dataset with ${rowCount} rows and ${columnCount} columns. The file weighs in at ${fileDetails.file_size} bytes. ${encouragement}`;
    }

    // Data quality questions
    if (msg.includes('quality') || msg.includes('good') || msg.includes('clean')) {
      let qualityDesc = 'excellent';
      let encouragement = "That's fantastic - your data is in great shape for analysis!";
      
      if (qualityScore < 90) {
        qualityDesc = 'pretty good';
        encouragement = "That's solid quality - should work well for most analyses!";
      }
      if (qualityScore < 70) {
        qualityDesc = 'fair';
        encouragement = "There's room for improvement, but it's definitely workable.";
      }
      if (qualityScore < 50) {
        qualityDesc = 'needs some attention';
        encouragement = "You might want to clean this up a bit before diving into analysis.";
      }
      
      const missingData = columns.filter(c => c.missing > 0);
      const missingText = missingData.length > 0 
        ? ` I did notice some missing values in: ${missingData.map(c => `${c.name} (${c.missing} gaps)`).join(', ')}. Nothing too concerning though!`
        : ' The good news is that all your columns are complete - no missing values anywhere!';
      
      return `Looking at your data quality, I'd say it's ${qualityDesc} with a score of ${qualityScore.toFixed(1)}%. ${encouragement}${missingText}`;
    }

    // Column-specific questions
    const mentionedColumn = columns.find(c => 
      msg.includes(c.name.toLowerCase()) || 
      msg.includes(c.name.toLowerCase().replace(/[_\s]/g, ''))
    );
    
    if (mentionedColumn) {
      const col = mentionedColumn;
      const uniquePercent = ((col.unique / rowCount) * 100).toFixed(1);
      
      let response = `Ah, you're asking about the "${col.name}" column! It's a ${col.type} column with ${col.unique} unique values, which means about ${uniquePercent}% of the values are distinct.`;
      
      if (col.missing > 0) {
        response += ` Just a heads up - there are ${col.missing} missing values in this column, so keep that in mind.`;
      } else {
        response += ` The good news is there are no missing values here!`;
      }
      
      if (col.most_frequent_value) {
        response += ` I noticed that "${col.most_frequent_value}" appears most frequently in this column.`;
      }
      
      // Add contextual insights based on uniqueness
      if (uniquePercent > 95) {
        response += ` This looks like it might be an identifier column since almost every value is unique.`;
      } else if (uniquePercent < 10) {
        response += ` This seems to be more of a categorical column with repeated values.`;
      }
      
      return response;
    }

    // Type-specific questions
    if (msg.includes('string') || msg.includes('text')) {
      const stringCols = columns.filter(c => c.type === 'string');
      if (stringCols.length > 0) {
        return `Your dataset has ${stringCols.length} text columns: ${stringCols.map(c => c.name).join(', ')}. These contain categorical or descriptive information.`;
      }
      return 'This dataset doesn\'t appear to have any text columns.';
    }

    if (msg.includes('number') || msg.includes('numeric') || msg.includes('decimal')) {
      const numericCols = columns.filter(c => c.type === 'decimal' || c.type === 'integer');
      if (numericCols.length > 0) {
        return `Your dataset has ${numericCols.length} numeric columns: ${numericCols.map(c => c.name).join(', ')}. These can be used for calculations and statistical analysis.`;
      }
      return 'This dataset doesn\'t appear to have any numeric columns.';
    }

    if (msg.includes('date') || msg.includes('time')) {
      const dateCols = columns.filter(c => c.type === 'date' || c.type === 'datetime');
      if (dateCols.length > 0) {
        return `Your dataset has ${dateCols.length} date/time columns: ${dateCols.map(c => c.name).join(', ')}. These can be used for time-based analysis.`;
      }
      return 'This dataset doesn\'t appear to have any date columns.';
    }

    // Missing data questions
    if (msg.includes('missing') || msg.includes('null') || msg.includes('empty')) {
      const missingCols = columns.filter(c => c.missing > 0);
      if (missingCols.length === 0) {
        return 'Excellent news! I\'ve checked every column and your dataset is completely clean - no missing values anywhere. That\'s pretty rare and means you can dive straight into analysis without worrying about data gaps!';
      }
      
      const totalMissing = missingCols.reduce((sum, col) => sum + col.missing, 0);
      const missingPercent = ((totalMissing / (rowCount * columnCount)) * 100).toFixed(2);
      
      let severity = 'manageable';
      if (missingPercent > 10) severity = 'significant';
      if (missingPercent > 25) severity = 'substantial';
      
      return `I found missing values in ${missingCols.length} of your columns, which represents about ${missingPercent}% of all data points - that's ${severity}. Here's the breakdown: ${missingCols.map(c => `${c.name} has ${c.missing} gaps`).join(', ')}. Depending on your analysis, you might want to consider how to handle these.`;
    }

    // Unique values questions
    if (msg.includes('unique') || msg.includes('distinct')) {
      const highUniqueCols = columns.filter(c => (c.unique / rowCount) > 0.9);
      const lowUniqueCols = columns.filter(c => (c.unique / rowCount) < 0.1);
      
      let response = '';
      if (highUniqueCols.length > 0) {
        response += `Columns with high uniqueness (likely identifiers): ${highUniqueCols.map(c => c.name).join(', ')}. `;
      }
      if (lowUniqueCols.length > 0) {
        response += `Columns with low uniqueness (likely categories): ${lowUniqueCols.map(c => c.name).join(', ')}.`;
      }
      
      return response || 'Most columns have moderate uniqueness, suggesting a good mix of categorical and descriptive data.';
    }

    // Analysis suggestions
    if (msg.includes('analyze') || msg.includes('insight') || msg.includes('pattern')) {
      const suggestions = [];
      
      const numericCols = columns.filter(c => c.type === 'decimal' || c.type === 'integer');
      if (numericCols.length > 0) {
        suggestions.push(`statistical analysis on ${numericCols.map(c => c.name).join(', ')}`);
      }
      
      const dateCols = columns.filter(c => c.type === 'date');
      if (dateCols.length > 0) {
        suggestions.push(`time-based trends using ${dateCols.map(c => c.name).join(', ')}`);
      }
      
      const categoricalCols = columns.filter(c => c.type === 'string' && (c.unique / rowCount) < 0.5);
      if (categoricalCols.length > 0) {
        suggestions.push(`category distribution analysis on ${categoricalCols.map(c => c.name).join(', ')}`);
      }
      
      if (suggestions.length > 0) {
        return `Based on your data structure, I suggest exploring: ${suggestions.join('; ')}. Your data quality score of ${qualityScore.toFixed(1)}% indicates it's ready for analysis.`;
      }
      
      return `With ${rowCount} rows and ${columnCount} columns, this dataset offers good analytical potential. Consider exploring relationships between different columns.`;
    }

    // Default response with helpful suggestions - make it more conversational
    const columnNames = columns.slice(0, 3).map(c => c.name).join(', ');
    const moreColumns = columns.length > 3 ? ` and ${columns.length - 3} more` : '';
    
    const responses = [
      `I'm here to help you explore this ${fileType} dataset! It has ${rowCount} rows with interesting columns like ${columnNames}${moreColumns}. What would you like to know? I can tell you about data quality, dive into specific columns, check for missing values, or suggest some analysis ideas.`,
      `Interesting question! While I was thinking about that, let me tell you what I can see in your data. This ${fileType} file has ${rowCount} rows and includes columns like ${columnNames}${moreColumns}. Feel free to ask me about any specific aspect - I'm here to help!`,
      `I'd love to help you with that! Your dataset looks quite interesting with ${rowCount} rows and columns including ${columnNames}${moreColumns}. What specifically would you like to explore? I can discuss data quality, column analysis, patterns, or suggest some insights to look for.`
    ];
    
    const randomIndex = crypto.randomInt(0, responses.length);
    return responses[randomIndex];
  }
}

// Export with both capitalization formats to avoid DI container issues
module.exports = AIService;
