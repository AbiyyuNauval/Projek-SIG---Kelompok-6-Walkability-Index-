# LangkahKota Pekanbaru: WebGIS Walkability

Proyek Sistem Informasi Geografis Kelompok 6. WebGIS fasilitas pejalan kaki di Kota Pekanbaru yang dibangun
dengan **OpenLayers + Vite**. Isinya: halaman Home (profil web), peta interaktif dengan filter, visualisasi
per kategori, dan analisis spasial untuk menentukan **halte yang paling membutuhkan fasilitas penyeberangan**.

## Menjalankan

```bash
npm install
npm start          # dev server → http://localhost:5173
npm run build      # build produksi ke folder dist/
npm run serve      # pratinjau hasil build
```

## Struktur

```
index.html            Halaman Home (profil web, data, metode, tim)
peta.html             Halaman Peta Interaktif
src/peta.js           Logika peta: layer, style, filter, popup, analisis
src/analysis.js       Fungsi analisis spasial murni (buffer/spatial query/klasifikasi)
src/icons.js          Ikon SVG per kategori (tanpa file gambar eksternal)
src/home.js           Statistik ringkas di Home (dihitung dari data)
src/style.css         Gaya bersama
public/data/          GeoJSON hasil survei (titik, jalur, area)
```

> Data diletakkan di `public/` agar ikut tersalin ke `dist/` saat `npm run build`.

## Pemenuhan ketentuan proyek

| Ketentuan | Implementasi |
|---|---|
| Basemap OpenLayers/Leaflet | OpenLayers, dengan pilihan basemap OSM / Carto Light / Citra Satelit Esri (list box) |
| Filter checkbox/list box | Checkbox per layer, checkbox per kategori titik, list box status halte & basemap |
| Halaman Home | `index.html` berisi profil web; peta ada di halaman terpisah `peta.html` |
| Visualisasi data | Ikon & warna per kategori, warna + **ukuran** halte mengikuti status, warna per segmen jalur, warna taman vs area pedestrian, legenda dinamis |
| Minimal 3 layer | Titik fasilitas, Jalur pedestrian, Area pedestrian (+ layer hasil: Buffer, Heatmap, Query) |
| Analisis spasial | **Buffer** jangkauan halte, **spatial query** penyeberangan terdekat & query radius klik-peta, **density** (heatmap) |

## Metode analisis

1. **Buffer**: lingkaran geodesik radius *r* (default 400 m ≈ 5 menit jalan kaki) di sekitar tiap halte.
2. **Spatial query**: untuk tiap halte dicari zebra cross / jembatan penyeberangan terdekat (jarak haversine).
   - `d ≤ jarak ideal` (default 200 m) → **Terlayani**
   - `jarak ideal < d ≤ r` → **Kurang terlayani**
   - `d > r` → **Tidak terlayani**

   Hasilnya diurutkan menjadi tabel prioritas. Ada juga mode *query radius*: klik di mana saja untuk
   melihat semua fasilitas dalam radius *r*.
3. **Density**: heatmap sebaran titik fasilitas yang sedang difilter.

## Catatan data

- Titik tidak memiliki kolom kategori, sehingga kategori diturunkan dari awalan nama (`Halte…`, `Zebra Cross…`,
  `Jembatan…`/`Penyebrangan…`, `Trotoar…`). Titik baru harus mengikuti pola penamaan ini.
- Analisis hanya memakai fasilitas yang tercatat dalam survei. Penyeberangan yang ada di lapangan tetapi
  belum disurvei tidak ikut terhitung.
- Koordinat 4D `[x, y, z, null]` dari ekspor KML diratakan ke 2D saat dimuat; file data tidak diubah.
