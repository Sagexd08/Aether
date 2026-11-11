import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Slider } from '@/components/ui/Slider';
import { Badge } from '@/components/ui/Badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { InputGroup } from '@/components/ui/InputGroup';
import { Lightbox } from '@/components/ui/Lightbox';
import { useToast } from '@/components/ui/Toast';
import { useJobPolling } from '@/hooks/useJobPolling';
import { GenerationProgress } from '@/components/GenerationProgress';
import { RecentGenerations } from '@/components/RecentGenerations';
import { api, type HistoryItem, type Style } from '@/lib/api';
import {
  Sparkles,
  Loader2,
  Download,
  Trash2,
  Wand2,
  Image as ImageIcon,
  X,
  Copy,
  Check,
  Zap,
} from 'lucide-react';

export default function Home() {
  const { activeJob, startPolling, cancelJob } = useJobPolling({
    onComplete: (job) => {
      if (job.result) {
        setCurrentImage(job.result.image_url);
        setCurrentRequestId(job.result.request_id);
        setRefreshTrigger(prev => prev + 1);
        toast.toast({ message: 'Image generated successfully!', type: 'success' });
      }
      setIsGenerating(false);
    },
    onError: (error) => {
      toast.toast({ message: error, type: 'error' });
      setIsGenerating(false);
    },
  });

  const [positivePrompt, setPositivePrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [model, setModel] = useState('sd15');
  const [steps, setSteps] = useState(20);
  const [cfgScale, setCfgScale] = useState(3);
  const [seed, setSeed] = useState<number | undefined>();
  const [width, setWidth] = useState(512);
  const [height, setHeight] = useState(512);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [styles, setStyles] = useState<Style[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<string>('');
  const [activeTab, setActiveTab] = useState('prompt');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const toast = useToast();

  useEffect(() => {
    loadStyles();
  }, []);

  const loadStyles = async () => {
    try {
      const data = await api.getStyles();
      setStyles(data.styles);
    } catch (error) {
      console.error('Failed to load styles:', error);
    }
  };

  const loadHistory = async () => {
    try {
      const data = await api.getHistory(20);
      setHistory(data.results);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  };

  const handleEnhance = async () => {
    if (!positivePrompt.trim()) {
      toast.toast({ message: 'Please enter a prompt first', type: 'warning' });
      return;
    }
    try {
      const enhanced = await api.enhancePrompt(positivePrompt, selectedStyle);
      setPositivePrompt(enhanced.positive);
      setNegativePrompt(enhanced.negative);
      toast.toast({ message: 'Prompt enhanced successfully!', type: 'success' });
    } catch (error: any) {
      toast.toast({
        message: error.response?.data?.error || 'Failed to enhance prompt',
        type: 'error',
      });
    }
  };

  const handleGenerate = async () => {
    if (!positivePrompt.trim()) {
      toast.toast({ message: 'Please enter a prompt', type: 'warning' });
      return;
    }

    setIsGenerating(true);
    setCurrentImage(null);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/jobs/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          positive_prompt: positivePrompt,
          negative_prompt: negativePrompt || undefined,
          model,
          steps,
          cfg_scale: cfgScale,
          seed,
          width,
          height,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to create job');
      }

      const { job_id } = await response.json();
      startPolling(job_id);
    } catch (error: any) {
      setIsGenerating(false);
      toast.toast({
        message: error.message || 'Failed to start generation',
        type: 'error',
      });
    }
  };

  const handleDelete = async (requestId: string) => {
    try {
      await api.deletePrompt(requestId);
      if (currentRequestId === requestId) {
        setCurrentImage(null);
        setCurrentRequestId(null);
      }
      loadHistory();
      toast.toast({ message: 'Image deleted', type: 'success' });
    } catch (error: any) {
      toast.toast({ message: 'Failed to delete image', type: 'error' });
    }
  };

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const copyPrompt = () => {
    navigator.clipboard.writeText(positivePrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.toast({ message: 'Prompt copied to clipboard', type: 'success' });
  };

  const modelInfo = {
    sd15: { name: 'Stable Diffusion 1.5' },
    sd14: { name: 'Stable Diffusion 1.4' },
    sdxl: { name: 'Stable Diffusion XL' },
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-4 py-8"
      >
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-gray-900 dark:text-white">
          AI Image Generation
        </h1>
        <p className="text-muted-foreground text-lg">
          Create stunning images with advanced AI models
        </p>
      </motion.div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <GlassCard hover className="p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3 mb-6">
                <TabsTrigger value="prompt">Prompt</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
                <TabsTrigger value="advanced">Advanced</TabsTrigger>
              </TabsList>

              <TabsContent value="prompt" className="space-y-4">
                <InputGroup
                  label="Positive Prompt"
                  hint="Describe what you want to generate"
                  rightIcon={
                    <div className="flex gap-2">
                      <button
                        onClick={copyPrompt}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title="Copy prompt"
                      >
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => setPositivePrompt('')}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title="Clear"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  }
                >
                  <Textarea
                    value={positivePrompt}
                    onChange={(e) => setPositivePrompt(e.target.value)}
                    placeholder="A beautiful landscape with mountains and lakes, sunset, highly detailed, 8k..."
                    rows={4}
                    className="resize-none"
                  />
                </InputGroup>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleEnhance}
                    disabled={!positivePrompt.trim()}
                    className="flex-1"
                  >
                    <Wand2 className="w-4 h-4 mr-2" />
                    Enhance Prompt
                  </Button>
                </div>

                <InputGroup label="Negative Prompt (optional)" hint="What to avoid in the image">
                  <Textarea
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    placeholder="blurry, low quality, distorted..."
                    rows={2}
                    className="resize-none"
                  />
                </InputGroup>

                {styles.length > 0 && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">Style Preset</label>
                    <div className="flex flex-wrap gap-2">
                      {styles.map((style) => (
                        <Badge
                          key={style.id}
                          variant={selectedStyle === style.id ? 'default' : 'outline'}
                          className="cursor-pointer"
                          onClick={() => {
                            setSelectedStyle(selectedStyle === style.id ? '' : style.id);
                            if (selectedStyle !== style.id) {
                              handleEnhance();
                            }
                          }}
                        >
                          {style.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="settings" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <InputGroup label="Model">
                    <Select value={model} onChange={(e) => setModel(e.target.value)}>
                      <option value="sd15">SD 1.5</option>
                      <option value="sd14">SD 1.4</option>
                      <option value="sdxl">SDXL</option>
                    </Select>
                  </InputGroup>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <InputGroup label="Dimensions">
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={width}
                        onChange={(e) => setWidth(parseInt(e.target.value, 10))}
                        min={256}
                        max={1024}
                        step={64}
                        className="flex-1"
                      />
                      <span className="self-center text-muted-foreground">×</span>
                      <Input
                        type="number"
                        value={height}
                        onChange={(e) => setHeight(parseInt(e.target.value, 10))}
                        min={256}
                        max={1024}
                        step={64}
                        className="flex-1"
                      />
                    </div>
                  </InputGroup>
                </div>
              </TabsContent>

              <TabsContent value="advanced" className="space-y-4">
                <Slider
                  label="Steps"
                  value={steps}
                  onChange={(e) => setSteps(parseInt(e.target.value, 10))}
                  min={10}
                  max={50}
                  step={1}
                />

                <Slider
                  label="CFG Scale"
                  value={cfgScale}
                  onChange={(e) => setCfgScale(parseFloat(e.target.value))}
                  min={1}
                  max={6}
                  step={0.5}
                />

                <InputGroup
                  label="Seed (optional)"
                  hint="Leave empty for random generation"
                >
                  <Input
                    type="number"
                    value={seed || ''}
                    onChange={(e) =>
                      setSeed(e.target.value ? parseInt(e.target.value, 10) : undefined)
                    }
                    placeholder="Random"
                  />
                </InputGroup>
              </TabsContent>
            </Tabs>

            {isGenerating && activeJob && (
              <div className="mt-6">
                <GenerationProgress
                  status={activeJob.status}
                  progress={activeJob.progress}
                  message={activeJob.progress_message}
                  onCancel={() => activeJob.job_id && cancelJob(activeJob.job_id)}
                />
              </div>
            )}

            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !positivePrompt.trim()}
              className="w-full mt-6"
              size="lg"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  Generate Image
                </>
              )}
            </Button>
          </GlassCard>

          <AnimatePresence>
            {currentImage && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
              >
                <GlassCard hover className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Badge variant="success">
                        {modelInfo[model as keyof typeof modelInfo]?.name}
                      </Badge>
                      <Badge variant="outline">{width} × {height}</Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openLightbox(0)}
                      >
                        <ImageIcon className="w-4 h-4 mr-2" />
                        View
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(currentImage, '_blank')}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </Button>
                      {currentRequestId && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(currentRequestId)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div
                    className="relative rounded-lg overflow-hidden border border-border cursor-pointer group"
                    onClick={() => openLightbox(0)}
                  >
                    <img
                      src={currentImage}
                      alt="Generated"
                      className="w-full h-auto transition-transform group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <Badge variant="secondary" className="opacity-0 group-hover:opacity-100">
                        Click to view fullscreen
                      </Badge>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="space-y-6">
          <GlassCard className="p-6">
            <RecentGenerations
              onRegenerate={(gen) => {
                setPositivePrompt(gen.positive_prompt);
                setNegativePrompt(gen.negative_prompt || '');
                setModel(gen.model);
                setSteps(gen.steps);
                setCfgScale(gen.cfg_scale);
                setSeed(gen.seed);
                setWidth(gen.width);
                setHeight(gen.height);
              }}
              refreshTrigger={refreshTrigger}
            />
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Quick Presets
            </h3>
            <div className="space-y-2">
              {[
                { name: 'Portrait', prompt: 'portrait photography, professional, sharp focus, bokeh' },
                { name: 'Landscape', prompt: 'landscape photography, mountains, sunset, highly detailed, 8k' },
                { name: 'Fantasy', prompt: 'fantasy art, epic, dramatic lighting, highly detailed' },
                { name: 'Cyberpunk', prompt: 'cyberpunk, neon lights, futuristic, dark atmosphere' },
              ].map((preset) => (
                <Button
                  key={preset.name}
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => setPositivePrompt(preset.prompt)}
                >
                  {preset.name}
                </Button>
              ))}
            </div>
          </GlassCard>

          {history.length > 0 && (
            <GlassCard className="p-6">
              <h3 className="font-semibold text-lg mb-4">Recent History</h3>
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {history.slice(0, 10).map((item, idx) => (
                  <motion.div
                    key={item.request_id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="relative group cursor-pointer"
                    onClick={() => {
                      setCurrentImage(item.image_url);
                      setCurrentRequestId(item.request_id);
                      openLightbox(idx + (currentImage ? 1 : 0));
                    }}
                  >
                    <div className="relative rounded-lg overflow-hidden border border-border">
                      <img
                        src={item.image_url}
                        alt={item.positive_prompt}
                        className="w-full aspect-square object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="absolute bottom-2 left-2 right-2">
                          <p className="text-white text-xs line-clamp-2">{item.positive_prompt}</p>
                        </div>
                      </div>
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(item.request_id);
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </GlassCard>
          )}
        </div>
      </div>

      {lightboxOpen && (
        <Lightbox
          images={currentImage ? [currentImage, ...history.map((h) => h.image_url)] : history.map((h) => h.image_url)}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
}
