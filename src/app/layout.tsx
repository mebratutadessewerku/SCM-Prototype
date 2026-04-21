import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "SupplyOS SCM",
  description: "Modern Supply Chain Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("h-full antialiased", "font-sans", inter.variable)}>
      <body className={cn("min-h-full bg-background font-sans text-foreground", inter.className)}>{children}</body>
    </html>
  );
}
