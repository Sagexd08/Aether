'use client'

import { useGenerationStore } from '@/lib/store/generation'
import { ImageOutput } from './outputs/image-output'
import { VideoOutput } from './outputs/video-output'
import { AudioOutput } from './outputs/audio-output'
import { TextComingSoon } from './outputs/text-coming-soon'

interface OutputPanelProps {
  mode: string
}

export function OutputPanel({ mode }: OutputPanelProps) {
  const { activeJobs, focusedJobId } = useGenerationStore()
  const focusedJob = focusedJobId ? activeJobs[focusedJobId] : undefined

  if (mode === 'text') return <TextComingSoon />

  if (!focusedJob) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-white/20 text-sm">Output will appear here after generation</p>
      </div>
    )
  }

  if (focusedJob.mode === 'image') return <ImageOutput job={focusedJob} />
  if (focusedJob.mode === 'video') return <VideoOutput job={focusedJob} />
  if (focusedJob.mode === 'audio') return <AudioOutput job={focusedJob} />

  return <TextComingSoon />
}
