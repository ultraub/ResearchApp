import { api } from './api';

export interface Paper {
  id: string;
  doi: string | null;
  pmid: string | null;
  arxiv_id: string | null;
  title: string;
  authors: string[];
  journal: string | null;
  publication_date: string | null;
  abstract: string | null;
  pdf_url: string | null;
  notes: string | null;
  read_status: 'unread' | 'reading' | 'read';
  rating: number | null;
  ai_summary: string | null;
  ai_key_findings: string[] | null;
  organization_id: string;
  added_by_id: string;
  created_at: string;
  updated_at: string;
}

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  is_shared: boolean;
  paper_count: number;
  organization_id: string;
  created_by_id: string;
  created_at: string;
  updated_at: string;
}

export interface PaperHighlight {
  id: string;
  paper_id: string;
  text: string;
  color: string;
  note: string | null;
  page_number: number | null;
  position_data: Record<string, unknown> | null;
  created_by_id: string;
  created_at: string;
}

export interface PaperLink {
  id: string;
  paper_id: string;
  linked_entity_type: 'project' | 'task' | 'document';
  linked_entity_id: string;
  link_type: 'reference' | 'citation' | 'related';
  notes: string | null;
  created_by_id: string | null;
  created_at: string;
}

export interface CreatePaperRequest {
  doi?: string;
  pmid?: string;
  title: string;
  authors?: string[];
  journal?: string;
  publication_date?: string;
  abstract?: string;
  pdf_url?: string;
  organization_id: string;
}

export interface UpdatePaperRequest {
  title?: string;
  authors?: string[];
  journal?: string;
  publication_date?: string;
  abstract?: string;
  pdf_url?: string;
  notes?: string;
  read_status?: 'unread' | 'reading' | 'read';
  rating?: number;
}

export interface CreateCollectionRequest {
  name: string;
  description?: string;
  color?: string;
  organization_id: string;
}

export interface UpdateCollectionRequest {
  name?: string;
  description?: string;
  color?: string;
  is_shared?: boolean;
}

export interface CreateHighlightRequest {
  paper_id: string;
  text: string;
  color?: string;
  note?: string;
  page_number?: number;
  position_data?: Record<string, unknown>;
}

export interface CreatePaperLinkRequest {
  paper_id: string;
  linked_entity_type: 'project' | 'task' | 'document';
  linked_entity_id: string;
  link_type?: 'reference' | 'citation' | 'related';
  notes?: string;
}

// Papers
export async function createPaper(data: CreatePaperRequest): Promise<Paper> {
  const response = await api.post<Paper>('/knowledge/papers', data);
  return response.data;
}

export async function getPapers(
  organizationId: string,
  params?: {
    search?: string;
    read_status?: string;
    collection_id?: string;
    skip?: number;
    limit?: number;
  }
): Promise<Paper[]> {
  const response = await api.get<Paper[]>('/knowledge/papers', {
    params: { organization_id: organizationId, ...params },
  });
  return response.data || [];
}

export async function getPaper(paperId: string): Promise<Paper> {
  const response = await api.get<Paper>(`/knowledge/papers/${paperId}`);
  return response.data;
}

export async function updatePaper(paperId: string, data: UpdatePaperRequest): Promise<Paper> {
  const response = await api.patch<Paper>(`/knowledge/papers/${paperId}`, data);
  return response.data;
}

export async function deletePaper(paperId: string): Promise<void> {
  await api.delete(`/knowledge/papers/${paperId}`);
}

export async function importPaperByDOI(
  doi: string,
  organizationId: string
): Promise<Paper> {
  const response = await api.post<Paper>('/knowledge/papers/import/doi', {
    doi,
    organization_id: organizationId,
  });
  return response.data;
}

export async function importPaperByPMID(
  pmid: string,
  organizationId: string
): Promise<Paper> {
  const response = await api.post<Paper>('/knowledge/papers/import/pmid', {
    pmid,
    organization_id: organizationId,
  });
  return response.data;
}

// Collections
export async function createCollection(data: CreateCollectionRequest): Promise<Collection> {
  const response = await api.post<Collection>('/knowledge/collections', data);
  return response.data;
}

export async function getCollections(
  organizationId: string,
  params?: { skip?: number; limit?: number }
): Promise<Collection[]> {
  const response = await api.get<Collection[]>('/knowledge/collections', {
    params: { organization_id: organizationId, ...params },
  });
  return response.data || [];
}

export async function getCollection(collectionId: string): Promise<Collection> {
  const response = await api.get<Collection>(`/knowledge/collections/${collectionId}`);
  return response.data;
}

export async function updateCollection(
  collectionId: string,
  data: UpdateCollectionRequest
): Promise<Collection> {
  const response = await api.patch<Collection>(
    `/knowledge/collections/${collectionId}`,
    data
  );
  return response.data;
}

export async function deleteCollection(collectionId: string): Promise<void> {
  await api.delete(`/knowledge/collections/${collectionId}`);
}

export async function addPaperToCollection(
  collectionId: string,
  paperId: string
): Promise<void> {
  await api.post(`/knowledge/collections/${collectionId}/papers/${paperId}`);
}

export async function removePaperFromCollection(
  collectionId: string,
  paperId: string
): Promise<void> {
  await api.delete(`/knowledge/collections/${collectionId}/papers/${paperId}`);
}

export async function getCollectionPapers(
  collectionId: string,
  params?: { skip?: number; limit?: number }
): Promise<Paper[]> {
  const response = await api.get<Paper[]>(
    `/knowledge/collections/${collectionId}/papers`,
    { params }
  );
  return response.data || [];
}

// Highlights
export async function createHighlight(data: CreateHighlightRequest): Promise<PaperHighlight> {
  const response = await api.post<PaperHighlight>(
    `/knowledge/papers/${data.paper_id}/highlights`,
    data
  );
  return response.data;
}

export async function getPaperHighlights(paperId: string): Promise<PaperHighlight[]> {
  const response = await api.get<PaperHighlight[]>(
    `/knowledge/papers/${paperId}/highlights`
  );
  return response.data || [];
}

export async function deleteHighlight(highlightId: string): Promise<void> {
  await api.delete(`/knowledge/highlights/${highlightId}`);
}

// Paper Links
export async function createPaperLink(data: CreatePaperLinkRequest): Promise<PaperLink> {
  const response = await api.post<PaperLink>('/knowledge/paper-links', data);
  return response.data;
}

export async function getPaperLinks(paperId: string): Promise<PaperLink[]> {
  const response = await api.get<PaperLink[]>(`/knowledge/papers/${paperId}/links`);
  return response.data || [];
}

export async function deletePaperLink(linkId: string): Promise<void> {
  await api.delete(`/knowledge/paper-links/${linkId}`);
}

// Get papers linked to a project
export async function getProjectPapers(projectId: string): Promise<Paper[]> {
  const response = await api.get<Paper[]>(`/knowledge/projects/${projectId}/papers`);
  return response.data || [];
}

// Link a paper to a project
export async function linkPaperToProject(paperId: string, projectId: string, notes?: string): Promise<PaperLink> {
  return createPaperLink({
    paper_id: paperId,
    linked_entity_type: 'project',
    linked_entity_id: projectId,
    link_type: 'reference',
    notes,
  });
}
