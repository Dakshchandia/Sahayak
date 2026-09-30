// Global test setup
// These tests run against the business logic in isolation — no database required.
// Integration tests that need a database are in tests/integration/ and are skipped
// unless DATABASE_URL is set (they should be run in CI with a real Postgres instance).

import { vi } from "vitest";

// Silence console.error in tests unless explicitly testing error paths
vi.spyOn(console, "error").mockImplementation(() => {});
