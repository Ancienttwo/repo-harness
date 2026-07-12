const ALLOWED_STATUSES = new Set(["running", "succeeded", "failed"]);

export function createExportController(initial) {
  if (!initial || !ALLOWED_STATUSES.has(initial.status)) {
    throw new Error("A valid export state is required");
  }

  let state = { ...initial };

  return {
    getState() {
      return { ...state };
    },

    availableActions() {
      return [];
    },

    retry() {
      return { ok: false, reason: "not_available" };
    },

    complete(status) {
      if (state.status !== "running" || !["succeeded", "failed"].includes(status)) {
        return { ok: false, reason: "not_running" };
      }
      state = { ...state, status };
      return { ok: true, state: { ...state } };
    },

    render() {
      const status = state.status === "failed" ? "Export failed" : state.status === "running" ? "Export running" : "Export ready";
      return `<article data-export-id="${escapeHtml(state.id)}"><strong>${escapeHtml(state.filename)}</strong><span class="status">${status}</span></article>`;
    }
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
