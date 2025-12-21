import { apiClient } from "@/lib/api-client";
import type {
  CustomField,
  CustomFieldCreate,
  CustomFieldUpdate,
  CustomFieldValue,
  CustomFieldValueSet
} from "@/types";

export const customFieldsService = {
  // =========================================================================
  // Project Custom Field Management
  // =========================================================================

  /**
   * List all custom fields for a project
   */
  list: async (
    projectId: string,
    activeOnly: boolean = true,
    appliesTo?: string
  ): Promise<CustomField[]> => {
    const params: Record<string, unknown> = { active_only: activeOnly };
    if (appliesTo) {
      params.applies_to = appliesTo;
    }
    const response = await apiClient.get<CustomField[]>(
      `/projects/${projectId}/custom-fields`,
      { params }
    );
    return response.data;
  },

  /**
   * Get a specific custom field
   */
  get: async (projectId: string, fieldId: string): Promise<CustomField> => {
    const response = await apiClient.get<CustomField>(
      `/projects/${projectId}/custom-fields/${fieldId}`
    );
    return response.data;
  },

  /**
   * Create a new custom field for a project
   */
  create: async (projectId: string, data: CustomFieldCreate): Promise<CustomField> => {
    const response = await apiClient.post<CustomField>(
      `/projects/${projectId}/custom-fields`,
      data
    );
    return response.data;
  },

  /**
   * Update a custom field
   */
  update: async (
    projectId: string,
    fieldId: string,
    data: CustomFieldUpdate
  ): Promise<CustomField> => {
    const response = await apiClient.patch<CustomField>(
      `/projects/${projectId}/custom-fields/${fieldId}`,
      data
    );
    return response.data;
  },

  /**
   * Delete a custom field and all its values
   */
  delete: async (projectId: string, fieldId: string): Promise<void> => {
    await apiClient.delete(`/projects/${projectId}/custom-fields/${fieldId}`);
  },

  /**
   * Reorder custom fields for a project
   */
  reorder: async (projectId: string, fieldOrder: string[]): Promise<CustomField[]> => {
    const response = await apiClient.post<CustomField[]>(
      `/projects/${projectId}/custom-fields/reorder`,
      { field_order: fieldOrder }
    );
    return response.data;
  },

  // =========================================================================
  // Task Custom Field Values
  // =========================================================================

  /**
   * Get all custom field values for a task
   */
  getTaskValues: async (taskId: string): Promise<CustomFieldValue[]> => {
    const response = await apiClient.get<CustomFieldValue[]>(
      `/tasks/${taskId}/custom-fields`
    );
    return response.data;
  },

  /**
   * Set a single custom field value for a task
   */
  setTaskValue: async (
    taskId: string,
    fieldId: string,
    value: unknown
  ): Promise<CustomFieldValue> => {
    const response = await apiClient.put<CustomFieldValue>(
      `/tasks/${taskId}/custom-fields/${fieldId}`,
      { field_id: fieldId, value }
    );
    return response.data;
  },

  /**
   * Set multiple custom field values for a task
   */
  setTaskValues: async (
    taskId: string,
    values: CustomFieldValueSet[]
  ): Promise<CustomFieldValue[]> => {
    const response = await apiClient.put<CustomFieldValue[]>(
      `/tasks/${taskId}/custom-fields`,
      { values }
    );
    return response.data;
  },

  /**
   * Delete a custom field value for a task
   */
  deleteTaskValue: async (taskId: string, fieldId: string): Promise<void> => {
    await apiClient.delete(`/tasks/${taskId}/custom-fields/${fieldId}`);
  },

  // =========================================================================
  // Helpers
  // =========================================================================

  /**
   * Extract the actual value from a CustomFieldValue
   */
  extractValue: (fieldValue: CustomFieldValue): unknown => {
    if (!fieldValue.value) return null;
    return fieldValue.value.value;
  },

  /**
   * Get field display value as string
   */
  getDisplayValue: (fieldValue: CustomFieldValue): string => {
    const value = customFieldsService.extractValue(fieldValue);
    if (value === null || value === undefined) return "";

    switch (fieldValue.field_type) {
      case "checkbox":
        return value ? "Yes" : "No";
      case "multi_select":
        return Array.isArray(value) ? value.join(", ") : String(value);
      case "date":
        return value ? new Date(value as string).toLocaleDateString() : "";
      default:
        return String(value);
    }
  },
};
