import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  PlusIcon,
  FolderIcon,
  MagnifyingGlassIcon,
  Squares2X2Icon,
  ListBulletIcon,
  CalendarIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ChatBubbleLeftIcon,
} from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import { CreateProjectModal } from "@/components/projects/CreateProjectModal";
import ProjectTreeSidebar from "@/components/projects/ProjectTreeSidebar";
import HierarchicalProjectList, { type ProjectAttentionInfo } from "@/components/projects/HierarchicalProjectList";
import { TeamBadge } from "@/components/projects/TeamBadge";
import { ProjectBreadcrumb } from "@/components/projects/ProjectBreadcrumb";
import { projectsService } from "@/services/projects";
import { analyticsApi } from "@/services/analytics";
import { useOrganizationStore } from "@/stores/organization";
import type { Project } from "@/types";

type ViewMode = "grid" | "list";

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  completed: "bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-400",
  on_hold: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  archived: "bg-gray-100 text-gray-800 dark:bg-dark-elevated dark:text-gray-400",
};

function ProjectCard({
  project,
  onClick,
  attentionInfo,
}: {
  project: Project;
  onClick: () => void;
  attentionInfo?: ProjectAttentionInfo;
}) {
  return (
    <div
      onClick={onClick}
      className="cursor-pointer rounded-xl bg-white p-5 shadow-card transition-all hover:shadow-card dark:bg-dark-card"
    >
      {/* Hierarchy breadcrumb */}
      <ProjectBreadcrumb project={project} className="mb-2" />

      <div className="mb-3 flex items-start justify-between">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0"
          style={{ backgroundColor: project.color || "#6366f1" }}
        >
          <FolderIcon className="h-5 w-5 text-white" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {project.has_children && (
            <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
              {project.children_count} sub
            </span>
          )}
          {/* Blocker indicator */}
          {attentionInfo && attentionInfo.activeBlockerCount > 0 && (
            <span
              className={clsx(
                "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
                attentionInfo.criticalBlockerCount > 0
                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
              )}
              title={`${attentionInfo.activeBlockerCount} blocker${attentionInfo.activeBlockerCount !== 1 ? "s" : ""}`}
            >
              <ExclamationTriangleIcon className="h-3 w-3" />
              {attentionInfo.activeBlockerCount}
            </span>
          )}
          {/* Comment indicator */}
          {attentionInfo && attentionInfo.unreadCommentCount > 0 && (
            <span
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400"
              title={`${attentionInfo.unreadCommentCount} unread comment${attentionInfo.unreadCommentCount !== 1 ? "s" : ""}`}
            >
              <ChatBubbleLeftIcon className="h-3 w-3" />
              {attentionInfo.unreadCommentCount}
            </span>
          )}
          <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusColors[project.status] || statusColors.active}`}>
            {project.status}
          </span>
          <TeamBadge
            teamName={project.team_name}
            isPersonal={project.team_is_personal}
          />
        </div>
      </div>

      <h3 className="mb-1 font-semibold text-gray-900 dark:text-white">{project.name}</h3>
      <p className="mb-3 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
        {project.description || "No description"}
      </p>
      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        {project.target_end_date && (
          <span className="flex items-center gap-1">
            <CalendarIcon className="h-3.5 w-3.5" />
            {new Date(project.target_end_date).toLocaleDateString()}
          </span>
        )}
        <span className="flex items-center gap-1">
          <CheckCircleIcon className="h-3.5 w-3.5" />
          {project.task_count || 0} tasks
        </span>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { organization } = useOrganizationStore();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Auto-open create modal when navigating with ?create=true
  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setIsCreateModalOpen(true);
      // Remove the query param after opening
      searchParams.delete('create');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Fetch projects for grid view (list view uses HierarchicalProjectList which fetches its own data)
  const { data, isLoading } = useQuery({
    queryKey: ["projects", { status: statusFilter, search: searchQuery, include_ancestors: true }],
    queryFn: () =>
      projectsService.list({
        status: statusFilter || undefined,
        search: searchQuery || undefined,
        include_ancestors: true,
        page_size: 50,
      }),
    enabled: viewMode === "grid", // Only fetch when in grid mode
  });

  // Fetch analytics for blocker/comment counts (grid view)
  const { data: analytics } = useQuery({
    queryKey: ["dashboard-analytics", organization?.id],
    queryFn: () => analyticsApi.getDashboard(organization!.id),
    enabled: !!organization?.id && viewMode === "grid",
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

  const handleProjectCreated = (projectId: string) => {
    navigate(`/projects/${projectId}`);
  };

  return (
    <div className="flex h-full">
      {/* Tree Navigation Sidebar */}
      <ProjectTreeSidebar
        onCreateProject={() => setIsCreateModalOpen(true)}
        className="flex-shrink-0"
      />

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Projects
            </h1>
            <p className="mt-1 text-gray-600 dark:text-gray-400">
              Manage your research projects
            </p>
          </div>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            <PlusIcon className="h-4 w-4" />
            New Project
          </button>
        </div>

        {/* Filters and search */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-md flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm placeholder-gray-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-dark-border dark:bg-dark-elevated dark:text-white"
            >
              <option value="">All Projects</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="on_hold">On Hold</option>
              <option value="archived">Archived</option>
            </select>

            <div className="flex rounded-lg border border-gray-200 dark:border-dark-border">
              <button
                onClick={() => setViewMode("grid")}
                title="Grid view"
                className={`p-2 ${
                  viewMode === "grid"
                    ? "bg-gray-100 text-gray-900 dark:bg-dark-elevated dark:text-white"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                }`}
              >
                <Squares2X2Icon className="h-5 w-5" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                title="List view"
                className={`p-2 ${
                  viewMode === "list"
                    ? "bg-gray-100 text-gray-900 dark:bg-dark-elevated dark:text-white"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                }`}
              >
                <ListBulletIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        {viewMode === "list" ? (
          <HierarchicalProjectList
            statusFilter={statusFilter}
            searchQuery={searchQuery}
            onCreateProject={() => setIsCreateModalOpen(true)}
          />
        ) : isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
          </div>
        ) : projects.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={() => navigate(`/projects/${project.id}`)}
                attentionInfo={attentionMap[project.id]}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl bg-white p-12 text-center shadow-card dark:bg-dark-card">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-dark-elevated">
              <FolderIcon className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              No projects yet
            </h3>
            <p className="mt-2 text-gray-500 dark:text-gray-400">
              Create your first project to start organizing your research
            </p>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-3 text-sm font-medium text-white hover:bg-primary-700"
            >
              <PlusIcon className="h-5 w-5" />
              Create Your First Project
            </button>
          </div>
        )}

        {/* Create Project Modal */}
        <CreateProjectModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={handleProjectCreated}
        />
      </div>
    </div>
  );
}
