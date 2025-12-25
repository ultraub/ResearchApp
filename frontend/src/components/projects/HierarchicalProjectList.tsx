/**
 * HierarchicalProjectList - Main container for hierarchical project list view
 * Now groups projects by team with clear visual separation
 */

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderIcon, UserIcon, UserGroupIcon, ShareIcon } from "@heroicons/react/24/outline";
import { projectsService } from "@/services/projects";
import { teamsService } from "@/services/teams";
import { analyticsApi } from "@/services/analytics";
import { useOrganizationStore } from "@/stores/organization";
import { useDemoProject } from "@/hooks/useDemoProject";
import HierarchicalProjectRow from "./HierarchicalProjectRow";
import type { Project, TeamDetail } from "@/types";

/** Attention info for a project (blockers and comments) */
export interface ProjectAttentionInfo {
  activeBlockerCount: number;
  criticalBlockerCount: number;
  maxBlockerImpact: string | null;
  unreadCommentCount: number;
  totalCommentCount: number;
}

interface TeamGroup {
  id: string;
  title: string;
  isPersonal?: boolean;
  isShared?: boolean;
  projects: Project[];
}

const STORAGE_KEY = "hierarchicalProjectList";

interface HierarchicalProjectListProps {
  statusFilter?: string;
  searchQuery?: string;
  onCreateProject?: () => void;
  /** If true, only show tasks assigned to the current user */
  showOnlyMyTasks?: boolean;
  /** Filter projects to a specific team */
  teamFilter?: string;
  /** Filter tasks to a specific person (user_id) or "unassigned" */
  personFilter?: string;
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
  showOnlyMyTasks = false,
  teamFilter,
  personFilter,
}: HierarchicalProjectListProps) {
  const { organization } = useOrganizationStore();
  const { filterDemoProjects } = useDemoProject();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    // Start with saved expanded state or empty set
    const saved = loadExpandedIds();
    return new Set(saved);
  });
  const [hasInitializedExpanded, setHasInitializedExpanded] = useState(false);

  // Save expanded state when it changes
  useEffect(() => {
    if (hasInitializedExpanded) {
      saveExpandedIds(Array.from(expandedIds));
    }
  }, [expandedIds, hasInitializedExpanded]);

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

  // Fetch teams for grouping
  const { data: teamsData } = useQuery({
    queryKey: ["teams", { include_personal: true }],
    queryFn: () => teamsService.list({ include_personal: true }),
  });

  // Fetch analytics for blocker/comment counts
  const { data: analytics } = useQuery({
    queryKey: ["dashboard-analytics", organization?.id],
    queryFn: () => analyticsApi.getDashboard(organization!.id),
    enabled: !!organization?.id,
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

  const allProjects = data?.items || [];
  const teams = teamsData?.items || [];

  // Filter projects by team and demo visibility
  const projects = useMemo(() => {
    let filtered = filterDemoProjects(allProjects);
    if (teamFilter) {
      filtered = filtered.filter(project => project.team_id === teamFilter);
    }
    return filtered;
  }, [allProjects, teamFilter, filterDemoProjects]);

  // Group projects by team
  const teamGroups = useMemo((): TeamGroup[] => {
    const teamMap = new Map<string, TeamDetail>();
    for (const team of teams) {
      teamMap.set(team.id, team);
    }

    const groupMap = new Map<string, Project[]>();
    const sharedProjects: Project[] = [];

    for (const project of projects) {
      const teamId = project.team_id;
      const userHasTeam = teamMap.has(teamId);

      // If user doesn't have access to this team but can see the project (org-public),
      // put it in the shared group
      if (!userHasTeam && project.is_org_public) {
        sharedProjects.push(project);
      } else {
        if (!groupMap.has(teamId)) {
          groupMap.set(teamId, []);
        }
        groupMap.get(teamId)!.push(project);
      }
    }

    const result: TeamGroup[] = [];

    // Sort: Personal team first, then alphabetically
    const sortedTeamIds = Array.from(groupMap.keys()).sort((a, b) => {
      const teamA = teamMap.get(a);
      const teamB = teamMap.get(b);
      if (teamA?.is_personal && !teamB?.is_personal) return -1;
      if (!teamA?.is_personal && teamB?.is_personal) return 1;
      const nameA = teamA?.name || "Unknown";
      const nameB = teamB?.name || "Unknown";
      return nameA.localeCompare(nameB);
    });

    for (const teamId of sortedTeamIds) {
      const team = teamMap.get(teamId);
      const teamProjects = groupMap.get(teamId) || [];

      result.push({
        id: teamId,
        title: team?.is_personal ? "Personal" : team?.name || "Unknown Team",
        isPersonal: team?.is_personal,
        projects: teamProjects,
      });
    }

    // Add shared projects group at the end if there are any
    if (sharedProjects.length > 0) {
      result.push({
        id: "shared-org",
        title: "Shared with Organization",
        isPersonal: false,
        isShared: true,
        projects: sharedProjects,
      });
    }

    return result;
  }, [projects, teams]);

  // Default to all projects expanded on first load (if no saved state)
  useEffect(() => {
    if (projects.length > 0 && !hasInitializedExpanded) {
      const savedIds = loadExpandedIds();
      // If no saved state, expand all projects with children by default
      if (savedIds.length === 0) {
        const allExpandableIds = projects.filter((p) => p.has_children).map((p) => p.id);
        setExpandedIds(new Set(allExpandableIds));
      }
      setHasInitializedExpanded(true);
    }
  }, [projects, hasInitializedExpanded]);

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
    <div className="space-y-4">
      {/* Header with expand/collapse controls */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Projects by Team
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

      {/* Team Groups */}
      {teamGroups.map((group) => (
        <TeamSection
          key={group.id}
          group={group}
          expandedIds={expandedIds}
          onToggleExpand={toggleExpand}
          attentionMap={attentionMap}
          showOnlyMyTasks={showOnlyMyTasks}
          personFilter={personFilter}
        />
      ))}
    </div>
  );
}

/**
 * TeamSection - A section containing projects for a single team
 */
interface TeamSectionProps {
  group: TeamGroup;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  attentionMap: Record<string, ProjectAttentionInfo>;
  showOnlyMyTasks: boolean;
  personFilter?: string;
}

function TeamSection({
  group,
  expandedIds,
  onToggleExpand,
  attentionMap,
  showOnlyMyTasks,
  personFilter,
}: TeamSectionProps) {
  const Icon = group.isShared ? ShareIcon : group.isPersonal ? UserIcon : UserGroupIcon;

  return (
    <div className="rounded-xl bg-white shadow-soft dark:bg-dark-card overflow-hidden">
      {/* Team Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-dark-base border-b border-gray-200 dark:border-dark-border">
        <Icon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
        <span className="font-medium text-gray-900 dark:text-white">
          {group.title}
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          ({group.projects.length} project{group.projects.length !== 1 ? "s" : ""})
        </span>
      </div>

      {/* Projects */}
      <div className="p-3 space-y-3">
        {group.projects.map((project) => (
          <HierarchicalProjectRow
            key={project.id}
            project={project}
            depth={0}
            expandedIds={expandedIds}
            onToggleExpand={onToggleExpand}
            attentionInfo={attentionMap[project.id]}
            attentionMap={attentionMap}
            showOnlyMyTasks={showOnlyMyTasks}
            personFilter={personFilter}
            showTeamBadge={group.isShared}
          />
        ))}
      </div>
    </div>
  );
}
