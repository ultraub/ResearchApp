/**
 * Share dialog component for projects and documents.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Link2,
  Copy,
  Check,
  UserPlus,
  Trash2,
  Shield,
  Globe,
  Lock,
  Mail,
} from 'lucide-react';
import { projectSharesApi, shareLinksApi, invitationsApi } from '../../services/sharing';

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  resourceType: 'project' | 'document' | 'collection';
  resourceId: string;
  resourceName: string;
  organizationId: string;
  currentUserId: string;
}

type TabType = 'people' | 'link' | 'invite';

const roleOptions = [
  { value: 'viewer', label: 'Can view', icon: '👁️' },
  { value: 'editor', label: 'Can edit', icon: '✏️' },
  { value: 'admin', label: 'Admin', icon: '👑' },
];

function PeopleTab({
  resourceId,
  currentUserId,
}: {
  resourceId: string;
  currentUserId: string;
}) {
  const queryClient = useQueryClient();

  const { data: shares, isLoading } = useQuery({
    queryKey: ['projectShares', resourceId],
    queryFn: () => projectSharesApi.list(resourceId),
  });

  const updateMutation = useMutation({
    mutationFn: ({ shareId, updates }: { shareId: string; updates: { role?: string } }) =>
      projectSharesApi.update(shareId, updates as { role: 'viewer' | 'editor' | 'admin' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectShares', resourceId] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (shareId: string) => projectSharesApi.remove(shareId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectShares', resourceId] });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="animate-pulse flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!shares || shares.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <UserPlus className="h-12 w-12 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
        <p>No one has access yet</p>
        <p className="text-sm mt-1">Send an invitation to share this project</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {shares.map((share) => (
        <div key={share.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-elevated">
          {/* Avatar */}
          <div className="h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 font-medium">
            {share.user_name?.charAt(0) || share.user_email.charAt(0).toUpperCase()}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {share.user_name || share.user_email}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{share.user_email}</p>
          </div>

          {/* Role selector */}
          <select
            value={share.role}
            onChange={(e) =>
              updateMutation.mutate({ shareId: share.id, updates: { role: e.target.value } })
            }
            disabled={share.user_id === currentUserId}
            className="text-sm border border-gray-300 dark:border-dark-border rounded-xl px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 dark:bg-dark-elevated dark:text-gray-100"
          >
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {/* Remove button */}
          {share.user_id !== currentUserId && (
            <button
              onClick={() => removeMutation.mutate(share.id)}
              className="p-1 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 rounded"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function LinkTab({
  resourceType,
  resourceId,
  organizationId,
  currentUserId,
}: {
  resourceType: 'project' | 'document' | 'collection';
  resourceId: string;
  organizationId: string;
  currentUserId: string;
}) {
  const [accessLevel, setAccessLevel] = useState<'view' | 'comment' | 'edit'>('view');
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [expiresIn, setExpiresIn] = useState<string>('never');
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createMutation = useMutation({
    mutationFn: () => {
      const expiresAt =
        expiresIn === 'never'
          ? undefined
          : new Date(Date.now() + parseInt(expiresIn) * 24 * 60 * 60 * 1000).toISOString();

      return shareLinksApi.create({
        resource_type: resourceType,
        resource_id: resourceId,
        access_level: accessLevel,
        requires_auth: requiresAuth,
        expires_at: expiresAt,
        created_by_id: currentUserId,
        organization_id: organizationId,
      });
    },
    onSuccess: (data) => {
      setGeneratedLink(data.url);
    },
  });

  const handleCopy = async () => {
    if (generatedLink) {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-4">
      {/* Link settings */}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Access level</label>
          <select
            value={accessLevel}
            onChange={(e) => setAccessLevel(e.target.value as 'view' | 'comment' | 'edit')}
            className="w-full border border-gray-300 dark:border-dark-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-dark-elevated dark:text-gray-100"
          >
            <option value="view">Can view</option>
            <option value="comment">Can comment</option>
            <option value="edit">Can edit</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Link expires</label>
          <select
            value={expiresIn}
            onChange={(e) => setExpiresIn(e.target.value)}
            className="w-full border border-gray-300 dark:border-dark-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-dark-elevated dark:text-gray-100"
          >
            <option value="never">Never</option>
            <option value="1">1 day</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
          </select>
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={requiresAuth}
            onChange={(e) => setRequiresAuth(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Require sign in</span>
        </label>
      </div>

      {/* Generate button */}
      {!generatedLink ? (
        <button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white rounded-xl px-4 py-2 hover:bg-primary-700 disabled:opacity-50"
        >
          <Link2 className="h-4 w-4" />
          {createMutation.isPending ? 'Creating...' : 'Create link'}
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-dark-elevated rounded-xl border border-gray-200 dark:border-dark-border">
            <input
              type="text"
              value={generatedLink}
              readOnly
              className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 focus:outline-none"
            />
            <button
              onClick={handleCopy}
              className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded"
            >
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <button
            onClick={() => setGeneratedLink(null)}
            className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
          >
            Create another link
          </button>
        </div>
      )}

      {/* Info */}
      <div className="p-3 bg-primary-50 dark:bg-primary-900/20 rounded-xl text-sm text-primary-700 dark:text-primary-300">
        <div className="flex items-start gap-2">
          {requiresAuth ? (
            <>
              <Lock className="h-4 w-4 mt-0.5" />
              <span>Anyone with the link must sign in to access</span>
            </>
          ) : (
            <>
              <Globe className="h-4 w-4 mt-0.5" />
              <span>Anyone with the link can access</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InviteTab({
  resourceType,
  resourceId,
  organizationId,
  currentUserId,
}: {
  resourceType: 'project' | 'document' | 'collection';
  resourceId: string;
  organizationId: string;
  currentUserId: string;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  const inviteMutation = useMutation({
    mutationFn: () =>
      invitationsApi.create({
        invitation_type: resourceType === 'project' ? 'project' : 'organization',
        organization_id: organizationId,
        project_id: resourceType === 'project' ? resourceId : undefined,
        email,
        role,
        personal_message: message || undefined,
        invited_by_id: currentUserId,
      }),
    onSuccess: () => {
      setSent(true);
      setEmail('');
      setMessage('');
      setTimeout(() => setSent(false), 3000);
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email address</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="colleague@example.com"
          className="w-full border border-gray-300 dark:border-dark-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-dark-elevated dark:text-gray-100"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="w-full border border-gray-300 dark:border-dark-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-dark-elevated dark:text-gray-100"
        >
          {roleOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.icon} {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Personal message (optional)
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Add a note to your invitation..."
          rows={3}
          className="w-full border border-gray-300 dark:border-dark-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none dark:bg-dark-elevated dark:text-gray-100"
        />
      </div>

      <button
        onClick={() => inviteMutation.mutate()}
        disabled={!email || inviteMutation.isPending}
        className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white rounded-xl px-4 py-2 hover:bg-primary-700 disabled:opacity-50"
      >
        <Mail className="h-4 w-4" />
        {inviteMutation.isPending ? 'Sending...' : 'Send invitation'}
      </button>

      {sent && (
        <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-xl">
          <Check className="h-4 w-4" />
          <span>Invitation sent!</span>
        </div>
      )}

      {inviteMutation.isError && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-xl text-sm">
          Failed to send invitation. Please try again.
        </div>
      )}
    </div>
  );
}

export function ShareDialog({
  isOpen,
  onClose,
  resourceType,
  resourceId,
  resourceName,
  organizationId,
  currentUserId,
}: ShareDialogProps) {
  const [activeTab, setActiveTab] = useState<TabType>('people');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-dark-card rounded-xl shadow-card w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Share "{resourceName}"</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">{resourceType}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-dark-border">
          <button
            onClick={() => setActiveTab('people')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium ${
              activeTab === 'people'
                ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Shield className="h-4 w-4" />
            People
          </button>
          <button
            onClick={() => setActiveTab('link')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium ${
              activeTab === 'link'
                ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Link2 className="h-4 w-4" />
            Link
          </button>
          <button
            onClick={() => setActiveTab('invite')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium ${
              activeTab === 'invite'
                ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Mail className="h-4 w-4" />
            Invite
          </button>
        </div>

        {/* Content */}
        <div className="p-4 max-h-96 overflow-y-auto">
          {activeTab === 'people' && (
            <PeopleTab resourceId={resourceId} currentUserId={currentUserId} />
          )}
          {activeTab === 'link' && (
            <LinkTab
              resourceType={resourceType}
              resourceId={resourceId}
              organizationId={organizationId}
              currentUserId={currentUserId}
            />
          )}
          {activeTab === 'invite' && (
            <InviteTab
              resourceType={resourceType}
              resourceId={resourceId}
              organizationId={organizationId}
              currentUserId={currentUserId}
            />
          )}
        </div>
      </div>
    </div>
  );
}
