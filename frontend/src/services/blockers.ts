import { apiClient, fetchPaginated, fetchOne, createOne, updateOne, deleteOne } from "@/lib/api-client";
import type {
  Blocker,
  BlockerLink,
  BlockerCreate,
  BlockerUpdate,
  BlockerLinkCreate,
  BlockerListParams,
  BlockerListResponse,
} from "@/types";

export interface BlockerWithLinks extends Blocker {
  links?: BlockerLink[];
}

export const blockersService = {
  /**
   * List blockers with optional filters.
   */
  list: async (params: BlockerListParams = {}): Promise<BlockerListResponse> => {
    return fetchPaginated<Blocker>("/blockers", params as Record<string, unknown>);
  },

  /**
   * Get a single blocker by ID.
   */
  get: async (id: string): Promise<Blocker> => {
    return fetchOne<Blocker>(`/blockers/${id}`);
  },

  /**
   * Create a new blocker.
   */
  create: async (data: BlockerCreate): Promise<Blocker> => {
    return createOne<Blocker>("/blockers", data);
  },

  /**
   * Update an existing blocker.
   */
  update: async (id: string, data: BlockerUpdate): Promise<Blocker> => {
    return updateOne<Blocker>(`/blockers/${id}`, data);
  },

  /**
   * Delete a blocker.
   */
  delete: async (id: string): Promise<void> => {
    return deleteOne(`/blockers/${id}`);
  },

  // ==========================================================================
  // Blocker Links
  // ==========================================================================

  /**
   * Get all links for a blocker (tasks/projects it blocks).
   */
  getLinks: async (blockerId: string): Promise<BlockerLink[]> => {
    const response = await apiClient.get<BlockerLink[]>(`/blockers/${blockerId}/links`);
    return response.data || [];
  },

  /**
   * Link a blocker to a task or project.
   */
  linkToEntity: async (blockerId: string, data: BlockerLinkCreate): Promise<BlockerLink> => {
    const response = await apiClient.post<BlockerLink>(`/blockers/${blockerId}/links`, data);
    return response.data;
  },

  /**
   * Remove a link from a blocker.
   */
  unlinkEntity: async (blockerId: string, linkId: string): Promise<void> => {
    await apiClient.delete(`/blockers/${blockerId}/links/${linkId}`);
  },

  // ==========================================================================
  // Convenience Methods (Entity-Centric)
  // ==========================================================================

  /**
   * Get all blockers that are blocking a specific task.
   * Uses the convenience endpoint on tasks router.
   */
  getForTask: async (taskId: string, activeOnly: boolean = true): Promise<Blocker[]> => {
    const response = await apiClient.get<Blocker[]>(`/tasks/${taskId}/blockers`, {
      params: { active_only: activeOnly },
    });
    return response.data || [];
  },

  /**
   * Get all blockers in a specific project.
   * Uses the convenience endpoint on projects router.
   */
  getForProject: async (projectId: string, activeOnly: boolean = true): Promise<Blocker[]> => {
    const response = await apiClient.get<Blocker[]>(`/projects/${projectId}/blockers`, {
      params: { active_only: activeOnly },
    });
    return response.data || [];
  },

  /**
   * Get active blockers for a task (shorthand for checking if task is blocked).
   * Returns only blockers with status "open" or "in_progress".
   */
  getActiveForTask: async (taskId: string): Promise<Blocker[]> => {
    return blockersService.getForTask(taskId, true);
  },

  /**
   * Check if a task has any active blockers.
   */
  isTaskBlocked: async (taskId: string): Promise<boolean> => {
    const blockers = await blockersService.getActiveForTask(taskId);
    return blockers.length > 0;
  },

  /**
   * Check if a project has any active blockers.
   */
  isProjectBlocked: async (projectId: string): Promise<boolean> => {
    const blockers = await blockersService.getForProject(projectId, true);
    return blockers.length > 0;
  },

  // ==========================================================================
  // Bulk Operations
  // ==========================================================================

  /**
   * Resolve a blocker (set status to 'resolved').
   */
  resolve: async (id: string, resolutionType: "resolved" | "wont_fix" | "deferred" | "duplicate" = "resolved"): Promise<Blocker> => {
    return blockersService.update(id, {
      status: resolutionType === "wont_fix" ? "wont_fix" : "resolved",
      resolution_type: resolutionType,
    });
  },

  /**
   * Reopen a resolved blocker.
   */
  reopen: async (id: string): Promise<Blocker> => {
    return blockersService.update(id, {
      status: "open",
      resolution_type: null,
    });
  },

  /**
   * Get blockers that directly block a project entity (not tasks within it).
   * Returns blockers where this project is linked as a blocked item.
   */
  getBlockersBlockingProject: async (
    projectId: string,
    activeOnly: boolean = true
  ): Promise<Blocker[]> => {
    // Get all blockers for the project
    const blockers = await blockersService.getForProject(projectId, activeOnly);

    // Filter to those that have a link to this project as a blocked entity
    const blockersWithLinks = await Promise.all(
      blockers.map(async (blocker) => {
        const links = await blockersService.getLinks(blocker.id);
        const blocksThisProject = links.some(
          (link) => link.blocked_entity_type === "project" && link.blocked_entity_id === projectId
        );
        return blocksThisProject ? blocker : null;
      })
    );

    return blockersWithLinks.filter((b): b is Blocker => b !== null);
  },

  /**
   * Get blocker info for all tasks in a project.
   * Returns a map of task_id -> { isBlocked, maxImpact, blockerCount }
   */
  getTaskBlockerInfo: async (
    projectId: string
  ): Promise<Record<string, { isBlocked: boolean; maxImpact: "low" | "medium" | "high" | "critical" | null; blockerCount: number }>> => {
    // Get all active blockers for the project
    const blockers = await blockersService.getForProject(projectId, true);

    // Build map of task ID -> blocker info
    const taskBlockerMap: Record<string, { blockers: Blocker[] }> = {};

    // Fetch links for each blocker and aggregate by task
    await Promise.all(
      blockers.map(async (blocker) => {
        const links = await blockersService.getLinks(blocker.id);
        (links || [])
          .filter((link) => link.blocked_entity_type === "task")
          .forEach((link) => {
            if (!taskBlockerMap[link.blocked_entity_id]) {
              taskBlockerMap[link.blocked_entity_id] = { blockers: [] };
            }
            taskBlockerMap[link.blocked_entity_id].blockers.push(blocker);
          });
      })
    );

    // Convert to TaskBlockerInfo format
    const impactPriority: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    const result: Record<string, { isBlocked: boolean; maxImpact: "low" | "medium" | "high" | "critical" | null; blockerCount: number }> = {};

    for (const [taskId, data] of Object.entries(taskBlockerMap)) {
      const maxImpact = data.blockers.reduce((max, blocker) => {
        const current = blocker.impact_level;
        if (!max || impactPriority[current] > impactPriority[max]) {
          return current as "low" | "medium" | "high" | "critical";
        }
        return max;
      }, null as "low" | "medium" | "high" | "critical" | null);

      result[taskId] = {
        isBlocked: true,
        maxImpact,
        blockerCount: data.blockers.length,
      };
    }

    return result;
  },
};
