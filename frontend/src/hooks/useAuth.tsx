import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { api, networkError } from "../services/api";
import type { User } from "../types/api";
type Auth = {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
};
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setLoading] = useState(true);
  const logout = () => {
    for (const key of ["accessToken", "refreshToken", "user"])
      localStorage.removeItem(key);
    setUser(null);
  };
  useEffect(() => {
    let active = true;
    const restore = async () => {
      try {
        const cached = JSON.parse(
          localStorage.getItem("user") ?? "null",
        ) as User | null;
        if (!cached || !localStorage.getItem("accessToken")) return;
        if (active) setUser(cached);
        try {
          const { data } = await api.get<User>("/auth/me");
          if (active) setUser(data);
          localStorage.setItem("user", JSON.stringify(data));
        } catch (error) {
          if (!networkError(error) && active) logout();
        }
      } catch {
        logout();
      } finally {
        if (active) setLoading(false);
      }
    };
    void restore();
    const handler = () => logout();
    window.addEventListener("sams:logout", handler);
    return () => {
      active = false;
      window.removeEventListener("sams:logout", handler);
    };
  }, []);
  const login = async (email: string, password: string) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("accessToken", data.accessToken);
    localStorage.setItem("refreshToken", data.refreshToken);
    localStorage.setItem("user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user as User;
  };
  return (
    <Context.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("AuthProvider missing");
  return value;
}
export function home(role: User["role"]) {
  return role === "STUDENT"
    ? "/student/checkin"
    : role === "ADMIN"
      ? "/admin/courses"
      : "/examiner/dashboard";
}
