/**
 * Task Metadata Panel - Editable fields for due date, time tracking, tags, and assignees
 */

import { useState, KeyboardEvent } from "react";
import {
  CalendarIcon,
  ClockIcon,
  TagIcon,
  UserGroupIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import type { Task, TaskAssignment } from "@/types";
import MultiUserSelect from "./MultiUserSelect";

interface TaskMetadataPanelProps {
  task: Task;
  isEditing?: boolean;
  onChange?: (field: string, value: unknown) => void;
  onAssigneesChange?: (userIds: string[]) => void;
  className?: string;
}

export default function TaskMetadataPanel({
  task,
  isEditing = false,
  onChange,
  onAssigneesChange,
  className = "",
}: TaskMetadataPanelProps) {
  const [newTag, setNewTag] = useState("");
  const [localTags, setLocalTags] = useState<string[]>(task.tags);

  // Get assignee user IDs from assignments
  const assigneeIds = task.assignments?.map((a) => a.user_id) || [];

  const handleAddTag = () => {
    const trimmedTag = newTag.trim().toLowerCase();
    if (trimmedTag && !localTags.includes(trimmedTag)) {
      const updatedTags = [...localTags, trimmedTag];
      setLocalTags(updatedTags);
      onChange?.("tags", updatedTags);
    }
    setNewTag("");
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const updatedTags = localTags.filter((t) => t !== tagToRemove);
    setLocalTags(updatedTags);
    onChange?.("tags", updatedTags);
  };

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    } else if (e.key === "Backspace" && newTag === "" && localTags.length > 0) {
      // Remove last tag when backspace on empty input
      const updatedTags = localTags.slice(0, -1);
      setLocalTags(updatedTags);
      onChange?.("tags", updatedTags);
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Due Date & Time Tracking Row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Due Date */}
        <div>
          <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <CalendarIcon className="h-4 w-4" />
            Due Date
          </label>
          <input
            type="date"
            value={task.due_date ? task.due_date.split("T")[0] : ""}
            onChange={(e) => onChange?.("due_date", e.target.value || null)}
            disabled={!isEditing}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:text-white disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-600 dark:bg-dark-card dark:disabled:bg-gray-800/50 dark:disabled:text-gray-400"
          />
        </div>

        {/* Estimated Hours */}
        <div>
          <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <ClockIcon className="h-4 w-4" />
            Estimated
          </label>
          <div className="relative">
            <input
              type="number"
              min="0"
              step="0.5"
              value={task.estimated_hours || ""}
              onChange={(e) =>
                onChange?.(
                  "estimated_hours",
                  e.target.value ? parseFloat(e.target.value) : null
                )
              }
              disabled={!isEditing}
              placeholder="0"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 pr-10 text-sm text-gray-900 dark:text-white disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-600 dark:bg-dark-card dark:disabled:bg-gray-800/50 dark:disabled:text-gray-400"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500">
              hrs
            </span>
          </div>
        </div>

        {/* Actual Hours */}
        <div>
          <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <ClockIcon className="h-4 w-4" />
            Actual
          </label>
          <div className="relative">
            <input
              type="number"
              min="0"
              step="0.5"
              value={task.actual_hours || ""}
              onChange={(e) =>
                onChange?.(
                  "actual_hours",
                  e.target.value ? parseFloat(e.target.value) : null
                )
              }
              disabled={!isEditing}
              placeholder="0"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 pr-10 text-sm text-gray-900 dark:text-white disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-600 dark:bg-dark-card dark:disabled:bg-gray-800/50 dark:disabled:text-gray-400"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500">
              hrs
            </span>
          </div>
        </div>
      </div>

      {/* Progress Bar (when both estimated and actual are set) */}
      {task.estimated_hours && task.estimated_hours > 0 && (
        <div className="px-1">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
            <span>Time Progress</span>
            <span>
              {task.actual_hours || 0} / {task.estimated_hours} hrs
              {task.actual_hours && task.actual_hours > task.estimated_hours && (
                <span className="ml-1 text-red-500">
                  (+{(task.actual_hours - task.estimated_hours).toFixed(1)})
                </span>
              )}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                task.actual_hours && task.actual_hours > task.estimated_hours
                  ? "bg-red-500"
                  : "bg-primary-500"
              }`}
              style={{
                width: `${Math.min(
                  ((task.actual_hours || 0) / task.estimated_hours) * 100,
                  100
                )}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Tags */}
      <div>
        <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          <TagIcon className="h-4 w-4" />
          Tags
        </label>
        <div className="flex flex-wrap gap-2 rounded-xl border border-gray-300 bg-white p-2 dark:border-dark-border dark:bg-dark-card shadow-soft">
          {localTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700 dark:bg-gray-700 dark:text-gray-300"
            >
              {tag}
              {isEditing && (
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="ml-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  type="button"
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {isEditing ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Add tag..."
                className="w-24 border-0 bg-transparent px-1 py-1 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 dark:text-white dark:placeholder:text-gray-500"
              />
              {newTag && (
                <button
                  onClick={handleAddTag}
                  className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                  type="button"
                >
                  <PlusIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          ) : (
            localTags.length === 0 && (
              <span className="text-sm text-gray-400 italic">No tags</span>
            )
          )}
        </div>
      </div>

      {/* Assignees */}
      <div>
        <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          <UserGroupIcon className="h-4 w-4" />
          Assignees
        </label>
        {isEditing && onAssigneesChange ? (
          <MultiUserSelect
            selectedUserIds={assigneeIds}
            onChange={onAssigneesChange}
            placeholder="Select assignees..."
          />
        ) : task.assignments && task.assignments.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {task.assignments.map((assignment) => (
              <AssigneeChip key={assignment.id} assignment={assignment} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">No assignees</p>
        )}
      </div>
    </div>
  );
}

// Helper component for assignee display
function AssigneeChip({ assignment }: { assignment: TaskAssignment }) {
  const roleColors: Record<string, string> = {
    lead: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    reviewer: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    observer: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
    assignee: "bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-400",
  };

  return (
    <div className="inline-flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-1.5 text-sm dark:bg-dark-elevated shadow-soft transition-all hover:shadow-md">
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
        {assignment.user_name?.[0]?.toUpperCase() || "?"}
      </div>
      <span className="text-gray-700 dark:text-gray-300">
        {assignment.user_name || assignment.user_email || "Unknown"}
      </span>
      <span
        className={`rounded px-1.5 py-0.5 text-xs ${
          roleColors[assignment.role] || roleColors.assignee
        }`}
      >
        {assignment.role}
      </span>
    </div>
  );
}
