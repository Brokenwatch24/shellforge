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

export async function importModel(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/import`, { method: "POST", body: form });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.detail || "Import failed");
  }
  return res.json();
}

export function downloadUrl(jobId, part) {
  return `${BASE}/download/${jobId}/${part}`;
}

export function download3mfUrl(jobId, part) {
  return `${BASE}/download/${jobId}/${part}/3mf`;
}

export async function searchLibrary(q = '', category = '') {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  const res = await fetch(`${BASE}/library/search?${params}`);
  if (!res.ok) throw new Error("Library search failed");
  return res.json();
}

export async function fetchCategories() {
  const res = await fetch(`${BASE}/library/categories`);
  if (!res.ok) throw new Error("Failed to fetch categories");
  return res.json();
}
