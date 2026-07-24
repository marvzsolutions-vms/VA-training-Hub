import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import { Badge, Breadcrumbs, Button, Card, ErrorState, ProgressBar, Spinner } from '../components/ui'
import { readableError } from '../lib/utils'

type Choice = { id: string; choice_text: string; sort_order: number }
type Question = { id: string; question_text: string; question_type: string; points: number; required: boolean; choices: Choice[] }
type QuizData = {
  quiz: { id: string; course_id: string; title: string; description: string; passing_percentage: number; maximum_attempts: number; allow_retake: boolean }
  questions: Question[]
}
type ResultAnswer = {
  question_id: string; question_text: string; skill_tag: string; explanation: string
  related_lesson_id: string | null; related_lesson_slug: string | null
  selected_text: string | null; correct_text: string | null; is_correct: boolean
  points_earned: number; points: number
}
type QuizResult = {
  quiz: QuizData['quiz'] & { show_correct_answers: boolean }
  attempt: { id: string; attempt_number: number; points_earned: number; total_points: number; percentage: number; passed: boolean }
  remaining_attempts: number
  answers: ResultAnswer[]
  weak_skills: Array<{ skill_tag: string; mistakes: number; recommended_lessons: Array<{ lesson_id: string | null; lesson_slug: string | null }> }>
}

export default function QuizPage() {
  const { quizId } = useParams<{ quizId: string }>()
  const { notify } = useToast()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [quiz, setQuiz] = useState<QuizData | null>(null)
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [attemptNumber, setAttemptNumber] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<QuizResult | null>(null)

  const loadQuiz = async () => {
    if (!quizId) return
    setLoading(true); setError(''); setResult(null); setAnswers({}); setAttemptId(null)
    try {
      const { data: started, error: startError } = await supabase.rpc('start_quiz_attempt', { p_quiz_id: quizId })
      if (startError) throw startError
      const start = started as { attempt_id: string; attempt_number: number }
      const { data, error: quizError } = await supabase.rpc('get_quiz_attempt', { p_quiz_id: quizId, p_attempt_id: start.attempt_id })
      if (quizError) throw quizError
      setAttemptId(start.attempt_id); setAttemptNumber(start.attempt_number); setQuiz(data as QuizData)
    } catch (e) { setError(readableError(e)) }
    finally { setLoading(false) }
  }

  useEffect(() => { void loadQuiz() }, [quizId])

  const answered = Object.keys(answers).length
  const total = quiz?.questions.length ?? 0
  const canSubmit = !!quiz && quiz.questions.every((q) => !q.required || !!answers[q.id])
  const skillLabel = (tag: string) => tag.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  const recommendations = useMemo(() => {
    if (!result) return []
    const map = new Map<string, { id: string | null; slug: string | null }>()
    result.weak_skills.forEach((skill) => skill.recommended_lessons.forEach((lesson) => {
      const key = lesson.lesson_id ?? lesson.lesson_slug
      if (key) map.set(key, { id: lesson.lesson_id, slug: lesson.lesson_slug })
    }))
    return [...map.values()]
  }, [result])

  const submit = async () => {
    if (!attemptId || !canSubmit) return
    setSubmitting(true)
    try {
      const payload = Object.entries(answers).map(([question_id, selected_choice_id]) => ({ question_id, selected_choice_id }))
      const { data, error: submitError } = await supabase.rpc('submit_quiz_attempt', { p_attempt_id: attemptId, p_answers: payload })
      if (submitError) throw submitError
      setResult(data as QuizResult)
      notify((data as QuizResult).attempt.passed ? 'Quiz passed!' : 'Quiz submitted. Review your recommendations.')
    } catch (e) { notify(readableError(e), 'error') }
    finally { setSubmitting(false) }
  }

  if (loading) return <Spinner label="Loading quiz" />
  if (error) return <ErrorState message={error} onRetry={loadQuiz} />
  if (!quiz) return <ErrorState message="Quiz not found." />

  if (result) {
    const a = result.attempt
    return <>
      <Breadcrumbs items={[{ label: 'Courses', to: '/courses' }, { label: quiz.quiz.title }]} />
      <div className="mx-auto max-w-4xl space-y-6">
        <Card className={a.passed ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}>
          <div className="flex items-start gap-4">
            {a.passed ? <CheckCircle2 className="h-9 w-9 text-emerald-600" /> : <XCircle className="h-9 w-9 text-amber-600" />}
            <div className="flex-1">
              <Badge tone={a.passed ? 'success' : 'warning'}>{a.passed ? 'Passed' : 'Needs improvement'}</Badge>
              <h1 className="mt-2 text-2xl font-bold text-ink">{quiz.quiz.title}</h1>
              <p className="mt-1 text-sm text-ink-muted">Attempt {a.attempt_number} · {a.points_earned}/{a.total_points} points</p>
              <p className="mt-4 text-4xl font-bold text-ink">{Number(a.percentage).toFixed(0)}%</p>
              <p className="text-sm text-ink-muted">Passing score: {Number(result.quiz.passing_percentage).toFixed(0)}%</p>
            </div>
          </div>
        </Card>

        {result.weak_skills.length > 0 && <Card>
          <h2 className="text-lg font-bold text-ink">Areas to improve</h2>
          <div className="mt-4 space-y-3">
            {result.weak_skills.map((skill) => <div key={skill.skill_tag} className="rounded-xl border border-canvas-line p-4">
              <div className="flex justify-between gap-3"><p className="font-semibold text-ink">{skillLabel(skill.skill_tag)}</p><Badge tone="warning">{skill.mistakes} incorrect</Badge></div>
            </div>)}
          </div>
          {recommendations.length > 0 && <div className="mt-5"><p className="text-sm font-semibold text-ink">Recommended lessons to review</p><div className="mt-2 flex flex-wrap gap-2">{recommendations.map((lesson) => lesson.id ? <Link key={lesson.id} to={`/lessons/${lesson.id}`}><Button size="sm" variant="outline">Review lesson</Button></Link> : <Badge key={lesson.slug}>{skillLabel(lesson.slug ?? 'Lesson')}</Badge>)}</div></div>}
        </Card>}

        <Card>
          <h2 className="text-lg font-bold text-ink">Answer review</h2>
          <div className="mt-4 space-y-4">{result.answers.map((answer, index) => <div key={answer.question_id} className="rounded-xl border border-canvas-line p-4">
            <div className="flex gap-3">{answer.is_correct ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /> : <XCircle className="mt-0.5 h-5 w-5 text-rose-600" />}<div className="min-w-0"><p className="font-semibold text-ink">{index + 1}. {answer.question_text}</p><p className="mt-2 text-sm text-ink-muted">Your answer: {answer.selected_text ?? 'No answer'}</p>{answer.correct_text && !answer.is_correct && <p className="text-sm text-emerald-700">Correct answer: {answer.correct_text}</p>}{answer.explanation && <p className="mt-2 text-sm text-ink-soft">{answer.explanation}</p>}</div></div>
          </div>)}</div>
        </Card>

        <div className="flex flex-wrap justify-between gap-3">
          <Link to={`/courses`}><Button variant="outline">Back to courses</Button></Link>
          {!a.passed && result.quiz.allow_retake && result.remaining_attempts > 0 && <Button onClick={loadQuiz}><RotateCcw className="h-4 w-4" />Retake ({result.remaining_attempts} left)</Button>}
        </div>
      </div>
    </>
  }

  return <>
    <Breadcrumbs items={[{ label: 'Courses', to: '/courses' }, { label: quiz.quiz.title }]} />
    <div className="mx-auto max-w-4xl space-y-6">
      <Card><h1 className="text-2xl font-bold text-ink">{quiz.quiz.title}</h1>{quiz.quiz.description && <p className="mt-2 text-sm text-ink-muted">{quiz.quiz.description}</p>}<div className="mt-4"><ProgressBar value={total ? (answered / total) * 100 : 0} label={`${answered} of ${total} answered`} /></div><p className="mt-2 text-xs text-ink-soft">Attempt {attemptNumber} of {quiz.quiz.maximum_attempts} · Passing score {quiz.quiz.passing_percentage}%</p></Card>
      {quiz.questions.map((question, index) => <Card key={question.id}>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Question {index + 1} · {question.points} point{question.points === 1 ? '' : 's'}</p>
        <h2 className="mt-2 font-semibold text-ink">{question.question_text}</h2>
        <div className="mt-4 space-y-2">{question.choices.map((choice) => <label key={choice.id} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${answers[question.id] === choice.id ? 'border-brand-400 bg-brand-50' : 'border-canvas-line'}`}><input type="radio" name={question.id} value={choice.id} checked={answers[question.id] === choice.id} onChange={() => setAnswers((current) => ({ ...current, [question.id]: choice.id }))} /><span className="text-sm text-ink">{choice.choice_text}</span></label>)}</div>
      </Card>)}
      <div className="flex justify-end"><Button onClick={submit} loading={submitting} disabled={!canSubmit}>Submit quiz</Button></div>
    </div>
  </>
}
