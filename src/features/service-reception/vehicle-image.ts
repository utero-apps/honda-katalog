import crypto from "node:crypto";
import path from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { ApiError } from "@/server/http";

const maxImageBytes = 5 * 1024 * 1024;
const imageTypes = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
} as const;

type SupportedImageType = keyof typeof imageTypes;

const imageDirectory = () =>
  process.env.VEHICLE_IMAGE_DIR ?? path.join(process.cwd(), "data", "vehicle-images");

function hasSupportedSignature(bytes: Uint8Array, type: SupportedImageType) {
  if (type === "image/jpeg")
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png")
    return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  if (type === "image/webp")
    return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp" && ["avif", "avis"].includes(new TextDecoder().decode(bytes.slice(8, 12)));
}

export async function storeVehicleImage(file: File) {
  if (!(file.type in imageTypes))
    throw new ApiError(422, "IMAGE_TYPE_INVALID", "Gunakan gambar JPEG, PNG, WebP, atau AVIF");
  if (file.size === 0 || file.size > maxImageBytes)
    throw new ApiError(422, "IMAGE_SIZE_INVALID", "Ukuran gambar maksimal 5 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = file.type as SupportedImageType;
  if (!hasSupportedSignature(bytes, type))
    throw new ApiError(422, "IMAGE_CONTENT_INVALID", "Isi file bukan gambar yang valid");
  const directory = imageDirectory();
  await mkdir(directory, { recursive: true });
  const filename = `${crypto.randomUUID()}.${imageTypes[type]}`;
  const temporaryPath = path.join(/* turbopackIgnore: true */ directory, `${filename}.uploading`);
  const destinationPath = path.join(/* turbopackIgnore: true */ directory, filename);
  await writeFile(temporaryPath, bytes, { flag: "wx" });
  await rename(temporaryPath, destinationPath);
  return { imageUrl: `/api/v1/media/vehicles/${filename}` };
}

export async function readVehicleImage(key: string) {
  const extension = key.split(".").at(-1);
  const type = Object.entries(imageTypes).find(([, value]) => value === extension)?.[0];
  if (!type) throw new ApiError(404, "IMAGE_NOT_FOUND", "Gambar tidak ditemukan");
  try {
    return { bytes: await readFile(path.join(/* turbopackIgnore: true */ imageDirectory(), key)), type };
  } catch {
    throw new ApiError(404, "IMAGE_NOT_FOUND", "Gambar tidak ditemukan");
  }
}
