import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, Pencil, Trash2, Upload } from 'lucide-react'
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, PageLoading } from '../../components/ui'
import { useAsync } from '../../features/exercises/useAsync'
import { errorMessage } from '../../lib/errors'
import { deleteExercise, listAdminExercises, setPublished, type AdminExerciseRow } from '../../services/admin'

export default function AdminExercisesPage() {
  const { data, error, loading, reload } = useAsync(() => listAdminExercises(), [])
  const [toDelete, setToDelete] = useState<AdminExerciseRow | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id); setActionError(null)
    try { await fn(); await reload() } catch (e) { setActionError(errorMessage(e)) } finally { setBusyId(null); setToDelete(null) }
  }
  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">Exercises</h1>
        <Link to="/admin/upload" className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"><Upload className="h-4 w-4" aria-hidden />Upload PDF</Link>
      </div>
      {actionError && <div className="mt-4"><Alert>{actionError}</Alert></div>}
      <div className="mt-4">
        {loading && <PageLoading />}
        {error && <Alert>{error}</Alert>}
        {data && data.length === 0 && <EmptyState title="No exercises yet" action={<Link className="font-semibold text-brand-700 hover:underline" to="/admin/upload">Upload a PDF</Link>}>Upload an exercise PDF to get started.</EmptyState>}
        {data && data.length > 0 && (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-600"><tr><th className="p-3">Title</th><th className="p-3">Questions</th><th className="p-3">Status</th><th className="p-3">Updated</th><th className="p-3"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {data.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100 last:border-0">
                    <td className="p-3 font-semibold">{e.title}</td>
                    <td className="p-3">{e.question_count}</td>
                    <td className="p-3"><Badge tone={e.status === 'published' ? 'success' : 'warning'}>{e.status === 'published' ? 'Published' : 'Draft'}</Badge></td>
                    <td className="p-3 text-slate-600">{new Date(e.updated_at).toLocaleDateString()}</td>
                    <td className="p-3"><div className="flex flex-wrap justify-end gap-1">
                      <Link to={`/admin/exercises/${e.id}`} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-brand-700 hover:bg-brand-50"><Pencil className="h-4 w-4" aria-hidden />Review</Link>
                      <Link to={`/admin/exercises/${e.id}?preview=1`} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-slate-700 hover:bg-slate-100"><Eye className="h-4 w-4" aria-hidden />Preview</Link>
                      <Button variant="ghost" className="px-2 py-1" loading={busyId === e.id} onClick={() => void run(e.id, () => setPublished(e.id, e.status !== 'published'))}>{e.status === 'published' ? 'Unpublish' : 'Publish'}</Button>
                      <Button variant="ghost" className="px-2 py-1 text-red-700" onClick={() => setToDelete(e)}><Trash2 className="h-4 w-4" aria-hidden /><span className="sr-only">Delete {e.title}</span></Button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
      <ConfirmDialog open={!!toDelete} title="Delete this exercise?" busy={busyId === toDelete?.id}
        message={`"${toDelete?.title}", its questions and its stored PDFs will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete" onConfirm={() => toDelete && void run(toDelete.id, () => deleteExercise(toDelete.id))} onCancel={() => setToDelete(null)} />
    </div>
  )
}
