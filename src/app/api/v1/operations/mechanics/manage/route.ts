import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { assertSameOrigin, fail, ok, parseBody } from "@/server/http";

const input=z.object({userId:z.uuid(),employeeCode:z.string().trim().min(2).max(40),feePercent:z.coerce.number().min(0).max(100),isActive:z.boolean().default(true)});
export async function POST(request:NextRequest){try{assertSameOrigin(request);const requestId=crypto.randomUUID();const user=await requirePermission(request,requestId,"users.manage");const body=await parseBody(request,input);const data=await withActorTransaction({userId:user.id,role:user.role,requestId},async client=>{const row=(await client.query("INSERT INTO app.mechanics(user_id,employee_code,fee_percent,is_active) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET employee_code=excluded.employee_code,fee_percent=excluded.fee_percent,is_active=excluded.is_active RETURNING user_id AS \"userId\",employee_code AS \"employeeCode\",fee_percent::text AS \"feePercent\",is_active AS \"isActive\"",[body.userId,body.employeeCode,body.feePercent,body.isActive])).rows[0];await recordAudit(client,{actorId:user.id,requestId,action:"mechanic.upsert",entityType:"mechanic",entityId:body.userId,after:row});return{...row,feePercent:Number(row.feePercent)};});return ok(data,{requestId});}catch(error){return fail(error);}}
