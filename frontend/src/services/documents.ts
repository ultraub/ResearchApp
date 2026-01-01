import { api } from './api';

export interface Document {
  id: string;
  title: string;
  content: Record<string, unknown>;
  content_text: string | null;
  document_type: string;
  status: string;
  version: number;
  word_count: number | null;
  last_edited_at: string | null;
  project_id: string;
  template_id: string | null;
  created_by_id: string;
  // Creator info
  created_by_name?: string | null;
  created_by_email?: string | null;
  last_edited_by_id: string | null;
  // Last editor info
  last_edited_by_name?: string | null;
  last_edited_by_email?: string | null;
  is_pinned: boolean;
  is_archived: boolean;
  markdown_mode: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version: number;
  content: Record<string, unknown>;
  content_text: string | null;
  word_count: number | null;
  change_summary: string | null;
  created_by_id: string;
  created_at: string;
}

export interface MentionInfo {
  user_id: string;
  user_name: string | null;
  user_email: string | null;
}

export interface DocumentComment {
  id: string;
  document_id: string;
  content: string;
  selection_start: number | null;
  selection_end: number | null;
  selected_text: string | null;
  is_resolved: boolean;
  parent_id: string | null;
  created_by_id: string | null;
  resolved_by_id: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  // User info
  user_name: string | null;
  user_email: string | null;
  // Mentions
  mentions: MentionInfo[];
}

export interface DocumentTemplate {
  id: string;
  name: string;
  description: string | null;
  content: Record<string, unknown>;
  document_type: string;
  category: string | null;
  is_system: boolean;
  organization_id: string | null;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDocumentRequest {
  title: string;
  content?: Record<string, unknown>;
  document_type?: string;
  project_id: string;
  template_id?: string;
}

export interface UpdateDocumentRequest {
  title?: string;
  content?: Record<string, unknown>;
  content_text?: string;
  status?: string;
  is_pinned?: boolean;
  is_archived?: boolean;
  markdown_mode?: boolean;
  create_version?: boolean;
  change_summary?: string;
}

export interface CreateCommentRequest {
  document_id: string;
  content: string;
  selection_start?: number;
  selection_end?: number;
  selected_text?: string;
  parent_id?: string;
}

// Documents
export async function createDocument(data: CreateDocumentRequest): Promise<Document> {
  const response = await api.post<Document>('/documents/', data);
  return response.data;
}

interface DocumentListResponse {
  items: Document[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export async function getDocuments(
  projectId: string,
  params?: {
    status?: string;
    document_type?: string;
    search?: string;
    skip?: number;
    limit?: number;
  }
): Promise<Document[]> {
  const response = await api.get<DocumentListResponse>('/documents/', {
    params: { project_id: projectId, ...params },
  });
  return response.data.items;
}

export async function getDocument(documentId: string): Promise<Document> {
  const response = await api.get<Document>(`/documents/${documentId}`);
  return response.data;
}

export async function updateDocument(
  documentId: string,
  data: UpdateDocumentRequest
): Promise<Document> {
  const response = await api.patch<Document>(`/documents/${documentId}`, data);
  return response.data;
}

export async function deleteDocument(documentId: string): Promise<void> {
  await api.delete(`/documents/${documentId}`);
}

// Document Versions
export async function getDocumentVersions(documentId: string): Promise<DocumentVersion[]> {
  const response = await api.get<DocumentVersion[]>(`/documents/${documentId}/versions`);
  return response.data || [];
}

export async function restoreDocumentVersion(
  documentId: string,
  versionId: string
): Promise<Document> {
  const response = await api.post<Document>(
    `/documents/${documentId}/versions/${versionId}/restore`
  );
  return response.data;
}

// Document Comments
export async function getDocumentComments(
  documentId: string,
  includeResolved = false
): Promise<DocumentComment[]> {
  const response = await api.get<DocumentComment[]>(`/documents/${documentId}/comments`, {
    params: { include_resolved: includeResolved },
  });
  return response.data || [];
}

export async function createComment(data: CreateCommentRequest): Promise<DocumentComment> {
  const response = await api.post<DocumentComment>(
    `/documents/${data.document_id}/comments`,
    data
  );
  return response.data;
}

export async function updateComment(
  documentId: string,
  commentId: string,
  content: string
): Promise<DocumentComment> {
  const response = await api.patch<DocumentComment>(
    `/documents/${documentId}/comments/${commentId}`,
    { content }
  );
  return response.data;
}

export async function deleteComment(
  documentId: string,
  commentId: string
): Promise<void> {
  await api.delete(`/documents/${documentId}/comments/${commentId}`);
}

export async function resolveComment(
  documentId: string,
  commentId: string
): Promise<DocumentComment> {
  const response = await api.post<DocumentComment>(
    `/documents/${documentId}/comments/${commentId}/resolve`
  );
  return response.data;
}

// Templates
export async function getDocumentTemplates(
  organizationId?: string
): Promise<DocumentTemplate[]> {
  const response = await api.get<DocumentTemplate[]>('/documents/templates/', {
    params: organizationId ? { organization_id: organizationId } : undefined,
  });
  return response.data || [];
}
