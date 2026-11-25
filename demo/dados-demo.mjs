// Dados 100% FICTÍCIOS do modo demonstração (nenhuma foto, pessoa, evento ou e-mail de verdade).
// Gerados sempre iguais (sorteio com semente fixa), para a tela e os testes verem a mesma coisa.

export const PERFIS = [
  { codigo: 'colaborador', rotulo: 'Colaborador' },
  { codigo: 'marketing', rotulo: 'Marketing' },
  { codigo: 'admin', rotulo: 'Administrador' },
];
export const PESSOA = { email: 'demonstracao@exemplo.invalid', nome: 'Pessoa Demonstração' };

// Sorteio com semente (LCG): mesmo resultado a cada execução.
function sorteador(semente) {
  let s = semente >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
const sorte = sorteador(20261124);
const um = (lista) => lista[Math.floor(sorte() * lista.length)];
const uuid = (prefixo, n) => `${prefixo}-0000-4000-8000-${String(n).padStart(12, '0')}`;

// Eventos (álbuns). Um "Sem autorização" (termo de imagem pendente) e eventos internos, para ver o que cada
// perfil enxerga.
const EVENTOS_BASE = [
  { nome: 'Convenção de Vendas 2026', data_evento: '2026-03-12', local: 'São Paulo/SP', direito_uso: 'liberado',
    tags: ['convencao', 'equipe comercial'], responsavel: 'Marketing (exemplo)', descricao: 'Abertura, palestras e premiação da equipe comercial.', n: 22 },
  { nome: 'Feira Hospitalar 2026', data_evento: '2026-05-19', local: 'São Paulo/SP', direito_uso: 'liberado',
    tags: ['feira', 'estande'], responsavel: 'Marketing (exemplo)', descricao: 'Estande, demonstrações de produto e visitas.', n: 30 },
  { nome: 'Treinamento de produto — joelho', data_evento: '2026-06-03', local: 'Escritório', direito_uso: 'interno',
    tags: ['treinamento', 'joelho'], responsavel: 'Educação continuada (exemplo)', descricao: 'Treinamento interno da equipe técnica.', n: 14 },
  { nome: 'Workshop com cirurgiões', data_evento: '2026-08-21', local: 'Curitiba/PR', direito_uso: 'sem_autorizacao',
    tags: ['workshop', 'cirurgioes'], responsavel: 'Marketing (exemplo)', descricao: 'Termos de uso de imagem dos participantes ainda pendentes.', n: 12 },
  { nome: 'Lançamento da linha de coluna', data_evento: '2025-09-30', local: 'Rio de Janeiro/RJ', direito_uso: 'liberado',
    tags: ['lancamento', 'coluna'], responsavel: 'Marketing (exemplo)', descricao: 'Evento de lançamento com convidados.', n: 18 },
  { nome: 'Confraternização de fim de ano 2025', data_evento: '2025-12-12', local: 'São Paulo/SP', direito_uso: 'interno',
    tags: ['confraternizacao'], responsavel: 'RH (exemplo)', descricao: 'Fotos da confraternização da equipe.', n: 16 },
];

const LEGENDAS = ['Palestra de abertura', 'Equipe no estande', 'Demonstração de produto', 'Plateia', 'Premiação',
  'Visita de clientes', 'Coffee break', 'Painel de discussão', 'Foto oficial da equipe', 'Bastidores'];
const AUTORES = ['Fotógrafo A (exemplo)', 'Fotógrafa B (exemplo)', 'Equipe de Marketing (exemplo)'];
const CAMERAS = ['Câmera X (exemplo)', 'Celular Y (exemplo)'];
const FORMATOS_SORTEIO = [['foto', 'jpg'], ['foto', 'jpg'], ['foto', 'jpg'], ['foto', 'jpg'], ['foto', 'heic'], ['foto', 'png'],
  ['video', 'mp4'], ['video', 'mov'], ['raw', 'cr3']];

export const EVENTOS = EVENTOS_BASE.map(({ n: _n, ...e }, i) => ({
  id: uuid('e0000000', i + 1), ...e, capa_arquivo_id: null, excluido_em: null,
}));

export const ARQUIVOS = [];
let contador = 0;
EVENTOS_BASE.forEach((base, i) => {
  const ev = EVENTOS[i];
  for (let k = 0; k < base.n; k++) {
    contador++;
    const [tipo, extensao] = um(FORMATOS_SORTEIO);
    const hora = 9 + Math.floor(sorte() * 9);
    const minuto = Math.floor(sorte() * 60);
    // Exceções de direito dentro de evento liberado: pessoa que não assinou o termo, ou foto só para uso interno.
    let direito = ev.direito_uso;
    if (ev.direito_uso === 'liberado' && k % 9 === 4) direito = 'sem_autorizacao';
    else if (ev.direito_uso === 'liberado' && k % 7 === 3) direito = 'interno';
    const video = tipo === 'video';
    ARQUIVOS.push({
      id: uuid('a0000000', contador),
      evento_id: ev.id,
      tipo, extensao,
      nome_original: `${video ? 'VID' : 'IMG'}_${String(1000 + contador)}.${extensao.toUpperCase()}`,
      tamanho_bytes: video ? Math.round((0.3 + sorte() * 3.7) * 1024 ** 3) : tipo === 'raw' ? Math.round((25 + sorte() * 20) * 1024 ** 2) : Math.round((2 + sorte() * 8) * 1024 ** 2),
      largura: video ? 3840 : 6000, altura: video ? 2160 : 4000,
      duracao_seg: video ? Math.round(20 + sorte() * 600) : null,
      capturado_em: new Date(`${ev.data_evento}T${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}:00-03:00`).toISOString(),
      camera: um(CAMERAS), autor: um(AUTORES), legenda: um(LEGENDAS),
      tags: k % 3 === 0 ? [um(['palco', 'equipe', 'produto', 'clientes'])] : [],
      direito_uso: direito,
      aprovada: direito === 'liberado' && ev.direito_uso === 'liberado' && k % 4 === 0,
      situacao: 'pronto', excluido_em: null,
      tem_miniatura: tipo !== 'raw',
    });
  }
});

// Favoritos de exemplo (por perfil, como se cada perfil fosse uma pessoa).
export const FAVORITOS = {
  colaborador: [ARQUIVOS[0].id, ARQUIVOS[25].id],
  marketing: [ARQUIVOS[1].id, ARQUIVOS[40].id, ARQUIVOS[60].id],
  admin: [ARQUIVOS[2].id],
};
