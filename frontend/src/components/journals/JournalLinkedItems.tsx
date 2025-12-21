/**
 * Journal Linked Items - Display and manage linked items for a journal entry
 */

import {
  FolderIcon,
  ClipboardDocumentListIcon,
  DocumentTextIcon,
  BookOpenIcon,
  XMarkIcon,
  LinkIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import type { JournalEntryLink, LinkedEntityType, JournalLinkType } from "@/types";

interface JournalLinkedItemsProps {
  links: JournalEntryLink[];
  onRemoveLink?: (linkId: string) => void;
  onAddLink?: () => void;
  editable?: boolean;
  className?: string;
}

const entityTypeConfig: Record<LinkedEntityType, { icon: typeof FolderIcon; label: string; color: string }> = {
  project: {
    icon: FolderIcon,
    label: "Project",
    color: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
  },
  task: {
    icon: ClipboardDocumentListIcon,
    label: "Task",
    color: "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20"
  },
  document: {
    icon: DocumentTextIcon,
    label: "Document",
    color: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20"
  },
  paper: {
    icon: BookOpenIcon,
    label: "Paper",
    color: "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20"
  },
};

const linkTypeLabels: Record<JournalLinkType, string> = {
  reference: "Reference",
  result: "Result",
  follow_up: "Follow-up",
  related: "Related",
};

export default function JournalLinkedItems({
  links,
  onRemoveLink,
  onAddLink,
  editable = true,
  className,
}: JournalLinkedItemsProps) {
  if (links.length === 0 && !editable) {
    return null;
  }

  return (
    <div className={clsx("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          <LinkIcon className="h-4 w-4" />
          <span>Linked Items</span>
          {links.length > 0 && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-dark-elevated dark:text-gray-400">
              {links.length}
            </span>
          )}
        </div>
        {editable && onAddLink && (
          <button
            onClick={onAddLink}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-900/20"
          >
            <PlusIcon className="h-4 w-4" />
            Add Link
          </button>
        )}
      </div>

      {links.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-sm text-gray-500 dark:border-dark-border dark:text-gray-400">
          No linked items yet. Add links to projects, tasks, documents, or papers.
        </div>
      ) : (
        <div className="space-y-2">
          {links.map((link) => {
            const config = entityTypeConfig[link.linked_entity_type];
            const Icon = config.icon;

            return (
              <div
                key={link.id}
                className="flex items-center justify-between rounded-xl border border-gray-200 p-3 dark:border-dark-border"
              >
                <div className="flex items-center gap-3">
                  {/* Entity type icon */}
                  <div className={clsx("rounded-md p-2", config.color)}>
                    <Icon className="h-4 w-4" />
                  </div>

                  <div>
                    {/* Title */}
                    <div className="font-medium text-gray-900 dark:text-white">
                      {link.linked_entity_title || `${config.label} ${link.linked_entity_id.slice(0, 8)}...`}
                    </div>

                    {/* Link type and notes */}
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-dark-elevated">
                        {linkTypeLabels[link.link_type]}
                      </span>
                      {link.notes && (
                        <span className="truncate max-w-[200px]">{link.notes}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Remove button */}
                {editable && onRemoveLink && (
                  <button
                    onClick={() => onRemoveLink(link.id)}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-elevated dark:hover:text-gray-300"
                    title="Remove link"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
