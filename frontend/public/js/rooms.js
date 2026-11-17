import { api } from "./api.js";
import { $, init, escape, showError, notice } from "./common.js";
const user = await init(["ADMIN"]);
let rows = [],
  selected = null,
  offset = 0;
async function load() {
  try {
    const q = new URLSearchParams({
      search: $("#room-search").value,
      limit: "50",
      offset: String(offset),
    });
    if ($("#room-status").value) q.set("status", $("#room-status").value);
    rows = await api("/admin/rooms?" + q);
    $("#room-count").textContent =
      `${rows.length} rooms shown, starting at ${offset + 1}.`;
    $("#room-list").innerHTML =
      rows
        .map(
          (r, i) =>
            `<article class="card"><h3>${escape(r.name)}</h3><p>${escape(r.code)} · ${escape(r.reviewStatus)} · ${r.isActive ? "Available" : "Inactive"}</p><p>${escape(r.campus || "Campus unconfirmed")} · ${escape(r.building || "Building unconfirmed")} · ${r.capacity ? escape(r.capacity) + " places" : "Capacity unconfirmed"}</p><button data-room="${i}">Review ${escape(r.name)}</button></article>`,
        )
        .join("") || "<p>No matching rooms.</p>";
    $("#room-previous").disabled = offset === 0;
    $("#room-next").disabled = rows.length < 50;
    for (const button of document.querySelectorAll("[data-room]"))
      button.onclick = () => edit(rows[Number(button.dataset.room)]);
  } catch (error) {
    showError(error);
  }
}
function edit(room) {
  selected = room?.id || null;
  $("#room-form").reset();
  $("#room-form-title").textContent = selected ? "Review room" : "Add a room";
  if (room)
    for (const [key, id] of [
      ["code", "code"],
      ["name", "name"],
      ["campus", "campus"],
      ["building", "building"],
      ["roomType", "type"],
      ["capacity", "capacity"],
      ["reviewStatus", "review"],
      ["sourceNote", "source"],
    ])
      $("#room-" + id).value = room[key] ?? "";
  $("#room-aliases").value = room?.aliases.join("\n") || "";
  $("#room-active").checked = !!room?.isActive;
}
if (user) {
  $("#room-search-button").onclick = () => {
    offset = 0;
    void load();
  };
  $("#room-previous").onclick = () => {
    offset = Math.max(0, offset - 50);
    void load();
  };
  $("#room-next").onclick = () => {
    offset += 50;
    void load();
  };
  $("#room-new").onclick = () => edit(null);
  $("#room-form").onsubmit = async (event) => {
    event.preventDefault();
    try {
      const value = (id) => $("#room-" + id).value.trim();
      await api("/admin/rooms" + (selected ? "/" + selected : ""), {
        method: selected ? "PATCH" : "POST",
        body: {
          code: value("code"),
          name: value("name"),
          campus: value("campus") || null,
          building: value("building") || null,
          roomType: value("type"),
          capacity: value("capacity") ? Number(value("capacity")) : null,
          aliases: value("aliases")
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          reviewStatus: value("review"),
          isActive: $("#room-active").checked,
          sourceNote: value("source"),
          reason: value("reason"),
        },
      });
      notice("Room saved.");
      edit(null);
      await load();
    } catch (error) {
      showError(error);
    }
  };
  await load();
}
