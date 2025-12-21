import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 dark:bg-dark-base">
      <div className="text-center">
        <div className="mb-6 inline-flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-primary-100 to-primary-200 shadow-soft dark:from-primary-900/30 dark:to-primary-800/30">
          <p className="text-4xl font-bold text-primary-600 dark:text-primary-400">404</p>
        </div>
        <h1 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">
          Page not found
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Sorry, we couldn't find the page you're looking for.
        </p>
        <div className="mt-6">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 px-6 py-3 text-sm font-medium text-white shadow-soft hover:from-primary-600 hover:to-primary-700"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
