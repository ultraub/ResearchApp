/**
 * Document types and constants for the knowledge management system.
 */

export type DocumentType =
  | 'note'
  | 'research'
  | 'meeting'
  | 'report'
  | 'design'
  | 'proposal'
  | 'specification'
  | 'documentation'
  | 'analysis'
  | 'plan'
  | 'other';

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  note: 'Note',
  research: 'Research',
  meeting: 'Meeting Notes',
  report: 'Report',
  design: 'Design',
  proposal: 'Proposal',
  specification: 'Specification',
  documentation: 'Documentation',
  analysis: 'Analysis',
  plan: 'Plan',
  other: 'Other',
};

export const DOCUMENT_TYPE_ICONS: Record<DocumentType, string> = {
  note: '📝',
  research: '🔬',
  meeting: '👥',
  report: '📊',
  design: '🎨',
  proposal: '💡',
  specification: '📋',
  documentation: '📖',
  analysis: '📈',
  plan: '🗓️',
  other: '📄',
};

export const DOCUMENT_TYPE_COLORS: Record<DocumentType, string> = {
  note: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  research: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  meeting: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  report: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  design: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
  proposal: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  specification: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  documentation: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  analysis: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  plan: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  other: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

export const DOCUMENT_TYPE_DESCRIPTIONS: Record<DocumentType, string> = {
  note: 'Quick notes and thoughts',
  research: 'Research findings and studies',
  meeting: 'Meeting notes and minutes',
  report: 'Formal reports and summaries',
  design: 'Design documents and mockups',
  proposal: 'Project proposals and pitches',
  specification: 'Technical specifications',
  documentation: 'How-to guides and docs',
  analysis: 'Data analysis and insights',
  plan: 'Project plans and roadmaps',
  other: 'Other document types',
};

/** Get all document types as options for select/listbox */
export const DOCUMENT_TYPE_OPTIONS = Object.entries(DOCUMENT_TYPE_LABELS).map(
  ([value, label]) => ({
    value: value as DocumentType,
    label,
    icon: DOCUMENT_TYPE_ICONS[value as DocumentType],
    description: DOCUMENT_TYPE_DESCRIPTIONS[value as DocumentType],
  })
);

/** Default document type for new documents */
export const DEFAULT_DOCUMENT_TYPE: DocumentType = 'note';
