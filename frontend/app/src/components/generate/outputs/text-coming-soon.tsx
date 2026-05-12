import { Sparkles } from 'lucide-react'

export function TextComingSoon() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 h-full text-center px-8">
      <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
        <Sparkles className="w-6 h-6 text-white/30" />
      </div>
      <p className="text-white/60 font-medium">Text generation coming in Sprint 3</p>
      <p className="text-white/30 text-sm">
        Streaming token-by-token output via HuggingFace Router is on the roadmap.
      </p>
    </div>
  )
}
