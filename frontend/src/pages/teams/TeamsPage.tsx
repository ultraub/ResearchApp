/**
 * TeamsPage - Grid view of all teams the user is a member of
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  PlusIcon,
  UserGroupIcon,
  MagnifyingGlassIcon,
  TicketIcon,
} from "@heroicons/react/24/outline";
import { TeamCard, CreateTeamModal, TeamSettingsModal } from "@/components/teams";
import { JoinModal } from "@/components/invitations";
import { teamsService } from "@/services/teams";
import type { TeamDetail } from "@/types";

export default function TeamsPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [selectedTeamForSettings, setSelectedTeamForSettings] = useState<TeamDetail | null>(null);

  // Fetch teams
  const {
    data: teamsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["teams"],
    queryFn: () => teamsService.list({ page_size: 100 }),
  });

  const teams = teamsData?.items || [];

  // Filter teams by search
  const filteredTeams = teams.filter((team) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      team.name.toLowerCase().includes(query) ||
      (team.description?.toLowerCase().includes(query) ?? false)
    );
  });

  const handleTeamCreated = (teamId: string) => {
    navigate(`/teams/${teamId}`);
  };

  return (
    <div className="min-h-full bg-gray-50 dark:bg-dark-base">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white dark:border-dark-border dark:bg-dark-card">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Teams</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Manage your teams and collaborate with others
              </p>
            </div>
            <div className="flex gap-2 sm:gap-3">
              <button
                onClick={() => setIsJoinModalOpen(true)}
                className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:px-4 dark:border-dark-border dark:bg-dark-elevated dark:text-gray-300 dark:hover:bg-dark-card"
              >
                <TicketIcon className="h-5 w-5" />
                <span className="hidden sm:inline">Join Team</span>
              </button>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 sm:px-4"
              >
                <PlusIcon className="h-5 w-5" />
                <span className="hidden sm:inline">Create Team</span>
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="mt-4">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search teams..."
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white dark:placeholder-gray-500 sm:max-w-xs"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-40 animate-pulse rounded-xl bg-gray-200 dark:bg-dark-elevated"
              />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
            <p className="text-red-600 dark:text-red-400">Failed to load teams</p>
          </div>
        ) : filteredTeams.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center dark:border-gray-600">
            <UserGroupIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
              {searchQuery ? "No teams found" : "No teams yet"}
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {searchQuery
                ? "Try adjusting your search"
                : "Create a team or join one with an invite code"}
            </p>
            {!searchQuery && (
              <div className="mt-6 flex justify-center gap-3">
                <button
                  onClick={() => setIsJoinModalOpen(true)}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-dark-border dark:text-gray-300 dark:hover:bg-dark-elevated"
                >
                  <TicketIcon className="h-5 w-5" />
                  Join with Code
                </button>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
                >
                  <PlusIcon className="h-5 w-5" />
                  Create Team
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTeams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                onSettingsClick={() => setSelectedTeamForSettings(team)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Team Modal */}
      <CreateTeamModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleTeamCreated}
      />

      {/* Join Modal */}
      <JoinModal
        isOpen={isJoinModalOpen}
        onClose={() => setIsJoinModalOpen(false)}
      />

      {/* Team Settings Modal */}
      {selectedTeamForSettings && (
        <TeamSettingsModal
          isOpen={!!selectedTeamForSettings}
          onClose={() => setSelectedTeamForSettings(null)}
          team={selectedTeamForSettings}
        />
      )}
    </div>
  );
}
