/**
 * Project Card component for displaying project in grid/list views.
 */

import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  FolderIcon,
  EllipsisHorizontalIcon,
  ArchiveBoxIcon,
  TrashIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";
import { Menu, Transition } from "@headlessui/react";
import { Fragment } from "react";
import { clsx } from "clsx";
import type { Project } from "@/types";
import { TeamBadge } from "./TeamBadge";
import { ProjectBreadcrumb } from "./ProjectBreadcrumb";
import OwnerDisplay from "@/components/common/OwnerDisplay";

interface ProjectCardProps {
  project: Project;
  viewMode: "grid" | "list";
  onArchive?: (project: Project) => void;
  onDelete?: (project: Project) => void;
  onSettings?: (project: Project) => void;
}

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-700 ring-1 ring-green-200 dark:bg-green-900/30 dark:text-green-400 dark:ring-green-800",
  completed: "bg-blue-100 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:ring-blue-800",
  on_hold: "bg-yellow-100 text-yellow-700 ring-1 ring-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:ring-yellow-800",
  archived: "bg-gray-100 text-gray-600 ring-1 ring-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:ring-gray-600",
};

export function ProjectCard({
  project,
  viewMode,
  onArchive,
  onDelete,
  onSettings,
}: ProjectCardProps) {
  const progress =
    project.task_count && project.task_count > 0
      ? Math.round(((project.completed_task_count || 0) / project.task_count) * 100)
      : 0;

  if (viewMode === "list") {
    return (
      <Link
        to={`/projects/${project.id}`}
        className="flex items-center gap-4 rounded-xl bg-white p-4 shadow-soft transition-all duration-200 hover:shadow-elevated hover:scale-[1.005] hover:bg-gray-50/50 dark:bg-dark-card dark:hover:bg-dark-elevated"
      >
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0"
          style={{ backgroundColor: project.color || "#6366f1" }}
        >
          <FolderIcon className="h-5 w-5 text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 dark:text-white truncate">
              {project.name}
            </h3>
            <span
              className={clsx(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                statusColors[project.status]
              )}
            >
              {project.status.replace("_", " ")}
            </span>
            <TeamBadge
              teamName={project.team_name}
              isPersonal={project.team_is_personal}
            />
            {/* Creator */}
            {project.created_by_name && (
              <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500">
                <span className="text-[10px]">by</span>
                <OwnerDisplay
                  name={project.created_by_name}
                  email={project.created_by_email}
                  id={project.created_by_id}
                  size="xs"
                />
              </span>
            )}
          </div>
          {project.description && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 truncate">
              {project.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400">
          <div className="text-right">
            <div className="font-medium text-gray-900 dark:text-white">
              {project.task_count || 0} tasks
            </div>
            <div>{progress}% complete</div>
          </div>
          <div className="text-right">
            <div>Updated</div>
            <div>{formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}</div>
          </div>
        </div>

        <ProjectMenu
          project={project}
          onArchive={onArchive}
          onDelete={onDelete}
          onSettings={onSettings}
        />
      </Link>
    );
  }

  // Grid view
  return (
    <div className="group relative rounded-xl bg-white p-5 shadow-soft transition-all duration-200 hover:shadow-elevated hover:scale-[1.01] dark:bg-dark-card dark:hover:bg-dark-elevated/50">
      <div className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100">
        <ProjectMenu
          project={project}
          onArchive={onArchive}
          onDelete={onDelete}
          onSettings={onSettings}
        />
      </div>

      <Link to={`/projects/${project.id}`} className="block">
        {/* Hierarchy breadcrumb */}
        <ProjectBreadcrumb project={project} className="mb-2" />

        <div className="flex items-start gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl flex-shrink-0"
            style={{ backgroundColor: project.color || "#6366f1" }}
          >
            <FolderIcon className="h-6 w-6 text-white" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                {project.name}
              </h3>
            </div>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <span
                className={clsx(
                  "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                  statusColors[project.status]
                )}
              >
                {project.status.replace("_", " ")}
              </span>
              <TeamBadge
                teamName={project.team_name}
                isPersonal={project.team_is_personal}
              />
            </div>
          </div>
        </div>

        {project.description && (
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
            {project.description}
          </p>
        )}

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
            <span>{project.task_count || 0} tasks</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 bg-gray-100 dark:bg-dark-elevated rounded-full overflow-hidden shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Tags */}
        {project.tags && project.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {project.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-dark-elevated dark:text-gray-400"
              >
                {tag}
              </span>
            ))}
            {project.tags.length > 3 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                +{project.tags.length - 3}
              </span>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          {/* Creator */}
          {project.created_by_name && (
            <span className="flex items-center gap-1">
              <span className="text-[10px]">by</span>
              <OwnerDisplay
                name={project.created_by_name}
                email={project.created_by_email}
                id={project.created_by_id}
                size="xs"
              />
            </span>
          )}
          <span>
            Updated {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}
          </span>
        </div>
      </Link>
    </div>
  );
}

function ProjectMenu({
  project,
  onArchive,
  onDelete,
  onSettings,
}: {
  project: Project;
  onArchive?: (project: Project) => void;
  onDelete?: (project: Project) => void;
  onSettings?: (project: Project) => void;
}) {
  return (
    <Menu as="div" className="relative">
      <Menu.Button
        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-card"
        onClick={(e) => e.preventDefault()}
      >
        <EllipsisHorizontalIcon className="h-5 w-5" />
      </Menu.Button>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute right-0 z-10 mt-1 w-48 origin-top-right rounded-xl bg-white py-1 shadow-card ring-1 ring-black/5 dark:ring-white/10 focus:outline-none dark:bg-dark-elevated">
          {onSettings && (
            <Menu.Item>
              {({ active }) => (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    onSettings(project);
                  }}
                  className={clsx(
                    "flex w-full items-center gap-2 px-4 py-2 text-sm",
                    active
                      ? "bg-gray-100 text-gray-900 dark:bg-dark-elevated/50 dark:text-white"
                      : "text-gray-700 dark:text-gray-300"
                  )}
                >
                  <Cog6ToothIcon className="h-4 w-4" />
                  Settings
                </button>
              )}
            </Menu.Item>
          )}
          {onArchive && (
            <Menu.Item>
              {({ active }) => (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    onArchive(project);
                  }}
                  className={clsx(
                    "flex w-full items-center gap-2 px-4 py-2 text-sm",
                    active
                      ? "bg-gray-100 text-gray-900 dark:bg-dark-elevated/50 dark:text-white"
                      : "text-gray-700 dark:text-gray-300"
                  )}
                >
                  <ArchiveBoxIcon className="h-4 w-4" />
                  Archive
                </button>
              )}
            </Menu.Item>
          )}
          {onDelete && (
            <Menu.Item>
              {({ active }) => (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    onDelete(project);
                  }}
                  className={clsx(
                    "flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400",
                    active && "bg-red-50 dark:bg-red-900/20"
                  )}
                >
                  <TrashIcon className="h-4 w-4" />
                  Delete
                </button>
              )}
            </Menu.Item>
          )}
        </Menu.Items>
      </Transition>
    </Menu>
  );
}
