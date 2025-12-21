/**
 * Main dashboard page with analytics widgets and quick actions.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  PlusIcon,
  FolderIcon,
  DocumentTextIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline';
import {
  Folder,
  CheckSquare,
  FileText,
  Lightbulb,
  BookOpen,
  Users,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { useOrganizationStore } from '@/stores/organization';
import { analyticsApi, type DashboardAnalytics } from '../../services/analytics';
import { ActivityFeed } from '../../components/activity/ActivityFeed';
import { QuickIdeaModal } from '../../components/ideas/QuickIdeaModal';
import { ReviewDashboardWidget } from '../../components/dashboard/ReviewDashboardWidget';
import { ProjectProgressItem } from '../../components/dashboard/ProjectProgressItem';
import { NeedsAttentionWidget } from '../../components/dashboard/NeedsAttentionWidget';

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="card p-5 group">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-3 rounded-xl ${color} shadow-sm transition-transform group-hover:scale-105`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function TaskStatusChart({ data }: { data: DashboardAnalytics['task_status'] }) {
  const total = data.todo + data.in_progress + data.in_review + data.completed + data.blocked;
  if (total === 0) return null;

  const segments = [
    { label: 'To Do', value: data.todo, color: 'bg-gray-300 dark:bg-gray-600' },
    { label: 'In Progress', value: data.in_progress, color: 'bg-primary-500' },
    { label: 'In Review', value: data.in_review, color: 'bg-amber-500' },
    { label: 'Completed', value: data.completed, color: 'bg-success-500' },
    { label: 'Blocked', value: data.blocked, color: 'bg-error-500' },
  ].filter((s) => s.value > 0);

  return (
    <div className="card p-5">
      <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Task Status</h3>
      <div className="h-3 rounded-full overflow-hidden flex mb-4 bg-gray-100 dark:bg-dark-elevated">
        {segments.map((segment) => (
          <div
            key={segment.label}
            className={`${segment.color} transition-all first:rounded-l-full last:rounded-r-full`}
            style={{ width: `${(segment.value / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center gap-2 py-1">
            <div className={`h-2.5 w-2.5 rounded-full ${segment.color}`} />
            <span className="text-xs text-gray-600 dark:text-gray-400">{segment.label}</span>
            <span className="text-xs font-semibold text-gray-900 dark:text-white ml-auto">
              {segment.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectProgressList({ projects }: { projects: DashboardAnalytics['project_progress'] }) {
  if (projects.length === 0) return null;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-white">Project Progress</h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {projects.length} project{projects.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="space-y-4 max-h-80 overflow-y-auto pr-1 -mr-1">
        {projects.map((project) => (
          <ProjectProgressItem
            key={project.project_id}
            project={project}
            showIndicators={true}
          />
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { organization } = useOrganizationStore();
  const [isQuickIdeaOpen, setIsQuickIdeaOpen] = useState(false);

  // Get organization ID from store (set during auth initialization)
  const organizationId = organization?.id;

  const { data: analytics, isLoading: _analyticsLoading } = useQuery({
    queryKey: ['dashboard-analytics', organizationId],
    queryFn: () => analyticsApi.getDashboard(organizationId!),
    enabled: !!organizationId, // Enable when we have a real org ID
  });

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {getGreeting()}, {user?.display_name?.split(' ')[0]}
        </h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">
          Here's what's happening with your research
        </p>
      </div>

      {/* Quick actions */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          to="/projects/new"
          className="group card card-interactive flex items-center gap-4 p-5 border border-primary-100 dark:border-primary-900/30"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/30 transition-transform group-hover:scale-105">
            <PlusIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">New Project</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Start fresh</p>
          </div>
        </Link>

        <Link
          to="/documents/new"
          className="group card card-interactive flex items-center gap-4 p-5 border border-success-100 dark:border-success-900/30"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-success-500 to-success-600 text-white shadow-lg shadow-success-500/30 transition-transform group-hover:scale-105">
            <DocumentTextIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">New Document</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Start writing</p>
          </div>
        </Link>

        <button
          onClick={() => setIsQuickIdeaOpen(true)}
          className="group card card-interactive flex items-center gap-4 p-5 text-left border border-accent-100 dark:border-accent-900/30"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500 to-accent-600 text-white shadow-lg shadow-accent-500/30 transition-transform group-hover:scale-105">
            <Lightbulb className="h-6 w-6" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">Quick Idea</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Capture now</p>
          </div>
        </button>

        <Link
          to="/knowledge"
          className="group card card-interactive flex items-center gap-4 p-5 border border-info-100 dark:border-info-900/30"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-info-500 to-info-600 text-white shadow-lg shadow-info-500/30 transition-transform group-hover:scale-105">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">Add Paper</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Import DOI/PMID</p>
          </div>
        </Link>
      </div>

      {/* Quick Idea Modal */}
      <QuickIdeaModal
        isOpen={isQuickIdeaOpen}
        onClose={() => setIsQuickIdeaOpen(false)}
      />

      {/* Analytics Overview (when available) */}
      {analytics && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Projects"
            value={analytics.overview.total_projects}
            subtitle={`${analytics.overview.active_projects} active`}
            icon={Folder}
            color="bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
          />
          <MetricCard
            title="Tasks"
            value={analytics.overview.total_tasks}
            subtitle={`${analytics.overview.task_completion_rate}% complete`}
            icon={CheckSquare}
            color="bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400"
          />
          <MetricCard
            title="Documents"
            value={analytics.overview.total_documents}
            icon={FileText}
            color="bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
          />
          <MetricCard
            title="Team Members"
            value={analytics.overview.total_members}
            subtitle={`${analytics.overview.active_members_last_week} active this week`}
            icon={Users}
            color="bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Projects */}
        <div className="lg:col-span-2">
          <div className="card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Recent Projects
              </h2>
              <Link to="/projects" className="text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors">
                View all
              </Link>
            </div>

            {/* Empty state */}
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-100 to-primary-50 dark:from-primary-900/30 dark:to-primary-900/10">
                <FolderIcon className="h-8 w-8 text-primary-500" />
              </div>
              <h3 className="font-medium text-gray-900 dark:text-white">No projects yet</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Create your first project to get started
              </p>
              <Link
                to="/projects/new"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-primary-500/30 hover:from-primary-700 hover:to-primary-600 transition-all"
              >
                <PlusIcon className="h-4 w-4" />
                Create Project
              </Link>
            </div>
          </div>

          {/* Task Status Chart */}
          {analytics && <div className="mt-6"><TaskStatusChart data={analytics.task_status} /></div>}

          {/* Project Progress */}
          {analytics && analytics.project_progress.length > 0 && (
            <div className="mt-6">
              <ProjectProgressList projects={analytics.project_progress} />
            </div>
          )}
        </div>

        {/* Activity & Stats */}
        <div className="space-y-6">
          {/* Needs Attention Widget */}
          {analytics && analytics.project_progress.length > 0 && (
            <NeedsAttentionWidget projects={analytics.project_progress} />
          )}

          {/* Reviews Widget */}
          <ReviewDashboardWidget />

          {/* Recent Activity */}
          <div className="card p-6">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 dark:bg-dark-elevated">
                <ClockIcon className="h-4 w-4 text-gray-500" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Recent Activity
              </h2>
            </div>

            {/* Activity Feed when org is available */}
            {organizationId && organizationId !== 'demo-org-id' ? (
              <ActivityFeed organizationId={organizationId} limit={5} compact />
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">No recent activity</p>
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className="card p-6">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent-100 to-accent-50 dark:from-accent-900/30 dark:to-accent-900/10">
                <ArrowTrendingUpIcon className="h-4 w-4 text-accent-600 dark:text-accent-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">This Week</h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-gradient-to-br from-primary-50 to-white p-4 dark:from-primary-900/20 dark:to-dark-elevated">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {analytics?.overview.completed_tasks || 0}
                </p>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Tasks completed</p>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-success-50 to-white p-4 dark:from-success-900/20 dark:to-dark-elevated">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {analytics?.overview.total_documents || 0}
                </p>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Documents edited</p>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-info-50 to-white p-4 dark:from-info-900/20 dark:to-dark-elevated">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {analytics?.overview.total_papers || 0}
                </p>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Papers added</p>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-accent-50 to-white p-4 dark:from-accent-900/20 dark:to-dark-elevated">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {analytics?.overview.total_ideas || 0}
                </p>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Ideas captured</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
