import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { getSale } from "@/features/pos/service";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { fail, ok } from "@/server/http";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "pos.read");
    const id = z.uuid().parse((await context.params).id);
    const sale = await withActorTransaction({ userId: user.id, role: user.role, requestId }, (client) => getSale(client, id));
    return ok({ saleNumber: sale.saleNumber, status: sale.status, registerName: sale.registerName, cashierName: sale.cashierName, customerName: sale.customerName, items: sale.items, payments: sale.payments, total: sale.total, paidAmount: sale.paidAmount, changeAmount: sale.changeAmount, completedAt: sale.completedAt }, { requestId });
  } catch (error) { return fail(error); }
}
