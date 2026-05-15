const CHARS_PER_SECOND = 15;
const TIMEOUT_BUFFER_MS = 3000;
const MAX_CHUNK_CHARS = 200;

function chunkText(text: string): string[] {
  // [voice-loop.md] Chrome onend doesn't fire for long utterances — chunk at sentence boundaries
  if (text.length <= MAX_CHUNK_CHARS) return [text];
  const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + sentence).length > MAX_CHUNK_CHARS && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text];
}

export function speakLine(
  text: string,
  voice: SpeechSynthesisVoice,
  onEnd: () => void,
  rate = 0.80,
  pitch = 1.0,
): () => void {
  const chunks = chunkText(text);
  let chunkIndex = 0;
  let cancelled = false;

  function speakNext() {
    if (cancelled || chunkIndex >= chunks.length) {
      if (!cancelled) onEnd();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(chunks[chunkIndex++]);
    utterance.voice = voice;
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.onend = speakNext;
    window.speechSynthesis.speak(utterance);
  }

  speakNext();
  return () => {
    cancelled = true;
    window.speechSynthesis.cancel();
  };
}

export function durationEstimateMs(text: string): number {
  return Math.min(text.length / CHARS_PER_SECOND, 60) * 1000 + TIMEOUT_BUFFER_MS;
}
