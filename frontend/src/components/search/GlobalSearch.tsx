/**
 * Global search component with command palette style.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useDebounce } from 'use-debounce';
import {
  Search,
  X,
  FileText,
  Folder,
  CheckSquare,
  Lightbulb,
  BookOpen,
  FolderOpen,
  User,
  ArrowRight,
  Command,
  PenSquare,
} from 'lucide-react';
import { searchApi, type SearchResultItem } from '../../services/search';

interface GlobalSearchProps {
  organizationId: string;
}

const typeIcons: Record<string, typeof FileText> = {
  project: Folder,
  task: CheckSquare,
  document: FileText,
  idea: Lightbulb,
  paper: BookOpen,
  collection: FolderOpen,
  user: User,
  journal: PenSquare,
};

const typeColors: Record<string, string> = {
  project: 'text-primary-600 bg-primary-50 dark:bg-primary-900/30 dark:text-primary-400',
  task: 'text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-400',
  document: 'text-purple-600 bg-purple-50 dark:bg-purple-900/30 dark:text-purple-400',
  idea: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/30 dark:text-yellow-400',
  paper: 'text-orange-600 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400',
  collection: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-400',
  user: 'text-gray-600 bg-gray-50 dark:bg-gray-900/30 dark:text-gray-400',
  journal: 'text-teal-600 bg-teal-50 dark:bg-teal-900/30 dark:text-teal-400',
};

function SearchResultItemComponent({
  item,
  isSelected,
  onClick,
}: {
  item: SearchResultItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  const Icon = typeIcons[item.type] || FileText;
  const colorClass = typeColors[item.type] || 'text-gray-600 bg-gray-50';

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 p-3 text-left transition-colors ${
        isSelected ? 'bg-primary-50 dark:bg-primary-900/30' : 'hover:bg-gray-50 dark:hover:bg-dark-elevated'
      }`}
    >
      <div className={`p-2 rounded-lg ${colorClass}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-gray-900 dark:text-white truncate">{item.title}</p>
          <span className="text-xs text-gray-400 dark:text-gray-500 capitalize">{item.type}</span>
        </div>
        {item.snippet ? (
          <p
            className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5"
            dangerouslySetInnerHTML={{ __html: item.snippet }}
          />
        ) : item.description ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">{item.description}</p>
        ) : null}
      </div>
      {isSelected && <ArrowRight className="h-4 w-4 text-primary-600 dark:text-primary-400 flex-shrink-0 mt-1" />}
    </button>
  );
}

export function GlobalSearch({ organizationId }: GlobalSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const [debouncedQuery] = useDebounce(query, 300);

  // Search query
  const { data, isLoading } = useQuery({
    queryKey: ['search', debouncedQuery, organizationId, selectedTypes],
    queryFn: () =>
      searchApi.search({
        q: debouncedQuery,
        organization_id: organizationId,
        types: selectedTypes.length > 0 ? selectedTypes : undefined,
        limit: 10,
      }),
    enabled: debouncedQuery.length >= 1,
  });

  const results = data?.results || [];

  // Keyboard shortcut to open search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Handle navigation
  const handleSelect = useCallback(
    (item: SearchResultItem) => {
      navigate(item.url);
      setIsOpen(false);
      setQuery('');
    },
    [navigate]
  );

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    }
  };

  const toggleType = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-dark-elevated rounded-lg hover:bg-gray-200 dark:hover:bg-dark-card transition-colors"
      >
        <Search className="h-4 w-4" />
        <span className="text-sm">Search...</span>
        <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 text-xs bg-white dark:bg-dark-base rounded border border-gray-200 dark:border-dark-border">
          <Command className="h-3 w-3" />K
        </kbd>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
      {/* Backdrop - starts below header (top-16 = h-16 header height) */}
      <div className="absolute inset-x-0 top-16 bottom-0 bg-black/50" onClick={() => setIsOpen(false)} />

      {/* Search panel */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-dark-card rounded-xl shadow-card overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-dark-border">
          <Search className="h-5 w-5 text-gray-400 dark:text-gray-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search projects, documents, tasks..."
            className="flex-1 text-lg focus:outline-none bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
          />
          {query && (
            <button onClick={() => setQuery('')} className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400">
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => setIsOpen(false)}
            className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-dark-elevated rounded"
          >
            ESC
          </button>
        </div>

        {/* Type filters */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 dark:border-dark-border overflow-x-auto">
          {Object.entries(typeIcons).map(([type, Icon]) => (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${
                selectedTypes.includes(type)
                  ? typeColors[type]
                  : 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-dark-elevated hover:bg-gray-200 dark:hover:bg-dark-card'
              }`}
            >
              <Icon className="h-3 w-3" />
              <span className="capitalize">{type}s</span>
            </button>
          ))}
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse flex gap-3">
                  <div className="h-10 w-10 rounded-lg bg-gray-200 dark:bg-dark-elevated" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-dark-elevated rounded w-2/3" />
                    <div className="h-3 bg-gray-200 dark:bg-dark-elevated rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : query && results.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <Search className="h-12 w-12 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
              <p>No results found for "{query}"</p>
              <p className="text-sm mt-1">Try different keywords or filters</p>
            </div>
          ) : query && results.length > 0 ? (
            <div className="divide-y divide-gray-100 dark:divide-dark-border">
              {results.map((item, index) => (
                <SearchResultItemComponent
                  key={item.id}
                  item={item}
                  isSelected={index === selectedIndex}
                  onClick={() => handleSelect(item)}
                />
              ))}
            </div>
          ) : (
            <div className="p-4">
              <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase mb-3">Quick Actions</p>
              <div className="space-y-1">
                <button
                  onClick={() => {
                    setIsOpen(false);
                    navigate('/projects?create=true');
                  }}
                  className="w-full flex items-center gap-3 p-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-elevated rounded-lg"
                >
                  <Folder className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                  <span>Create new project</span>
                </button>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    navigate('/documents/new');
                  }}
                  className="w-full flex items-center gap-3 p-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-elevated rounded-lg"
                >
                  <FileText className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  <span>Create new document</span>
                </button>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    navigate('/ideas?create=true');
                  }}
                  className="w-full flex items-center gap-3 p-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-elevated rounded-lg"
                >
                  <Lightbulb className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                  <span>Capture new idea</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 dark:border-dark-border text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-dark-elevated rounded">↑</kbd>
                <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-dark-elevated rounded">↓</kbd>
                to navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-dark-elevated rounded">↵</kbd>
                to select
              </span>
            </div>
            <span>{data?.total || 0} results</span>
          </div>
        )}
      </div>
    </div>
  );
}
