// Dados e prévias de cada arquivo, feitos NO NAVEGADOR de quem envia (o servidor nunca vê o arquivo).
//   • foto (JPG, PNG): miniatura (lado menor 320 px) e foto grande (lado maior 2048 px), JPG, já de pé (EXIF).
//   • HEIC: o Chrome/Edge no Windows não abrem; converte com heic-to (aprovado em 25/11/2026), carregado só quando
//     aparece um HEIC. Se o CSP do Portal bloquear o conversor, a foto sobe sem prévia (como o RAW) — o original
//     vai sempre.
//   • RAW: a prévia pequena que a câmera grava dentro do arquivo (quando existe) vira a miniatura.
//   • vídeo: duração e medidas pelo próprio navegador; capa = um quadro perto de 1 s; data de criação do arquivo
//     (caixa "mvhd" do MP4/MOV). Se o navegador não tocar o vídeo, anota (medição da prévia de vídeo).
// Dados lidos: data de captura, câmera, largura e altura (EXIF pela biblioteca exifr, aprovada em 25/11/2026).
// Nada aqui impede o envio: o que falhar fica sem prévia ou sem o dado.

import { MINIATURA_PX, PREVIA_PX } from "../../compartilhado/envio.js";

export type Metadados = { largura?: number; altura?: number; duracao_seg?: number; capturado_em?: string; camera?: string };
export type Resultado = { metadados: Metadados; miniatura?: Blob; previa?: Blob; toca?: boolean; semPrevia?: string };

const QUALIDADE = 0.82;
const comPrazo = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, falha) => setTimeout(() => falha(new Error("demorou demais")), ms))]);

function blobDoCanvas(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error("sem imagem"))), "image/jpeg", QUALIDADE));
}

// Redimensiona uma imagem já decodificada para os dois tamanhos.
async function doisTamanhos(img: ImageBitmap | HTMLVideoElement, w: number, h: number, comPrevia: boolean) {
  const desenhar = async (escala: number) => {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * escala));
    c.height = Math.max(1, Math.round(h * escala));
    const g = c.getContext("2d")!;
    g.imageSmoothingQuality = "high";
    g.drawImage(img, 0, 0, c.width, c.height);
    return blobDoCanvas(c);
  };
  const miniatura = await desenhar(Math.min(1, MINIATURA_PX / Math.min(w, h)));
  const previa = comPrevia ? await desenhar(Math.min(1, PREVIA_PX / Math.max(w, h))) : undefined;
  return { miniatura, previa };
}

async function deImagem(fonte: Blob, comPrevia = true) {
  const bmp = await createImageBitmap(fonte, { imageOrientation: "from-image" });
  try {
    return { ...(await doisTamanhos(bmp, bmp.width, bmp.height, comPrevia)), largura: bmp.width, altura: bmp.height };
  } finally {
    bmp.close();
  }
}

// EXIF: data, câmera e medidas (só os campos usados; o exifr lê só o pedaço do arquivo que precisa).
async function lerExif(arquivo: File): Promise<Metadados> {
  try {
    const { default: exifr } = await import("exifr");
    const e = await exifr.parse(arquivo, ["DateTimeOriginal", "CreateDate", "Make", "Model", "ExifImageWidth", "ExifImageHeight"]);
    if (!e) return {};
    const data: Date | undefined = e.DateTimeOriginal instanceof Date ? e.DateTimeOriginal : e.CreateDate instanceof Date ? e.CreateDate : undefined;
    const camera = [e.Make, e.Model].filter((x) => typeof x === "string" && x.trim()).join(" ").replace(/\s+/g, " ").trim();
    return {
      capturado_em: data && !Number.isNaN(data.getTime()) ? data.toISOString() : undefined,
      camera: camera || undefined,
      largura: Number(e.ExifImageWidth) || undefined,
      altura: Number(e.ExifImageHeight) || undefined,
    };
  } catch {
    return {};
  }
}

// Data de criação do MP4/MOV: caixa "mvhd" dentro de "moov" (segundos desde 01/01/1904, UTC).
export async function dataDoVideo(arquivo: Blob): Promise<string | undefined> {
  const ler = async (de: number, ate: number) => new DataView(await arquivo.slice(de, Math.min(ate, arquivo.size)).arrayBuffer());
  const nome = (v: DataView, o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  try {
    let pos = 0;
    for (let i = 0; i < 64 && pos + 8 <= arquivo.size; i++) {
      const v = await ler(pos, pos + 16);
      let tam = v.getUint32(0);
      const tipo = nome(v, 4);
      let cab = 8;
      if (tam === 1) { tam = Number(v.getBigUint64(8)); cab = 16; } else if (tam === 0) tam = arquivo.size - pos;
      if (tam < cab) return undefined;
      if (tipo === "moov") {
        const m = await ler(pos + cab, pos + cab + 32);
        if (nome(m, 4) !== "mvhd") return undefined;
        const versao = m.getUint8(8);
        const seg = versao === 1 ? Number(m.getBigUint64(12)) : m.getUint32(12);
        if (!seg) return undefined;
        const d = new Date((seg - 2082844800) * 1000);
        return d.getUTCFullYear() >= 1990 ? d.toISOString() : undefined;
      }
      pos += tam;
    }
  } catch { /* arquivo estranho: sem data */ }
  return undefined;
}

// Vídeo: medidas, duração e um quadro como capa. `toca` = o navegador conseguiu abrir e mostrar um quadro.
async function deVideo(arquivo: File): Promise<Resultado> {
  const url = URL.createObjectURL(arquivo);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "metadata";
  v.src = url;
  const capturado_em = await dataDoVideo(arquivo);
  try {
    await comPrazo(new Promise<void>((ok, falha) => { v.onloadedmetadata = () => ok(); v.onerror = () => falha(new Error("não abre")); }), 20_000);
    const meta: Metadados = { duracao_seg: Number.isFinite(v.duration) ? v.duration : undefined, largura: v.videoWidth || undefined, altura: v.videoHeight || undefined, capturado_em };
    if (!v.videoWidth || !v.videoHeight) return { metadados: meta, toca: false, semPrevia: "O navegador não abre este vídeo." };
    v.currentTime = Math.min(1, (v.duration || 2) / 2);
    await comPrazo(new Promise<void>((ok, falha) => { v.onseeked = () => ok(); v.onerror = () => falha(new Error("não abre")); }), 20_000);
    const { miniatura } = await doisTamanhos(v, v.videoWidth, v.videoHeight, false);
    return { metadados: meta, miniatura, toca: true };
  } catch {
    return { metadados: { capturado_em }, toca: false, semPrevia: "O navegador não abre este vídeo." };
  } finally {
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
  }
}

async function heicParaJpg(arquivo: File): Promise<Blob> {
  const { heicTo } = await import("heic-to/csp");
  return comPrazo(heicTo({ blob: arquivo, type: "image/jpeg", quality: 0.92 }), 60_000);
}

/** Lê os dados e faz as prévias de um arquivo. Nunca lança erro: o que falhar fica de fora. */
export async function prepararArquivo(arquivo: File, tipo: "foto" | "video" | "raw", extensao: string): Promise<Resultado> {
  if (tipo === "video") return deVideo(arquivo);
  const exif = await lerExif(arquivo);
  if (tipo === "raw") {
    try {
      const { default: exifr } = await import("exifr");
      const t = await exifr.thumbnail(arquivo);
      if (t) {
        const r = await deImagem(new Blob([t], { type: "image/jpeg" }), false);
        return { metadados: exif, miniatura: r.miniatura };
      }
    } catch { /* sem prévia embutida */ }
    return { metadados: exif, semPrevia: "RAW sem prévia embutida." };
  }
  try {
    let fonte: Blob = arquivo;
    if (extensao === "heic" || extensao === "heif") {
      // Alguns navegadores (Safari) abrem HEIC direto; os outros, pelo conversor.
      try { (await createImageBitmap(arquivo)).close(); } catch { fonte = await heicParaJpg(arquivo); }
    }
    const r = await deImagem(fonte);
    return { metadados: { ...exif, largura: exif.largura ?? r.largura, altura: exif.altura ?? r.altura }, miniatura: r.miniatura, previa: r.previa };
  } catch (e) {
    const heic = extensao === "heic" || extensao === "heif";
    return { metadados: exif, semPrevia: heic ? `HEIC sem prévia (${String((e as Error)?.message || e).slice(0, 80)}).` : "Não foi possível ler a imagem." };
  }
}
