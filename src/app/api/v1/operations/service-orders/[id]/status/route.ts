import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { ApiError, assertSameOrigin, fail, ok, parseBody } from "@/server/http";

const status=z.enum(["draft","open","assigned","in_progress","quality_check","invoiced","paid","completed","cancelled"]);
const input=z.object({status,reason:z.string().max(1000).optional()});
const transitions:Record<string,string[]>={draft:["open","cancelled"],open:["cancelled"],assigned:["cancelled"],in_progress:[],quality_check:[],invoiced:[],paid:[],completed:[],cancelled:[]};
export async function PATCH(request:NextRequest,context:{params:Promise<{id:string}>}){try{assertSameOrigin(request);const requestId=crypto.randomUUID();const user=await requirePermission(request,requestId,"service.complete");const id=z.uuid().parse((await context.params).id);const body=await parseBody(request,input);const data=await withActorTransaction({userId:user.id,role:user.role,requestId},async client=>{const current=(await client.query<{status:string}>("SELECT status FROM app.service_orders WHERE id=$1 FOR UPDATE",[id])).rows[0];if(!current)throw new ApiError(404,"SERVICE_ORDER_NOT_FOUND","Service order tidak ditemukan");if(!transitions[current.status]?.includes(body.status))throw new ApiError(409,"INVALID_STATE_TRANSITION",`Transisi ${current.status} ke ${body.status} tidak diizinkan`);const completed=body.status==="completed"?"now()":"completed_at";const row=(await client.query(`UPDATE app.service_orders SET status=$1,completed_at=${completed},updated_by=$2,updated_at=now() WHERE id=$3 RETURNING id,status`,[body.status,user.id,id])).rows[0];await client.query("INSERT INTO app.service_order_status_history(service_order_id,from_status,to_status,reason,actor_id) VALUES($1,$2,$3,$4,$5)",[id,current.status,body.status,body.reason||null,user.id]);return row;});return ok(data,{requestId});}catch(error){return fail(error);}}
