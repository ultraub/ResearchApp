import { Outlet, Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";

export default function AuthLayout() {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-dark-base">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex min-h-screen">
      {/* Left side - branding */}
      <div className="hidden lg:flex lg:w-1/2 lg:flex-col lg:justify-center lg:bg-primary-600 lg:px-12">
        <div className="max-w-md">
          <h1 className="text-4xl font-bold text-white">Pasteur</h1>
          <p className="mt-4 text-lg text-primary-100">
            Streamline your research workflow with intelligent project
            management, collaborative documents, and AI-powered insights.
          </p>
          <div className="mt-8 space-y-4">
            <div className="flex items-center gap-3 text-primary-100">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500">
                <svg
                  className="h-5 w-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <span>Quick capture for ideas on the go</span>
            </div>
            <div className="flex items-center gap-3 text-primary-100">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500">
                <svg
                  className="h-5 w-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <span>AI-powered document assistance</span>
            </div>
            <div className="flex items-center gap-3 text-primary-100">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500">
                <svg
                  className="h-5 w-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  />
                </svg>
              </div>
              <span>Knowledge library with paper imports</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - auth form */}
      <div className="flex w-full flex-col items-center justify-center px-4 py-8 lg:w-1/2 lg:py-0">
        <div className="w-full max-w-sm">
          {/* Mobile logo - shown when branding panel is hidden */}
          <div className="mb-8 text-center lg:hidden">
            <h1 className="text-3xl font-bold text-primary-600">Pasteur</h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Research workflow management
            </p>
          </div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
