import type { Task, TaskPriority, TaskStage } from "@/types";

export const STAGES: Record<TaskStage, string> = {
  backlog: "İş Havuzu",
  todo: "Yapılacak",
  in_progress: "Devam Ediyor",
  in_review: "İncelemede",
  done: "Tamamlandı",
};

export const PRIORITIES: Record<TaskPriority, string> = {
  low: "Düşük", normal: "Normal", high: "Yüksek", urgent: "Acil",
};

export function stageOf(task: Task): TaskStage {
  return task.stage ?? (task.status === "completed" ? "done" : "todo");
}
