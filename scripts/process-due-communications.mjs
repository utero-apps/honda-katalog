const baseUrl = process.env.APP_BASE_URL || "http://localhost:7780";
const token = process.env.AUTOMATION_JOB_TOKEN;
const limit = Number(process.env.AUTOMATION_BATCH_LIMIT || 100);

if (!token || token.length < 24) throw new Error("AUTOMATION_JOB_TOKEN wajib diisi minimal 24 karakter");
if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error("AUTOMATION_BATCH_LIMIT harus bilangan 1-200");

const response = await fetch(new URL("/api/v1/automation/due-communications", baseUrl), {
  method: "POST",
  signal: AbortSignal.timeout(60_000),
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ limit }),
});
const payload = await response.json();
if (!response.ok) throw new Error(`Automation gagal (${response.status})`);
console.log(JSON.stringify(payload.data));
