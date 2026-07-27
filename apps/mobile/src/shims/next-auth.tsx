import { signOutLocal, setDeviceToken } from "./auth-store";

export { SessionProvider, useSession, signIn } from "./auth-store";

export async function signOut(opts?: { callbackUrl?: string }) {
  setDeviceToken(null);
  signOutLocal();
  if (opts?.callbackUrl) {
    window.location.hash = `#${opts.callbackUrl.startsWith("/") ? opts.callbackUrl : `/${opts.callbackUrl}`}`;
  } else {
    window.location.hash = "#/login";
  }
  window.location.reload();
}
