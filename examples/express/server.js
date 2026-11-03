import express from "express";

const app = express();
app.use(express.json());

// The "database". Rows carry an ownerId that the hand-written openapi.yaml never declared;
// the Todo schema there has additionalProperties: false, so apidrifter reports it.
const todos = [
  { id: 1, title: "Write the spec", completed: true, dueDate: "2026-11-10", ownerId: "u_42" },
  {
    id: 2,
    title: "Check it against the server",
    completed: false,
    dueDate: "2026-11-12",
    ownerId: "u_42",
  },
];

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/todos", (_req, res) => {
  res.json(todos);
});

app.get("/todos/:id", (req, res) => {
  const todo = todos.find((t) => t.id === Number(req.params.id));
  if (todo === undefined) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(todo);
});

app.post("/todos", (req, res) => {
  const { title, dueDate } = req.body ?? {};
  if (typeof title !== "string" || title.length === 0) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  const todo = {
    id: todos.length + 1,
    title,
    completed: false,
    dueDate: typeof dueDate === "string" ? dueDate : "2026-12-31",
    ownerId: "u_42",
  };
  todos.push(todo);
  res.status(201).json(todo);
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`express example listening on http://localhost:${port}`);
});
