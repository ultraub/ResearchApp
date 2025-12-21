import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  PlusIcon,
  LightBulbIcon,
  MagnifyingGlassIcon,
  Squares2X2Icon,
  ListBulletIcon,
} from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import { ideasService } from "@/services/ideas";
import IdeaCard from "@/components/ideas/IdeaCard";
import IdeaListView from "@/components/ideas/IdeaListView";
import QuickCapture from "@/components/ideas/QuickCapture";
import { ConvertToProjectModal } from "@/components/ideas/ConvertToProjectModal";
import { ConvertToTaskModal } from "@/components/ideas/ConvertToTaskModal";
import { AddTaskFromIdeaModal } from "@/components/ideas/AddTaskFromIdeaModal";
import IdeaDetailPanel from "@/components/ideas/IdeaDetailPanel";
import type { Idea } from "@/types";

const statusFilters = [
  { value: "", label: "All" },
  { value: "captured", label: "Captured" },
  { value: "reviewed", label: "Reviewed" },
  { value: "converted", label: "Converted" },
  { value: "archived", label: "Archived" },
];

export default function IdeasPage() {
  const navigate = useNavigate();
  const [isQuickCaptureOpen, setIsQuickCaptureOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [convertToProjectIdea, setConvertToProjectIdea] = useState<Idea | null>(null);
  const [convertToTaskIdea, setConvertToTaskIdea] = useState<Idea | null>(null);
  const [addTaskIdea, setAddTaskIdea] = useState<Idea | null>(null);
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    const saved = localStorage.getItem("ideas-view-mode");
    return (saved === "list" || saved === "grid") ? saved : "list";
  });

  // Persist view mode to localStorage
  useEffect(() => {
    localStorage.setItem("ideas-view-mode", viewMode);
  }, [viewMode]);

  const { data, isLoading } = useQuery({
    queryKey: ["ideas", { status: statusFilter, search: searchQuery, pinned_only: pinnedOnly }],
    queryFn: () =>
      ideasService.list({
        status: statusFilter || undefined,
        search: searchQuery || undefined,
        pinned_only: pinnedOnly,
        page_size: 50,
      }),
  });

  const handleConvertToProject = (idea: Idea) => {
    setConvertToProjectIdea(idea);
  };

  const handleConvertToTask = (idea: Idea) => {
    setConvertToTaskIdea(idea);
  };

  const handleProjectCreated = (projectId: string) => {
    navigate(`/projects/${projectId}`);
  };

  const handleIdeaClick = (idea: Idea) => {
    setSelectedIdeaId(idea.id);
  };

  const handleAddTask = (idea: Idea) => {
    setAddTaskIdea(idea);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Ideas</h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Capture thoughts, organize later
          </p>
        </div>

        <button
          onClick={() => setIsQuickCaptureOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
        >
          <PlusIcon className="h-4 w-4" />
          Quick Capture
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3 sm:gap-4">
        <div className="relative sm:max-w-md">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search ideas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm placeholder-gray-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-dark-border dark:bg-dark-elevated dark:text-white"
          >
            {statusFilters.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>

          <label className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={pinnedOnly}
              onChange={(e) => setPinnedOnly(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
            />
            Pinned only
          </label>

          {/* View mode toggle */}
          <div className="ml-auto flex rounded-lg border border-gray-300 dark:border-dark-border">
            <button
              onClick={() => setViewMode("list")}
              className={clsx(
                "rounded-l-lg p-2 transition-colors",
                viewMode === "list"
                  ? "bg-amber-500 text-white"
                  : "bg-white text-gray-500 hover:bg-gray-50 dark:bg-dark-elevated dark:text-gray-400 dark:hover:bg-dark-card"
              )}
              title="List view"
            >
              <ListBulletIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={clsx(
                "rounded-r-lg p-2 transition-colors",
                viewMode === "grid"
                  ? "bg-amber-500 text-white"
                  : "bg-white text-gray-500 hover:bg-gray-50 dark:bg-dark-elevated dark:text-gray-400 dark:hover:bg-dark-card"
              )}
              title="Grid view"
            >
              <Squares2X2Icon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Ideas Display */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-amber-500" />
        </div>
      ) : data?.items && data.items.length > 0 ? (
        viewMode === "list" ? (
          <IdeaListView
            ideas={data.items}
            onIdeaClick={handleIdeaClick}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                onClick={handleIdeaClick}
                onConvertToProject={handleConvertToProject}
                onConvertToTask={handleConvertToTask}
              />
            ))}
          </div>
        )
      ) : (
        <div className="rounded-xl bg-white p-12 text-center shadow-card dark:bg-dark-card">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <LightBulbIcon className="h-8 w-8 text-amber-500" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            No ideas yet
          </h3>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            Capture your first idea - it only takes a second
          </p>
          <button
            onClick={() => setIsQuickCaptureOpen(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-6 py-3 text-sm font-medium text-white hover:bg-amber-600"
          >
            <PlusIcon className="h-5 w-5" />
            Capture Your First Idea
          </button>
        </div>
      )}

      {/* Quick Capture Modal */}
      <QuickCapture
        isOpen={isQuickCaptureOpen}
        onClose={() => setIsQuickCaptureOpen(false)}
      />

      {/* Convert to Project Modal */}
      <ConvertToProjectModal
        isOpen={!!convertToProjectIdea}
        idea={convertToProjectIdea}
        onClose={() => setConvertToProjectIdea(null)}
        onSuccess={handleProjectCreated}
      />

      {/* Convert to Task Modal */}
      <ConvertToTaskModal
        isOpen={!!convertToTaskIdea}
        idea={convertToTaskIdea}
        onClose={() => setConvertToTaskIdea(null)}
      />

      {/* Idea Detail Panel */}
      <IdeaDetailPanel
        isOpen={!!selectedIdeaId}
        onClose={() => setSelectedIdeaId(null)}
        ideaId={selectedIdeaId}
        onConvertToProject={handleConvertToProject}
        onConvertToTask={handleConvertToTask}
        onAddTask={handleAddTask}
      />

      {/* Add Task From Idea Modal */}
      <AddTaskFromIdeaModal
        isOpen={!!addTaskIdea}
        idea={addTaskIdea}
        onClose={() => setAddTaskIdea(null)}
      />
    </div>
  );
}
