import "../../styles/globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "Eonpro - Influencer Portal" };

export default function InfluencerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f9f8f6]">
      {children}
    </div>
  );
}
