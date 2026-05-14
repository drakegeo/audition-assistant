export type ScriptStatus = "queued" | "parsing" | "ready" | "failed";
export type LineKind = "dialogue" | "stage_direction" | "scene_header";
export type CueMode = "pause" | "match" | "hybrid";

export interface Character {
  id: string;
  name: string;
  line_count: number;
  display_order: number;
}

export interface Line {
  id: string;
  sequence: number;
  kind: LineKind;
  character_id: string | null;
  text: string;
}

export interface Script {
  id: string;
  title: string;
  status: ScriptStatus;
  created_at: string;
  parsed_at: string | null;
  characters: Character[];
  lines: Line[];
}

export interface ScriptUploadResponse {
  script_id: string;
  status: string;
}

export interface ScriptStatusResponse {
  script_id: string;
  status: ScriptStatus;
  parse_error: string | null;
  progress_hint: string | null;
}
