import crypto from "node:crypto";

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function derive(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT.keylen, SCRYPT, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, n, r, p, encodedSalt, encodedKey] = encoded.split("$");
  if (algorithm !== "scrypt" || !encodedSalt || !encodedKey) return false;
  const salt = Buffer.from(encodedSalt, "base64url");
  const expected = Buffer.from(encodedKey, "base64url");
  const actual = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, expected.length, { N: Number(n), r: Number(r), p: Number(p) }, (error, key) => error ? reject(error) : resolve(key));
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
