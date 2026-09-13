import "server-only";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export class EmailAlreadyUsedError extends Error {
  constructor() {
    super("An account with this email already exists.");
    this.name = "EmailAlreadyUsedError";
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password.");
    this.name = "InvalidCredentialsError";
  }
}

export async function registerUser(email: string, password: string, name?: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) throw new EmailAlreadyUsedError();

  const passwordHash = await bcrypt.hash(password, 10);
  const trimmedName = name?.trim();
  return db.user.create({ data: { email: normalizedEmail, passwordHash, name: trimmedName ? trimmedName : null } });
}

export async function verifyCredentials(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) throw new InvalidCredentialsError();
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new InvalidCredentialsError();
  return user;
}
