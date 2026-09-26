import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { assertSameOrigin, fail, ok, parseBody } from "@/server/http";
const input=z.object({warehouseId:z.uuid(),productId:z.uuid(),movementType:z.enum(["opening","receiving","service_usage","adjustment_in","adjustment_out","opname","return_in","return_out"]),quantity:z.coerce.number().refine((value)=>value!==0),unitCost:z.coerce.number().min(0).default(0),referenceType:z.string().min(2).max(80),referenceId:z.uuid().nullable().optional(),idempotencyKey:z.string().min(8).max(200),reason:z.string().max(1000).optional()});
export async function POST(request:NextRequest){try{assertSameOrigin(request);const requestId=crypto.randomUUID();const user=await requirePermission(request,requestId,"inventory.adjust");const body=await parseBody(request,input);const data=await withActorTransaction({userId:user.id,role:user.role,requestId},async(c)=>(await c.query("INSERT INTO app.stock_movements(warehouse_id,product_id,movement_type,quantity,unit_cost,reference_type,reference_id,idempotency_key,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,occurred_at AS \"occurredAt\"",[body.warehouseId,body.productId,body.movementType,body.quantity,body.unitCost,body.referenceType,body.referenceId||null,body.idempotencyKey,body.reason||null,user.id])).rows[0]);return ok(data,{requestId});}catch(error){return fail(error);}}
