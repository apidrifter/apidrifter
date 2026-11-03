import swagger from "@fastify/swagger";
import Fastify from "fastify";

const Todo = {
  $id: "Todo",
  type: "object",
  required: ["id", "title", "completed"],
  properties: {
    id: { type: "integer", examples: [1] },
    title: { type: "string", examples: ["Write the spec"] },
    completed: { type: "boolean", examples: [false] },
  },
};

const NewTodo = {
  $id: "NewTodo",
  type: "object",
  required: ["title"],
  properties: { title: { type: "string", minLength: 1 } },
  // A whole-body example lets `apidrifter run` send the request without a filled plan.
  examples: [{ title: "Ship the example" }],
};

const ErrorBody = {
  $id: "Error",
  type: "object",
  required: ["error"],
  properties: { error: { type: "string", examples: ["not found"] } },
};

const todos = [
  { id: 1, title: "Write the spec", completed: true },
  { id: 2, title: "Check it against the server", completed: false },
];

export async function build() {
  const app = Fastify();
  await app.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: { title: "Todos (Fastify example)", version: "1.0.0" },
    },
  });
  app.addSchema(Todo);
  app.addSchema(NewTodo);
  app.addSchema(ErrorBody);

  app.get("/openapi.json", { schema: { hide: true } }, async () => app.swagger());

  app.get(
    "/health",
    {
      schema: {
        operationId: "getHealth",
        response: {
          200: {
            type: "object",
            required: ["status"],
            properties: { status: { type: "string", enum: ["ok"] } },
          },
        },
      },
    },
    async () => ({ status: "ok" }),
  );

  app.get(
    "/todos",
    {
      schema: {
        operationId: "listTodos",
        response: { 200: { type: "array", items: { $ref: "Todo#" } } },
      },
    },
    async () => todos,
  );

  app.get(
    "/todos/:id",
    {
      schema: {
        operationId: "getTodo",
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "integer", examples: [1] } },
        },
        response: { 200: { $ref: "Todo#" }, 404: { $ref: "Error#" } },
      },
    },
    async (request, reply) => {
      const todo = todos.find((t) => t.id === request.params.id);
      if (todo === undefined) return reply.code(404).send({ error: "not found" });
      return todo;
    },
  );

  // The schema documents a 200 for the create operation; the handler sends 201, which is the
  // deliberate mismatch apidrifter reports as undocumented-status.
  app.post(
    "/todos",
    {
      schema: {
        operationId: "createTodo",
        body: { $ref: "NewTodo#" },
        response: { 200: { $ref: "Todo#" } },
      },
    },
    async (request, reply) => {
      const todo = { id: todos.length + 1, title: request.body.title, completed: false };
      todos.push(todo);
      return reply.code(201).send(todo);
    },
  );

  await app.ready();
  return app;
}
