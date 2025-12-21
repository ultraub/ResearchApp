import { useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  ArrowLeftIcon,
  PlusIcon,
  Squares2X2Icon,
  ListBulletIcon,
  UserGroupIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  ClockIcon,
  ChevronRightIcon,
  BookOpenIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import { projectsService } from "@/services/projects";
import { tasksService } from "@/services/tasks";
import { blockersService } from "@/services/blockers";
import { getProjectTaskUnreadCounts } from "@/services/commentReads";
import KanbanBoard from "@/components/tasks/KanbanBoard";
import TaskCard from "@/components/tasks/TaskCard";
import TaskDetailModal from "@/components/tasks/TaskDetailModal";
import { CreateProjectModal } from "@/components/projects/CreateProjectModal";
import ProjectHierarchyPanel from "@/components/projects/ProjectHierarchyPanel";
import { ProjectMembersModal } from "@/components/projects/ProjectMembersModal";
import { ProjectSettingsModal } from "@/components/projects/ProjectSettingsModal";
import { ProjectPapersSection } from "@/components/knowledge/ProjectPapersSection";
import { JournalEntryList, JournalEntryModal } from "@/components/journals";
import { BlockerList, CreateBlockerModal } from "@/components/blockers";
import { DocumentList, CreateDocumentModal } from "@/components/documents";
import { useOrganizationStore } from "@/stores/organization";
import type { Task, Project, JournalEntry } from "@/types";

type ViewMode = "kanban" | "list";
type TabType = "tasks" | "documents" | "papers" | "notebook" | "blockers" | "timeline";

const statusColors = {
  active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  completed: "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400",
  on_hold: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  archived: "bg-gray-100 text-gray-600 dark:bg-dark-elevated dark:text-gray-400",
};

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { organization } = useOrganizationStore();
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [activeTab, setActiveTab] = useState<TabType>("tasks");
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [isCreateSubprojectOpen, setIsCreateSubprojectOpen] = useState(false);
  const [newTaskStatus, setNewTaskStatus] = useState<string>("todo");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [includeChildTasks, setIncludeChildTasks] = useState(false);

  // Journal state
  const [isJournalModalOpen, setIsJournalModalOpen] = useState(false);
  const [selectedJournalEntryId, setSelectedJournalEntryId] = useState<string | null>(null);

  // Members and Settings modal state
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Blocker modal state
  const [isCreateBlockerOpen, setIsCreateBlockerOpen] = useState(false);

  // Document modal state
  const [isCreateDocumentOpen, setIsCreateDocumentOpen] = useState(false);

  const queryClient = useQueryClient();

  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projectsService.get(projectId!),
    enabled: !!projectId,
  });

  // Fetch ancestor chain for breadcrumbs
  const { data: ancestors } = useQuery({
    queryKey: ["project", projectId, "ancestors"],
    queryFn: () => projectsService.getAncestors(projectId!),
    enabled: !!projectId,
  });

  // Fetch children (subprojects)
  const { data: children } = useQuery({
    queryKey: ["project", projectId, "children"],
    queryFn: () => projectsService.getChildren(projectId!),
    enabled: !!projectId,
  });

  // Determine if we should show child aggregation option
  const hasChildren = children && children.length > 0;

  const { data: tasksByStatus, isLoading: tasksLoading } = useQuery({
    queryKey: ["tasks", projectId, "by-status", includeChildTasks],
    queryFn: () => hasChildren && includeChildTasks
      ? tasksService.getByStatusAggregated(projectId!, true)
      : tasksService.getByStatus(projectId!),
    enabled: !!projectId,
  });

  // Fetch blocker info for all tasks in the project
  const { data: taskBlockers } = useQuery({
    queryKey: ["task-blockers", projectId],
    queryFn: () => blockersService.getTaskBlockerInfo(projectId!),
    enabled: !!projectId,
  });

  // Fetch unread comment counts for all tasks in the project
  const { data: taskUnreadCountsRaw } = useQuery({
    queryKey: ["task-unread-counts", projectId],
    queryFn: () => getProjectTaskUnreadCounts(projectId!),
    enabled: !!projectId,
    staleTime: 30000, // Consider fresh for 30 seconds
  });

  // Transform to TaskUnreadInfo format for TaskCard
  const taskUnreadInfo = useMemo(() => {
    if (!taskUnreadCountsRaw) return undefined;
    const result: Record<string, { totalComments: number; unreadCount: number }> = {};
    for (const [taskId, info] of Object.entries(taskUnreadCountsRaw)) {
      result[taskId] = {
        totalComments: info.total_comments,
        unreadCount: info.unread_count,
      };
    }
    return result;
  }, [taskUnreadCountsRaw]);

  // Fetch blockers that directly block this project
  const { data: projectBlockers } = useQuery({
    queryKey: ["project-blockers", projectId],
    queryFn: () => blockersService.getBlockersBlockingProject(projectId!),
    enabled: !!projectId,
  });

  // Fetch blocker info for subprojects
  const { data: subprojectBlockers } = useQuery({
    queryKey: ["subproject-blockers", projectId],
    queryFn: async () => {
      if (!children || children.length === 0) return {};
      const blockerMap: Record<string, { isBlocked: boolean; blockerCount: number; maxImpact: string | null }> = {};
      await Promise.all(
        children.map(async (child) => {
          const blockers = await blockersService.getBlockersBlockingProject(child.id);
          if (blockers.length > 0) {
            const impactPriority: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
            const maxImpact = blockers.reduce((max, b) => {
              if (!max || impactPriority[b.impact_level] > impactPriority[max]) {
                return b.impact_level;
              }
              return max;
            }, null as string | null);
            blockerMap[child.id] = { isBlocked: true, blockerCount: blockers.length, maxImpact };
          }
        })
      );
      return blockerMap;
    },
    enabled: !!projectId && !!children && children.length > 0,
  });

  const createTaskMutation = useMutation({
    mutationFn: tasksService.create,
    onSuccess: () => {
      toast.success("Task created");
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
      setNewTaskTitle("");
      setIsCreateTaskOpen(false);
    },
    onError: () => {
      toast.error("Failed to create task");
    },
  });

  const moveTaskMutation = useMutation({
    mutationFn: ({
      taskId,
      newStatus,
      newPosition,
    }: {
      taskId: string;
      newStatus: string;
      newPosition: number;
    }) => tasksService.move(taskId, newStatus, newPosition),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
    },
    onError: () => {
      toast.error("Failed to move task");
    },
  });

  // Vote mutation for ideas
  const voteMutation = useMutation({
    mutationFn: async ({ taskId, isVoted }: { taskId: string; isVoted: boolean }) => {
      if (isVoted) {
        await tasksService.removeVote(taskId);
      } else {
        await tasksService.vote(taskId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
    },
    onError: () => {
      toast.error("Failed to update vote");
    },
  });

  const handleAddTask = (status: string) => {
    setNewTaskStatus(status);
    setIsCreateTaskOpen(true);
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !projectId) return;

    createTaskMutation.mutate({
      title: newTaskTitle.trim(),
      project_id: projectId,
      status: newTaskStatus as any,
    });
  };

  const handleTaskMove = (taskId: string, newStatus: string, newPosition: number) => {
    moveTaskMutation.mutate({ taskId, newStatus, newPosition });
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTaskId(task.id);
  };

  const handleVote = (taskId: string) => {
    // Find task from tasksByStatus to get current vote state
    const allCurrentTasks = tasksByStatus
      ? [
          ...(tasksByStatus.idea || []),
          ...tasksByStatus.todo,
          ...tasksByStatus.in_progress,
          ...tasksByStatus.in_review,
          ...tasksByStatus.done,
        ]
      : [];
    const task = allCurrentTasks.find(t => t.id === taskId);
    voteMutation.mutate({ taskId, isVoted: task?.user_voted ?? false });
  };

  const handleJournalEntryClick = (entry: JournalEntry) => {
    setSelectedJournalEntryId(entry.id);
    setIsJournalModalOpen(true);
  };

  const handleCreateJournalEntry = () => {
    setSelectedJournalEntryId(null);
    setIsJournalModalOpen(true);
  };

  const handleJournalModalClose = () => {
    setIsJournalModalOpen(false);
    setSelectedJournalEntryId(null);
  };

  if (projectLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Project not found
        </h2>
        <Link to="/projects" className="mt-4 text-primary-600 hover:underline">
          Back to projects
        </Link>
      </div>
    );
  }

  const allTasks: Task[] = tasksByStatus
    ? [
        ...(tasksByStatus.idea || []),
        ...tasksByStatus.todo,
        ...tasksByStatus.in_progress,
        ...tasksByStatus.in_review,
        ...tasksByStatus.done,
      ]
    : [];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 dark:border-dark-border dark:bg-dark-card">
        {/* Breadcrumb navigation */}
        {(ancestors && ancestors.length > 0) && (
          <nav className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 mb-3">
            <Link
              to="/projects"
              className="hover:text-primary-600 dark:hover:text-primary-400"
            >
              Projects
            </Link>
            {ancestors.map((ancestor: Project) => (
              <span key={ancestor.id} className="flex items-center gap-1">
                <ChevronRightIcon className="h-3.5 w-3.5" />
                <Link
                  to={`/projects/${ancestor.id}`}
                  className="hover:text-primary-600 dark:hover:text-primary-400"
                >
                  {ancestor.name}
                </Link>
              </span>
            ))}
            <ChevronRightIcon className="h-3.5 w-3.5" />
            <span className="text-gray-700 dark:text-gray-300 font-medium">
              {project.name}
            </span>
          </nav>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to={ancestors && ancestors.length > 0 ? `/projects/${ancestors[ancestors.length - 1].id}` : "/projects"}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
              title={ancestors && ancestors.length > 0 ? `Back to ${ancestors[ancestors.length - 1].name}` : "Back to projects"}
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </Link>

            <div>
              <div className="flex items-center gap-3">
                {project.color && (
                  <div
                    className="h-4 w-4 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />
                )}
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  {project.name}
                </h1>
                {project.parent_id && (
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                    Subproject
                  </span>
                )}
                <span
                  className={clsx(
                    "rounded-full px-2.5 py-0.5 text-xs font-medium",
                    statusColors[project.status]
                  )}
                >
                  {project.status}
                </span>
              </div>
              {project.description && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {project.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMembersModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-dark-border dark:bg-dark-elevated dark:text-gray-300"
            >
              <UserGroupIcon className="h-4 w-4" />
              Members
            </button>
            <button
              onClick={() => setIsSettingsModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-dark-border dark:bg-dark-elevated dark:text-gray-300"
            >
              <Cog6ToothIcon className="h-4 w-4" />
              Settings
            </button>
          </div>
        </div>

        {/* Tabs and view toggle */}
        <div className="mt-4 flex items-center justify-between">
          <nav className="flex gap-6">
            <button
              onClick={() => setActiveTab("tasks")}
              className={clsx(
                "border-b-2 pb-2 text-sm font-medium transition-colors",
                activeTab === "tasks"
                  ? "border-primary-600 text-primary-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
              )}
            >
              Tasks ({allTasks.length})
            </button>
            <button
              onClick={() => setActiveTab("documents")}
              className={clsx(
                "border-b-2 pb-2 text-sm font-medium transition-colors",
                activeTab === "documents"
                  ? "border-primary-600 text-primary-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
              )}
            >
              Documents
            </button>
            <button
              onClick={() => setActiveTab("papers")}
              className={clsx(
                "border-b-2 pb-2 text-sm font-medium transition-colors",
                activeTab === "papers"
                  ? "border-primary-600 text-primary-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
              )}
            >
              Papers
            </button>
            <button
              onClick={() => setActiveTab("notebook")}
              className={clsx(
                "border-b-2 pb-2 text-sm font-medium transition-colors",
                activeTab === "notebook"
                  ? "border-primary-600 text-primary-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
              )}
            >
              Lab Notebook
            </button>
            <button
              onClick={() => setActiveTab("blockers")}
              className={clsx(
                "border-b-2 pb-2 text-sm font-medium transition-colors",
                activeTab === "blockers"
                  ? "border-primary-600 text-primary-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
              )}
            >
              Blockers
            </button>
            <button
              onClick={() => setActiveTab("timeline")}
              className={clsx(
                "border-b-2 pb-2 text-sm font-medium transition-colors",
                activeTab === "timeline"
                  ? "border-primary-600 text-primary-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
              )}
            >
              Timeline
            </button>
          </nav>

          {activeTab === "tasks" && (
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-gray-200 dark:border-dark-border">
                <button
                  onClick={() => setViewMode("kanban")}
                  className={clsx(
                    "p-2",
                    viewMode === "kanban"
                      ? "bg-gray-100 text-gray-900 dark:bg-dark-elevated dark:text-white"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                  )}
                >
                  <Squares2X2Icon className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={clsx(
                    "p-2",
                    viewMode === "list"
                      ? "bg-gray-100 text-gray-900 dark:bg-dark-elevated dark:text-white"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                  )}
                >
                  <ListBulletIcon className="h-5 w-5" />
                </button>
              </div>

              <button
                onClick={() => setIsCreateBlockerOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-yellow-400 bg-yellow-50 px-4 py-2 text-sm font-medium text-yellow-700 hover:bg-yellow-100 dark:border-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400 dark:hover:bg-yellow-900/30"
              >
                <ExclamationTriangleIcon className="h-4 w-4" />
                Add Blocker
              </button>
              <button
                onClick={() => handleAddTask("todo")}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
              >
                <PlusIcon className="h-4 w-4" />
                Add Task
              </button>
            </div>
          )}

          {activeTab === "documents" && (
            <Link
              to={`/projects/${projectId}/documents`}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              <DocumentTextIcon className="h-4 w-4" />
              View All Documents
            </Link>
          )}

          {activeTab === "notebook" && (
            <button
              onClick={handleCreateJournalEntry}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              <PlusIcon className="h-4 w-4" />
              New Entry
            </button>
          )}
        </div>
      </div>

      {/* Project Blocked Banner */}
      {projectBlockers && projectBlockers.length > 0 && (
        <div className="mx-6 mt-4 rounded-lg border border-yellow-400 bg-yellow-50 p-4 dark:border-yellow-600 dark:bg-yellow-900/20">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <ExclamationTriangleIcon className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-300">
                This project is blocked
              </h3>
              <div className="mt-2 space-y-2">
                {projectBlockers.map((blocker) => (
                  <div
                    key={blocker.id}
                    className="flex items-center justify-between rounded-md bg-yellow-100 px-3 py-2 dark:bg-yellow-900/30"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={clsx(
                          "h-2 w-2 rounded-full",
                          blocker.impact_level === "critical" || blocker.impact_level === "high"
                            ? "bg-red-500"
                            : blocker.impact_level === "medium"
                            ? "bg-yellow-500"
                            : "bg-gray-400"
                        )}
                      />
                      <span className="text-sm font-medium text-yellow-900 dark:text-yellow-200">
                        {blocker.title}
                      </span>
                      <span className="text-xs text-yellow-700 dark:text-yellow-400">
                        ({blocker.impact_level} impact)
                      </span>
                    </div>
                    <button
                      onClick={() => setActiveTab("blockers")}
                      className="text-xs font-medium text-yellow-700 hover:text-yellow-900 dark:text-yellow-400 dark:hover:text-yellow-200"
                    >
                      View →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab content */}
      <div className="p-6">
        {/* Hierarchy Panel - shown for top-level projects */}
        {!project.parent_id && (
          <ProjectHierarchyPanel
            children={children || []}
            currentProjectId={projectId!}
            onAddSubproject={() => setIsCreateSubprojectOpen(true)}
            subprojectBlockers={subprojectBlockers}
            className="mb-6"
          />
        )}

        {/* Tasks Tab */}
        {activeTab === "tasks" && (
          <>
            {/* Aggregation toggle when project has children */}
            {hasChildren && (
              <div className="mb-4 flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeChildTasks}
                    onChange={(e) => setIncludeChildTasks(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700"
                  />
                  Include tasks from subprojects
                </label>
                {includeChildTasks && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Showing tasks from {children?.length} subproject{children?.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}
            {tasksLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
              </div>
            ) : viewMode === "kanban" && tasksByStatus ? (
              <KanbanBoard
                tasks={tasksByStatus}
                onTaskClick={handleTaskClick}
                onTaskMove={handleTaskMove}
                onAddTask={handleAddTask}
                taskBlockers={taskBlockers}
                taskUnreadInfo={taskUnreadInfo}
                onVote={handleVote}
              />
            ) : (
              <div className="space-y-2">
                {allTasks.length === 0 ? (
                  <div className="rounded-xl bg-white p-12 text-center shadow-card dark:bg-dark-card">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                      No tasks yet
                    </h3>
                    <p className="mt-2 text-gray-500 dark:text-gray-400">
                      Create your first task to get started
                    </p>
                    <button
                      onClick={() => handleAddTask("todo")}
                      className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
                    >
                      <PlusIcon className="h-4 w-4" />
                      Add Task
                    </button>
                  </div>
                ) : (
                  allTasks.map((task) => (
                    <div key={task.id} className="max-w-2xl">
                      <TaskCard
                        task={task}
                        onClick={() => handleTaskClick(task)}
                        blockerInfo={taskBlockers?.[task.id]}
                        unreadInfo={taskUnreadInfo?.[task.id]}
                        onVote={handleVote}
                      />
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}

        {/* Documents Tab */}
        {activeTab === "documents" && projectId && (
          <div className="rounded-xl bg-white p-6 shadow-card dark:bg-dark-card">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
                  <DocumentTextIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Project Documents
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Documentation and notes for {project?.name}
                  </p>
                </div>
              </div>
            </div>
            <DocumentList
              projectId={projectId}
              showFilters={true}
              showViewAll={true}
              showCreateButton={true}
              onDocumentClick={(doc) =>
                navigate(`/projects/${projectId}/documents/${doc.id}`)
              }
              onCreateClick={() => setIsCreateDocumentOpen(true)}
              viewAllUrl={`/projects/${projectId}/documents`}
            />
          </div>
        )}

        {/* Papers Tab */}
        {activeTab === "papers" && organization?.id && projectId && (
          <div className="rounded-xl bg-white p-6 shadow-card dark:bg-dark-card">
            <ProjectPapersSection
              projectId={projectId}
              organizationId={organization.id}
            />
          </div>
        )}

        {/* Lab Notebook Tab */}
        {activeTab === "notebook" && projectId && (
          <div className="rounded-xl bg-white p-6 shadow-card dark:bg-dark-card">
            <div className="flex items-center gap-3 mb-6">
              <div className="rounded-lg bg-teal-100 p-2 dark:bg-teal-900/30">
                <BookOpenIcon className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Lab Notebook
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Observations, experiments, and notes for {project?.name}
                </p>
              </div>
            </div>
            <JournalEntryList
              projectId={projectId}
              onEntryClick={handleJournalEntryClick}
              onCreateClick={handleCreateJournalEntry}
            />
          </div>
        )}

        {/* Blockers Tab */}
        {activeTab === "blockers" && projectId && (
          <div className="rounded-xl bg-white p-6 shadow-card dark:bg-dark-card">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Project Blockers
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Track and manage blockers affecting this project
                </p>
              </div>
              <button
                onClick={() => setIsCreateBlockerOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
              >
                <PlusIcon className="h-4 w-4" />
                Add Blocker
              </button>
            </div>
            <BlockerList
              projectId={projectId}
              showResolved={true}
              onCreateBlocker={() => setIsCreateBlockerOpen(true)}
            />
          </div>
        )}

        {/* Timeline Tab */}
        {activeTab === "timeline" && (
          <div className="rounded-xl bg-white p-12 text-center shadow-card dark:bg-dark-card">
            <ClockIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
              Project Timeline
            </h3>
            <p className="mt-2 text-gray-500 dark:text-gray-400">
              Timeline view coming soon
            </p>
            {project?.start_date && (
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                Start date: {new Date(project.start_date).toLocaleDateString()}
              </p>
            )}
            {project?.target_end_date && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Target end: {new Date(project.target_end_date).toLocaleDateString()}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Create task modal */}
      {isCreateTaskOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-card dark:bg-dark-card">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Add Task
            </h2>
            <form onSubmit={handleCreateTask} className="mt-4">
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Task title"
                autoFocus
                className="w-full rounded-lg border border-gray-200 px-4 py-2 text-gray-900 placeholder-gray-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateTaskOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newTaskTitle.trim() || createTaskMutation.isPending}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {createTaskMutation.isPending ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create subproject modal */}
      <CreateProjectModal
        isOpen={isCreateSubprojectOpen}
        onClose={() => setIsCreateSubprojectOpen(false)}
        onSuccess={(newProjectId) => {
          queryClient.invalidateQueries({ queryKey: ["project", projectId, "children"] });
          navigate(`/projects/${newProjectId}`);
        }}
        defaultParentId={projectId}
      />

      {/* Task detail modal */}
      <TaskDetailModal
        isOpen={!!selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
        taskId={selectedTaskId}
        onTaskUpdate={() => {
          queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
        }}
      />

      {/* Journal entry modal - defaults to this project */}
      <JournalEntryModal
        isOpen={isJournalModalOpen}
        onClose={handleJournalModalClose}
        entryId={selectedJournalEntryId}
        defaultScope="project"
        projectId={projectId}
        onEntryChange={() => {
          queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
        }}
      />

      {/* Project members modal */}
      {projectId && project && (
        <ProjectMembersModal
          isOpen={isMembersModalOpen}
          onClose={() => setIsMembersModalOpen(false)}
          projectId={projectId}
          projectName={project.name}
          teamId={project.team_id}
          organizationId={project.organization_id}
          scope={project.visibility}
          isPersonalProject={project.team_is_personal ?? false}
        />
      )}

      {/* Project settings modal */}
      {project && (
        <ProjectSettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          project={project}
          onProjectUpdate={() => {
            queryClient.invalidateQueries({ queryKey: ["project", projectId] });
          }}
        />
      )}

      {/* Create blocker modal */}
      {projectId && (
        <CreateBlockerModal
          isOpen={isCreateBlockerOpen}
          onClose={() => setIsCreateBlockerOpen(false)}
          projectId={projectId}
        />
      )}

      {/* Create document modal */}
      {projectId && (
        <CreateDocumentModal
          isOpen={isCreateDocumentOpen}
          onClose={() => setIsCreateDocumentOpen(false)}
          projectId={projectId}
        />
      )}
    </div>
  );
}
