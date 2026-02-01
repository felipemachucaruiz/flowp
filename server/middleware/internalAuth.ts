import { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { internalUsers, users } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.SESSION_SECRET || process.env.INTERNAL_JWT_SECRET;

if (!JWT_SECRET) {
  console.warn("[InternalAuth] SESSION_SECRET or INTERNAL_JWT_SECRET not set - internal admin authentication will fail");
}

interface InternalTokenPayload {
  userId: string;
  email: string;
  role: "superadmin" | "supportagent" | "billingops";
}

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

export function generateInternalToken(user: { id: string; email: string; role: "superadmin" | "supportagent" | "billingops" }): string {
  if (!JWT_SECRET) {
    throw new Error("JWT secret not configured");
  }
  
  const payload: InternalTokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });
}

export function verifyInternalToken(token: string): InternalTokenPayload | null {
  if (!JWT_SECRET) {
    return null;
  }

  try {
    return jwt.verify(token, JWT_SECRET) as InternalTokenPayload;
  } catch {
    return null;
  }
}

export async function internalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Internal authentication required" });
  }

  const token = authHeader.substring(7);
  const payload = verifyInternalToken(token);

  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  // First try to find in internalUsers table
  let user = await db.query.internalUsers.findFirst({
    where: and(
      eq(internalUsers.id, payload.userId),
      eq(internalUsers.isActive, true),
    ),
  });

  // If not found, check the regular users table for internal users
  if (!user) {
    const regularUser = await db.query.users.findFirst({
      where: and(
        eq(users.id, payload.userId),
        eq(users.isActive, true),
        eq(users.isInternal, true),
      ),
    });

    if (regularUser) {
      // Map regular user to internal user format
      req.internalUser = {
        id: regularUser.id,
        email: regularUser.email || regularUser.username,
        name: regularUser.name,
        role: mapRoleToInternalRole(regularUser.role),
      };
      return next();
    }
  }

  if (!user) {
    return res.status(401).json({ error: "User not found or inactive" });
  }

  req.internalUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };

  next();
}

function mapRoleToInternalRole(role: string): "superadmin" | "supportagent" | "billingops" {
  // Map regular user roles to internal admin roles
  if (role === "admin" || role === "owner") return "superadmin";
  if (role === "manager") return "supportagent";
  return "billingops";
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

  const token = generateInternalToken({
    id: user.id,
    email: user.email,
    role: user.role,
  });

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    token,
  };
}
