// src/utils/api.js
// Minimal fetch wrapper that attaches the stored JWT (if present).
// Returns the raw fetch Response so callers can decide how to handle errors.

const BASE_URL = "http://localhost:8000"; // change if your backend URL differs

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem("access_token");

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  // If unauthorized, clear stored token so the app can treat the user as logged out.
  if (res.status === 401) {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user_id");
  }

  return res;
}
