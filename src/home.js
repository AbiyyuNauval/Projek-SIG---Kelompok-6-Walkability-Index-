import './style.css';
import { kategoriDari, KATEGORI_PENYEBERANGAN, jarak, formatJarak } from './analysis.js';
import { svgIkon } from './icons.js';

// Ikon dekoratif di ilustrasi hero
document.querySelectorAll('.pin[data-ikon]').forEach((el) => {
  el.innerHTML = svgIkon(el.dataset.ikon, el.dataset.warna, 46);
});

/** Panjang LineString [lon, lat] dalam meter. */
function panjangGaris(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += jarak(coords[i - 1], coords[i]);
  return total;
}

// Statistik ringkas dihitung langsung dari data, bukan diketik manual.
async function isiStatistik() {
  try {
    const [titik, jalur] = await Promise.all(
      ['data/titikPedestrian.json', 'data/jalurPedestrian.json'].map((u) => fetch(u).then((r) => r.json())),
    );
    const kat = titik.features.map((f) => kategoriDari(f.properties.Title));
    const panjang = jalur.features.reduce((s, f) => s + panjangGaris(f.geometry.coordinates), 0);
    const set = (k, v) => (document.querySelector(`[data-stat="${k}"]`).textContent = v);
    set('titik', titik.features.length);
    set('halte', kat.filter((k) => k === 'halte').length);
    set('penyeberangan', kat.filter((k) => KATEGORI_PENYEBERANGAN.includes(k)).length);
    set('jalur', `${jalur.features.length} · ${formatJarak(panjang)}`);
  } catch (e) {
    console.warn('Statistik gagal dimuat', e);
  }
}
isiStatistik();
