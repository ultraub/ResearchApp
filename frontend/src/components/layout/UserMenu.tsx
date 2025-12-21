/**
 * User Menu Dropdown - User profile, settings, and logout.
 */

import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  User,
  Settings,
  LogOut,
  ChevronDown,
  Bell,
  Moon,
  Sun,
  HelpCircle,
  Keyboard,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";

interface UserMenuProps {
  className?: string;
}

export function UserMenu({ className }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(
    document.documentElement.classList.contains("dark")
  );
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle keyboard shortcut to toggle menu
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Escape to close
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleLogout = () => {
    logout();
    setIsOpen(false);
    navigate("/login");
  };

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (newMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  const getUserInitials = () => {
    if (!user) return "?";
    if (user.display_name) {
      const parts = user.display_name.split(" ");
      return parts.length > 1
        ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
        : parts[0].substring(0, 2).toUpperCase();
    }
    return user.email?.substring(0, 2).toUpperCase() || "?";
  };

  return (
    <div ref={dropdownRef} className={`relative ${className || ""}`}>
      {/* User Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-dark-elevated transition-colors"
        aria-label="User menu"
        aria-expanded={isOpen}
      >
        {user?.avatar_url ? (
          <img
            src={user.avatar_url}
            alt=""
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <div className="h-8 w-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
              {getUserInitials()}
            </span>
          </div>
        )}
        <span className="hidden text-sm font-medium text-gray-700 dark:text-gray-300 sm:block max-w-[120px] truncate">
          {user?.display_name || user?.email}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-gray-400 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-dark-card rounded-xl shadow-card border border-gray-200 dark:border-dark-border overflow-hidden z-50">
          {/* User Info Header */}
          <div className="px-4 py-3 border-b border-gray-200 dark:border-dark-border">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {user?.display_name || "User"}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {user?.email}
            </p>
          </div>

          {/* Menu Items */}
          <div className="py-1">
            <Link
              to="/settings/profile"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-elevated"
            >
              <User className="h-4 w-4 text-gray-400" />
              Your Profile
            </Link>

            <Link
              to="/settings"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-elevated"
            >
              <Settings className="h-4 w-4 text-gray-400" />
              Settings
            </Link>

            <Link
              to="/settings/notifications"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-elevated"
            >
              <Bell className="h-4 w-4 text-gray-400" />
              Notification Preferences
            </Link>

            <button
              onClick={() => {
                // Show keyboard shortcuts modal (placeholder)
                setIsOpen(false);
                // Could trigger a keyboard shortcuts modal here
              }}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-elevated"
            >
              <Keyboard className="h-4 w-4 text-gray-400" />
              Keyboard Shortcuts
              <kbd className="ml-auto px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-dark-elevated rounded">
                ?
              </kbd>
            </button>
          </div>

          {/* Theme Toggle */}
          <div className="py-1 border-t border-gray-200 dark:border-dark-border">
            <button
              onClick={toggleDarkMode}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-elevated"
            >
              {isDarkMode ? (
                <>
                  <Sun className="h-4 w-4 text-gray-400" />
                  Light Mode
                </>
              ) : (
                <>
                  <Moon className="h-4 w-4 text-gray-400" />
                  Dark Mode
                </>
              )}
            </button>
          </div>

          {/* Help & Logout */}
          <div className="py-1 border-t border-gray-200 dark:border-dark-border">
            <Link
              to="/help"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-elevated"
            >
              <HelpCircle className="h-4 w-4 text-gray-400" />
              Help & Support
            </Link>

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
