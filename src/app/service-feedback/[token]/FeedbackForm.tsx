"use client";

import { FormEvent, useEffect, useState } from "react";

type State = "loading" | "ready" | "submitted" | "unavailable";

export function FeedbackForm({ token }: { token: string }) {
  const endpoint = `/api/v1/public/service-feedback/${encodeURIComponent(token)}`;
  const [state, setState] = useState<State>("loading");
  const [rating, setRating] = useState(5);
  const [comments, setComments] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetch(endpoint, { cache: "no-store" }).then(async (response) => {
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message || "Tautan rating tidak tersedia");
      setState("ready");
    }).catch((error) => { setMessage(error instanceof Error ? error.message : "Tautan rating tidak tersedia"); setState("unavailable"); });
  }, [endpoint]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rating, comments: comments || null }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) { setMessage(body?.error?.message || "Rating gagal dikirim"); if ([409, 410].includes(response.status)) setState("unavailable"); return; }
    setState("submitted");
  }

  if (state === "loading") return <p className="text-sm font-semibold text-slate-600">Memeriksa tautan...</p>;
  if (state === "submitted") return <div role="status"><h1 className="text-3xl font-black text-slate-950">Terima kasih.</h1><p className="mt-3 text-slate-600">Rating Anda sudah diterima dan tautan ini telah ditutup.</p></div>;
  if (state === "unavailable") return <div role="alert"><h1 className="text-3xl font-black text-slate-950">Tautan tidak tersedia</h1><p className="mt-3 text-slate-600">{message}</p></div>;

  return <form onSubmit={submit} className="space-y-6">
    <div><h1 className="text-3xl font-black tracking-tight text-slate-950">Bagaimana layanan kami?</h1><p className="mt-2 text-slate-600">Berikan penilaian singkat. Tautan hanya dapat digunakan satu kali.</p></div>
    <fieldset><legend className="text-sm font-black uppercase tracking-widest text-slate-500">Rating</legend><div className="mt-3 grid grid-cols-5 gap-2">{[1,2,3,4,5].map((value) => <label key={value} className={`cursor-pointer rounded-2xl border p-3 text-center font-black ${rating === value ? "border-amber-500 bg-amber-50 text-amber-900" : "border-slate-200 bg-white"}`}><input className="sr-only" type="radio" name="rating" value={value} checked={rating === value} onChange={() => setRating(value)} />{value}<span className="block text-xs font-semibold">bintang</span></label>)}</div></fieldset>
    <label className="block text-sm font-bold text-slate-800">Catatan opsional<textarea value={comments} onChange={(event) => setComments(event.target.value)} maxLength={2000} className="mt-2 min-h-32 w-full rounded-2xl border border-slate-300 bg-white p-4 outline-none focus:border-amber-500" placeholder="Ceritakan pengalaman Anda" /></label>
    <button className="min-h-12 w-full rounded-2xl bg-slate-950 px-5 font-black text-white hover:bg-slate-800">Kirim rating</button>
    {message && <p role="alert" className="text-sm font-semibold text-red-700">{message}</p>}
  </form>;
}
