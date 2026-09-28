"use client";

import { PointerEvent, useEffect, useRef, useState } from "react";

export function SignaturePad({ disabled = false, busy = false, onSave }: { disabled?: boolean; busy?: boolean; onSave: (file: File) => Promise<void> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  useEffect(() => clear(), []);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * (canvas.width / bounds.width), y: (event.clientY - bounds.top) * (canvas.height / bounds.height) };
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const position = point(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    context.beginPath();
    context.moveTo(position.x, position.y);
  }

  function draw(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || disabled) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const position = point(event);
    context.strokeStyle = "#0f172a";
    context.lineWidth = 4;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineTo(position.x, position.y);
    context.stroke();
    setHasInk(true);
  }

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Tanda tangan tidak dapat diproses");
    await onSave(new File([blob], "signature.png", { type: "image/png" }));
  }

  return <div className="space-y-3"><div><p className="text-sm font-black text-slate-950">Tanda tangan penerima</p><p className="mt-1 text-xs leading-5 text-slate-500">Gunakan mouse atau layar sentuh. Alternatif aksesibel: unggah PNG tanda tangan.</p></div><canvas ref={canvasRef} width={900} height={280} aria-label="Area tanda tangan digital" onPointerDown={start} onPointerMove={draw} onPointerUp={() => { drawingRef.current = false; }} onPointerCancel={() => { drawingRef.current = false; }} className="h-44 w-full touch-none rounded-2xl border border-slate-300 bg-white shadow-inner" /><div className="flex flex-col gap-2 sm:flex-row"><button type="button" disabled={disabled || busy || !hasInk} onClick={() => void save()} className="min-h-11 rounded-xl bg-slate-950 px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Menyimpan…" : "Simpan tanda tangan"}</button><button type="button" disabled={disabled || busy || !hasInk} onClick={clear} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">Bersihkan</button><label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700"><span>Unggah PNG</span><input type="file" accept="image/png" disabled={disabled || busy} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onSave(file); event.currentTarget.value = ""; }} /></label></div></div>;
}
