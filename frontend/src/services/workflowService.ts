import { ApiService } from './apiClient';

export interface WorkflowStep {
  step_id: string;
  workflow_name: string;
  step_name: string;
  step_type: 'transformation' | 'mapping_group';
  step_order: number;
  entity_id: string;
  depends_on?: string[];
  retry_attempts?: number;
  execution_mode?: 'parallel' | 'sequential';
  created_at: string;
  updated_at: string;
}

export interface CreateWorkflowStepRequest {
  workflow_name: string;
  step_name: string;
  step_type: 'transformation' | 'mapping_group';
  step_order: number;
  entity_id: string;
  depends_on?: string[];
  retry_attempts?: number;
  execution_mode?: 'parallel' | 'sequential';
}

export interface UpdateWorkflowStepRequest {
  step_name?: string;
  step_order?: number;
  depends_on?: string[];
  retry_attempts?: number;
  execution_mode?: 'parallel' | 'sequential';
}

export interface ExecuteWorkflowResponse {
  execution_id: string;
  workflow_name: string;
  status: string;
  started_at: string;
}

const workflowService = {
  getAllWorkflows: async (): Promise<string[]> => {
    try {
      const steps = await ApiService.get<WorkflowStep[]>('/workflow-steps');
      const workflows = [...new Set(steps.map(s => s.workflow_name))];
      return workflows;
    } catch (error) {
      console.error('Error fetching workflows:', error);
      throw error;
    }
  },

  getWorkflowSteps: async (workflowName: string): Promise<WorkflowStep[]> => {
    try {
      return await ApiService.get<WorkflowStep[]>(`/workflow-steps?workflow_name=${workflowName}`);
    } catch (error) {
      console.error(`Error fetching workflow steps for ${workflowName}:`, error);
      throw error;
    }
  },

  getAllSteps: async (): Promise<WorkflowStep[]> => {
    try {
      return await ApiService.get<WorkflowStep[]>('/workflow-steps');
    } catch (error) {
      console.error('Error fetching all workflow steps:', error);
      throw error;
    }
  },

  getStepById: async (stepId: string): Promise<WorkflowStep> => {
    try {
      return await ApiService.get<WorkflowStep>(`/workflow-steps/${stepId}`);
    } catch (error) {
      console.error(`Error fetching workflow step ${stepId}:`, error);
      throw error;
    }
  },

  createWorkflowStep: async (data: CreateWorkflowStepRequest): Promise<WorkflowStep> => {
    try {
      return await ApiService.post<WorkflowStep>('/workflow-steps', data);
    } catch (error) {
      console.error('Error creating workflow step:', error);
      throw error;
    }
  },

  updateWorkflowStep: async (stepId: string, data: UpdateWorkflowStepRequest): Promise<WorkflowStep> => {
    try {
      return await ApiService.put<WorkflowStep>(`/workflow-steps/${stepId}`, data);
    } catch (error) {
      console.error(`Error updating workflow step ${stepId}:`, error);
      throw error;
    }
  },

  deleteWorkflowStep: async (stepId: string): Promise<void> => {
    try {
      await ApiService.delete(`/workflow-steps/${stepId}`);
    } catch (error) {
      console.error(`Error deleting workflow step ${stepId}:`, error);
      throw error;
    }
  },

  executeWorkflow: async (workflowName: string): Promise<ExecuteWorkflowResponse> => {
    try {
      return await ApiService.post<ExecuteWorkflowResponse>(`/workflow-steps/${workflowName}/execute`);
    } catch (error) {
      console.error(`Error executing workflow ${workflowName}:`, error);
      throw error;
    }
  }
};

export default workflowService;
