/**
 * Hook for triggering on-demand AI document review
 * Uses the review_suggest template to analyze document content
 */

import { useState, useCallback } from 'react';
import * as aiService from '../services/ai';

export interface AIReviewSuggestion {
  id: string;
  type: 'gap_identified' | 'clarity_needed' | 'methodology_concern' | 'consistency_issue' | 'general';
  severity: 'critical' | 'major' | 'minor' | 'suggestion';
  content: string;
  location?: {
    paragraph?: number;
    text_snippet?: string;
  };
  question_for_author?: string;
  why_this_matters?: string;
  confidence: number;
  status: 'pending' | 'accepted' | 'dismissed';
  resolution_notes?: string;
}

interface UseAutoReviewOptions {
  documentId: string;
  documentType?: string;
}

interface UseAutoReviewReturn {
  suggestions: AIReviewSuggestion[];
  isLoading: boolean;
  error: string | null;
  overallAssessment: string | null;
  triggerReview: (content: string, focusAreas?: string[]) => Promise<void>;
  acceptSuggestion: (suggestionId: string, notes?: string) => void;
  dismissSuggestion: (suggestionId: string, notes?: string) => void;
  clearSuggestions: () => void;
}

let suggestionIdCounter = 0;

function generateSuggestionId(): string {
  return `ai-suggestion-${Date.now()}-${++suggestionIdCounter}`;
}

function parseAIResponse(responseText: string): {
  suggestions: Omit<AIReviewSuggestion, 'id' | 'status'>[];
  overallAssessment?: string;
} {
  // Try to extract JSON from response
  try {
    // Find JSON block in response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
        const suggestions = parsed.suggestions.map((s: Record<string, unknown>) => ({
          type: normalizeType(s.type as string),
          severity: normalizeSeverity(s.severity as string),
          content: (s.issue || s.content || s.description || '') as string,
          location: s.location as { paragraph?: number; text_snippet?: string } | undefined,
          question_for_author: (s.question_for_author || s.question) as string | undefined,
          why_this_matters: (s.why_this_matters || s.importance) as string | undefined,
          confidence: (s.confidence || s.ai_confidence || 0.7) as number,
        }));

        return {
          suggestions,
          overallAssessment: parsed.overall_assessment as string | undefined,
        };
      }
    }
  } catch {
    // Fall back to text parsing
  }

  // Fallback: treat entire response as a single suggestion
  if (responseText.trim().length > 50) {
    return {
      suggestions: [
        {
          type: 'general',
          severity: 'minor',
          content: responseText.trim().slice(0, 1000),
          confidence: 0.5,
        },
      ],
    };
  }

  return { suggestions: [] };
}

function normalizeType(type: string): AIReviewSuggestion['type'] {
  const typeMap: Record<string, AIReviewSuggestion['type']> = {
    gap: 'gap_identified',
    gap_identified: 'gap_identified',
    clarity: 'clarity_needed',
    clarity_needed: 'clarity_needed',
    methodology: 'methodology_concern',
    methodology_concern: 'methodology_concern',
    consistency: 'consistency_issue',
    consistency_issue: 'consistency_issue',
    completeness: 'gap_identified',
    issue: 'gap_identified',
  };
  return typeMap[type?.toLowerCase()] || 'general';
}

function normalizeSeverity(severity: string): AIReviewSuggestion['severity'] {
  const severityMap: Record<string, AIReviewSuggestion['severity']> = {
    critical: 'critical',
    major: 'major',
    high: 'major',
    moderate: 'minor',
    minor: 'minor',
    low: 'minor',
    suggestion: 'suggestion',
  };
  return severityMap[severity?.toLowerCase()] || 'minor';
}

export function useAutoReview({
  documentId,
  documentType = 'document',
}: UseAutoReviewOptions): UseAutoReviewReturn {
  const [suggestions, setSuggestions] = useState<AIReviewSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overallAssessment, setOverallAssessment] = useState<string | null>(null);

  const triggerReview = useCallback(
    async (content: string, focusAreas?: string[]) => {
      if (!content.trim() || content.trim().length < 50) {
        setError('Document content is too short for review');
        return;
      }

      setIsLoading(true);
      setError(null);
      setSuggestions([]);
      setOverallAssessment(null);

      try {
        const response = await aiService.generate({
          template_key: 'review_suggest',
          variables: {
            document_content: content,
            document_type: documentType,
            focus_areas: focusAreas || [],
          },
          context_type: 'document',
          context_id: documentId,
        });

        const { suggestions: parsedSuggestions, overallAssessment: assessment } = parseAIResponse(
          response.content
        );

        // Add IDs and status to suggestions
        const suggestionsWithIds: AIReviewSuggestion[] = parsedSuggestions.map((s) => ({
          ...s,
          id: generateSuggestionId(),
          status: 'pending' as const,
        }));

        setSuggestions(suggestionsWithIds);
        setOverallAssessment(assessment || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate review');
      } finally {
        setIsLoading(false);
      }
    },
    [documentId, documentType]
  );

  const acceptSuggestion = useCallback((suggestionId: string, notes?: string) => {
    setSuggestions((prev) =>
      prev.map((s) =>
        s.id === suggestionId ? { ...s, status: 'accepted' as const, resolution_notes: notes } : s
      )
    );
  }, []);

  const dismissSuggestion = useCallback((suggestionId: string, notes?: string) => {
    setSuggestions((prev) =>
      prev.map((s) =>
        s.id === suggestionId ? { ...s, status: 'dismissed' as const, resolution_notes: notes } : s
      )
    );
  }, []);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setOverallAssessment(null);
    setError(null);
  }, []);

  return {
    suggestions,
    isLoading,
    error,
    overallAssessment,
    triggerReview,
    acceptSuggestion,
    dismissSuggestion,
    clearSuggestions,
  };
}

export default useAutoReview;
