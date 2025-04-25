import { ApiService } from './apiClient';
import {
  Transformation,
  CreateTransformationRequest,
  UpdateTransformationRequest
} from '../../../shared/types/transformations';

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
      return await ApiService.get<Transformation[]>('/transformations');
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
      return await ApiService.get<Transformation>(`/transformations/${id}`);
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
      return await ApiService.post<Transformation>('/transformations', data);
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
      return await ApiService.put<Transformation>(`/transformations/${id}`, data);
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
      await ApiService.delete(`/transformations/${id}`);
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
      return await ApiService.post<Transformation>(`/transformations/${id}/execute`);
    } catch (error) {
      console.error(`Error executing transformation ${id}:`, error);
      throw error;
    }
  }
};

export default transformationService;