/**
 * BottomTabBar - Mobile bottom navigation component
 *
 * Features:
 * - Fixed bottom navigation with 5 tabs
 * - Primary nav: Dashboard, Projects, Documents, Knowledge
 * - "More" tab opens menu for secondary navigation
 * - Active state with filled icons and colored indicator
 * - Safe area padding for notched phones
 * - Dark mode support
 */

import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { clsx } from "clsx";
import {
  HomeIcon,
  FolderIcon,
  DocumentTextIcon,
  BookOpenIcon,
  EllipsisHorizontalIcon,
} from "@heroicons/react/24/outline";
import {
  HomeIcon as HomeIconSolid,
  FolderIcon as FolderIconSolid,
  DocumentTextIcon as DocumentTextIconSolid,
  BookOpenIcon as BookOpenIconSolid,
} from "@heroicons/react/24/solid";
import { MobileMoreMenu } from "./MobileMoreMenu";

interface TabItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  iconActive: React.ComponentType<{ className?: string }>;
}

const primaryTabs: TabItem[] = [
  {
    name: "Home",
    href: "/dashboard",
    icon: HomeIcon,
    iconActive: HomeIconSolid,
  },
  {
    name: "Projects",
    href: "/projects",
    icon: FolderIcon,
    iconActive: FolderIconSolid,
  },
  {
    name: "Docs",
    href: "/documents",
    icon: DocumentTextIcon,
    iconActive: DocumentTextIconSolid,
  },
  {
    name: "Library",
    href: "/knowledge",
    icon: BookOpenIcon,
    iconActive: BookOpenIconSolid,
  },
];

// Routes that should highlight the "More" tab
const moreRoutes = [
  "/ideas",
  "/journals",
  "/reviews",
  "/teams",
  "/settings",
];

export function BottomTabBar({ className }: { className?: string }) {
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const location = useLocation();

  // Check if current route is in "More" menu
  const isMoreActive = moreRoutes.some((route) =>
    location.pathname.startsWith(route)
  );

  return (
    <>
      <nav
        className={clsx(
          "fixed bottom-0 left-0 right-0 z-40",
          "bg-white/95 dark:bg-dark-card/95 backdrop-blur-lg",
          "border-t border-gray-200 dark:border-dark-border",
          "pb-safe", // Safe area for notched phones
          className
        )}
      >
        <div className="flex h-16 items-center justify-around px-2">
          {primaryTabs.map((tab) => {
            const isActive = location.pathname.startsWith(tab.href);
            const Icon = isActive ? tab.iconActive : tab.icon;

            return (
              <NavLink
                key={tab.name}
                to={tab.href}
                className={clsx(
                  "flex flex-col items-center justify-center",
                  "min-w-[64px] h-full",
                  "transition-colors",
                  isActive
                    ? "text-primary-600 dark:text-primary-400"
                    : "text-gray-500 dark:text-gray-400"
                )}
              >
                <span className="relative">
                  <Icon className="h-6 w-6" />
                  {/* Active indicator */}
                  {isActive && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-primary-500" />
                  )}
                </span>
                <span className="text-[10px] font-medium mt-1">{tab.name}</span>
              </NavLink>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setMoreMenuOpen(true)}
            className={clsx(
              "flex flex-col items-center justify-center",
              "min-w-[64px] h-full",
              "transition-colors",
              isMoreActive
                ? "text-primary-600 dark:text-primary-400"
                : "text-gray-500 dark:text-gray-400"
            )}
          >
            <span className="relative">
              <EllipsisHorizontalIcon className="h-6 w-6" />
              {isMoreActive && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-primary-500" />
              )}
            </span>
            <span className="text-[10px] font-medium mt-1">More</span>
          </button>
        </div>
      </nav>

      {/* More menu bottom sheet */}
      <MobileMoreMenu
        isOpen={moreMenuOpen}
        onClose={() => setMoreMenuOpen(false)}
      />
    </>
  );
}

export default BottomTabBar;
