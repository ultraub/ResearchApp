import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";

const isDev = import.meta.env.DEV;

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login, devLogin, error, clearError, isAuthenticated } = useAuthStore();

  // Track if we've already processed an OAuth code to prevent double-processing
  const processedCodeRef = useRef<string | null>(null);

  const handleDevLogin = () => {
    devLogin();
    navigate("/dashboard");
  };

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, navigate]);

  // Handle OAuth callback
  useEffect(() => {
    const code = searchParams.get("code");

    // Skip if no code, already processing, or code already processed
    if (!code || isLoading || processedCodeRef.current === code) {
      return;
    }

    // Mark this code as being processed
    processedCodeRef.current = code;

    // Clear the code from URL immediately to prevent reprocessing
    setSearchParams({}, { replace: true });

    handleOAuthCallback(code);
  }, [searchParams]);

  const handleOAuthCallback = async (code: string) => {
    setIsLoading(true);
    clearError();

    try {
      await login(code, `${window.location.origin}/login`);
      navigate("/dashboard", { replace: true });
    } catch {
      // Error is handled by the store
      // Reset the processed code ref so user can try again
      processedCodeRef.current = null;
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const redirectUri = encodeURIComponent(`${window.location.origin}/login`);
    const scope = encodeURIComponent("openid profile email");
    const state = crypto.randomUUID();

    // Store state for CSRF protection
    sessionStorage.setItem("oauth_state", state);

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}&access_type=offline&prompt=consent`;

    window.location.href = authUrl;
  };

  return (
    <div className="space-y-6">
      <div className="text-center lg:text-left">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Welcome back
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Sign in with your organization account to continue
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-error-50 p-4 text-sm text-error-600 shadow-soft">
          {error}
        </div>
      )}

      <button
        onClick={handleGoogleLogin}
        disabled={isLoading}
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-soft transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-border dark:bg-dark-card dark:text-gray-200 dark:hover:bg-dark-elevated"
      >
        {isLoading ? (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-transparent dark:border-gray-300 dark:border-t-transparent" />
        ) : (
          <>
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Sign in with Google
          </>
        )}
      </button>

      {isDev && (
        <button
          onClick={handleDevLogin}
          className="flex w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed border-amber-500 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700 shadow-soft transition-colors hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/30"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          Dev Login (Skip Auth)
        </button>
      )}

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200 dark:border-dark-border" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-2 text-gray-500 dark:bg-dark-base dark:text-gray-400">
            Or continue with
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-4 shadow-soft dark:border-dark-border dark:from-dark-card dark:to-dark-elevated">
        <p className="text-center text-sm text-gray-600 dark:text-gray-400">
          Have a guest access link? Enter your invite code below.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            placeholder="Enter invite code"
            className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm placeholder-gray-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white"
          />
          <button className="rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 px-4 py-2 text-sm font-medium text-white shadow-soft hover:from-primary-600 hover:to-primary-700">
            Join
          </button>
        </div>
      </div>

      <p className="text-center text-xs text-gray-500 dark:text-gray-400">
        By signing in, you agree to our{" "}
        <a href="#" className="text-primary-600 hover:underline">
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="#" className="text-primary-600 hover:underline">
          Privacy Policy
        </a>
      </p>
    </div>
  );
}
