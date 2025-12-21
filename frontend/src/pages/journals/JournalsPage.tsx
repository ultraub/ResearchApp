/**
 * Journals Page - Main journal entries page with list and modal
 */

import { useState } from "react";
import { BookOpenIcon } from "@heroicons/react/24/outline";
import { JournalEntryList, JournalEntryModal } from "@/components/journals";
import type { CreateEntryContext } from "@/components/journals";
import type { JournalEntry, JournalScope } from "@/types";

export default function JournalsPage() {
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [createScope, setCreateScope] = useState<JournalScope>("personal");
  const [createProjectId, setCreateProjectId] = useState<string | null>(null);

  const handleEntryClick = (entry: JournalEntry) => {
    setSelectedEntryId(entry.id);
    setIsModalOpen(true);
  };

  const handleCreateClick = (context?: CreateEntryContext) => {
    setSelectedEntryId(null);
    // Use context from the list if provided, otherwise default to personal
    if (context) {
      setCreateScope(context.scope);
      setCreateProjectId(context.projectId);
    } else {
      setCreateScope("personal");
      setCreateProjectId(null);
    }
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedEntryId(null);
  };

  return (
    <div className="p-6">
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary-100 p-2 dark:bg-primary-900/30">
            <BookOpenIcon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Journal</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Capture observations, experiments, ideas, and reflections
            </p>
          </div>
        </div>
      </div>

      {/* Entry list */}
      <JournalEntryList
        onEntryClick={handleEntryClick}
        onCreateClick={handleCreateClick}
      />

      {/* Entry modal */}
      <JournalEntryModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        entryId={selectedEntryId}
        defaultScope={createScope}
        projectId={createProjectId ?? undefined}
        onEntryChange={() => {
          // Entries list will refetch via React Query
        }}
      />
    </div>
  );
}
