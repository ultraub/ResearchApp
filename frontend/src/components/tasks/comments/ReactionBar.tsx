import { useMutation, useQueryClient } from "@tanstack/react-query";
import { tasksService } from "@/services/tasks";
import type { ReactionSummary } from "@/types";
import ReactionPicker, { emojiToDisplay } from "./ReactionPicker";
import clsx from "clsx";

interface ReactionBarProps {
  taskId: string;
  commentId: string;
  reactions: ReactionSummary[];
}

export default function ReactionBar({ taskId, commentId, reactions }: ReactionBarProps) {
  const queryClient = useQueryClient();

  const addReactionMutation = useMutation({
    mutationFn: (emoji: string) => tasksService.addReaction(taskId, commentId, emoji),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskComments", taskId] });
    },
  });

  const removeReactionMutation = useMutation({
    mutationFn: (emoji: string) => tasksService.removeReaction(taskId, commentId, emoji),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskComments", taskId] });
    },
  });

  const handleReactionClick = (reaction: ReactionSummary) => {
    if (reaction.user_reacted) {
      removeReactionMutation.mutate(reaction.emoji);
    } else {
      addReactionMutation.mutate(reaction.emoji);
    }
  };

  const handleAddNewReaction = (emoji: string) => {
    // Check if this emoji already exists in reactions
    const existing = reactions.find((r) => r.emoji === emoji);
    if (existing?.user_reacted) {
      // User already reacted with this emoji, remove it
      removeReactionMutation.mutate(emoji);
    } else {
      // Add the reaction
      addReactionMutation.mutate(emoji);
    }
  };

  const isLoading = addReactionMutation.isPending || removeReactionMutation.isPending;

  return (
    <div className="flex items-center gap-1 mt-1 flex-wrap">
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          onClick={() => handleReactionClick(reaction)}
          disabled={isLoading}
          className={clsx(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all shadow-soft hover:shadow-md",
            reaction.user_reacted
              ? "bg-primary-100 text-primary-700 hover:bg-primary-200 border border-primary-300 dark:bg-primary-900/40 dark:text-primary-300 dark:hover:bg-primary-900/60 dark:border-primary-700"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200 dark:bg-dark-elevated dark:text-gray-300 dark:hover:bg-gray-600 dark:border-dark-border",
            isLoading && "opacity-50 cursor-not-allowed"
          )}
          title={reaction.user_reacted ? "Click to remove your reaction" : "Click to add your reaction"}
        >
          <span>{emojiToDisplay(reaction.emoji)}</span>
          <span>{reaction.count}</span>
        </button>
      ))}
      <ReactionPicker onSelect={handleAddNewReaction} disabled={isLoading} />
    </div>
  );
}
