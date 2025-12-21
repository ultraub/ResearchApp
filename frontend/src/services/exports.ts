/**
 * Export API service for downloading data in various formats.
 */

function getApiBase(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (!envUrl) return '/api';
  // Upgrade HTTP to HTTPS when page is on HTTPS
  if (window.location.protocol === 'https:' && envUrl.startsWith('http://')) {
    return envUrl.replace('http://', 'https://');
  }
  return envUrl;
}

const API_BASE = getApiBase();

async function downloadFile(url: string, filename: string): Promise<void> {
  const token = localStorage.getItem('pasteur-auth')
    ? JSON.parse(localStorage.getItem('pasteur-auth') || '{}')?.state?.accessToken
    : null;

  const response = await fetch(`${API_BASE}${url}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Export failed' }));
    throw new Error(error.detail || 'Export failed');
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
}


export const exportsApi = {
  // Project exports
  async exportProject(
    projectId: string,
    options: {
      format?: 'csv' | 'pdf';
      includeTasks?: boolean;
      includeDocuments?: boolean;
    } = {}
  ): Promise<void> {
    const params = new URLSearchParams();
    params.append('format', options.format || 'csv');
    if (options.includeTasks !== undefined) {
      params.append('include_tasks', String(options.includeTasks));
    }
    if (options.includeDocuments !== undefined) {
      params.append('include_documents', String(options.includeDocuments));
    }

    const ext = options.format || 'csv';
    await downloadFile(
      `/exports/projects/${projectId}?${params}`,
      `project_export.${ext}`
    );
  },

  // Tasks export
  async exportTasks(
    organizationId: string,
    options: {
      format?: 'csv' | 'pdf';
      projectId?: string;
      status?: string;
    } = {}
  ): Promise<void> {
    const params = new URLSearchParams();
    params.append('organization_id', organizationId);
    params.append('format', options.format || 'csv');
    if (options.projectId) params.append('project_id', options.projectId);
    if (options.status) params.append('status_filter', options.status);

    const ext = options.format || 'csv';
    await downloadFile(`/exports/tasks?${params}`, `tasks_export.${ext}`);
  },

  // Document export
  async exportDocument(
    documentId: string,
    options: {
      format?: 'md' | 'html' | 'pdf';
    } = {}
  ): Promise<void> {
    const params = new URLSearchParams();
    params.append('format', options.format || 'md');

    const ext = options.format || 'md';
    await downloadFile(
      `/exports/documents/${documentId}?${params}`,
      `document_export.${ext}`
    );
  },

  // Ideas export
  async exportIdeas(
    organizationId: string,
    options: {
      format?: 'csv' | 'pdf';
      projectId?: string;
    } = {}
  ): Promise<void> {
    const params = new URLSearchParams();
    params.append('organization_id', organizationId);
    params.append('format', options.format || 'csv');
    if (options.projectId) params.append('project_id', options.projectId);

    const ext = options.format || 'csv';
    await downloadFile(`/exports/ideas?${params}`, `ideas_export.${ext}`);
  },

  // Papers export
  async exportPapers(
    organizationId: string,
    options: {
      format?: 'csv' | 'bibtex';
      collectionId?: string;
    } = {}
  ): Promise<void> {
    const params = new URLSearchParams();
    params.append('organization_id', organizationId);
    params.append('format', options.format || 'csv');
    if (options.collectionId) params.append('collection_id', options.collectionId);

    const ext = options.format === 'bibtex' ? 'bib' : 'csv';
    await downloadFile(`/exports/papers?${params}`, `papers_export.${ext}`);
  },

  // Analytics export
  async exportAnalytics(
    organizationId: string,
    options: {
      format?: 'csv' | 'pdf';
    } = {}
  ): Promise<void> {
    const params = new URLSearchParams();
    params.append('organization_id', organizationId);
    params.append('format', options.format || 'csv');

    const ext = options.format || 'csv';
    await downloadFile(`/exports/analytics?${params}`, `analytics_export.${ext}`);
  },
};
