const demoMode = Boolean(import.meta.env?.DEV && import.meta.env?.VITE_DEMO_MODE === "true");
let csrfTokenRequest;

function csrfCookieValue() {
  for (const name of ["__Host-monitoring_csrf", "monitoring_csrf"]) {
    const prefix = `${name}=`;
    const item = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix));
    if (item) return decodeURIComponent(item.slice(prefix.length));
  }
  return "";
}

async function getCsrfToken() {
  const existing = csrfCookieValue();
  if (existing) return existing;
  csrfTokenRequest ||= fetch("/api/auth/csrf", { cache: "no-store", credentials: "same-origin" })
    .then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw Object.assign(new Error(result.error || `Request failed (${response.status})`), {
          status: response.status,
        });
      return result.csrfToken || csrfCookieValue();
    })
    .finally(() => {
      csrfTokenRequest = null;
    });
  return csrfTokenRequest;
}

export async function apiFetch(input, init = {}) {
  const requestUrl = input instanceof Request ? input.url : input;
  const url = new URL(requestUrl, window.location.href);
  const isApiRequest = url.origin === window.location.origin && url.pathname.startsWith("/api/");
  if (demoMode && isApiRequest) throw new Error("Demo mode is read-only and does not use the live API.");

  const method = String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  const isMutation = !["GET", "HEAD", "OPTIONS"].includes(method);
  const csrfExempt = url.pathname === "/api/site/login" || url.pathname.startsWith("/api/esp/");
  let response;
  if (!isApiRequest || !isMutation || csrfExempt) response = await fetch(input, init);
  else {
    const token = await getCsrfToken();
    if (!token) throw new Error("Could not establish request security token. Refresh the page and sign in again.");
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers || {}).forEach((value, name) => headers.set(name, value));
    headers.set("X-CSRF-Token", token);
    response = await fetch(input, { ...init, credentials: init.credentials || "same-origin", headers });
  }
  if (isApiRequest && response.status === 401 && !url.pathname.startsWith("/api/site/"))
    window.dispatchEvent(new CustomEvent("app:session-expired"));
  return response;
}
