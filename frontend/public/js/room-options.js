import { api } from "./api.js";
// Suggestions supplement existing free text while reference venues are reviewed.
export async function roomOptions(input) {
  if (!input) return;
  try {
    const rooms = await api("/rooms?limit=200");
    const list = document.createElement("datalist");
    list.id = input.id + "-options";
    for (const room of rooms) {
      const option = document.createElement("option");
      option.value = room.name;
      option.label = [room.campus, room.building].filter(Boolean).join(" · ");
      list.append(option);
    }
    input.setAttribute("list", list.id);
    input.after(list);
  } catch {
    /* Existing venue entry remains available if catalogue retrieval fails. */
  }
}
