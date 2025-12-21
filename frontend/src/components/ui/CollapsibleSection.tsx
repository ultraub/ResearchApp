/**
 * CollapsibleSection - Mobile-native accordion section component
 *
 * Features:
 * - Expandable/collapsible sections with smooth animation
 * - Header with icon, title, count badge, and chevron
 * - Optional single-section mode (accordion behavior)
 * - Persist open state in localStorage (optional)
 * - Dark mode support
 * - Touch-friendly (44px minimum touch target)
 */

import { useState, useEffect, createContext, useContext, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import { ChevronDownIcon } from "@heroicons/react/24/outline";

// Context for accordion behavior (only one section open at a time)
interface AccordionContextValue {
  openSection: string | null;
  setOpenSection: (id: string | null) => void;
}

const AccordionContext = createContext<AccordionContextValue | null>(null);

export interface CollapsibleSectionProps {
  /** Unique identifier for this section */
  id?: string;
  /** Title displayed in the header */
  title: string;
  /** Icon component to display */
  icon?: React.ComponentType<{ className?: string }>;
  /** Count badge (e.g., number of items) */
  count?: number;
  /** Whether the section is open by default */
  defaultOpen?: boolean;
  /** Content to display when expanded */
  children: ReactNode;
  /** Callback when section is toggled */
  onToggle?: (isOpen: boolean) => void;
  /** Storage key for persisting state (optional) */
  storageKey?: string;
  /** Additional class names for the container */
  className?: string;
  /** Additional class names for the header */
  headerClassName?: string;
  /** Additional class names for the content */
  contentClassName?: string;
  /** Show warning indicator (e.g., for blockers) */
  warning?: boolean;
  /** Variant styling */
  variant?: "default" | "card" | "minimal";
}

export function CollapsibleSection({
  id,
  title,
  icon: Icon,
  count,
  defaultOpen = false,
  children,
  onToggle,
  storageKey,
  className,
  headerClassName,
  contentClassName,
  warning = false,
  variant = "default",
}: CollapsibleSectionProps) {
  const accordionContext = useContext(AccordionContext);
  const sectionId = id || title.toLowerCase().replace(/\s+/g, "-");

  // Determine if controlled by accordion context
  const isAccordion = accordionContext !== null;
  const isOpenFromAccordion = isAccordion && accordionContext.openSection === sectionId;

  // Local state for non-accordion mode
  const [localIsOpen, setLocalIsOpen] = useState(() => {
    if (storageKey) {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) {
        return stored === "true";
      }
    }
    return defaultOpen;
  });

  const isOpen = isAccordion ? isOpenFromAccordion : localIsOpen;

  // Persist state to localStorage
  useEffect(() => {
    if (storageKey && !isAccordion) {
      localStorage.setItem(storageKey, String(localIsOpen));
    }
  }, [localIsOpen, storageKey, isAccordion]);

  const handleToggle = () => {
    if (isAccordion) {
      accordionContext.setOpenSection(isOpen ? null : sectionId);
    } else {
      setLocalIsOpen(!localIsOpen);
    }
    onToggle?.(!isOpen);
  };

  const variantStyles = {
    default: {
      container: "border-b border-gray-200 dark:border-dark-border",
      header: "py-3",
      content: "pb-4",
    },
    card: {
      container: "rounded-xl bg-white dark:bg-dark-card shadow-card mb-2",
      header: "p-4",
      content: "px-4 pb-4",
    },
    minimal: {
      container: "",
      header: "py-2",
      content: "pb-2",
    },
  };

  const styles = variantStyles[variant];

  return (
    <div className={clsx(styles.container, className)}>
      {/* Header */}
      <button
        onClick={handleToggle}
        className={clsx(
          "w-full flex items-center gap-3",
          "min-h-[44px]", // Touch target minimum
          "text-left transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2",
          "rounded-lg -mx-2 px-2", // Slight padding for focus ring
          styles.header,
          headerClassName
        )}
        aria-expanded={isOpen}
        aria-controls={`section-content-${sectionId}`}
      >
        {/* Icon */}
        {Icon && (
          <span
            className={clsx(
              "flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0",
              isOpen
                ? "bg-primary-500 text-white"
                : "bg-gray-100 text-gray-500 dark:bg-dark-elevated dark:text-gray-400"
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}

        {/* Title and count */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span
            className={clsx(
              "font-medium truncate",
              isOpen
                ? "text-gray-900 dark:text-white"
                : "text-gray-700 dark:text-gray-300"
            )}
          >
            {title}
          </span>

          {/* Count badge */}
          {count !== undefined && (
            <span
              className={clsx(
                "inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium",
                warning
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  : "bg-gray-100 text-gray-600 dark:bg-dark-elevated dark:text-gray-400"
              )}
            >
              {count}
            </span>
          )}

          {/* Warning indicator */}
          {warning && count !== undefined && count > 0 && (
            <span className="flex h-2 w-2 rounded-full bg-amber-500" />
          )}
        </div>

        {/* Chevron */}
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex-shrink-0 text-gray-400"
        >
          <ChevronDownIcon className="h-5 w-5" />
        </motion.span>
      </button>

      {/* Content */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id={`section-content-${sectionId}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className={clsx(styles.content, contentClassName)}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * CollapsibleSectionGroup - Wrapper for accordion behavior (single section open)
 */
export function CollapsibleSectionGroup({
  children,
  defaultOpen,
  className,
}: {
  children: ReactNode;
  defaultOpen?: string;
  className?: string;
}) {
  const [openSection, setOpenSection] = useState<string | null>(defaultOpen || null);

  return (
    <AccordionContext.Provider value={{ openSection, setOpenSection }}>
      <div className={className}>{children}</div>
    </AccordionContext.Provider>
  );
}

export default CollapsibleSection;
