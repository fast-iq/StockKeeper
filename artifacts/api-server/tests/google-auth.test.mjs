import assert from "node:assert/strict";
import { test } from "node:test";

import { GoogleLoginBody } from "../../../lib/api-zod/src/generated/api.ts";
import { resolveGoogleUser } from "../src/services/google-auth.ts";

const validProfile = {
  email: "Warehouse.User@example.com",
  email_verified: true,
  name: "Warehouse User",
};

function createDependencies(overrides = {}) {
  const calls = {
    verification: [],
    lookups: [],
    created: [],
  };

  return {
    calls,
    dependencies: {
      verifyIdToken: async (idToken, audience) => {
        calls.verification.push({ idToken, audience });
        return validProfile;
      },
      findUserByEmail: async (email) => {
        calls.lookups.push(email);
        return undefined;
      },
      createUser: async (user) => {
        calls.created.push(user);
        return { id: 42, ...user };
      },
      ...overrides,
    },
  };
}

test("requires a non-empty Google ID token in the login API body", () => {
  assert.equal(
    GoogleLoginBody.safeParse({ idToken: "valid-token" }).success,
    true,
  );
  assert.equal(GoogleLoginBody.safeParse({ idToken: "" }).success, false);
  assert.equal(GoogleLoginBody.safeParse({}).success, false);
});

test("does not call Google or the database when the server client ID is missing", async () => {
  const { calls, dependencies } = createDependencies();

  const result = await resolveGoogleUser("id-token", "   ", dependencies);

  assert.deepEqual(result, { status: "not_configured" });
  assert.deepEqual(calls, { verification: [], lookups: [], created: [] });
});

test("verifies the credential against the configured audience and creates a normalized user", async () => {
  const { calls, dependencies } = createDependencies();

  const result = await resolveGoogleUser(
    "valid-token",
    " google-client-id ",
    dependencies,
  );

  assert.deepEqual(calls.verification, [
    { idToken: "valid-token", audience: "google-client-id" },
  ]);
  assert.deepEqual(calls.lookups, ["warehouse.user@example.com"]);
  assert.deepEqual(calls.created, [
    { email: "warehouse.user@example.com", name: "Warehouse User" },
  ]);
  assert.deepEqual(result, {
    status: "authenticated",
    user: {
      id: 42,
      email: "warehouse.user@example.com",
      name: "Warehouse User",
    },
    created: true,
  });
});

test("uses the existing account instead of creating a duplicate", async () => {
  const existingUser = {
    id: 7,
    email: "warehouse.user@example.com",
    name: "Existing User",
  };
  const { calls, dependencies } = createDependencies({
    findUserByEmail: async (email) => {
      calls.lookups.push(email);
      return existingUser;
    },
  });

  const result = await resolveGoogleUser(
    "valid-token",
    "google-client-id",
    dependencies,
  );

  assert.deepEqual(result, {
    status: "authenticated",
    user: existingUser,
    created: false,
  });
  assert.deepEqual(calls.created, []);
});

test("uses the email prefix when Google omits a display name", async () => {
  const { calls, dependencies } = createDependencies({
    verifyIdToken: async () => ({
      email: "warehouse.user@example.com",
      email_verified: true,
    }),
  });

  await resolveGoogleUser("valid-token", "google-client-id", dependencies);

  assert.deepEqual(calls.created, [
    { email: "warehouse.user@example.com", name: "warehouse.user" },
  ]);
});

test("rejects missing or unverified email before accessing accounts", async () => {
  for (const payload of [
    { email: "warehouse.user@example.com", email_verified: false },
    { email_verified: true },
    null,
  ]) {
    const { calls, dependencies } = createDependencies({
      verifyIdToken: async () => payload,
    });

    const result = await resolveGoogleUser(
      "valid-token",
      "google-client-id",
      dependencies,
    );

    assert.deepEqual(result, { status: "email_unverified" });
    assert.deepEqual(calls.lookups, []);
    assert.deepEqual(calls.created, []);
  }
});

test("rejects invalid credentials without querying or creating an account", async () => {
  const verificationError = new Error("invalid audience or token");
  const { calls, dependencies } = createDependencies({
    verifyIdToken: async () => {
      throw verificationError;
    },
  });

  const result = await resolveGoogleUser(
    "invalid-token",
    "google-client-id",
    dependencies,
  );

  assert.deepEqual(result, {
    status: "invalid_credential",
    error: verificationError,
  });
  assert.deepEqual(calls.lookups, []);
  assert.deepEqual(calls.created, []);
});
