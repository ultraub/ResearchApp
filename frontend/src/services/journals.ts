import { api } from './api';
import {
  JournalEntry,
  JournalEntryLink,
  JournalEntryCreate,
  JournalEntryUpdate,
  JournalEntryLinkCreate,
  JournalListParams,
  JournalListResponse,
  JournalCalendarResponse,
} from '../types';

// Journal Entries

export async function createJournalEntry(data: JournalEntryCreate): Promise<JournalEntry> {
  const response = await api.post<JournalEntry>('/journals/', data);
  return response.data;
}

export async function getJournalEntries(
  params?: JournalListParams
): Promise<JournalListResponse> {
  const response = await api.get<JournalListResponse>('/journals/', { params });
  return response.data;
}

export async function getJournalEntry(entryId: string): Promise<JournalEntry> {
  const response = await api.get<JournalEntry>(`/journals/${entryId}`);
  return response.data;
}

export async function updateJournalEntry(
  entryId: string,
  data: JournalEntryUpdate
): Promise<JournalEntry> {
  const response = await api.patch<JournalEntry>(`/journals/${entryId}`, data);
  return response.data;
}

export async function deleteJournalEntry(entryId: string): Promise<void> {
  await api.delete(`/journals/${entryId}`);
}

// Journal Entry Links

export async function addJournalEntryLink(
  entryId: string,
  data: JournalEntryLinkCreate
): Promise<JournalEntryLink> {
  const response = await api.post<JournalEntryLink>(`/journals/${entryId}/links`, data);
  return response.data;
}

export async function getJournalEntryLinks(entryId: string): Promise<JournalEntryLink[]> {
  const response = await api.get<JournalEntryLink[]>(`/journals/${entryId}/links`);
  return response.data;
}

export async function removeJournalEntryLink(
  entryId: string,
  linkId: string
): Promise<void> {
  await api.delete(`/journals/${entryId}/links/${linkId}`);
}

// Tags and Calendar

export async function getJournalTags(params?: {
  scope?: 'personal' | 'project' | 'all';
  project_id?: string;
}): Promise<string[]> {
  const response = await api.get<string[]>('/journals/tags', { params });
  return response.data;
}

export async function getJournalCalendarEntries(
  year: number,
  month: number,
  params?: {
    scope?: 'personal' | 'project' | 'all';
    project_id?: string;
  }
): Promise<JournalCalendarResponse> {
  const response = await api.get<JournalCalendarResponse>('/journals/calendar', {
    params: { year, month, ...params },
  });
  return response.data;
}

// Convenience functions

export async function getPersonalJournalEntries(
  params?: Omit<JournalListParams, 'scope'>
): Promise<JournalListResponse> {
  return getJournalEntries({ ...params, scope: 'personal' });
}

export async function getProjectJournalEntries(
  projectId: string,
  params?: Omit<JournalListParams, 'scope' | 'project_id'>
): Promise<JournalListResponse> {
  return getJournalEntries({ ...params, scope: 'project', project_id: projectId });
}

export async function pinJournalEntry(entryId: string): Promise<JournalEntry> {
  return updateJournalEntry(entryId, { is_pinned: true });
}

export async function unpinJournalEntry(entryId: string): Promise<JournalEntry> {
  return updateJournalEntry(entryId, { is_pinned: false });
}

export async function archiveJournalEntry(entryId: string): Promise<JournalEntry> {
  return updateJournalEntry(entryId, { is_archived: true });
}

export async function unarchiveJournalEntry(entryId: string): Promise<JournalEntry> {
  return updateJournalEntry(entryId, { is_archived: false });
}
