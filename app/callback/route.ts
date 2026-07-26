import { handleAuth } from "@workos-inc/authkit-nextjs";

// WorkOS redirects here after authentication. handleAuth exchanges the code,
// seals the session cookie and redirects into the app.
export const GET = handleAuth({ returnPathname: "/projects" });
