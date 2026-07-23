import {
  BarChart3, Bot, BriefcaseBusiness, Brush, CalendarCheck, Camera, FileSearch,
  Headphones, LayoutTemplate, Mail, Megaphone, MessageSquareText, Search,
  Share2, Sparkles, Target, Users, WandSparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type TeachingBlockKind = 'concept' | 'steps' | 'example' | 'practice' | 'tip' | 'warning' | 'checklist' | 'summary'

export interface TeachingBlock {
  kind: TeachingBlockKind
  title: string
  body: string
  points: string[]
}

export interface TopicVisual {
  label: string
  Icon: LucideIcon
  keywords: string[]
  motif: 'network' | 'cards' | 'search' | 'message' | 'chart' | 'creative'
}

const topics: TopicVisual[] = [
  { label: 'Social Media', Icon: Share2, keywords: ['social media', 'facebook', 'instagram', 'linkedin', 'content calendar', 'posting'], motif: 'network' },
  { label: 'Email Marketing', Icon: Mail, keywords: ['email', 'newsletter', 'campaign', 'automation', 'deliverability'], motif: 'message' },
  { label: 'Lead Generation', Icon: Target, keywords: ['lead generation', 'prospecting', 'apollo', 'lead list', 'outreach'], motif: 'chart' },
  { label: 'Research', Icon: FileSearch, keywords: ['research', 'data gathering', 'competitor', 'market research'], motif: 'search' },
  { label: 'Customer Support', Icon: Headphones, keywords: ['customer support', 'customer service', 'ticket', 'inbox management'], motif: 'message' },
  { label: 'Graphic Design', Icon: Brush, keywords: ['canva', 'graphic', 'design', 'visual', 'brand kit'], motif: 'creative' },
  { label: 'Content Creation', Icon: Camera, keywords: ['content creation', 'caption', 'copywriting', 'video editing'], motif: 'creative' },
  { label: 'AI & Productivity', Icon: Bot, keywords: ['ai', 'chatgpt', 'prompt', 'productivity', 'workflow'], motif: 'cards' },
  { label: 'Analytics', Icon: BarChart3, keywords: ['analytics', 'report', 'metrics', 'kpi', 'performance'], motif: 'chart' },
  { label: 'Admin Support', Icon: CalendarCheck, keywords: ['calendar', 'admin', 'appointment', 'scheduling', 'data entry'], motif: 'cards' },
  { label: 'Marketing', Icon: Megaphone, keywords: ['marketing', 'campaign', 'audience', 'funnel'], motif: 'network' },
]

export function detectTopic(...values: Array<string | null | undefined>): TopicVisual {
  const source = values.filter(Boolean).join(' ').toLowerCase()
  return topics.find((topic) => topic.keywords.some((keyword) => source.includes(keyword))) ?? {
    label: 'Virtual Assistance', Icon: BriefcaseBusiness, keywords: [], motif: 'cards',
  }
}

function kindFromHeading(heading: string): TeachingBlockKind {
  const value = heading.toLowerCase()
  if (/step|how to|process|workflow/.test(value)) return 'steps'
  if (/example|sample|scenario/.test(value)) return 'example'
  if (/practice|activity|exercise|your turn/.test(value)) return 'practice'
  if (/tip|best practice|remember/.test(value)) return 'tip'
  if (/warning|avoid|mistake|do not/.test(value)) return 'warning'
  if (/checklist|quality check/.test(value)) return 'checklist'
  if (/summary|takeaway|recap/.test(value)) return 'summary'
  return 'concept'
}

function pointsFromBody(body: string) {
  const lines = body.split(/\n+/).map((line) => line.replace(/^[-•*\d.)\s]+/, '').trim()).filter(Boolean)
  return lines.length > 1 ? lines : body.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map((p) => p.trim()).filter(Boolean)
}

export function buildTeachingBlocks(content: string, fallbackTitle = 'Lesson notes'): TeachingBlock[] {
  const clean = (content || '').replace(/\\n/g, '\n').trim()
  if (!clean) return []
  const chunks = clean.split(/\n(?=#{1,3}\s)|\n{2,}(?=[A-Z][^\n]{2,60}:?\n)/).filter(Boolean)
  if (chunks.length === 1) {
    return [{ kind: 'concept', title: fallbackTitle, body: clean, points: pointsFromBody(clean) }]
  }
  return chunks.map((chunk, index) => {
    const lines = chunk.trim().split('\n')
    const possibleHeading = lines[0].replace(/^#{1,3}\s*/, '').replace(/:$/, '').trim()
    const hasHeading = /^#{1,3}\s/.test(lines[0]) || (possibleHeading.length < 70 && lines.length > 1)
    const title = hasHeading ? possibleHeading : `${fallbackTitle} ${index + 1}`
    const body = (hasHeading ? lines.slice(1) : lines).join('\n').trim()
    return { kind: kindFromHeading(title), title, body, points: pointsFromBody(body) }
  })
}

export const blockIcons: Record<TeachingBlockKind, LucideIcon> = {
  concept: LayoutTemplate,
  steps: WandSparkles,
  example: MessageSquareText,
  practice: Target,
  tip: Sparkles,
  warning: Search,
  checklist: CalendarCheck,
  summary: Users,
}
