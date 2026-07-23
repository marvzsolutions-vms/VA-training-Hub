import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, Grid2X2, Maximize2, Minimize2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAsyncData } from '../lib/useAsyncData'
import { ErrorState, Spinner } from '../components/ui'
import TopicVisual from '../components/TopicVisual'
import { buildTeachingBlocks, detectTopic } from '../lib/lessonExperience'
import type { Course, Lesson, LessonSection, Module } from '../lib/types'

interface DeckSlide {
  id: string
  eyebrow: string
  title: string
  body: string
  points: string[]
  topic: ReturnType<typeof detectTopic>
  kind: 'course' | 'module' | 'lesson' | 'content' | 'summary'
}

export default function CoursePresentationPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)
  const [overview, setOverview] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const state = useAsyncData<{ course: Course; modules: Module[]; lessons: Lesson[]; sections: LessonSection[] }>(async () => {
    const { data: course, error } = await supabase.from('courses').select('*').eq('id', courseId).maybeSingle()
    if (error) throw error
    if (!course) throw new Error('This course could not be loaded.')
    const [modules, lessons, sections] = await Promise.all([
      supabase.from('modules').select('*').eq('course_id', course.id).eq('is_published', true).order('sort_order'),
      supabase.from('lessons').select('*').eq('course_id', course.id).eq('is_published', true).order('sort_order'),
      supabase.from('lesson_sections').select('*').eq('coach_only', false).order('sort_order'),
    ])
    if (modules.error) throw modules.error
    if (lessons.error) throw lessons.error
    if (sections.error) throw sections.error
    const lessonIds = new Set((lessons.data ?? []).map((lesson) => lesson.id))
    return {
      course: course as Course,
      modules: (modules.data ?? []) as Module[],
      lessons: (lessons.data ?? []) as Lesson[],
      sections: ((sections.data ?? []) as LessonSection[]).filter((section) => lessonIds.has(section.lesson_id)),
    }
  }, [courseId])

  const slides = useMemo<DeckSlide[]>(() => {
    if (!state.data) return []
    const { course, modules, lessons, sections } = state.data
    const topic = detectTopic(course.title, course.description)
    const deck: DeckSlide[] = [{
      id: `course-${course.id}`, eyebrow: 'VA Success Academy · Full course', title: course.title,
      body: course.description, points: course.learning_outcomes ?? [], topic, kind: 'course',
    }]
    modules.forEach((module, moduleIndex) => {
      const moduleLessons = lessons.filter((lesson) => lesson.module_id === module.id)
      deck.push({
        id: `module-${module.id}`, eyebrow: `Module ${moduleIndex + 1} · ${moduleLessons.length} lessons`,
        title: module.title, body: module.description, points: moduleLessons.map((lesson) => lesson.title),
        topic: detectTopic(course.title, module.title, module.description), kind: 'module',
      })
      moduleLessons.forEach((lesson, lessonIndex) => {
        const lessonTopic = detectTopic(course.title, module.title, lesson.title, lesson.description)
        deck.push({
          id: `lesson-${lesson.id}`, eyebrow: `Lesson ${lessonIndex + 1} · ${lesson.estimated_minutes} minutes`,
          title: lesson.title, body: lesson.objective || lesson.description, points: [], topic: lessonTopic, kind: 'lesson',
        })
        const content = lesson.presentation_content || lesson.student_content
        buildTeachingBlocks(content, 'Key lesson').slice(0, 6).forEach((block, blockIndex) => {
          deck.push({ id: `${lesson.id}-block-${blockIndex}`, eyebrow: block.kind, title: block.title,
            body: block.body, points: block.points.slice(0, 6), topic: lessonTopic, kind: 'content' })
        })
        sections.filter((section) => section.lesson_id === lesson.id).forEach((section) => {
          deck.push({ id: section.id, eyebrow: section.section_type, title: section.title, body: section.body,
            points: buildTeachingBlocks(section.body)[0]?.points.slice(0, 6) ?? [], topic: lessonTopic, kind: 'content' })
        })
      })
    })
    deck.push({ id: 'course-summary', eyebrow: 'Course complete', title: 'What your students can do next', body: '',
      points: course.learning_outcomes ?? [], topic, kind: 'summary' })
    return deck
  }, [state.data])

  const go = useCallback((delta: number) => setIndex((value) => Math.max(0, Math.min(slides.length - 1, value + delta))), [slides.length])
  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen()
    else await document.exitFullscreen()
  }
  useEffect(() => {
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement))
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === ' ') go(1)
      if (event.key === 'ArrowLeft') go(-1)
      if (event.key.toLowerCase() === 'o') setOverview((value) => !value)
      if (event.key.toLowerCase() === 'f') void toggleFullscreen()
      if (event.key === 'Escape' && !document.fullscreenElement) navigate(-1)
    }
    document.addEventListener('fullscreenchange', onFullscreen)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('fullscreenchange', onFullscreen); window.removeEventListener('keydown', onKey) }
  }, [go, navigate])

  if (state.loading) return <Spinner label="Building course presentation" />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />
  const slide = slides[index]
  if (!slide) return <ErrorState message="This course does not have presentation content yet." />
  const progress = ((index + 1) / slides.length) * 100

  return (
    <main className="course-deck">
      <header className="course-deck-bar">
        <button onClick={() => navigate(-1)} aria-label="Exit presentation"><X /></button>
        <div><strong>{state.data?.course.title}</strong><span><Clock3 /> Slide {index + 1} of {slides.length}</span></div>
        <div className="course-deck-actions">
          <button onClick={() => setOverview(true)}><Grid2X2 />Overview</button>
          <button onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize2 /> : <Maximize2 />}</button>
        </div>
      </header>
      <section className={`course-deck-slide deck-${slide.kind}`}>
        <div className="course-deck-copy">
          <p className="course-deck-eyebrow">{slide.eyebrow}</p>
          <h1>{slide.title}</h1>
          {slide.body && <p className="course-deck-body">{slide.body}</p>}
          {slide.points.length > 1 && <div className="course-deck-points">
            {slide.points.map((point, pointIndex) => <article key={`${point}-${pointIndex}`}><span>{pointIndex + 1}</span><p>{point}</p></article>)}
          </div>}
        </div>
        <TopicVisual topic={slide.topic} />
      </section>
      <footer className="course-deck-footer">
        <button onClick={() => go(-1)} disabled={index === 0}><ArrowLeft />Previous</button>
        <div><span style={{ width: `${progress}%` }} /></div>
        <button onClick={() => go(1)} disabled={index === slides.length - 1}>{index === slides.length - 1 ? <><CheckCircle2 />Complete</> : <>Next<ArrowRight /></>}</button>
      </footer>
      {overview && <div className="course-deck-overview">
        <header><h2>Course presentation</h2><button onClick={() => setOverview(false)}><X /></button></header>
        <div>{slides.map((item, itemIndex) => <button key={item.id} className={itemIndex === index ? 'active' : ''} onClick={() => { setIndex(itemIndex); setOverview(false) }}><span>{itemIndex + 1}</span><small>{item.eyebrow}</small><strong>{item.title}</strong></button>)}</div>
      </div>}
    </main>
  )
}
