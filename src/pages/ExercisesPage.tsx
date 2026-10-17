import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Alert, EmptyState, PageLoading, inputClass } from '../components/ui'
import { ExerciseCard } from '../features/exercises/ExerciseCard'
import { useAsync } from '../features/exercises/useAsync'
import { listPublished } from '../services/practice'

export default function ExercisesPage() {
  const { data, error, loading } = useAsync(() => listPublished(), [])
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (data ?? []).filter((e) => !q || e.title.toLowerCase().includes(q) || (e.description ?? '').toLowerCase().includes(q))
  }, [data, query])
  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight">Exercises</h1>
      <div className="relative mt-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
        <input className={`${inputClass} pl-9`} type="search" placeholder="Search exercises" aria-label="Search exercises" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="mt-6">
        {loading && <PageLoading />}
        {error && <Alert title="Could not load exercises">{error}</Alert>}
        {data && data.length === 0 && <EmptyState title="No exercises published yet">Check back soon.</EmptyState>}
        {data && data.length > 0 && filtered.length === 0 && <EmptyState title="No matches">Try a different search term.</EmptyState>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{filtered.map((e) => <ExerciseCard key={e.id} exercise={e} />)}</div>
      </div>
    </div>
  )
}
