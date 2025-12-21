/**
 * MentionAutocomplete - Dropdown for selecting users when typing @
 */

import { useState, useEffect, useRef } from "react";
import { usersApi } from "@/services/users";
import { teamsService } from "@/services/teams";
import { useOrganizationStore } from "@/stores/organization";
import { clsx } from "clsx";

// Common member type for display (both org and team members have these fields)
export type MemberInfo = {
  user_id: string;
  email: string;
  display_name: string;
  role: string;
};

interface MentionAutocompleteProps {
  isOpen: boolean;
  query: string;
  position: { top: number; left: number };
  onSelect: (member: MemberInfo) => void;
  onClose: () => void;
  teamId?: string; // Optional: specify team to fetch members from
}

export default function MentionAutocomplete({
  isOpen,
  query,
  position,
  onSelect,
  onClose,
  teamId,
}: MentionAutocompleteProps) {
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const { organization, currentTeamId } = useOrganizationStore();
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch members: prefer org members, fall back to team members
  useEffect(() => {
    async function fetchMembers() {
      setLoading(true);
      try {
        if (organization?.id) {
          // Fetch org members if in an organization
          const data = await usersApi.getOrganizationMembers(organization.id);
          setMembers(data);
        } else {
          // Fall back to team members for personal teams
          const effectiveTeamId = teamId || currentTeamId;
          if (effectiveTeamId) {
            const data = await teamsService.getMembers(effectiveTeamId);
            // Map to common format (team members have same shape)
            setMembers(data.map(m => ({
              user_id: m.user_id,
              email: m.email || "",
              display_name: m.display_name || m.email || "Unknown",
              role: m.role,
            })));
          }
        }
      } catch (error) {
        console.error("Failed to fetch members:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchMembers();
  }, [organization?.id, teamId, currentTeamId]);

  // Filter members based on query
  const filteredMembers =
    query === ""
      ? members.slice(0, 5) // Show first 5 when no query
      : members.filter(
          (member) =>
            member.display_name.toLowerCase().includes(query.toLowerCase()) ||
            member.email.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 5); // Limit to 5 results

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className="fixed z-50"
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      <div className="rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-dark-card">
        <div className="max-h-48 overflow-auto py-1">
          {loading ? (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              Loading...
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              No users found
            </div>
          ) : (
            filteredMembers.map((member) => (
              <button
                key={member.user_id}
                onClick={() => onSelect(member)}
                className={clsx(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                  "hover:bg-primary-50 dark:hover:bg-primary-900/20",
                  "focus:bg-primary-50 focus:outline-none dark:focus:bg-primary-900/20"
                )}
              >
                {/* Avatar */}
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
                  {member.display_name?.[0]?.toUpperCase() || member.email[0].toUpperCase()}
                </div>

                {/* Name and email */}
                <div className="flex-1 truncate">
                  <div className="font-medium text-gray-900 dark:text-white">
                    {member.display_name || member.email}
                  </div>
                  {member.display_name && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {member.email}
                    </div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
