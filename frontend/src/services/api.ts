import axios from "axios";
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  timeout: 10000,
});
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
let refresh: Promise<string> | null = null;
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config;
    if (
      error.response?.status !== 401 ||
      !request ||
      request._retry ||
      ["/auth/login", "/auth/refresh"].includes(request.url)
    )
      throw error;
    request._retry = true;
    try {
      if (!refresh) {
        refresh = axios
          .post(`${api.defaults.baseURL}/auth/refresh`, {
            refreshToken: localStorage.getItem("refreshToken"),
          })
          .then(({ data }) => {
            localStorage.setItem("accessToken", data.accessToken);
            localStorage.setItem("refreshToken", data.refreshToken);
            localStorage.setItem("user", JSON.stringify(data.user));
            return data.accessToken as string;
          })
          .finally(() => {
            refresh = null;
          });
      }
      const token = await refresh;
      request.headers.Authorization = `Bearer ${token}`;
      return api(request);
    } catch (failure) {
      // A network failure is not evidence that credentials have been revoked.
      if (axios.isAxiosError(failure) && failure.response?.status === 401)
        window.dispatchEvent(new Event("sams:logout"));
      throw failure;
    }
  },
);
export function message(error: unknown): string {
  if (axios.isAxiosError(error))
    return (
      error.response?.data?.message ??
      (error.response
        ? "The request could not be completed."
        : "Unable to reach SAMS. Check your connection.")
    );
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
export function networkError(error: unknown) {
  return axios.isAxiosError(error) && !error.response;
}
