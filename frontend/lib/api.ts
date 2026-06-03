import { TaskStatusResponse, ScorecardResponse } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function uploadDocument(file: File): Promise<{ task_id: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTaskStatus(taskId: string): Promise<TaskStatusResponse> {
  const res = await fetch(`${API_BASE}/api/tasks/${taskId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getScorecard(taskId: string): Promise<ScorecardResponse> {
  const res = await fetch(`${API_BASE}/api/scorecards/${taskId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
