import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowRight, BookOpen, CheckCircle2, ChevronLeft, ChevronRight,
  Clock3, Eye, EyeOff, Focus, Grid2X2, Highlighter, Laptop, Lightbulb,
  Maximize2, Minimize2, Moon, MousePointer2, PenLine, Play,
  Quote, RotateCcw, Sparkles, Sun, Target, TimerReset, Users, X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAsyncData } from '../lib/useAsyncData'
import { ErrorState, Spinner } from '../components/ui'
import type { Lesson, LessonScreenshot, LessonSection } from '../lib/types'

type SlideKind = 'hero' | 'content' | 'cards' | 'timeline' | 'comparison' | 'checklist' |
  'screenshot' | 'quote' | 'process' | 'activity' | 'coach' | 'summary'

interface SlideItem { title: string; text: string }
interface Slide {
  title: string
  body: string
  kind: SlideKind
  eyebrow: string
  items?: SlideItem[]
  screenshot?: LessonScreenshot
}

const labels: Record<SlideKind, string> = {
  hero: 'Lesson overview', content: 'Teaching', cards: 'Key ideas', timeline: 'Step by step',
  comparison: 'Compare', checklist: 'Checklist', screenshot: 'Walkthrough', quote: 'Key insight',
  process: 'Process', activity: 'Live activity', coach: 'Coach only', summary: 'Takeaways',
}

function cleanText(value = '') {
  return value.replace(/\\n/g, '\n').replace(/\r/g, '').trim()
}

function splitPoints(value = '') {
  return cleanText(value)
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((part) => part.replace(/^[-•\d.)\s]+/, '').trim())
    .filter(Boolean)
}

function makeItems(body: string): SlideItem[] {
  const points = splitPoints(body)
  return points.slice(0, 6).map((text, index) => {
    const colon = text.indexOf(':')
    if (colon > 0 && colon < 55) return { title: text.slice(0, colon).trim(), text: text.slice(colon + 1).trim() }
    return { title: `Point ${index + 1}`, text }
  })
}

function chooseKind(title: string, body: string, fallback: SlideKind = 'content'): SlideKind {
  const source = `${title} ${body}`.toLowerCase()
  const points = splitPoints(body)
  if (/summary|takeaway|remember|recap/.test(source)) return 'summary'
  if (/checklist|before you|make sure|quality check/.test(source)) return 'checklist'
  if (/step|process|workflow|first|then|finally/.test(source) && points.length >= 3) return 'timeline'
  if (/versus| vs |difference|compare/.test(source)) return 'comparison'
  if (/quote|principle|mindset/.test(source) && body.length < 240) return 'quote'
  if (/activity|exercise|practice|in pairs|your turn/.test(source)) return 'activity'
  if (points.length >= 3 && points.length <= 6) return 'cards'
  return fallback
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0')
  const rest = (seconds % 60).toString().padStart(2, '0')
  return `${minutes}:${rest}`
}

export default function PresentationPage() {
  const { lessonId } = useParams<{ lessonId: string }>()
  const navigate = useNavigate()
  const stageRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const [showCoachNotes, setShowCoachNotes] = useState(false)
  const [showOverview, setShowOverview] = useState(false)
  const [showPresenter, setShowPresenter] = useState(false)
  const [dark, setDark] = useState(false)
  const [laser, setLaser] = useState(false)
  const [draw, setDraw] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [laserPoint, setLaserPoint] = useState({ x: -100, y: -100 })
  const [paths, setPaths] = useState<string[]>([])
  const [activePath, setActivePath] = useState('')

  const state = useAsyncData<{
    lesson: Lesson
    sections: LessonSection[]
    screenshots: LessonScreenshot[]
    courseTitle: string
  }>(async () => {
    const { data: lesson, error } = await supabase.from('lessons').select('*').eq('id', lessonId).maybeSingle()
    if (error) throw error
    if (!lesson) throw new Error('That lesson could not be loaded.')
    const [sections, course, screenshots] = await Promise.all([
      supabase.from('lesson_sections').select('*').eq('lesson_id', lesson.id).order('sort_order'),
      supabase.from('courses').select('title').eq('id', lesson.course_id).maybeSingle(),
      supabase.from('lesson_screenshots').select('*').eq('lesson_id', lesson.id).eq('is_archived', false).order('sort_order'),
    ])
    if (sections.error) throw sections.error
    if (course.error) throw course.error
    if (screenshots.error) throw screenshots.error
    return {
      lesson: lesson as Lesson,
      sections: (sections.data ?? []) as LessonSection[],
      screenshots: (screenshots.data ?? []) as LessonScreenshot[],
      courseTitle: (course.data?.title as string) ?? '',
    }
  }, [lessonId])

  const slides = useMemo<Slide[]>(() => {
    const data = state.data
    if (!data) return []
    const built: Slide[] = [{
      kind: 'hero', eyebrow: data.courseTitle || 'VA Success Academy', title: data.lesson.title,
      body: cleanText(data.lesson.objective || data.lesson.description),
    }]

    const presentation = cleanText(data.lesson.presentation_content)
    if (presentation) {
      const rawBlocks = presentation.split(/\n(?=(?:Slide\s*)?\d+\s*:)|\n{2,}/i).filter(Boolean)
      for (const raw of rawBlocks) {
        const block = raw.replace(/^Slide\s*\d+\s*:\s*/i, '').trim()
        const [head, ...rest] = block.split(':')
        const hasHead = rest.length > 0 && head.length < 80
        const title = hasHead ? head.trim() : 'Key point'
        const body = hasHead ? rest.join(':').trim() : block
        const kind = chooseKind(title, body)
        built.push({ kind, eyebrow: labels[kind], title, body, items: makeItems(body) })
      }
    } else if (data.lesson.student_content) {
      const body = cleanText(data.lesson.student_content)
      const kind = chooseKind('Lesson', body)
      built.push({ kind, eyebrow: labels[kind], title: 'Core lesson', body, items: makeItems(body) })
    }

    for (const section of data.sections) {
      if (section.coach_only && !showCoachNotes) continue
      const body = cleanText(section.body)
      const fallback: SlideKind = section.coach_only ? 'coach'
        : section.section_type === 'example' ? 'comparison'
        : section.section_type === 'activity' ? 'activity' : 'content'
      const kind = section.coach_only ? 'coach' : chooseKind(section.title, body, fallback)
      built.push({ kind, eyebrow: labels[kind], title: section.title, body, items: makeItems(body) })
    }

    for (const screenshot of data.screenshots) {
      built.push({
        kind: 'screenshot', eyebrow: `Step ${screenshot.step_number}`, title: screenshot.title,
        body: cleanText(screenshot.instruction), screenshot,
      })
    }

    if (data.lesson.examples) {
      const body = cleanText(data.lesson.examples)
      built.push({ kind: 'comparison', eyebrow: 'Worked example', title: 'See it in practice', body, items: makeItems(body) })
    }
    if (data.lesson.live_activity) {
      built.push({ kind: 'activity', eyebrow: 'Live activity', title: 'Your turn', body: cleanText(data.lesson.live_activity), items: makeItems(data.lesson.live_activity) })
    }
    if (showCoachNotes && data.lesson.coach_notes) {
      built.push({ kind: 'coach', eyebrow: 'Presenter notes', title: 'Coach guidance', body: cleanText(data.lesson.coach_notes), items: makeItems(data.lesson.coach_notes) })
    }

    const takeaways = built.filter((s) => !['hero', 'coach', 'screenshot'].includes(s.kind)).slice(0, 4)
    if (takeaways.length > 1) {
      built.push({
        kind: 'summary', eyebrow: 'Lesson complete', title: 'What to remember', body: '',
        items: takeaways.map((s) => ({ title: s.title, text: s.body.split(/[.!?]/)[0] || s.body })),
      })
    }
    return built
  }, [state.data, showCoachNotes])

  const total = slides.length
  const safeIndex = Math.min(index, Math.max(total - 1, 0))
  const slide = slides[safeIndex]
  const progress = total ? ((safeIndex + 1) / total) * 100 : 0
  const estimatedRemaining = Math.max(0, Math.ceil(((total - safeIndex - 1) * 50) / 60))

  const go = useCallback((delta: number) => {
    setIndex((current) => Math.min(Math.max(current + delta, 0), Math.max(total - 1, 0)))
    setPaths([])
  }, [total])

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) await stageRef.current?.requestFullscreen()
    else await document.exitFullscreen()
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((v) => v + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const change = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', change)
    return () => document.removeEventListener('fullscreenchange', change)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (showOverview && event.key !== 'Escape') return
      if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'PageDown') { event.preventDefault(); go(1) }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); go(-1) }
      if (event.key === 'Escape') {
        if (showOverview) setShowOverview(false)
        else if (document.fullscreenElement) void document.exitFullscreen()
        else navigate(-1)
      }
      if (event.key.toLowerCase() === 'n') setShowPresenter((v) => !v)
      if (event.key.toLowerCase() === 'f') void toggleFullscreen()
      if (event.key.toLowerCase() === 'l') { setLaser((v) => !v); setDraw(false) }
      if (event.key.toLowerCase() === 'd') { setDraw((v) => !v); setLaser(false) }
      if (event.key.toLowerCase() === 'o') setShowOverview((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, navigate, showOverview, toggleFullscreen])

  const pointerPosition = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = pointerPosition(event)
    if (laser) setLaserPoint(point)
    if (draw && activePath) setActivePath((path) => `${path} L ${point.x} ${point.y}`)
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draw) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = pointerPosition(event)
    setActivePath(`M ${point.x} ${point.y}`)
  }

  const onPointerUp = () => {
    if (draw && activePath) setPaths((all) => [...all, activePath])
    setActivePath('')
  }

  if (state.loading) return <div className="flex min-h-screen items-center justify-center bg-[#f7f5ff]"><Spinner label="Preparing presentation" /></div>
  if (state.error) return <div className="p-8"><ErrorState message={state.error} onRetry={state.reload} /></div>

  return (
    <div ref={stageRef} className={`presentation-stage ${dark ? 'presentation-dark' : ''}`}>
      <div className="presentation-bg" aria-hidden><span /><span /><span /></div>

      <header className="presentation-topbar">
        <div className="presentation-brand">
          <div className="presentation-logo">VA</div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">VA Success Academy</p>
            <p className="truncate text-xs opacity-60">{state.data!.courseTitle}</p>
          </div>
        </div>
        <div className="presentation-top-actions">
          <span className="presentation-timer"><Clock3 className="h-4 w-4" />{formatTime(elapsed)}</span>
          <button title="Slide overview (O)" onClick={() => setShowOverview(true)}><Grid2X2 /></button>
          <button title="Presenter view (N)" onClick={() => setShowPresenter((v) => !v)}><Eye /></button>
          <button title="Toggle theme" onClick={() => setDark((v) => !v)}>{dark ? <Sun /> : <Moon />}</button>
          <button title="Fullscreen (F)" onClick={() => void toggleFullscreen()}>{isFullscreen ? <Minimize2 /> : <Maximize2 />}</button>
          <button title="Exit presentation" onClick={() => navigate(-1)}><X /></button>
        </div>
      </header>

      <main
        className={`presentation-canvas ${laser ? 'is-laser' : ''} ${draw ? 'is-drawing' : ''}`}
        onPointerMove={onPointerMove} onPointerDown={onPointerDown} onPointerUp={onPointerUp}
        onPointerLeave={() => laser && setLaserPoint({ x: -100, y: -100 })}
      >
        {slide ? <SlideRenderer slide={slide} number={safeIndex + 1} total={total} /> : (
          <div className="presentation-empty"><BookOpen /><h1>No presentation content yet</h1></div>
        )}
        {laser && <span className="presentation-laser" style={{ transform: `translate(${laserPoint.x}px, ${laserPoint.y}px)` }} />}
        {(draw || paths.length > 0) && (
          <svg className="presentation-drawing-layer" width="100%" height="100%">
            {[...paths, activePath].filter(Boolean).map((path, i) => <path key={i} d={path} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />)}
          </svg>
        )}
      </main>

      <div className="presentation-toolbox">
        <button className={laser ? 'active' : ''} onClick={() => { setLaser((v) => !v); setDraw(false) }} title="Laser pointer (L)"><MousePointer2 /></button>
        <button className={draw ? 'active' : ''} onClick={() => { setDraw((v) => !v); setLaser(false) }} title="Draw (D)"><PenLine /></button>
        <button onClick={() => setPaths([])} disabled={!paths.length} title="Clear drawing"><RotateCcw /></button>
      </div>

      <footer className="presentation-footer">
        <button className="presentation-nav" onClick={() => go(-1)} disabled={safeIndex === 0}><ChevronLeft />Previous</button>
        <div className="presentation-progress-wrap">
          <div className="presentation-meta">
            <span>Slide {total ? safeIndex + 1 : 0} of {total}</span>
            <span>{estimatedRemaining ? `~${estimatedRemaining} min remaining` : 'Final slide'}</span>
          </div>
          <div className="presentation-progress"><span style={{ width: `${progress}%` }} /></div>
        </div>
        <button className="presentation-nav primary" onClick={() => go(1)} disabled={safeIndex >= total - 1}>Next<ChevronRight /></button>
      </footer>

      {showPresenter && (
        <aside className="presenter-panel">
          <div className="flex items-center justify-between"><p className="font-bold">Presenter view</p><button onClick={() => setShowPresenter(false)}><X /></button></div>
          <div><p className="presenter-label">Current slide</p><p className="font-semibold">{slide?.title}</p></div>
          <div><p className="presenter-label">Coach notes</p><p>{state.data!.lesson.coach_notes || 'No coach notes added.'}</p></div>
          <div><p className="presenter-label">Next</p><p className="font-semibold">{slides[safeIndex + 1]?.title || 'End of presentation'}</p></div>
          <button className="presenter-notes-toggle" onClick={() => setShowCoachNotes((v) => !v)}>
            {showCoachNotes ? <EyeOff /> : <Eye />}{showCoachNotes ? 'Hide coach-only slides' : 'Include coach-only slides'}
          </button>
        </aside>
      )}

      {showOverview && (
        <div className="presentation-overview" role="dialog" aria-modal="true">
          <div className="presentation-overview-head"><div><p className="text-sm opacity-60">Slide overview</p><h2>{state.data!.lesson.title}</h2></div><button onClick={() => setShowOverview(false)}><X /></button></div>
          <div className="presentation-overview-grid">
            {slides.map((item, i) => (
              <button key={`${item.title}-${i}`} className={i === safeIndex ? 'current' : ''} onClick={() => { setIndex(i); setShowOverview(false) }}>
                <span>{i + 1}</span><p>{item.eyebrow}</p><h3>{item.title}</h3>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SlideRenderer({ slide, number, total }: { slide: Slide; number: number; total: number }) {
  if (slide.kind === 'hero') return (
    <section className="slide-shell slide-hero presentation-enter" key={`${number}-${slide.title}`}>
      <div className="slide-copy">
        <p className="slide-eyebrow"><Sparkles />{slide.eyebrow}</p>
        <h1>{slide.title}</h1>
        <p className="slide-lead">{slide.body}</p>
        <div className="hero-chips"><span><Users />Beginner friendly</span><span><Target />Practical skills</span><span><Play />Live teaching</span></div>
      </div>
      <div className="hero-visual" aria-hidden>
        <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
        <div className="hero-device"><div className="hero-device-top" /><div className="hero-device-screen"><Laptop /><div className="growth-bars"><i /><i /><i /><i /></div><ArrowRight /></div></div>
        <div className="hero-float float-one"><CheckCircle2 />Job-ready</div>
        <div className="hero-float float-two"><Lightbulb />Learn by doing</div>
      </div>
      <SlideCorner number={number} total={total} />
    </section>
  )

  if (slide.kind === 'cards' || slide.kind === 'summary') return (
    <section className="slide-shell slide-standard presentation-enter" key={`${number}-${slide.title}`}>
      <SlideHeading slide={slide} />
      <div className={`slide-card-grid ${slide.kind === 'summary' ? 'summary-grid' : ''}`}>
        {(slide.items ?? makeItems(slide.body)).slice(0, 4).map((item, i) => (
          <article className="slide-feature-card" key={`${item.title}-${i}`} style={{ animationDelay: `${i * 80}ms` }}>
            <div className="slide-feature-icon">{slide.kind === 'summary' ? <CheckCircle2 /> : [<Users />, <Focus />, <Target />, <Sparkles />][i % 4]}</div>
            <p className="slide-card-number">0{i + 1}</p><h3>{item.title}</h3><p>{item.text}</p>
          </article>
        ))}
      </div>
      <SlideCorner number={number} total={total} />
    </section>
  )

  if (slide.kind === 'timeline' || slide.kind === 'process' || slide.kind === 'checklist') return (
    <section className="slide-shell slide-standard presentation-enter" key={`${number}-${slide.title}`}>
      <SlideHeading slide={slide} />
      <div className={`slide-steps ${slide.kind}`}>
        {(slide.items ?? makeItems(slide.body)).map((item, i) => (
          <article key={`${item.title}-${i}`} className="slide-step" style={{ animationDelay: `${i * 70}ms` }}>
            <div className="slide-step-marker">{slide.kind === 'checklist' ? <CheckCircle2 /> : i + 1}</div>
            <div><h3>{item.title}</h3><p>{item.text}</p></div>
            {i < (slide.items?.length ?? 0) - 1 && slide.kind === 'process' && <ArrowRight className="step-arrow" />}
          </article>
        ))}
      </div>
      <SlideCorner number={number} total={total} />
    </section>
  )

  if (slide.kind === 'screenshot' && slide.screenshot) return (
    <section className="slide-shell slide-screenshot presentation-enter" key={`${number}-${slide.title}`}>
      <div className="screenshot-device">
        <div className="screenshot-camera" />
        <div className="screenshot-screen">
          {slide.screenshot.image_url ? <img src={slide.screenshot.image_url} alt={slide.screenshot.title} /> : <div className="screenshot-placeholder"><Laptop /><span>Add a screenshot in the lesson editor</span></div>}
        </div>
        <div className="screenshot-base" />
      </div>
      <div className="screenshot-instruction">
        <p className="slide-eyebrow"><Highlighter />{slide.eyebrow}</p><h1>{slide.title}</h1><p className="slide-lead">{slide.body}</p>
        {slide.screenshot.highlight_description && <div className="instruction-callout"><Focus /><div><strong>Where to look</strong><p>{slide.screenshot.highlight_description}</p></div></div>}
        {slide.screenshot.tip && <div className="instruction-tip"><Lightbulb /><div><strong>Pro tip</strong><p>{slide.screenshot.tip}</p></div></div>}
        {slide.screenshot.warning && <div className="instruction-warning"><Target /><div><strong>Watch out</strong><p>{slide.screenshot.warning}</p></div></div>}
      </div>
      <SlideCorner number={number} total={total} />
    </section>
  )

  if (slide.kind === 'activity' || slide.kind === 'coach' || slide.kind === 'quote') return (
    <section className={`slide-shell slide-focus slide-${slide.kind} presentation-enter`} key={`${number}-${slide.title}`}>
      <div className="focus-icon">{slide.kind === 'activity' ? <Users /> : slide.kind === 'coach' ? <Eye /> : <Quote />}</div>
      <p className="slide-eyebrow">{slide.eyebrow}</p><h1>{slide.title}</h1><p className="focus-body">{slide.body}</p>
      {slide.kind === 'activity' && <div className="activity-badge"><TimerReset />Set a timer and invite responses</div>}
      <SlideCorner number={number} total={total} />
    </section>
  )

  if (slide.kind === 'comparison') {
    const items = slide.items ?? makeItems(slide.body)
    return (
      <section className="slide-shell slide-standard presentation-enter" key={`${number}-${slide.title}`}>
        <SlideHeading slide={slide} />
        <div className="comparison-grid">
          <article><span className="comparison-label">Common approach</span><h3>{items[0]?.title || 'Before'}</h3><p>{items[0]?.text || slide.body}</p></article>
          <div className="comparison-vs">VS</div>
          <article className="preferred"><span className="comparison-label">Better approach</span><h3>{items[1]?.title || 'After'}</h3><p>{items[1]?.text || items.slice(1).map((i) => i.text).join(' ') || slide.body}</p></article>
        </div>
        <SlideCorner number={number} total={total} />
      </section>
    )
  }

  return (
    <section className="slide-shell slide-split presentation-enter" key={`${number}-${slide.title}`}>
      <div className="slide-copy"><SlideHeading slide={slide} /><p className="slide-lead">{slide.body}</p></div>
      <div className="split-visual"><div className="split-icon"><BookOpen /></div><div className="split-lines"><i /><i /><i /></div><div className="split-badge"><CheckCircle2 />Actionable</div></div>
      <SlideCorner number={number} total={total} />
    </section>
  )
}

function SlideHeading({ slide }: { slide: Slide }) {
  return <div className="slide-heading"><p className="slide-eyebrow"><Sparkles />{slide.eyebrow}</p><h1>{slide.title}</h1>{slide.body && slide.kind !== 'content' && <p>{splitPoints(slide.body)[0]}</p>}</div>
}

function SlideCorner({ number, total }: { number: number; total: number }) {
  return <div className="slide-corner"><span>{String(number).padStart(2, '0')}</span><i />{String(total).padStart(2, '0')}</div>
}
