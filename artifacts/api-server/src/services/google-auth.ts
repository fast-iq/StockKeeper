export interface GoogleIdentityPayload {
  email?: string | null;
  email_verified?: boolean;
  name?: string | null;
  given_name?: string | null;
}

export type GoogleAuthResult<User> =
  | { status: "not_configured" }
  | { status: "invalid_credential"; error: unknown }
  | { status: "email_unverified" }
  | { status: "authenticated"; user: User; created: boolean };

export interface GoogleAuthDependencies<User> {
  verifyIdToken: (
    idToken: string,
    audience: string,
  ) => Promise<GoogleIdentityPayload | null | undefined>;
  findUserByEmail: (email: string) => Promise<User | undefined>;
  createUser: (user: { email: string; name: string }) => Promise<User>;
}

export async function resolveGoogleUser<User>(
  idToken: string,
  configuredClientId: string | undefined,
  dependencies: GoogleAuthDependencies<User>,
): Promise<GoogleAuthResult<User>> {
  const audience = configuredClientId?.trim();
  if (!audience) {
    return { status: "not_configured" };
  }

  let payload: GoogleIdentityPayload | null | undefined;
  try {
    payload = await dependencies.verifyIdToken(idToken, audience);
  } catch (error) {
    return { status: "invalid_credential", error };
  }

  if (!payload?.email || payload.email_verified !== true) {
    return { status: "email_unverified" };
  }

  const email = payload.email.toLowerCase();
  const existingUser = await dependencies.findUserByEmail(email);
  if (existingUser) {
    return { status: "authenticated", user: existingUser, created: false };
  }

  const name =
    payload.name?.trim() ||
    payload.given_name?.trim() ||
    email.split("@")[0] ||
    "Google user";
  const user = await dependencies.createUser({ email, name });

  return { status: "authenticated", user, created: true };
}
