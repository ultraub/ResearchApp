/**
 * CommandCenterDashboard - Main orchestrator for the PM command center.
 */

import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ExclamationTriangleIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClockIcon,
  PlusIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import { Lightbulb, BookOpen } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuthStore } from '@/stores/auth';
import { dashboardService } from '@/services/dashboard';
import type { ScopeFilter } from '@/types/dashboard';
import { ScopeToggle } from './ScopeToggle';
import { BlockersSection } from './BlockersSection';
import { UpcomingTasksSection } from './UpcomingTasksSection';
import { UnscheduledTasksSection } from './UnscheduledTasksSection';
import { WeeklyTimelineView } from './WeeklyTimelineView';
import { QuickIdeaModal } from '@/components/ideas/QuickIdeaModal';

// Summary card component
function SummaryCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
  highlight = false,
}: {
  title: string;
  value: number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={clsx(
        'card p-4 group transition-all',
        highlight && value > 0 && 'ring-2 ring-red-500 ring-opacity-50'
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{value}</p>
          {subtitle && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>
          )}
        </div>
        <div
          className={clsx(
            'p-2.5 rounded-xl shadow-sm transition-transform group-hover:scale-105',
            color
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

// Loading skeleton
function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Summary cards skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card p-4">
            <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
            <div className="h-8 w-12 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        ))}
      </div>

      {/* Content skeleton */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-6 h-64 bg-gray-100 dark:bg-gray-800" />
        <div className="lg:col-span-2 card p-6 h-64 bg-gray-100 dark:bg-gray-800" />
      </div>
    </div>
  );
}

export function CommandCenterDashboard() {
  const { user } = useAuthStore();
  const [scope, setScope] = useState<ScopeFilter>(() => {
    // Load from localStorage or default to personal
    return (localStorage.getItem('dashboard-scope') as ScopeFilter) || 'personal';
  });
  const [isQuickIdeaOpen, setIsQuickIdeaOpen] = useState(false);

  // Persist scope preference
  useEffect(() => {
    localStorage.setItem('dashboard-scope', scope);
  }, [scope]);

  // Fetch command center data
  const { data, isLoading, error } = useQuery({
    queryKey: ['command-center', scope],
    queryFn: () => dashboardService.getCommandCenterData({ daysAhead: 7, scope }),
    refetchInterval: 60000, // Refresh every minute
  });

  // Flatten tasks for timeline view
  const allUpcomingTasks = useMemo(() => {
    if (!data?.tasks_by_day) return [];
    return Object.values(data.tasks_by_day).flat();
  }, [data?.tasks_by_day]);

  // Get greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  if (error) {
    return (
      <div className="p-6">
        <div className="card p-6 text-center">
          <ExclamationTriangleIcon className="h-12 w-12 mx-auto text-red-500 mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Failed to load dashboard
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            Please try refreshing the page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {getGreeting()}, {user?.display_name?.split(' ')[0]}
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Here's your command center
          </p>
        </div>
        <ScopeToggle value={scope} onChange={setScope} />
      </div>

      {/* Quick Actions */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          to="/projects/new"
          className="group card card-interactive flex items-center gap-3 p-4 border border-primary-100 dark:border-primary-900/30"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/30 transition-transform group-hover:scale-105">
            <PlusIcon className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-white">New Project</p>
          </div>
        </Link>

        <Link
          to="/documents/new"
          className="group card card-interactive flex items-center gap-3 p-4 border border-success-100 dark:border-success-900/30"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-success-500 to-success-600 text-white shadow-lg shadow-success-500/30 transition-transform group-hover:scale-105">
            <DocumentTextIcon className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-white">New Document</p>
          </div>
        </Link>

        <button
          onClick={() => setIsQuickIdeaOpen(true)}
          className="group card card-interactive flex items-center gap-3 p-4 text-left border border-accent-100 dark:border-accent-900/30"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500 to-accent-600 text-white shadow-lg shadow-accent-500/30 transition-transform group-hover:scale-105">
            <Lightbulb className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-white">Quick Idea</p>
          </div>
        </button>

        <Link
          to="/knowledge"
          className="group card card-interactive flex items-center gap-3 p-4 border border-info-100 dark:border-info-900/30"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-info-500 to-info-600 text-white shadow-lg shadow-info-500/30 transition-transform group-hover:scale-105">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-white">Add Paper</p>
          </div>
        </Link>
      </div>

      {/* Quick Idea Modal */}
      <QuickIdeaModal
        isOpen={isQuickIdeaOpen}
        onClose={() => setIsQuickIdeaOpen(false)}
      />

      {isLoading ? (
        <DashboardSkeleton />
      ) : data ? (
        <>
          {/* Summary Cards */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              title="Active Blockers"
              value={data.summary.total_blockers}
              subtitle={
                data.summary.critical_blockers > 0
                  ? `${data.summary.critical_blockers} critical/high`
                  : undefined
              }
              icon={ExclamationTriangleIcon}
              color="bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"
              highlight={data.summary.critical_blockers > 0}
            />
            <SummaryCard
              title="Overdue"
              value={data.summary.overdue_count}
              icon={ClockIcon}
              color="bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
              highlight={data.summary.overdue_count > 0}
            />
            <SummaryCard
              title="Due Today"
              value={data.summary.due_today}
              icon={CalendarDaysIcon}
              color="bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
            />
            <SummaryCard
              title="This Week"
              value={data.summary.due_this_week}
              icon={CheckCircleIcon}
              color="bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400"
            />
          </div>

          {/* Main Content Grid */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Blockers Section */}
            <div className="lg:col-span-1">
              <BlockersSection
                blockers={data.blockers.items}
                totalCount={data.blockers.total_count}
              />
            </div>

            {/* Tasks Section */}
            <div className="lg:col-span-2">
              <UpcomingTasksSection
                tasksByDay={data.tasks_by_day}
                overdueTasks={data.overdue_tasks}
                stalledTasks={data.stalled_tasks}
              />
            </div>
          </div>

          {/* Unscheduled Tasks - below main grid */}
          {data.unscheduled_tasks.length > 0 && (
            <div className="mt-6">
              <UnscheduledTasksSection tasks={data.unscheduled_tasks} />
            </div>
          )}

          {/* Timeline View */}
          <div className="mt-6">
            <WeeklyTimelineView tasks={allUpcomingTasks} />
          </div>
        </>
      ) : null}
    </div>
  );
}

export default CommandCenterDashboard;
