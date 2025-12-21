/**
 * MobileMoreMenu - Bottom sheet menu for secondary navigation
 *
 * Features:
 * - Shows secondary navigation items not in bottom tab bar
 * - Uses BottomSheet for native mobile feel
 * - Navigation closes menu automatically
 * - Settings and help at bottom
 */

import { useNavigate, useLocation } from "react-router-dom";
import {
  LightBulbIcon,
  PencilSquareIcon,
  ClipboardDocumentCheckIcon,
  UserGroupIcon,
  Cog6ToothIcon,
  QuestionMarkCircleIcon,
  BellIcon,
} from "@heroicons/react/24/outline";
import { BottomSheet, BottomSheetItem, BottomSheetHeader } from "../ui/BottomSheet";

interface MobileMoreMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

const navigationItems = [
  {
    name: "Ideas",
    href: "/ideas",
    icon: LightBulbIcon,
    description: "Quick capture and brainstorm",
  },
  {
    name: "Journal",
    href: "/journals",
    icon: PencilSquareIcon,
    description: "Daily notes and reflections",
  },
  {
    name: "Reviews",
    href: "/reviews",
    icon: ClipboardDocumentCheckIcon,
    description: "Document reviews and approvals",
  },
  {
    name: "Teams",
    href: "/teams",
    icon: UserGroupIcon,
    description: "Manage your teams",
  },
];

const utilityItems = [
  {
    name: "Notifications",
    href: "/notifications",
    icon: BellIcon,
  },
  {
    name: "Settings",
    href: "/settings",
    icon: Cog6ToothIcon,
  },
  {
    name: "Help & Support",
    href: "/help",
    icon: QuestionMarkCircleIcon,
  },
];

export function MobileMoreMenu({ isOpen, onClose }: MobileMoreMenuProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavigate = (href: string) => {
    navigate(href);
    onClose();
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="More"
      snapPoints={[0.6]}
      className="max-h-[85vh]"
    >
      {/* Main navigation items */}
      <div className="space-y-1">
        {navigationItems.map((item) => (
          <BottomSheetItem
            key={item.name}
            icon={item.icon}
            label={item.name}
            description={item.description}
            onClick={() => handleNavigate(item.href)}
            active={location.pathname.startsWith(item.href)}
          />
        ))}
      </div>

      {/* Divider */}
      <div className="my-4 border-t border-gray-200 dark:border-dark-border" />

      {/* Utility items */}
      <BottomSheetHeader>Settings & Support</BottomSheetHeader>
      <div className="space-y-1">
        {utilityItems.map((item) => (
          <BottomSheetItem
            key={item.name}
            icon={item.icon}
            label={item.name}
            onClick={() => handleNavigate(item.href)}
            active={location.pathname.startsWith(item.href)}
          />
        ))}
      </div>
    </BottomSheet>
  );
}

export default MobileMoreMenu;
