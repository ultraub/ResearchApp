/**
 * HierarchicalProjectList - Main container for hierarchical project list view
 */

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderIcon } from "@heroicons/react/24/outline";
import { projectsService } from "@/services/projects";
import { analyticsApi } from "@/services/analytics";
import { useOrganizationStore } from "@/stores/organization";
import HierarchicalProjectRow from "./HierarchicalProjectRow";

/** Attention info for a project (blockers and comments) */
export interface ProjectAttentionInfo {
  activeBlockerCount: number;
  criticalBlockerCount: number;
  maxBlockerImpact: string | null;
  unreadCommentCount: number;
  totalCommentCount: number;
}

const STORAGE_KEY = "hierarchicalProjectList";

interface HierarchicalProjectListProps {
  statusFilter?: string;
  searchQuery?: string;
  onCreateProject?: () => void;
}

function loadExpandedIds(): string[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // Ignore parse errors
  }
  return [];
}

function saveExpandedIds(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Ignore storage errors
  }
}

export default function HierarchicalProjectList({
  statusFilter,
  searchQuery,
  onCreateProject,
}: HierarchicalProjectListProps) {
  const { organization } = useOrganizationStore();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(loadExpandedIds())
  );

  // Save expanded state when it changes
  useEffect(() => {
    saveExpandedIds(Array.from(expandedIds));
  }, [expandedIds]);

  // Fetch top-level projects only
  const { data, isLoading, error } = useQuery({
    queryKey: ["projects", { top_level_only: true, status: statusFilter, search: searchQuery }],
    queryFn: () =>
      projectsService.list({
        top_level_only: true,
        status: statusFilter || undefined,
        search: searchQuery || undefined,
        page_size: 50,
      }),
  });

  // Fetch analytics for blocker/comment counts
  const { data: analytics } = useQuery({
    queryKey: ["dashboard-analytics", organization?.id],
    queryFn: () => analyticsApi.getDashboard(organization!.id),
    enabled: !!organization?.id,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Create lookup map for project attention info
  const attentionMap = useMemo(() => {
    const map: Record<string, ProjectAttentionInfo> = {};
    if (analytics?.project_progress) {
      for (const project of analytics.project_progress) {
        map[project.project_id] = {
          activeBlockerCount: project.active_blocker_count,
          criticalBlockerCount: project.critical_blocker_count,
          maxBlockerImpact: project.max_blocker_impact,
          unreadCommentCount: project.unread_comment_count,
          totalCommentCount: project.total_comment_count,
        };
      }
    }
    return map;
  }, [analytics]);

  const projects = data?.items || [];

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Expand all / collapse all helpers
  const expandAll = () => {
    const allIds = projects.filter((p) => p.has_children).map((p) => p.id);
    setExpandedIds(new Set(allIds));
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  if (isLoading) {
    return (
      <div className="rounded-xl bg-white shadow-soft dark:bg-dark-card p-8">
        <div className="flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-white shadow-soft dark:bg-dark-card p-8 text-center">
        <p className="text-red-500">Failed to load projects</p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-xl bg-white p-12 text-center shadow-soft dark:bg-dark-card">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-dark-elevated">
          <FolderIcon className="h-8 w-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          No projects yet
        </h3>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          Create your first project to start organizing your research
        </p>
        {onCreateProject && (
          <button
            onClick={onCreateProject}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 px-6 py-3 text-sm font-medium text-white hover:from-primary-600 hover:to-primary-700 transition-all shadow-soft"
          >
            Create Your First Project
          </button>
        )}
      </div>
    );
  }

  const hasExpandableProjects = projects.some((p) => p.has_children);

  return (
    <div className="rounded-xl bg-white shadow-soft dark:bg-dark-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-dark-base border-b border-gray-200 dark:border-dark-border">
        <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Project
        </span>
        {hasExpandableProjects && (
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={expandAll}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Expand all
            </button>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <button
              onClick={collapseAll}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Collapse all
            </button>
          </div>
        )}
      </div>

      {/* Project rows */}
      <div className="divide-y divide-gray-100 dark:divide-dark-border/50">
        {projects.map((project) => (
          <HierarchicalProjectRow
            key={project.id}
            project={project}
            depth={0}
            expandedIds={expandedIds}
            onToggleExpand={toggleExpand}
            attentionInfo={attentionMap[project.id]}
            attentionMap={attentionMap}
          />
        ))}
      </div>
    </div>
  );
}
