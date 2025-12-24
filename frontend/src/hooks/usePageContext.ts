/**
 * Hook to track current page context for the AI assistant.
 */

import { useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import type { PageContext } from '../types/assistant';

interface UsePageContextResult {
  pageContext: PageContext;
  contextLabel: string;
}

export function usePageContext(): UsePageContextResult {
  const location = useLocation();
  const params = useParams();

  const pageContext = useMemo<PageContext>(() => {
    const path = location.pathname;

    // Dashboard
    if (path === '/' || path === '/dashboard') {
      return { type: 'dashboard' };
    }

    // Projects list
    if (path === '/projects') {
      return { type: 'projects' };
    }

    // Specific project
    if (path.startsWith('/projects/') && params.projectId) {
      return {
        type: 'project',
        id: params.projectId,
        projectId: params.projectId,
      };
    }

    // Tasks
    if (path === '/tasks') {
      return { type: 'tasks' };
    }

    // Specific task
    if (path.startsWith('/tasks/') && params.taskId) {
      return {
        type: 'task',
        id: params.taskId,
        projectId: params.projectId,
      };
    }

    // Documents
    if (path === '/documents') {
      return { type: 'documents' };
    }

    // Specific document
    if (path.startsWith('/documents/') && params.documentId) {
      return {
        type: 'document',
        id: params.documentId,
        projectId: params.projectId,
      };
    }

    // Blockers
    if (path === '/blockers') {
      return { type: 'blockers' };
    }

    // Knowledge base
    if (path.startsWith('/knowledge')) {
      return { type: 'knowledge' };
    }

    // Teams
    if (path.startsWith('/teams')) {
      return {
        type: 'team',
        id: params.teamId,
      };
    }

    // Default
    return { type: 'general' };
  }, [location.pathname, params]);

  const contextLabel = useMemo(() => {
    switch (pageContext.type) {
      case 'dashboard':
        return 'Dashboard';
      case 'projects':
        return 'All Projects';
      case 'project':
        return 'Current Project';
      case 'tasks':
        return 'All Tasks';
      case 'task':
        return 'Current Task';
      case 'documents':
        return 'All Documents';
      case 'document':
        return 'Current Document';
      case 'blockers':
        return 'Blockers';
      case 'knowledge':
        return 'Knowledge Base';
      case 'team':
        return 'Team';
      default:
        return 'General';
    }
  }, [pageContext.type]);

  return { pageContext, contextLabel };
}
