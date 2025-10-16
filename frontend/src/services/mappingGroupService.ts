import { ApiService } from './apiClient';

export interface MappingGroup {
  group_id: string;
  group_name: string;
  description?: string;
  concurrency_limit: number;
  created_at: string;
  updated_at: string;
  member_count?: number;
}

export interface MappingGroupMember {
  member_id: string;
  group_id: string;
  mapping_id: string;
  execution_order: number;
  created_at: string;
  mapping_name?: string;
}

export interface CreateMappingGroupRequest {
  group_name: string;
  description?: string;
  concurrency_limit?: number;
}

export interface UpdateMappingGroupRequest {
  group_name?: string;
  description?: string;
  concurrency_limit?: number;
}

export interface ExecuteMappingGroupResponse {
  execution_id: string;
  group_id: string;
  status: string;
  started_at: string;
}

const mappingGroupService = {
  getAllMappingGroups: async (): Promise<MappingGroup[]> => {
    try {
      return await ApiService.get<MappingGroup[]>('/mapping-groups');
    } catch (error) {
      console.error('Error fetching mapping groups:', error);
      throw error;
    }
  },

  getMappingGroupById: async (id: string): Promise<MappingGroup> => {
    try {
      return await ApiService.get<MappingGroup>(`/mapping-groups/${id}`);
    } catch (error) {
      console.error(`Error fetching mapping group ${id}:`, error);
      throw error;
    }
  },

  createMappingGroup: async (data: CreateMappingGroupRequest): Promise<MappingGroup> => {
    try {
      return await ApiService.post<MappingGroup>('/mapping-groups', data);
    } catch (error) {
      console.error('Error creating mapping group:', error);
      throw error;
    }
  },

  updateMappingGroup: async (id: string, data: UpdateMappingGroupRequest): Promise<MappingGroup> => {
    try {
      return await ApiService.put<MappingGroup>(`/mapping-groups/${id}`, data);
    } catch (error) {
      console.error(`Error updating mapping group ${id}:`, error);
      throw error;
    }
  },

  deleteMappingGroup: async (id: string): Promise<void> => {
    try {
      await ApiService.delete(`/mapping-groups/${id}`);
    } catch (error) {
      console.error(`Error deleting mapping group ${id}:`, error);
      throw error;
    }
  },

  getGroupMembers: async (groupId: string): Promise<MappingGroupMember[]> => {
    try {
      return await ApiService.get<MappingGroupMember[]>(`/mapping-groups/${groupId}/members`);
    } catch (error) {
      console.error(`Error fetching members for group ${groupId}:`, error);
      throw error;
    }
  },

  addMember: async (groupId: string, mappingId: string, executionOrder: number): Promise<MappingGroupMember> => {
    try {
      return await ApiService.post<MappingGroupMember>(`/mapping-groups/${groupId}/members`, {
        mapping_id: mappingId,
        execution_order: executionOrder
      });
    } catch (error) {
      console.error(`Error adding member to group ${groupId}:`, error);
      throw error;
    }
  },

  removeMember: async (groupId: string, memberId: string): Promise<void> => {
    try {
      await ApiService.delete(`/mapping-groups/${groupId}/members/${memberId}`);
    } catch (error) {
      console.error(`Error removing member ${memberId} from group ${groupId}:`, error);
      throw error;
    }
  },

  executeMappingGroup: async (groupId: string): Promise<ExecuteMappingGroupResponse> => {
    try {
      return await ApiService.post<ExecuteMappingGroupResponse>(`/mapping-groups/${groupId}/execute`);
    } catch (error) {
      console.error(`Error executing mapping group ${groupId}:`, error);
      throw error;
    }
  }
};

export default mappingGroupService;
