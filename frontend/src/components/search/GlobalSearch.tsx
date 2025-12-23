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
  Plus,
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

// Primary types shown in filter bar
const primaryTypes = ['project', 'task', 'document', 'idea', 'paper', 'journal'];

const typeColors: Record<string, string> = {
  project: 'text-primary-600 bg-primary-50 dark:bg-primary-900/30 dark:text-primary-400',
  task: 'text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-400',
  document: 'text-purple-600 bg-purple-50 dark:bg-purple-900/30 dark:text-purple-400',
  idea: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400',
  paper: 'text-orange-600 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400',
  collection: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-400',
  user: 'text-gray-600 bg-gray-100 dark:bg-gray-800/50 dark:text-gray-400',
  journal: 'text-teal-600 bg-teal-50 dark:bg-teal-900/30 dark:text-teal-400',
};

const typeLabels: Record<string, string> = {
  project: 'Projects',
  task: 'Tasks',
  document: 'Documents',
  idea: 'Ideas',
  paper: 'Papers',
  collection: 'Collections',
  user: 'Users',
  journal: 'Journals',
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
      className={`w-full flex items-start gap-3 p-3 text-left transition-all duration-150 ${
        isSelected
          ? 'bg-primary-50 dark:bg-primary-900/20 border-l-2 border-primary-500'
          : 'hover:bg-gray-50 dark:hover:bg-dark-elevated border-l-2 border-transparent'
      }`}
    >
      <div className={`p-2.5 rounded-xl ${colorClass} shadow-sm`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-gray-900 dark:text-white truncate">{item.title}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full ${colorClass}`}>
            {item.type}
          </span>
        </div>
        {item.snippet ? (
          <p
            className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mt-1"
            dangerouslySetInnerHTML={{ __html: item.snippet }}
          />
        ) : item.description ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">{item.description}</p>
        ) : null}
      </div>
      {isSelected && <ArrowRight className="h-4 w-4 text-primary-600 dark:text-primary-400 flex-shrink-0 mt-2" />}
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
        className="flex items-center gap-2.5 px-4 py-2 text-gray-500 dark:text-gray-400 bg-gray-100/80 dark:bg-dark-elevated/80 rounded-xl hover:bg-gray-200 dark:hover:bg-dark-card transition-all duration-200 shadow-sm hover:shadow"
      >
        <Search className="h-4 w-4" />
        <span className="text-sm font-medium">Search...</span>
        <kbd className="hidden sm:flex items-center gap-0.5 px-2 py-1 text-xs font-medium bg-white dark:bg-dark-base rounded-lg border border-gray-200 dark:border-dark-border shadow-sm">
          <Command className="h-3 w-3" />K
        </kbd>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4">
      {/* Backdrop - click anywhere to close */}
      <div
        className="absolute inset-0 bg-gray-900/50 dark:bg-black/60 backdrop-blur-sm cursor-pointer"
        onClick={() => setIsOpen(false)}
        onMouseDown={() => setIsOpen(false)}
        role="button"
        tabIndex={-1}
        aria-label="Close search"
      />

      {/* Search panel - stop propagation to prevent backdrop from closing */}
      <div
        className="relative z-10 w-full max-w-2xl bg-white dark:bg-dark-card rounded-2xl shadow-2xl overflow-hidden border border-gray-200/50 dark:border-dark-border animate-in fade-in slide-in-from-top-4 duration-200"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}>
        {/* Search input */}
        <div className="flex items-center gap-4 p-5 border-b border-gray-100 dark:border-dark-border">
          <div className="p-2 rounded-xl bg-primary-50 dark:bg-primary-900/30">
            <Search className="h-5 w-5 text-primary-600 dark:text-primary-400" />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search projects, documents, tasks..."
            className="flex-1 text-lg font-medium focus:outline-none bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-elevated rounded-lg transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => setIsOpen(false)}
            className="px-2.5 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-dark-elevated rounded-lg hover:bg-gray-200 dark:hover:bg-dark-card transition-colors"
          >
            ESC
          </button>
        </div>

        {/* Type filters */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 dark:border-dark-border bg-gray-50/50 dark:bg-dark-elevated/30 overflow-x-auto">
          <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mr-1">Filter:</span>
          {primaryTypes.map((type) => {
            const Icon = typeIcons[type];
            const isActive = selectedTypes.includes(type);
            return (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all duration-150 ${
                  isActive
                    ? `${typeColors[type]} shadow-sm ring-1 ring-current/20`
                    : 'text-gray-600 dark:text-gray-400 bg-white dark:bg-dark-card hover:bg-gray-100 dark:hover:bg-dark-elevated border border-gray-200 dark:border-dark-border'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{typeLabels[type]}</span>
              </button>
            );
          })}
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {isLoading ? (
            <div className="p-5 space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse flex gap-4">
                  <div className="h-11 w-11 rounded-xl bg-gray-200 dark:bg-dark-elevated" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-4 bg-gray-200 dark:bg-dark-elevated rounded-lg w-2/3" />
                    <div className="h-3 bg-gray-200 dark:bg-dark-elevated rounded-lg w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : query && results.length === 0 ? (
            <div className="p-10 text-center">
              <div className="p-4 rounded-2xl bg-gray-100 dark:bg-dark-elevated w-fit mx-auto mb-4">
                <Search className="h-8 w-8 text-gray-400 dark:text-gray-500" />
              </div>
              <p className="font-medium text-gray-900 dark:text-white">No results found</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Try different keywords or adjust your filters
              </p>
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
            <div className="p-5">
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">Quick Actions</p>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    setIsOpen(false);
                    navigate('/projects?create=true');
                  }}
                  className="w-full flex items-center gap-4 p-3 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-elevated rounded-xl transition-colors group"
                >
                  <div className="p-2.5 rounded-xl bg-primary-50 dark:bg-primary-900/30 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/40 transition-colors">
                    <Plus className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                  </div>
                  <div>
                    <span className="font-medium">Create new project</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Start organizing your research</p>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    navigate('/documents/new');
                  }}
                  className="w-full flex items-center gap-4 p-3 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-elevated rounded-xl transition-colors group"
                >
                  <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-900/30 group-hover:bg-purple-100 dark:group-hover:bg-purple-900/40 transition-colors">
                    <FileText className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <span className="font-medium">Create new document</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Write notes, papers, or reports</p>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    navigate('/ideas?create=true');
                  }}
                  className="w-full flex items-center gap-4 p-3 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-elevated rounded-xl transition-colors group"
                >
                  <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/30 group-hover:bg-amber-100 dark:group-hover:bg-amber-900/40 transition-colors">
                    <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <span className="font-medium">Capture new idea</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Save your thoughts for later</p>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-dark-border bg-gray-50/50 dark:bg-dark-elevated/30 text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 bg-white dark:bg-dark-card rounded-md border border-gray-200 dark:border-dark-border shadow-sm">↑</kbd>
                <kbd className="px-1.5 py-0.5 bg-white dark:bg-dark-card rounded-md border border-gray-200 dark:border-dark-border shadow-sm">↓</kbd>
                <span className="ml-1">navigate</span>
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 bg-white dark:bg-dark-card rounded-md border border-gray-200 dark:border-dark-border shadow-sm">↵</kbd>
                <span className="ml-1">select</span>
              </span>
            </div>
            <span className="font-medium">{data?.total || 0} results</span>
          </div>
        )}
      </div>
    </div>
  );
}
