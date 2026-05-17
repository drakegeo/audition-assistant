export type Gender = "female" | "male";

export interface EdgeVoice {
  id: string;
  name: string;       // display name, e.g. "Jenny"
  lang: string;
  langLabel: string;
  gender: Gender;
}

export const VOICES_BY_LANG: Record<string, {
  label: string;
  females: EdgeVoice[];
  males: EdgeVoice[];
}> = {
  "en-US": {
    label: "English (US)",
    females: [
      { id: "en-US-JennyNeural",       name: "Jenny",       lang: "en-US", langLabel: "English (US)", gender: "female" },
      { id: "en-US-AvaNeural",         name: "Ava",         lang: "en-US", langLabel: "English (US)", gender: "female" },
      { id: "en-US-AriaNeural",        name: "Aria",        lang: "en-US", langLabel: "English (US)", gender: "female" },
      { id: "en-US-EmmaNeural",        name: "Emma",        lang: "en-US", langLabel: "English (US)", gender: "female" },
      { id: "en-US-MichelleNeural",    name: "Michelle",    lang: "en-US", langLabel: "English (US)", gender: "female" },
    ],
    males: [
      { id: "en-US-GuyNeural",         name: "Guy",         lang: "en-US", langLabel: "English (US)", gender: "male" },
      { id: "en-US-AndrewNeural",      name: "Andrew",      lang: "en-US", langLabel: "English (US)", gender: "male" },
      { id: "en-US-BrianNeural",       name: "Brian",       lang: "en-US", langLabel: "English (US)", gender: "male" },
      { id: "en-US-ChristopherNeural", name: "Christopher", lang: "en-US", langLabel: "English (US)", gender: "male" },
      { id: "en-US-EricNeural",        name: "Eric",        lang: "en-US", langLabel: "English (US)", gender: "male" },
      { id: "en-US-RogerNeural",       name: "Roger",       lang: "en-US", langLabel: "English (US)", gender: "male" },
      { id: "en-US-SteffanNeural",     name: "Steffan",     lang: "en-US", langLabel: "English (US)", gender: "male" },
    ],
  },
  "en-GB": {
    label: "English (UK)",
    females: [
      { id: "en-GB-SoniaNeural",  name: "Sonia",  lang: "en-GB", langLabel: "English (UK)", gender: "female" },
      { id: "en-GB-LibbyNeural",  name: "Libby",  lang: "en-GB", langLabel: "English (UK)", gender: "female" },
      { id: "en-GB-MaisieNeural", name: "Maisie", lang: "en-GB", langLabel: "English (UK)", gender: "female" },
    ],
    males: [
      { id: "en-GB-RyanNeural",   name: "Ryan",   lang: "en-GB", langLabel: "English (UK)", gender: "male" },
      { id: "en-GB-ThomasNeural", name: "Thomas", lang: "en-GB", langLabel: "English (UK)", gender: "male" },
    ],
  },
  "el-GR": {
    label: "Greek",
    females: [
      { id: "el-GR-AthinaNeural",   name: "Athina",   lang: "el-GR", langLabel: "Greek", gender: "female" },
    ],
    males: [
      { id: "el-GR-NestorasNeural", name: "Nestoras", lang: "el-GR", langLabel: "Greek", gender: "male" },
    ],
  },
  "tr-TR": {
    label: "Turkish",
    females: [
      { id: "tr-TR-EmelNeural",  name: "Emel",  lang: "tr-TR", langLabel: "Turkish", gender: "female" },
    ],
    males: [
      { id: "tr-TR-AhmetNeural", name: "Ahmet", lang: "tr-TR", langLabel: "Turkish", gender: "male" },
    ],
  },
  "nl-NL": {
    label: "Dutch",
    females: [
      { id: "nl-NL-FennaNeural",    name: "Fenna",    lang: "nl-NL", langLabel: "Dutch", gender: "female" },
      { id: "nl-NL-ColetteNeural",  name: "Colette",  lang: "nl-NL", langLabel: "Dutch", gender: "female" },
    ],
    males: [
      { id: "nl-NL-MaartenNeural",  name: "Maarten",  lang: "nl-NL", langLabel: "Dutch", gender: "male" },
    ],
  },
  "es-ES": {
    label: "Spanish",
    females: [
      { id: "es-ES-ElviraNeural",  name: "Elvira",  lang: "es-ES", langLabel: "Spanish", gender: "female" },
      { id: "es-ES-XimenaNeural",  name: "Ximena",  lang: "es-ES", langLabel: "Spanish", gender: "female" },
    ],
    males: [
      { id: "es-ES-AlvaroNeural",  name: "Alvaro",  lang: "es-ES", langLabel: "Spanish", gender: "male" },
    ],
  },
  "pt-PT": {
    label: "Portuguese",
    females: [
      { id: "pt-PT-RaquelNeural",  name: "Raquel",  lang: "pt-PT", langLabel: "Portuguese", gender: "female" },
    ],
    males: [
      { id: "pt-PT-DuarteNeural",  name: "Duarte",  lang: "pt-PT", langLabel: "Portuguese", gender: "male" },
    ],
  },
};

/** Flat list of all voices. */
export const ALL_VOICES: EdgeVoice[] = Object.values(VOICES_BY_LANG).flatMap(
  ({ females, males }) => [...females, ...males]
);

export const VOICE_MAP = new Map(ALL_VOICES.map((v) => [v.id, v]));

/** Get the female and male voice lists for a language, falling back to en-US. */
export function getVoicesForLang(lang: string) {
  return VOICES_BY_LANG[lang] ?? VOICES_BY_LANG["en-US"];
}

/** Look up a single voice by ID. */
export function getVoiceById(id: string): EdgeVoice | undefined {
  return VOICE_MAP.get(id);
}

/** Get the first voice for a language + gender (used as fallback). */
export function getDefaultVoiceId(lang: string, gender: Gender): string {
  const entry = getVoicesForLang(lang);
  const voices = gender === "female" ? entry.females : entry.males;
  return (voices[0] ?? ALL_VOICES[0]).id;
}

/**
 * Assign a distinct voice ID to each character, cycling through all available
 * voices for the language (interleaving female/male so adjacent chars differ).
 * Returns Map<characterId, voiceId>.
 */
export function assignDefaultVoiceIds(
  chars: { id: string; name: string }[],
  lang: string
): Map<string, string> {
  const { females, males } = getVoicesForLang(lang);
  // Interleave: F M F M … so the first two chars sound different
  const pool: EdgeVoice[] = [];
  const maxLen = Math.max(females.length, males.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < females.length) pool.push(females[i]);
    if (i < males.length)   pool.push(males[i]);
  }
  const map = new Map<string, string>();
  chars.forEach((c, i) => { map.set(c.id, pool[i % pool.length].id); });
  return map;
}
