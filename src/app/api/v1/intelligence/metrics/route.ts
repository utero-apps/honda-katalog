import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { fail, ok } from "@/server/http";

export async function GET(request:NextRequest){try{const requestId=crypto.randomUUID();const user=await requirePermission(request,requestId,"reports.read");const data=await withActorTransaction({userId:user.id,role:user.role,requestId},async client=>(await client.query("SELECT (SELECT count(DISTINCT customer_id) FROM app.service_orders WHERE created_at>=now()-interval '90 days')::int AS \"activeCustomers90Days\",(SELECT count(DISTINCT customer_id) FROM app.service_orders WHERE created_at>=now()-interval '90 days' AND customer_id IN(SELECT customer_id FROM app.service_orders WHERE created_at<now()-interval '90 days'))::int AS \"returningCustomers90Days\",(SELECT coalesce(sum(quantity),0)::text FROM app.stock_movements WHERE movement_type='service_usage' AND occurred_at>=date_trunc('month',now())) AS \"monthlyPartsConsumed\",(SELECT coalesce(avg(quantity),0)::text FROM app.inventory_balances) AS \"averageStockBalance\"")).rows[0]);return ok({...data,monthlyPartsConsumed:Number(data.monthlyPartsConsumed),averageStockBalance:Number(data.averageStockBalance)},{requestId});}catch(error){return fail(error);}}
