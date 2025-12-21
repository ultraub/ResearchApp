import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";

// Layouts
import AppLayout from "@/components/layout/AppLayout";
import AuthLayout from "@/components/layout/AuthLayout";

// Pages
import LoginPage from "@/pages/auth/LoginPage";
import OnboardingPage from "@/pages/onboarding/OnboardingPage";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import IdeasPage from "@/pages/ideas/IdeasPage";
import ProjectsPage from "@/pages/projects/ProjectsPage";
import ProjectDetailPage from "@/pages/projects/ProjectDetailPage";
import DocumentsPage from "@/pages/documents/DocumentsPage";
import DocumentEditorPage from "@/pages/documents/DocumentEditorPage";
import { DocumentsListPage } from "@/pages/documents/DocumentsListPage";
import KnowledgePage from "@/pages/knowledge/KnowledgePage";
import ReviewsPage from "@/pages/reviews/ReviewsPage";
import ReviewDetailPage from "@/pages/reviews/ReviewDetailPage";
import JournalsPage from "@/pages/journals/JournalsPage";
import TeamsPage from "@/pages/teams/TeamsPage";
import TeamDetailPage from "@/pages/teams/TeamDetailPage";
import OrganizationPage from "@/pages/organizations/OrganizationPage";
import JoinPage from "@/pages/join/JoinPage";
import SettingsPage from "@/pages/settings/SettingsPage";
import NotFoundPage from "@/pages/NotFoundPage";

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Onboarding check wrapper
function OnboardingCheck({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();

  if (user && !user.onboarding_completed) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      {/* Onboarding */}
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <OnboardingPage />
          </ProtectedRoute>
        }
      />

      {/* Protected app routes */}
      <Route
        element={
          <ProtectedRoute>
            <OnboardingCheck>
              <AppLayout />
            </OnboardingCheck>
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/ideas" element={<IdeasPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/new" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="/projects/:projectId/documents" element={<DocumentsListPage />} />
        <Route path="/projects/:projectId/documents/:documentId" element={<DocumentEditorPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/documents/new" element={<DocumentsPage />} />
        <Route path="/documents/:documentId" element={<DocumentEditorPage />} />
        <Route path="/knowledge" element={<KnowledgePage />} />
        <Route path="/journals" element={<JournalsPage />} />
        <Route path="/reviews" element={<ReviewsPage />} />
        <Route path="/reviews/:reviewId" element={<ReviewDetailPage />} />
        <Route path="/teams" element={<TeamsPage />} />
        <Route path="/teams/:teamId" element={<TeamDetailPage />} />
        <Route path="/organizations/:orgId" element={<OrganizationPage />} />
        <Route path="/join/:code" element={<JoinPage />} />
        <Route path="/settings/*" element={<SettingsPage />} />
      </Route>

      {/* 404 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
