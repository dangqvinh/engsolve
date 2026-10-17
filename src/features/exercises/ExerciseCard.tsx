import { Link } from 'react-router-dom'
import { Play } from 'lucide-react'
import { Card } from '../../components/ui'
import type { ExerciseListItem } from '../../types'

export function ExerciseCard({ exercise }: { exercise: ExerciseListItem }) {
  return (
    <Card className="flex flex-col p-5">
      <h3 className="font-bold leading-snug">{exercise.title}</h3>
      {exercise.description && <p className="mt-1 line-clamp-3 text-sm text-slate-600">{exercise.description}</p>}
      <p className="mt-3 text-xs text-slate-500">
        {exercise.question_count} {exercise.question_count === 1 ? 'question' : 'questions'}
        {exercise.published_at && ` · Published ${new Date(exercise.published_at).toLocaleDateString()}`}
      </p>
      <Link to={`/exercises/${exercise.id}/practice`}
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
        <Play className="h-4 w-4" aria-hidden />Start practice
      </Link>
    </Card>
  )
}
