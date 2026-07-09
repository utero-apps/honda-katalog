"use server";

import { supabase } from "@/lib/supabase";
import { SparePart } from "@/types";

export async function searchSparePartsAction(
  searchQuery: string,
  motorFilter: string,
  categoryFilter: string
): Promise<{ success: boolean; data: SparePart[]; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("search_spareparts", {
      search_query: searchQuery,
      motor_filter: motorFilter,
    });

    if (error) {
      console.error("Supabase RPC error, falling back to basic query:", error);
      
      let dbQuery = supabase.from("spareparts").select("*");

      if (searchQuery) {
        dbQuery = dbQuery.or(
          "part_name.ilike.%" + searchQuery + "%,part_code.ilike.%" + searchQuery + "%"
        );
      }

      if (motorFilter) {
        dbQuery = dbQuery.ilike("part_name", "%" + motorFilter + "%");
      }

      const { data: fallbackData, error: fallbackError } = await dbQuery
        .order("part_name", { ascending: true })
        .limit(50);

      if (fallbackError) {
        throw fallbackError;
      }

      const formattedData: SparePart[] = (fallbackData || []).map((item: any) => ({
        id: item.id.toString(),
        name: item.part_name,
        code: item.part_code,
        category: getCategoryFromPartName(item.part_name),
        price: Number(item.het) || 0,
        compatibleMotors: extractMotorsFromPartName(item.part_name),
      }));

      const finalData = categoryFilter
        ? formattedData.filter(part => part.category === categoryFilter)
        : formattedData;

      return { success: true, data: finalData };
    }

    const formattedData: SparePart[] = (data || []).map((item: any) => ({
      id: item.id.toString(),
      name: item.part_name,
      code: item.part_code,
      category: getCategoryFromPartName(item.part_name),
      price: Number(item.het) || 0,
      compatibleMotors: extractMotorsFromPartName(item.part_name),
    }));

    const finalData = categoryFilter
      ? formattedData.filter(part => part.category === categoryFilter)
      : formattedData;

    return { success: true, data: finalData };
  } catch (err: any) {
    console.error("Search Action Error:", err);
    return { success: false, data: [], error: err.message };
  }
}

// Action to insert a new sparepart
export async function addSparePartAction(
  partCode: string,
  partName: string,
  het: number,
  status: string = "Active"
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const { data, error } = await supabase
      .from("spareparts")
      .insert([
        {
          part_code: partCode.trim(),
          part_name: partName.trim().toUpperCase(),
          het: het,
          status: status,
        },
      ])
      .select();

    if (error) throw error;
    return { success: true, data };
  } catch (err: any) {
    console.error("Add SparePart Error:", err);
    return { success: false, error: err.message };
  }
}

// Action to update an existing sparepart
export async function updateSparePartAction(
  id: string,
  partCode: string,
  partName: string,
  het: number,
  status: string = "Active"
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const { data, error } = await supabase
      .from("spareparts")
      .update({
        part_code: partCode.trim(),
        part_name: partName.trim().toUpperCase(),
        het: het,
        status: status,
      })
      .eq("id", id)
      .select();

    if (error) throw error;
    return { success: true, data };
  } catch (err: any) {
    console.error("Update SparePart Error:", err);
    return { success: false, error: err.message };
  }
}

function getCategoryFromPartName(name: string): string {
  const n = name.toUpperCase();
  if (n.includes("BUSI")) return "Mesin";
  if (n.includes("BELT") || n.includes("ROLLER") || n.includes("CVT") || n.includes("RANTAI") || n.includes("GEAR")) return "Transmisi";
  if (n.includes("REM") || n.includes("PAD") || n.includes("BRAKE")) return "Rem";
  if (n.includes("SHOCK") || n.includes("FORK") || n.includes("BEARING") || n.includes("BUSHING")) return "Suspensi";
  if (n.includes("AKI") || n.includes("ACCU") || n.includes("LAMPU") || n.includes("BOHLAM") || n.includes("COIL") || n.includes("STATOR") || n.includes("STARTER")) return "Kelistrikan";
  if (n.includes("FILTER") || n.includes("SARINGAN")) return "Filter";
  if (n.includes("SPAKBOR") || n.includes("BODY") || n.includes("COVER") || n.includes("SPOILER")) return "Bodi";
  return "Mesin";
}

function extractMotorsFromPartName(name: string): string[] {
  const n = name.toUpperCase();
  const motors: string[] = [];
  
  if (n.includes("BEAT")) {
    if (n.includes("150") || n.includes("STREET")) motors.push("Beat 150");
    else if (n.includes("125")) motors.push("Beat 125");
    else motors.push("Beat 110");
  }
  if (n.includes("VARIO")) {
    if (n.includes("150")) motors.push("Vario 150");
    else if (n.includes("120")) motors.push("Vario 120");
    else motors.push("Vario 125");
  }
  if (n.includes("PCX")) motors.push("PCX 150");
  if (n.includes("SCOOPY")) motors.push("Scoopy");
  if (n.includes("GENIO")) motors.push("Genio");
  if (n.includes("REVO")) motors.push("Revo");
  if (n.includes("BLADE")) motors.push("Blade");

  if (motors.length === 0) {
    return ["Semua Honda"];
  }
  return motors;
}
