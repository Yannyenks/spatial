import path from "path";

process.env.DATABASE_URL = `file:${path.resolve(__dirname, "test.db")}`;
process.env.SESSION_SECRET = "test-secret-not-for-production";
process.env.STORAGE_PROVIDER = "local";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
