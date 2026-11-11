import { useCallback, useEffect, useState } from "react";
import { api, message, networkError } from "../services/api";
import { saveSnapshot, loadSnapshot } from "../services/offline";
import { useAuth } from "./useAuth";
export function useLoad<T>(url: string, poll = 0) {
  const { user } = useAuth();
  const owner = user?.id;
  const cache = user?.role === "STUDENT" && url.startsWith("/student/");
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    try {
      const response = await api.get<T>(url);
      setData(response.data);
      setError("");
      if (cache && owner)
        await saveSnapshot(owner, url, response.data).catch(() => {});
    } catch (e) {
      setError(message(e));
      if (cache && owner && networkError(e)) {
        const saved = await loadSnapshot<T>(owner, url).catch(() => null);
        if (saved) setData(saved);
      }
    } finally {
      setLoading(false);
    }
  }, [url, owner, cache]);
  useEffect(() => {
    setData(null);
    setLoading(true);
    void reload();
    const timer = poll ? setInterval(() => void reload(), poll) : undefined;
    return () => clearInterval(timer);
  }, [reload, poll]);
  return { data, error, loading, reload };
}
export function formatTime(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    timeZone: "Africa/Kampala",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
