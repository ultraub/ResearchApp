/**
 * TeamMembersModal - View and manage team members
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
import { teamsService } from "@/services/teams";
import { usersApi } from "@/services/users";
import { useOrganizationStore } from "@/stores/organization";
import { TEAMS_QUERY_KEY } from "@/hooks/useTeams";
import type { TeamMember, TeamMemberRole, TeamDetail } from "@/types";

interface TeamMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  team: TeamDetail;
}

const ROLE_OPTIONS: { value: TeamMemberRole; label: string; description: string }[] = [
  { value: "owner", label: "Owner", description: "Full control, can delete team" },
  { value: "lead", label: "Lead", description: "Can manage members and settings" },
  { value: "member", label: "Member", description: "Access to team projects" },
];

const ROLE_COLORS: Record<TeamMemberRole, string> = {
  owner: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  lead: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  member: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

export function TeamMembersModal({ isOpen, onClose, team }: TeamMembersModalProps) {
  const queryClient = useQueryClient();
  const { refreshTeams } = useOrganizationStore();
  const [showAddMember, setShowAddMember] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<TeamMemberRole>("member");
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const canManage = team.current_user_role === "owner" || team.current_user_role === "lead";
  const isOwner = team.current_user_role === "owner";

  // Fetch team members
  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ["team-members", team.id],
    queryFn: () => teamsService.getMembers(team.id),
    enabled: isOpen,
  });

  // Fetch all users for adding (search across all users)
  const { data: allUsers = [], isLoading: usersLoading } = useQuery({
    queryKey: ["users-search", searchQuery],
    queryFn: () => usersApi.listUsers(searchQuery || undefined),
    enabled: isOpen && showAddMember,
  });

  // Filter out users who are already members
  const availableUsers = allUsers.filter(
    (user) => !members.some((m) => m.user_id === user.user_id)
  );

  // Add member mutation
  const addMemberMutation = useMutation({
    mutationFn: (data: { user_id: string; role: TeamMemberRole }) =>
      teamsService.addMember(team.id, data),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["team-members", team.id] });
      queryClient.invalidateQueries({ queryKey: TEAMS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      await refreshTeams();
      toast.success("Member added successfully");
      setShowAddMember(false);
      setSelectedUserId(null);
      setSelectedRole("member");
      setSearchQuery("");
    },
    onError: () => {
      toast.error("Failed to add member");
    },
  });

  // Update member role mutation
  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: TeamMemberRole }) =>
      teamsService.updateMember(team.id, userId, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members", team.id] });
      toast.success("Role updated");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update role");
    },
  });

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => teamsService.removeMember(team.id, userId),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["team-members", team.id] });
      queryClient.invalidateQueries({ queryKey: TEAMS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      await refreshTeams();
      toast.success("Member removed");
      setMemberToRemove(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to remove member");
    },
  });

  const handleAddMember = () => {
    if (!selectedUserId) {
      toast.error("Please select a user");
      return;
    }
    addMemberMutation.mutate({ user_id: selectedUserId, role: selectedRole });
  };

  const handleRoleChange = (member: TeamMember, newRole: TeamMemberRole) => {
    // Prevent changing the last owner's role
    const ownerCount = members.filter((m) => m.role === "owner").length;
    if (member.role === "owner" && ownerCount === 1 && newRole !== "owner") {
      toast.error("Cannot change role of the last owner");
      return;
    }
    // Only owners can assign owner role
    if (newRole === "owner" && !isOwner) {
      toast.error("Only team owners can assign owner role");
      return;
    }
    updateRoleMutation.mutate({ userId: member.user_id, role: newRole });
  };

  const handleRemoveMember = (member: TeamMember) => {
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

  // Get display info for a member
  const getMemberDisplayName = (member: TeamMember): string => {
    if (member.display_name) return member.display_name;
    if (member.user_name) return member.user_name;
    if (member.email) return member.email;
    if (member.user_email) return member.user_email;
    return "Unknown User";
  };

  const getMemberEmail = (member: TeamMember): string => {
    if (member.email) return member.email;
    if (member.user_email) return member.user_email;
    return "";
  };

  // Get role options based on user permissions
  const getAvailableRoles = () => {
    if (isOwner) {
      return ROLE_OPTIONS;
    }
    // Leads can only assign lead and member roles
    return ROLE_OPTIONS.filter((r) => r.value !== "owner");
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
                <Dialog.Panel className="w-full max-w-lg rounded-xl bg-white shadow-xl dark:bg-dark-card">
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-dark-border">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-600">
                        <UserGroupIcon className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                          Team Members
                        </Dialog.Title>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{team.name}</p>
                      </div>
                    </div>
                    <button
                      onClick={onClose}
                      className="rounded p-2 text-gray-400 transition-all hover:bg-gray-100 dark:hover:bg-dark-elevated"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>

                  {/* Content */}
                  <div className="space-y-6 p-6">
                    {/* Add Member Section */}
                    {canManage && (
                      <>
                        {!showAddMember ? (
                          <button
                            onClick={() => setShowAddMember(true)}
                            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 py-3 text-sm font-medium text-gray-600 hover:border-primary-400 hover:text-primary-600 dark:border-gray-600 dark:text-gray-400 dark:hover:border-primary-500 dark:hover:text-primary-400"
                          >
                            <UserPlusIcon className="h-5 w-5" />
                            Add Member
                          </button>
                        ) : (
                          <div className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-dark-border">
                            <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                              Add a new member
                            </h4>

                            {/* Search input */}
                            <input
                              type="text"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              placeholder="Search by name or email..."
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white"
                            />

                            {/* User selector */}
                            <Listbox value={selectedUserId} onChange={setSelectedUserId}>
                              <div className="relative">
                                <Listbox.Button className="relative w-full cursor-pointer rounded-lg border border-gray-300 bg-white py-2.5 pl-3 pr-10 text-left text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated">
                                  {selectedUserId ? (
                                    <span>
                                      {availableUsers.find((m) => m.user_id === selectedUserId)
                                        ?.display_name ||
                                        availableUsers.find((m) => m.user_id === selectedUserId)
                                          ?.email}
                                    </span>
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
                                  <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white py-1 shadow-soft ring-1 ring-black/5 dark:ring-white/10 dark:bg-dark-elevated">
                                    {usersLoading ? (
                                      <div className="px-3 py-2 text-sm text-gray-500">
                                        Loading...
                                      </div>
                                    ) : availableUsers.length === 0 ? (
                                      <div className="px-3 py-2 text-sm text-gray-500">
                                        {searchQuery ? "No users found" : "No users available to add"}
                                      </div>
                                    ) : (
                                      availableUsers.map((user) => (
                                        <Listbox.Option
                                          key={user.user_id}
                                          value={user.user_id}
                                          className={({ active }) =>
                                            clsx(
                                              "cursor-pointer px-3 py-2 text-sm transition-colors",
                                              active && "bg-gray-100 dark:bg-dark-base"
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
                                <Listbox.Button className="relative w-full cursor-pointer rounded-lg border border-gray-300 bg-white py-2.5 pl-3 pr-10 text-left text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated">
                                  <span>
                                    {getAvailableRoles().find((r) => r.value === selectedRole)
                                      ?.label}
                                  </span>
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
                                  <Listbox.Options className="absolute z-10 mt-1 w-full overflow-auto rounded-lg bg-white py-1 shadow-soft ring-1 ring-black/5 dark:ring-white/10 dark:bg-dark-elevated">
                                    {getAvailableRoles().map((role) => (
                                      <Listbox.Option
                                        key={role.value}
                                        value={role.value}
                                        className={({ active }) =>
                                          clsx(
                                            "cursor-pointer px-3 py-2 transition-colors",
                                            active && "bg-gray-100 dark:bg-dark-base"
                                          )
                                        }
                                      >
                                        {({ selected }) => (
                                          <div className="flex items-center justify-between">
                                            <div>
                                              <span
                                                className={clsx("text-sm", selected && "font-medium")}
                                              >
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
                                  setSearchQuery("");
                                }}
                                className="rounded-lg px-3 py-1.5 text-sm text-gray-600 transition-all hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-dark-elevated"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={handleAddMember}
                                disabled={!selectedUserId || addMemberMutation.isPending}
                                className="rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 px-3 py-1.5 text-sm font-medium text-white shadow-soft transition-all hover:shadow-md disabled:opacity-50"
                              >
                                {addMemberMutation.isPending ? "Adding..." : "Add Member"}
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Members List */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Members ({members.length})
                      </h4>

                      {membersLoading ? (
                        <div className="space-y-2">
                          {[1, 2, 3].map((i) => (
                            <div
                              key={i}
                              className="h-14 animate-pulse rounded-lg bg-gray-100 dark:bg-dark-elevated"
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
                              className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-dark-border"
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-primary-500 text-sm font-medium text-white">
                                  {getMemberDisplayName(member).charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                                    {getMemberDisplayName(member)}
                                  </p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {getMemberEmail(member)}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {/* Role dropdown */}
                                {canManage ? (
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
                                        <Listbox.Options className="absolute right-0 z-10 mt-1 w-32 overflow-auto rounded-lg bg-white py-1 shadow-soft ring-1 ring-black/5 dark:ring-white/10 dark:bg-dark-elevated">
                                          {getAvailableRoles().map((role) => (
                                            <Listbox.Option
                                              key={role.value}
                                              value={role.value}
                                              className={({ active }) =>
                                                clsx(
                                                  "cursor-pointer px-3 py-1.5 text-sm transition-colors",
                                                  active && "bg-gray-100 dark:bg-dark-base"
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
                                ) : (
                                  <span
                                    className={clsx(
                                      "rounded-full px-2.5 py-1 text-xs font-medium",
                                      ROLE_COLORS[member.role]
                                    )}
                                  >
                                    {member.role}
                                  </span>
                                )}

                                {/* Remove button */}
                                {canManage && (
                                  <button
                                    onClick={() => handleRemoveMember(member)}
                                    className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
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
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="border-t border-gray-200 px-6 py-4 dark:border-dark-border">
                    <button
                      onClick={onClose}
                      className="w-full rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-200 dark:bg-dark-elevated dark:text-gray-300 dark:hover:bg-gray-600"
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
                <Dialog.Panel className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-dark-card">
                  <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                    Remove Member
                  </Dialog.Title>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    Are you sure you want to remove{" "}
                    <span className="font-medium">
                      {memberToRemove && getMemberDisplayName(memberToRemove)}
                    </span>{" "}
                    from this team? They will lose access to all team projects.
                  </p>
                  <div className="mt-4 flex justify-end gap-3">
                    <button
                      onClick={() => setMemberToRemove(null)}
                      className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-elevated"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirmRemoveMember}
                      disabled={removeMemberMutation.isPending}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-soft transition-all hover:bg-red-700 hover:shadow-md disabled:opacity-50"
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
