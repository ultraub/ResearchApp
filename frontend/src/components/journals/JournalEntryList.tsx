/**
 * Journal Entry List - Chronological list with filters
 */

import { useState, useMemo, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PlusIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  CalendarIcon,
  FolderIcon,
} from "@heroicons/react/24/outline";
import { Listbox, Transition } from "@headlessui/react";
import { ChevronUpDownIcon, CheckIcon } from "@heroicons/react/20/solid";
import { format } from "date-fns";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import {
  getJournalEntries,
  getJournalTags,
  updateJournalEntry,
} from "@/services/journals";
import { projectsService } from "@/services/projects";
import type { JournalEntry, JournalEntryType, JournalListParams } from "@/types";
import JournalEntryCard from "./JournalEntryCard";
import JournalScopeSelector from "./JournalScopeSelector";
import JournalTagFilter from "./JournalTagFilter";

export interface CreateEntryContext {
  scope: "personal" | "project";
  projectId: string | null;
}

interface JournalEntryListProps {
  projectId?: string;
  onEntryClick?: (entry: JournalEntry) => void;
  onCreateClick?: (context?: CreateEntryContext) => void;
  className?: string;
}

const entryTypeOptions: { value: JournalEntryType | "all"; label: string }[] = [
  { value: "all", label: "All Types" },
  { value: "observation", label: "Observations" },
  { value: "experiment", label: "Experiments" },
  { value: "meeting", label: "Meetings" },
  { value: "idea", label: "Ideas" },
  { value: "reflection", label: "Reflections" },
  { value: "protocol", label: "Protocols" },
];

export default function JournalEntryList({
  projectId,
  onEntryClick,
  onCreateClick,
  className,
}: JournalEntryListProps) {
  const queryClient = useQueryClient();

  // Filter state
  const [scope, setScope] = useState<"personal" | "project" | "all">(
    projectId ? "project" : "all"
  );
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string | null>(projectId || null);
  const [entryType, setEntryType] = useState<JournalEntryType | "all">("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Fetch projects for filter dropdown
  const { data: projectsData } = useQuery({
    queryKey: ["projects-for-journal-filter"],
    queryFn: () => projectsService.list({ status: "active", page_size: 100 }),
    enabled: !projectId, // Only fetch if not already filtered by a specific project
  });

  const projects = projectsData?.items || [];

  // Build query params
  const queryParams: JournalListParams = useMemo(
    () => ({
      scope: scope === "all" ? undefined : scope,
      project_id: scope === "project" ? (selectedProjectFilter || undefined) : undefined,
      entry_type: entryType === "all" ? undefined : entryType,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
      search: searchQuery || undefined,
      page,
      page_size: pageSize,
      sort_by: "entry_date",
      sort_order: "desc",
    }),
    [scope, selectedProjectFilter, entryType, selectedTags, searchQuery, page]
  );

  // Fetch entries
  const { data: entriesData, isLoading } = useQuery({
    queryKey: ["journal-entries", queryParams],
    queryFn: () => getJournalEntries(queryParams),
  });

  // Fetch available tags
  const { data: availableTags = [] } = useQuery({
    queryKey: ["journal-tags", scope, projectId],
    queryFn: () => getJournalTags({ scope: scope === "all" ? undefined : scope, project_id: projectId }),
  });

  // Pin/unpin mutation
  const pinMutation = useMutation({
    mutationFn: ({ entryId, isPinned }: { entryId: string; isPinned: boolean }) =>
      updateJournalEntry(entryId, { is_pinned: isPinned }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
    },
    onError: () => {
      toast.error("Failed to update pin status");
    },
  });

  const handleTogglePin = (entry: JournalEntry) => {
    pinMutation.mutate({ entryId: entry.id, isPinned: !entry.is_pinned });
  };

  // Helper to pass current filter context when creating new entry
  const handleCreateClick = () => {
    if (onCreateClick) {
      // If we're in a fixed project context (projectId prop), use that
      if (projectId) {
        onCreateClick({ scope: "project", projectId });
      } else if (scope === "project" && selectedProjectFilter) {
        // If user has selected project scope and a specific project in filters
        onCreateClick({ scope: "project", projectId: selectedProjectFilter });
      } else if (scope === "personal") {
        onCreateClick({ scope: "personal", projectId: null });
      } else {
        // Default - "all" scope or project scope without specific project
        onCreateClick();
      }
    }
  };

  // Group entries by date
  const groupedEntries = useMemo(() => {
    if (!entriesData?.items) return new Map<string, JournalEntry[]>();

    const groups = new Map<string, JournalEntry[]>();

    // Sort pinned first within each date group
    const sortedItems = [...entriesData.items].sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      return 0;
    });

    for (const entry of sortedItems) {
      const dateKey = entry.entry_date;
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(entry);
    }

    return groups;
  }, [entriesData]);

  const totalPages = entriesData ? Math.ceil(entriesData.total / pageSize) : 1;

  return (
    <div className={clsx("space-y-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
          Journal
        </h2>
        {onCreateClick && (
          <button
            onClick={handleCreateClick}
            className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            <PlusIcon className="h-5 w-5" />
            New Entry
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="space-y-4">
        {/* Scope selector and project filter */}
        {!projectId && (
          <div className="flex flex-col sm:flex-row gap-3">
            <JournalScopeSelector
              value={scope}
              onChange={(newScope) => {
                setScope(newScope);
                setPage(1);
                // Clear project filter when switching away from project scope
                if (newScope !== "project") {
                  setSelectedProjectFilter(null);
                }
              }}
            />

            {/* Project filter - only when viewing project scope */}
            {scope === "project" && projects.length > 0 && (
              <Listbox value={selectedProjectFilter} onChange={(value) => {
                setSelectedProjectFilter(value);
                setPage(1);
              }}>
                <div className="relative min-w-[200px]">
                  <Listbox.Button className="relative w-full cursor-pointer rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-10 text-left text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-card dark:text-white">
                    <FolderIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                    <span className="block truncate">
                      {selectedProjectFilter
                        ? projects.find((p) => p.id === selectedProjectFilter)?.name || "Unknown Project"
                        : "All Projects"}
                    </span>
                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                      <ChevronUpDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                    </span>
                  </Listbox.Button>
                  <Transition
                    as={Fragment}
                    leave="transition ease-in duration-100"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-gray-200 bg-white py-1 text-sm shadow-card focus:outline-none dark:border-dark-border dark:bg-dark-card">
                      <Listbox.Option
                        value={null}
                        className={({ active }) =>
                          clsx(
                            "relative cursor-pointer select-none py-2 pl-10 pr-4",
                            active
                              ? "bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400"
                              : "text-gray-900 dark:text-white"
                          )
                        }
                      >
                        {({ selected }) => (
                          <>
                            <span className={clsx("block truncate", selected && "font-medium")}>
                              All Projects
                            </span>
                            {selected && (
                              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-primary-600">
                                <CheckIcon className="h-5 w-5" aria-hidden="true" />
                              </span>
                            )}
                          </>
                        )}
                      </Listbox.Option>
                      {projects.map((project) => (
                        <Listbox.Option
                          key={project.id}
                          value={project.id}
                          className={({ active }) =>
                            clsx(
                              "relative cursor-pointer select-none py-2 pl-10 pr-4",
                              active
                                ? "bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400"
                                : "text-gray-900 dark:text-white"
                            )
                          }
                        >
                          {({ selected }) => (
                            <>
                              <span className={clsx("block truncate", selected && "font-medium")}>
                                {project.name}
                              </span>
                              {selected && (
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-primary-600">
                                  <CheckIcon className="h-5 w-5" aria-hidden="true" />
                                </span>
                              )}
                            </>
                          )}
                        </Listbox.Option>
                      ))}
                    </Listbox.Options>
                  </Transition>
                </div>
              </Listbox>
            )}
          </div>
        )}

        {/* Search and type filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search entries..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-card dark:text-white"
            />
          </div>

          {/* Entry type filter */}
          <div className="flex items-center gap-2">
            <FunnelIcon className="h-5 w-5 text-gray-400" />
            <select
              value={entryType}
              onChange={(e) => {
                setEntryType(e.target.value as JournalEntryType | "all");
                setPage(1);
              }}
              className="rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-card dark:text-white"
            >
              {entryTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tag filter */}
        {availableTags.length > 0 && (
          <JournalTagFilter
            availableTags={availableTags}
            selectedTags={selectedTags}
            onTagsChange={(tags) => {
              setSelectedTags(tags);
              setPage(1);
            }}
          />
        )}
      </div>

      {/* Entry list */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-xl bg-gray-100 dark:bg-dark-card"
            />
          ))}
        </div>
      ) : groupedEntries.size === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center dark:border-gray-600">
          <CalendarIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
            No journal entries yet
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Start capturing your observations, experiments, and ideas.
          </p>
          {onCreateClick && (
            <button
              onClick={handleCreateClick}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              <PlusIcon className="h-5 w-5" />
              Create your first entry
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {Array.from(groupedEntries.entries()).map(([dateKey, entries]) => (
            <div key={dateKey}>
              {/* Date header */}
              <div className="mb-4 flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-gray-400" />
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {format(new Date(dateKey), "EEEE, MMMM d, yyyy")}
                </h3>
                <div className="flex-1 border-t border-gray-200 dark:border-dark-border" />
              </div>

              {/* Entries for this date */}
              <div className="space-y-3">
                {entries.map((entry) => (
                  <JournalEntryCard
                    key={entry.id}
                    entry={entry}
                    onClick={() => onEntryClick?.(entry)}
                    onTogglePin={handleTogglePin}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-200 pt-4 dark:border-dark-border">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Showing {(page - 1) * pageSize + 1} to{" "}
            {Math.min(page * pageSize, entriesData?.total || 0)} of{" "}
            {entriesData?.total || 0} entries
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className={clsx(
                "rounded-lg px-3 py-1 text-sm",
                page === 1
                  ? "cursor-not-allowed text-gray-400"
                  : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-elevated"
              )}
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className={clsx(
                "rounded-lg px-3 py-1 text-sm",
                page === totalPages
                  ? "cursor-not-allowed text-gray-400"
                  : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-elevated"
              )}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
