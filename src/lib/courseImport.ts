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
    key: string
    moduleKey: string
    slug: string
    title: string
    objective: string
    studentContent: string
    type: string
    estimatedMinutes: number
    required: boolean
    sortOrder: number
    published: boolean
    recordingUrl: string | null
  }>
  resources: Array<{
    title: string
    description: string
    url: string | null
    filePath: string | null
    lessonKey: string | null
    moduleKey: string | null
    sortOrder: number
  }>
  quizzes: unknown[]
  assignments: unknown[]
  sourceFileName: string
}

const normalizeLevel = (value: unknown): CourseImportPreview['level'] => {
  const text = String(value ?? '1').toLowerCase().replace(/[^0-9]/g, '')
  return text === '3' ? 'level_3' : text === '2' ? 'level_2' : 'level_1'
}

const readJson = async <T>(zip: JSZip, suffix: string, required = true): Promise<T | null> => {
  const entry = Object.values(zip.files).find(
    (file) => !file.dir && file.name.toLowerCase().endsWith(suffix.toLowerCase()),
  )

  if (!entry) {
    if (required) throw new Error(`Missing required file: ${suffix}`)
    return null
  }

  try {
    return JSON.parse(await entry.async('text')) as T
  } catch {
    throw new Error(`Invalid JSON in file: ${entry.name}`)
  }
}

const readText = async (zip: JSZip, path: string): Promise<string> => {
  const normalized = path.replace(/^\.\//, '').replace(/\\/g, '/').toLowerCase()
  const entry = Object.values(zip.files).find(
    (file) => !file.dir && file.name.replace(/\\/g, '/').toLowerCase().endsWith(normalized),
  )

  if (!entry) throw new Error(`Lesson content file not found: ${path}`)

  return (await entry.async('text')).replace(/^---[\s\S]*?---\s*/m, '').trim()
}

const unwrapArray = <T>(
  value: unknown,
  keys: string[],
  label: string,
): T[] => {
  if (value == null) return []
  if (Array.isArray(value)) return value as T[]

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>

    for (const key of keys) {
      if (Array.isArray(record[key])) return record[key] as T[]
    }

    const arrayValue = Object.values(record).find(Array.isArray)
    if (arrayValue) return arrayValue as T[]
  }

  throw new Error(`${label} must be an array or an object containing an array.`)
}

const unwrapSingleOrArray = (value: unknown, keys: string[]): unknown[] => {
  if (value == null) return []
  if (Array.isArray(value)) return value

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>

    for (const key of keys) {
      if (Array.isArray(record[key])) return record[key] as unknown[]
    }

    return [value]
  }

  return []
}

export async function parseCourseImportZip(file: File): Promise<CourseImportPreview> {
  const zip = await JSZip.loadAsync(file)

  const course = await readJson<Record<string, unknown>>(zip, 'course.json')
  const moduleData = await readJson<unknown>(zip, 'modules.json')
  const lessonData = await readJson<unknown>(zip, 'lessons.json')

  if (!course || moduleData == null || lessonData == null) {
    throw new Error('Invalid course package.')
  }

  const modules = unwrapArray<Record<string, unknown>>(
    moduleData,
    ['modules', 'items', 'data'],
    'modules.json',
  )

  const lessons = unwrapArray<Record<string, unknown>>(
    lessonData,
    ['lessons', 'items', 'data'],
    'lessons.json',
  )

  const normalizedModules = modules.map((module, index) => {
    const moduleOrder = Number(module.module_order ?? module.sort_order ?? index + 1)

    return {
      key: String(module.key ?? module.slug ?? `module-${moduleOrder}`),
      title: String(module.title ?? `Module ${index + 1}`),
      description: String(module.objective ?? module.description ?? ''),
      sortOrder: moduleOrder,
      published: String(module.status ?? 'published') === 'published',
    }
  })

  const moduleKeyByOrder = new Map(
    normalizedModules.map((module) => [module.sortOrder, module.key]),
  )

  const normalizedLessons = await Promise.all(
    lessons.map(async (lesson, index) => {
      const moduleOrder = Number(lesson.module_order ?? lesson.module_sort_order ?? 1)
      const objective = Array.isArray(lesson.objectives)
        ? lesson.objectives.map(String).join('\n')
        : String(lesson.objective ?? lesson.description ?? '')

      return {
        key: String(lesson.key ?? lesson.slug ?? `lesson-${index + 1}`),
        moduleKey: String(
          lesson.module_key ??
            moduleKeyByOrder.get(moduleOrder) ??
            `module-${moduleOrder}`,
        ),
        slug: String(lesson.slug ?? `lesson-${index + 1}`),
        title: String(lesson.title ?? `Lesson ${index + 1}`),
        objective,
        studentContent: lesson.content_file
          ? await readText(zip, String(lesson.content_file))
          : String(lesson.content ?? ''),
        type: String(lesson.lesson_type ?? lesson.type ?? 'text'),
        estimatedMinutes: Number(lesson.estimated_minutes ?? 15),
        required: lesson.is_required !== false,
        sortOrder: Number(lesson.lesson_order ?? lesson.sort_order ?? index + 1),
        published: String(lesson.status ?? 'published') === 'published',
        recordingUrl: lesson.video_url ? String(lesson.video_url) : null,
      }
    }),
  )

  const rawResourceData =
    (await readJson<unknown>(zip, 'resources/resources.json', false)) ??
    (await readJson<unknown>(zip, 'resources.json', false))

  const resourceData = unwrapArray<Record<string, unknown>>(
    rawResourceData,
    ['resources', 'items', 'downloads', 'data'],
    'resources.json',
  )

  const resources = resourceData.map((resource, index) => ({
    title: String(resource.title ?? resource.name ?? `Resource ${index + 1}`),
    description: String(resource.description ?? ''),
    url: resource.url ? String(resource.url) : null,
    filePath:
      resource.file ?? resource.file_path
        ? String(resource.file ?? resource.file_path)
        : null,
    lessonKey: resource.lesson_slug
      ? String(resource.lesson_slug)
      : resource.lesson_key
        ? String(resource.lesson_key)
        : null,
    moduleKey: resource.module_key
      ? String(resource.module_key)
      : resource.module_order
        ? moduleKeyByOrder.get(Number(resource.module_order)) ??
          `module-${resource.module_order}`
        : null,
    sortOrder: Number(resource.sort_order ?? index + 1),
  }))

  const quizzes: unknown[] = []
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !/\/quizzes\/.*\.json$/i.test(`/${entry.name}`)) continue

    const parsed = JSON.parse(await entry.async('text')) as unknown
    quizzes.push(...unwrapSingleOrArray(parsed, ['quizzes', 'questions', 'items', 'data']))
  }

  const rawAssignments =
    (await readJson<unknown>(zip, 'assignments/assignments.json', false)) ??
    (await readJson<unknown>(zip, 'assignments.json', false))

  const assignments = unwrapSingleOrArray(
    rawAssignments,
    ['assignments', 'items', 'data'],
  )

  const finalAssessment = await readJson<unknown>(
    zip,
    'final-assessment.json',
    false,
  )

  if (finalAssessment) {
    assignments.push(
      ...unwrapSingleOrArray(finalAssessment, [
        'assignments',
        'assessment',
        'final_assessment',
        'items',
        'data',
      ]),
    )
  }

  const estimatedHours = Number(course.estimated_hours ?? 0)
  const estimatedMinutes = Number(course.estimated_minutes ?? 0)

  return {
    slug: String(course.slug ?? ''),
    title: String(course.title ?? ''),
    level: normalizeLevel(course.level),
    description: String(course.description ?? ''),
    estimatedMinutes:
      estimatedMinutes > 0 ? estimatedMinutes : Math.round(estimatedHours * 60),
    published: String(course.status ?? 'draft') === 'published',
    learningOutcomes: Array.isArray(course.learning_outcomes)
      ? course.learning_outcomes.map(String)
      : [],
    modules: normalizedModules,
    lessons: normalizedLessons,
    resources,
    quizzes,
    assignments,
    sourceFileName: file.name,
  }
}
