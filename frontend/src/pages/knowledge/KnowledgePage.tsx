import { useOrganizationStore } from '@/stores/organization';
import { KnowledgeLibraryPage } from './KnowledgeLibraryPage';

export default function KnowledgePage() {
  const { organization } = useOrganizationStore();

  // Use the current organization from the store
  const organizationId = organization?.id || '';

  if (!organizationId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Please select an organization to view papers.</p>
      </div>
    );
  }

  return <KnowledgeLibraryPage organizationId={organizationId} />;
}
