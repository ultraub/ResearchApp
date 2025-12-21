/**
 * ProjectBreadcrumb component for displaying full project hierarchy.
 * Shows: Organization > Team > Parent Project(s) > Current
 */

import { Fragment } from "react";
import { Link } from "react-router-dom";
import { ChevronRightIcon, BuildingOfficeIcon, UsersIcon, UserIcon } from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import type { Project } from "@/types";

interface ProjectBreadcrumbProps {
  project: Project;
  showOrg?: boolean;
  showTeam?: boolean;
  showAncestors?: boolean;
  maxAncestors?: number;
  className?: string;
}

export function ProjectBreadcrumb({
  project,
  showOrg = true,
  showTeam = true,
  showAncestors = true,
  maxAncestors = 2,
  className,
}: ProjectBreadcrumbProps) {
  const hasOrg = showOrg && project.organization_name && !project.team_is_personal;
  const hasTeam = showTeam && project.team_name;
  const ancestors = showAncestors ? (project.ancestors || []).slice(-maxAncestors) : [];
  const hasContent = hasOrg || hasTeam || ancestors.length > 0;

  if (!hasContent) return null;

  return (
    <div
      className={clsx(
        "flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 overflow-hidden flex-wrap",
        className
      )}
    >
      {/* Organization */}
      {hasOrg && (
        <>
          <span className="flex items-center gap-1 min-w-0">
            <BuildingOfficeIcon className="h-3 w-3 flex-shrink-0 text-gray-400" />
            <span className="truncate">{project.organization_name}</span>
          </span>
          <ChevronRightIcon className="h-3 w-3 flex-shrink-0 text-gray-300 dark:text-gray-600" />
        </>
      )}

      {/* Team */}
      {hasTeam && (
        <>
          <span className="flex items-center gap-1 min-w-0">
            {project.team_is_personal ? (
              <UserIcon className="h-3 w-3 flex-shrink-0 text-purple-400" />
            ) : (
              <UsersIcon className="h-3 w-3 flex-shrink-0 text-blue-400" />
            )}
            <span className="truncate">
              {project.team_is_personal ? "Personal" : project.team_name}
            </span>
          </span>
          {ancestors.length > 0 && (
            <ChevronRightIcon className="h-3 w-3 flex-shrink-0 text-gray-300 dark:text-gray-600" />
          )}
        </>
      )}

      {/* Ancestor projects */}
      {ancestors.map((ancestor, idx) => (
        <Fragment key={ancestor.id}>
          {idx > 0 && (
            <ChevronRightIcon className="h-3 w-3 flex-shrink-0 text-gray-300 dark:text-gray-600" />
          )}
          <Link
            to={`/projects/${ancestor.id}`}
            onClick={(e) => e.stopPropagation()}
            className="truncate hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            {ancestor.name}
          </Link>
        </Fragment>
      ))}

      {/* Trailing chevron if there are ancestors (indicates current project follows) */}
      {ancestors.length > 0 && (
        <ChevronRightIcon className="h-3 w-3 flex-shrink-0 text-gray-300 dark:text-gray-600" />
      )}
    </div>
  );
}

export default ProjectBreadcrumb;
