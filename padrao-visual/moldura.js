// Padrão visual Importek · v1 · MENU DO CELULAR da moldura (sistemas sem React).
// Fonte oficial: portal-importek/padrao-visual/v1/. ⚠️ Cópia num projeto não se edita.
//
// Script comum (não módulo), para funcionar até aberto como arquivo. Liga:
//   [data-pi-menu-abrir]   abre a .pi-lateral (botão "Menu" da barra do celular)
//   [data-pi-menu-fechar]  fecha (botão "Fechar" no alto da lateral)
//   .pi-veu-menu           fecha ao tocar no fundo
//   Esc                    fecha
//   .pi-nav-item           fecha ao escolher um item (o menu não fica aberto por cima da tela)
// Sistemas em React fazem o mesmo com estado próprio (ver o Layout.tsx do portal).
(function () {
  function ligar() {
    var lateral = document.querySelector('.pi-lateral');
    var veu = document.querySelector('.pi-veu-menu');
    if (!lateral) return;
    var abrirBotoes = document.querySelectorAll('[data-pi-menu-abrir]');
    function definir(aberto) {
      lateral.classList.toggle('aberta', aberto);
      if (veu) veu.classList.toggle('aberto', aberto);
      for (var i = 0; i < abrirBotoes.length; i++) abrirBotoes[i].setAttribute('aria-expanded', aberto ? 'true' : 'false');
    }
    for (var i = 0; i < abrirBotoes.length; i++) abrirBotoes[i].addEventListener('click', function () { definir(true); });
    var fechar = document.querySelectorAll('[data-pi-menu-fechar]');
    for (var j = 0; j < fechar.length; j++) fechar[j].addEventListener('click', function () { definir(false); });
    if (veu) veu.addEventListener('click', function () { definir(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') definir(false); });
    lateral.addEventListener('click', function (e) {
      var alvo = e.target && e.target.closest ? e.target.closest('.pi-nav-item') : null;
      if (alvo) definir(false);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ligar);
  else ligar();
})();
