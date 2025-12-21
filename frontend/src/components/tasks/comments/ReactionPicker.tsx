import { Fragment } from "react";
import { Popover, Transition } from "@headlessui/react";
import { FaceSmileIcon } from "@heroicons/react/24/outline";

// Predefined emoji set for reactions
const REACTION_EMOJIS = [
  { emoji: "thumbs_up", label: "Thumbs up", display: "\u{1F44D}" },
  { emoji: "heart", label: "Heart", display: "\u{2764}\u{FE0F}" },
  { emoji: "smile", label: "Smile", display: "\u{1F604}" },
  { emoji: "tada", label: "Celebration", display: "\u{1F389}" },
  { emoji: "thinking", label: "Thinking", display: "\u{1F914}" },
  { emoji: "rocket", label: "Rocket", display: "\u{1F680}" },
  { emoji: "eyes", label: "Eyes", display: "\u{1F440}" },
  { emoji: "pray", label: "Thank you", display: "\u{1F64F}" },
];

// Map emoji key to display character
export const emojiToDisplay = (emoji: string): string => {
  const found = REACTION_EMOJIS.find((e) => e.emoji === emoji);
  return found?.display || emoji;
};

interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
  disabled?: boolean;
}

export default function ReactionPicker({ onSelect, disabled }: ReactionPickerProps) {
  return (
    <Popover className="relative">
      {({ close }) => (
        <>
          <Popover.Button
            disabled={disabled}
            className="p-1 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Add reaction"
          >
            <FaceSmileIcon className="h-4 w-4" />
          </Popover.Button>

          <Transition
            as={Fragment}
            enter="transition ease-out duration-100"
            enterFrom="transform opacity-0 scale-95"
            enterTo="transform opacity-100 scale-100"
            leave="transition ease-in duration-75"
            leaveFrom="transform opacity-100 scale-100"
            leaveTo="transform opacity-0 scale-95"
          >
            <Popover.Panel className="absolute z-10 mt-1 left-0 bg-white dark:bg-dark-card rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-2">
              <div className="grid grid-cols-4 gap-1">
                {REACTION_EMOJIS.map((reaction) => (
                  <button
                    key={reaction.emoji}
                    type="button"
                    onClick={() => {
                      onSelect(reaction.emoji);
                      close();
                    }}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-xl transition-colors"
                    title={reaction.label}
                  >
                    {reaction.display}
                  </button>
                ))}
              </div>
            </Popover.Panel>
          </Transition>
        </>
      )}
    </Popover>
  );
}
