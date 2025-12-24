/**
 * GroupedProjectList - Projects organized into collapsible groups
 *
 * Features:
 * - Groups projects by Team (default), Status, or Priority
 * - Mobile: Accordion mode (one group open at a time)
 * - Desktop: All groups can be open simultaneously
 * - Uses existing CollapsibleSection infrastructure
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderIcon } from "@heroicons/react/24/outline";
import { CollapsibleSectionGroup } from "@/components/ui/CollapsibleSection";
import { ProjectGroup } from "./ProjectGroup";
import { projectsService } from "@/services/projects";
import { teamsService } from "@/services/teams";
import { analyticsApi } from "@/services/analytics";
import { useOrganizationStore } from "@/stores/organization";
import { useDemoProject } from "@/hooks/useDemoProject";
import type { Project, TeamDetail } from "@/types";
import type { ProjectAttentionInfo } from "./HierarchicalProjectList";

export type GroupByOption = "team" | "status" | "priority";

interface GroupedProjectListProps {
  /** How to group projects */
  groupBy?: GroupByOption;
  /** Status filter */
  statusFilter?: string;
  /** Search query */
  searchQuery?: string;
  /** Team filter (when groupBy is not "team") */
  teamFilter?: string;
  /** If true, only show tasks assigned to the current user */
  showOnlyMyTasks?: boolean;
  /** Person filter */
  personFilter?: string;
  /** Callback for creating a new project */
  onCreateProject?: () => void;
  /** Whether to use accordion mode (mobile) */
  accordionMode?: boolean;
}

interface ProjectGroup {
  id: string;
  title: string;
  isPersonal?: boolean;
  isShared?: boolean;
  projects: Project[];
}

const STATUS_ORDER = ["active", "on_hold", "completed", "archived"];
const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  on_hold: "On Hold",
  completed: "Completed",
  archived: "Archived",
};

const PRIORITY_ORDER = ["urgent", "high", "medium", "low"];
const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgent",
  high: "High Priority",
  medium: "Medium Priority",
  low: "Low Priority",
};

export function GroupedProjectList({
  groupBy = "team",
  statusFilter,
  searchQuery,
  teamFilter,
  showOnlyMyTasks: _showOnlyMyTasks = false,
  personFilter: _personFilter,
  onCreateProject,
  accordionMode = false,
}: GroupedProjectListProps) {
  // Note: showOnlyMyTasks and personFilter are accepted for API compatibility
  // but filtering is handled differently in grouped view (future enhancement)
  const { organization } = useOrganizationStore();
  const { filterDemoProjects } = useDemoProject();

  // Fetch all projects
  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ["projects", { status: statusFilter, search: searchQuery }],
    queryFn: () =>
      projectsService.list({
        status: statusFilter || undefined,
        search: searchQuery || undefined,
        page_size: 100,
      }),
  });

  // Fetch teams for grouping
  const { data: teamsData } = useQuery({
    queryKey: ["teams", { include_personal: true }],
    queryFn: () => teamsService.list({ include_personal: true }),
    enabled: groupBy === "team",
  });

  // Fetch analytics for attention info
  const { data: analytics } = useQuery({
    queryKey: ["dashboard-analytics", organization?.id],
    queryFn: () => analyticsApi.getDashboard(organization!.id),
    enabled: !!organization?.id,
    staleTime: 30000,
  });

  // Create attention map
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

  const allProjects = projectsData?.items || [];
  const teams = teamsData?.items || [];

  // Filter projects by demo visibility and team filter
  const filteredProjects = useMemo(() => {
    let filtered = filterDemoProjects(allProjects);
    if (teamFilter) {
      filtered = filtered.filter((project) => project.team_id === teamFilter);
    }
    return filtered;
  }, [allProjects, teamFilter, filterDemoProjects]);

  // Group projects based on groupBy option
  const groups = useMemo((): ProjectGroup[] => {
    if (groupBy === "team") {
      return groupByTeam(filteredProjects, teams);
    } else if (groupBy === "status") {
      return groupByStatus(filteredProjects);
    } else if (groupBy === "priority") {
      return groupByPriority(filteredProjects);
    }
    return [];
  }, [filteredProjects, teams, groupBy]);

  if (projectsLoading) {
    return (
      <div className="rounded-xl bg-white shadow-soft dark:bg-dark-card p-8">
        <div className="flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
        </div>
      </div>
    );
  }

  if (filteredProjects.length === 0) {
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

  const content = (
    <div className="space-y-4">
      {groups.map((group, index) => (
        <ProjectGroup
          key={group.id}
          id={group.id}
          title={group.title}
          isPersonal={group.isPersonal}
          isShared={group.isShared}
          projects={group.projects}
          attentionMap={attentionMap}
          defaultOpen={index === 0} // First group open by default
          storageKey={`grouped-project-${group.id}`}
        />
      ))}
    </div>
  );

  // Wrap in accordion context for mobile
  if (accordionMode) {
    return <CollapsibleSectionGroup>{content}</CollapsibleSectionGroup>;
  }

  return content;
}

/**
 * Group projects by team
 * Org-public projects from teams the user doesn't belong to go into "Shared with Organization"
 */
function groupByTeam(
  projects: Project[],
  teams: TeamDetail[]
): ProjectGroup[] {
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

  const result: ProjectGroup[] = [];

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
}

/**
 * Group projects by status
 */
function groupByStatus(projects: Project[]): ProjectGroup[] {
  const groupMap = new Map<string, Project[]>();

  for (const project of projects) {
    const status = project.status;
    if (!groupMap.has(status)) {
      groupMap.set(status, []);
    }
    groupMap.get(status)!.push(project);
  }

  return STATUS_ORDER.filter((status) => groupMap.has(status)).map(
    (status) => ({
      id: status,
      title: STATUS_LABELS[status] || status,
      projects: groupMap.get(status) || [],
    })
  );
}

/**
 * Group projects by priority
 */
function groupByPriority(projects: Project[]): ProjectGroup[] {
  const groupMap = new Map<string, Project[]>();

  for (const project of projects) {
    const priority = project.priority || "medium";
    if (!groupMap.has(priority)) {
      groupMap.set(priority, []);
    }
    groupMap.get(priority)!.push(project);
  }

  return PRIORITY_ORDER.filter((priority) => groupMap.has(priority)).map(
    (priority) => ({
      id: priority,
      title: PRIORITY_LABELS[priority] || priority,
      projects: groupMap.get(priority) || [],
    })
  );
}

export default GroupedProjectList;
