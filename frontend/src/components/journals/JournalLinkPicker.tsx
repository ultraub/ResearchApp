/**
 * Journal Link Picker - Modal to select and link items to a journal entry
 */

import { Fragment, useState } from "react";
import { Dialog, Transition, RadioGroup, Tab } from "@headlessui/react";
import {
  XMarkIcon,
  MagnifyingGlassIcon,
  FolderIcon,
  ClipboardDocumentListIcon,
  DocumentTextIcon,
  BookOpenIcon,
} from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import type { LinkedEntityType, JournalLinkType, JournalEntryLinkCreate } from "@/types";

interface JournalLinkPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onLinkAdd: (link: JournalEntryLinkCreate) => void;
  // These would be passed from parent after fetching
  projects?: Array<{ id: string; name: string }>;
  tasks?: Array<{ id: string; title: string; project_name?: string }>;
  documents?: Array<{ id: string; title: string }>;
  papers?: Array<{ id: string; title: string; authors?: string }>;
}

const entityTypes: { type: LinkedEntityType; label: string; icon: typeof FolderIcon }[] = [
  { type: "project", label: "Projects", icon: FolderIcon },
  { type: "task", label: "Tasks", icon: ClipboardDocumentListIcon },
  { type: "document", label: "Documents", icon: DocumentTextIcon },
  { type: "paper", label: "Papers", icon: BookOpenIcon },
];

const linkTypes: { value: JournalLinkType; label: string; description: string }[] = [
  { value: "reference", label: "Reference", description: "Referenced in the entry" },
  { value: "result", label: "Result", description: "Produced as a result" },
  { value: "follow_up", label: "Follow-up", description: "Requires follow-up action" },
  { value: "related", label: "Related", description: "Related to the entry" },
];

export default function JournalLinkPicker({
  isOpen,
  onClose,
  onLinkAdd,
  projects = [],
  tasks = [],
  documents = [],
  papers = [],
}: JournalLinkPickerProps) {
  const [selectedType, setSelectedType] = useState<LinkedEntityType>("project");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedLinkType, setSelectedLinkType] = useState<JournalLinkType>("reference");
  const [notes, setNotes] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const handleSubmit = () => {
    if (!selectedEntityId) return;

    onLinkAdd({
      linked_entity_type: selectedType,
      linked_entity_id: selectedEntityId,
      link_type: selectedLinkType,
      notes: notes.trim() || undefined,
    });

    // Reset state
    setSelectedEntityId(null);
    setNotes("");
    setSearchQuery("");
    onClose();
  };

  const getItems = () => {
    let items: Array<{ id: string; title: string; subtitle?: string }> = [];

    switch (selectedType) {
      case "project":
        items = projects.map((p) => ({ id: p.id, title: p.name }));
        break;
      case "task":
        items = tasks.map((t) => ({ id: t.id, title: t.title, subtitle: t.project_name }));
        break;
      case "document":
        items = documents.map((d) => ({ id: d.id, title: d.title }));
        break;
      case "paper":
        items = papers.map((p) => ({ id: p.id, title: p.title, subtitle: p.authors }));
        break;
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          item.subtitle?.toLowerCase().includes(query)
      );
    }

    return items;
  };

  const items = getItems();

  return (
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

        {/* Modal */}
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
              <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-xl bg-white shadow-xl transition-all dark:bg-dark-card">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-dark-border">
                  <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                    Link an Item
                  </Dialog.Title>
                  <button
                    onClick={onClose}
                    className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-elevated"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  {/* Entity type tabs */}
                  <Tab.Group
                    selectedIndex={entityTypes.findIndex((t) => t.type === selectedType)}
                    onChange={(index) => {
                      setSelectedType(entityTypes[index].type);
                      setSelectedEntityId(null);
                    }}
                  >
                    <Tab.List className="flex space-x-1 rounded-lg bg-gray-100 p-1 dark:bg-dark-elevated">
                      {entityTypes.map((entityType) => {
                        const Icon = entityType.icon;
                        return (
                          <Tab
                            key={entityType.type}
                            className={({ selected }) =>
                              clsx(
                                "flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                                "focus:outline-none",
                                selected
                                  ? "bg-white text-gray-900 shadow-soft dark:bg-dark-card dark:text-white"
                                  : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
                              )
                            }
                          >
                            <Icon className="h-4 w-4" />
                            {entityType.label}
                          </Tab>
                        );
                      })}
                    </Tab.List>
                  </Tab.Group>

                  {/* Search */}
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder={`Search ${selectedType}s...`}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-card dark:text-white"
                    />
                  </div>

                  {/* Items list */}
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-200 dark:border-dark-border">
                    {items.length === 0 ? (
                      <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                        No {selectedType}s found
                      </div>
                    ) : (
                      <RadioGroup value={selectedEntityId} onChange={setSelectedEntityId}>
                        <div className="divide-y divide-gray-200 dark:divide-dark-border">
                          {items.map((item) => (
                            <RadioGroup.Option
                              key={item.id}
                              value={item.id}
                              className={({ checked }) =>
                                clsx(
                                  "cursor-pointer p-3 transition-colors",
                                  checked
                                    ? "bg-primary-50 dark:bg-primary-900/20"
                                    : "hover:bg-gray-50 dark:hover:bg-dark-elevated"
                                )
                              }
                            >
                              {({ checked }) => (
                                <div className="flex items-center gap-3">
                                  <div
                                    className={clsx(
                                      "h-4 w-4 rounded-full border-2",
                                      checked
                                        ? "border-primary-500 bg-primary-500"
                                        : "border-gray-200 dark:border-dark-border"
                                    )}
                                  >
                                    {checked && (
                                      <div className="h-full w-full flex items-center justify-center">
                                        <div className="h-1.5 w-1.5 rounded-full bg-white" />
                                      </div>
                                    )}
                                  </div>
                                  <div>
                                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                                      {item.title}
                                    </div>
                                    {item.subtitle && (
                                      <div className="text-xs text-gray-500 dark:text-gray-400">
                                        {item.subtitle}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </RadioGroup.Option>
                          ))}
                        </div>
                      </RadioGroup>
                    )}
                  </div>

                  {/* Link type selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Link Type
                    </label>
                    <RadioGroup value={selectedLinkType} onChange={setSelectedLinkType}>
                      <div className="grid grid-cols-2 gap-2">
                        {linkTypes.map((linkType) => (
                          <RadioGroup.Option
                            key={linkType.value}
                            value={linkType.value}
                            className={({ checked }) =>
                              clsx(
                                "cursor-pointer rounded-lg border p-3 transition-colors",
                                checked
                                  ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                                  : "border-gray-200 hover:border-gray-300 dark:border-dark-border dark:hover:border-gray-500"
                              )
                            }
                          >
                            {({ checked }) => (
                              <div>
                                <div
                                  className={clsx(
                                    "text-sm font-medium",
                                    checked
                                      ? "text-primary-700 dark:text-primary-400"
                                      : "text-gray-900 dark:text-white"
                                  )}
                                >
                                  {linkType.label}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {linkType.description}
                                </div>
                              </div>
                            )}
                          </RadioGroup.Option>
                        ))}
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Notes (optional)
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add any notes about this link..."
                      rows={2}
                      className="w-full rounded-lg border border-gray-200 bg-white p-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-card dark:text-white"
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-dark-border">
                  <button
                    onClick={onClose}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-elevated"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!selectedEntityId}
                    className={clsx(
                      "rounded-lg px-4 py-2 text-sm font-medium text-white",
                      selectedEntityId
                        ? "bg-primary-600 hover:bg-primary-700"
                        : "cursor-not-allowed bg-gray-300 dark:bg-gray-600"
                    )}
                  >
                    Add Link
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
