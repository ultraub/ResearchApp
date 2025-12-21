/**
 * InviteCodeGenerator - Generate invite codes with role and expiry options
 */

import { Fragment, useState } from "react";
import { Dialog, Transition, Listbox } from "@headlessui/react";
import {
  XMarkIcon,
  LinkIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  ChevronUpDownIcon,
} from "@heroicons/react/24/outline";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import { teamsService } from "@/services/teams";
import { organizationsService } from "@/services/organizations";
import type { InviteCodeCreate, TeamMemberRole, OrganizationMemberRole } from "@/types";

type InviteTarget = {
  type: "team" | "organization";
  id: string;
  name: string;
};

interface InviteCodeGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  target: InviteTarget;
}

type TeamRole = { value: TeamMemberRole; label: string; description: string };
type OrgRole = { value: OrganizationMemberRole; label: string; description: string };

const TEAM_ROLE_OPTIONS: TeamRole[] = [
  { value: "member", label: "Member", description: "Access to team projects" },
  { value: "lead", label: "Lead", description: "Can manage members and settings" },
];

const ORG_ROLE_OPTIONS: OrgRole[] = [
  { value: "member", label: "Member", description: "Basic organization access" },
  { value: "admin", label: "Admin", description: "Full organization control" },
];

const EXPIRY_OPTIONS = [
  { value: null, label: "Never expires" },
  { value: 1, label: "1 day" },
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
];

const MAX_USES_OPTIONS = [
  { value: null, label: "Unlimited uses" },
  { value: 1, label: "1 use" },
  { value: 5, label: "5 uses" },
  { value: 10, label: "10 uses" },
  { value: 25, label: "25 uses" },
];

export function InviteCodeGenerator({ isOpen, onClose, target }: InviteCodeGeneratorProps) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<string>("member");
  const [expiresInDays, setExpiresInDays] = useState<number | null>(7);
  const [maxUses, setMaxUses] = useState<number | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const roleOptions = target.type === "team" ? TEAM_ROLE_OPTIONS : ORG_ROLE_OPTIONS;

  // Create invite mutation
  const createMutation = useMutation({
    mutationFn: (data: InviteCodeCreate) => {
      if (target.type === "team") {
        return teamsService.createInvite(target.id, data);
      } else {
        return organizationsService.createInvite(target.id, data);
      }
    },
    onSuccess: (invite) => {
      setGeneratedCode(invite.code);
      if (target.type === "team") {
        queryClient.invalidateQueries({ queryKey: ["team-invites", target.id] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["org-invites", target.id] });
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create invite code");
    },
  });

  const handleGenerate = () => {
    createMutation.mutate({
      role,
      // Backend expects hours, convert from days
      expires_in_hours: expiresInDays ? expiresInDays * 24 : null,
      max_uses: maxUses,
    });
  };

  const getInviteUrl = (code: string) => {
    return `${window.location.origin}/join/${code}`;
  };

  const handleCopy = async () => {
    if (!generatedCode) return;
    try {
      await navigator.clipboard.writeText(getInviteUrl(generatedCode));
      setCopied(true);
      toast.success("Invite link copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleClose = () => {
    setRole("member");
    setExpiresInDays(7);
    setMaxUses(null);
    setGeneratedCode(null);
    setCopied(false);
    onClose();
  };

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
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
          <div className="fixed inset-0 bg-black/30" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md rounded-xl bg-white shadow-card dark:bg-dark-card">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-dark-border">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/30">
                      <LinkIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                    </div>
                    <div>
                      <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                        Create Invite Link
                      </Dialog.Title>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{target.name}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleClose}
                    className="rounded p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-elevated"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                {/* Content */}
                <div className="p-6">
                  {!generatedCode ? (
                    <div className="space-y-4">
                      {/* Role selector */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Role
                        </label>
                        <Listbox value={role} onChange={setRole}>
                          <div className="relative mt-1">
                            <Listbox.Button className="relative w-full cursor-pointer rounded-lg border border-gray-300 bg-white py-2.5 pl-3 pr-10 text-left text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated">
                              <span>
                                {roleOptions.find((r) => r.value === role)?.label}
                              </span>
                              <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
                              </span>
                            </Listbox.Button>
                            <Transition
                              as={Fragment}
                              leave="transition ease-in duration-100"
                              leaveFrom="opacity-100"
                              leaveTo="opacity-0"
                            >
                              <Listbox.Options className="absolute z-10 mt-1 w-full overflow-auto rounded-lg bg-white py-1 shadow-card ring-1 ring-black/5 dark:ring-white/10 dark:bg-dark-elevated">
                                {roleOptions.map((option) => (
                                  <Listbox.Option
                                    key={option.value}
                                    value={option.value}
                                    className={({ active }) =>
                                      clsx(
                                        "cursor-pointer px-3 py-2",
                                        active && "bg-gray-100 dark:bg-dark-base"
                                      )
                                    }
                                  >
                                    {({ selected }) => (
                                      <div className="flex items-center justify-between">
                                        <div>
                                          <span
                                            className={clsx("text-sm", selected && "font-medium")}
                                          >
                                            {option.label}
                                          </span>
                                          <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {option.description}
                                          </p>
                                        </div>
                                        {selected && (
                                          <CheckIcon className="h-4 w-4 text-primary-600" />
                                        )}
                                      </div>
                                    )}
                                  </Listbox.Option>
                                ))}
                              </Listbox.Options>
                            </Transition>
                          </div>
                        </Listbox>
                      </div>

                      {/* Expiry selector */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Expires after
                        </label>
                        <Listbox value={expiresInDays} onChange={setExpiresInDays}>
                          <div className="relative mt-1">
                            <Listbox.Button className="relative w-full cursor-pointer rounded-lg border border-gray-300 bg-white py-2.5 pl-3 pr-10 text-left text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated">
                              <span>
                                {EXPIRY_OPTIONS.find((e) => e.value === expiresInDays)?.label}
                              </span>
                              <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
                              </span>
                            </Listbox.Button>
                            <Transition
                              as={Fragment}
                              leave="transition ease-in duration-100"
                              leaveFrom="opacity-100"
                              leaveTo="opacity-0"
                            >
                              <Listbox.Options className="absolute z-10 mt-1 w-full overflow-auto rounded-lg bg-white py-1 shadow-card ring-1 ring-black/5 dark:ring-white/10 dark:bg-dark-elevated">
                                {EXPIRY_OPTIONS.map((option) => (
                                  <Listbox.Option
                                    key={option.value ?? "never"}
                                    value={option.value}
                                    className={({ active }) =>
                                      clsx(
                                        "cursor-pointer px-3 py-2 text-sm",
                                        active && "bg-gray-100 dark:bg-dark-base"
                                      )
                                    }
                                  >
                                    {({ selected }) => (
                                      <div className="flex items-center justify-between">
                                        <span className={clsx(selected && "font-medium")}>
                                          {option.label}
                                        </span>
                                        {selected && (
                                          <CheckIcon className="h-4 w-4 text-primary-600" />
                                        )}
                                      </div>
                                    )}
                                  </Listbox.Option>
                                ))}
                              </Listbox.Options>
                            </Transition>
                          </div>
                        </Listbox>
                      </div>

                      {/* Max uses selector */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Maximum uses
                        </label>
                        <Listbox value={maxUses} onChange={setMaxUses}>
                          <div className="relative mt-1">
                            <Listbox.Button className="relative w-full cursor-pointer rounded-lg border border-gray-300 bg-white py-2.5 pl-3 pr-10 text-left text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated">
                              <span>
                                {MAX_USES_OPTIONS.find((m) => m.value === maxUses)?.label}
                              </span>
                              <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
                              </span>
                            </Listbox.Button>
                            <Transition
                              as={Fragment}
                              leave="transition ease-in duration-100"
                              leaveFrom="opacity-100"
                              leaveTo="opacity-0"
                            >
                              <Listbox.Options className="absolute z-10 mt-1 w-full overflow-auto rounded-lg bg-white py-1 shadow-card ring-1 ring-black/5 dark:ring-white/10 dark:bg-dark-elevated">
                                {MAX_USES_OPTIONS.map((option) => (
                                  <Listbox.Option
                                    key={option.value ?? "unlimited"}
                                    value={option.value}
                                    className={({ active }) =>
                                      clsx(
                                        "cursor-pointer px-3 py-2 text-sm",
                                        active && "bg-gray-100 dark:bg-dark-base"
                                      )
                                    }
                                  >
                                    {({ selected }) => (
                                      <div className="flex items-center justify-between">
                                        <span className={clsx(selected && "font-medium")}>
                                          {option.label}
                                        </span>
                                        {selected && (
                                          <CheckIcon className="h-4 w-4 text-primary-600" />
                                        )}
                                      </div>
                                    )}
                                  </Listbox.Option>
                                ))}
                              </Listbox.Options>
                            </Transition>
                          </div>
                        </Listbox>
                      </div>

                      {/* Generate button */}
                      <button
                        onClick={handleGenerate}
                        disabled={createMutation.isPending}
                        className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                      >
                        {createMutation.isPending ? "Generating..." : "Generate Invite Link"}
                      </button>
                    </div>
                  ) : (
                    /* Generated code display */
                    <div className="space-y-4">
                      <div className="rounded-lg bg-gray-50 p-4 dark:bg-dark-elevated">
                        <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                          Your invite link is ready:
                        </p>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            readOnly
                            value={getInviteUrl(generatedCode)}
                            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none dark:border-dark-border dark:bg-dark-elevated dark:text-white"
                          />
                          <button
                            onClick={handleCopy}
                            className={clsx(
                              "rounded-lg p-2.5",
                              copied
                                ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-dark-base dark:text-gray-300 dark:hover:bg-dark-elevated"
                            )}
                          >
                            {copied ? (
                              <CheckIcon className="h-5 w-5" />
                            ) : (
                              <ClipboardDocumentIcon className="h-5 w-5" />
                            )}
                          </button>
                        </div>
                      </div>

                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Share this link with people you want to join as{" "}
                        <strong>{roleOptions.find((r) => r.value === role)?.label}</strong>.
                        {expiresInDays && ` Expires in ${expiresInDays} day${expiresInDays > 1 ? "s" : ""}.`}
                        {maxUses && ` Limited to ${maxUses} use${maxUses > 1 ? "s" : ""}.`}
                      </p>

                      <div className="flex gap-3">
                        <button
                          onClick={() => setGeneratedCode(null)}
                          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-dark-border dark:text-gray-300 dark:hover:bg-dark-elevated"
                        >
                          Create Another
                        </button>
                        <button
                          onClick={handleClose}
                          className="flex-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
