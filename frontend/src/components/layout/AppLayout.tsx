import { Outlet, NavLink } from "react-router-dom";
import {
  HomeIcon,
  FolderIcon,
  DocumentTextIcon,
  BookOpenIcon,
  Cog6ToothIcon,
  MagnifyingGlassIcon,
  LightBulbIcon,
  ClipboardDocumentCheckIcon,
  PencilSquareIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import { NotificationsDropdown } from "./NotificationsDropdown";
import { UserMenu } from "./UserMenu";
import { ThemeToggle } from "./ThemeToggle";
import { BottomTabBar } from "./BottomTabBar";
import { useTeams } from "@/hooks/useTeams";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: HomeIcon },
  { name: "Ideas", href: "/ideas", icon: LightBulbIcon },
  { name: "Projects", href: "/projects", icon: FolderIcon },
  { name: "Teams", href: "/teams", icon: UserGroupIcon },
  { name: "Documents", href: "/documents", icon: DocumentTextIcon },
  { name: "Journal", href: "/journals", icon: PencilSquareIcon },
  { name: "Knowledge", href: "/knowledge", icon: BookOpenIcon },
  { name: "Reviews", href: "/reviews", icon: ClipboardDocumentCheckIcon },
  { name: "Settings", href: "/settings", icon: Cog6ToothIcon },
];

export default function AppLayout() {
  // Fetch and sync teams on app load - ensures fresh data after login
  useTeams();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-base">

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-gray-200/80 bg-gradient-to-b from-white to-gray-50/50 dark:border-dark-border dark:from-dark-card dark:to-dark-base lg:block">
        <div className="flex h-16 items-center px-6">
          <span className="text-xl font-semibold bg-gradient-to-r from-primary-600 to-primary-500 bg-clip-text text-transparent">
            Pasteur
          </span>
        </div>
        <nav className="px-3 py-4">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 mb-1",
                  isActive
                    ? "bg-gradient-to-r from-primary-50 to-primary-100/50 text-primary-700 shadow-sm dark:from-primary-900/30 dark:to-primary-900/10 dark:text-primary-300"
                    : "text-gray-600 hover:bg-gray-100/80 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-dark-elevated dark:hover:text-gray-200"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={clsx(
                    "flex h-8 w-8 items-center justify-center rounded-lg transition-all",
                    isActive
                      ? "bg-primary-500 text-white shadow-md shadow-primary-500/30"
                      : "bg-gray-100 text-gray-500 dark:bg-dark-elevated dark:text-gray-400"
                  )}>
                    <item.icon className="h-4 w-4" />
                  </span>
                  {item.name}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main content area */}
      <div className="lg:pl-64">
        {/* Top header */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-gray-200/80 bg-white/95 backdrop-blur-sm px-3 shadow-sm dark:border-dark-border dark:bg-dark-card/95 sm:px-4 lg:px-6">
          {/* Mobile: App name */}
          <span className="text-lg font-semibold bg-gradient-to-r from-primary-600 to-primary-500 bg-clip-text text-transparent lg:hidden">
            Pasteur
          </span>

          {/* Search */}
          <div className="flex-1">
            <div className="relative max-w-md group">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-primary-500" />
              <input
                type="search"
                placeholder="Search..."
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-500 transition-all focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:shadow-sm dark:border-dark-border dark:bg-dark-elevated dark:text-white dark:placeholder-gray-400 dark:focus:border-primary-500/50 dark:focus:ring-primary-500/10"
              />
              <kbd className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500 dark:bg-dark-border dark:text-gray-400 sm:block">
                ⌘K
              </kbd>
            </div>
          </div>

          {/* Right side items */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <NotificationsDropdown />
            <UserMenu />
          </div>
        </header>

        {/* Page content - bottom padding for mobile tab bar */}
        <main className="min-h-[calc(100vh-4rem)] pb-20 md:pb-0">
          <Outlet />
        </main>
      </div>

      {/* Mobile: Bottom tab bar */}
      <BottomTabBar className="md:hidden" />
    </div>
  );
}
