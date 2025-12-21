/**
 * HoverCard - A reusable hover-triggered popover component
 *
 * Features:
 * - Configurable open/close delays to prevent accidental triggers
 * - Placement options (top, bottom, left, right)
 * - Smooth fade+scale animation
 * - Dark mode support
 * - Accessible with aria attributes
 * - Close delay allows mouse movement to card content
 */

import { Fragment, useState, useRef, useCallback, type ReactNode } from "react";
import { Popover, Transition } from "@headlessui/react";
import { clsx } from "clsx";

export interface HoverCardProps {
  /** The element that triggers the hover card */
  trigger: ReactNode;
  /** Content to display in the hover card */
  children: ReactNode;
  /** Placement of the hover card relative to trigger */
  placement?: "top" | "bottom" | "left" | "right";
  /** Delay in ms before showing the card (prevents accidental triggers) */
  openDelay?: number;
  /** Delay in ms before hiding the card (allows mouse movement to content) */
  closeDelay?: number;
  /** Maximum width of the hover card in pixels */
  maxWidth?: number;
  /** Disable the hover card */
  disabled?: boolean;
  /** Additional class names for the trigger wrapper */
  triggerClassName?: string;
  /** Additional class names for the panel */
  panelClassName?: string;
}

// Placement-specific positioning classes
const PLACEMENT_CLASSES = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
};

// Animation origin classes for each placement
const ORIGIN_CLASSES = {
  top: "origin-bottom",
  bottom: "origin-top",
  left: "origin-right",
  right: "origin-left",
};

export function HoverCard({
  trigger,
  children,
  placement = "bottom",
  openDelay = 300,
  closeDelay = 150,
  maxWidth = 320,
  disabled = false,
  triggerClassName,
  panelClassName,
}: HoverCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const openTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearTimeouts = useCallback(() => {
    if (openTimeoutRef.current) {
      clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (disabled) return;
    clearTimeouts();
    openTimeoutRef.current = setTimeout(() => {
      setIsOpen(true);
    }, openDelay);
  }, [disabled, clearTimeouts, openDelay]);

  const handleMouseLeave = useCallback(() => {
    clearTimeouts();
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, closeDelay);
  }, [clearTimeouts, closeDelay]);

  // Handle keyboard accessibility
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    },
    [isOpen]
  );

  if (disabled) {
    return <>{trigger}</>;
  }

  return (
    <Popover className="relative inline-block">
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onKeyDown={handleKeyDown}
        className={clsx("inline-block", triggerClassName)}
      >
        {/* Trigger element - not using Popover.Button since we control open state */}
        <div className="inline-block cursor-default" tabIndex={0} role="button" aria-haspopup="true" aria-expanded={isOpen}>
          {trigger}
        </div>

        <Transition
          as={Fragment}
          show={isOpen}
          enter="transition ease-out duration-150"
          enterFrom="opacity-0 scale-95"
          enterTo="opacity-100 scale-100"
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100 scale-100"
          leaveTo="opacity-0 scale-95"
        >
          <Popover.Panel
            static
            className={clsx(
              "absolute z-50",
              PLACEMENT_CLASSES[placement],
              ORIGIN_CLASSES[placement],
              "bg-white dark:bg-dark-card",
              "rounded-xl shadow-card",
              "border border-gray-200 dark:border-dark-border",
              "ring-1 ring-black ring-opacity-5",
              panelClassName
            )}
            style={{ maxWidth: `${maxWidth}px` }}
            role="tooltip"
          >
            {/* Arrow indicator */}
            <div
              className={clsx(
                "absolute w-2 h-2 bg-white dark:bg-dark-card border-gray-200 dark:border-dark-border transform rotate-45",
                placement === "top" && "bottom-[-5px] left-1/2 -translate-x-1/2 border-b border-r",
                placement === "bottom" && "top-[-5px] left-1/2 -translate-x-1/2 border-t border-l",
                placement === "left" && "right-[-5px] top-1/2 -translate-y-1/2 border-r border-t",
                placement === "right" && "left-[-5px] top-1/2 -translate-y-1/2 border-l border-b"
              )}
            />
            {children}
          </Popover.Panel>
        </Transition>
      </div>
    </Popover>
  );
}

/**
 * HoverCardHeader - Consistent header styling for hover cards
 */
export function HoverCardHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "px-3 py-2 border-b border-gray-200 dark:border-dark-border",
        "text-sm font-medium text-gray-900 dark:text-gray-100",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * HoverCardContent - Main content area with consistent padding
 */
export function HoverCardContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("px-3 py-2", className)}>
      {children}
    </div>
  );
}

/**
 * HoverCardFooter - Footer with link styling
 */
export function HoverCardFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "px-3 py-2 border-t border-gray-200 dark:border-dark-border",
        "text-xs",
        className
      )}
    >
      {children}
    </div>
  );
}

export default HoverCard;
