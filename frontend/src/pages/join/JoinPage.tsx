/**
 * JoinPage - Handle invite code URLs and allow users to join teams/organizations
 */

import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  UserGroupIcon,
  BuildingOffice2Icon,
  XCircleIcon,
  ArrowLeftIcon,
} from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import { invitationsService } from "@/services/invitations";
import { TEAMS_QUERY_KEY } from "@/hooks/useTeams";
import { useOrganizationStore } from "@/stores/organization";

export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const refreshTeams = useOrganizationStore((state) => state.refreshTeams);

  // Fetch invite preview
  const {
    data: preview,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["invite-preview", code],
    queryFn: () => invitationsService.preview(code!),
    enabled: !!code,
    retry: false,
  });

  // Join mutation
  const joinMutation = useMutation({
    mutationFn: (inviteCode: string) => invitationsService.join(inviteCode),
    onSuccess: async (result) => {
      // Invalidate React Query cache
      queryClient.invalidateQueries({ queryKey: TEAMS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      queryClient.invalidateQueries({ queryKey: ["my-organizations"] });

      // Also refresh Zustand store for immediate sync
      await refreshTeams();

      toast.success(`Successfully joined ${result.name}!`);

      // Navigate to the team/org
      if (result.type === "team") {
        navigate(`/teams/${result.id}`);
      } else {
        navigate(`/organizations/${result.id}`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to join");
    },
  });

  const handleJoin = () => {
    if (!code || !preview?.is_valid) return;
    joinMutation.mutate(code);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-gray-50 px-4 py-12 dark:bg-dark-base">
        <div className="w-full max-w-md">
          <div className="animate-pulse space-y-4 rounded-xl bg-white p-8 shadow-card dark:bg-dark-card">
            <div className="mx-auto h-16 w-16 rounded-full bg-gray-200 dark:bg-dark-elevated" />
            <div className="mx-auto h-6 w-48 rounded bg-gray-200 dark:bg-dark-elevated" />
            <div className="mx-auto h-4 w-32 rounded bg-gray-200 dark:bg-dark-elevated" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="flex min-h-full items-center justify-center bg-gray-50 px-4 py-12 dark:bg-dark-base">
        <div className="w-full max-w-md">
          <div className="rounded-xl bg-white p-8 text-center shadow-card dark:bg-dark-card">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <XCircleIcon className="h-10 w-10 text-red-600 dark:text-red-400" />
            </div>
            <h1 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
              Invalid Invite Code
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              This invite code doesn't exist or may have been revoked.
            </p>
            <Link
              to="/teams"
              className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Go to Teams
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const Icon = preview.type === "team" ? UserGroupIcon : BuildingOffice2Icon;
  const iconBgColor = preview.type === "team"
    ? "bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900/30 dark:to-primary-800/30"
    : "bg-gradient-to-br from-indigo-100 to-indigo-200 dark:from-indigo-900/30 dark:to-indigo-800/30";
  const iconColor = preview.type === "team"
    ? "text-primary-600 dark:text-primary-400"
    : "text-indigo-600 dark:text-indigo-400";

  return (
    <div className="flex min-h-full items-center justify-center bg-gray-50 px-4 py-12 dark:bg-dark-base">
      <div className="w-full max-w-md">
        <div className="rounded-xl bg-white p-8 shadow-card dark:bg-dark-card">
          {/* Icon */}
          <div
            className={clsx(
              "mx-auto flex h-16 w-16 items-center justify-center rounded-full",
              preview.is_valid ? iconBgColor : "bg-red-100 dark:bg-red-900/30"
            )}
          >
            {preview.is_valid ? (
              <Icon className={clsx("h-8 w-8", iconColor)} />
            ) : (
              <XCircleIcon className="h-8 w-8 text-red-600 dark:text-red-400" />
            )}
          </div>

          {/* Content */}
          <div className="mt-6 text-center">
            {preview.is_valid ? (
              <>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  You've been invited!
                </h1>
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                  Join <span className="font-semibold">{preview.name}</span> as a{" "}
                  <span className="font-semibold capitalize">{preview.role}</span>
                </p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
                  {preview.type === "team" ? "Team" : "Organization"}
                </p>
              </>
            ) : (
              <>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  Invite Not Available
                </h1>
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                  {preview.error || "This invite is no longer valid."}
                </p>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="mt-8 space-y-3">
            {preview.is_valid ? (
              <>
                <button
                  onClick={handleJoin}
                  disabled={joinMutation.isPending}
                  className="w-full rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 px-4 py-3 text-sm font-medium text-white shadow-soft hover:from-primary-600 hover:to-primary-700 disabled:opacity-50"
                >
                  {joinMutation.isPending ? "Joining..." : "Accept Invitation"}
                </button>
                <Link
                  to="/teams"
                  className="block w-full rounded-xl border border-gray-200 px-4 py-3 text-center text-sm font-medium text-gray-700 shadow-soft hover:bg-gray-50 dark:border-dark-border dark:text-gray-300 dark:hover:bg-dark-elevated"
                >
                  Maybe Later
                </Link>
              </>
            ) : (
              <Link
                to="/teams"
                className="block w-full rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 px-4 py-3 text-center text-sm font-medium text-white shadow-soft hover:from-primary-600 hover:to-primary-700"
              >
                Go to Teams
              </Link>
            )}
          </div>

          {/* Code display */}
          <div className="mt-6 text-center">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Invite code: <code className="font-mono">{code}</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
