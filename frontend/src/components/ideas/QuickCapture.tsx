import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  LightBulbIcon,
  XMarkIcon,
  PaperAirplaneIcon,
  TagIcon,
} from "@heroicons/react/24/outline";
import { ideasService } from "@/services/ideas";

interface QuickCaptureProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function QuickCapture({ isOpen, onClose }: QuickCaptureProps) {
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: ideasService.create,
    onSuccess: () => {
      toast.success("Idea captured!");
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      setContent("");
      setTags([]);
      onClose();
    },
    onError: () => {
      toast.error("Failed to capture idea");
    },
  });

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  // Handle keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + I to open
      if ((e.metaKey || e.ctrlKey) && e.key === "i") {
        e.preventDefault();
        if (!isOpen) {
          // Parent should handle opening
        }
      }
      // Escape to close
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    createMutation.mutate({
      content: content.trim(),
      tags,
      source: "web",
    });
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const tag = tagInput.trim().toLowerCase();
      if (tag && !tags.includes(tag)) {
        setTags([...tags, tag]);
      }
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed left-1/2 top-1/4 z-50 w-full max-w-lg -translate-x-1/2 rounded-2xl bg-white p-6 shadow-card dark:bg-dark-card"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-500">
                <LightBulbIcon className="h-6 w-6" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Quick Idea
                </h2>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-elevated"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="What's on your mind? Capture it now, organize later..."
                className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-4 text-gray-900 placeholder-gray-500 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white dark:placeholder-gray-400"
                rows={4}
              />

              {/* Tags */}
              <div className="mt-3">
                <div className="flex flex-wrap items-center gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-sm text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    >
                      #{tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="hover:text-amber-900"
                      >
                        <XMarkIcon className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <div className="relative flex-1">
                    <TagIcon className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleAddTag}
                      placeholder="Add tags..."
                      className="w-full rounded-lg border-0 bg-transparent py-1.5 pl-8 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-0 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Press <kbd className="rounded bg-gray-200 px-1 dark:bg-dark-elevated">⌘I</kbd> to
                  quick capture anytime
                </p>
                <button
                  type="submit"
                  disabled={!content.trim() || createMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {createMutation.isPending ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <>
                      <PaperAirplaneIcon className="h-4 w-4" />
                      Capture
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
