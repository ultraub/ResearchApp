import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { XMarkIcon, MagnifyingGlassIcon, FolderIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { projectsService } from '@/services/projects';
import { linkPaperToProject, type Paper } from '@/services/knowledge';
import type { Project } from '@/types';

interface LinkPaperToProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  paper: Paper;
}

export function LinkPaperToProjectModal({ isOpen, onClose, paper }: LinkPaperToProjectModalProps) {
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data: projectsData, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsService.list(),
    enabled: isOpen,
  });

  const linkMutation = useMutation({
    mutationFn: (projectId: string) => linkPaperToProject(paper.id, projectId),
    onSuccess: () => {
      toast.success('Paper linked to project');
      queryClient.invalidateQueries({ queryKey: ['paper-links', paper.id] });
      onClose();
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { status?: number } };
      if (axiosError?.response?.status === 409) {
        toast.error('Paper is already linked to this project');
      } else {
        toast.error('Failed to link paper');
      }
    },
  });

  const filteredProjects: Project[] = (projectsData?.items || []).filter((project: Project) =>
    project.name.toLowerCase().includes(search.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />

        <div className="relative w-full max-w-md bg-white dark:bg-dark-card rounded-xl shadow-card">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Link to Project
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Link "<span className="font-medium text-gray-900 dark:text-white">{paper.title}</span>" to a project
            </p>

            <div className="relative mb-4">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search projects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-elevated text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div className="max-h-64 overflow-y-auto space-y-1">
              {isLoading ? (
                <div className="py-8 text-center text-gray-500">Loading projects...</div>
              ) : filteredProjects.length === 0 ? (
                <div className="py-8 text-center text-gray-500">
                  {search ? 'No projects found' : 'No projects available'}
                </div>
              ) : (
                filteredProjects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => linkMutation.mutate(project.id)}
                    disabled={linkMutation.isPending}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-elevated transition-colors text-left disabled:opacity-50"
                  >
                    <FolderIcon className="h-5 w-5 text-gray-400" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate">
                        {project.name}
                      </p>
                      {project.description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                          {project.description}
                        </p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
