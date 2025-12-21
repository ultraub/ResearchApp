/**
 * Onboarding flow for new users with step-by-step setup.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import {
  Folder,
  FileText,
  CheckSquare2,
  Lightbulb,
  BookOpen,
  Users,
  Sparkles,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { usersApi } from '../../services/users';

interface StepConfig {
  id: number;
  title: string;
  description: string;
  options?: { value: string; label: string; icon: string }[];
  templates?: { id: string; name: string; description: string; icon: string }[];
}

const steps: StepConfig[] = [
  {
    id: 1,
    title: 'Welcome to Pasteur',
    description:
      "Let's get you set up in just a few minutes. We'll personalize your experience based on your research needs.",
  },
  {
    id: 2,
    title: 'Tell us about yourself',
    description: 'Help us personalize your experience with some basic information.',
  },
  {
    id: 3,
    title: 'What type of research do you do?',
    description: 'This helps us suggest relevant templates and features.',
    options: [
      { value: 'clinical', label: 'Clinical Research', icon: '🏥' },
      { value: 'basic', label: 'Basic Science', icon: '🔬' },
      { value: 'data', label: 'Data Analysis', icon: '📊' },
      { value: 'literature', label: 'Literature Review', icon: '📚' },
      { value: 'other', label: 'Other', icon: '🔎' },
    ],
  },
  {
    id: 4,
    title: 'Choose a template to start',
    description: 'Pick a template that matches your current project, or start from scratch.',
    templates: [
      {
        id: 'clinical',
        name: 'Clinical Study',
        description: 'IRB documents, protocols, data collection',
        icon: '🏥',
      },
      {
        id: 'data',
        name: 'Data Analysis',
        description: 'Analysis pipeline, visualization, reports',
        icon: '📊',
      },
      {
        id: 'literature',
        name: 'Literature Review',
        description: 'Paper collection, synthesis, writing',
        icon: '📚',
      },
      {
        id: 'blank',
        name: 'Blank Project',
        description: 'Start fresh with an empty project',
        icon: '📝',
      },
    ],
  },
  {
    id: 5,
    title: 'Name your first project',
    description: 'Give your project a meaningful name. You can always change this later.',
  },
  {
    id: 6,
    title: "You're all set!",
    description: "Here's what you can do with Pasteur.",
  },
];

const features = [
  {
    icon: Folder,
    title: 'Organize Projects',
    description: 'Keep all your research materials in one place',
    color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
  },
  {
    icon: CheckSquare2,
    title: 'Track Tasks',
    description: 'Never miss a deadline with task management',
    color: 'text-green-600 bg-green-100 dark:bg-green-900/30',
  },
  {
    icon: FileText,
    title: 'Write Documents',
    description: 'Collaborative writing with version control',
    color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30',
  },
  {
    icon: Lightbulb,
    title: 'Capture Ideas',
    description: 'Quick capture for research insights',
    color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30',
  },
  {
    icon: BookOpen,
    title: 'Manage Papers',
    description: 'Import from DOI, organize citations',
    color: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30',
  },
  {
    icon: Users,
    title: 'Collaborate',
    description: 'Share and work together with your team',
    color: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-900/30',
  },
];

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    title: '',
    department: '',
    researchInterests: '',
    researchType: '',
    selectedTemplate: '',
    projectName: '',
  });
  const navigate = useNavigate();
  const { user, fetchUser } = useAuthStore();

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: () =>
      usersApi.updateProfile({
        title: formData.title || undefined,
        department: formData.department || undefined,
        research_interests: formData.researchInterests
          .split(',')
          .map((i) => i.trim())
          .filter((i) => i.length > 0),
      }),
  });

  // Update onboarding step mutation
  const updateOnboardingMutation = useMutation({
    mutationFn: (data: { step: number; completed?: boolean }) =>
      usersApi.updateOnboardingStep(data),
    onSuccess: () => {
      fetchUser();
    },
  });

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && canProceed()) {
        handleNext();
      } else if (e.key === 'Escape') {
        handleSkip();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, formData]);

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 3:
        return !!formData.researchType;
      case 5:
        return !!formData.projectName.trim();
      default:
        return true;
    }
  };

  const handleNext = async () => {
    if (currentStep === 2) {
      // Save profile information
      if (formData.title || formData.department || formData.researchInterests) {
        await updateProfileMutation.mutateAsync();
      }
      await updateOnboardingMutation.mutateAsync({ step: 2 });
      setCurrentStep(3);
    } else if (currentStep === 5 && formData.projectName) {
      // Complete onboarding
      await updateOnboardingMutation.mutateAsync({ step: 5, completed: true });
      setCurrentStep(6);
    } else if (currentStep < 6) {
      setCurrentStep(currentStep + 1);
    } else {
      navigate('/dashboard');
    }
  };

  const handleSkip = async () => {
    await updateOnboardingMutation.mutateAsync({ step: currentStep, completed: true });
    navigate('/dashboard');
  };

  const step = steps[currentStep - 1];
  const isLoading = updateProfileMutation.isPending || updateOnboardingMutation.isPending;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-dark-base dark:to-gray-800">
      <div className="mx-auto max-w-2xl px-4 py-12">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
            <span>Step {currentStep} of 6</span>
            <button onClick={handleSkip} className="text-primary-600 hover:text-primary-700 dark:text-primary-400">
              Skip setup
            </button>
          </div>
          <div className="mt-2 h-2 rounded-full bg-gray-200 dark:bg-dark-elevated">
            <motion.div
              className="h-2 rounded-full bg-gradient-to-r from-primary-500 to-primary-600 shadow-soft"
              initial={{ width: 0 }}
              animate={{ width: `${(currentStep / 6) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="rounded-2xl bg-white p-8 shadow-card dark:bg-dark-card"
          >
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{step.title}</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">{step.description}</p>

            <div className="mt-8">
              {/* Step 1: Welcome */}
              {currentStep === 1 && (
                <div className="text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', delay: 0.2 }}
                    className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-primary-100 to-primary-200 shadow-soft dark:from-primary-900/30 dark:to-primary-800/30"
                  >
                    <span className="text-5xl">👋</span>
                  </motion.div>
                  <p className="text-lg text-gray-600 dark:text-gray-400">
                    Hi {user?.display_name?.split(' ')[0] || 'there'}! Ready to streamline your
                    research workflow?
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    {['Organize', 'Collaborate', 'Discover'].map((word, i) => (
                      <motion.span
                        key={word}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 + i * 0.1 }}
                        className="rounded-full bg-primary-100 px-3 py-1 text-sm font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-400"
                      >
                        {word}
                      </motion.span>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 2: Profile info */}
              {currentStep === 2 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Your title/role
                    </label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="e.g., PhD Candidate, Research Associate"
                      className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 shadow-soft focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Department/Institution
                    </label>
                    <input
                      type="text"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      placeholder="e.g., Department of Biomedical Engineering"
                      className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 shadow-soft focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Research interests
                    </label>
                    <input
                      type="text"
                      value={formData.researchInterests}
                      onChange={(e) =>
                        setFormData({ ...formData, researchInterests: e.target.value })
                      }
                      placeholder="e.g., Machine Learning, Genomics (comma separated)"
                      className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 shadow-soft focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white"
                    />
                    <p className="mt-1 text-xs text-gray-500">Separate multiple interests with commas</p>
                  </div>
                </div>
              )}

              {/* Step 3: Research type */}
              {currentStep === 3 && step.options && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {step.options.map((option) => (
                    <motion.button
                      key={option.value}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setFormData({ ...formData, researchType: option.value })}
                      className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left shadow-soft transition-colors ${
                        formData.researchType === option.value
                          ? 'border-primary-600 bg-gradient-to-br from-primary-50 to-white dark:from-primary-900/20 dark:to-dark-card'
                          : 'border-gray-200 hover:border-gray-300 dark:border-dark-border dark:hover:border-gray-500'
                      }`}
                    >
                      <span className="text-2xl">{option.icon}</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {option.label}
                      </span>
                    </motion.button>
                  ))}
                </div>
              )}

              {/* Step 4: Template selection */}
              {currentStep === 4 && step.templates && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {step.templates.map((template) => (
                    <motion.button
                      key={template.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setFormData({ ...formData, selectedTemplate: template.id })}
                      className={`rounded-xl border-2 p-4 text-left shadow-soft transition-colors ${
                        formData.selectedTemplate === template.id
                          ? 'border-primary-600 bg-gradient-to-br from-primary-50 to-white dark:from-primary-900/20 dark:to-dark-card'
                          : 'border-gray-200 hover:border-gray-300 dark:border-dark-border dark:hover:border-gray-500'
                      }`}
                    >
                      <span className="text-2xl">{template.icon}</span>
                      <h3 className="mt-2 font-medium text-gray-900 dark:text-white">
                        {template.name}
                      </h3>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {template.description}
                      </p>
                    </motion.button>
                  ))}
                </div>
              )}

              {/* Step 5: Project name */}
              {currentStep === 5 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Project name
                  </label>
                  <input
                    type="text"
                    value={formData.projectName}
                    onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                    placeholder="e.g., COVID-19 Treatment Analysis"
                    className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-lg shadow-soft focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white"
                    autoFocus
                  />
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    This will be your first project. You can create more projects later.
                  </p>
                </div>
              )}

              {/* Step 6: Complete with feature tour */}
              {currentStep === 6 && (
                <div>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', delay: 0.1 }}
                    className="mb-8 flex justify-center"
                  >
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-green-600">
                      <Sparkles className="h-10 w-10 text-white" />
                    </div>
                  </motion.div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {features.map((feature, index) => (
                      <motion.div
                        key={feature.title}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 + index * 0.1 }}
                        className="flex items-start gap-3 rounded-xl border border-gray-200 p-3 shadow-soft dark:border-dark-border"
                      >
                        <div className={`rounded-lg p-2 ${feature.color}`}>
                          <feature.icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {feature.title}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {feature.description}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {formData.projectName && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.8 }}
                      className="mt-6 rounded-xl bg-gradient-to-br from-primary-50 to-white p-4 shadow-soft dark:from-primary-900/20 dark:to-dark-card"
                    >
                      <p className="text-center text-primary-700 dark:text-primary-400">
                        Your project <strong>"{formData.projectName}"</strong> is ready to go!
                      </p>
                    </motion.div>
                  )}
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="mt-8 flex items-center justify-between">
              <div>
                {currentStep > 1 && currentStep < 6 && (
                  <button
                    onClick={() => setCurrentStep(currentStep - 1)}
                    className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-dark-elevated"
                  >
                    ← Back
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                {currentStep < 6 && (
                  <span className="text-xs text-gray-400">Press Enter to continue</span>
                )}
                <button
                  onClick={handleNext}
                  disabled={isLoading || !canProceed()}
                  className="rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 px-6 py-2 text-sm font-medium text-white shadow-soft hover:from-primary-600 hover:to-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Saving...</span>
                    </div>
                  ) : currentStep === 6 ? (
                    'Go to Dashboard →'
                  ) : (
                    'Continue'
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Keyboard hints */}
        <div className="mt-4 flex justify-center gap-4 text-xs text-gray-400">
          <span>
            <kbd className="rounded bg-gray-200 px-1.5 py-0.5 shadow-soft dark:bg-dark-elevated">Enter</kbd> to
            continue
          </span>
          <span>
            <kbd className="rounded bg-gray-200 px-1.5 py-0.5 shadow-soft dark:bg-dark-elevated">Esc</kbd> to skip
          </span>
        </div>
      </div>
    </div>
  );
}
