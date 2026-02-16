/**
 * ShellForge API client
 * All calls to the FastAPI backend go through here.
 */

const BASE = "http://localhost:8000/api/v1";

export async function fetchConnectors() {
  const res = await fetch(`${BASE}/connectors`);
  if (!res.ok) throw new Error("Failed to fetch connectors");
  return res.json();
}

export async function generateEnclosure(payload) {
  const res = await fetch(`${BASE}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Generation failed");
  }
  return res.json();
}

export function downloadUrl(jobId, part) {
  return `${BASE}/download/${jobId}/${part}`;
}
