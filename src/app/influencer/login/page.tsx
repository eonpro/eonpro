"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import BeccaAILogo from "@/components/BeccaAILogo";

export default function InfluencerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/influencers/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        router.push("/influencer/dashboard");
      } else {
        setError(data.error || "Login failed");
      }
    } catch (error: any) {
    // @ts-ignore
   
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f9f8f6] flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-sm p-8">
        <div className="flex justify-center mb-6">
          <img 
            src="https://static.wixstatic.com/media/c49a9b_3379db3991ba4ca48dcbb3a979570842~mv2.png"
            alt="EONMEDS"
            className="h-12"
          />
        </div>
        
        <h2 className="text-2xl font-bold text-center mb-2">Influencer Portal</h2>
        <p className="text-gray-600 text-center mb-6">
          Login to view your referral stats and commissions
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e: any) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent"
              placeholder="your@email.com"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e: any) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent"
              placeholder="Enter your password"
              required
              disabled={loading}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#4fa77e] text-white py-2 rounded-lg font-semibold hover:bg-[#3d8663] transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Don't have an account?{" "}
            <a href="mailto:support@eonmeds.com" className="text-[#4fa77e] hover:underline">
              Contact support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
