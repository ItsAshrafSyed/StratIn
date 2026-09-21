import type { Metadata } from "next";
import { AppNav } from "./components/nav";
import Providers from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "StratIn",
  description: "Non-custodial tokenized-equity strategies on Solana"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>
          <AppNav />
          {children}
        </Providers>
      </body>
    </html>
  );
}
