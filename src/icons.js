/**
 * Ikon SVG buatan sendiri (tanpa file gambar eksternal), dipakai di peta dan legenda.
 * Setiap kategori punya bentuk/glyph berbeda; warna isi bisa diganti (mis. warna status halte).
 */

const GLYPH = {
  // Bus kecil
  halte:
    '<rect x="8" y="7" width="16" height="15" rx="3" fill="#fff"/>' +
    '<rect x="10" y="9.5" width="12" height="5" rx="1" fill="COLOR"/>' +
    '<circle cx="12" cy="18.5" r="1.4" fill="COLOR"/><circle cx="20" cy="18.5" r="1.4" fill="COLOR"/>' +
    '<rect x="10" y="22" width="3" height="2.5" rx=".6" fill="#fff"/><rect x="19" y="22" width="3" height="2.5" rx=".6" fill="#fff"/>',
  // Garis zebra
  zebra:
    '<rect x="8" y="8" width="3" height="16" rx="1" fill="#fff"/>' +
    '<rect x="14.5" y="8" width="3" height="16" rx="1" fill="#fff"/>' +
    '<rect x="21" y="8" width="3" height="16" rx="1" fill="#fff"/>',
  // Jembatan penyeberangan
  jpo:
    '<path d="M7 20 Q16 9 25 20" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
    '<rect x="6" y="19.5" width="20" height="2.6" rx="1" fill="#fff"/>' +
    '<rect x="9" y="15" width="2" height="5" fill="#fff"/><rect x="21" y="15" width="2" height="5" fill="#fff"/>',
  // Jejak kaki
  trotoar:
    '<ellipse cx="12.5" cy="13" rx="3" ry="4.5" fill="#fff"/><circle cx="12.5" cy="20.5" r="2.2" fill="#fff"/>' +
    '<ellipse cx="19.5" cy="15" rx="3" ry="4.5" fill="#fff"/><circle cx="19.5" cy="22.5" r="2.2" fill="#fff"/>',
  lainnya: '<circle cx="16" cy="16" r="5" fill="#fff"/>',
};

/** Bentuk latar: halte persegi membulat, penyeberangan lingkaran, trotoar belah ketupat. */
function latar(kategori, warna) {
  if (kategori === 'halte') {
    return `<rect x="2" y="2" width="28" height="28" rx="8" fill="${warna}" stroke="#fff" stroke-width="2.5"/>`;
  }
  if (kategori === 'trotoar') {
    return `<rect x="5" y="5" width="22" height="22" rx="4" transform="rotate(45 16 16)" fill="${warna}" stroke="#fff" stroke-width="2.5"/>`;
  }
  return `<circle cx="16" cy="16" r="14" fill="${warna}" stroke="#fff" stroke-width="2.5"/>`;
}

export function svgIkon(kategori, warna, ukuran = 32) {
  const glyph = (GLYPH[kategori] || GLYPH.lainnya).replaceAll('COLOR', warna);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ukuran}" height="${ukuran}" viewBox="0 0 32 32">` +
    latar(kategori, warna) +
    glyph +
    '</svg>'
  );
}

export function dataUriIkon(kategori, warna, ukuran = 32) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgIkon(kategori, warna, ukuran));
}
