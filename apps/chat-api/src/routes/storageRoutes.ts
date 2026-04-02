import { Router, Request, Response } from "express";
import multer from "multer";
import logger from "../logger";
import { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import crypto from "crypto";
import type { CosmosChatStore } from "../store/cosmosChatStore";
import type { NormalizedClaims } from "../types";

declare module "express-serve-static-core" {
  interface Request {
    user?: NormalizedClaims;
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
});

function getBlobServiceClient(): BlobServiceClient {
  const accountName = String(process.env.AZURE_STORAGE_ACCOUNT_NAME || "").trim();
  if (!accountName) throw new Error("AZURE_STORAGE_STORAGE_ACCOUNT_NAME not configured");

  const connectionString = String(process.env.AZURE_STORAGE_CONNECTION_STRING || "").trim();
  if (connectionString) {
    return BlobServiceClient.fromConnectionString(connectionString);
  }
  return new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    new DefaultAzureCredential()
  );
}

function getContainerName(): string {
  return String(process.env.AZURE_STORAGE_CONTAINER_NAME || "chat-files").trim();
}

export function createStorageRouter(store: CosmosChatStore): Router {
  const router = Router();

  /**
   * POST /storage/upload
   * Multipart upload — field name: "file"
   * Body params (form fields): roomId OR conversationId
   *
   * Returns: { ok: true, blobPath, fileName, contentType }
   */
  router.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
    const userId = req.user!.oid;
    const file = req.file;
    if (!file) {
      res.status(400).json({ ok: false, error: "No file uploaded." });
      return;
    }

    const roomId = String(req.body?.["roomId"] || "").trim();
    const conversationId = String(req.body?.["conversationId"] || "").trim();
    const contextId = roomId || conversationId;

    if (!contextId) {
      res.status(400).json({ ok: false, error: "roomId or conversationId is required." });
      return;
    }

    const isMember = await store.isRoomMember(contextId, userId);
    if (!isMember) {
      res.status(403).json({ ok: false, error: "You are not a member of this conversation." });
      return;
    }

    try {
      const fileId = crypto.randomUUID();
      const room = store.getRoom(contextId);
      const prefix = room && !room.isPrivate ? "team" : "private";
      const blobPath = `${prefix}/${contextId}/${fileId}/${file.originalname}`;

      const client = getBlobServiceClient();
      const containerClient = client.getContainerClient(getContainerName());
      const blockBlob = containerClient.getBlockBlobClient(blobPath);

      await blockBlob.uploadData(file.buffer, {
        blobHTTPHeaders: { blobContentType: file.mimetype }
      });

      res.json({ ok: true, blobPath, fileName: file.originalname, contentType: file.mimetype });
    } catch (error) {
      logger.error({ err: error }, "[Storage] upload error");
      res.status(500).json({ ok: false, error: "File upload failed." });
    }
  });

  /**
   * GET /storage/sas?blob=...&contextId=...
   * Returns a time-limited SAS URL (60 min) for the given blob.
   * Verifies that the requester is a member of the conversation.
   */
  router.get("/sas", async (req: Request, res: Response) => {
    const userId = req.user!.oid;
    const blobPath = String(req.query["blob"] || "").trim();
    const contextId = String(req.query["contextId"] || "").trim();

    if (!blobPath || !contextId) {
      res.status(400).json({ ok: false, error: "blob and contextId are required." });
      return;
    }

    const isMember = await store.isRoomMember(contextId, userId);
    if (!isMember) {
      res.status(403).json({ ok: false, error: "You are not a member of this conversation." });
      return;
    }

    try {
      const accountName = String(process.env.AZURE_STORAGE_ACCOUNT_NAME || "").trim();
      const containerName = getContainerName();

      // SAS generation requires SharedKeyCredential — try connection string first,
      // otherwise fall back to a signed URL via the SDK user delegation approach.
      const connectionString = String(process.env.AZURE_STORAGE_CONNECTION_STRING || "").trim();

      if (connectionString) {
        // Extract account key from connection string for SAS signing
        const keyMatch = connectionString.match(/AccountKey=([^;]+)/i);
        const accountKey = keyMatch?.[1] || "";
        const sharedKey = new StorageSharedKeyCredential(accountName, accountKey);

        const expiresOn = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        const sasParams = generateBlobSASQueryParameters(
          {
            containerName,
            blobName: blobPath,
            permissions: BlobSASPermissions.parse("r"),
            expiresOn
          },
          sharedKey
        );
        const url = `https://${accountName}.blob.core.windows.net/${containerName}/${encodeURIComponent(blobPath)}?${sasParams}`;
        res.json({ ok: true, url });
      } else {
        // Managed Identity: generate user delegation SAS
        const client = getBlobServiceClient();
        const startsOn = new Date();
        const expiresOn = new Date(Date.now() + 60 * 60 * 1000);
        const userDelegationKey = await client.getUserDelegationKey(startsOn, expiresOn);

        const sasParams = generateBlobSASQueryParameters(
          {
            containerName,
            blobName: blobPath,
            permissions: BlobSASPermissions.parse("r"),
            startsOn,
            expiresOn
          },
          userDelegationKey,
          accountName
        );
        const url = `https://${accountName}.blob.core.windows.net/${containerName}/${encodeURIComponent(blobPath)}?${sasParams}`;
        res.json({ ok: true, url });
      }
    } catch (error) {
      logger.error({ err: error }, "[Storage] SAS error");
      res.status(500).json({ ok: false, error: "Failed to generate download URL." });
    }
  });

  return router;
}
