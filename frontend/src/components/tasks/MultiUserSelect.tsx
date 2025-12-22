import { useState, useEffect, Fragment, useCallback } from "react";
import { Combobox, Transition } from "@headlessui/react";
import { CheckIcon, ChevronUpDownIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import { usersApi } from "@/services/users";
import { teamsService } from "@/services/teams";
import { useOrganizationStore } from "@/stores/organization";

// Common member type for display
type MemberInfo = {
  user_id: string;
  email: string;
  display_name: string;
  role: string;
};

interface MultiUserSelectProps {
  selectedUserIds: string[];
  onChange: (userIds: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  maxSelections?: number;
  teamId?: string; // Optional: specify team to fetch members from
}

export default function MultiUserSelect({
  selectedUserIds,
  onChange,
  placeholder = "Select assignees...",
  disabled = false,
  maxSelections,
  teamId,
}: MultiUserSelectProps) {
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const { organization, currentTeamId } = useOrganizationStore();

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

  const selectedMembers = members.filter((m) => selectedUserIds.includes(m.user_id));

  const filteredMembers =
    query === ""
      ? members
      : members.filter(
          (member) =>
            member.display_name.toLowerCase().includes(query.toLowerCase()) ||
            member.email.toLowerCase().includes(query.toLowerCase())
        );

  // Handle selection via Combobox onChange (proper HeadlessUI pattern)
  const handleComboboxChange = useCallback((member: MemberInfo | null) => {
    if (!member) return;

    if (selectedUserIds.includes(member.user_id)) {
      // Remove if already selected
      onChange(selectedUserIds.filter((id) => id !== member.user_id));
    } else {
      // Add if not at max
      if (maxSelections && selectedUserIds.length >= maxSelections) {
        return;
      }
      onChange([...selectedUserIds, member.user_id]);
    }
    // Clear the query after selection
    setQuery("");
  }, [selectedUserIds, onChange, maxSelections]);

  const handleRemove = useCallback((userId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(selectedUserIds.filter((id) => id !== userId));
  }, [selectedUserIds, onChange]);

  return (
    <div className="relative">
      <Combobox
        value={null as MemberInfo | null}
        onChange={handleComboboxChange}
        disabled={disabled}
        nullable
      >
        <div className="relative">
          <div className="relative w-full cursor-default overflow-hidden rounded-xl border border-gray-300 bg-white text-left shadow-soft focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500 dark:border-dark-border dark:bg-dark-card">
            {/* Selected users chips */}
            <div className="flex flex-wrap gap-1 p-1">
              {selectedMembers.map((member) => (
                <span
                  key={member.user_id}
                  className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-400"
                >
                  {member.display_name || member.email}
                  {!disabled && (
                    <button
                      type="button"
                      onClick={(e) => handleRemove(member.user_id, e)}
                      className="hover:text-primary-900 dark:hover:text-primary-200"
                    >
                      <XMarkIcon className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}

              <Combobox.Input
                className="flex-1 border-0 bg-transparent py-1 pl-1 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 dark:text-white dark:placeholder:text-gray-500"
                placeholder={selectedMembers.length === 0 ? placeholder : ""}
                onChange={(e) => setQuery(e.target.value)}
                value={query}
                // Prevent Grammarly from interfering
                data-gramm="false"
                data-gramm_editor="false"
                data-enable-grammarly="false"
              />
            </div>

            <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-2">
              <ChevronUpDownIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" aria-hidden="true" />
            </Combobox.Button>
          </div>

          <Transition
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
            afterLeave={() => setQuery("")}
          >
            <Combobox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5 dark:ring-white/10 focus:outline-none dark:bg-dark-card sm:text-sm">
              {loading ? (
                <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">Loading...</div>
              ) : filteredMembers.length === 0 ? (
                <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                  {query === "" ? "No team members found" : "No matches found"}
                </div>
              ) : (
                filteredMembers.map((member) => {
                  const isSelected = selectedUserIds.includes(member.user_id);
                  const isDisabledOption =
                    !isSelected && maxSelections && selectedUserIds.length >= maxSelections;

                  return (
                    <Combobox.Option
                      key={member.user_id}
                      value={member}
                      disabled={!!isDisabledOption}
                      className={({ active }) =>
                        clsx(
                          "relative cursor-pointer select-none py-2 pl-10 pr-4",
                          active
                            ? "bg-primary-50 text-primary-900 dark:bg-primary-900/20 dark:text-primary-100"
                            : "text-gray-900 dark:text-gray-100",
                          isDisabledOption && "cursor-not-allowed opacity-50"
                        )
                      }
                    >
                      <span
                        className={clsx(
                          "block truncate",
                          isSelected ? "font-medium" : "font-normal"
                        )}
                      >
                        {member.display_name || member.email}
                        {member.display_name && (
                          <span className="ml-2 text-gray-500 dark:text-gray-400">
                            {member.email}
                          </span>
                        )}
                      </span>

                      {isSelected && (
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-primary-600 dark:text-primary-400">
                          <CheckIcon className="h-5 w-5" aria-hidden="true" />
                        </span>
                      )}
                    </Combobox.Option>
                  );
                })
              )}
            </Combobox.Options>
          </Transition>
        </div>
      </Combobox>
    </div>
  );
}
