/**
 * Project Tree Sidebar - Collapsible tree navigation for projects
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  FolderIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import { projectsService } from "@/services/projects";
import { useDemoProject } from "@/hooks/useDemoProject";
import type { Project } from "@/types";

interface ProjectTreeSidebarProps {
  teamId?: string;  // Optional - if not provided, shows all projects
  onCreateProject?: () => void;
  className?: string;
}

const STORAGE_KEY = "projectTreeSidebar";

interface SidebarState {
  isCollapsed: boolean;
  expandedIds: string[];
}

function loadSidebarState(): SidebarState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // Ignore parse errors
  }
  return { isCollapsed: false, expandedIds: [] };
}

function saveSidebarState(state: SidebarState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

// Tree item component with lazy loading
function TreeItem({
  project,
  expandedIds,
  onToggleExpand,
  depth = 0,
}: {
  project: Project;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  depth?: number;
}) {
  const navigate = useNavigate();
  const isExpanded = expandedIds.has(project.id);
  const hasChildren = project.has_children ?? false;

  // Fetch children only when expanded
  const { data: children } = useQuery({
    queryKey: ["project", project.id, "children"],
    queryFn: () => projectsService.getChildren(project.id),
    enabled: isExpanded && hasChildren,
  });

  return (
    <>
      <div
        className={clsx(
          "flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors",
          "hover:bg-gray-100 dark:hover:bg-dark-elevated/50"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => navigate(`/projects/${project.id}`)}
      >
        {/* Expand/collapse button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) {
              onToggleExpand(project.id);
            }
          }}
          className={clsx(
            "flex h-5 w-5 items-center justify-center rounded text-gray-400",
            hasChildren && "hover:text-gray-600 dark:hover:text-gray-300"
          )}
          disabled={!hasChildren}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDownIcon className="h-3.5 w-3.5" />
            ) : (
              <ChevronRightIcon className="h-3.5 w-3.5" />
            )
          ) : (
            <span className="w-3.5" />
          )}
        </button>

        {/* Project icon with color and optional emoji */}
        <div
          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded"
          style={{ backgroundColor: project.color || "#6366f1" }}
        >
          {project.emoji ? (
            <span className="text-xs">{project.emoji}</span>
          ) : (
            <FolderIcon className="h-3 w-3 text-white" />
          )}
        </div>

        {/* Project name */}
        <span className="flex-1 truncate text-sm text-gray-700 dark:text-gray-300">
          {project.name}
        </span>

        {/* Task count badge */}
        {project.task_count !== undefined && project.task_count > 0 && (
          <span className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500">
            {project.task_count}
          </span>
        )}
      </div>

      {/* Render children if expanded */}
      {isExpanded && children && children.length > 0 && (
        <div>
          {children.map((child) => (
            <TreeItem
              key={child.id}
              project={child}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </>
  );
}

export default function ProjectTreeSidebar({
  teamId,
  onCreateProject,
  className = "",
}: ProjectTreeSidebarProps) {
  const [sidebarState, setSidebarState] = useState<SidebarState>(loadSidebarState);
  // Memoize the Set to avoid recreating on every render
  const expandedIds = useMemo(() => new Set(sidebarState.expandedIds), [sidebarState.expandedIds]);
  const { filterDemoProjects } = useDemoProject();

  // Save state to localStorage when it changes
  useEffect(() => {
    saveSidebarState(sidebarState);
  }, [sidebarState]);

  // Fetch top-level projects (all projects if no teamId provided)
  const { data: rawTopLevelProjects, isLoading } = useQuery({
    queryKey: ["projects", teamId || "all", "top-level"],
    queryFn: async () => {
      const response = await projectsService.list({
        team_id: teamId || undefined,  // Don't filter by team if not provided
        top_level_only: true,
        page_size: 100,
      });
      return response.items;
    },
  });

  // Filter out hidden demo projects
  const topLevelProjects = useMemo(() => {
    if (!rawTopLevelProjects) return undefined;
    return filterDemoProjects(rawTopLevelProjects);
  }, [rawTopLevelProjects, filterDemoProjects]);

  const toggleCollapsed = () => {
    setSidebarState((prev) => ({
      ...prev,
      isCollapsed: !prev.isCollapsed,
    }));
  };

  const toggleExpand = useCallback((id: string) => {
    setSidebarState((prev) => {
      const newExpandedIds = new Set(prev.expandedIds);
      if (newExpandedIds.has(id)) {
        newExpandedIds.delete(id);
      } else {
        newExpandedIds.add(id);
      }
      return {
        ...prev,
        expandedIds: Array.from(newExpandedIds),
      };
    });
  }, []);

  // Collapsed state - show only icons
  if (sidebarState.isCollapsed) {
    return (
      <div
        className={clsx(
          "flex flex-col border-r border-gray-200 bg-gray-50 dark:border-dark-border dark:bg-dark-base",
          className
        )}
        style={{ width: "48px" }}
      >
        <div className="flex items-center justify-center py-3">
          <button
            onClick={toggleCollapsed}
            className="rounded p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-dark-elevated dark:hover:text-gray-300"
            title="Expand sidebar"
          >
            <ChevronDoubleRightIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {topLevelProjects?.map((project) => (
            <a
              key={project.id}
              href={`/projects/${project.id}`}
              className="mb-1 flex h-8 w-8 items-center justify-center rounded"
              style={{ backgroundColor: project.color || "#6366f1" }}
              title={project.name}
            >
              {project.emoji ? (
                <span className="text-sm">{project.emoji}</span>
              ) : (
                <FolderIcon className="h-4 w-4 text-white" />
              )}
            </a>
          ))}
        </div>
      </div>
    );
  }

  // Expanded state - full tree
  return (
    <div
      className={clsx(
        "flex flex-col border-r border-gray-200 bg-gray-50 dark:border-dark-border dark:bg-dark-base",
        className
      )}
      style={{ width: "250px" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-dark-border">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Projects
        </span>
        <button
          onClick={toggleCollapsed}
          className="rounded p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-dark-elevated dark:hover:text-gray-300"
          title="Collapse sidebar"
        >
          <ChevronDoubleLeftIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Tree content */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-primary-600" />
          </div>
        ) : topLevelProjects && topLevelProjects.length > 0 ? (
          <div className="space-y-0.5">
            {topLevelProjects.map((project) => (
              <TreeItem
                key={project.id}
                project={project}
                expandedIds={expandedIds}
                onToggleExpand={toggleExpand}
              />
            ))}
          </div>
        ) : (
          <div className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
            No projects yet
          </div>
        )}
      </div>

      {/* Footer with create button */}
      {onCreateProject && (
        <div className="border-t border-gray-200 px-3 py-2 dark:border-dark-border">
          <button
            onClick={onCreateProject}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-gradient-to-br from-primary-500 to-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:from-primary-600 hover:to-primary-700 transition-all"
          >
            <PlusIcon className="h-4 w-4" />
            New Project
          </button>
        </div>
      )}
    </div>
  );
}
