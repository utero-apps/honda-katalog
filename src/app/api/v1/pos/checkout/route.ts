import { NextRequest } from "next/server";
import { handleCheckout } from "@/features/pos/http";

export async function POST(request: NextRequest) { return handleCheckout(request); }
