/**
 * Comment thread component with replies and reactions.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  MessageSquare,
  MoreVertical,
  Edit,
  Trash2,
  CheckCircle,
  Reply,
  Smile,
  Send,
  User,
} from 'lucide-react';
import { commentsApi, reactionsApi, type Comment } from '../../services/sharing';

interface CommentThreadProps {
  resourceType: string;
  resourceId: string;
  organizationId: string;
  currentUserId: string;
}

const commonEmojis = ['👍', '❤️', '🎉', '🤔', '😊', '🚀'];

function ReactionBar({
  resourceType,
  resourceId,
  currentUserId,
}: {
  resourceType: string;
  resourceId: string;
  currentUserId: string;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const queryClient = useQueryClient();

  const { data: reactions } = useQuery({
    queryKey: ['reactions', resourceType, resourceId],
    queryFn: () =>
      reactionsApi.list({
        resource_type: resourceType,
        resource_id: resourceId,
        user_id: currentUserId,
      }),
  });

  const addReactionMutation = useMutation({
    mutationFn: (emoji: string) =>
      reactionsApi.add({
        resource_type: resourceType,
        resource_id: resourceId,
        emoji,
        user_id: currentUserId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reactions', resourceType, resourceId] });
    },
  });

  const removeReactionMutation = useMutation({
    mutationFn: (emoji: string) =>
      reactionsApi.remove({
        resource_type: resourceType,
        resource_id: resourceId,
        emoji,
        user_id: currentUserId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reactions', resourceType, resourceId] });
    },
  });

  const handleReaction = (emoji: string, userReacted: boolean) => {
    if (userReacted) {
      removeReactionMutation.mutate(emoji);
    } else {
      addReactionMutation.mutate(emoji);
    }
    setShowPicker(false);
  };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {/* Existing reactions */}
      {reactions?.map((reaction) => (
        <button
          key={reaction.emoji}
          onClick={() => handleReaction(reaction.emoji, reaction.user_reacted)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
            reaction.user_reacted
              ? 'bg-primary-100 text-primary-700 border border-primary-300 dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-700'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-dark-elevated dark:text-gray-300 dark:hover:bg-gray-700'
          }`}
        >
          <span>{reaction.emoji}</span>
          <span>{reaction.count}</span>
        </button>
      ))}

      {/* Add reaction button */}
      <div className="relative">
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="p-1 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 rounded"
        >
          <Smile className="h-4 w-4" />
        </button>

        {showPicker && (
          <div className="absolute left-0 bottom-full mb-1 bg-white dark:bg-dark-card rounded-xl shadow-card border border-gray-200 dark:border-dark-border p-2 flex gap-1 z-10">
            {commonEmojis.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleReaction(emoji, false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-dark-elevated rounded"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CommentItem({
  comment,
  currentUserId,
  organizationId: _organizationId,
  onReply,
  depth = 0,
}: {
  comment: Comment;
  currentUserId: string;
  organizationId: string;
  onReply: (parentId: string) => void;
  depth?: number;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [showMenu, setShowMenu] = useState(false);
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: () => commentsApi.update(comment.id, editContent),
    onSuccess: () => {
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['comments'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => commentsApi.delete(comment.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments'] });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: () => commentsApi.resolve(comment.id, currentUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments'] });
    },
  });

  const isAuthor = comment.author_id === currentUserId;
  const maxDepth = 2;

  if (comment.is_deleted) {
    return (
      <div className="py-2 px-3 text-gray-400 italic text-sm">
        This comment has been deleted
      </div>
    );
  }

  return (
    <div className={`${depth > 0 ? 'ml-8 border-l-2 border-gray-100 dark:border-gray-700 pl-4' : ''}`}>
      <div className="py-3">
        <div className="flex gap-3">
          {/* Avatar */}
          {comment.author_avatar ? (
            <img
              src={comment.author_avatar}
              alt={comment.author_name || 'User'}
              className="h-8 w-8 rounded-full flex-shrink-0"
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
              <User className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-gray-900 dark:text-white">
                  {comment.author_name || 'Unknown'}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                </span>
                {comment.is_edited && <span className="text-xs text-gray-400 dark:text-gray-500">(edited)</span>}
                {comment.is_resolved && (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle className="h-3 w-3" />
                    Resolved
                  </span>
                )}
              </div>

              {/* Menu */}
              {isAuthor && (
                <div className="relative">
                  <button
                    onClick={() => setShowMenu(!showMenu)}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 rounded"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>

                  {showMenu && (
                    <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-dark-card rounded-xl shadow-card border border-gray-200 dark:border-dark-border py-1 z-10">
                      <button
                        onClick={() => {
                          setIsEditing(true);
                          setShowMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-elevated"
                      >
                        <Edit className="h-4 w-4" />
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          deleteMutation.mutate();
                          setShowMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                      {!comment.is_resolved && depth === 0 && (
                        <button
                          onClick={() => {
                            resolveMutation.mutate();
                            setShowMenu(false);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20"
                        >
                          <CheckCircle className="h-4 w-4" />
                          Resolve
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Content */}
            {isEditing ? (
              <div className="mt-2 space-y-2">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full border border-gray-300 dark:border-dark-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none dark:bg-dark-elevated dark:text-gray-100"
                  rows={3}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => updateMutation.mutate()}
                    disabled={updateMutation.isPending || !editContent.trim()}
                    className="px-3 py-1 bg-primary-600 text-white text-sm rounded-xl hover:bg-primary-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setEditContent(comment.content);
                    }}
                    className="px-3 py-1 text-gray-600 dark:text-gray-400 text-sm hover:bg-gray-100 dark:hover:bg-dark-elevated rounded-xl"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="mt-1 text-sm text-gray-700 dark:text-gray-300 prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: comment.content_html || comment.content }}
              />
            )}

            {/* Actions */}
            {!isEditing && (
              <div className="flex items-center gap-3 mt-2">
                <ReactionBar
                  resourceType="comment"
                  resourceId={comment.id}
                  currentUserId={currentUserId}
                />
                {depth < maxDepth && (
                  <button
                    onClick={() => onReply(comment.id)}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                  >
                    <Reply className="h-3 w-3" />
                    Reply
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CommentInput({
  resourceType,
  resourceId,
  organizationId,
  currentUserId,
  parentId,
  onCancel,
  placeholder = 'Write a comment...',
}: {
  resourceType: string;
  resourceId: string;
  organizationId: string;
  currentUserId: string;
  parentId?: string;
  onCancel?: () => void;
  placeholder?: string;
}) {
  const [content, setContent] = useState('');
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () =>
      commentsApi.create({
        content,
        resource_type: resourceType,
        resource_id: resourceId,
        parent_id: parentId,
        author_id: currentUserId,
        organization_id: organizationId,
      }),
    onSuccess: () => {
      setContent('');
      queryClient.invalidateQueries({ queryKey: ['comments'] });
      onCancel?.();
    },
  });

  return (
    <div className="flex gap-3">
      <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
        <User className="h-4 w-4 text-gray-500 dark:text-gray-400" />
      </div>
      <div className="flex-1">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="w-full border border-gray-300 dark:border-dark-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none dark:bg-dark-elevated dark:text-gray-100"
        />
        <div className="flex justify-end gap-2 mt-2">
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-elevated rounded-xl"
            >
              Cancel
            </button>
          )}
          <button
            onClick={() => createMutation.mutate()}
            disabled={!content.trim() || createMutation.isPending}
            className="flex items-center gap-1 px-3 py-1 bg-primary-600 text-white text-sm rounded-xl hover:bg-primary-700 disabled:opacity-50"
          >
            <Send className="h-3 w-3" />
            {createMutation.isPending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CommentThread({
  resourceType,
  resourceId,
  organizationId,
  currentUserId,
}: CommentThreadProps) {
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['comments', resourceType, resourceId],
    queryFn: () =>
      commentsApi.list({
        resource_type: resourceType,
        resource_id: resourceId,
        include_replies: true,
      }),
  });

  const comments = data?.comments || [];

  // Build comment tree
  const rootComments = comments.filter((c) => !c.parent_id);
  const repliesMap = comments.reduce(
    (acc, comment) => {
      if (comment.parent_id) {
        if (!acc[comment.parent_id]) acc[comment.parent_id] = [];
        acc[comment.parent_id].push(comment);
      }
      return acc;
    },
    {} as Record<string, Comment[]>
  );

  const renderComment = (comment: Comment, depth: number) => (
    <div key={comment.id}>
      <CommentItem
        comment={comment}
        currentUserId={currentUserId}
        organizationId={organizationId}
        onReply={(parentId) => setReplyingTo(parentId)}
        depth={depth}
      />

      {/* Reply input */}
      {replyingTo === comment.id && (
        <div className="ml-12 mb-3">
          <CommentInput
            resourceType={resourceType}
            resourceId={resourceId}
            organizationId={organizationId}
            currentUserId={currentUserId}
            parentId={comment.id}
            onCancel={() => setReplyingTo(null)}
            placeholder={`Reply to ${comment.author_name || 'comment'}...`}
          />
        </div>
      )}

      {/* Nested replies */}
      {repliesMap[comment.id]?.map((reply) => renderComment(reply, depth + 1))}
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="animate-pulse flex gap-3">
            <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
              <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-gray-500 dark:text-gray-400" />
        <h3 className="font-medium text-gray-900 dark:text-white">Comments ({data?.total || 0})</h3>
      </div>

      {/* Comment input */}
      <CommentInput
        resourceType={resourceType}
        resourceId={resourceId}
        organizationId={organizationId}
        currentUserId={currentUserId}
      />

      {/* Comments list */}
      {rootComments.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <MessageSquare className="h-12 w-12 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
          <p>No comments yet</p>
          <p className="text-sm mt-1">Be the first to comment!</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {rootComments.map((comment) => renderComment(comment, 0))}
        </div>
      )}
    </div>
  );
}
