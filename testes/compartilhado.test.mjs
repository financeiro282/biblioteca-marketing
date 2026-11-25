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
