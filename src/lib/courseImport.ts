import JSZip from 'jszip'

export interface CourseImportPreview {
  slug: string
  title: string
  level: 'level_1' | 'level_2' | 'level_3'
  description: string
  estimatedMinutes: number
  published: boolean
  learningOutcomes: string[]
  modules: Array<{ key: string; title: string; description: string; sortOrder: number; published: boolean }>
  lessons: Array<{
    key: string; moduleKey: string; slug: string; title: string; objective: string
    studentContent: string; type: string; estimatedMinutes: number; required: boolean
    sortOrder: number; published: boolean; recordingUrl: string | null
  }>
  resources: Array<{ title: string; description: string; url: string | null; filePath: string | null; lessonKey: string | null; moduleKey: string | null; sortOrder: number }>
  quizzes: unknown[]
  assignments: unknown[]
  sourceFileName: string
}

const normalizeLevel = (value: unknown): CourseImportPreview['level'] => {
  const text = String(value ?? '1').toLowerCase().replace(/[^0-9]/g, '')
  return text === '3' ? 'level_3' : text === '2' ? 'level_2' : 'level_1'
}

const readJson = async <T>(zip: JSZip, suffix: string, required = true): Promise<T | null> => {
  const entry = Object.values(zip.files).find((file) => !file.dir && file.name.toLowerCase().endsWith(suffix.toLowerCase()))
  if (!entry) {
    if (required) throw new Error(`Missing required file: ${suffix}`)
    return null
  }
  return JSON.parse(await entry.async('text')) as T
}

const readText = async (zip: JSZip, path: string): Promise<string> => {
  const normalized = path.replace(/^\.\//, '').toLowerCase()
  const entry = Object.values(zip.files).find((file) => !file.dir && file.name.toLowerCase().endsWith(normalized))
  if (!entry) throw new Error(`Lesson content file not found: ${path}`)
  return (await entry.async('text')).replace(/^---[\s\S]*?---\s*/m, '').trim()
}

export async function parseCourseImportZip(file: File): Promise<CourseImportPreview> {
  const zip = await JSZip.loadAsync(file)
  const course = await readJson<Record<string, any>>(zip, 'course.json')
  const modules = await readJson<any[]>(zip, 'modules.json')
  const lessons = await readJson<any[]>(zip, 'lessons.json')
  if (!course || !modules || !lessons) throw new Error('Invalid course package.')

  const normalizedModules = modules.map((module, index) => ({
    key: `module-${module.module_order ?? index + 1}`,
    title: String(module.title ?? `Module ${index + 1}`),
    description: String(module.objective ?? module.description ?? ''),
    sortOrder: Number(module.module_order ?? index + 1),
    published: String(module.status ?? 'published') === 'published',
  }))

  const normalizedLessons = await Promise.all(lessons.map(async (lesson, index) => {
    const moduleOrder = Number(lesson.module_order ?? 1)
    const objective = Array.isArray(lesson.objectives)
      ? lesson.objectives.join('\n')
      : String(lesson.objective ?? lesson.description ?? '')
    return {
      key: String(lesson.slug ?? `lesson-${index + 1}`),
      moduleKey: `module-${moduleOrder}`,
      slug: String(lesson.slug ?? `lesson-${index + 1}`),
      title: String(lesson.title ?? `Lesson ${index + 1}`),
      objective,
      studentContent: lesson.content_file ? await readText(zip, String(lesson.content_file)) : String(lesson.content ?? ''),
      type: String(lesson.lesson_type ?? lesson.type ?? 'text'),
      estimatedMinutes: Number(lesson.estimated_minutes ?? 15),
      required: lesson.is_required !== false,
      sortOrder: Number(lesson.lesson_order ?? index + 1),
      published: String(lesson.status ?? 'published') === 'published',
      recordingUrl: lesson.video_url ? String(lesson.video_url) : null,
    }
  }))

  const resourceData = await readJson<any[]>(zip, 'resources/resources.json', false) ?? []
  const resources = resourceData.map((resource, index) => ({
    title: String(resource.title ?? resource.name ?? `Resource ${index + 1}`),
    description: String(resource.description ?? ''),
    url: resource.url ? String(resource.url) : null,
    filePath: resource.file ?? resource.file_path ? String(resource.file ?? resource.file_path) : null,
    lessonKey: resource.lesson_slug ? String(resource.lesson_slug) : null,
    moduleKey: resource.module_order ? `module-${resource.module_order}` : null,
    sortOrder: Number(resource.sort_order ?? index + 1),
  }))

  const quizzes: unknown[] = []
  for (const entry of Object.values(zip.files)) {
    if (!entry.dir && /\/quizzes\/.*\.json$/i.test(`/${entry.name}`)) quizzes.push(JSON.parse(await entry.async('text')))
  }
  const assignments = await readJson<unknown[]>(zip, 'assignments/assignments.json', false) ?? []
  const finalAssessment = await readJson<unknown>(zip, 'final-assessment.json', false)
  if (finalAssessment) assignments.push(finalAssessment)

  return {
    slug: String(course.slug),
    title: String(course.title),
    level: normalizeLevel(course.level),
    description: String(course.description ?? ''),
    estimatedMinutes: Math.round(Number(course.estimated_hours ?? 0) * 60),
    published: String(course.status ?? 'draft') === 'published',
    learningOutcomes: Array.isArray(course.learning_outcomes) ? course.learning_outcomes.map(String) : [],
    modules: normalizedModules,
    lessons: normalizedLessons,
    resources,
    quizzes,
    assignments,
    sourceFileName: file.name,
  }
}
