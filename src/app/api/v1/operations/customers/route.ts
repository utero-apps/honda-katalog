import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { assertSameOrigin, fail, ok, parseBody } from "@/server/http";

const input = z.object({ name: z.string().trim().min(2).max(160), phone: z.string().trim().min(5).max(40).optional(), email: z.email().optional(), address: z.string().max(1000).optional(), notes: z.string().max(4000).optional() }).refine((value) => value.phone || value.email, "Telepon atau email wajib diisi");

export async function GET(request: NextRequest) { try { const requestId=crypto.randomUUID(); const user=await requirePermission(request,requestId,"service.read"); const data=await withActorTransaction({userId:user.id,role:user.role,requestId},async(c)=>(await c.query("SELECT id,name,phone,email,address,notes,is_active AS \"isActive\",created_at AS \"createdAt\" FROM app.customers ORDER BY created_at DESC LIMIT 100")).rows); return ok(data,{requestId}); } catch(error){return fail(error);} }
export async function POST(request: NextRequest) { try { assertSameOrigin(request); const requestId=crypto.randomUUID(); const user=await requirePermission(request,requestId,"service.create"); const body=await parseBody(request,input); const data=await withActorTransaction({userId:user.id,role:user.role,requestId},async(c)=>(await c.query("INSERT INTO app.customers(name,phone,email,address,notes,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$6) RETURNING id,name,phone,email",[body.name,body.phone||null,body.email||null,body.address||null,body.notes||null,user.id])).rows[0]); return ok(data,{requestId}); }catch(error){return fail(error);} }
