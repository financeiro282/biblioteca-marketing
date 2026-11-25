import { useCallback, useEffect, useState } from "react";
import { api, comFiltros, ErroApi } from "../api";
import type { Arquivo, PaginaDeArquivos } from "./dominio";

// Lista de arquivos com "Carregar mais" (páginas de 60 vindas da API). Recomeça quando os filtros mudam.
export function useArquivos(filtros: Record<string, string | number | boolean | null | undefined>) {
  const [arquivos, setArquivos] = useState<Arquivo[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const chave = JSON.stringify(filtros);

  const buscar = useCallback(async (p: number) => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await api<PaginaDeArquivos>(comFiltros("arquivos", { ...filtros, pagina: p > 1 ? p : undefined }));
      setArquivos((antes) => (p === 1 || !antes ? r.arquivos : [...antes, ...r.arquivos]));
      setTotal(r.total);
      setPagina(p);
    } catch (e) {
      if ((e as ErroApi).status !== 401) setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setArquivos(null); buscar(1); }, [buscar]);

  return {
    arquivos, total, carregando, erro,
    temMais: !!arquivos && arquivos.length < total,
    carregarMais: () => buscar(pagina + 1),
    recarregar: () => buscar(1), // depois de mudar arquivos (lote, lixeira): volta à 1ª página com os dados novos
  };
}
