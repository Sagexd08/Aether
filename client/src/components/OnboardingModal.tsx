import { getAccessToken } from '@/lib/accessToken';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Image, Wand2, Check, ArrowRight, User, Zap, Palette, Sprout, Rocket } from 'lucide-react';
import { Button } from './ui/Button';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ExperienceLevel = 'beginner' | 'intermediate' | 'power';
type CreationType = 'art' | 'product' | 'anime' | 'realism' | 'experiment';

export function OnboardingModal({ isOpen, onClose }: OnboardingModalProps) {
  
  const [step, setStep] = useState(1);
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>('beginner');
  const [creationType, setCreationType] = useState<CreationType>('art');
  const [preferences, setPreferences] = useState({
    defaultModel: 'sd15',
    resolution: '512x512',
  });

  if (!isOpen) return null;

  const totalSteps = 4;

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      completeOnboarding();
    }
  };

  const completeOnboarding = async () => {
    try {
      const token = getAccessToken();
      if (token) {
        await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/auth/preferences`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            experience_level: experienceLevel,
            default_model: preferences.defaultModel,
            preferred_resolution: preferences.resolution,
          }),
        });
      }
    } catch (error) {
      console.error('Failed to save preferences:', error);
    }
    onClose();
  };

  const creationTypes = [
    { id: 'art', label: 'Art & Illustration', icon: Palette, description: 'Creative artworks, illustrations, concept art' },
    { id: 'product', label: 'Product Photos', icon: Image, description: 'E-commerce, marketing, professional shots' },
    { id: 'anime', label: 'Anime & Manga', icon: Sparkles, description: 'Anime characters, manga panels, fan art' },
    { id: 'realism', label: 'Realistic Photos', icon: User, description: 'Portraits, landscapes, photorealistic images' },
    { id: 'experiment', label: 'Experiment', icon: Wand2, description: 'Abstract, surreal, experimental art' },
  ];

  const experienceLevels = [
    { id: 'beginner', label: 'Beginner', description: 'Just getting started with AI image generation' },
    { id: 'intermediate', label: 'Intermediate', description: 'Some experience, know the basics' },
    { id: 'power', label: 'Power User', description: 'Experienced with prompts and parameters' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="h-1 bg-gray-100 dark:bg-gray-800">
          <motion.div
            className="h-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${(step / totalSteps) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        <div className="p-8">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="text-center"
              >
                <div className="w-20 h-20 mx-auto mb-6 bg-primary/10 rounded-full flex items-center justify-center">
                  <Sparkles className="w-10 h-10 text-primary" />
                </div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
                  Welcome to Aether AI!
                </h2>
                <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
                  Let's personalize your experience in just a few steps.
                </p>
                <Button size="lg" onClick={handleNext} className="w-full max-w-xs">
                  Get Started <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  What do you want to create?
                </h2>
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                  This helps us suggest the right models and settings.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                  {creationTypes.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => setCreationType(type.id as CreationType)}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        creationType === type.id
                          ? 'border-primary bg-primary/5'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <type.icon className={`w-6 h-6 mb-2 ${creationType === type.id ? 'text-primary' : 'text-gray-400'}`} />
                      <p className="font-semibold text-gray-900 dark:text-white">{type.label}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{type.description}</p>
                    </button>
                  ))}
                </div>
                <Button size="lg" onClick={handleNext} className="w-full">
                  Continue <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  What's your experience level?
                </h2>
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                  We'll adjust the interface to match your skill level.
                </p>
                <div className="space-y-3 mb-6">
                  {experienceLevels.map((level) => (
                    <button
                      key={level.id}
                      onClick={() => setExperienceLevel(level.id as ExperienceLevel)}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-center gap-4 ${
                        experienceLevel === level.id
                          ? 'border-primary bg-primary/5'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        experienceLevel === level.id ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-800'
                      }`}>
                        {level.id === 'beginner' && <Sprout className="w-5 h-5" aria-hidden="true" />}
                        {level.id === 'intermediate' && <Zap className="w-5 h-5" aria-hidden="true" />}
                        {level.id === 'power' && <Rocket className="w-5 h-5" aria-hidden="true" />}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{level.label}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{level.description}</p>
                      </div>
                      {experienceLevel === level.id && (
                        <Check className="w-5 h-5 text-primary ml-auto" />
                      )}
                    </button>
                  ))}
                </div>
                <Button size="lg" onClick={handleNext} className="w-full">
                  Continue <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Default Preferences
                </h2>
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                  You can always change these later in settings.
                </p>

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Preferred Model
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {['sd15', 'sdxl', 'sd14'].map((model) => (
                        <button
                          key={model}
                          onClick={() => setPreferences(p => ({ ...p, defaultModel: model }))}
                          className={`p-3 rounded-lg border text-sm font-medium transition-all ${
                            preferences.defaultModel === model
                              ? 'border-primary bg-primary/5 text-primary'
                              : 'border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          {model.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Default Resolution
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {['512x512', '768x768', '1024x1024'].map((res) => (
                        <button
                          key={res}
                          onClick={() => setPreferences(p => ({ ...p, resolution: res }))}
                          className={`p-3 rounded-lg border text-sm font-medium transition-all ${
                            preferences.resolution === res
                              ? 'border-primary bg-primary/5 text-primary'
                              : 'border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          {res}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <Button size="lg" onClick={handleNext} className="w-full">
                  <Zap className="w-5 h-5 mr-2" />
                  Start Creating
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="px-8 py-4 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between">
          <div className="flex gap-1">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i + 1 === step ? 'bg-primary' : i + 1 < step ? 'bg-primary/50' : 'bg-gray-300'
                }`}
              />
            ))}
          </div>
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Skip for now
          </button>
        </div>
      </motion.div>
    </div>
  );
}
