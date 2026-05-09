import { WorkspaceShell } from '@/components/workspace/app-shell'

const cards = Array.from({ length: 8 }, (_, index) => index + 1)

export default function GalleryPage() {
  return (
    <WorkspaceShell
      title="Gallery"
      subtitle="A cinematic asset library for completed text, image, video, and audio generations with filtering and fast actions."
    >
      <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
        {cards.map((card) => (
          <div key={card} className="glass-panel mb-4 break-inside-avoid rounded-[28px] p-4">
            <div className="aspect-[4/5] rounded-[22px] bg-[linear-gradient(135deg,rgba(99,179,237,0.15),rgba(167,139,250,0.18),rgba(12,15,26,0.9))]" />
            <div className="mt-4 flex items-center justify-between">
              <div>
                <div className="text-sm text-white">Asset {card}</div>
                <div className="text-xs text-white/45">Image • Remixable</div>
              </div>
              <button className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">Preview</button>
            </div>
          </div>
        ))}
      </div>
    </WorkspaceShell>
  )
}
