// The words of an error for a status line or a transported result. An Error keeps its message; a plain object (an
// Owlbear rejection, an IndexedDB or transport payload) is shown as JSON instead of "[object Object]".
export function describeError(error, fallback = "Errore sconosciuto.") {
  if (typeof error === "string") return error || fallback;
  const message = error?.message;
  if (typeof message === "string" && message) return message;
  if (message && typeof message === "object") return describeError(message, fallback);
  if (error && typeof error === "object") {
    try {
      const json = JSON.stringify(error);
      if (json && json !== "{}") return json.slice(0, 500);
    } catch {}
    const name = String(error.name || error.constructor?.name || "").trim();
    return name && name !== "Object" ? name : fallback;
  }
  return error === undefined || error === null ? fallback : String(error) || fallback;
}
