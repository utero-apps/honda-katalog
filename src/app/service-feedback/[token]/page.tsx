import type { Metadata } from "next";
import { FeedbackForm } from "./FeedbackForm";

export const metadata: Metadata = {
  title: "Rating Layanan",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function ServiceFeedbackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f4efe5] px-4 py-12">
    <meta name="referrer" content="no-referrer" />
    <div aria-hidden className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-amber-300/40 blur-3xl" />
    <div aria-hidden className="absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-emerald-300/30 blur-3xl" />
    <section className="relative w-full max-w-xl rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-2xl shadow-slate-900/10 backdrop-blur sm:p-10">
      <p className="mb-8 text-xs font-black uppercase tracking-[0.28em] text-amber-700">Honda Service Feedback</p>
      <FeedbackForm token={token} />
    </section>
  </main>;
}
