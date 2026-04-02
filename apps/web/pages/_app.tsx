import "../styles/main.css";
import type { AppProps } from "next/app";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { msalInstance } from "../src/auth/msalConfig";

// MsalProvider accesses browser APIs that are not available during SSR.
// Wrapping with dynamic + ssr:false ensures it only renders on the client.
const MsalWrapper = dynamic(
  async () => {
    const { MsalProvider } = await import("@azure/msal-react");
    function Wrapper({ children }: { children: ReactNode }) {
      return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
    }
    return Wrapper;
  },
  { ssr: false }
);

export default function App({ Component, pageProps }: AppProps) {
  return (
    <MsalWrapper>
      <Component {...pageProps} />
    </MsalWrapper>
  );
}
