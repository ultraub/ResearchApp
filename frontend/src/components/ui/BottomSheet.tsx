/**
 * BottomSheet - A mobile-native slide-up panel component
 *
 * Features:
 * - Slides up from bottom with smooth animation
 * - Drag handle for swipe-to-dismiss
 * - Multiple snap points (50%, 90% height)
 * - Backdrop blur overlay
 * - Accessible with focus trap and escape to close
 * - Dark mode support
 */

import { Fragment, useRef, useEffect, type ReactNode } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { motion, useMotionValue, useTransform, PanInfo } from "framer-motion";
import { clsx } from "clsx";
import { XMarkIcon } from "@heroicons/react/24/outline";

export interface BottomSheetProps {
  /** Whether the bottom sheet is open */
  isOpen: boolean;
  /** Callback when the sheet should close */
  onClose: () => void;
  /** Title displayed in the header */
  title?: string;
  /** Content to display in the sheet */
  children: ReactNode;
  /** Snap points as percentage of viewport height (default: [0.5, 0.9]) */
  snapPoints?: number[];
  /** Initial snap point index (default: 0) */
  initialSnap?: number;
  /** Whether to show the close button (default: true) */
  showCloseButton?: boolean;
  /** Additional class names for the panel */
  className?: string;
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  snapPoints = [0.5, 0.9],
  initialSnap = 0,
  showCloseButton = true,
  className,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const y = useMotionValue(0);

  // Calculate initial height based on snap point
  const initialHeight = snapPoints[initialSnap] * 100;

  // Transform y motion to opacity for backdrop
  const backdropOpacity = useTransform(y, [0, 200], [1, 0]);

  // Handle drag end - either snap to a point or close
  const handleDragEnd = (_: never, info: PanInfo) => {
    const velocity = info.velocity.y;
    const offset = info.offset.y;

    // If dragged down fast or far enough, close the sheet
    if (velocity > 500 || offset > 150) {
      onClose();
    } else {
      // Otherwise snap back
      y.set(0);
    }
  };

  // Reset y position when opened
  useEffect(() => {
    if (isOpen) {
      y.set(0);
    }
  }, [isOpen, y]);

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog onClose={onClose} className="relative z-50">
        {/* Backdrop */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <motion.div
            style={{ opacity: backdropOpacity }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
          />
        </Transition.Child>

        {/* Sheet container */}
        <div className="fixed inset-0 flex items-end justify-center">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="translate-y-full"
            enterTo="translate-y-0"
            leave="ease-in duration-200"
            leaveFrom="translate-y-0"
            leaveTo="translate-y-full"
          >
            <Dialog.Panel
              as={motion.div}
              ref={sheetRef}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.5 }}
              onDragEnd={handleDragEnd}
              style={{ y }}
              className={clsx(
                "w-full rounded-t-2xl",
                "bg-white dark:bg-dark-card",
                "shadow-elevated",
                "flex flex-col",
                "touch-none", // Prevent scroll interference
                className
              )}
              // Set max height based on largest snap point
              initial={{ height: `${initialHeight}vh` }}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing">
                <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
              </div>

              {/* Header */}
              {(title || showCloseButton) && (
                <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-200 dark:border-dark-border">
                  {title && (
                    <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                      {title}
                    </Dialog.Title>
                  )}
                  {showCloseButton && (
                    <button
                      onClick={onClose}
                      className={clsx(
                        "p-2 -mr-2 rounded-lg",
                        "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200",
                        "hover:bg-gray-100 dark:hover:bg-dark-elevated",
                        "transition-colors",
                        !title && "ml-auto"
                      )}
                      aria-label="Close"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  )}
                </div>
              )}

              {/* Content */}
              <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
                {children}
              </div>

              {/* Safe area padding for notched phones */}
              <div className="h-safe-area-inset-bottom" />
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}

/**
 * BottomSheetHeader - Consistent header styling for bottom sheet sections
 */
export function BottomSheetHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "pb-3 mb-3 border-b border-gray-200 dark:border-dark-border",
        "text-sm font-medium text-gray-500 dark:text-gray-400",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * BottomSheetItem - List item for bottom sheet menus
 */
export function BottomSheetItem({
  icon: Icon,
  label,
  description,
  onClick,
  active,
  destructive,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  description?: string;
  onClick?: () => void;
  active?: boolean;
  destructive?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "w-full flex items-center gap-3 p-3 rounded-xl",
        "text-left transition-colors",
        "min-h-[44px]", // Touch target minimum
        active
          ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
          : destructive
            ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
            : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-dark-elevated",
        className
      )}
    >
      {Icon && (
        <span
          className={clsx(
            "flex h-10 w-10 items-center justify-center rounded-lg",
            active
              ? "bg-primary-500 text-white"
              : destructive
                ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                : "bg-gray-100 text-gray-500 dark:bg-dark-elevated dark:text-gray-400"
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{label}</div>
        {description && (
          <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
            {description}
          </div>
        )}
      </div>
    </button>
  );
}

export default BottomSheet;
