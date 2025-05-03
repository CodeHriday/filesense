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
const CHAT_MODEL = 'Xenova/distilgpt2';

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
        const cachedValue = embeddingCache.get(cacheKey);
        // Ensure we deserialize if needed
        return deserializeTypedArray(cachedValue);
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
   * Chat with a dataset using natural language
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
      
      // Generate context about the dataset to help the model
      const datasetContext = this.generateDatasetContext(fileDetails, fileProfile);
      
      // Create a cache key based on the message and file
      const cacheKey = `chat_${fileId}_${Buffer.from(message).toString('base64').substring(0, 40)}`;
      
      // Check if we have a cached response
      if (responseCache.has(cacheKey)) {
        logger.debug('Using cached chat response');
        return responseCache.get(cacheKey);
      }
      
      // Initialize chat model if needed
      if (!this.chatPipeline) {
        await this.initializeChatModel();
      }
      
      // Prepare the prompt with context and chat history
      const prompt = this.buildChatPrompt(message, datasetContext, chatHistory);
      
      // Log what we're about to send to the model
      logger.info('Sending prompt to language model', { 
        modelName: CHAT_MODEL,
        promptLength: prompt.length
      });
      
      // Generate response with parameters optimized for distilgpt2
      // Note: distilgpt2 model has different parameters than Phi-2
      const result = await this.chatPipeline(prompt, {
        max_new_tokens: 100,       // Shorter responses for more coherence
        temperature: 0.5,          // Lower temperature for more focused output
        repetition_penalty: 1.5,   // Higher penalty to prevent repetition 
        top_k: 50,                // Limit vocabulary to top 50 options at each step
        top_p: 0.9,                // Sample from top 90% of probability mass
        do_sample: true            // Use sampling instead of greedy decoding
      });
      
      // Log raw result for debugging
      logger.debug('Raw model result received', {
        textLength: result.generated_text ? result.generated_text.length : 0
      });
      
      // Process the response
      const aiResponse = this.extractAIResponse(result.generated_text, prompt);
      
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
   * @param {string} generatedText - Full generated text from the model
   * @param {string} prompt - Original prompt sent to the model
   * @returns {string} - Cleaned AI response
   */
  extractAIResponse(generatedText, prompt) {
    // Log raw response for debugging
    logger.debug('Raw model response', { 
      responseLength: generatedText ? generatedText.length : 0,
      promptLength: prompt.length
    });
    
    // Extract only the model's response (removing the prompt)
    if (!generatedText || generatedText === prompt || generatedText.length <= prompt.length) {
      logger.warn('Model returned no meaningful response', {
        generatedText: generatedText ? generatedText.substring(0, 50) + '...' : 'undefined'
      });
      return 'I apologize, but I couldn\'t generate a response. Please try asking in a different way.';
    }
    
    // Remove the prompt to get just the model's completion
    let response = generatedText.substring(prompt.length).trim();
    
    // Clean up any extra stuff the model might have added
    // For GPT-style models they sometimes continue with conversation markers
    if (response.includes('User:')) {
      response = response.substring(0, response.indexOf('User:')).trim();
    }
    
    // DistilGPT2 often adds weird formatting or continues with repetitive text, cut at periods
    const firstSentenceEnd = response.indexOf('.');
    if (firstSentenceEnd > 20) { // Only if we have a reasonably long first sentence
      response = response.substring(0, firstSentenceEnd + 1).trim();
    } else {
      // Otherwise try to find a reasonable cutoff
      const maxLength = 100;
      if (response.length > maxLength) {
        response = response.substring(0, maxLength) + '...';
      }
    }
    
    // Check for any common tokens that indicate the model is trying to continue with code or markdown
    const cutoffTokens = ['```', '###', '---', '```python', '```javascript', '```json'];
    for (const token of cutoffTokens) {
      if (response.includes(token)) {
        response = response.substring(0, response.indexOf(token)).trim();
      }
    }
    
    // If we ended up with nothing useful
    if (response.length < 5) {
      return 'I apologize, but I couldn\'t generate a response. Please try asking in a different way.';
    }
    
    // Add a period at the end if missing
    if (!response.endsWith('.') && !response.endsWith('!') && !response.endsWith('?')) {
      response += '.';
    }
    
    return response;
  }
}

// Export with both capitalization formats to avoid DI container issues
module.exports = AIService;
