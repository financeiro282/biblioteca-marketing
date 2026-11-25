// Formatos aceitos e como mostrar tamanho e duração. Usado pela tela, pela API e pelo modo demonstração.
//
// Pedido do Lucas (24/11/2026): JPG, PNG, HEIC, MP4, MOV e guardar RAW (sem prévia, se não for viável).
// O ORIGINAL é sempre guardado como veio (sem compressão). Miniatura e prévia são JPG gerados à parte.

/** @type {Record<string, { tipo: 'foto' | 'video' | 'raw', mime: string, rotulo: string }>} */
export const FORMATOS = {
  jpg: { tipo: 'foto', mime: 'image/jpeg', rotulo: 'JPG' },
  jpeg: { tipo: 'foto', mime: 'image/jpeg', rotulo: 'JPG' },
  png: { tipo: 'foto', mime: 'image/png', rotulo: 'PNG' },
  heic: { tipo: 'foto', mime: 'image/heic', rotulo: 'HEIC' },
  heif: { tipo: 'foto', mime: 'image/heif', rotulo: 'HEIF' },
  mp4: { tipo: 'video', mime: 'video/mp4', rotulo: 'MP4' },
  mov: { tipo: 'video', mime: 'video/quicktime', rotulo: 'MOV' },
  // RAW das câmeras mais comuns (Canon, Nikon, Sony, Adobe/Leica/celulares, Fujifilm, Olympus, Panasonic).
  cr2: { tipo: 'raw', mime: 'image/x-canon-cr2', rotulo: 'RAW (Canon)' },
  cr3: { tipo: 'raw', mime: 'image/x-canon-cr3', rotulo: 'RAW (Canon)' },
  nef: { tipo: 'raw', mime: 'image/x-nikon-nef', rotulo: 'RAW (Nikon)' },
  arw: { tipo: 'raw', mime: 'image/x-sony-arw', rotulo: 'RAW (Sony)' },
  dng: { tipo: 'raw', mime: 'image/x-adobe-dng', rotulo: 'RAW (DNG)' },
  raf: { tipo: 'raw', mime: 'image/x-fuji-raf', rotulo: 'RAW (Fujifilm)' },
  orf: { tipo: 'raw', mime: 'image/x-olympus-orf', rotulo: 'RAW (Olympus)' },
  rw2: { tipo: 'raw', mime: 'image/x-panasonic-rw2', rotulo: 'RAW (Panasonic)' },
};

export const TIPOS = [
  { codigo: 'foto', rotulo: 'Foto' },
  { codigo: 'video', rotulo: 'Vídeo' },
  { codigo: 'raw', rotulo: 'RAW' },
];
export const CODIGOS_TIPO = TIPOS.map((t) => t.codigo);
export const rotuloDoTipo = (t) => TIPOS.find((x) => x.codigo === t)?.rotulo ?? t;

/** Extensão (minúscula, sem ponto) e formato a partir do nome do arquivo; null = não aceito. */
export function formatoDoArquivo(nome) {
  const m = /\.([A-Za-z0-9]{1,10})$/.exec(String(nome || ''));
  const extensao = m ? m[1].toLowerCase() : '';
  const f = FORMATOS[extensao];
  return f ? { extensao, ...f } : null;
}

/** Tamanho como o Windows mostra (base 1024): "820 KB", "4,2 GB". */
export function tamanhoLegivel(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '—';
  const unidades = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  let v = n, i = 0;
  while (v >= 1024 && i < unidades.length - 1) { v /= 1024; i++; }
  const casas = i === 0 ? 0 : v < 10 ? 1 : 0;
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })} ${unidades[i]}`;
}

/** Duração de vídeo: "0:42", "12:05", "1:02:03". */
export function duracaoLegivel(segundos) {
  const s = Math.round(Number(segundos));
  if (!Number.isFinite(s) || s < 0) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const dd = (x) => String(x).padStart(2, '0');
  return h ? `${h}:${dd(m)}:${dd(r)}` : `${m}:${dd(r)}`;
}
