import { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { internalUsers } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";

declare global {
  namespace Express {
    interface Request {
      internalUser?: {
        id: string;
        email: string;
        name: string;
        role: "superadmin" | "supportagent" | "billingops";
      };
    }
  }
}

export async function internalAuth(req: Request, res: Response, next: NextFunction) {
  const internalUserId = req.headers["x-internal-user-id"] as string;
  const internalToken = req.headers["x-internal-token"] as string;

  if (!internalUserId) {
    return res.status(401).json({ error: "Internal authentication required" });
  }

  const user = await db.query.internalUsers.findFirst({
    where: and(
      eq(internalUsers.id, internalUserId),
      eq(internalUsers.isActive, true),
    ),
  });

  if (!user) {
    return res.status(401).json({ error: "Invalid internal user" });
  }

  req.internalUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };

  next();
}

export function requireRole(allowedRoles: ("superadmin" | "supportagent" | "billingops")[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.internalUser) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (!allowedRoles.includes(req.internalUser.role)) {
      return res.status(403).json({ 
        error: "Insufficient permissions",
        required: allowedRoles,
        current: req.internalUser.role,
      });
    }

    next();
  };
}

export async function createInternalUser(params: {
  email: string;
  name: string;
  password: string;
  role: "superadmin" | "supportagent" | "billingops";
}) {
  const passwordHash = await bcrypt.hash(params.password, 10);
  
  const [user] = await db.insert(internalUsers).values({
    email: params.email,
    name: params.name,
    passwordHash,
    role: params.role,
  }).returning();

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

export async function verifyInternalUser(email: string, password: string) {
  const user = await db.query.internalUsers.findFirst({
    where: and(
      eq(internalUsers.email, email),
      eq(internalUsers.isActive, true),
    ),
  });

  if (!user || !user.passwordHash) {
    return null;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return null;
  }

  await db
    .update(internalUsers)
    .set({ lastLoginAt: new Date() })
    .where(eq(internalUsers.id, user.id));

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}
