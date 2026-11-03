import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiParam, ApiResponse } from "@nestjs/swagger";
import { ErrorDto, NewTodoDto, TodoDto } from "./todo.dto";
import { type Todo, TodosService } from "./todos.service";

@Controller()
export class TodosController {
  constructor(private readonly todos: TodosService) {}

  @Get("health")
  @ApiOperation({ operationId: "getHealth", summary: "Liveness check" })
  @ApiResponse({ status: 200, schema: { type: "object", required: ["status"], properties: { status: { type: "string", enum: ["ok"] } } } })
  health(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("todos")
  @ApiOperation({ operationId: "listTodos", summary: "List todos" })
  @ApiResponse({ status: 200, type: TodoDto, isArray: true })
  list(): Todo[] {
    return this.todos.list();
  }

  @Get("todos/:id")
  @ApiOperation({ operationId: "getTodo", summary: "Fetch one todo" })
  @ApiParam({ name: "id", type: "integer", example: 2 })
  @ApiResponse({ status: 200, type: TodoDto })
  @ApiResponse({ status: 404, type: ErrorDto })
  get(@Param("id", ParseIntPipe) id: number): Todo {
    const todo = this.todos.get(id);
    if (todo === undefined) throw new NotFoundException({ error: "not found" });
    return todo;
  }

  @Post("todos")
  @HttpCode(201)
  @ApiOperation({ operationId: "createTodo", summary: "Create a todo" })
  // A whole-body example lets `apidrifter run` send the request without a filled plan.
  @ApiBody({
    type: NewTodoDto,
    examples: { default: { value: { title: "Ship the example", dueDate: "2026-11-20" } } },
  })
  @ApiResponse({ status: 201, type: TodoDto })
  @ApiResponse({ status: 400, type: ErrorDto })
  create(@Body() body: NewTodoDto): Todo {
    if (typeof body?.title !== "string" || body.title.length === 0) {
      throw new BadRequestException({ error: "title is required" });
    }
    return this.todos.create(body.title, body.dueDate);
  }
}
