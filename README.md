# EngSolve — English Practice

An administrator uploads English multiple-choice PDFs. EngSolve extracts questions, reads an answer key if there is one, asks Gemini to *suggest* answers where there is none, and lets the admin review everything before publishing. Learners practise as guests with instant feedback and a server-calculated score.

**Stack:** React + Vite + TypeScript + Tailwind · Supabase (Postgres, Auth, Storage, Edge Functions) · Cloudflare Pages · Google Gemini (server-side only).

## How it works

| Step | Where it runs |
|---|---|
| PDF text extraction (pdf.js) and OCR fallback (Tesseract.js, with repeated-band and mixed-layout column detection) | Admin's browser. Edge Functions have tight CPU/memory limits, so heavy PDF work stays client-side. |
| Question/answer-key parsing | Browser, deterministic (`src/lib/parsing`). Uncertain items are flagged, never guessed. |
| Gemini answer suggestions | Edge Function `generate-answers` (admin only). |
| Publish checks | Edge Function `publish-exercise` (admin only). |
| Practice, scoring | Edge Functions `start-attempt`, `submit-answer`, `complete-attempt`. Correct answers are never sent to the browser before an answer is submitted. |

**Answer priority:** answer key inside the PDF → uploaded answer-key PDF → Gemini. Every answer, whatever its source, must be approved by an admin before the exercise can be published.

### Design decisions worth knowing
- **Answer key lives in `question_answers`, not `questions`.** RLS is row-level, so keeping `correct_option_id` on the public `questions` table would expose it. A composite foreign key guarantees the correct option belongs to the same question.
- **Raw extracted text and file paths live in `exercise_sources`** (admin-only), so publishing an exercise does not publish its source text.
- **Guests have no accounts.** `start-attempt` returns a random secret kept in `sessionStorage`; only its SHA-256 hash is stored. Attempts tables have no client access at all; only Edge Functions (service role) write to them.
- **Answers lock after submission**; duplicate submissions return the stored result and cannot change the score.
- **Admin role** is in `profiles.role`. No client policy can write it, and every admin Edge Function re-checks it in the database.

## Local setup

```bash
nvm use            # Node 22
npm install
cp .env.example .env   # fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

Commands: `npm run dev | build | typecheck | lint | test`.

## Supabase setup

1. Create a project at supabase.com. Install the [Supabase CLI](https://supabase.com/docs/guides/cli) and run `supabase login`, then `supabase link --project-ref <ref>`.
2. **Apply the schema:** `supabase db push` (runs `supabase/migrations/*.sql`: tables, RLS, private `exercise-pdfs` bucket + storage policies).
3. **Disable public sign-ups:** Dashboard → Authentication → Providers → Email → turn off *Allow new users to sign up*. (Even if left on, new users are never admins.)
4. **Create the first admin:** Dashboard → Authentication → Users → *Add user* (email + password, auto-confirm). Then run `supabase/seed-admin.sql` in the SQL editor with your email.
5. **Gemini secret (server-side only).** Never put the key in `.env` for Vite or in Git.
   ```bash
   # Option A: CLI
   supabase secrets set GEMINI_API_KEY=YOUR_REAL_KEY GEMINI_MODEL=gemini-2.5-flash ALLOWED_ORIGINS=http://localhost:5173,https://YOUR-SITE.pages.dev
   # Option B: Dashboard → Edge Functions → Secrets
   ```
   `GEMINI_MODEL` defaults to `gemini-2.5-flash`. **Model names and free-tier access change.** Check Google AI Studio for a model your key can use and update the secret if you get a "model not available" error. EngSolve never switches models or enables billing by itself.
6. **Deploy the functions:** `supabase functions deploy` (deploys all five; JWT checks are configured in `supabase/config.toml` and admin checks happen in code).

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into Edge Functions automatically. You never set them.

## Deploy the frontend (Cloudflare Pages)

1. Push this repo to GitHub/GitLab. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git.
2. Build command `npm run build`, output directory `dist`, environment variable `NODE_VERSION=22`.
3. Add **only** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as variables.
4. `public/_redirects` provides the SPA fallback so refreshing `/exercises/...` does not 404.
5. Add the resulting `https://….pages.dev` URL to `ALLOWED_ORIGINS` (step 5 above) and redeploy functions if you changed it.

## Admin workflow

1. `/admin/login` → **Upload PDF** (optional answer-key PDF; optional Gemini suggestions).
2. Open the draft → fix questions, choices, answers, explanations. Filters show what needs attention. **Save and approve** each question.
3. **Preview**, then **Publish**. Unpublish any time.

## Security checklist
- Gemini key only in Edge Function secrets; never in the bundle (`grep` of `dist/` for key/service-role names finds nothing).
- RLS enabled on all tables; anon can read only published exercises/questions/options; answers, sources and attempts are not readable by anon.
- `supabase/tests/rls_checks.sql` is a manual script to verify the policies on your own project.
- PDFs are in a private bucket, admin-only policies. PDF text sent to Gemini is wrapped as untrusted data in the prompt, and all model output is schema-validated before saving.

## Free-tier limits and known limitations
- Quotas, models and limits of Supabase, Cloudflare and Gemini change. Check their pricing pages. When Gemini's quota is hit you get a clear message; questions already extracted stay saved and you can edit manually or retry later.
- **No AI-assisted parsing yet.** Gemini is used for answers and explanations only. Questions that the deterministic parser cannot read must be fixed or added by hand.
- **Retrying** re-runs only the Gemini step, using saved text. Re-parsing from the saved text without re-uploading is not implemented.
- OCR is capped at 25 pages, runs in the browser, and can be slow and inaccurate. It always flags the exercise "OCR text".
- Answer-key questions get no AI explanation; add them manually.
- Max PDF size is 10 MB (bucket limit; change both `src/lib/files.ts` and the migration).
- Guest attempts are per-tab: results are viewable only in the tab that finished them. There is no rate limiting on `start-attempt`.
- Only one browser-side PDF parse happens at a time; very large PDFs may be slow on phones.

## Debugging
- Edge Function logs: Dashboard → Edge Functions → select function → Logs, or `supabase functions logs <name>`.
- Admin sees "No administrator access": run `seed-admin.sql` with the exact signed-in email.
- "Model not available" or quota errors come straight from Gemini; see Gemini setup above.
