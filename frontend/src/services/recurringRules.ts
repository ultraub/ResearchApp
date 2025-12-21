import { apiClient } from "@/lib/api-client";
import type {
  RecurringTaskRule,
  RecurringTaskRuleCreate,
  RecurringTaskRuleUpdate,
  Task
} from "@/types";

export const recurringRulesService = {
  /**
   * List all recurring task rules for a project
   */
  list: async (projectId: string, activeOnly: boolean = true): Promise<RecurringTaskRule[]> => {
    const response = await apiClient.get<RecurringTaskRule[]>(
      `/projects/${projectId}/recurring-rules`,
      { params: { active_only: activeOnly } }
    );
    return response.data;
  },

  /**
   * Get a specific recurring task rule
   */
  get: async (projectId: string, ruleId: string): Promise<RecurringTaskRule> => {
    const response = await apiClient.get<RecurringTaskRule>(
      `/projects/${projectId}/recurring-rules/${ruleId}`
    );
    return response.data;
  },

  /**
   * Create a new recurring task rule
   */
  create: async (projectId: string, data: RecurringTaskRuleCreate): Promise<RecurringTaskRule> => {
    const response = await apiClient.post<RecurringTaskRule>(
      `/projects/${projectId}/recurring-rules`,
      data
    );
    return response.data;
  },

  /**
   * Update a recurring task rule
   */
  update: async (
    projectId: string,
    ruleId: string,
    data: RecurringTaskRuleUpdate
  ): Promise<RecurringTaskRule> => {
    const response = await apiClient.patch<RecurringTaskRule>(
      `/projects/${projectId}/recurring-rules/${ruleId}`,
      data
    );
    return response.data;
  },

  /**
   * Delete a recurring task rule
   */
  delete: async (projectId: string, ruleId: string): Promise<void> => {
    await apiClient.delete(`/projects/${projectId}/recurring-rules/${ruleId}`);
  },

  /**
   * Manually trigger a recurring task rule to create a task now
   */
  trigger: async (projectId: string, ruleId: string): Promise<Task> => {
    const response = await apiClient.post<Task>(
      `/projects/${projectId}/recurring-rules/${ruleId}/trigger`
    );
    return response.data;
  },

  /**
   * Toggle the active status of a rule
   */
  toggleActive: async (
    projectId: string,
    ruleId: string,
    isActive: boolean
  ): Promise<RecurringTaskRule> => {
    return recurringRulesService.update(projectId, ruleId, { is_active: isActive });
  },
};
