from pydantic import BaseModel


class ScriptUploadResponse(BaseModel):
    script_id: str
    status: str


class ScriptStatusResponse(BaseModel):
    script_id: str
    status: str
    parse_error: str | None = None
    progress_hint: str | None = None


class CharacterResponse(BaseModel):
    id: str
    name: str
    line_count: int
    display_order: int


class LineResponse(BaseModel):
    id: str
    sequence: int
    kind: str
    character_id: str | None
    text: str


class ScriptResponse(BaseModel):
    id: str
    title: str
    status: str
    created_at: str
    parsed_at: str | None
    characters: list[CharacterResponse]
    lines: list[LineResponse]
