// Display projection only. Server rules decide authorization and attendance.
export function dayModel(classes, weekly, now) {
  const active = classes.filter(
    (s) => Date.parse(s.startTime) <= now && now < Date.parse(s.endTime),
  );
  const future = classes
    .filter((s) => Date.parse(s.startTime) > now)
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
  const planned = weekly.filter((s) => Date.parse(s.endTime) > now);
  return {
    active,
    target: active.length === 1 ? active[0] : null,
    conflict: active.length > 1,
    current: active.length
      ? active
      : planned.filter((s) => Date.parse(s.startTime) <= now),
    next:
      [...future, ...planned.filter((s) => Date.parse(s.startTime) > now)].sort(
        (a, b) =>
          Date.parse(a.startTime) - Date.parse(b.startTime) ||
          (a.kind === "REFERENCE" ? 1 : 0) - (b.kind === "REFERENCE" ? 1 : 0),
      )[0] || null,
  };
}
export function eventProgress(event, now) {
  const start = Date.parse(event.startTime),
    end = Date.parse(event.endTime);
  return {
    percent: Math.max(0, Math.min(100, (100 * (now - start)) / (end - start))),
    minutes: Math.max(
      0,
      Math.ceil((now < start ? start - now : end - now) / 60000),
    ),
    ongoing: start <= now && now < end,
  };
}
