'use client'

import { useAuthStore } from '@/lib/store/auth'
import { WorkspaceShell } from '@/components/workspace/app-shell'
import { ControlsPanel } from '@/components/generate/controls-panel'
import { OutputPanel } from '@/components/generate/output-panel'
import { GenerationHistory } from '@/components/generate/generation-history'
import { useGenerationReconcile } from '@/lib/hooks/use-generation-reconcile'
import { useWorkspaceWebSocket } from '@/lib/hooks/use-websocket'
import { useState } from 'react'
import type { GenerationMode } from '@aether/types'

export default function GeneratePage() {
  const workspace = useAuthStore((s) => s.workspace)
  const workspaceId = workspace?.id ?? ''
  const [activeMode, setActiveMode] = useState<GenerationMode>('image')

  const { lastEvent } = useWorkspaceWebSocket(workspaceId)
  useGenerationReconcile(workspaceId, lastEvent)

  return (
    <WorkspaceShell title="Generate" subtitle="Create images, video, and audio with AI">
      <div className="flex flex-col h-full gap-6 p-6">
        {/* Studio: side-by-side */}
        <div className="grid grid-cols-[320px_1fr] gap-4 min-h-[480px]">
          {/* Left: controls */}
          <div className="bg-[#0c0f1a] border border-white/10 rounded-2xl p-5">
            <ControlsPanel workspaceId={workspaceId} />
          </div>

          {/* Right: output */}
          <div className="bg-[#0c0f1a] border border-white/10 rounded-2xl p-5">
            <OutputPanel mode={activeMode} />
          </div>
        </div>

        {/* Gallery: derived from generation state */}
        <div className="bg-[#0c0f1a] border border-white/10 rounded-2xl p-5">
          <h2 className="text-sm font-medium text-white/60 mb-4">Recent generations</h2>
          {workspaceId ? (
            <GenerationHistory workspaceId={workspaceId} />
          ) : (
            <p className="text-white/20 text-sm">Loading workspace…</p>
          )}
        </div>
      </div>
    </WorkspaceShell>
  )
}
