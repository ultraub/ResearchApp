/**
 * Project Members Modal - View and manage project members
 */

import { useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, Transition, Listbox } from "@headlessui/react";
import {
  XMarkIcon,
  UserGroupIcon,
  UserPlusIcon,
  ChevronUpDownIcon,
  CheckIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import { projectsService, type ProjectMember } from "@/services/projects";
import { teamsService } from "@/services/teams";
import { usersApi, type UserListItem } from "@/services/users";

interface ProjectMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  /** Team ID for fetching team members with implicit access */
  teamId?: string;
  /** Organization ID for scoped user selection */
  organizationId?: string | null;
  /** Project scope - affects available user pool and UX */
  scope?: "private" | "team" | "organization";
  /** Whether this is a personal project */
  isPersonalProject?: boolean;
}

const ROLE_OPTIONS: { value: ProjectMember["role"]; label: string; description: string }[] = [
  { value: "owner", label: "Owner", description: "Full access, can delete project" },
  { value: "admin", label: "Admin", description: "Can manage members and settings" },
  { value: "member", label: "Member", description: "Can create and edit content" },
  { value: "viewer", label: "Viewer", description: "Read-only access" },
];

const ROLE_COLORS: Record<ProjectMember["role"], string> = {
  owner: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  admin: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  member: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  viewer: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
};

export function ProjectMembersModal({
  isOpen,
  onClose,
  projectId,
  projectName,
  teamId,
  organizationId,
  scope: _scope = "team", // Available for future scope-aware UX enhancements
  isPersonalProject = false,
}: ProjectMembersModalProps) {
  const queryClient = useQueryClient();
  const [showAddMember, setShowAddMember] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<ProjectMember["role"]>("member");
  const [memberToRemove, setMemberToRemove] = useState<ProjectMember | null>(null);

  // Fetch project members
  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: () => projectsService.getMembers(projectId),
    enabled: isOpen,
  });

  // Fetch team members with implicit access
  const { data: teamMembers = [] } = useQuery({
    queryKey: ["team-members", teamId],
    queryFn: () => teamsService.getMembers(teamId!),
    enabled: isOpen && !!teamId,
  });

  // Team members who have implicit access but are NOT explicit project members
  const implicitAccessMembers = teamMembers.filter(
    (tm) => !members.some((m) => m.user_id === tm.user_id)
  );

  // Fetch available users for adding - org-scoped when possible
  const { data: availableMembersList = [] } = useQuery<UserListItem[]>({
    queryKey: organizationId
      ? ["org-members-for-selection", organizationId]
      : ["all-users"],
    queryFn: async () => {
      if (organizationId) {
        // Fetch org members and transform to UserListItem format
        const orgMembers = await usersApi.getOrganizationMembers(organizationId);
        return orgMembers.map(m => ({
          user_id: m.user_id,
          email: m.email,
          display_name: m.display_name,
        }));
      }
      // Fallback to all users for personal projects without org context
      return usersApi.listUsers();
    },
    enabled: isOpen && showAddMember,
  });

  // Filter out users who are already members
  const availableUsers = availableMembersList.filter(
    (member) => !members.some((m) => m.user_id === member.user_id)
  );

  // Add member mutation
  const addMemberMutation = useMutation({
    mutationFn: (data: { user_id: string; role: string }) =>
      projectsService.addMember(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
      toast.success("Member added successfully");
      setShowAddMember(false);
      setSelectedUserId(null);
      setSelectedRole("member");
    },
    onError: () => {
      toast.error("Failed to add member");
    },
  });

  // Update member role mutation
  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      projectsService.updateMember(projectId, userId, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
      toast.success("Role updated");
    },
    onError: () => {
      toast.error("Failed to update role");
    },
  });

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => projectsService.removeMember(projectId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
      toast.success("Member removed");
      setMemberToRemove(null);
    },
    onError: () => {
      toast.error("Failed to remove member");
    },
  });

  const handleAddMember = () => {
    if (!selectedUserId) {
      toast.error("Please select a user");
      return;
    }
    addMemberMutation.mutate({ user_id: selectedUserId, role: selectedRole });
  };

  const handleRoleChange = (member: ProjectMember, newRole: ProjectMember["role"]) => {
    // Prevent changing the last owner's role
    const ownerCount = members.filter((m) => m.role === "owner").length;
    if (member.role === "owner" && ownerCount === 1 && newRole !== "owner") {
      toast.error("Cannot change role of the last owner");
      return;
    }
    updateRoleMutation.mutate({ userId: member.user_id, role: newRole });
  };

  const handleRemoveMember = (member: ProjectMember) => {
    // Prevent removing the last owner
    const ownerCount = members.filter((m) => m.role === "owner").length;
    if (member.role === "owner" && ownerCount === 1) {
      toast.error("Cannot remove the last owner");
      return;
    }
    setMemberToRemove(member);
  };

  const confirmRemoveMember = () => {
    if (memberToRemove) {
      removeMemberMutation.mutate(memberToRemove.user_id);
    }
  };

  // Get display name for a user ID from available members list
  const getUserDisplayName = (userId: string): string => {
    const member = availableMembersList.find((m) => m.user_id === userId);
    return member?.display_name || member?.email || "Unknown User";
  };

  const getUserEmail = (userId: string): string => {
    const member = availableMembersList.find((m) => m.user_id === userId);
    return member?.email || "";
  };

  return (
    <>
      <Transition show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={onClose}>
          {/* Backdrop */}
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
                <Dialog.Panel className="w-full max-w-lg rounded-xl bg-white shadow-card dark:bg-dark-card">
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-dark-border">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/30">
                        <UserGroupIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                      </div>
                      <div>
                        <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                          Project Members
                        </Dialog.Title>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {projectName}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={onClose}
                      className="rounded p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-elevated"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>

                  {/* Content */}
                  <div className="p-6 space-y-6">
                    {/* Personal Project Info Banner */}
                    {isPersonalProject && (
                      <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 dark:bg-blue-900/20 dark:border-blue-800">
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          This is a personal project. You can invite collaborators to work with you without changing the project scope.
                        </p>
                      </div>
                    )}

                    {/* Add Member Section */}
                    {!showAddMember ? (
                      <button
                        onClick={() => setShowAddMember(true)}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 py-3 text-sm font-medium text-gray-600 hover:border-primary-400 hover:text-primary-600 dark:border-gray-600 dark:text-gray-400 dark:hover:border-primary-500 dark:hover:text-primary-400"
                      >
                        <UserPlusIcon className="h-5 w-5" />
                        {isPersonalProject ? "Invite Collaborator" : "Add Member"}
                      </button>
                    ) : (
                      <div className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-dark-border">
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                          {isPersonalProject ? "Invite a collaborator" : "Add a new member"}
                        </h4>

                        {/* User selector */}
                        <Listbox value={selectedUserId} onChange={setSelectedUserId}>
                          <div className="relative">
                            <Listbox.Button className="relative w-full cursor-pointer rounded-lg border border-gray-200 bg-white py-2.5 pl-3 pr-10 text-left text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated">
                              {selectedUserId ? (
                                <span>{getUserDisplayName(selectedUserId)}</span>
                              ) : (
                                <span className="text-gray-500">Select a user...</span>
                              )}
                              <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
                              </span>
                            </Listbox.Button>
                            <Transition
                              as={Fragment}
                              leave="transition ease-in duration-100"
                              leaveFrom="opacity-100"
                              leaveTo="opacity-0"
                            >
                              <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl bg-white py-1 shadow-card ring-1 ring-black/5 dark:ring-white/10 dark:bg-dark-elevated">
                                {availableUsers.length === 0 ? (
                                  <div className="px-3 py-2 text-sm text-gray-500">
                                    No users available to add
                                  </div>
                                ) : (
                                  availableUsers.map((user) => (
                                    <Listbox.Option
                                      key={user.user_id}
                                      value={user.user_id}
                                      className={({ active }) =>
                                        clsx(
                                          "cursor-pointer px-3 py-2 text-sm",
                                          active && "bg-gray-100 dark:bg-dark-elevated/50"
                                        )
                                      }
                                    >
                                      {({ selected }) => (
                                        <div className="flex items-center justify-between">
                                          <div>
                                            <span className={clsx(selected && "font-medium")}>
                                              {user.display_name || user.email}
                                            </span>
                                            {user.display_name && (
                                              <span className="ml-2 text-gray-500 dark:text-gray-400">
                                                {user.email}
                                              </span>
                                            )}
                                          </div>
                                          {selected && (
                                            <CheckIcon className="h-4 w-4 text-primary-600" />
                                          )}
                                        </div>
                                      )}
                                    </Listbox.Option>
                                  ))
                                )}
                              </Listbox.Options>
                            </Transition>
                          </div>
                        </Listbox>

                        {/* Role selector */}
                        <Listbox value={selectedRole} onChange={setSelectedRole}>
                          <div className="relative">
                            <Listbox.Button className="relative w-full cursor-pointer rounded-lg border border-gray-200 bg-white py-2.5 pl-3 pr-10 text-left text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated">
                              <span>{ROLE_OPTIONS.find((r) => r.value === selectedRole)?.label}</span>
                              <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
                              </span>
                            </Listbox.Button>
                            <Transition
                              as={Fragment}
                              leave="transition ease-in duration-100"
                              leaveFrom="opacity-100"
                              leaveTo="opacity-0"
                            >
                              <Listbox.Options className="absolute z-10 mt-1 w-full overflow-auto rounded-xl bg-white py-1 shadow-card ring-1 ring-black/5 dark:ring-white/10 dark:bg-dark-elevated">
                                {ROLE_OPTIONS.map((role) => (
                                  <Listbox.Option
                                    key={role.value}
                                    value={role.value}
                                    className={({ active }) =>
                                      clsx(
                                        "cursor-pointer px-3 py-2",
                                        active && "bg-gray-100 dark:bg-dark-elevated/50"
                                      )
                                    }
                                  >
                                    {({ selected }) => (
                                      <div className="flex items-center justify-between">
                                        <div>
                                          <span className={clsx("text-sm", selected && "font-medium")}>
                                            {role.label}
                                          </span>
                                          <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {role.description}
                                          </p>
                                        </div>
                                        {selected && (
                                          <CheckIcon className="h-4 w-4 text-primary-600" />
                                        )}
                                      </div>
                                    )}
                                  </Listbox.Option>
                                ))}
                              </Listbox.Options>
                            </Transition>
                          </div>
                        </Listbox>

                        {/* Add/Cancel buttons */}
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setShowAddMember(false);
                              setSelectedUserId(null);
                              setSelectedRole("member");
                            }}
                            className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-dark-elevated"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleAddMember}
                            disabled={!selectedUserId || addMemberMutation.isPending}
                            className="rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:from-primary-600 hover:to-primary-700 disabled:opacity-50 transition-all"
                          >
                            {addMemberMutation.isPending ? "Adding..." : "Add Member"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Members List */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Current Members ({members.length})
                      </h4>

                      {membersLoading ? (
                        <div className="space-y-2">
                          {[1, 2, 3].map((i) => (
                            <div
                              key={i}
                              className="h-14 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700"
                            />
                          ))}
                        </div>
                      ) : members.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          No members yet. Add the first member above.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {members.map((member) => (
                            <div
                              key={member.id}
                              className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-dark-border transition-all hover:shadow-soft"
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600 dark:bg-dark-elevated dark:text-gray-300">
                                  {getUserDisplayName(member.user_id).charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                                    {getUserDisplayName(member.user_id)}
                                  </p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {getUserEmail(member.user_id)}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {/* Role dropdown */}
                                <Listbox
                                  value={member.role}
                                  onChange={(newRole) => handleRoleChange(member, newRole)}
                                >
                                  <div className="relative">
                                    <Listbox.Button
                                      className={clsx(
                                        "rounded-full px-2.5 py-1 text-xs font-medium",
                                        ROLE_COLORS[member.role]
                                      )}
                                    >
                                      {member.role}
                                    </Listbox.Button>
                                    <Transition
                                      as={Fragment}
                                      leave="transition ease-in duration-100"
                                      leaveFrom="opacity-100"
                                      leaveTo="opacity-0"
                                    >
                                      <Listbox.Options className="absolute right-0 z-10 mt-1 w-32 overflow-auto rounded-xl bg-white py-1 shadow-card ring-1 ring-black/5 dark:ring-white/10 dark:bg-dark-elevated">
                                        {ROLE_OPTIONS.map((role) => (
                                          <Listbox.Option
                                            key={role.value}
                                            value={role.value}
                                            className={({ active }) =>
                                              clsx(
                                                "cursor-pointer px-3 py-1.5 text-sm",
                                                active && "bg-gray-100 dark:bg-dark-elevated/50"
                                              )
                                            }
                                          >
                                            {role.label}
                                          </Listbox.Option>
                                        ))}
                                      </Listbox.Options>
                                    </Transition>
                                  </div>
                                </Listbox>

                                {/* Remove button */}
                                <button
                                  onClick={() => handleRemoveMember(member)}
                                  className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                                  title="Remove member"
                                >
                                  <TrashIcon className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Team Members with Implicit Access - hide for personal projects */}
                    {!isPersonalProject && implicitAccessMembers.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Team Members with Access ({implicitAccessMembers.length})
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          These users have access via team membership
                        </p>
                        <div className="space-y-2">
                          {implicitAccessMembers.map((tm) => (
                            <div
                              key={tm.user_id}
                              className="flex items-center justify-between rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3 dark:border-dark-border dark:bg-dark-base"
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-500 dark:bg-dark-elevated dark:text-gray-400">
                                  {(tm.display_name || tm.email || "?").charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    {tm.display_name || tm.email || "Unknown"}
                                  </p>
                                  {tm.email && tm.display_name && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      {tm.email}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500 dark:bg-dark-elevated dark:text-gray-400">
                                Team {tm.role}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="border-t border-gray-200 px-6 py-4 dark:border-dark-border">
                    <button
                      onClick={onClose}
                      className="w-full rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-dark-elevated dark:text-gray-300 dark:hover:bg-dark-elevated/80"
                    >
                      Done
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Remove confirmation dialog */}
      <Transition show={!!memberToRemove} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={() => setMemberToRemove(null)}
        >
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
                      {memberToRemove && getUserDisplayName(memberToRemove.user_id)}
                    </span>{" "}
                    from this project? They will lose access immediately.
                  </p>
                  <div className="mt-4 flex justify-end gap-3">
                    <button
                      onClick={() => setMemberToRemove(null)}
                      className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-elevated"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirmRemoveMember}
                      disabled={removeMemberMutation.isPending}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-all"
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
    </>
  );
}
