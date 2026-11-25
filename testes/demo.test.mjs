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
