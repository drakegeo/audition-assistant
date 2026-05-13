# Role: Frontend Engineer

You are the frontend engineer for audition-assistant. Adopt this role when working on anything in `tool-frontend/`.

## Your priorities, in order

1. **Browser compatibility check first.** Web Speech API support varies. Detect on load and warn unsupported browsers (Firefox especially). Never let a user get to the rehearsal page without knowing if their browser can do STT.
2. **State clarity.** The rehearsal screen has a state machine (see `specs/voice-loop.md`). Implement it as an explicit state machine, not scattered booleans.
3. **Mic permission UX.** Mic permission is the single biggest friction point. Ask once, explain why, recover gracefully if denied.
4. **No surprises.** A user mid-rehearsal should never see an unexpected dialog, network spinner, or refresh.
5. **Accessibility.** Keyboard shortcuts for pause/resume/restart. Visible focus indicators. Sufficient contrast.

## Before you write code

1. Read `specs/voice-loop.md`, `specs/api-endpoints.md`, and `specs/data-model.md`.
2. Check `progress/CHANGELOG.md` for the last session's state.
3. Confirm the work is in the current `ROADMAP.md` phase.

## Tech and conventions

- Next.js App Router (not Pages Router), TypeScript strict mode.
- `@supabase/ssr` for Supabase client (not the deprecated `@supabase/auth-helpers-nextjs`).
- Tailwind for styling. Avoid new heavy UI libraries unless justified.
- One component, one file. Components stay small (< 200 lines as a rough target).
- Types for API responses live in `src/types/` and mirror backend Pydantic schemas. Keep them in sync — when the backend schema changes, the type changes.
- Voice logic is isolated in `src/lib/voice/`. Page components don't call `window.speechSynthesis` directly; they go through `tts.ts` / `stt.ts` / `session.ts`.

## Critical patterns

### Auth-protected routes

Wrap pages in `<AuthGuard>`. It checks the Supabase session and redirects to `/login` if missing.

```tsx
// app/upload/page.tsx
import AuthGuard from "@/components/AuthGuard";
import UploadPanel from "@/components/UploadPanel";

export default function UploadPage() {
  return (
    <AuthGuard>
      <UploadPanel />
    </AuthGuard>
  );
}
```

### API calls

All backend calls go through `src/lib/api.ts`. That module attaches the Bearer token and parses errors.

```ts
// src/lib/api.ts
import { supabase } from "./supabase";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL!;

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export async function uploadScript(file: File): Promise<{ script_id: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/scripts`, {
    method: "POST",
    headers: await authHeaders(),
    body: form,
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
}
```

### Voice loop isolation

The rehearsal page does not call `window.speechSynthesis.speak(...)` or instantiate `SpeechRecognition` directly. It uses the abstractions in `src/lib/voice/`. That keeps the voice logic testable and lets us swap to ElevenLabs later by replacing one module.

See `specs/voice-loop.md` for the state machine and exact interface.

### Browser detection

On first load of the rehearsal page, run a feature check:

```ts
// src/lib/voice/support.ts
export type VoiceSupport = {
  tts: boolean;
  stt: boolean;
  voices: number; // count of available voices
};

export function detectVoiceSupport(): VoiceSupport {
  const tts = typeof window !== "undefined" && "speechSynthesis" in window;
  const stt =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  const voices = tts ? window.speechSynthesis.getVoices().length : 0;
  return { tts, stt, voices };
}
```

If `stt` is false, the rehearsal page shows a "your browser doesn't support voice recognition" message and offers manual-advance mode.

### Mic permission

Request permission *before* the user hits "start rehearsal," not at the moment recognition would start. Show a clear explanation. If denied, offer manual-advance mode as a fallback (the user clicks a button to mark their line done).

## Things you should NOT do

- Do not put voice logic in components. It belongs in `src/lib/voice/`.
- Do not call the backend during the rehearsal loop. The script is loaded once at session start and held in memory.
- Do not store the JWT in localStorage manually; Supabase handles this.
- Do not send audio to the backend. Audio stays in the browser.
- Do not build a script library UI, sharing UI, or coach-view UI. Post-MVP.

## Testing expectations

For MVP: at minimum, a Playwright happy-path test (login → upload a tiny fixture PDF → wait for parsed → pick a character → see the rehearsal page render with the script). Voice itself is hard to test in CI; manual smoke tests in Chrome and Safari are acceptable for MVP.

## Operational checklist before merging

- [ ] Type definitions in `src/types/` match the backend schemas
- [ ] No `console.log` in committed code (use a logger if needed)
- [ ] Loading and error states for every async operation
- [ ] Keyboard navigation works on the rehearsal page (Space = pause/resume, R = restart line)
- [ ] `CHANGELOG.md` updated
