import { cachedUser } from "./api.js";
// Also supports an older cached page module during a service-worker transition.
// This is a visual readiness gate; API authorization remains server-side.
function revealReadyPage() {
  const content = document.querySelector("[data-page-content]");
  if (!content) return;
  const header = document.querySelector("#site-header");
  const login = document.querySelector("#login-form");
  const ready = header
    ? document.body.classList.contains("workspace") && !header.hidden
    : login?.onsubmit && !cachedUser();
  if (!ready) return;
  content.hidden = false;
  const loading = document.querySelector("#page-loading");
  if (loading) loading.hidden = true;
  observer.disconnect();
}
const observer = new MutationObserver(revealReadyPage);
observer.observe(document.documentElement, {
  subtree: true,
  attributes: true,
  attributeFilter: ["class", "hidden"],
  childList: true,
});
addEventListener("load", revealReadyPage, { once: true });
revealReadyPage();
