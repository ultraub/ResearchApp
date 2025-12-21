/**
 * TeamDetailPage - Detail view for a team with tabs for members, projects, and invites
 */

import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  UserGroupIcon,
  FolderIcon,
  LinkIcon,
  Cog6ToothIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import { teamsService } from "@/services/teams";
import { TeamMembersModal, TeamSettingsModal } from "@/components/teams";
import { InviteCodesList } from "@/components/invitations";
import type { TeamMemberRole, Project } from "@/types";

type TabType = "members" | "projects" | "invites";

const ROLE_LABELS: Record<TeamMemberRole, string> = {
  owner: "Owner",
  lead: "Lead",
  member: "Member",
};

const ROLE_COLORS: Record<TeamMemberRole, string> = {
  owner: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  lead: "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400",
  member: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

export default function TeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const [activeTab, setActiveTab] = useState<TabType>("members");
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Fetch team details
  const {
    data: team,
    isLoading: teamLoading,
    error: teamError,
  } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => teamsService.get(teamId!),
    enabled: !!teamId,
  });

  // Fetch team members
  const { data: members = [] } = useQuery({
    queryKey: ["team-members", teamId],
    queryFn: () => teamsService.getMembers(teamId!),
    enabled: !!teamId,
  });

  // Fetch team projects
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["team-projects", teamId],
    queryFn: () => teamsService.getProjects(teamId!),
    enabled: !!teamId && activeTab === "projects",
  });

  const canManage = team?.current_user_role === "owner" || team?.current_user_role === "lead";

  if (teamLoading) {
    return (
      <div className="min-h-full bg-gray-50 dark:bg-dark-base">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <div className="space-y-6">
            <div className="h-8 w-48 animate-pulse rounded bg-gray-200 dark:bg-dark-elevated" />
            <div className="h-24 animate-pulse rounded-xl bg-gray-200 dark:bg-dark-elevated" />
            <div className="h-64 animate-pulse rounded-xl bg-gray-200 dark:bg-dark-elevated" />
          </div>
        </div>
      </div>
    );
  }

  if (teamError || !team) {
    return (
      <div className="min-h-full bg-gray-50 dark:bg-gray-900">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
            <p className="text-red-600 dark:text-red-400">
              Failed to load team. It may not exist or you may not have access.
            </p>
            <Link
              to="/teams"
              className="mt-4 inline-flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back to Teams
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const tabs: { id: TabType; label: string; icon: typeof UserGroupIcon }[] = [
    { id: "members", label: "Members", icon: UserGroupIcon },
    { id: "projects", label: "Projects", icon: FolderIcon },
    { id: "invites", label: "Invites", icon: LinkIcon },
  ];

  return (
    <div className="min-h-full bg-gray-50 dark:bg-dark-base">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white dark:border-dark-border dark:bg-dark-card">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
          {/* Back link */}
          <Link
            to="/teams"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Teams
          </Link>

          {/* Team info */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary-100 sm:h-14 sm:w-14 dark:bg-primary-900/30">
                <UserGroupIcon className="h-6 w-6 text-primary-600 sm:h-7 sm:w-7 dark:text-primary-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <h1 className="text-xl font-bold text-gray-900 sm:text-2xl dark:text-white">
                    {team.name}
                  </h1>
                  {team.current_user_role && (
                    <span
                      className={clsx(
                        "rounded-full px-2.5 py-1 text-xs font-medium",
                        ROLE_COLORS[team.current_user_role]
                      )}
                    >
                      {ROLE_LABELS[team.current_user_role]}
                    </span>
                  )}
                </div>
                {team.description && (
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {team.description}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-500 sm:gap-4 dark:text-gray-400">
                  <span className="flex items-center gap-1.5">
                    <UserGroupIcon className="h-4 w-4" />
                    {team.member_count} member{team.member_count !== 1 ? "s" : ""}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <FolderIcon className="h-4 w-4" />
                    {team.project_count} project{team.project_count !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            </div>

            {/* Settings button */}
            {canManage && (
              <button
                onClick={() => setIsSettingsModalOpen(true)}
                className="self-start rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 dark:border-dark-border dark:text-gray-400 dark:hover:bg-dark-elevated"
                title="Team settings"
              >
                <Cog6ToothIcon className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="-mx-4 mt-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div className="flex gap-1 border-b border-transparent">
              {tabs.map((tab) => {
                // Only show invites tab if user can manage
                if (tab.id === "invites" && !canManage) return null;

                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={clsx(
                      "flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors sm:px-4",
                      activeTab === tab.id
                        ? "border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400"
                        : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300"
                    )}
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {activeTab === "members" && (
          <MembersTab
            members={members}
            canManage={canManage}
            onManageClick={() => setIsMembersModalOpen(true)}
          />
        )}

        {activeTab === "projects" && (
          <ProjectsTab
            projects={projects}
            isLoading={projectsLoading}
          />
        )}

        {activeTab === "invites" && canManage && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-dark-border dark:bg-dark-card">
            <InviteCodesList
              target={{
                type: "team",
                id: team.id,
                name: team.name,
              }}
            />
          </div>
        )}
      </div>

      {/* Members Modal */}
      {team && (
        <TeamMembersModal
          isOpen={isMembersModalOpen}
          onClose={() => setIsMembersModalOpen(false)}
          team={team}
        />
      )}

      {/* Settings Modal */}
      {team && (
        <TeamSettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          team={team}
        />
      )}
    </div>
  );
}

// Members Tab Component
interface MembersTabProps {
  members: Array<{
    id?: string;
    user_id: string;
    role: TeamMemberRole;
    display_name?: string | null;
    email?: string | null;
    user_name?: string | null;
    user_email?: string | null;
  }>;
  canManage: boolean;
  onManageClick: () => void;
}

function MembersTab({ members, canManage, onManageClick }: MembersTabProps) {
  const getMemberDisplayName = (member: MembersTabProps["members"][0]): string => {
    if (member.display_name) return member.display_name;
    if (member.user_name) return member.user_name;
    if (member.email) return member.email;
    if (member.user_email) return member.user_email;
    return "Unknown User";
  };

  const getMemberEmail = (member: MembersTabProps["members"][0]): string => {
    return member.email || member.user_email || "";
  };

  return (
    <div className="space-y-4">
      {/* Header with manage button */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900 sm:text-lg dark:text-white">
          Team Members ({members.length})
        </h2>
        {canManage && (
          <button
            onClick={onManageClick}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 sm:px-4"
          >
            <PlusIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Manage Members</span>
          </button>
        )}
      </div>

      {/* Members grid */}
      {members.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center dark:border-gray-600">
          <UserGroupIcon className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-2 text-gray-500 dark:text-gray-400">No members yet</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-card"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600 dark:bg-gray-600 dark:text-gray-300">
                {getMemberDisplayName(member).charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                  {getMemberDisplayName(member)}
                </p>
                {getMemberEmail(member) && (
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {getMemberEmail(member)}
                  </p>
                )}
              </div>
              <span
                className={clsx(
                  "flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                  ROLE_COLORS[member.role]
                )}
              >
                {ROLE_LABELS[member.role]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Projects Tab Component
interface ProjectsTabProps {
  projects: Project[];
  isLoading: boolean;
}

function ProjectsTab({ projects, isLoading }: ProjectsTabProps) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-xl bg-gray-200 dark:bg-dark-elevated"
          />
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center dark:border-gray-600">
        <FolderIcon className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
          No projects yet
        </h3>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Create a project and assign it to this team to see it here.
        </p>
        <button
          onClick={() => navigate("/projects/new")}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          <PlusIcon className="h-4 w-4" />
          Create Project
        </button>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    completed: "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400",
    on_hold: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    archived: "bg-gray-100 text-gray-600 dark:bg-dark-elevated dark:text-gray-400",
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <Link
          key={project.id}
          to={`/projects/${project.id}`}
          className="group rounded-xl border border-gray-200 bg-white p-5 shadow-card transition-all hover:border-primary-200 hover:shadow-card dark:border-dark-border dark:bg-dark-card dark:hover:border-primary-700"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/30">
              <FolderIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-semibold text-gray-900 group-hover:text-primary-600 dark:text-white dark:group-hover:text-primary-400">
                {project.name}
              </h3>
              {project.description && (
                <p className="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
                  {project.description}
                </p>
              )}
            </div>
          </div>
          <div className="mt-4">
            <span
              className={clsx(
                "rounded-full px-2.5 py-1 text-xs font-medium capitalize",
                statusColors[project.status] || statusColors.active
              )}
            >
              {project.status.replace("_", " ")}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
