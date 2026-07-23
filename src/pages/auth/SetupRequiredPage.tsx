export default function SetupRequiredPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="card max-w-lg p-7">
        <h1 className="text-xl font-bold text-ink">Connect a Supabase project</h1>
        <p className="mt-2 text-sm text-ink-muted">
          The app cannot reach a database yet. Add these two variables to your environment,
          then rebuild. On Cloudflare Pages they go under Settings → Environment variables.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-ink px-4 py-3 text-xs leading-6 text-white">
{`VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key`}
        </pre>
        <p className="mt-4 text-sm text-ink-muted">
          Locally, copy <code className="rounded bg-canvas px-1.5 py-0.5 text-xs">.env.example</code> to{' '}
          <code className="rounded bg-canvas px-1.5 py-0.5 text-xs">.env</code> and restart the dev server.
        </p>
      </div>
    </div>
  )
}
