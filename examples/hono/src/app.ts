import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

// The schema says priority is low, medium or high. The store has grown an "urgent" value
// that nobody added to the enum: that is the deliberate mismatch apidrifter reports.
const PrioritySchema = z.enum(["low", "medium", "high"]).openapi("Priority");

const TodoSchema = z
  .object({
    id: z.number().int().openapi({ example: 1 }),
    title: z.string().openapi({ example: "Write the spec" }),
    completed: z.boolean().openapi({ example: false }),
    priority: PrioritySchema,
  })
  .openapi("Todo");

const NewTodoSchema = z
  .object({
    title: z.string().min(1).openapi({ example: "Ship the example" }),
    priority: PrioritySchema.default("medium"),
  })
  // A whole-body example lets `apidrifter run` send the request without a filled plan.
  .openapi("NewTodo", { example: { title: "Ship the example", priority: "high" } });

const ErrorSchema = z
  .object({ error: z.string().openapi({ example: "not found" }) })
  .openapi("Error");

interface Row {
  id: number;
  title: string;
  completed: boolean;
  priority: string;
}

const todos: Row[] = [
  { id: 1, title: "Write the spec", completed: true, priority: "high" },
  { id: 2, title: "Check it against the server", completed: false, priority: "urgent" },
];

const IdParam = z.object({
  id: z
    .string()
    .regex(/^\d+$/)
    .openapi({ param: { name: "id", in: "path" }, example: "2" }),
});

export const app = new OpenAPIHono();

app.openapi(
  createRoute({
    method: "get",
    path: "/health",
    operationId: "getHealth",
    responses: {
      200: {
        description: "The service is up",
        content: { "application/json": { schema: z.object({ status: z.literal("ok") }) } },
      },
    },
  }),
  (c) => c.json({ status: "ok" as const }, 200),
);

app.openapi(
  createRoute({
    method: "get",
    path: "/todos",
    operationId: "listTodos",
    responses: {
      200: {
        description: "All todos",
        content: { "application/json": { schema: z.array(TodoSchema) } },
      },
    },
  }),
  (c) => c.json(todos as z.infer<typeof TodoSchema>[], 200),
);

app.openapi(
  createRoute({
    method: "get",
    path: "/todos/{id}",
    operationId: "getTodo",
    request: { params: IdParam },
    responses: {
      200: { description: "The todo", content: { "application/json": { schema: TodoSchema } } },
      404: {
        description: "No todo with that id",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  (c) => {
    const { id } = c.req.valid("param");
    const todo = todos.find((t) => t.id === Number(id));
    if (todo === undefined) return c.json({ error: "not found" }, 404);
    return c.json(todo as z.infer<typeof TodoSchema>, 200);
  },
);

app.openapi(
  createRoute({
    method: "post",
    path: "/todos",
    operationId: "createTodo",
    request: { body: { content: { "application/json": { schema: NewTodoSchema } } } },
    responses: {
      201: {
        description: "The created todo",
        content: { "application/json": { schema: TodoSchema } },
      },
    },
  }),
  (c) => {
    const body = c.req.valid("json");
    const todo: Row = {
      id: todos.length + 1,
      title: body.title,
      completed: false,
      priority: body.priority,
    };
    todos.push(todo);
    return c.json(todo as z.infer<typeof TodoSchema>, 201);
  },
);

export const openapiConfig = {
  openapi: "3.0.0",
  info: { title: "Todos (Hono example)", version: "1.0.0" },
};

app.doc("/openapi.json", openapiConfig);
