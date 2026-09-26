# Design System

## 1. Arah Desain

UI harus menyampaikan kecepatan operasional, familiaritas Honda, dan data bisnis tepercaya. Gunakan workspace terang, hierarki kuat, data padat namun terbaca, dan status jelas.

Prinsip: cepat sebelum dekoratif; status sebelum novelty; konsisten sebelum variasi halaman; usable dengan keyboard/touch; responsif dari ponsel bengkel sampai dashboard owner.

## 2. Color Tokens

- Honda primary: `#DC2626`; hover `#B91C1C`; surface `#FEF2F2`.
- Operational blue: `#0284C7`; strong `#0369A1`; surface `#F0F9FF`.
- Success `#16A34A`; Warning `#D97706`; Danger `#DC2626`; Intelligence `#7C3AED`.
- Neutral: Slate 950/800/600, White, Slate 50/100/200.

Warna tidak boleh menjadi satu-satunya indikator status; selalu sertakan teks atau ikon.

## 3. Typography

- Geist Sans; Geist Mono untuk part code, barcode, document number.
- Body minimum 14 px desktop, input 16 px mobile.
- Page title 28-36 px weight 750-800.
- Section 20-24 px weight 700; card 16-18 px; label 12-14 px weight 600.
- Sentence case; uppercase hanya untuk status singkat atau kode.

## 4. Spacing dan Shape

- Unit 4 px; gap umum 8/12/16/24/32 px.
- Card padding 16-24 px; page max-width 1440 px.
- Radius 8 px control, 12 px card, 16 px dialog.
- Border menjadi pemisah utama; shadow halus.

## 5. Application Shell

- Desktop: sidebar collapsible dan navigation per domain.
- Mobile: top bar dan accessible drawer.
- Header: breadcrumb/context, action, notification, user menu.
- Main: title, description, primary action, filters, content.

Breakpoints: small 360-639, medium 640-1023, large 1024-1439, wide >=1440. Table berubah menjadi priority cards atau horizontal scroll pada layar kecil.

## 6. Komponen

- Button: primary, secondary, neutral, danger, ghost, icon.
- Input: text, number, currency, date, search, barcode.
- Select/combobox dengan server search.
- Checkbox, radio, switch, textarea.
- Data table: sort, filter, pagination, column visibility, empty state.
- Status badge, metric card, alert, inline error, toast.
- Dialog/drawer dengan focus trap dan Escape.
- Timeline, workflow stepper, skeleton, confirmation dialog.
- Search/command palette untuk akses operasional cepat.

## 7. Information Architecture

- Dashboard
- Catalog: Products, Categories, Vehicle Models
- Service: Service Orders, Customers, Vehicles, Mechanics
- Inventory: Stock Overview, Movements, Stock Opname
- Purchasing: Vendors, Purchase Orders, Receiving
- Finance: Customer/Vendor Invoices, Payments, Expenses
- CRM: Follow-ups, Service Reminders
- Reports
- Administration: Users/Roles, Audit Log, Settings

Navigation disaring berdasarkan permission untuk UX; backend tetap authoritative.

## 8. Status Language

Gunakan label Indonesia konsisten: Draft, Menunggu Persetujuan, Disetujui, Diproses, Selesai, Dibatalkan; Stok Aman, Stok Rendah, Habis; Belum Dibayar, Sebagian, Lunas, Jatuh Tempo; Aktif, Nonaktif, Dihentikan.

Database menyimpan controlled code, UI menerjemahkan. Jangan mencampur `Active`, `Discontinue`, dan label Indonesia sebagai business value.

## 9. Forms dan Dialog

- Label memakai `htmlFor` dan ID cocok.
- Required field diumumkan tekstual.
- Error tampil dekat field dan summary untuk form panjang.
- Input valid tidak hilang setelah gagal.
- Currency ditampilkan terformat tetapi dikirim ternormalisasi.
- Scanner selalu memiliki manual fallback.
- Dialog semantik, focus initial jelas, focus kembali ke opener, Escape bekerja.
- Posted inventory/finance memakai reversal, bukan delete.

## 10. Data Visualization

- Chart memiliki text summary dan accessible label.
- Service blue, inventory green, purchasing orange, finance purple/green.
- Tampilkan unit, range, comparison basis, generation time.
- Hindari axis menyesatkan; dashboard card menuju detail sumber.

## 11. Accessibility Gate

- WCAG 2.2 AA contrast.
- Focus terlihat; touch target sekitar 44x44 px.
- Tidak ada keyboard trap di luar modal.
- `prefers-reduced-motion` dihormati.
- Table memakai caption/header association.
- Loading dan hasil penting diumumkan melalui live region.
- Critical workflows menjalankan automated accessibility test di CI.

## 12. Content Style

Gunakan bahasa Indonesia operasional, langsung, dan aman. Jangan menampilkan error database/framework. Pesan menjelaskan apa yang terjadi dan tindakan berikutnya. Empty state menjelaskan cara memulai.
