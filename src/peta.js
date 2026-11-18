import 'ol/ol.css';
import './style.css';

import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import Overlay from 'ol/Overlay.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import { circular } from 'ol/geom/Polygon.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import HeatmapLayer from 'ol/layer/Heatmap.js';
import OSM from 'ol/source/OSM.js';
import XYZ from 'ol/source/XYZ.js';
import VectorSource from 'ol/source/Vector.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import { getArea, getLength } from 'ol/sphere.js';
import { createEmpty, extend, isEmpty } from 'ol/extent.js';
import { defaults as defaultControls, ScaleLine, FullScreen } from 'ol/control.js';
import { Style, Fill, Stroke, Icon, Text, Circle as CircleStyle } from 'ol/style.js';

import {
  KATEGORI,
  KATEGORI_PENYEBERANGAN,
  STATUS,
  kategoriDari,
  jenisAreaDari,
  analisisHalte,
  dalamRadius,
  terdekat,
  ringkasan,
  formatJarak,
} from './analysis.js';
import { dataUriIkon, svgIkon } from './icons.js';

/* ------------------------------------------------------------------ */
/* State aplikasi                                                       */
/* ------------------------------------------------------------------ */
const state = {
  radius: 400,
  ideal: 200,
  heatRadius: 26,
  kategoriAktif: new Set(Object.keys(KATEGORI)),
  statusFilter: 'semua',
  queryMode: false,
  hasil: [],
  hasilById: new Map(),
};

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const WARNA_JALUR = ['#E11D48', '#EA580C', '#0891B2', '#9333EA', '#CA8A04', '#059669'];
const WARNA_AREA = {
  taman: { fill: 'rgba(22, 163, 74, 0.35)', stroke: '#15803D', label: 'Taman / RTH' },
  pedestrian: { fill: 'rgba(14, 124, 123, 0.22)', stroke: '#0E7C7B', label: 'Area pedestrian' },
};

/* ------------------------------------------------------------------ */
/* Pemuatan data                                                        */
/* ------------------------------------------------------------------ */
const geojson = new GeoJSON();

/** Data survei berisi koordinat [x, y, z, null]; diratakan ke 2D agar aman untuk analisis & render. */
function ke2D(c) {
  return typeof c[0] === 'number' ? [c[0], c[1]] : c.map(ke2D);
}

async function muat(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal memuat ${url} (${res.status})`);
  const json = await res.json();
  for (const f of json.features) f.geometry.coordinates = ke2D(f.geometry.coordinates);
  return geojson.readFeatures(json, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
}

/* ------------------------------------------------------------------ */
/* Basemap                                                              */
/* ------------------------------------------------------------------ */
const basemaps = {
  osm: new TileLayer({ source: new OSM(), visible: true }),
  carto: new TileLayer({
    visible: false,
    source: new XYZ({
      url: 'https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      attributions: '© OpenStreetMap contributors © CARTO',
      maxZoom: 20,
    }),
  }),
  satelit: new TileLayer({
    visible: false,
    source: new XYZ({
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attributions: 'Tiles © Esri — Esri, Maxar, Earthstar Geographics',
      maxZoom: 19,
    }),
  }),
};

/* ------------------------------------------------------------------ */
/* Style                                                                */
/* ------------------------------------------------------------------ */
function styleArea(feature, resolution) {
  const w = WARNA_AREA[feature.get('_jenis')];
  return new Style({
    fill: new Fill({ color: w.fill }),
    stroke: new Stroke({ color: w.stroke, width: 2 }),
    text:
      resolution < 2.5
        ? new Text({
            text: feature.get('Name'),
            font: '600 12px "Plus Jakarta Sans", system-ui, sans-serif',
            fill: new Fill({ color: '#0B3B2A' }),
            stroke: new Stroke({ color: '#fff', width: 3 }),
            overflow: true,
          })
        : undefined,
    zIndex: 1,
  });
}

function styleJalur(feature) {
  const warna = feature.get('_warna');
  return [
    new Style({ stroke: new Stroke({ color: 'rgba(255,255,255,0.95)', width: 8, lineCap: 'round' }) }),
    new Style({ stroke: new Stroke({ color: warna, width: 4.5, lineCap: 'round', lineJoin: 'round' }) }),
  ];
}

const cacheIkon = {};
function ikonStyle(kategori, warna, skala) {
  const key = `${kategori}|${warna}|${skala}`;
  if (!cacheIkon[key]) {
    cacheIkon[key] = new Style({
      image: new Icon({ src: dataUriIkon(kategori, warna, 40), scale: 0.72 * skala }),
      zIndex: kategori === 'halte' ? 3 : 2,
    });
  }
  return cacheIkon[key];
}

/** Halte: warna & ukuran mengikuti status. Kategori lain: warna kategori. */
function infoVisual(feature) {
  const kat = feature.get('_kategori');
  if (kat === 'halte') {
    const h = state.hasilById.get(feature.getId());
    if (h) return { kat, warna: STATUS[h.status].warna, skala: STATUS[h.status].skala, status: h.status };
  }
  return { kat, warna: KATEGORI[kat].warna, skala: 1, status: null };
}

function titikTampil(feature) {
  const kat = feature.get('_kategori');
  if (!state.kategoriAktif.has(kat)) return false;
  if (kat === 'halte' && state.statusFilter !== 'semua') {
    const h = state.hasilById.get(feature.getId());
    return !!h && h.status === state.statusFilter;
  }
  return true;
}

function styleTitik(feature) {
  if (!titikTampil(feature)) return null;
  const v = infoVisual(feature);
  return ikonStyle(v.kat, v.warna, v.skala);
}

function hexKeRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function styleBuffer(feature) {
  const warna = STATUS[feature.get('_status')].warna;
  return new Style({
    fill: new Fill({ color: hexKeRgba(warna, 0.1) }),
    stroke: new Stroke({ color: hexKeRgba(warna, 0.85), width: 1.5, lineDash: [6, 5] }),
  });
}

const styleQuery = [
  new Style({
    fill: new Fill({ color: 'rgba(242, 183, 5, 0.12)' }),
    stroke: new Stroke({ color: '#B45309', width: 2, lineDash: [2, 6], lineCap: 'round' }),
  }),
];
const stylePusatQuery = new Style({
  image: new CircleStyle({ radius: 6, fill: new Fill({ color: '#B45309' }), stroke: new Stroke({ color: '#fff', width: 2 }) }),
});

const styleSorot = new Style({
  image: new CircleStyle({ radius: 20, stroke: new Stroke({ color: '#F2B705', width: 3 }), fill: new Fill({ color: 'rgba(242,183,5,0.15)' }) }),
  stroke: new Stroke({ color: '#F2B705', width: 3 }),
  zIndex: 10,
});

/* ------------------------------------------------------------------ */
/* Layer                                                                */
/* ------------------------------------------------------------------ */
const areaSource = new VectorSource();
const jalurSource = new VectorSource();
const titikSource = new VectorSource();
const bufferSource = new VectorSource();
const heatSource = new VectorSource();
const querySource = new VectorSource();
const sorotSource = new VectorSource();

const areaLayer = new VectorLayer({ source: areaSource, style: styleArea, zIndex: 10 });
const bufferLayer = new VectorLayer({ source: bufferSource, style: styleBuffer, zIndex: 15 });
const jalurLayer = new VectorLayer({ source: jalurSource, style: styleJalur, zIndex: 20 });
const heatLayer = new HeatmapLayer({
  source: heatSource,
  radius: state.heatRadius,
  blur: Math.round(state.heatRadius * 1.2),
  opacity: 0.8,
  visible: false,
  zIndex: 25,
});
const titikLayer = new VectorLayer({ source: titikSource, style: styleTitik, zIndex: 30, declutter: false });
const queryLayer = new VectorLayer({
  source: querySource,
  style: (f) => (f.get('_q') === 'pusat' ? stylePusatQuery : styleQuery),
  zIndex: 35,
});
const sorotLayer = new VectorLayer({ source: sorotSource, style: styleSorot, zIndex: 40 });

/* ------------------------------------------------------------------ */
/* Peta                                                                 */
/* ------------------------------------------------------------------ */
const popupEl = $('popup');
const popup = new Overlay({ element: popupEl, autoPan: { animation: { duration: 250 } }, positioning: 'bottom-center', offset: [0, -14] });

const map = new OlMap({
  target: 'map',
  layers: [...Object.values(basemaps), areaLayer, bufferLayer, jalurLayer, heatLayer, titikLayer, queryLayer, sorotLayer],
  overlays: [popup],
  controls: defaultControls().extend([new ScaleLine({ units: 'metric' }), new FullScreen()]),
  view: new View({ center: fromLonLat([101.4475, 0.525]), zoom: 13, maxZoom: 20 }),
});

/* ------------------------------------------------------------------ */
/* Analisis                                                             */
/* ------------------------------------------------------------------ */
function dataTitik() {
  return titikSource.getFeatures().map((f) => ({
    id: f.getId(),
    nama: f.get('Title'),
    kategori: f.get('_kategori'),
    coord: f.get('_lonlat'),
  }));
}

function jalankanAnalisis() {
  state.hasil = analisisHalte(dataTitik(), { radius: state.radius, ideal: state.ideal });
  state.hasilById = new Map(state.hasil.map((h) => [h.id, h]));
  perbaruiBuffer();
  titikLayer.changed();
  renderHasil();
  renderLegenda();
}

function perbaruiBuffer() {
  bufferSource.clear();
  if (!state.kategoriAktif.has('halte')) return;
  const fitur = state.hasil
    .filter((h) => state.statusFilter === 'semua' || h.status === state.statusFilter)
    .map((h) => {
      const geom = circular(h.coord, state.radius, 72).transform('EPSG:4326', 'EPSG:3857');
      return new Feature({ geometry: geom, _status: h.status, _halteId: h.id, _nama: h.nama });
    });
  bufferSource.addFeatures(fitur);
}

function perbaruiHeatmap() {
  heatSource.clear();
  const fitur = titikSource
    .getFeatures()
    .filter(titikTampil)
    .map((f) => new Feature({ geometry: f.getGeometry().clone() }));
  heatSource.addFeatures(fitur);
}

function queryDi(coord3857) {
  const pusat = toLonLat(coord3857);
  const kandidat = titikSource
    .getFeatures()
    .filter(titikTampil)
    .map((f) => ({ id: f.getId(), nama: f.get('Title'), kategori: f.get('_kategori'), coord: f.get('_lonlat') }));
  const hasil = dalamRadius(pusat, kandidat, state.radius);

  querySource.clear();
  querySource.addFeature(
    new Feature({ geometry: circular(pusat, state.radius, 72).transform('EPSG:4326', 'EPSG:3857'), _q: 'area' }),
  );
  querySource.addFeature(new Feature({ geometry: new Point(coord3857), _q: 'pusat' }));

  const perKategori = {};
  for (const r of hasil) perKategori[r.item.kategori] = (perKategori[r.item.kategori] || 0) + 1;

  let html = `<h4>Query radius ${state.radius} m</h4>
    <p class="muted">${pusat[1].toFixed(5)}, ${pusat[0].toFixed(5)}</p>`;
  if (!hasil.length) {
    html += '<p>Tidak ada fasilitas (sesuai filter) dalam radius ini.</p>';
  } else {
    html += `<p><b>${hasil.length}</b> fasilitas ditemukan:
      ${Object.entries(perKategori)
        .map(([k, n]) => `<span class="pill" style="--c:${KATEGORI[k].warna}">${n} ${esc(KATEGORI[k].label)}</span>`)
        .join(' ')}</p>
      <ol class="qlist">${hasil
        .slice(0, 12)
        .map((r) => `<li data-id="${r.item.id}"><span>${esc(r.item.nama)}</span><b>${formatJarak(r.jarak)}</b></li>`)
        .join('')}</ol>`;
    if (hasil.length > 12) html += `<p class="muted">+${hasil.length - 12} lainnya</p>`;
  }
  bukaPopup(html, coord3857);
  $('popup-content')
    .querySelectorAll('li[data-id]')
    .forEach((li) => li.addEventListener('click', () => fokusTitik(Number(li.dataset.id))));
}

/* ------------------------------------------------------------------ */
/* Popup                                                                */
/* ------------------------------------------------------------------ */
function bukaPopup(html, coord) {
  $('popup-content').innerHTML = html;
  popup.setPosition(coord);
}
function tutupPopup() {
  popup.setPosition(undefined);
  sorotSource.clear();
}
$('popup-closer').addEventListener('click', (e) => {
  e.preventDefault();
  tutupPopup();
});

const tgl = (s) => {
  if (!s || !String(s).trim()) return '–';
  const d = new Date(String(s).slice(0, 10));
  return isNaN(d) ? esc(s) : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};
const baris = (k, v) => `<tr><th>${k}</th><td>${v}</td></tr>`;
const badgeStatus = (s) => `<span class="badge" style="--c:${STATUS[s].warna}">${STATUS[s].label}</span>`;

function htmlTitik(f) {
  const kat = f.get('_kategori');
  const [lon, lat] = f.get('_lonlat');
  let html = `<div class="pop-head"><span class="pop-ikon">${svgIkon(kat, infoVisual(f).warna, 28)}</span>
    <div><small>${esc(KATEGORI[kat].label)}</small><h4>${esc(f.get('Title'))}</h4></div></div><table class="kv">`;
  if (kat === 'halte') {
    const h = state.hasilById.get(f.getId());
    if (h) {
      html += baris('Status', badgeStatus(h.status));
      html += baris('Penyeberangan terdekat', `${esc(h.penyeberanganTerdekat ?? '–')}<br><b>${formatJarak(h.jarakTerdekat)}</b>`);
      html += baris(`Penyeberangan ≤ ${state.radius} m`, h.jumlahPenyeberanganDalamBuffer);
      html += baris(`Fasilitas lain ≤ ${state.radius} m`, h.jumlahFasilitasDalamBuffer);
    }
  } else if (KATEGORI_PENYEBERANGAN.includes(kat)) {
    const halte = dataTitik().filter((t) => t.kategori === 'halte');
    const near = terdekat(f.get('_lonlat'), halte);
    if (near) html += baris('Halte terdekat', `${esc(near.item.nama)}<br><b>${formatJarak(near.jarak)}</b>`);
  }
  html += baris('Elevasi', f.get('Elevation') != null ? `${Number(f.get('Elevation')).toFixed(1)} m` : '–');
  html += baris('Koordinat', `${lat.toFixed(6)}, ${lon.toFixed(6)}`);
  html += baris('Tanggal survei', tgl(f.get('Date_Creat')));
  return html + '</table>';
}

function htmlJalur(f) {
  return `<div class="pop-head"><span class="pop-garis" style="--c:${f.get('_warna')}"></span>
    <div><small>Jalur pedestrian</small><h4>${esc(f.get('Name'))}</h4></div></div><table class="kv">
    ${baris('Panjang', formatJarak(f.get('_panjang')))}
    ${baris('Jumlah titik GPS', f.getGeometry().getCoordinates().length)}
    ${baris('Tanggal survei', tgl(f.get('BeginTime')))}</table>`;
}

function htmlArea(f) {
  const w = WARNA_AREA[f.get('_jenis')];
  return `<div class="pop-head"><span class="pop-area" style="--c:${w.stroke}"></span>
    <div><small>${w.label}</small><h4>${esc(f.get('Name'))}</h4></div></div><table class="kv">
    ${baris('Luas', `${Math.round(f.get('_luas')).toLocaleString('id-ID')} m²`)}
    ${baris('Keliling', formatJarak(f.get('_keliling')))}
    ${baris('Tanggal survei', tgl(f.get('BeginTime')))}</table>`;
}

function htmlBuffer(f) {
  const h = state.hasilById.get(f.get('_halteId'));
  return `<h4>Buffer ${state.radius} m</h4><p>${esc(f.get('_nama'))}</p><table class="kv">
    ${baris('Status', badgeStatus(f.get('_status')))}
    ${h ? baris('Penyeberangan dalam buffer', h.jumlahPenyeberanganDalamBuffer) : ''}
    ${h ? baris('Fasilitas lain dalam buffer', h.jumlahFasilitasDalamBuffer) : ''}</table>`;
}

function sorot(feature) {
  sorotSource.clear();
  sorotSource.addFeature(new Feature({ geometry: feature.getGeometry().clone() }));
}

function fokusTitik(id) {
  const f = titikSource.getFeatureById(id);
  if (!f) return;
  const coord = f.getGeometry().getCoordinates();
  map.getView().animate({ center: coord, zoom: Math.max(map.getView().getZoom(), 17), duration: 450 });
  sorot(f);
  bukaPopup(htmlTitik(f), coord);
  if (window.matchMedia('(max-width: 860px)').matches) document.body.classList.remove('panel-open');
}

/* ------------------------------------------------------------------ */
/* Interaksi peta                                                       */
/* ------------------------------------------------------------------ */
const layerUtama = [titikLayer, jalurLayer, areaLayer];

function cariFitur(pixel) {
  const opsi = (layers) => ({ layerFilter: (l) => layers.includes(l), hitTolerance: 5 });
  return (
    map.forEachFeatureAtPixel(pixel, (f, l) => ({ f, l }), opsi(layerUtama)) ||
    map.forEachFeatureAtPixel(pixel, (f, l) => ({ f, l }), opsi([bufferLayer]))
  );
}

map.on('singleclick', (evt) => {
  if (state.queryMode) {
    sorotSource.clear();
    queryDi(evt.coordinate);
    return;
  }
  const hit = cariFitur(evt.pixel);
  if (!hit) {
    tutupPopup();
    return;
  }
  const { f, l } = hit;
  if (l === titikLayer) {
    sorot(f);
    bukaPopup(htmlTitik(f), f.getGeometry().getCoordinates());
  } else if (l === jalurLayer) {
    sorot(f);
    bukaPopup(htmlJalur(f), evt.coordinate);
  } else if (l === areaLayer) {
    sorot(f);
    bukaPopup(htmlArea(f), evt.coordinate);
  } else if (l === bufferLayer) {
    sorotSource.clear();
    bukaPopup(htmlBuffer(f), evt.coordinate);
  }
});

map.on('pointermove', (evt) => {
  if (evt.dragging) return;
  const target = map.getTargetElement();
  if (state.queryMode) {
    target.style.cursor = 'crosshair';
    return;
  }
  const hit = map.hasFeatureAtPixel(evt.pixel, { layerFilter: (l) => layerUtama.includes(l), hitTolerance: 5 });
  target.style.cursor = hit ? 'pointer' : '';
});

function zoomSemua() {
  const ext = createEmpty();
  for (const s of [areaSource, jalurSource, titikSource]) if (s.getFeatures().length) extend(ext, s.getExtent());
  if (!isEmpty(ext)) map.getView().fit(ext, { padding: [60, 60, 60, 60], duration: 400, maxZoom: 17 });
}
$('btn-fit').addEventListener('click', zoomSemua);

/* ------------------------------------------------------------------ */
/* Panel: tab, layer, filter, analisis                                  */
/* ------------------------------------------------------------------ */
document.querySelectorAll('.tab').forEach((btn) =>
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-body').forEach((b) => b.classList.toggle('active', b.id === btn.dataset.tab));
  }),
);
$('btn-panel').addEventListener('click', () => document.body.classList.toggle('panel-open'));

$('basemap').addEventListener('change', (e) => {
  for (const [k, l] of Object.entries(basemaps)) l.setVisible(k === e.target.value);
});

const ikat = (id, layer) => $(id).addEventListener('change', (e) => {
  layer.setVisible(e.target.checked);
  renderLegenda();
});
ikat('lyr-titik', titikLayer);
ikat('lyr-jalur', jalurLayer);
ikat('lyr-area', areaLayer);
ikat('lyr-buffer', bufferLayer);

function setHeat(on) {
  heatLayer.setVisible(on);
  $('lyr-heat').checked = on;
  $('lyr-heat-2').checked = on;
  renderLegenda();
}
$('lyr-heat').addEventListener('change', (e) => setHeat(e.target.checked));
$('lyr-heat-2').addEventListener('change', (e) => setHeat(e.target.checked));

function renderFilterKategori() {
  const jumlah = {};
  for (const f of titikSource.getFeatures()) jumlah[f.get('_kategori')] = (jumlah[f.get('_kategori')] || 0) + 1;
  $('filter-kategori').innerHTML = Object.entries(KATEGORI)
    .filter(([k]) => jumlah[k])
    .map(
      ([k, m]) => `<label class="check">
        <input type="checkbox" data-kat="${k}" ${state.kategoriAktif.has(k) ? 'checked' : ''} />
        <span class="ikon-mini">${svgIkon(k, m.warna, 20)}</span><span>${esc(m.label)}</span><em>${jumlah[k]}</em>
      </label>`,
    )
    .join('');
  $('filter-kategori')
    .querySelectorAll('input[data-kat]')
    .forEach((cb) =>
      cb.addEventListener('change', () => {
        if (cb.checked) state.kategoriAktif.add(cb.dataset.kat);
        else state.kategoriAktif.delete(cb.dataset.kat);
        filterBerubah();
      }),
    );
}

function setSemuaKategori(on) {
  state.kategoriAktif = new Set(on ? Object.keys(KATEGORI) : []);
  $('filter-kategori').querySelectorAll('input[data-kat]').forEach((cb) => (cb.checked = on));
  filterBerubah();
}
$('kat-semua').addEventListener('click', () => setSemuaKategori(true));
$('kat-kosong').addEventListener('click', () => setSemuaKategori(false));

$('status-filter').addEventListener('change', (e) => {
  state.statusFilter = e.target.value;
  filterBerubah();
});

function filterBerubah() {
  titikLayer.changed();
  perbaruiBuffer();
  perbaruiHeatmap();
  tutupPopup();
  querySource.clear();
}

$('radius').addEventListener('input', (e) => {
  state.radius = Number(e.target.value);
  $('radius-val').textContent = `${state.radius} m`;
  if (state.ideal > state.radius) {
    state.ideal = state.radius;
    $('ideal').value = state.ideal;
    $('ideal-val').textContent = `${state.ideal} m`;
  }
  jalankanAnalisis();
  querySource.clear();
});

$('ideal').addEventListener('input', (e) => {
  state.ideal = Math.min(Number(e.target.value), state.radius);
  e.target.value = state.ideal;
  $('ideal-val').textContent = `${state.ideal} m`;
  jalankanAnalisis();
});

$('heat-radius').addEventListener('input', (e) => {
  state.heatRadius = Number(e.target.value);
  $('heat-radius-val').textContent = `${state.heatRadius} px`;
  heatLayer.setRadius(state.heatRadius);
  heatLayer.setBlur(Math.round(state.heatRadius * 1.2));
});

$('btn-query').addEventListener('click', () => {
  state.queryMode = !state.queryMode;
  $('btn-query').classList.toggle('on', state.queryMode);
  $('btn-query').textContent = state.queryMode ? 'Matikan query radius' : 'Aktifkan query radius';
  $('query-hint').hidden = !state.queryMode;
  if (!state.queryMode) {
    querySource.clear();
    tutupPopup();
  }
});

/* ------------------------------------------------------------------ */
/* Hasil & legenda                                                      */
/* ------------------------------------------------------------------ */
function renderHasil() {
  const r = ringkasan(state.hasil);
  $('ringkasan').innerHTML = ['tidak', 'kurang', 'terlayani']
    .map(
      (s) => `<button class="stat" data-status="${s}" style="--c:${STATUS[s].warna}">
        <b>${r[s]}</b><span>${STATUS[s].label}</span></button>`,
    )
    .join('');
  $('ringkasan')
    .querySelectorAll('.stat')
    .forEach((b) =>
      b.addEventListener('click', () => {
        const s = state.statusFilter === b.dataset.status ? 'semua' : b.dataset.status;
        state.statusFilter = s;
        $('status-filter').value = s;
        filterBerubah();
      }),
    );
  const persen = r.total ? Math.round((r.tidak / r.total) * 100) : 0;
  $('ringkasan-teks').innerHTML =
    `Dengan buffer <b>${state.radius} m</b> dan jarak ideal <b>${state.ideal} m</b>, ` +
    `<b>${r.tidak} dari ${r.total} halte (${persen}%)</b> tidak memiliki fasilitas penyeberangan dalam jangkauan jalan kaki.`;

  $('tabel-prioritas').innerHTML = state.hasil
    .map(
      (h, i) => `<tr data-id="${h.id}">
        <td>${i + 1}</td>
        <td>${esc(h.nama.replace(/^Halte\s+/i, ''))}</td>
        <td class="num">${formatJarak(h.jarakTerdekat)}</td>
        <td><i class="dot" style="--c:${STATUS[h.status].warna}" title="${STATUS[h.status].label}"></i></td>
      </tr>`,
    )
    .join('');
  $('tabel-prioritas')
    .querySelectorAll('tr[data-id]')
    .forEach((tr) => tr.addEventListener('click', () => fokusTitik(Number(tr.dataset.id))));
}

function renderLegenda() {
  let html = '<button class="lg-toggle" id="lg-toggle" aria-label="Buka/tutup legenda"><h4>Legenda</h4><span>▾</span></button><div class="lg-body">';
  if (titikLayer.getVisible()) {
    html += '<div class="lg-group"><small>Titik fasilitas</small>';
    for (const s of ['tidak', 'kurang', 'terlayani']) {
      const px = Math.round(18 * STATUS[s].skala);
      html += `<div class="lg-row"><span class="lg-sym">${svgIkon('halte', STATUS[s].warna, px)}</span>Halte – ${STATUS[s].label}</div>`;
    }
    for (const k of ['zebra', 'jpo', 'trotoar']) {
      html += `<div class="lg-row"><span class="lg-sym">${svgIkon(k, KATEGORI[k].warna, 18)}</span>${KATEGORI[k].label}</div>`;
    }
    html += '</div>';
  }
  if (jalurLayer.getVisible()) {
    html += '<div class="lg-group"><small>Jalur pedestrian</small>';
    for (const f of jalurSource.getFeatures().sort((a, b) => a.get('Name').localeCompare(b.get('Name')))) {
      html += `<div class="lg-row"><span class="lg-line" style="--c:${f.get('_warna')}"></span>${esc(f.get('Name').replace(/^Jal(an|ur) Pedestrian\s+/i, ''))}</div>`;
    }
    html += '</div>';
  }
  if (areaLayer.getVisible()) {
    html += '<div class="lg-group"><small>Area</small>';
    for (const w of Object.values(WARNA_AREA)) {
      html += `<div class="lg-row"><span class="lg-area" style="--c:${w.stroke};--f:${w.fill}"></span>${w.label}</div>`;
    }
    html += '</div>';
  }
  if (bufferLayer.getVisible()) {
    html += `<div class="lg-group"><small>Analisis</small><div class="lg-row"><span class="lg-buffer"></span>Buffer ${state.radius} m (warna = status)</div></div>`;
  }
  if (heatLayer.getVisible()) {
    html += '<div class="lg-group"><small>Kepadatan</small><div class="lg-heat"></div><div class="lg-heat-lbl"><span>rendah</span><span>tinggi</span></div></div>';
  }
  $('legenda').innerHTML = html + '</div>';
  $('lg-toggle').addEventListener('click', () => $('legenda').classList.toggle('collapsed'));
}

/* ------------------------------------------------------------------ */
/* Inisialisasi                                                         */
/* ------------------------------------------------------------------ */
async function init() {
  if (window.matchMedia('(max-width: 860px)').matches) $('legenda').classList.add('collapsed');
  try {
    const [area, jalur, titik] = await Promise.all([
      muat('data/areaPedestrian.json'),
      muat('data/jalurPedestrian.json'),
      muat('data/titikPedestrian.json'),
    ]);

    for (const f of area) {
      f.set('_jenis', jenisAreaDari(f.get('Name')));
      f.set('_luas', getArea(f.getGeometry()));
      f.set('_keliling', getLength(f.getGeometry()));
    }
    jalur.forEach((f, i) => {
      f.set('_warna', WARNA_JALUR[i % WARNA_JALUR.length]);
      f.set('_panjang', getLength(f.getGeometry()));
    });
    for (const f of titik) {
      f.set('_kategori', kategoriDari(f.get('Title')));
      f.set('_lonlat', toLonLat(f.getGeometry().getCoordinates()));
    }

    areaSource.addFeatures(area);
    jalurSource.addFeatures(jalur);
    titikSource.addFeatures(titik);

    $('n-titik').textContent = titik.length;
    $('n-jalur').textContent = jalur.length;
    $('n-area').textContent = area.length;

    renderFilterKategori();
    jalankanAnalisis();
    perbaruiHeatmap();
    zoomSemua();
    $('loading').remove();
  } catch (err) {
    console.error(err);
    $('loading').textContent = `Gagal memuat data: ${err.message}`;
    $('loading').classList.add('error');
  }
}

init();
