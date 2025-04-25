import axios from 'axios';
import {
  Transformation,
  CreateTransformationRequest,
  UpdateTransformationRequest
} from '../../../shared/types/transformations';

// API base URL will be replaced with imported config
const API_BASE_URL = '/api';

/**
 * Transformation service for API interactions
 */
const transformationService = {
  /**
   * Get all transformations
   * @returns Promise with transformations array
   */
  getAllTransformations: async (): Promise<Transformation[]> => {
    try {
      const response = await axios.get(`${API_BASE_URL}/transformations`);
      return response.data;
    } catch (error) {
      console.error('Error fetching transformations:', error);
      throw error;
    }
  },

  /**
   * Get a transformation by ID
   * @param id Transformation ID
   * @returns Promise with transformation
   */
  getTransformationById: async (id: string): Promise<Transformation> => {
    try {
      const response = await axios.get(`${API_BASE_URL}/transformations/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching transformation ${id}:`, error);
      throw error;
    }
  },

  /**
   * Create a new transformation
   * @param data Transformation data
   * @returns Promise with created transformation
   */
  createTransformation: async (data: CreateTransformationRequest): Promise<Transformation> => {
    try {
      const response = await axios.post(`${API_BASE_URL}/transformations`, data);
      return response.data;
    } catch (error) {
      console.error('Error creating transformation:', error);
      throw error;
    }
  },

  /**
   * Update an existing transformation
   * @param id Transformation ID
   * @param data Updated transformation data
   * @returns Promise with updated transformation
   */
  updateTransformation: async (id: string, data: UpdateTransformationRequest): Promise<Transformation> => {
    try {
      const response = await axios.put(`${API_BASE_URL}/transformations/${id}`, data);
      return response.data;
    } catch (error) {
      console.error(`Error updating transformation ${id}:`, error);
      throw error;
    }
  },

  /**
   * Delete a transformation
   * @param id Transformation ID
   * @returns Promise with success status
   */
  deleteTransformation: async (id: string): Promise<void> => {
    try {
      await axios.delete(`${API_BASE_URL}/transformations/${id}`);
    } catch (error) {
      console.error(`Error deleting transformation ${id}:`, error);
      throw error;
    }
  },

  /**
   * Execute a transformation
   * @param id Transformation ID
   * @returns Promise with updated transformation
   */
  executeTransformation: async (id: string): Promise<Transformation> => {
    try {
      const response = await axios.post(`${API_BASE_URL}/transformations/${id}/execute`);
      return response.data;
    } catch (error) {
      console.error(`Error executing transformation ${id}:`, error);
      throw error;
    }
  }
};

export default transformationService;