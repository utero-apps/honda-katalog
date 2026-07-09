const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Error: URL atau Anon Key Supabase belum diisi di .env.local!");
  process.exit(1);
}

// Inisialisasi Supabase khusus untuk schema 'honda'
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'honda' }
});

const csvFilePath = path.join(__dirname, 'import.csv');

if (!fs.existsSync(csvFilePath)) {
  console.error("Error: File 'import.csv' tidak ditemukan di root folder!");
  console.log("Silakan simpan file Excel kamu sebagai 'import.csv' di folder:", __dirname);
  process.exit(1);
}

console.log("Membaca file 'import.csv'...");
const fileContent = fs.readFileSync(csvFilePath, 'utf8');

// Bersihkan BOM (Byte Order Mark) jika ada (sering dihasilkan oleh Excel)
const cleanContent = fileContent.replace(/^\uFEFF/, '');
const lines = cleanContent.split(/\r?\n/).filter(line => line.trim() !== '');

if (lines.length <= 1) {
  console.error("Error: File CSV kosong atau hanya berisi header!");
  process.exit(1);
}

// Deteksi delimiter (koma atau titik koma)
const headerLine = lines[0];
const delimiter = headerLine.includes(';') ? ';' : ',';
console.log(`Mendeteksi file CSV menggunakan pemisah (delimiter): '${delimiter}'`);

const headers = headerLine.split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
console.log("Headers ditemukan:", headers);

// Parsing baris data
const items = [];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  
  // Regex untuk handle kolom yang mengandung kutip/koma di dalam teks
  let columns = [];
  if (delimiter === ',') {
    // Regex parsing standar CSV untuk pemisah koma
    const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
    columns = matches.map(c => c.trim().replace(/^"|"$/g, ''));
  } else {
    // Sederhana untuk titik koma
    columns = line.split(';').map(c => c.trim().replace(/^"|"$/g, ''));
  }

  if (columns.length < 2) continue; // Skip baris tidak valid

  const partCode = columns[0] || '';
  const partName = columns[1] || '';
  
  // Bersihkan nilai HET/Harga (buang titik, koma desimal, simbol Rp)
  let rawHet = columns[2] || '0';
  let cleanHet = rawHet.replace(/[^0-9]/g, ''); // Ambil angka saja
  const hetPrice = parseInt(cleanHet, 10) || 0;

  const status = columns[3] || 'Active';

  items.push({
    part_code: partCode,
    part_name: partName,
    het: hetPrice,
    status: status
  });
}

console.log(`Berhasil mem-parse ${items.length} item sparepart.`);
console.log("Memulai proses upload ke Supabase...");

const BATCH_SIZE = 500;
let successCount = 0;

async function uploadBatches() {
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    
    const { error } = await supabase
      .from('spareparts')
      .insert(batch);

    if (error) {
      console.error(`Gagal mengunggah batch ke-${Math.floor(i / BATCH_SIZE) + 1}:`, error.message);
    } else {
      successCount += batch.length;
      const progress = ((successCount / items.length) * 100).toFixed(1);
      console.log(`[Progress: ${progress}%] Berhasil mengunggah ${successCount}/${items.length} item...`);
    }
  }

  console.log("\n=== PROSES SELESAI ===");
  console.log(`Total data berhasil di-upload: ${successCount} dari ${items.length} data.`);
}

uploadBatches();
