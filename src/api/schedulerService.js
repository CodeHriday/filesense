import { API_BASE_URL } from '../config';
import axios from 'axios';

/**
 * Fetch all schedule entries
 * @returns {Promise<Array>} List of schedule entries
 */
export const getSchedules = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/schedules`);
    return response.data.schedules || [];
  } catch (error) {
    console.error('Error fetching schedules:', error);
    throw error;
  }
};

/**
 * Create a new schedule
 * @param {Object} scheduleData Schedule data to create
 * @returns {Promise<Object>} Created schedule
 */
export const createSchedule = async (scheduleData) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/schedules`, scheduleData);
    return response.data.schedule;
  } catch (error) {
    console.error('Error creating schedule:', error);
    throw error;
  }
};

/**
 * Update an existing schedule
 * @param {string} scheduleId Schedule ID to update
 * @param {Object} scheduleData Updated schedule data
 * @returns {Promise<Object>} Updated schedule
 */
export const updateSchedule = async (scheduleId, scheduleData) => {
  try {
    const response = await axios.patch(`${API_BASE_URL}/api/schedules/${scheduleId}`, scheduleData);
    return response.data.schedule;
  } catch (error) {
    console.error('Error updating schedule:', error);
    throw error;
  }
};

/**
 * Delete a schedule
 * @param {string} scheduleId Schedule ID to delete
 * @returns {Promise<boolean>} Success status
 */
export const deleteSchedule = async (scheduleId) => {
  try {
    await axios.delete(`${API_BASE_URL}/api/schedules/${scheduleId}`);
    return true;
  } catch (error) {
    console.error('Error deleting schedule:', error);
    throw error;
  }
};

/**
 * Run a schedule immediately
 * @param {string} scheduleId Schedule ID to run
 * @returns {Promise<Object>} Job info
 */
export const runScheduleNow = async (scheduleId) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/schedules/${scheduleId}/run`);
    return response.data.job;
  } catch (error) {
    console.error('Error running schedule:', error);
    throw error;
  }
};