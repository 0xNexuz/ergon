import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });
const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;

export const metadata: Metadata = {
  metadataBase: new URL(productionHost ? `https://${productionHost}` : "http://localhost:3000"),
  title: "Ergon - Work made verifiable",
  description: "Post the outcome. Prove the work. Release the pay through Nimiq Pay.",
  applicationName: "Ergon",
  openGraph: {
    title: "Ergon - Work made verifiable",
    description: "Post the outcome. Prove the work. Release the pay.",
    type: "website",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Ergon - Work on proof" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ergon - Work made verifiable",
    description: "Post the outcome. Prove the work. Release the pay.",
    images: ["/og.png"],
  },
  icons: { icon: "/favicon.png", shortcut: "/favicon.png", apple: "/apple-touch-icon.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geist.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
