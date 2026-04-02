import { Router } from "express";
import type { Request, Response } from "express";
import type { CosmosChatStore } from "../store/cosmosChatStore";

export function createUserRouter(store: CosmosChatStore): Router {
  const router = Router();

  router.get("/:userId", async (req: Request, res: Response) => {
    const profile = await store.getUserProfile(req.params["userId"]!);
    if (!profile) { res.status(404).json({ ok: false, error: "User not found." }); return; }
    res.json({ ok: true, user: profile });
  });

  router.get("/", async (req: Request, res: Response) => {
    const query = String(req.query["query"] || "").trim();
    const limit = Math.min(Math.max(Number.parseInt(String(req.query["limit"] || "20"), 10), 1), 100);
    const continuation = String(req.query["continuation"] || "").trim() || null;
    const users = store.listUsers(query, limit, continuation);
    res.json({ ok: true, users: users.items, continuation: users.continuation });
  });

  return router;
}

export function createAuthRouter(store: CosmosChatStore): Router {
  const router = Router();

  router.post("/sync-user", async (req: Request, res: Response) => {
    try {
      const userId = req.user!.oid;
      const displayName = req.user!.name || req.user!.preferredUsername || userId;
      const user = await store.upsertUserProfile(userId, displayName);
      res.json({ ok: true, user });
    } catch (_error) {
      res.status(500).json({ ok: false, error: "Failed to sync user profile." });
    }
  });

  return router;
}
