// The first full page load of "/" in a browser tab opens Welcome. In-app links to "/"
// and reloads later in the same tab keep the planner, so there is no redirect loop.
export const WELCOME_SESSION_KEY = "tpva-welcome-entry";

export function welcomeEntryRedirect(location, getStorage) {
  let seen = true;
  try {
    const storage = getStorage();
    seen = storage.getItem(WELCOME_SESSION_KEY) === "1";
    storage.setItem(WELCOME_SESSION_KEY, "1");
  } catch {
    return null; // Storage unavailable: never redirect, so the planner stays reachable.
  }
  if (seen || location.pathname !== "/") return null;
  return `/welcome${location.search || ""}${location.hash || ""}`;
}
