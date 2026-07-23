import type { TopicVisual as TopicVisualType } from '../lib/lessonExperience'

export default function TopicVisual({ topic, compact = false }: { topic: TopicVisualType; compact?: boolean }) {
  const { Icon } = topic
  return (
    <div className={`topic-visual topic-visual-${topic.motif} ${compact ? 'topic-visual-compact' : ''}`} aria-label={`${topic.label} visual`}>
      <span className="topic-orb topic-orb-one" />
      <span className="topic-orb topic-orb-two" />
      <div className="topic-visual-icon"><Icon aria-hidden /></div>
      <div className="topic-visual-lines"><i /><i /><i /></div>
      <span className="topic-visual-label">{topic.label}</span>
    </div>
  )
}
