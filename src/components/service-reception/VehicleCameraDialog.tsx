"use client";

import { AccessibleDialog } from "@/components/AccessibleDialog";
import { useEffect, useId, useRef, useState } from "react";

const maxImageBytes = 5 * 1024 * 1024;

function cameraErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError")
    return "Izin kamera ditolak. Izinkan akses kamera pada browser, lalu coba lagi.";
  if (error instanceof DOMException && error.name === "NotFoundError")
    return "Kamera tidak ditemukan pada perangkat ini.";
  if (error instanceof DOMException && error.name === "NotReadableError")
    return "Kamera sedang dipakai aplikasi lain. Tutup aplikasi tersebut, lalu coba lagi.";
  return "Kamera belum dapat dibuka. Gunakan pilihan file bila masalah berlanjut.";
}

export function VehicleCameraDialog({
  onClose,
  onCapture,
}: {
  onClose: () => void;
  onCapture: (file: File) => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function startCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error("CAMERA_UNSUPPORTED");
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        if (active) setReady(true);
      } catch (reason) {
        if (active) setError(cameraErrorMessage(reason));
      }
    }

    void startCamera();
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError("Tampilan kamera belum siap. Tunggu sebentar lalu coba lagi.");
      return;
    }
    const largestDimension = 1600;
    const scale = Math.min(1, largestDimension / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      setError("Foto belum dapat diproses.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setError("Foto belum dapat diproses.");
        return;
      }
      if (blob.size > maxImageBytes) {
        setError("Ukuran foto melebihi 5 MB. Coba ambil ulang dari jarak lebih jauh.");
        return;
      }
      onCapture(new File([blob], `kendaraan-${Date.now()}.jpg`, { type: "image/jpeg" }));
      onClose();
    }, "image/jpeg", 0.86);
  }

  return (
    <AccessibleDialog
      labelledBy={titleId}
      describedBy={descriptionId}
      onClose={onClose}
      showCloseButton
      closeLabel="Tutup kamera kendaraan"
      panelClassName="max-w-2xl"
    >
      <div className="space-y-5">
        <header>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-red-600">
            Foto kendaraan
          </p>
          <h2 id={titleId} className="mt-1 text-2xl font-black tracking-tight text-slate-950">
            Ambil foto dari kamera
          </h2>
          <p id={descriptionId} className="mt-1 text-sm leading-6 text-slate-600">
            Arahkan kamera ke kendaraan, lalu tekan ambil foto.
          </p>
        </header>
        <div className="overflow-hidden rounded-2xl bg-slate-950">
          {error ? (
            <p role="alert" className="p-5 text-sm font-semibold leading-6 text-red-200">
              {error}
            </p>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              aria-label="Tampilan kamera kendaraan"
              className="aspect-video w-full object-cover"
            />
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-100"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!ready || Boolean(error)}
            onClick={capture}
            data-dialog-initial-focus
            className="min-h-11 rounded-xl bg-slate-950 px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Ambil foto
          </button>
        </div>
      </div>
    </AccessibleDialog>
  );
}
