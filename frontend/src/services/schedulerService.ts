import { ApiService } from './apiClient';

export interface Schedule {
  schedule_id: string;
  entity_type: 'transformation' | 'mapping_group' | 'workflow';
  entity_id: string;
  schedule_type: 'cron' | 'interval';
  cron_expression?: string;
  interval_value?: number;
  interval_unit?: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
  enabled: boolean;
  last_run?: string;
  next_run?: string;
  created_at: string;
  updated_at: string;
  entity_name?: string;
}

export interface CreateScheduleRequest {
  entity_type: 'transformation' | 'mapping_group' | 'workflow';
  entity_id: string;
  schedule_type: 'cron' | 'interval';
  cron_expression?: string;
  interval_value?: number;
  interval_unit?: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
  enabled?: boolean;
}

export interface UpdateScheduleRequest {
  schedule_type?: 'cron' | 'interval';
  cron_expression?: string;
  interval_value?: number;
  interval_unit?: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
  enabled?: boolean;
}

const schedulerService = {
  getAllSchedules: async (): Promise<Schedule[]> => {
    try {
      return await ApiService.get<Schedule[]>('/schedules');
    } catch (error) {
      console.error('Error fetching schedules:', error);
      throw error;
    }
  },

  getScheduleById: async (id: string): Promise<Schedule> => {
    try {
      return await ApiService.get<Schedule>(`/schedules/${id}`);
    } catch (error) {
      console.error(`Error fetching schedule ${id}:`, error);
      throw error;
    }
  },

  getSchedulesByEntity: async (entityType: string, entityId: string): Promise<Schedule[]> => {
    try {
      return await ApiService.get<Schedule[]>(`/schedules?entity_type=${entityType}&entity_id=${entityId}`);
    } catch (error) {
      console.error(`Error fetching schedules for ${entityType} ${entityId}:`, error);
      throw error;
    }
  },

  createSchedule: async (data: CreateScheduleRequest): Promise<Schedule> => {
    try {
      return await ApiService.post<Schedule>('/schedules', data);
    } catch (error) {
      console.error('Error creating schedule:', error);
      throw error;
    }
  },

  updateSchedule: async (id: string, data: UpdateScheduleRequest): Promise<Schedule> => {
    try {
      return await ApiService.put<Schedule>(`/schedules/${id}`, data);
    } catch (error) {
      console.error(`Error updating schedule ${id}:`, error);
      throw error;
    }
  },

  deleteSchedule: async (id: string): Promise<void> => {
    try {
      await ApiService.delete(`/schedules/${id}`);
    } catch (error) {
      console.error(`Error deleting schedule ${id}:`, error);
      throw error;
    }
  },

  toggleSchedule: async (id: string, enabled: boolean): Promise<Schedule> => {
    try {
      return await ApiService.put<Schedule>(`/schedules/${id}`, { enabled });
    } catch (error) {
      console.error(`Error toggling schedule ${id}:`, error);
      throw error;
    }
  }
};

export default schedulerService;
