// Modo demonstração: responde como a API de verdade e com a MESMA regra de visibilidade do banco.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estado, responderDemo } from '../demo/plugin-demo.mjs';
import { ARQUIVOS, EVENTOS } from '../demo/dados-demo.mjs';

const como = (perfil) => { estado.perfil = perfil; estado.saiu = false; };
const todosOsArquivos = (filtros = '') => {
  const lista = [];
  for (let p = 1; p < 50; p++) {
    const [, r] = responderDemo('GET', `/arquivos?pagina=${p}${filtros}`);
    lista.push(...r.arquivos);
    if (lista.length >= r.total) break;
  }
  return lista;
};

test('dados fictícios: e-mail .invalid, nomes "(exemplo)", um evento sem autorização e exceções dentro de eventos liberados', () => {
  assert.ok(EVENTOS.some((e) => e.direito_uso === 'sem_autorizacao'));
  assert.ok(ARQUIVOS.some((a) => a.direito_uso === 'sem_autorizacao' && EVENTOS.find((e) => e.id === a.evento_id).direito_uso === 'liberado'));
  assert.ok(ARQUIVOS.every((a) => a.autor.includes('(exemplo)')));
});

test('Colaborador NUNCA recebe "Sem autorização" (eventos, lista, filtro e ficha pelo id)', () => {
  como('colaborador');
  const [, r] = responderDemo('GET', '/eventos');
  assert.ok(r.eventos.length > 0);
  assert.ok(r.eventos.every((e) => e.direito_uso !== 'sem_autorizacao'));
  const lista = todosOsArquivos();
  assert.ok(lista.length > 0);
  assert.ok(lista.every((a) => a.direito_efetivo !== 'sem_autorizacao'));
  assert.equal(responderDemo('GET', '/arquivos?direito=sem_autorizacao')[1].total, 0);
  const proibido = ARQUIVOS.find((a) => a.direito_uso === 'sem_autorizacao');
  assert.equal(responderDemo('GET', `/arquivos?id=${proibido.id}`)[0], 404);
  const eventoProibido = EVENTOS.find((e) => e.direito_uso === 'sem_autorizacao');
  assert.equal(responderDemo('GET', `/eventos?id=${eventoProibido.id}`)[0], 404);
  const dentroDeEventoProibido = ARQUIVOS.find((a) => a.evento_id === eventoProibido.id && a.direito_uso === 'sem_autorizacao');
  assert.equal(responderDemo('GET', `/arquivos?id=${dentroDeEventoProibido.id}`)[0], 404);
});

test('Marketing vê tudo, inclusive "Sem autorização"; contagens batem', () => {
  como('marketing');
  const [, r] = responderDemo('GET', '/eventos');
  assert.equal(r.eventos.length, EVENTOS.length);
  assert.equal(r.eventos.reduce((s, e) => s + e.total_arquivos, 0), ARQUIVOS.length);
  assert.equal(todosOsArquivos().length, ARQUIVOS.length);
  assert.ok(responderDemo('GET', '/arquivos?direito=sem_autorizacao')[1].total > 0);
});

test('filtros: tipo, ano, aprovadas, busca por evento/legenda e por data', () => {
  como('marketing');
  assert.ok(todosOsArquivos('&tipo=video').every((a) => a.tipo === 'video'));
  assert.ok(todosOsArquivos('&ano=2025').every((a) => a.evento_data.startsWith('2025')));
  assert.ok(todosOsArquivos('&aprovadas=1').every((a) => a.aprovada && a.direito_efetivo === 'liberado'));
  const feira = todosOsArquivos('&q=FEIRA');
  assert.ok(feira.length > 0 && feira.every((a) => a.evento_nome === 'Feira Hospitalar 2026'));
  const porData = todosOsArquivos(`&q=${encodeURIComponent('19/05/2026')}`);
  assert.ok(porData.length > 0 && porData.every((a) => a.evento_data === '2026-05-19'));
  assert.ok(todosOsArquivos('&q=plateia').every((a) => /plateia/i.test(a.legenda)));
});

test('paginação de 60, ficha pelo id e sessão encerrada', () => {
  como('admin');
  const [, p1] = responderDemo('GET', '/arquivos');
  assert.equal(p1.arquivos.length, 60);
  assert.equal(p1.total, ARQUIVOS.length);
  const [st, um] = responderDemo('GET', `/arquivos?id=${p1.arquivos[0].id}`);
  assert.equal(st, 200);
  assert.equal(um.arquivo.id, p1.arquivos[0].id);
  responderDemo('POST', '/sessao', { acao: 'sair' });
  assert.equal(responderDemo('GET', '/eventos')[0], 401);
  assert.equal(responderDemo('GET', '/arquivos')[1].codigo, 'sem_sessao');
  assert.equal(responderDemo('GET', '/rota-que-nao-existe')[0], 501);
});

test('criar e editar evento: Marketing cria e altera; Colaborador não; versão antiga não grava (409)', () => {
  como('colaborador');
  const campos = { nome: 'Evento de teste (exemplo)', data_evento: '2026-11-25', local: 'São Paulo/SP', tags: 'teste, exemplo', direito_uso: 'sem_autorizacao' };
  assert.equal(responderDemo('POST', '/eventos', { acao: 'criar', evento: campos })[0], 403);
  como('marketing');
  const [st0, r0] = responderDemo('POST', '/eventos', { acao: 'criar', evento: { ...campos, direito_uso: undefined } });
  assert.equal(st0, 400);
  assert.ok(r0.erros.direito_uso);
  const [st, r] = responderDemo('POST', '/eventos', { acao: 'criar', evento: campos });
  assert.equal(st, 200);
  const [, lido] = responderDemo('GET', `/eventos?id=${r.evento.id}`);
  assert.equal(lido.evento.nome, campos.nome);
  assert.deepEqual(lido.evento.tags, ['teste', 'exemplo']);
  assert.equal(lido.evento.versao, 1);
  assert.equal(lido.evento.total_arquivos, 0);
  // Colaborador não vê o evento "Sem autorização" recém-criado.
  como('colaborador');
  assert.equal(responderDemo('GET', `/eventos?id=${r.evento.id}`)[0], 404);
  como('marketing');
  const [st2, r2] = responderDemo('POST', '/eventos', { acao: 'alterar', id: r.evento.id, versao: 1, evento: { ...campos, direito_uso: 'interno' } });
  assert.equal(st2, 200);
  assert.equal(r2.evento.versao, 2);
  assert.equal(responderDemo('POST', '/eventos', { acao: 'alterar', id: r.evento.id, versao: 1, evento: campos })[0], 409);
  como('colaborador');
  assert.equal(responderDemo('GET', `/eventos?id=${r.evento.id}`)[0], 200, 'agora "Somente uso interno": o Colaborador vê');
});

test('envio na demonstração: simples e em partes, duplicado avisado, Colaborador recusado, arquivo aparece no evento', async () => {
  const { ENVIOS } = await import('../demo/plugin-demo.mjs');
  const evento = EVENTOS[0];
  const sha = (n) => String(n).padStart(64, '0');
  const pedido = { acao: 'iniciar', evento_id: evento.id, nome: 'IMG_9001.JPG', tamanho: 1000, sha256: sha(1) };
  como('colaborador');
  assert.equal(responderDemo('POST', '/envio', pedido)[0], 403);
  como('marketing');
  const [st, r] = responderDemo('POST', '/envio', pedido);
  assert.equal(st, 200);
  assert.equal(r.arquivo.modo, 'simples');
  assert.match(r.links.original, /^\/biblioteca\/__demo\/r2\/originais\/2026\/[0-9a-f-]{36}\.jpg$/);
  assert.equal(responderDemo('POST', '/envio', { acao: 'concluir', id: r.arquivo.id })[0], 409, 'nada chegou: incompleto');
  ENVIOS.get(r.arquivo.id).original = 1000; // o que o PUT no "R2" de mentira faria
  assert.equal(responderDemo('POST', '/envio', { acao: 'concluir', id: r.arquivo.id, metadados: { camera: 'Câmera Z (exemplo)' } })[0], 200);
  const [, lista] = responderDemo('GET', `/arquivos?evento=${evento.id}&q=IMG_9001`);
  assert.equal(lista.total, 1);
  assert.equal(lista.arquivos[0].camera, 'Câmera Z (exemplo)');
  const [stDup, dup] = responderDemo('POST', '/envio', { ...pedido, nome: 'copia.jpg' });
  assert.equal(stDup, 409);
  assert.equal(dup.codigo, 'duplicado');
  assert.equal(dup.evento_nome, evento.nome);

  // Em partes (40 MiB = 3 partes), com retomada: a 2ª chamada de iniciar devolve as partes que já chegaram.
  const MiB = 1024 * 1024;
  const grande = { ...pedido, nome: 'VID_9002.MP4', tamanho: 40 * MiB, sha256: sha(2) };
  const [, g] = responderDemo('POST', '/envio', grande);
  assert.deepEqual([g.arquivo.modo, g.arquivo.total_partes, g.arquivo.parte_bytes], ['partes', 3, 16 * MiB]);
  const env = ENVIOS.get(g.arquivo.id);
  env.partes.set(1, 16 * MiB);
  const [, retomado] = responderDemo('POST', '/envio', grande);
  assert.equal(retomado.retomada, true);
  assert.deepEqual(retomado.arquivo.partes_prontas.map((p) => p.numero), [1]);
  const [, links] = responderDemo('POST', '/envio', { acao: 'assinar', id: g.arquivo.id, partes: [2, 3] });
  assert.deepEqual(links.partes.map((p) => p.numero), [2, 3]);
  assert.equal(responderDemo('POST', '/envio', { acao: 'assinar', id: g.arquivo.id, partes: [4] })[0], 400);
  env.partes.set(2, 16 * MiB);
  env.partes.set(3, 8 * MiB);
  const partes = [1, 2, 3].map((n) => ({ numero: n, etag: `"demo-${n}"` }));
  assert.equal(responderDemo('POST', '/envio', { acao: 'concluir', id: g.arquivo.id, partes: partes.slice(0, 2) })[0], 400);
  assert.equal(responderDemo('POST', '/envio', { acao: 'concluir', id: g.arquivo.id, partes })[0], 200);
  assert.equal(responderDemo('GET', `/arquivos?evento=${evento.id}&q=VID_9002`)[1].arquivos[0].tipo, 'video');
});

test('organização na demonstração: favoritos por perfil, editar com versão, lote, capa, lixeira de arquivo e de evento', () => {
  const evento = EVENTOS.find((e) => e.nome === 'Convenção de Vendas 2026');
  const doEvento = () => todosOsArquivos(`&evento=${evento.id}`);
  const [a1, a2, a3] = doEvento().filter((a) => a.direito_efetivo === 'liberado' && a.miniatura_url);

  // Favoritos: o Colaborador também; cada perfil, os seus.
  como('colaborador');
  assert.equal(responderDemo('POST', '/arquivos', { acao: 'favoritar', id: a1.id, favorito: true })[0], 200);
  assert.ok(todosOsArquivos('&favoritos=1').some((a) => a.id === a1.id));
  assert.equal(responderDemo('POST', '/arquivos', { acao: 'lote', ids: [a1.id], mudar: { aprovada: true } })[0], 403, 'Colaborador não organiza');
  como('marketing');
  assert.ok(!todosOsArquivos('&favoritos=1').some((a) => a.id === a1.id), 'favorito é de cada um');

  // Editar com a versão; a versão velha não grava.
  const [, f] = responderDemo('GET', `/arquivos?id=${a1.id}`);
  const editado = { legenda: 'Abertura (exemplo)', autor: 'Fotógrafo C (exemplo)', tags: 'abertura, palco', direito_uso: 'interno' };
  const [st, r] = responderDemo('POST', '/arquivos', { acao: 'alterar', id: a1.id, versao: f.arquivo.versao, arquivo: editado });
  assert.equal(st, 200);
  assert.equal(r.arquivo.versao, f.arquivo.versao + 1);
  assert.equal(responderDemo('POST', '/arquivos', { acao: 'alterar', id: a1.id, versao: f.arquivo.versao, arquivo: editado })[0], 409);
  const [, depois] = responderDemo('GET', `/arquivos?id=${a1.id}`);
  assert.deepEqual([depois.arquivo.legenda, depois.arquivo.direito_efetivo, depois.arquivo.tags], ['Abertura (exemplo)', 'interno', ['abertura', 'palco']]);

  // Lote: aprovar 2; "Sem autorização" não é aprovado (e perde a aprovação que tinha).
  const [, l1] = responderDemo('POST', '/arquivos', { acao: 'lote', ids: [a2.id, a3.id], mudar: { aprovada: true, tags_mais: 'lote' } });
  assert.equal(l1.alterados, 2);
  const [, l2] = responderDemo('POST', '/arquivos', { acao: 'lote', ids: [a2.id], mudar: { direito_uso: 'sem_autorizacao', aprovada: true } });
  assert.deepEqual([l2.alterados, l2.sem_autorizacao], [1, 1]);
  const [, a2depois] = responderDemo('GET', `/arquivos?id=${a2.id}`);
  assert.deepEqual([a2depois.arquivo.aprovada, a2depois.arquivo.direito_efetivo], [false, 'sem_autorizacao']);
  assert.ok(responderDemo('GET', `/arquivos?id=${a3.id}`)[1].arquivo.tags.includes('lote'));

  // Capa do evento.
  assert.equal(responderDemo('POST', '/arquivos', { acao: 'capa', evento_id: evento.id, arquivo_id: a3.id })[0], 200);
  assert.match(responderDemo('GET', `/eventos?id=${evento.id}`)[1].evento.capa_url, new RegExp(a3.id));

  // Lixeira: some da lista e da contagem do evento.
  const antes = responderDemo('GET', `/eventos?id=${evento.id}`)[1].evento.total_arquivos;
  const [, lx] = responderDemo('POST', '/arquivos', { acao: 'lixeira', ids: [a3.id] });
  assert.equal(lx.na_lixeira, 1);
  assert.equal(responderDemo('GET', `/arquivos?id=${a3.id}`)[0], 404);
  assert.equal(responderDemo('GET', `/eventos?id=${evento.id}`)[1].evento.total_arquivos, antes - 1);

  // Evento para a lixeira (num evento criado para o teste, para não mexer nos de exemplo).
  const [, novo] = responderDemo('POST', '/eventos', { acao: 'criar', evento: { nome: 'Para a lixeira (exemplo)', data_evento: '2026-11-01', direito_uso: 'interno' } });
  como('colaborador');
  assert.equal(responderDemo('POST', '/eventos', { acao: 'lixeira', id: novo.evento.id })[0], 403);
  como('marketing');
  assert.equal(responderDemo('POST', '/eventos', { acao: 'lixeira', id: novo.evento.id })[0], 200);
  assert.equal(responderDemo('GET', `/eventos?id=${novo.evento.id}`)[0], 404);
});

// ── Fase 4: download, zip e link externo ─────────────────────────────────────────────────────────────────
import { relogio } from '../demo/plugin-demo.mjs';

test('Fase 4: baixar original só do que o perfil vê; zip do evento com os grandes fora; cada um vê os seus zips', () => {
  const T0 = Date.parse('2026-11-25T15:00:00Z');
  const antes = relogio.agora;
  relogio.agora = () => T0;
  try {
    como('colaborador');
    const visivel = todosOsArquivos()[0];
    let [s, r] = responderDemo('GET', `/arquivos?baixar=${visivel.id}`);
    assert.equal(s, 200);
    assert.match(r.url, /\/__demo\/baixar\/arquivo\//);
    assert.equal(r.nome, visivel.nome_original);
    const proibido = ARQUIVOS.find((a) => a.direito_uso === 'sem_autorizacao');
    assert.equal(responderDemo('GET', `/arquivos?baixar=${proibido.id}`)[0], 404, 'Colaborador não baixa "Sem autorização"');
    const ev = EVENTOS.find((e) => e.nome.startsWith('Feira'));
    [s, r] = responderDemo('POST', '/zips', { acao: 'pedir', evento_id: ev.id });
    assert.equal(s, 200);
    const visiveisDoEvento = todosOsArquivos(`&evento=${ev.id}`);
    assert.equal(r.zip.total_arquivos + r.fora.length, visiveisDoEvento.length, 'o zip leva só o que o Colaborador vê');
    assert.ok(r.fora.length > 0 && r.fora.every((f) => f.tamanho_bytes > 1e9), 'vídeos acima de 1 GB ficam fora');
    assert.equal(r.zip.situacao, 'gerando');
    const id = r.zip.id;
    assert.equal(responderDemo('GET', `/zips?baixar=${id}&parte=1`)[0], 409, 'antes de ficar pronto, não baixa');
    relogio.agora = () => T0 + 60_000;
    [s, r] = responderDemo('GET', '/zips');
    const meu = r.zips.find((z) => z.id === id);
    assert.equal(meu.situacao, 'pronto');
    assert.ok(meu.expira_em && meu.fora.length > 0);
    [s, r] = responderDemo('GET', `/zips?baixar=${id}&parte=1`);
    assert.equal(s, 200);
    assert.match(r.url, new RegExp(`/__demo/baixar/zip/${id}/1$`));
    como('marketing');
    assert.ok(!responderDemo('GET', '/zips')[1].zips.some((z) => z.id === id), 'outro perfil não vê o zip');
    assert.equal(responderDemo('GET', `/zips?baixar=${id}&parte=1`)[0], 404);
    como('colaborador');
    const seis = todosOsArquivos().filter((a) => a.tamanho_bytes < 1e8).slice(0, 2).map((a) => a.id);
    relogio.agora = () => T0 + 120_000;
    for (let i = 0; i < 3; i++) assert.equal(responderDemo('POST', '/zips', { acao: 'pedir', ids: seis })[0], 200);
    assert.equal(responderDemo('POST', '/zips', { acao: 'pedir', ids: seis })[0], 429, 'no máximo 3 zips sendo preparados por pessoa');
    assert.equal(responderDemo('POST', '/zips', { acao: 'pedir', ids: [] })[0], 400);
  } finally {
    relogio.agora = antes;
  }
});

test('Fase 4: link externo — só quem compartilha cria; só "liberado" entra; senha (5 erros bloqueiam); revogar', () => {
  como('colaborador');
  assert.equal(responderDemo('GET', '/links')[0], 403);
  assert.equal(responderDemo('POST', '/links', { acao: 'criar' })[0], 403);
  como('marketing');
  const evLib = EVENTOS.find((e) => e.direito_uso === 'liberado');
  const doEvento = ARQUIVOS.filter((a) => a.evento_id === evLib.id);
  const liberados = doEvento.filter((a) => a.direito_uso === 'liberado').slice(0, 2);
  const naoLiberado = doEvento.find((a) => a.direito_uso !== 'liberado');
  let [s, r] = responderDemo('POST', '/links', { acao: 'criar', titulo: 'Imprensa', dias: 7, ids: [...liberados.map((a) => a.id), naoLiberado.id] });
  assert.equal(s, 200, JSON.stringify(r));
  assert.equal(r.incluidos, 2);
  assert.equal(r.recusados, 1, 'o que não é "Uso liberado" fica fora');
  const codigo = r.endereco.split('#')[1];
  assert.match(codigo, /^[A-Za-z0-9_-]{43}$/);
  [s, r] = responderDemo('POST', '/externo', { acao: 'abrir', codigo });
  assert.equal(r.situacao, 'ok');
  assert.deepEqual(r.arquivos.map((a) => a.id).sort(), liberados.map((a) => a.id).sort());
  [s, r] = responderDemo('POST', '/externo', { acao: 'baixar', codigo, arquivo_id: naoLiberado.id });
  assert.equal(r.situacao, 'arquivo_fora');
  assert.equal(responderDemo('POST', '/externo', { acao: 'abrir', codigo: 'x'.repeat(43) })[0], 404);
  assert.equal(responderDemo('POST', '/links', { acao: 'criar', titulo: 'x', dias: 7, ids: [naoLiberado.id] })[0], 400, 'nenhum liberado: não cria');
  // Com senha
  [s, r] = responderDemo('POST', '/links', { acao: 'criar', titulo: 'Agência', dias: 1, senha: 'senha certa', ids: [liberados[0].id] });
  const comSenha = r.endereco.split('#')[1];
  assert.equal(responderDemo('POST', '/externo', { acao: 'abrir', codigo: comSenha })[1].situacao, 'senha');
  assert.deepEqual(responderDemo('POST', '/externo', { acao: 'abrir', codigo: comSenha, senha: 'errada' })[1], { situacao: 'senha_errada', restantes: 4 });
  assert.equal(responderDemo('POST', '/externo', { acao: 'abrir', codigo: comSenha, senha: 'senha certa' })[1].situacao, 'ok');
  for (let i = 0; i < 4; i++) responderDemo('POST', '/externo', { acao: 'abrir', codigo: comSenha, senha: `errada ${i}` });
  assert.equal(responderDemo('POST', '/externo', { acao: 'abrir', codigo: comSenha, senha: 'errada 5' })[1].situacao, 'bloqueado');
  assert.equal(responderDemo('POST', '/externo', { acao: 'abrir', codigo: comSenha, senha: 'senha certa' })[1].situacao, 'bloqueado');
  // Lista e revogar
  const lista = responderDemo('GET', '/links')[1].links;
  const l = lista.find((x) => x.titulo === 'Imprensa');
  assert.equal(l.situacao, 'ativo');
  assert.ok(l.acessos >= 1 && l.arquivos === 2 && l.com_senha === false);
  assert.equal(responderDemo('POST', '/links', { acao: 'revogar', id: l.id })[0], 200);
  assert.equal(responderDemo('POST', '/externo', { acao: 'abrir', codigo })[1].situacao, 'revogado');
  assert.equal(responderDemo('GET', '/links')[1].links.find((x) => x.id === l.id).situacao, 'revogado');
});
