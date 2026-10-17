import { Link } from 'react-router-dom'
import { Alert, EmptyState, PageLoading } from '../components/ui'
import { ExerciseCard } from '../features/exercises/ExerciseCard'
import { useAsync } from '../features/exercises/useAsync'
import { listPublished } from '../services/practice'

export default function HomePage() {
  const { data, error, loading } = useAsync(() => listPublished(3), [])
  return (
    <div>
      <section className="py-10 md:py-16">
        <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight md:text-5xl">Practice English one question at a time.</h1>
        <p className="mt-4 max-w-xl text-lg text-slate-600">
          Pick an exercise, choose your answer, and see right away whether you got it right and why.
        </p>
        <Link to="/exercises" className="mt-6 inline-flex rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700">Browse exercises</Link>
      </section>
      <section aria-labelledby="recent">
        <h2 id="recent" className="mb-4 text-xl font-bold">Recently published</h2>
        {loading && <PageLoading />}
        {error && <Alert title="Could not load exercises">{error}</Alert>}
        {data && data.length === 0 && <EmptyState title="No exercises yet">Exercises appear here as soon as the administrator publishes them. Check back soon.</EmptyState>}
        {data && data.length > 0 && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.map((e) => <ExerciseCard key={e.id} exercise={e} />)}</div>}
      </section>
    </div>
  )
}
