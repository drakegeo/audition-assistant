from pydantic import BaseModel, field_validator


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


class ScriptListItem(BaseModel):
    id: str
    title: str
    status: str
    created_at: str
    parsed_at: str | None
    parse_error: str | None


class ScriptUpdateRequest(BaseModel):
    title: str

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Title cannot be empty")
        return v.strip()[:200]
