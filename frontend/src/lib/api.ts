const isDev = process.env.NODE_ENV === 'development';
const fallbackApiBaseUrl = isDev ? "http://localhost:3000" : "https://egin-api.perricheno.ru";

export const apiBaseUrl =
  (process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "") ||
  fallbackApiBaseUrl;

export const apiUrl = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${apiBaseUrl}${normalizedPath}`;
};
