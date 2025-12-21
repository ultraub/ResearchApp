/**
 * InviteCodesList - List and manage existing invite codes
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LinkIcon,
  TrashIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import { teamsService } from "@/services/teams";
import { organizationsService } from "@/services/organizations";
import { InviteCodeGenerator } from "./InviteCodeGenerator";
import type { InviteCode } from "@/types";

type InviteTarget = {
  type: "team" | "organization";
  id: string;
  name: string;
};

interface InviteCodesListProps {
  target: InviteTarget;
}

export function InviteCodesList({ target }: InviteCodesListProps) {
  const queryClient = useQueryClient();
  const [showGenerator, setShowGenerator] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const queryKey = target.type === "team" ? ["team-invites", target.id] : ["org-invites", target.id];

  // Fetch invite codes
  const { data: invites = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => {
      if (target.type === "team") {
        return teamsService.getInvites(target.id);
      } else {
        return organizationsService.getInvites(target.id);
      }
    },
  });

  // Revoke invite mutation
  const revokeMutation = useMutation({
    mutationFn: (inviteId: string) => {
      if (target.type === "team") {
        return teamsService.revokeInvite(target.id, inviteId);
      } else {
        return organizationsService.revokeInvite(target.id, inviteId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Invite code revoked");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to revoke invite");
    },
  });

  const getInviteUrl = (code: string) => {
    return `${window.location.origin}/join/${code}`;
  };

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(getInviteUrl(code));
      setCopiedCode(code);
      toast.success("Invite link copied!");
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const isExpired = (invite: InviteCode) => {
    if (!invite.expires_at) return false;
    return new Date(invite.expires_at) < new Date();
  };

  const isMaxedOut = (invite: InviteCode) => {
    if (invite.max_uses === null) return false;
    return invite.use_count >= invite.max_uses;
  };

  const getStatus = (invite: InviteCode) => {
    if (!invite.is_active) return { label: "Revoked", color: "text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400" };
    if (isExpired(invite)) return { label: "Expired", color: "text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400" };
    if (isMaxedOut(invite)) return { label: "Max uses reached", color: "text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400" };
    return { label: "Active", color: "text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400" };
  };

  return (
    <div className="space-y-4">
      {/* Header with create button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Invite Codes
        </h3>
        <button
          onClick={() => setShowGenerator(true)}
          className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
        >
          <PlusIcon className="h-4 w-4" />
          Create Invite
        </button>
      </div>

      {/* Invite codes list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-lg bg-gray-100 dark:bg-dark-elevated"
            />
          ))}
        </div>
      ) : invites.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-6 text-center dark:border-dark-border">
          <LinkIcon className="mx-auto h-8 w-8 text-gray-400" />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            No invite codes yet. Create one to invite people.
          </p>
          <button
            onClick={() => setShowGenerator(true)}
            className="mt-3 text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
          >
            Create first invite code
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {invites.map((invite) => {
            const status = getStatus(invite);
            const isUsable = invite.is_active && !isExpired(invite) && !isMaxedOut(invite);

            return (
              <div
                key={invite.id}
                className={clsx(
                  "rounded-lg border p-4",
                  isUsable
                    ? "border-gray-200 dark:border-dark-border"
                    : "border-gray-200 bg-gray-50 dark:border-dark-border dark:bg-dark-base"
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    {/* Code display */}
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-gray-100 px-2 py-0.5 text-sm font-mono text-gray-800 dark:bg-dark-elevated dark:text-gray-200">
                        {invite.code}
                      </code>
                      <span className={clsx("rounded-full px-2 py-0.5 text-xs font-medium", status.color)}>
                        {status.label}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                      <span>Role: <strong className="capitalize">{invite.role}</strong></span>
                      <span>
                        Uses: {invite.use_count}{invite.max_uses !== null ? `/${invite.max_uses}` : ""}
                      </span>
                      <span>Expires: {formatDate(invite.expires_at)}</span>
                    </div>

                    {invite.email && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Restricted to: {invite.email}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {isUsable && (
                      <button
                        onClick={() => handleCopy(invite.code)}
                        className={clsx(
                          "rounded p-1.5",
                          copiedCode === invite.code
                            ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                            : "text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-elevated dark:hover:text-gray-300"
                        )}
                        title="Copy invite link"
                      >
                        {copiedCode === invite.code ? (
                          <CheckIcon className="h-4 w-4" />
                        ) : (
                          <ClipboardDocumentIcon className="h-4 w-4" />
                        )}
                      </button>
                    )}
                    {invite.is_active && (
                      <button
                        onClick={() => revokeMutation.mutate(invite.id)}
                        disabled={revokeMutation.isPending}
                        className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                        title="Revoke invite"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Generator modal */}
      <InviteCodeGenerator
        isOpen={showGenerator}
        onClose={() => setShowGenerator(false)}
        target={target}
      />
    </div>
  );
}
