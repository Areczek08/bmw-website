import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./components/ThemeProvider";

import { AuthProvider } from "./components/AuthProvider";
import { TopNavInfo } from "./components/TopNavInfo";
import { BugReportButton } from "./components/BugReportButton";
import { PwaRegister } from "./components/PwaRegister";
import { InstallPrompt } from "./components/InstallPrompt";
import { Toaster } from "sonner";


export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "BMS | Bojar Manager System",
  description: "Zarządzaj swoją spedycją z autorskim systemem Bojar Logistic.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "BMS",
  },
};

export const viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="pl" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}>
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-50 transition-colors duration-300">
        <PwaRegister />
        <InstallPrompt />
        <Toaster position="bottom-right" richColors theme="dark" />
        <AuthProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            forcedTheme="dark"
            enableSystem={false}
            disableTransitionOnChange={false}
          >
            <div className="flex min-h-screen flex-col relative">
              <header className="sticky top-0 z-50 w-full border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
                <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img src="/logo-full-outline.png" alt="Bojar Manager System Logo" className="h-8 w-auto object-contain" />
                  </div>
                  <div className="flex items-center">
                    <TopNavInfo />
                  </div>
                </div>
              </header>
              <main className="flex-1 container mx-auto px-4 py-8">
                {children}
              </main>
              <BugReportButton />
            </div>
          </ThemeProvider>
        </AuthProvider>

      </body>
    </html>
  );
}
