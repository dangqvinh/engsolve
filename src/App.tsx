import { Route, Routes } from 'react-router-dom'
import { configError } from './lib/supabase'
import { Alert } from './components/ui'
import { PublicLayout } from './layouts/PublicLayout'
import { AdminLayout } from './layouts/AdminLayout'
import { RequireAdmin } from './features/auth/RequireAdmin'
import HomePage from './pages/HomePage'
import ExercisesPage from './pages/ExercisesPage'
import PracticePage from './pages/PracticePage'
import ResultsPage from './pages/ResultsPage'
import NotFoundPage from './pages/NotFoundPage'
import AdminLoginPage from './pages/admin/AdminLoginPage'
import DashboardPage from './pages/admin/DashboardPage'
import AdminExercisesPage from './pages/admin/AdminExercisesPage'
import UploadPage from './pages/admin/UploadPage'
import ReviewPage from './pages/admin/ReviewPage'

export default function App() {
  if (configError) return <div className="mx-auto max-w-lg p-8"><Alert title="EngSolve is not configured">{configError}</Alert></div>
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/exercises" element={<ExercisesPage />} />
        <Route path="/exercises/:id/practice" element={<PracticePage />} />
        <Route path="/results/:attemptId" element={<ResultsPage />} />
      </Route>
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route element={<RequireAdmin />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<DashboardPage />} />
          <Route path="/admin/exercises" element={<AdminExercisesPage />} />
          <Route path="/admin/upload" element={<UploadPage />} />
          <Route path="/admin/exercises/:id" element={<ReviewPage />} />
        </Route>
      </Route>
      <Route element={<PublicLayout />}><Route path="*" element={<NotFoundPage />} /></Route>
    </Routes>
  )
}
