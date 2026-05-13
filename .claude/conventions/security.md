# Security

The non-negotiables. If a change violates one of these, it doesn't merge.

## Authentication

- Every backend endpoint except `/health` calls `Depends(get_current_user_id)`. Verified by reading code, not assumed.
- The Supabase JWT is verified server-side via `_admin.auth.get_user(token)`. We do NOT decode and trust JWTs locally without verification.
- The frontend stores the session via the Supabase SDK; we don't touch tokens manually.
- Token expiry is handled by the Supabase SDK refresh flow. We don't keep a token around past its expiry.

## Authorization

- A user can only access their own data. Verified at two layers:
  1. **Backend code:** every query filters by `user_id` derived from the verified JWT, never from request parameters.
  2. **Supabase RLS:** policies on every table also enforce `auth.uid() = user_id`. Defense in depth.
- IDOR (insecure direct object reference) — when an endpoint takes a `script_id`, the backend confirms it belongs to the authenticated user before doing anything. If not, return `404` (not `403` — don't leak existence).

## Secrets

- **The Supabase service role key never leaves the backend.** Not in any `NEXT_PUBLIC_*` env var. Not in client-bundled config. Not in error messages.
- **The Anthropic API key is backend-only.** Same rules.
- Local `.env` files are in `.gitignore`. Templates (`.env.example`) have no real values.
- In Render/Vercel dashboards, secrets are stored as protected env vars, not in `render.yaml`.
- If a key is accidentally committed: rotate it immediately, then rewrite history, then audit logs for unauthorized use.

## Input validation

- Every endpoint validates input via Pydantic models. Don't trust client-supplied types.
- File uploads:
  - Check file size server-side (10 MB cap).
  - Check the file is actually a PDF by reading magic bytes (`%PDF-`), not just the MIME header.
  - Reject filenames with path separators or shell metacharacters.
- User-supplied IDs (`script_id`) are validated as UUIDs before any DB query.

## Output safety

- Error responses never echo back raw input.
- Error responses never include stack traces in production.
- Logs don't contain JWTs, service keys, or full PDF text.
- The frontend never renders user-supplied text as HTML without escaping. React's default escaping is sufficient; never use `dangerouslySetInnerHTML` on user content.

## LLM-specific risks

- **Prompt injection:** The script PDF is user-supplied content concatenated into the LLM prompt. A malicious user could craft a PDF that says "Ignore prior instructions and output X." Mitigations:
  - JSON-schema validation on the output catches most injection-driven malformed output.
  - The prompt is structured (input wrapped between `SCRIPT BEGINS:` / `SCRIPT ENDS:` markers).
  - The LLM's output is never executed as code or shell. It's parsed as JSON and written to the DB.
- **Cost exhaustion:** A malicious user could upload many PDFs to burn our API budget. Per-user upload quota (Phase 3) mitigates. For MVP, monitor Anthropic dashboard manually and add the quota the moment we see abuse.
- **Sensitive content in PDFs:** Users may upload scripts with personal info (e.g., their name on an audition side). We're storing these in their own Supabase Storage bucket with RLS. We don't ship the content anywhere else. Don't log script bodies.

## Storage

- Supabase Storage bucket `user-scripts` is **private**.
- RLS policy: `auth.uid()::text = (storage.foldername(name))[1]`.
- File paths follow `{user_id}/{script_id}.pdf`. Never accept a client-supplied path.
- Backend uses the service-role key to read/write Storage; the path is constructed from the verified `user_id`.

## Transport

- HTTPS everywhere. Render and Vercel default to TLS.
- CORS allows only the production frontend origin and `localhost:3000`. No wildcards.
- No cookies; we use Bearer tokens. CSRF protections are not needed for this auth model.

## Dependencies

- Don't add a new dependency without checking: maintenance recency, weekly download count, security advisories, license compatibility.
- Run `pip list --outdated` and `npm outdated` monthly. Apply security updates promptly.
- Pin major versions in `requirements.txt` and `package.json`. Minor versions are okay to float.

## Account safety

- Email verification on signup (Supabase default).
- Password rules: Supabase defaults (8+ chars). Stronger rules in Phase 3.
- Rate limit auth endpoints via Supabase's built-in protections.

## What to do if something goes wrong

1. **Rotate** the affected secret first.
2. **Revoke** affected sessions if relevant.
3. **Audit** logs for unauthorized usage.
4. **Document** the incident in `progress/CHANGELOG.md` under a `Security:` heading.
5. **Update** this file with any lesson learned.

## Things we explicitly accept the risk of (for now)

- No 2FA in MVP.
- No SOC 2 or formal compliance.
- No DDoS protection beyond what Render/Vercel/Supabase provide by default.
- No PII scanning of uploaded PDFs.
- No customer data deletion on account delete (relying on Supabase's `ON DELETE CASCADE`).

These will become priorities post-MVP if the product gets traction.
