// Regras compartilhadas (tela, API e demonstração): perfis, direito de uso, formatos, busca e visibilidade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CODIGOS, pode, rotuloDoPerfil } from '../compartilhado/perfis.js';
import { direitoEfetivo, direitosDoPerfil, perfilVeDireito, podeCompartilharExternamente } from '../compartilhado/direito.js';
import { duracaoLegivel, formatoDoArquivo, tamanhoLegivel } from '../compartilhado/formatos.js';
import { dataDaBusca, lerFiltros, limparBusca, normalizar } from '../compartilhado/busca.js';
import { arquivoVisivel, eventoVisivel } from '../compartilhado/visibilidade.js';

test('perfis: colaborador primeiro (o Portal entra com o primeiro); permissões de cada um', () => {
  assert.deepEqual(CODIGOS, ['colaborador', 'marketing', 'admin']);
  assert.ok(pode('colaborador', 'baixar'));
  for (const p of ['enviar', 'organizar', 'excluir', 'compartilhar', 'ver_uso', 'lixeira', 'relatorios', 'configurar']) {
    assert.equal(pode('colaborador', p), false, `colaborador não pode ${p}`);
  }
  for (const p of ['enviar', 'organizar', 'excluir', 'compartilhar', 'ver_uso']) assert.ok(pode('marketing', p), `marketing pode ${p}`);
  for (const p of ['lixeira', 'relatorios', 'configurar']) assert.equal(pode('marketing', p), false, `marketing não pode ${p}`);
  for (const p of ['baixar', 'enviar', 'lixeira', 'relatorios', 'configurar']) assert.ok(pode('admin', p), `admin pode ${p}`);
  assert.equal(pode('diretor', 'baixar'), false, 'perfil desconhecido não pode nada');
  assert.equal(rotuloDoPerfil('admin'), 'Administrador');
});

test('direito de uso: vale o mais restritivo entre evento e arquivo', () => {
  assert.equal(direitoEfetivo('liberado', 'liberado'), 'liberado');
  assert.equal(direitoEfetivo('liberado', 'interno'), 'interno');
  assert.equal(direitoEfetivo('interno', 'liberado'), 'interno');
  assert.equal(direitoEfetivo('sem_autorizacao', 'liberado'), 'sem_autorizacao');
  assert.equal(direitoEfetivo('liberado', 'sem_autorizacao'), 'sem_autorizacao');
  assert.equal(direitoEfetivo('liberado', 'qualquer'), 'sem_autorizacao', 'desconhecido no arquivo nunca libera');
  assert.equal(direitoEfetivo('xyz', 'liberado'), 'sem_autorizacao', 'desconhecido no evento nunca libera');
  assert.equal(direitoEfetivo(undefined, undefined), 'sem_autorizacao');
  assert.ok(perfilVeDireito('colaborador', 'interno'));
  assert.equal(perfilVeDireito('colaborador', 'sem_autorizacao'), false);
  assert.ok(perfilVeDireito('marketing', 'sem_autorizacao'));
  assert.equal(perfilVeDireito('desconhecido', 'liberado'), false);
  assert.deepEqual(direitosDoPerfil('colaborador').map((d) => d.codigo), ['liberado', 'interno']);
  assert.ok(podeCompartilharExternamente('liberado'));
  assert.equal(podeCompartilharExternamente('interno'), false);
});

test('formatos aceitos, tamanho e duração', () => {
  assert.deepEqual(formatoDoArquivo('IMG_0001.HEIC'), { extensao: 'heic', tipo: 'foto', mime: 'image/heic', rotulo: 'HEIC' });
  assert.equal(formatoDoArquivo('video.MOV').tipo, 'video');
  assert.equal(formatoDoArquivo('foto.CR3').tipo, 'raw');
  assert.equal(formatoDoArquivo('planilha.xlsx'), null);
  assert.equal(formatoDoArquivo('sem-extensao'), null);
  assert.equal(tamanhoLegivel(512), '512 bytes');
  assert.equal(tamanhoLegivel(4.2 * 1024 ** 3), '4,2 GB');
  assert.equal(tamanhoLegivel(820 * 1024), '820 KB');
  assert.equal(duracaoLegivel(42), '0:42');
  assert.equal(duracaoLegivel(3723), '1:02:03');
});

test('busca: sem acento e sem caracteres de comando; data dd/mm/aaaa; filtros inválidos ignorados', () => {
  assert.equal(normalizar('Convenção SÃO Paulo'), 'convencao sao paulo');
  assert.equal(limparBusca('  palco, (abertura)*%  '), 'palco abertura');
  assert.equal(limparBusca('a'.repeat(300)).length, 100);
  assert.equal(limparBusca('IMG_9001.JPG'), 'img_9001.jpg', 'busca pelo nome do arquivo');
  assert.equal(limparBusca('50%\\'), '50');
  assert.equal(dataDaBusca('12/03/2026'), '2026-03-12');
  assert.equal(dataDaBusca('31/02/2026'), null);
  const f = lerFiltros(new URLSearchParams('q=Feira&tipo=video&ano=2026&direito=interno&aprovadas=1&pagina=2'));
  assert.deepEqual(f, { q: 'feira', tipo: 'video', ano: 2026, direito: 'interno', aprovadas: true, pagina: 2 });
  assert.deepEqual(lerFiltros(new URLSearchParams('q=12/03/2026')), { data: '2026-03-12', pagina: 1 });
  assert.deepEqual(lerFiltros(new URLSearchParams('tipo=exe&ano=abc&direito=tudo&evento=1;drop&pagina=-1')), { pagina: 1 });
});

test('visibilidade: a MESMA regra do banco (cenário do teste PGlite: Colaborador vê A1, A2 e A6)', () => {
  const ev = {
    lib: { direito_uso: 'liberado', excluido_em: null },
    int: { direito_uso: 'interno', excluido_em: null },
    sem: { direito_uso: 'sem_autorizacao', excluido_em: null },
  };
  const arq = {
    A1: ['lib', { direito_uso: 'liberado', situacao: 'pronto' }],
    A2: ['lib', { direito_uso: 'interno', situacao: 'pronto' }],
    A3: ['lib', { direito_uso: 'sem_autorizacao', situacao: 'pronto' }],
    A4: ['lib', { direito_uso: 'liberado', situacao: 'enviando' }],
    A5: ['sem', { direito_uso: 'liberado', situacao: 'pronto' }],
    A6: ['int', { direito_uso: 'liberado', situacao: 'pronto' }],
  };
  const ve = (perfil) => Object.entries(arq).filter(([, [e, a]]) => arquivoVisivel(perfil, a, ev[e])).map(([k]) => k);
  assert.deepEqual(ve('colaborador'), ['A1', 'A2', 'A6']);
  assert.deepEqual(ve('marketing'), ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']);
  assert.deepEqual(ve(null), []);
  assert.equal(eventoVisivel('colaborador', ev.sem), false);
  assert.equal(eventoVisivel('marketing', { ...ev.lib, excluido_em: '2026-11-24' }), false, 'marketing não vê lixeira');
  assert.ok(eventoVisivel('admin', { ...ev.lib, excluido_em: '2026-11-24' }), 'admin vê lixeira');
});

test('evento: campos obrigatórios, direito escolhido sempre, limites do banco e tags sem repetição', async () => {
  const { camposAlterados, dataValida, direitoFicouMaisAberto, lerEvento, lerTags } = await import('../compartilhado/evento.js');
  const vazio = lerEvento({});
  assert.deepEqual(Object.keys(vazio.erros).sort(), ['data_evento', 'direito_uso', 'nome']);
  // Sem direito escolhido não grava (nenhum padrão libera um evento por descuido).
  assert.ok(lerEvento({ nome: 'Feira', data_evento: '2026-05-19' }).erros.direito_uso);
  assert.ok(lerEvento({ nome: 'Feira', data_evento: '2026-05-19', direito_uso: 'publico' }).erros.direito_uso);
  const ok = lerEvento({ nome: '  Feira   Hospitalar ', data_evento: '2026-05-19', local: ' ', descricao: ' Linha 1 \r\nLinha 2 ',
    tags: 'feira, Estande ,estande, ESTÂNDE,, joelho', responsavel: '', direito_uso: 'interno' });
  assert.deepEqual(ok.valores, { nome: 'Feira Hospitalar', data_evento: '2026-05-19', local: null, descricao: 'Linha 1\nLinha 2',
    tags: ['feira', 'Estande', 'joelho'], responsavel: null, direito_uso: 'interno' });
  assert.ok(lerEvento({ nome: 'x'.repeat(201), data_evento: '2026-05-19', direito_uso: 'liberado' }).erros.nome);
  assert.ok(lerEvento({ nome: 'x', data_evento: '2026-05-19', direito_uso: 'liberado', tags: ['y'.repeat(41)] }).erros.tags);
  assert.ok(lerEvento({ nome: 'x', data_evento: '2026-05-19', direito_uso: 'liberado', tags: Array.from({ length: 51 }, (_, i) => `t${i}`) }).erros.tags);
  for (const d of ['2026-02-30', '19/05/2026', '1989-12-31', '2101-01-01', '']) assert.equal(dataValida(d), null, d);
  assert.equal(dataValida('2024-02-29'), '2024-02-29');
  assert.deepEqual(lerTags(['a', ' A ', 'b']), ['a', 'b']);
  assert.ok(direitoFicouMaisAberto('sem_autorizacao', 'interno'));
  assert.ok(direitoFicouMaisAberto('interno', 'liberado'));
  assert.equal(direitoFicouMaisAberto('liberado', 'interno'), false);
  assert.deepEqual(camposAlterados({ nome: 'a', tags: ['x'], local: null }, { nome: 'a', tags: ['x', 'y'], local: null }), ['tags']);
});

test('envio: um PUT até 32 MB; acima, partes de 16 MB iguais, nunca mais de 10.000; pedido de início conferido', async () => {
  const E = await import('../compartilhado/envio.js');
  const MiB = 1024 * 1024;
  assert.equal(E.planoDeEnvio(32 * MiB).modo, 'simples');
  const p = E.planoDeEnvio(32 * MiB + 1);
  assert.deepEqual(p, { modo: 'partes', parte_bytes: 16 * MiB, total_partes: 3 });
  for (const tam of [5 * 1024 * MiB, 100 * 1024 * MiB]) {
    const x = E.planoDeEnvio(tam);
    assert.ok(x.total_partes <= 10_000 && x.parte_bytes % MiB === 0 && x.parte_bytes >= 16 * MiB, String(tam));
  }
  assert.ok(E.tamanhoDaParte(200 * 1024 * MiB) > 16 * MiB, 'arquivo enorme: parte maior para caber em 10.000');
  assert.deepEqual(E.faixaDaParte(3, 16 * MiB, 40 * MiB), { inicio: 32 * MiB, fim: 40 * MiB });
  assert.equal(E.chaveOriginal('2026', 'a0000000-0000-4000-8000-000000000001', 'jpg'), 'originais/2026/a0000000-0000-4000-8000-000000000001.jpg');

  const ok = { evento_id: 'e0000000-0000-4000-8000-000000000001', nome: 'IMG_1.JPG', tamanho: 10, sha256: 'A'.repeat(64) };
  assert.deepEqual(E.lerInicio(ok).valores, { evento_id: ok.evento_id, nome_original: 'IMG_1.JPG', extensao: 'jpg', tipo: 'foto', mime: 'image/jpeg',
    tamanho_bytes: 10, sha256: 'a'.repeat(64), direito_uso: 'liberado', autor: null });
  assert.ok(E.lerInicio({ ...ok, nome: 'planilha.xlsx' }).erro.startsWith('Formato não aceito'));
  assert.ok(E.lerInicio({ ...ok, tamanho: 0 }).erro);
  assert.ok(E.lerInicio({ ...ok, tamanho: 101 * 1024 * MiB }).erro);
  assert.ok(E.lerInicio({ ...ok, sha256: 'xyz' }).erro);
  assert.ok(E.lerInicio({ ...ok, direito_uso: 'publico' }).erro);
  assert.ok(E.lerInicio({ ...ok, evento_id: '1' }).erro);
  assert.equal(E.lerInicio({ ...ok, direito_uso: 'sem_autorizacao' }).valores.direito_uso, 'sem_autorizacao');

  const agora = Date.parse('2026-11-25T12:00:00Z');
  assert.deepEqual(E.lerMetadados({ largura: 6000, altura: 4000.5, duracao_seg: 12.34567, capturado_em: '2026-11-20T10:00:00Z', camera: ' Canon   EOS ' }, agora),
    { largura: 6000, altura: null, duracao_seg: 12.346, capturado_em: '2026-11-20T10:00:00.000Z', camera: 'Canon EOS' });
  assert.equal(E.lerMetadados({ capturado_em: '1980-01-01' }, agora).capturado_em, null, 'data de câmera desacertada não vale');
  assert.equal(E.lerMetadados({ capturado_em: '2027-01-01' }, agora).capturado_em, null, 'data no futuro não vale');
  assert.deepEqual(E.lerPartes([{ numero: 2, etag: '"b"' }, { numero: 1, etag: '"a"' }], 2), [{ numero: 1, etag: '"a"' }, { numero: 2, etag: '"b"' }]);
  assert.equal(E.lerPartes([{ numero: 1, etag: 'a' }, { numero: 3, etag: 'c' }], 2), null, 'buraco nas partes');
  assert.equal(E.lerPartes([{ numero: 1, etag: 'a' }], 2), null, 'falta parte');
});

test('arquivo: edição (legenda, autor, tags, direito), lote só com o pedido, tags +/−, aprovar não vale para "Sem autorização"', async () => {
  const A = await import('../compartilhado/arquivo.js');
  assert.deepEqual(A.lerArquivoEditado({ legenda: ' Palco \r\n principal ', autor: ' ', tags: 'palco, PALCO, abertura', direito_uso: 'interno' }).valores,
    { legenda: 'Palco\n principal', autor: null, tags: ['palco', 'abertura'], direito_uso: 'interno' });
  assert.ok(A.lerArquivoEditado({ direito_uso: 'x' }).erros.direito_uso);
  assert.ok(A.lerArquivoEditado({ legenda: 'a'.repeat(2001), direito_uso: 'liberado' }).erros.legenda);
  const id = 'a0000000-0000-4000-8000-000000000001';
  assert.equal(A.lerIds([]), null);
  assert.equal(A.lerIds(['x']), null);
  assert.deepEqual(A.lerIds([id, id.toUpperCase()]), [id], 'sem repetição');
  assert.equal(A.lerIds(Array.from({ length: 501 }, () => id)), null, 'no máximo 500');
  assert.equal(A.lerLote({ ids: [id], mudar: {} }).erro, 'Nada para mudar.');
  assert.ok(A.lerLote({ ids: [id], mudar: { direito_uso: 'publico' } }).erro);
  assert.deepEqual(A.lerLote({ ids: [id], mudar: { aprovada: true, tags_mais: 'a, b', autor: '  ' } }).mudar, { aprovada: true, tags_mais: ['a', 'b'], autor: null });
  assert.deepEqual(A.tagsDepois(['Palco', 'equipe'], ['abertura', 'palco'], ['EQUIPE']), ['Palco', 'abertura']);
  assert.equal(A.podeAprovar('sem_autorizacao'), false);
  assert.ok(A.podeAprovar('interno') && A.podeAprovar('liberado'));
});

// ── Fase 4: zip, download e link externo (compartilhado/download.js) ──────────────────────────────────────
import * as dl from '../compartilhado/download.js';

test('zip: partes de até 2 GB, arquivos acima de 1 GB ficam fora (baixam direto), na ordem', () => {
  const GB = 1_000_000_000;
  const arqs = [
    { id: 'a', tamanho_bytes: 0.9 * GB }, { id: 'b', tamanho_bytes: 0.9 * GB }, { id: 'video', tamanho_bytes: 3 * GB },
    { id: 'c', tamanho_bytes: 0.5 * GB }, { id: 'd', tamanho_bytes: 10 },
  ];
  const p = dl.planoDoZip(arqs);
  assert.deepEqual(p.fora, ['video']);
  assert.deepEqual(p.partes.map((x) => x.ids), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(p.partes.map((x) => [x.n, x.situacao, x.tentativas]), [[1, 'na_fila', 0], [2, 'na_fila', 0]]);
  assert.ok(p.partes.every((x) => x.bytes <= dl.LIMITE_PARTE_ZIP));
  const muitos = dl.planoDoZip(Array.from({ length: 4500 }, (_, i) => ({ id: `f${i}`, tamanho_bytes: 1000 })));
  assert.deepEqual(muitos.partes.map((x) => x.ids.length), [2000, 2000, 500], 'até 2000 arquivos por parte');
  assert.deepEqual(dl.planoDoZip([{ id: 'v', tamanho_bytes: 5 * GB }]), { partes: [], fora: ['v'] }, 'só vídeo grande: nenhuma parte');
});

test('nomes no zip e no download: seguros no Windows, pasta por evento quando há vários, repetidos com (2)', () => {
  assert.equal(dl.nomeSeguro('a/b\\c:d*e?f"g<h>i|j.jpg'), 'a_b_c_d_e_f_g_h_i_j.jpg');
  assert.equal(dl.nomeSeguro('  ..oculto.  '), 'oculto');
  assert.equal(dl.nomeSeguro('CON.txt'), '_CON.txt');
  assert.equal(dl.nomeSeguro(''), 'arquivo');
  const longo = dl.nomeSeguro(`${'x'.repeat(300)}.jpeg`);
  assert.equal(longo.length, 150);
  assert.ok(longo.endsWith('.jpeg'));
  assert.deepEqual(dl.nomesNoZip([
    { nome: 'IMG_1.JPG', evento: 'Feira' }, { nome: 'img_1.jpg', evento: 'Feira' }, { nome: 'IMG_1.JPG', evento: 'Congresso: SP' },
  ]), ['Feira/IMG_1.JPG', 'Feira/img_1 (2).jpg', 'Congresso_ SP/IMG_1.JPG']);
  assert.equal(dl.nomeDoZip('Feira 2026', 1, 1), 'Feira 2026.zip');
  assert.equal(dl.nomeDoZip('Feira/2026', 2, 3), 'Feira_2026 - parte 2 de 3.zip');
  assert.equal(dl.disposicao("Foto d'água (1).jpg"), "attachment;filename*=UTF-8''Foto%20d%27%C3%A1gua%20%281%29.jpg");
  assert.equal(dl.chaveDoZip('abc', 2), 'zips/abc/parte-2.zip');
});

test('pedido de zip: evento inteiro ou seleção de 1 a 5000; situação e rotina parada', () => {
  const id = '11111111-2222-4333-8444-555555555555';
  assert.deepEqual(dl.lerPedidoZip({ evento_id: id.toUpperCase() }), { evento_id: id });
  assert.ok(dl.lerPedidoZip({ evento_id: 'x' }).erro);
  assert.deepEqual(dl.lerPedidoZip({ ids: [id, id] }), { ids: [id] });
  assert.ok(dl.lerPedidoZip({ ids: [] }).erro);
  assert.ok(dl.lerPedidoZip({ ids: ['x'] }).erro);
  const agora = Date.parse('2026-11-25T12:00:00Z');
  assert.equal(dl.situacaoDoZip({ situacao: 'pronto', expira_em: '2026-11-25T11:00:00Z' }, agora), 'expirado');
  assert.equal(dl.situacaoDoZip({ situacao: 'pronto', expira_em: '2026-12-01T11:00:00Z' }, agora), 'pronto');
  const ativa = { situacao: 'gerando', partes: [{ situacao: 'gerando', ate: '2026-11-25T12:04:00Z' }, { situacao: 'na_fila' }] };
  assert.equal(dl.zipPrecisaDeRotina(ativa, agora), false, 'rotina trabalhando: não chama outra');
  const caiu = { situacao: 'gerando', partes: [{ situacao: 'gerando', ate: '2026-11-25T11:59:00Z' }, { situacao: 'pronto' }] };
  assert.equal(dl.zipPrecisaDeRotina(caiu, agora), true, 'trava vencida: a rotina caiu, chama outra');
  assert.equal(dl.zipPrecisaDeRotina({ situacao: 'na_fila', partes: [{ situacao: 'na_fila' }] }, agora), true);
  assert.equal(dl.zipPrecisaDeRotina({ situacao: 'pronto', partes: [{ situacao: 'pronto' }] }, agora), false);
  const tela = dl.zipParaTela({
    id: 'z', titulo: 'Feira', situacao: 'pronto', total_bytes: 2048, arquivo_ids: ['a', 'b', 'v'], expira_em: '2026-12-01T00:00:00Z',
    partes: [{ n: 1, ids: ['a', 'b'], bytes: 2000, bytes_zip: 2048, arquivos: 2, situacao: 'pronto' }],
  }, new Map([['v', { id: 'v', nome_original: 'video.mp4', tamanho_bytes: 5e9 }]]), agora);
  assert.deepEqual(tela.partes, [{ n: 1, situacao: 'pronto', bytes: 2048, arquivos: 2 }]);
  assert.equal(tela.total_arquivos, 2);
  assert.deepEqual(tela.fora.map((f) => f.id), ['v'], 'o vídeo grande aparece para baixar direto');
});

test('link externo: título, validade de 1 a 90 dias, senha de 6 a 100, 1 a 1000 arquivos; situação', () => {
  const id = '11111111-2222-4333-8444-555555555555';
  const ok = dl.lerLink({ titulo: '  Feira 2026 ', destinatario: 'Agência X', mensagem: '', dias: 7, senha: '', ids: [id] });
  assert.deepEqual(ok.valores, { titulo: 'Feira 2026', destinatario: 'Agência X', mensagem: null, dias: 7, senha: null, ids: [id] });
  const ruim = dl.lerLink({ titulo: '', dias: 91, senha: '123', ids: [] });
  assert.deepEqual(Object.keys(ruim.erros).sort(), ['dias', 'ids', 'senha', 'titulo']);
  assert.ok(dl.lerLink({ titulo: 'x', dias: 1.5, ids: [id] }).erros.dias);
  assert.equal(dl.lerLink({ titulo: 'x', dias: 90, senha: 'segredo', ids: [id] }).valores.senha, 'segredo');
  assert.ok(dl.formatoDoCodigo('A'.repeat(43)));
  assert.ok(!dl.formatoDoCodigo('A'.repeat(42)));
  const agora = Date.parse('2026-11-25T12:00:00Z');
  assert.equal(dl.situacaoDoLink({ expira_em: '2026-12-01T00:00:00Z' }, agora), 'ativo');
  assert.equal(dl.situacaoDoLink({ expira_em: '2026-11-20T00:00:00Z' }, agora), 'expirado');
  assert.equal(dl.situacaoDoLink({ expira_em: '2026-12-01T00:00:00Z', revogado_em: '2026-11-24T00:00:00Z' }, agora), 'revogado');
});
