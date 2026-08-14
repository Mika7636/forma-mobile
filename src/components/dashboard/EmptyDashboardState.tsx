import EmptyState from '../ui/EmptyState'

interface EmptyDashboardStateProps {
  onLogSession: () => void
}

/**
 * Shown to a user with no logged sessions. There are no metrics to render yet,
 * so the screen's whole job is to get them to their first workout.
 */
export default function EmptyDashboardState({ onLogSession }: EmptyDashboardStateProps) {
  return (
    <EmptyState
      emoji="🏃"
      title="Welcome to FORMA!"
      message="Log your first workout to see your training insights — form, load, calories and recovery, all in one place."
      actionLabel="Log a Session"
      onAction={onLogSession}
    />
  )
}
