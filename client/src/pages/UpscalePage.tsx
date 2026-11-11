import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { InputGroup } from '@/components/ui/InputGroup';
import { Progress } from '@/components/ui/Progress';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { ImagePlus, Loader2, Download, Sparkles } from 'lucide-react';

export default function UpscalePage() {
  const [imageUrl, setImageUrl] = useState('');
  const [requestId, setRequestId] = useState('');
  const [scale, setScale] = useState(2);
  const [faceRestore, setFaceRestore] = useState(false);
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const toast = useToast();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setImageUrl(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpscale = async () => {
    if (!imageUrl && !requestId) {
      toast.toast({ message: 'Please provide an image URL, request ID, or upload a file', type: 'warning' });
      return;
    }

    setIsUpscaling(true);
    setResultImage(null);
    setProgress(0);

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return prev;
        }
        return prev + 15;
      });
    }, 300);

    try {
      const result = await api.upscale(imageUrl || '', scale, faceRestore);
      clearInterval(progressInterval);
      setProgress(100);
      setResultImage(result.image_url);
      toast.toast({ message: 'Image upscaled successfully!', type: 'success' });
    } catch (error: any) {
      clearInterval(progressInterval);
      setProgress(0);
      toast.toast({
        message: error.response?.data?.error || 'Failed to upscale image',
        type: 'error',
      });
    } finally {
      setIsUpscaling(false);
    }
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-4 py-8"
      >
        <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
          Image Upscaling
        </h1>
        <p className="text-muted-foreground text-lg">
          Enhance your images with AI-powered upscaling technology
        </p>
      </motion.div>

      <div className="grid lg:grid-cols-2 gap-6">
        <GlassCard hover className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <ImagePlus className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-bold">Upscale Image</h2>
          </div>

          <div className="space-y-4">
            <InputGroup
              label="Upload Image"
              hint="Upload an image file directly"
            >
              <div className="relative">
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="cursor-pointer"
                />
                {uploadedFile && (
                  <div className="mt-2 text-sm text-muted-foreground">
                    Selected: {uploadedFile.name}
                  </div>
                )}
              </div>
            </InputGroup>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <InputGroup
              label="Image URL"
              hint="Enter a URL to an image"
            >
              <Input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/image.png"
              />
            </InputGroup>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <InputGroup
              label="Request ID"
              hint="Use a previous generation's request ID"
            >
              <Input
                value={requestId}
                onChange={(e) => setRequestId(e.target.value)}
                placeholder="UUID of previous generation"
              />
            </InputGroup>

            <div className="grid grid-cols-2 gap-4">
              <InputGroup label="Scale">
                <Select
                  value={scale.toString()}
                  onChange={(e) => setScale(parseInt(e.target.value, 10))}
                >
                  <option value="2">2× Upscale</option>
                  <option value="4">4× Upscale</option>
                </Select>
              </InputGroup>

              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={faceRestore}
                    onChange={(e) => setFaceRestore(e.target.checked)}
                    className="w-4 h-4 rounded border-border"
                  />
                  <span className="text-sm font-medium">Face Restoration</span>
                </label>
              </div>
            </div>

            {isUpscaling && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Upscaling...</span>
                  <span className="font-medium">{progress}%</span>
                </div>
                <Progress value={progress} />
              </div>
            )}

            <Button
              onClick={handleUpscale}
              disabled={isUpscaling || (!imageUrl && !requestId && !uploadedFile)}
              className="w-full"
              size="lg"
            >
              {isUpscaling ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Upscaling...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  Upscale Image
                </>
              )}
            </Button>
          </div>
        </GlassCard>

        <div>
          <AnimatePresence>
            {resultImage && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
              >
                <GlassCard hover className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-bold">Upscaled Image</h2>
                    <Badge variant="success">{scale}× Scale</Badge>
                  </div>
                  <div className="relative rounded-lg overflow-hidden border border-border mb-4">
                    <img
                      src={resultImage}
                      alt="Upscaled"
                      className="w-full h-auto"
                    />
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => window.open(resultImage, '_blank')}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download Upscaled Image
                  </Button>
                </GlassCard>
              </motion.div>
            )}
          </AnimatePresence>

          {!resultImage && (
            <GlassCard className="p-6">
              <div className="text-center text-muted-foreground py-12">
                <ImagePlus className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">No upscaled image yet</p>
                <p className="text-sm">Upload an image or provide a URL to get started</p>
              </div>
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  );
}
