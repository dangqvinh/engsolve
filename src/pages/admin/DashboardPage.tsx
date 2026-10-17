import { Link } from 'react-router-dom'
import { Alert, Badge, Card, PageLoading } from '../../components/ui'
import { useAsync } from '../../features/exercises/useAsync'
import { getStats, listAdminExercises } from '../../services/admin'

export default function DashboardPage() {
  const stats = useAsync(getStats, [])
  const recent = useAsync(() => listAdminExercises(5), [])
  const tile = (label: string, value: number | undefined) => (
    <Card className="p-4"><p className="text-3xl font-extrabold">{value ?? '–'}</p><p className="text-sm text-slate-600">{label}</p></Card>
  )
  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight">Dashboard</h1>
      {stats.error && <div className="mt-4"><Alert>{stats.error}</Alert></div>}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {tile('Exercises', stats.data?.total)}{tile('Published', stats.data?.published)}{tile('Drafts', stats.data?.drafts)}{tile('Questions', stats.data?.questions)}
      </div>
      <h2 className="mb-3 mt-8 text-lg font-bold">Recent exercises</h2>
      {recent.loading && <PageLoading />}
      {recent.error && <Alert>{recent.error}</Alert>}
      {recent.data && recent.data.length === 0 && <p className="text-sm text-slate-600">Nothing here yet. <Link className="font-semibold text-brand-700 hover:underline" to="/admin/upload">Upload your first PDF</Link>.</p>}
      <ul className="space-y-2">
        {recent.data?.map((e) => (
          <li key={e.id}><Card className="flex items-center justify-between p-3">
            <Link to={`/admin/exercises/${e.id}`} className="font-semibold hover:underline">{e.title}</Link>
            <Badge tone={e.status === 'published' ? 'success' : 'warning'}>{e.status === 'published' ? 'Published' : 'Draft'}</Badge>
          </Card></li>
        ))}
      </ul>
    </div>
  )
}
