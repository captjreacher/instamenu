"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import MenuUpload from "@/components/MenuUpload";

export default function HomePage() {
  const router = useRouter();
  const [restaurantName, setRestaurantName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedFile) {
      setError("Please select a menu photo to upload.");
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append("image", selectedFile);
      if (restaurantName.trim()) formData.append("restaurantName", restaurantName.trim());
      if (phone.trim()) formData.append("phone", phone.trim());
      if (email.trim()) formData.append("email", email.trim());

      const res = await fetch("/api/menu/parse", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Server error ${res.status}`);
      }

      const data = await res.json();
      if (!data.slug) throw new Error("No slug returned from server.");
      router.push(`/restaurant/${data.slug}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(message);
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 flex flex-col">
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span className="text-xl font-bold tracking-tight">
            Insta<span className="text-brand-400">menu</span>
          </span>
          <span className="text-sm text-gray-400">For restaurants</span>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 py-16 sm:py-24">
        <div className="w-full max-w-2xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 rounded-full px-4 py-1.5 mb-6">
            <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
            <span className="text-brand-400 text-sm font-medium">AI-powered ordering in seconds</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-gray-100 mb-4 text-balance leading-tight">
            Snap a menu.{" "}
            <span className="text-brand-400">Order instantly.</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-400 mb-12 text-balance">
            Upload your restaurant&apos;s menu photo and we&apos;ll create a live
            ordering page in under 30 seconds — no setup, no commissions.
          </p>

          {/* Upload Form */}
          <form onSubmit={handleSubmit} className="space-y-6 text-left">
            {/* Upload zone */}
            <MenuUpload onFileSelect={setSelectedFile} />

            {/* Optional fields */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-3">
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Restaurant name{" "}
                  <span className="text-gray-500 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={restaurantName}
                  onChange={(e) => setRestaurantName(e.target.value)}
                  placeholder="e.g. Mario's Kitchen"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Phone{" "}
                  <span className="text-gray-500 font-normal">(optional)</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 555 000 0000"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Email{" "}
                  <span className="text-gray-500 font-normal">(optional)</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="orders@yourrestaurant.com"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!selectedFile || isLoading}
              className="w-full bg-brand-500 hover:bg-brand-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-gray-950 font-bold py-4 rounded-lg text-lg transition-all duration-200 flex items-center justify-center gap-3"
            >
              {isLoading ? (
                <>
                  <Spinner />
                  AI is parsing your menu...
                </>
              ) : (
                "Create My Ordering Page →"
              )}
            </button>

            <p className="text-center text-xs text-gray-500">
              Free to use · No credit card required · Live in under 30 seconds
            </p>
          </form>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-gray-800 bg-gray-900/50 px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-gray-100 mb-10">
            How it works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                step: "1",
                title: "Snap your menu",
                desc: "Take a photo of your printed menu or upload an existing image file.",
              },
              {
                step: "2",
                title: "AI parses it",
                desc: "Our AI reads every dish, price, and category — structured in seconds.",
              },
              {
                step: "3",
                title: "Go live instantly",
                desc: "Share your link. Customers order online, you get notified immediately.",
              },
            ].map(({ step, title, desc }) => (
              <div
                key={step}
                className="bg-gray-900 border border-gray-800 rounded-xl p-6"
              >
                <div className="w-10 h-10 rounded-full bg-brand-500/20 border border-brand-500/30 text-brand-400 font-bold text-lg flex items-center justify-center mb-4">
                  {step}
                </div>
                <h3 className="font-semibold text-gray-100 mb-2">{title}</h3>
                <p className="text-sm text-gray-400">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 px-6 py-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-500">
          <span>
            &copy; {new Date().getFullYear()} Instamenu. Built for restaurateurs.
          </span>
          <span>No per-order commissions. Ever.</span>
        </div>
      </footer>
    </main>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-5 w-5"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
