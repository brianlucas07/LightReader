/**
 * app.js - Ponto de entrada da SPA LightReader e roteador de navegação
 */

class AppController {
  constructor() {
    this.libraryView = document.getElementById("libraryView");
    this.readerView = document.getElementById("readerView");
    this.activeView = "library";
  }

  init() {
    // Inicializa a estante
    window.bookLibrary.init();

    // Configura botões de tema da aplicação
    const themeToggle = document.getElementById("themeToggle");
    const currentAppTheme = localStorage.getItem("app_theme") || "light";
    document.documentElement.setAttribute("data-theme", currentAppTheme);

    themeToggle?.addEventListener("click", () => {
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      const next = isDark ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("app_theme", next);
    });

    // Botão voltar do leitor para a estante
    document.getElementById("btnBackToLibrary")?.addEventListener("click", () => {
      this.closeReaderAndGoToLibrary();
    });

    // Botões de tema no Leitor (Light, Dark, Sepia)
    document.querySelectorAll(".theme-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const theme = btn.getAttribute("data-theme");
        if (theme) window.epubReader.applyTheme(theme);
      });
    });

    // Botões de tamanho de fonte no Leitor
    document.getElementById("btnFontDecrease")?.addEventListener("click", () => {
      window.epubReader.decreaseFontSize();
    });
    document.getElementById("btnFontIncrease")?.addEventListener("click", () => {
      window.epubReader.increaseFontSize();
    });

    // Gaveta de Sumário (TOC)
    const tocDrawer = document.getElementById("tocDrawer");
    document.getElementById("btnOpenToc")?.addEventListener("click", () => {
      tocDrawer?.classList.toggle("open");
    });
    document.getElementById("btnCloseToc")?.addEventListener("click", () => {
      tocDrawer?.classList.remove("open");
    });

    // Folha de Configurações de Leitura
    const settingsSheet = document.getElementById("settingsSheet");
    document.getElementById("btnOpenSettings")?.addEventListener("click", () => {
      settingsSheet?.classList.toggle("open");
    });
    document.getElementById("btnCloseSettings")?.addEventListener("click", () => {
      settingsSheet?.classList.remove("open");
    });

    // Suporte ao botão voltar do Android via history API
    window.addEventListener("popstate", (e) => {
      if (this.activeView === "reader") {
        this.closeReaderAndGoToLibrary(false);
      }
    });

    console.log("LightReader App inicializado.");
  }

  async openBookInReader(bookId) {
    window.bookLibrary.showLoading("Abrindo livro...");
    try {
      const bookRecord = await window.bookDB.getBook(bookId);
      if (!bookRecord) {
        alert("Livro não encontrado.");
        return;
      }

      this.activeView = "reader";
      this.libraryView.classList.add("hidden");
      this.readerView.classList.remove("hidden");

      // Adiciona estado no histórico do navegador para o botão voltar do Android interceptar
      window.history.pushState({ view: "reader", bookId: bookId }, "");

      await window.epubReader.openBook(bookRecord);
    } catch (e) {
      console.error("Falha ao abrir livro no leitor:", e);
      alert("Erro ao renderizar o livro.");
      this.closeReaderAndGoToLibrary(false);
    } finally {
      window.bookLibrary.hideLoading();
    }
  }

  closeReaderAndGoToLibrary(shouldGoBackHistory = true) {
    window.epubReader.destroy();

    this.activeView = "library";
    this.readerView.classList.add("hidden");
    this.libraryView.classList.remove("hidden");

    // Fecha gavetas se abertas
    document.getElementById("tocDrawer")?.classList.remove("open");
    document.getElementById("settingsSheet")?.classList.remove("open");

    // Recarrega a estante para exibir o progresso atualizado
    window.bookLibrary.loadBooks();

    if (shouldGoBackHistory && window.history.state?.view === "reader") {
      window.history.back();
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.app = new AppController();
  window.app.init();
});
