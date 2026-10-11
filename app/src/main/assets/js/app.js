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

    // Folha de Configurações de Leitura
    const settingsSheet = document.getElementById("settingsSheet");
    const tocDrawer = document.getElementById("tocDrawer");
    const modalBackdrop = document.getElementById("readerModalBackdrop");

    const closeAllModals = () => {
      tocDrawer?.classList.remove("open");
      settingsSheet?.classList.remove("open");
      modalBackdrop?.classList.add("hidden");
    };

    modalBackdrop?.addEventListener("click", closeAllModals);

    // Gaveta de Sumário (TOC)
    document.getElementById("btnOpenToc")?.addEventListener("click", () => {
      const willOpen = !tocDrawer?.classList.contains("open");
      closeAllModals();
      if (willOpen) {
        tocDrawer?.classList.add("open");
        modalBackdrop?.classList.remove("hidden");
      }
    });
    document.getElementById("btnCloseToc")?.addEventListener("click", closeAllModals);

    // Folha de Configurações de Leitura
    document.getElementById("btnOpenSettings")?.addEventListener("click", () => {
      const willOpen = !settingsSheet?.classList.contains("open");
      closeAllModals();
      if (willOpen) {
        settingsSheet?.classList.add("open");
        modalBackdrop?.classList.remove("hidden");
      }
    });
    document.getElementById("btnCloseSettings")?.addEventListener("click", closeAllModals);

    // Barra de progresso / Scrubber interativo
    const progressSlider = document.getElementById("readerProgressSlider");
    progressSlider?.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      const label = document.getElementById("readerProgressLabel");
      if (label) label.textContent = `${Math.round(val)}%`;
    });
    progressSlider?.addEventListener("change", (e) => {
      const val = parseFloat(e.target.value);
      window.epubReader.seekToPercentage(val);
    });

    // Suporte ao botão voltar do Android via history API
    window.addEventListener("popstate", (e) => {
      if (this.handleBack()) {
        // Se fechou um modal, não sai da tela de leitura
        return;
      }
      if (this.activeView === "reader") {
        this.closeReaderAndGoToLibrary(false);
      }
    });

    // Verifica se havia um livro aberto para retomar a leitura automaticamente
    this.resumeLastBookIfAvailable();

    console.log("LightReader App inicializado.");
  }

  async resumeLastBookIfAvailable() {
    const lastBookId = localStorage.getItem("last_active_book_id");
    if (lastBookId) {
      try {
        const book = await window.bookDB.getBook(lastBookId);
        if (book) {
          console.log("Retomando automaticamente leitura:", book.title);
          await this.openBookInReader(lastBookId, true);
        } else {
          localStorage.removeItem("last_active_book_id");
        }
      } catch (err) {
        console.warn("Falha ao retomar último livro:", err);
      }
    }
  }

  async openBookInReader(bookId, pushHistory = true) {
    localStorage.setItem("last_active_book_id", bookId);
    window.bookLibrary.showLoading("Abrindo livro...");
    try {
      const bookRecord = await window.bookDB.getBook(bookId);
      if (!bookRecord) {
        alert("Livro não encontrado.");
        localStorage.removeItem("last_active_book_id");
        return;
      }

      this.activeView = "reader";
      this.libraryView.classList.add("hidden");
      this.readerView.classList.remove("hidden");

      // Adiciona estado no histórico do navegador para o botão voltar do Android interceptar
      if (pushHistory) {
        window.history.pushState({ view: "reader", bookId: bookId }, "");
      }

      await window.epubReader.openBook(bookRecord);
    } catch (e) {
      console.error("Falha ao abrir livro no leitor:", e);
      alert("Erro ao renderizar o livro.");
      this.closeReaderAndGoToLibrary(false);
    } finally {
      window.bookLibrary.hideLoading();
    }
  }

  handleBack() {
    const tocDrawer = document.getElementById("tocDrawer");
    const settingsSheet = document.getElementById("settingsSheet");
    const modalBackdrop = document.getElementById("readerModalBackdrop");

    if (tocDrawer?.classList.contains("open") || settingsSheet?.classList.contains("open")) {
      tocDrawer?.classList.remove("open");
      settingsSheet?.classList.remove("open");
      modalBackdrop?.classList.add("hidden");
      return true; // back consumido pelo fechamento de modal
    }
    return false;
  }

  closeReaderAndGoToLibrary(shouldGoBackHistory = true) {
    localStorage.removeItem("last_active_book_id");
    window.epubReader.destroy();

    this.activeView = "library";
    this.readerView.classList.add("hidden");
    this.libraryView.classList.remove("hidden");

    // Fecha gavetas e modais se abertos
    document.getElementById("tocDrawer")?.classList.remove("open");
    document.getElementById("settingsSheet")?.classList.remove("open");
    document.getElementById("readerModalBackdrop")?.classList.add("hidden");

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
