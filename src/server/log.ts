export function log(event: string, fields: Record<string, unknown> = {}) {
  console.info(JSON.stringify({ timestamp: new Date().toISOString(), event, ...fields }));
}
