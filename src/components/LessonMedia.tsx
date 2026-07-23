import { ExternalLink as ExternalLinkIcon, PlayCircle } from 'lucide-react'
import { Button, ExternalLink } from './ui'

function embedUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') return `https://www.youtube.com/embed/${parsed.pathname.slice(1)}`
    if (host.includes('youtube.com')) {
      const id = parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean).pop()
      return id ? `https://www.youtube.com/embed/${id}` : null
    }
    if (host.includes('vimeo.com')) {
      const id = parsed.pathname.split('/').filter(Boolean).pop()
      return id ? `https://player.vimeo.com/video/${id}` : null
    }
    if (host.includes('loom.com')) {
      const parts = parsed.pathname.split('/').filter(Boolean)
      const id = parts[parts.length - 1]
      return id ? `https://www.loom.com/embed/${id}` : null
    }
    if (host.includes('drive.google.com')) {
      const match = parsed.pathname.match(/\/file\/d\/([^/]+)/)
      return match ? `https://drive.google.com/file/d/${match[1]}/preview` : null
    }
  } catch {
    return null
  }
  return null
}

function isDirectVideo(url: string) {
  return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url)
}

export default function LessonMedia({
  url,
  title,
  compact = false,
}: {
  url: string
  title: string
  compact?: boolean
}) {
  const embedded = embedUrl(url)

  if (embedded) {
    return (
      <div className={`overflow-hidden rounded-2xl border border-canvas-line bg-black ${compact ? 'aspect-video' : 'aspect-video shadow-sm'}`}>
        <iframe
          src={embedded}
          title={title}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    )
  }

  if (isDirectVideo(url)) {
    return (
      <div className={`overflow-hidden rounded-2xl border border-canvas-line bg-black ${compact ? '' : 'shadow-sm'}`}>
        <video src={url} controls playsInline preload="metadata" className="aspect-video w-full object-contain">
          Your browser does not support embedded video.
        </video>
      </div>
    )
  }

  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-brand-300 bg-brand-50/60 p-6 text-center">
      <PlayCircle className="h-10 w-10 text-brand-600" aria-hidden />
      <p className="mt-3 font-semibold text-ink">Open lesson media</p>
      <p className="mt-1 max-w-md text-sm text-ink-muted">This provider cannot be embedded securely, so it will open in a new tab.</p>
      <ExternalLink href={url} className="mt-4">
        <Button><ExternalLinkIcon className="h-4 w-4" aria-hidden />Open video</Button>
      </ExternalLink>
    </div>
  )
}
