import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthHeader from "@/components/AuthHeader";
import GlobalAlert from "@/components/GlobalAlert";
import { ChatProvider } from "@/components/chat/ChatProvider";
import ChatModal from "@/components/chat/ChatModal";
import { PendingChangesProvider } from "@/components/pending/PendingChangesProvider";
import PendingChangesModal from "@/components/pending/PendingChangesModal";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Source Console",
  description: "Explore lexical relationships through interactive graphs",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="overflow-x-hidden">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white text-gray-900 overflow-x-hidden`}
      >
        <ChatProvider>
          <PendingChangesProvider>
            <AuthHeader />
            <GlobalAlert />
            {children}
            <ChatModal />
            <PendingChangesModal />
          </PendingChangesProvider>
        </ChatProvider>
      </body>
    </html>
  );
}
