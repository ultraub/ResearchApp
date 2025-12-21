/**
 * Quick Idea Modal - Fast capture for thoughts on the go.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Lightbulb, Tag, Sparkles } from "lucide-react";
import { ideasService, type IdeaCreateData } from "@/services/ideas";
import toast from "react-hot-toast";

interface QuickIdeaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (ideaId: string) => void;
}

export function QuickIdeaModal({
  isOpen,
  onClose,
  onSuccess,
}: QuickIdeaModalProps) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const createMutation = useMutation({
    mutationFn: (data: IdeaCreateData) => ideasService.create(data),
    onSuccess: (idea) => {
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      toast.success("Idea captured!");
      onClose();
      resetForm();
      if (onSuccess) {
        onSuccess(idea.id);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to capture idea");
    },
  });

  const resetForm = () => {
    setContent("");
    setTitle("");
    setTags([]);
    setTagInput("");
    setShowAdvanced(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim()) {
      toast.error("Please enter your idea");
      return;
    }

    createMutation.mutate({
      content: content.trim(),
      title: title.trim() || undefined,
      tags: tags.length > 0 ? tags : undefined,
      source: "web",
    });
  };

  const handleClose = () => {
    if (!createMutation.isPending) {
      resetForm();
      onClose();
    }
  };

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput("");
    }
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  // Handle Cmd/Ctrl + Enter to submit
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-dark-card rounded-xl shadow-card w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <Lightbulb className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Quick Idea
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Capture your thought before it slips away
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={createMutation.isPending}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Main Content */}
          <div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What's on your mind?"
              rows={4}
              className="w-full border border-gray-300 dark:border-dark-border rounded-xl px-3 py-2 bg-white dark:bg-dark-elevated text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-none"
              autoFocus
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Press <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-dark-elevated rounded text-xs">⌘</kbd> + <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-dark-elevated rounded text-xs">Enter</kbd> to save
            </p>
          </div>

          {/* Advanced Options Toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
          >
            <Sparkles className="h-4 w-4" />
            {showAdvanced ? "Hide options" : "Add title & tags"}
          </button>

          {/* Advanced Options */}
          {showAdvanced && (
            <div className="space-y-4 pt-2">
              {/* Title (Optional) */}
              <div>
                <label
                  htmlFor="idea-title"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Title <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  id="idea-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Give your idea a title"
                  className="w-full border border-gray-300 dark:border-dark-border rounded-lg px-3 py-2 bg-white dark:bg-dark-elevated text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>

              {/* Tags */}
              <div>
                <label
                  htmlFor="idea-tags"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Tags <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Tag className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      id="idea-tags"
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      placeholder="Add a tag"
                      className="w-full border border-gray-300 dark:border-dark-border rounded-lg pl-9 pr-3 py-2 bg-white dark:bg-dark-elevated text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddTag}
                    disabled={!tagInput.trim()}
                    className="px-3 py-2 text-sm font-medium text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add
                  </button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-dark-elevated text-gray-700 dark:text-gray-300 rounded-full text-sm"
                      >
                        #{tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-dark-border">
            <button
              type="button"
              onClick={handleClose}
              disabled={createMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-elevated border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-base disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || !content.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {createMutation.isPending ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Saving...
                </>
              ) : (
                <>
                  <Lightbulb className="h-4 w-4" />
                  Capture Idea
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
