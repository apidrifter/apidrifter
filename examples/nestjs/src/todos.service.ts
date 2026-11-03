import { Injectable } from "@nestjs/common";

export interface Todo {
  id: number;
  title: string;
  completed: boolean;
  dueDate?: string;
}

@Injectable()
export class TodosService {
  private readonly todos: Todo[] = [
    { id: 1, title: "Write the spec", completed: true, dueDate: "2026-11-10" },
    { id: 2, title: "Check it against the server", completed: false },
  ];

  list(): Todo[] {
    return this.todos;
  }

  get(id: number): Todo | undefined {
    return this.todos.find((t) => t.id === id);
  }

  create(title: string, dueDate?: string): Todo {
    const todo: Todo = { id: this.todos.length + 1, title, completed: false };
    if (dueDate !== undefined) todo.dueDate = dueDate;
    this.todos.push(todo);
    return todo;
  }
}
