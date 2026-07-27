import {
  useNavigate as useRRNavigate,
  useParams as useRRParams,
  useLocation,
} from "react-router-dom";

export function useRouter() {
  const navigate = useRRNavigate();
  return {
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href, { replace: true }),
    back: () => navigate(-1),
    refresh: () => undefined,
    prefetch: async () => undefined,
  };
}

export function usePathname() {
  return useLocation().pathname;
}

export function useParams<T extends Record<string, string> = Record<string, string>>() {
  return useRRParams() as T;
}

export function useSearchParams() {
  const { search } = useLocation();
  return [new URLSearchParams(search), () => undefined] as const;
}

export function redirect(url: string) {
  window.location.href = url;
}

export function notFound() {
  throw new Error("Not found");
}
