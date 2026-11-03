"""Minimal FastAPI app for trying apidrifter. FastAPI generates the OpenAPI document at
/openapi.json from the type annotations below."""

from typing import Annotated

from fastapi import FastAPI, HTTPException, Path
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

app = FastAPI(title="Todos (FastAPI example)", version="1.0.0")


class Todo(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [{"id": 1, "title": "Write the spec", "completed": True, "due_date": "2026-11-10"}]
        }
    )
    id: int
    title: str
    completed: bool
    due_date: str = Field(json_schema_extra={"format": "date"})


class NewTodo(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={"examples": [{"title": "Ship the example", "due_date": "2026-11-20"}]}
    )
    title: str = Field(min_length=1)
    due_date: str | None = Field(default=None, json_schema_extra={"format": "date"})


class Error(BaseModel):
    error: str


# The "database". Rows may have no due date, which the Todo model above does not allow.
TODOS: list[dict] = [
    {"id": 1, "title": "Write the spec", "completed": True, "due_date": "2026-11-10"},
    {"id": 2, "title": "Check it against the server", "completed": False, "due_date": None},
]


@app.get("/health", operation_id="getHealth")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/todos", operation_id="listTodos", response_model=list[Todo])
def list_todos():
    # Returning a Response directly skips response_model validation. That is what lets a
    # null due_date reach the client while the spec says the field is a string: the
    # deliberate mismatch apidrifter reports as response-null-not-allowed.
    return JSONResponse(TODOS)


@app.get(
    "/todos/{todo_id}",
    operation_id="getTodo",
    response_model=Todo,
    responses={404: {"model": Error}},
)
def get_todo(todo_id: Annotated[int, Path(examples=[2])]):
    for row in TODOS:
        if row["id"] == todo_id:
            return JSONResponse(row)
    raise HTTPException(status_code=404, detail={"error": "not found"})


@app.post("/todos", operation_id="createTodo", response_model=Todo, status_code=201)
def create_todo(body: NewTodo) -> Todo:
    row = {
        "id": len(TODOS) + 1,
        "title": body.title,
        "completed": False,
        "due_date": body.due_date if body.due_date is not None else "2026-12-31",
    }
    TODOS.append(row)
    return Todo(**row)
