import { ApiProperty } from "@nestjs/swagger";

export class TodoDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: "Write the spec" })
  title!: string;

  @ApiProperty({ example: false })
  completed!: boolean;

  // @ApiProperty marks a property required unless told otherwise. The service only sets
  // dueDate when it has one, so some responses omit it: the deliberate mismatch apidrifter
  // reports as response-missing-required-property.
  @ApiProperty({ example: "2026-11-10", format: "date" })
  dueDate!: string;
}

export class NewTodoDto {
  @ApiProperty({ example: "Ship the example", minLength: 1 })
  title!: string;

  @ApiProperty({ example: "2026-11-20", format: "date", required: false })
  dueDate?: string;
}

export class ErrorDto {
  @ApiProperty({ example: "not found" })
  error!: string;
}
