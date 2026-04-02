import { PublicClientApplication, type Configuration, type RedirectRequest } from "@azure/msal-browser";

const tenantId = process.env.NEXT_PUBLIC_ENTRA_TENANT_ID || "";
const clientId = process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID || "";
const authority =
  process.env.NEXT_PUBLIC_ENTRA_AUTHORITY ||
  (tenantId ? `https://login.microsoftonline.com/${tenantId}` : "");

export const apiScope = process.env.NEXT_PUBLIC_CHAT_API_SCOPE || "";

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority,
    redirectUri: process.env.NEXT_PUBLIC_ENTRA_REDIRECT_URI || "http://localhost:3000"
  },
  cache: {
    cacheLocation: "sessionStorage"
  }
};

export const loginRequest: RedirectRequest = {
  scopes: apiScope ? [apiScope] : []
};

export const msalInstance = new PublicClientApplication(msalConfig);
