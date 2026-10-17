import { Link } from 'react-router-dom'
export default function NotFoundPage() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-slate-600">That address does not exist.</p>
      <Link to="/" className="mt-4 inline-block font-semibold text-brand-700 hover:underline">Back to home</Link>
    </div>
  )
}
