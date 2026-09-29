const baseUrl = process.env.APP_BASE_URL || "http://localhost:7780";
const sessionCookie = process.env.AUTOMATION_SESSION_COOKIE;
const cookieName = process.env.SESSION_COOKIE_NAME || "honda_session";
const limit = Number(process.env.AUTOMATION_BATCH_LIMIT || 100);

if (!sessionCookie) throw new Error("AUTOMATION_SESSION_COOKIE wajib diisi dengan sesi owner/admin yang memiliki izin crm.write");
if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error("AUTOMATION_BATCH_LIMIT harus bilangan 1-200");

const response = await fetch(new URL("/api/v1/automation/due-communications", baseUrl), {
  method: "POST",
  headers: {
    "content-type": "application/json",
    cookie: `${cookieName}=${sessionCookie}`,
  },
  body: JSON.stringify({ limit }),
});
const payload = await response.json();
if (!response.ok) throw new Error(`Automation gagal (${response.status}): ${payload?.error?.message || "respons tidak valid"}`);
console.log(JSON.stringify(payload));
