/**
 * Logika analisis spasial (tanpa ketergantungan OpenLayers) supaya bisa diuji terpisah.
 * Semua koordinat dalam format [longitude, latitude] (EPSG:4326), jarak dalam meter.
 */

/** Metadata kategori titik fasilitas pedestrian. */
export const KATEGORI = {
  halte: { label: 'Halte', warna: '#0E7C7B' },
  zebra: { label: 'Zebra Cross', warna: '#1D4ED8' },
  jpo: { label: 'Jembatan / Penyeberangan', warna: '#7C3AED' },
  trotoar: { label: 'Trotoar', warna: '#64748B' },
  lainnya: { label: 'Lainnya', warna: '#94A3B8' },
};

/** Kategori yang dihitung sebagai fasilitas penyeberangan. */
export const KATEGORI_PENYEBERANGAN = ['zebra', 'jpo'];

/** Status pelayanan halte terhadap fasilitas penyeberangan. */
export const STATUS = {
  terlayani: { label: 'Terlayani', warna: '#16A34A', skala: 1.0, urutan: 3 },
  kurang: { label: 'Kurang terlayani', warna: '#F59E0B', skala: 1.15, urutan: 2 },
  tidak: { label: 'Tidak terlayani', warna: '#DC2626', skala: 1.3, urutan: 1 },
};

/**
 * Data survei tidak punya kolom kategori, jadi kategori diturunkan dari awalan nama (Title).
 * @param {string} title
 */
export function kategoriDari(title) {
  const t = String(title || '').toLowerCase();
  if (t.startsWith('halte')) return 'halte';
  if (t.includes('zebra')) return 'zebra';
  if (t.includes('jembatan') || t.includes('penyebrangan') || t.includes('penyeberangan')) return 'jpo';
  if (t.includes('trotoar')) return 'trotoar';
  return 'lainnya';
}

/** Jenis area dari nama poligon. */
export function jenisAreaDari(name) {
  return String(name || '').toLowerCase().startsWith('taman') ? 'taman' : 'pedestrian';
}

const R_BUMI = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;

/** Jarak great-circle (haversine) dalam meter. */
export function jarak(a, b) {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R_BUMI * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Cari titik terdekat.
 * @param {number[]} titik [lon, lat]
 * @param {{coord:number[]}[]} kandidat
 * @returns {{item: any, jarak: number} | null}
 */
export function terdekat(titik, kandidat) {
  let best = null;
  for (const k of kandidat) {
    const d = jarak(titik, k.coord);
    if (!best || d < best.jarak) best = { item: k, jarak: d };
  }
  return best;
}

/**
 * Spatial query: semua titik dalam radius tertentu dari pusat, terurut dari yang terdekat.
 */
export function dalamRadius(pusat, titik, radius) {
  return titik
    .map((t) => ({ item: t, jarak: jarak(pusat, t.coord) }))
    .filter((r) => r.jarak <= radius)
    .sort((a, b) => a.jarak - b.jarak);
}

/**
 * Klasifikasi status halte.
 * - Terlayani: penyeberangan terdekat <= jarakIdeal
 * - Kurang terlayani: jarakIdeal < jarak <= radiusBuffer (masih dalam jangkauan jalan kaki)
 * - Tidak terlayani: tidak ada penyeberangan dalam radius buffer
 */
export function statusDari(jarakTerdekat, jarakIdeal, radiusBuffer) {
  if (jarakTerdekat == null) return 'tidak';
  if (jarakTerdekat <= jarakIdeal) return 'terlayani';
  if (jarakTerdekat <= radiusBuffer) return 'kurang';
  return 'tidak';
}

/**
 * Analisis gabungan buffer + spatial query untuk setiap halte.
 * @param {{id:any, nama:string, kategori:string, coord:number[]}[]} titik
 * @param {{radius:number, ideal:number}} param
 */
export function analisisHalte(titik, { radius, ideal }) {
  const halte = titik.filter((t) => t.kategori === 'halte');
  const penyeberangan = titik.filter((t) => KATEGORI_PENYEBERANGAN.includes(t.kategori));
  const hasil = halte.map((h) => {
    const near = terdekat(h.coord, penyeberangan);
    const dalamBuffer = dalamRadius(h.coord, penyeberangan, radius);
    const fasilitasBuffer = dalamRadius(h.coord, titik, radius).filter((r) => r.item.id !== h.id);
    return {
      id: h.id,
      nama: h.nama,
      coord: h.coord,
      penyeberanganTerdekat: near ? near.item.nama : null,
      jarakTerdekat: near ? near.jarak : null,
      jumlahPenyeberanganDalamBuffer: dalamBuffer.length,
      jumlahFasilitasDalamBuffer: fasilitasBuffer.length,
      status: statusDari(near ? near.jarak : null, ideal, radius),
    };
  });
  // Urutan prioritas: status terburuk dulu, lalu jarak terjauh.
  hasil.sort(
    (a, b) =>
      STATUS[a.status].urutan - STATUS[b.status].urutan ||
      (b.jarakTerdekat ?? Infinity) - (a.jarakTerdekat ?? Infinity),
  );
  return hasil;
}

/** Ringkasan jumlah per status. */
export function ringkasan(hasil) {
  const r = { terlayani: 0, kurang: 0, tidak: 0, total: hasil.length };
  for (const h of hasil) r[h.status] += 1;
  return r;
}

/** Format jarak yang ramah dibaca. */
export function formatJarak(m) {
  if (m == null || !isFinite(m)) return '–';
  return m >= 1000 ? `${(m / 1000).toFixed(2).replace('.', ',')} km` : `${Math.round(m)} m`;
}
