/**
 * reader.js - Gerenciador do motor de leitura ePub.js
 */

class EpubReader {
  constructor() {
    this.book = null;
    this.rendition = null;
    this.currentBookId = null;
    this.currentTheme = localStorage.getItem("reader_theme") || "light";
    this.fontSizePercent = parseInt(localStorage.getItem("reader_font_size") || "100", 10);
    this.tocItems = [];
    this.isControlsVisible = true;
  }

  async openBook(bookRecord) {
    this.currentBookId = bookRecord.id;
    this.destroy(); // Limpa instâncias anteriores se houver

    const viewerEl = document.getElementById("viewer");
    if (!viewerEl) return;
    viewerEl.innerHTML = "";

    // Instancia o livro a partir do ArrayBuffer
    this.book = ePub(bookRecord.fileBuffer);

    // Configura renderização responsiva em página única para mobile
    this.rendition = this.book.renderTo("viewer", {
      width: "100%",
      height: "100%",
      spread: "none",
      flow: "paginated"
    });

    // Registra temas
    this.registerThemes();
    this.applyTheme(this.currentTheme);
    this.applyFontSize(this.fontSizePercent);

    // Carrega sumário (TOC)
    this.book.loaded.navigation.then((nav) => {
      this.tocItems = nav.toc || [];
      this.renderTocList(this.tocItems);
    });

    // Gera posições para cálculo preciso de porcentagem
    this.book.ready
      .then(() => this.book.locations.generate(1024))
      .then(() => {
        if (bookRecord.currentCfi && this.book.locations) {
          const pct = Math.round(this.book.locations.percentageFromCfi(bookRecord.currentCfi) * 100);
          this.updateProgressUi(pct);
        }
      });

    // Escuta mudanças de página e atualiza progresso
    this.rendition.on("relocated", (location) => {
      const cfi = location.start.cfi;
      let pct = 0;
      if (this.book.locations && this.book.locations.total > 0) {
        pct = Math.round(this.book.locations.percentageFromCfi(cfi) * 100) || 0;
      }
      this.updateProgressUi(pct);

      // Persiste no IndexedDB
      if (this.currentBookId) {
        window.bookDB.updateProgress(this.currentBookId, {
          currentCfi: cfi,
          progressPercent: pct
        });
      }

      // Atualiza título do capítulo se disponível
      if (location.start.href && this.tocItems.length > 0) {
        const item = this.findChapter(this.tocItems, location.start.href);
        if (item) {
          const chapterEl = document.getElementById("readerChapterTitle");
          if (chapterEl) chapterEl.textContent = item.label.trim();
        }
      }
    });

    // Intercepta toques dentro do iframe para navegar e alternar controles
    this.rendition.on("rendered", (section, view) => {
      view.document.body.addEventListener("click", (e) => {
        const width = view.window.innerWidth;
        const x = e.clientX;

        // Borda esquerda (25%): Volta página
        if (x < width * 0.25) {
          this.prevPage();
        }
        // Borda direita (25%): Avança página
        else if (x > width * 0.75) {
          this.nextPage();
        }
        // Centro (50%): Alterna visibilidade dos menus
        else {
          this.toggleControls();
        }
      });
    });

    // Exibe a página (na última posição ou no início)
    if (bookRecord.currentCfi) {
      await this.rendition.display(bookRecord.currentCfi);
    } else {
      await this.rendition.display();
    }

    // Configura título do livro na barra superior
    const titleEl = document.getElementById("readerBookTitle");
    if (titleEl) titleEl.textContent = bookRecord.title;
  }

  registerThemes() {
    this.rendition.themes.register("light", {
      body: {
        background: "#ffffff !important",
        color: "#1a1a1a !important",
        "font-family": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important",
        "line-height": "1.7 !important",
        padding: "0 16px !important"
      }
    });

    this.rendition.themes.register("dark", {
      body: {
        background: "#121316 !important",
        color: "#e5e7eb !important",
        "font-family": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important",
        "line-height": "1.7 !important",
        padding: "0 16px !important"
      }
    });

    this.rendition.themes.register("sepia", {
      body: {
        background: "#fbf0d9 !important",
        color: "#5f4b32 !important",
        "font-family": "Georgia, serif !important",
        "line-height": "1.7 !important",
        padding: "0 16px !important"
      }
    });
  }

  applyTheme(theme) {
    this.currentTheme = theme;
    localStorage.setItem("reader_theme", theme);
    document.getElementById("readerView")?.setAttribute("data-reader-theme", theme);
    if (this.rendition) {
      this.rendition.themes.select(theme);
    }
  }

  applyFontSize(percent) {
    this.fontSizePercent = Math.max(70, Math.min(180, percent));
    localStorage.setItem("reader_font_size", this.fontSizePercent.toString());
    if (this.rendition) {
      this.rendition.themes.fontSize(`${this.fontSizePercent}%`);
    }
    const fontDisplay = document.getElementById("fontSizeDisplay");
    if (fontDisplay) fontDisplay.textContent = `${this.fontSizePercent}%`;
  }

  increaseFontSize() {
    this.applyFontSize(this.fontSizePercent + 10);
  }

  decreaseFontSize() {
    this.applyFontSize(this.fontSizePercent - 10);
  }

  nextPage() {
    if (this.rendition) this.rendition.next();
  }

  prevPage() {
    if (this.rendition) this.rendition.prev();
  }

  goToLocation(target) {
    if (this.rendition) this.rendition.display(target);
  }

  updateProgressUi(percent) {
    const clamped = Math.max(0, Math.min(100, percent || 0));
    const label = document.getElementById("readerProgressLabel");
    const slider = document.getElementById("readerProgressSlider");
    if (label) label.textContent = `${clamped}%`;
    if (slider) slider.value = clamped;
  }

  toggleControls() {
    this.isControlsVisible = !this.isControlsVisible;
    const header = document.getElementById("readerHeader");
    const footer = document.getElementById("readerFooter");
    if (this.isControlsVisible) {
      header?.classList.remove("hidden");
      footer?.classList.remove("hidden");
    } else {
      header?.classList.add("hidden");
      footer?.classList.add("hidden");
      document.getElementById("tocDrawer")?.classList.remove("open");
      document.getElementById("settingsSheet")?.classList.remove("open");
    }
  }

  findChapter(items, href) {
    for (const item of items) {
      if (item.href && href.includes(item.href)) return item;
      if (item.subitems && item.subitems.length > 0) {
        const found = this.findChapter(item.subitems, href);
        if (found) return found;
      }
    }
    return null;
  }

  renderTocList(items) {
    const listEl = document.getElementById("tocList");
    if (!listEl) return;
    listEl.innerHTML = "";

    if (!items || items.length === 0) {
      listEl.innerHTML = "<p class='empty-state'>Sem sumário disponível.</p>";
      return;
    }

    const appendItems = (tocArr, parentUl, depth = 0) => {
      tocArr.forEach((item) => {
        const li = document.createElement("li");
        li.style.paddingLeft = `${depth * 16}px`;
        li.textContent = item.label.trim();
        li.onclick = () => {
          this.goToLocation(item.href);
          document.getElementById("tocDrawer")?.classList.remove("open");
        };
        parentUl.appendChild(li);
        if (item.subitems && item.subitems.length > 0) {
          appendItems(item.subitems, parentUl, depth + 1);
        }
      });
    };

    const ul = document.createElement("ul");
    appendItems(items, ul);
    listEl.appendChild(ul);
  }

  destroy() {
    if (this.rendition) {
      try {
        this.rendition.destroy();
      } catch (e) {
        console.warn("Erro ao destruir rendition:", e);
      }
      this.rendition = null;
    }
    if (this.book) {
      try {
        this.book.destroy();
      } catch (e) {
        console.warn("Erro ao destruir book:", e);
      }
      this.book = null;
    }
    this.currentBookId = null;
  }
}

window.epubReader = new EpubReader();
