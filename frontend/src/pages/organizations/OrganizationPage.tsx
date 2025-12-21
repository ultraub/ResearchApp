/**
 * OrganizationPage - Detail view for an organization with tabs for members, teams, and invites
 */

import { useState, Fragment } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, Transition, Listbox } from "@headlessui/react";
import {
  ArrowLeftIcon,
  BuildingOffice2Icon,
  UserGroupIcon,
  UsersIcon,
  LinkIcon,
  Cog6ToothIcon,
  PlusIcon,
  XMarkIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import { organizationsService } from "@/services/organizations";
import { InviteCodesList } from "@/components/invitations";
import type { OrganizationDetail, OrganizationMemberRole, OrganizationMemberDetail, TeamDetail } from "@/types";

type TabType = "members" | "teams" | "invites";

const ROLE_LABELS: Record<OrganizationMemberRole, string> = {
  admin: "Admin",
  member: "Member",
};

const ROLE_COLORS: Record<OrganizationMemberRole, string> = {
  admin: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  member: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

export default function OrganizationPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [activeTab, setActiveTab] = useState<TabType>("members");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);

  // Fetch organization details
  const {
    data: org,
    isLoading: orgLoading,
    error: orgError,
  } = useQuery({
    queryKey: ["organization", orgId],
    queryFn: () => organizationsService.get(orgId!),
    enabled: !!orgId,
  });

  // Fetch organization members
  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ["org-members", orgId],
    queryFn: () => organizationsService.getMembers(orgId!),
    enabled: !!orgId,
  });

  // Fetch organization teams
  const { data: teams = [], isLoading: teamsLoading } = useQuery({
    queryKey: ["org-teams", orgId],
    queryFn: () => organizationsService.getTeams(orgId!),
    enabled: !!orgId && activeTab === "teams",
  });

  const isAdmin = org?.current_user_role === "admin";

  if (orgLoading) {
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

  if (orgError || !org) {
    return (
      <div className="min-h-full bg-gray-50 dark:bg-dark-base">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
            <p className="text-red-600 dark:text-red-400">
              Failed to load organization. It may not exist or you may not have access.
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
    { id: "members", label: "Members", icon: UsersIcon },
    { id: "teams", label: "Teams", icon: UserGroupIcon },
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

          {/* Organization info */}
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-primary-100 dark:bg-primary-900/30">
                <BuildingOffice2Icon className="h-7 w-7 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {org.name}
                  </h1>
                  {org.current_user_role && (
                    <span
                      className={clsx(
                        "rounded-full px-2.5 py-1 text-xs font-medium",
                        ROLE_COLORS[org.current_user_role]
                      )}
                    >
                      {ROLE_LABELS[org.current_user_role]}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  @{org.slug}
                </p>
                <div className="mt-2 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1.5">
                    <UsersIcon className="h-4 w-4" />
                    {org.member_count} member{org.member_count !== 1 ? "s" : ""}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <UserGroupIcon className="h-4 w-4" />
                    {org.team_count} team{org.team_count !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            </div>

            {/* Settings button */}
            {isAdmin && (
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="rounded-lg border border-gray-300 p-2 text-gray-600 hover:bg-gray-50 dark:border-dark-border dark:text-gray-400 dark:hover:bg-dark-elevated"
                title="Organization settings"
              >
                <Cog6ToothIcon className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="mt-6 flex gap-1 border-b border-transparent">
            {tabs.map((tab) => {
              // Only show invites tab if user is admin
              if (tab.id === "invites" && !isAdmin) return null;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                    "flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                    activeTab === tab.id
                      ? "border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400"
                      : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-dark-border dark:hover:text-gray-300"
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

      {/* Content */}
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {activeTab === "members" && (
          <MembersTab
            org={org}
            members={members}
            isLoading={membersLoading}
            isAdmin={isAdmin}
            onAddMemberClick={() => setIsAddMemberOpen(true)}
          />
        )}

        {activeTab === "teams" && (
          <TeamsTab
            teams={teams}
            isLoading={teamsLoading}
          />
        )}

        {activeTab === "invites" && isAdmin && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-card dark:border-dark-border dark:bg-dark-card">
            <InviteCodesList
              target={{
                type: "organization",
                id: org.id,
                name: org.name,
              }}
            />
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {org && isAdmin && (
        <OrgSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          org={org}
        />
      )}

      {/* Add Member Modal */}
      {org && isAdmin && (
        <AddMemberModal
          isOpen={isAddMemberOpen}
          onClose={() => setIsAddMemberOpen(false)}
        />
      )}
    </div>
  );
}

// Members Tab Component
interface MembersTabProps {
  org: OrganizationDetail;
  members: OrganizationMemberDetail[];
  isLoading: boolean;
  isAdmin: boolean;
  onAddMemberClick: () => void;
}

function MembersTab({ org, members, isLoading, isAdmin, onAddMemberClick }: MembersTabProps) {
  const queryClient = useQueryClient();
  const [memberToRemove, setMemberToRemove] = useState<OrganizationMemberDetail | null>(null);

  // Update member role mutation
  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: OrganizationMemberRole }) =>
      organizationsService.updateMember(org.id, userId, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-members", org.id] });
      toast.success("Role updated");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update role");
    },
  });

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => organizationsService.removeMember(org.id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-members", org.id] });
      queryClient.invalidateQueries({ queryKey: ["organization", org.id] });
      toast.success("Member removed");
      setMemberToRemove(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to remove member");
    },
  });

  const getMemberDisplayName = (member: OrganizationMemberDetail): string => {
    if (member.user_name) return member.user_name;
    if (member.user_email) return member.user_email;
    return "Unknown User";
  };

  const getMemberEmail = (member: OrganizationMemberDetail): string => {
    return member.user_email || "";
  };

  const handleRoleChange = (member: OrganizationMemberDetail, newRole: OrganizationMemberRole) => {
    // Prevent changing the last admin's role
    const adminCount = members.filter((m) => m.role === "admin").length;
    if (member.role === "admin" && adminCount === 1 && newRole !== "admin") {
      toast.error("Cannot change role of the last admin");
      return;
    }
    updateRoleMutation.mutate({ userId: member.user_id, role: newRole });
  };

  const handleRemoveMember = (member: OrganizationMemberDetail) => {
    // Prevent removing the last admin
    const adminCount = members.filter((m) => m.role === "admin").length;
    if (member.role === "admin" && adminCount === 1) {
      toast.error("Cannot remove the last admin");
      return;
    }
    setMemberToRemove(member);
  };

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-xl bg-gray-200 dark:bg-dark-elevated"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with add button */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Organization Members ({members.length})
        </h2>
        {isAdmin && (
          <button
            onClick={onAddMemberClick}
            className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            <PlusIcon className="h-4 w-4" />
            Add Member
          </button>
        )}
      </div>

      {/* Members grid */}
      {members.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-300 p-8 text-center dark:border-dark-border">
          <UsersIcon className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-2 text-gray-500 dark:text-gray-400">No members yet</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-soft dark:border-dark-border dark:bg-dark-card"
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
              <div className="flex items-center gap-1">
                {isAdmin ? (
                  <Listbox
                    value={member.role}
                    onChange={(newRole) => handleRoleChange(member, newRole)}
                  >
                    <div className="relative">
                      <Listbox.Button
                        className={clsx(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          ROLE_COLORS[member.role]
                        )}
                      >
                        {ROLE_LABELS[member.role]}
                      </Listbox.Button>
                      <Transition
                        as={Fragment}
                        leave="transition ease-in duration-100"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                      >
                        <Listbox.Options className="absolute right-0 z-10 mt-1 w-24 overflow-auto rounded-xl bg-white py-1 shadow-card ring-1 ring-black/5 dark:ring-white/10 dark:bg-dark-card">
                          {(["admin", "member"] as OrganizationMemberRole[]).map((role) => (
                            <Listbox.Option
                              key={role}
                              value={role}
                              className={({ active }) =>
                                clsx(
                                  "cursor-pointer px-3 py-1.5 text-sm",
                                  active && "bg-gray-100 dark:bg-dark-elevated"
                                )
                              }
                            >
                              {ROLE_LABELS[role]}
                            </Listbox.Option>
                          ))}
                        </Listbox.Options>
                      </Transition>
                    </div>
                  </Listbox>
                ) : (
                  <span
                    className={clsx(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      ROLE_COLORS[member.role]
                    )}
                  >
                    {ROLE_LABELS[member.role]}
                  </span>
                )}
                {isAdmin && (
                  <button
                    onClick={() => handleRemoveMember(member)}
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                    title="Remove member"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Remove confirmation dialog */}
      <Transition show={!!memberToRemove} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setMemberToRemove(null)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/30" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-sm rounded-xl bg-white p-6 shadow-card dark:bg-dark-card">
                  <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                    Remove Member
                  </Dialog.Title>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    Are you sure you want to remove{" "}
                    <span className="font-medium">
                      {memberToRemove && getMemberDisplayName(memberToRemove)}
                    </span>{" "}
                    from this organization? They will lose access to all organization resources.
                  </p>
                  <div className="mt-4 flex justify-end gap-3">
                    <button
                      onClick={() => setMemberToRemove(null)}
                      className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-elevated"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => memberToRemove && removeMemberMutation.mutate(memberToRemove.user_id)}
                      disabled={removeMemberMutation.isPending}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {removeMemberMutation.isPending ? "Removing..." : "Remove"}
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
}

// Teams Tab Component
interface TeamsTabProps {
  teams: TeamDetail[];
  isLoading: boolean;
}

function TeamsTab({ teams, isLoading }: TeamsTabProps) {
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

  if (teams.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-gray-300 p-12 text-center dark:border-dark-border">
        <UserGroupIcon className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
          No teams yet
        </h3>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Teams in this organization will appear here.
        </p>
        <button
          onClick={() => navigate("/teams")}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          <PlusIcon className="h-4 w-4" />
          Create Team
        </button>
      </div>
    );
  }

  const TEAM_ROLE_COLORS: Record<string, string> = {
    owner: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    lead: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    member: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {teams.map((team) => (
        <Link
          key={team.id}
          to={`/teams/${team.id}`}
          className="group rounded-xl border border-gray-200 bg-white p-5 shadow-soft transition-all hover:border-primary-200 hover:shadow-card dark:border-dark-border dark:bg-dark-card dark:hover:border-primary-700"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/30">
              <UserGroupIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-semibold text-gray-900 group-hover:text-primary-600 dark:text-white dark:group-hover:text-primary-400">
                {team.name}
              </h3>
              {team.description && (
                <p className="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
                  {team.description}
                </p>
              )}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1">
                <UsersIcon className="h-4 w-4" />
                {team.member_count}
              </span>
            </div>
            {team.current_user_role && (
              <span
                className={clsx(
                  "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                  TEAM_ROLE_COLORS[team.current_user_role] || TEAM_ROLE_COLORS.member
                )}
              >
                {team.current_user_role}
              </span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

// Organization Settings Modal
interface OrgSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  org: OrganizationDetail;
}

function OrgSettingsModal({ isOpen, onClose, org }: OrgSettingsModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(org.name);

  // Update organization mutation
  const updateMutation = useMutation({
    mutationFn: (data: { name: string }) => organizationsService.update(org.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", org.id] });
      toast.success("Organization updated");
      onClose();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update organization");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Organization name is required");
      return;
    }
    updateMutation.mutate({ name: name.trim() });
  };

  const handleClose = () => {
    setName(org.name);
    onClose();
  };

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md rounded-xl bg-white shadow-card dark:bg-dark-card">
                <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-dark-border">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 dark:bg-dark-elevated">
                      <Cog6ToothIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    </div>
                    <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                      Organization Settings
                    </Dialog.Title>
                  </div>
                  <button
                    onClick={handleClose}
                    className="rounded p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-elevated"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6">
                  <div>
                    <label
                      htmlFor="org-name"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      Organization Name
                    </label>
                    <input
                      id="org-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white"
                    />
                  </div>

                  <div className="mt-6 flex justify-end">
                    <button
                      type="submit"
                      disabled={updateMutation.isPending}
                      className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                    >
                      {updateMutation.isPending ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

// Add Member Modal
interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function AddMemberModal({ isOpen, onClose }: AddMemberModalProps) {
  // For now, we'll show an info message about using invite codes
  // In a full implementation, you might search for users by email

  const handleClose = () => {
    onClose();
  };

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md rounded-xl bg-white shadow-card dark:bg-dark-card">
                <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-dark-border">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 dark:bg-primary-900/30">
                      <PlusIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                    </div>
                    <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                      Add Member
                    </Dialog.Title>
                  </div>
                  <button
                    onClick={handleClose}
                    className="rounded p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-elevated"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                <div className="p-6">
                  <div className="rounded-xl bg-primary-50 p-4 dark:bg-primary-900/20">
                    <p className="text-sm text-primary-700 dark:text-primary-300">
                      <strong>Tip:</strong> The easiest way to add members is to create an invite code
                      and share the link with them. They can join instantly!
                    </p>
                  </div>

                  <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                    Go to the <strong>Invites</strong> tab to create shareable invite codes that allow
                    people to join your organization.
                  </p>

                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={handleClose}
                      className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
                    >
                      Got it
                    </button>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
