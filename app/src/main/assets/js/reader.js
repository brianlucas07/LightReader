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
    this.isControlsVisible = false;
    this.isAnimating = false;
    this.lastToggleTime = 0;
    this.lastTouchEndTime = 0;
    this.resizeTimeout = null;
    this.onWindowResize = () => this.handleResize();
  }

  handleResize() {
    clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => {
      if (this.rendition) {
        try {
          this.rendition.resize();
        } catch (e) {
          console.warn("Erro ao redimensionar rendition:", e);
        }
      }
    }, 150);
  }

  async openBook(bookRecord) {
    this.destroy(); // Limpa instâncias anteriores antes de configurar novo livro
    this.currentBookId = bookRecord.id;
    this.isControlsVisible = false;

    // Escuta mudanças de orientação e redimensionamento da janela
    window.addEventListener("resize", this.onWindowResize);

    // Garante barras ocultas e gavetas fechadas na abertura do livro
    const header = document.getElementById("readerHeader");
    const footer = document.getElementById("readerFooter");
    header?.classList.add("hidden");
    footer?.classList.add("hidden");
    document.getElementById("tocDrawer")?.classList.remove("open");
    document.getElementById("settingsSheet")?.classList.remove("open");
    document.getElementById("readerModalBackdrop")?.classList.add("hidden");

    const targetCfi =
      bookRecord.currentCfi ||
      localStorage.getItem(`last_cfi_${bookRecord.id}`) ||
      null;
    this.currentCfi = targetCfi;

    const viewerEl = document.getElementById("viewer");
    if (!viewerEl) return;
    viewerEl.innerHTML = "";
    void viewerEl.offsetHeight;

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

    // Injeta regras defensivas em todas as seções para impedir overflow vertical
    this.rendition.hooks.content.register((contents) => {
      const doc = contents.document;
      if (!doc) return;
      const style = doc.createElement("style");
      style.textContent = `
        html {
          height: 100% !important;
          overflow: hidden !important;
          margin: 0 !important;
          padding: 0 !important;
          box-sizing: border-box !important;
        }
        body {
          margin: 0 !important;
          box-sizing: border-box !important;
        }
        *, body, div, section, article, p, blockquote {
          break-inside: auto !important;
          page-break-inside: auto !important;
          -webkit-column-break-inside: auto !important;
          box-sizing: border-box !important;
        }
        img, image, svg, video, audio {
          max-width: 100% !important;
          max-height: 75vh !important;
          height: auto !important;
          object-fit: contain !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
          -webkit-column-break-inside: auto !important;
        }
        table, pre {
          max-width: 100% !important;
          word-break: break-word !important;
          overflow-wrap: break-word !important;
        }
      `;
      doc.head?.appendChild(style);
    });

    // Carrega sumário (TOC)
    this.book.loaded.navigation.then((nav) => {
      this.tocItems = nav.toc || [];
      this.renderTocList(this.tocItems);
    });

    // Gera posições para cálculo preciso de porcentagem
    this.book.ready
      .then(() => this.book.locations.generate(1024))
      .then(() => {
        if (this.currentCfi && this.book.locations) {
          const pct = Math.round(this.book.locations.percentageFromCfi(this.currentCfi) * 100);
          this.updateProgressUi(pct);
        }
      });

    // Escuta mudanças de página e atualiza progresso
    this.rendition.on("relocated", (location) => {
      const cfi = location.start.cfi;
      this.currentCfi = cfi;

      let pct = 0;
      if (this.book.locations && this.book.locations.total > 0) {
        pct = Math.round(this.book.locations.percentageFromCfi(cfi) * 100) || 0;
      }
      this.currentProgressPercent = pct;
      this.updateProgressUi(pct);

      // Salva imediatamente no localStorage e atualiza no banco
      if (this.currentBookId) {
        localStorage.setItem(`last_cfi_${this.currentBookId}`, cfi);
        localStorage.setItem("last_active_book_id", this.currentBookId);
        window.bookDB.updateProgress(this.currentBookId, {
          currentCfi: cfi,
          progressPercent: pct
        }).catch((err) => console.warn("Erro ao salvar progresso:", err));
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

    // Configura detecção robusta de gestos (toque central, virada de página e swipe)
    this.setupGestureListeners();

    // Exibe a página (na última posição salva ou no início)
    if (this.currentCfi) {
      console.log("Restaurando leitura no ponto salvo:", this.currentCfi);
      try {
        await this.rendition.display(this.currentCfi);
      } catch (err) {
        console.warn("Falha ao abrir no CFI salvo, abrindo início:", err);
        await this.rendition.display();
      }
    } else {
      await this.rendition.display();
    }

    // Força recalibração exata das dimensões das colunas
    requestAnimationFrame(() => {
      this.rendition?.resize();
    });
    setTimeout(() => {
      this.rendition?.resize();
    }, 150);

    // Configura título do livro na barra superior
    const titleEl = document.getElementById("readerBookTitle");
    if (titleEl) titleEl.textContent = bookRecord.title;
  }

  registerThemes() {
    const commonStyles = {
      "line-height": "1.65 !important",
      padding: "10px 16px 16px 16px !important",
      margin: "0 !important",
      "box-sizing": "border-box !important"
    };

    const textElementsOverride = {
      "p, div, span, a, li, h1, h2, h3, h4, h5, h6": {
        color: "inherit !important",
        "background-color": "transparent !important"
      },
      "p": {
        "margin-top": "0 !important",
        "margin-bottom": "0.75em !important",
        "orphans": "1 !important",
        "widows": "1 !important"
      },
      "h1, h2, h3, h4, h5, h6": {
        "margin-top": "0.4em !important",
        "margin-bottom": "0.4em !important",
        "break-inside": "avoid !important",
        "page-break-inside": "avoid !important"
      },
      "*, body, div, section, article, p, blockquote": {
        "break-inside": "auto !important",
        "page-break-inside": "auto !important",
        "-webkit-column-break-inside": "auto !important",
        "box-sizing": "border-box !important"
      },
      "img, image, svg, video, audio": {
        "max-width": "100% !important",
        "max-height": "70vh !important",
        "height": "auto !important",
        "object-fit": "contain !important",
        "break-inside": "avoid !important",
        "page-break-inside": "avoid !important",
        "-webkit-column-break-inside": "avoid !important"
      },
      "table, pre": {
        "max-width": "100% !important",
        "word-break": "break-word !important",
        "overflow-wrap": "break-word !important"
      }
    };

    this.rendition.themes.register("light", {
      body: {
        background: "#ffffff !important",
        color: "#1a1a1a !important",
        "font-family": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important",
        ...commonStyles
      },
      ...textElementsOverride
    });

    this.rendition.themes.register("dark", {
      body: {
        background: "#121316 !important",
        color: "#e5e7eb !important",
        "font-family": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important",
        ...commonStyles
      },
      ...textElementsOverride
    });

    this.rendition.themes.register("sepia", {
      body: {
        background: "#fbf0d9 !important",
        color: "#5f4b32 !important",
        "font-family": "Georgia, serif !important",
        ...commonStyles
      },
      ...textElementsOverride
    });
  }

  applyTheme(theme) {
    this.currentTheme = theme;
    localStorage.setItem("reader_theme", theme);
    document.getElementById("readerView")?.setAttribute("data-reader-theme", theme);
    if (this.rendition) {
      this.rendition.themes.select(theme);
    }
    // Destaca o botão selecionado nas preferências
    document.querySelectorAll(".theme-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-theme") === theme);
    });
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

  setupGestureListeners() {
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let isTracking = false;

    const onStart = (clientX, clientY) => {
      startX = clientX;
      startY = clientY;
      startTime = Date.now();
      isTracking = true;
    };

    const onEnd = (clientX, clientY, isTouch = false) => {
      if (!isTracking) return;
      isTracking = false;

      if (isTouch) {
        this.lastTouchEndTime = Date.now();
      } else if (Date.now() - this.lastTouchEndTime < 650) {
        // Ignora evento mouseup sintético gerado por toque no Android WebView
        return;
      }

      const deltaX = clientX - startX;
      const deltaY = clientY - startY;
      const deltaTime = Date.now() - startTime;
      const width = window.innerWidth;
      const height = window.innerHeight;

      this.handleGestureEnd(deltaX, deltaY, deltaTime, clientX, clientY, width, height);
    };

    const handleTouchStart = (e) => {
      if (e.touches && e.touches.length === 1) {
        onStart(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const handleTouchEnd = (e) => {
      if (e.changedTouches && e.changedTouches.length > 0) {
        onEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY, true);
      }
    };

    const handleMouseDown = (e) => {
      if (Date.now() - this.lastTouchEndTime < 650) return;
      onStart(e.clientX, e.clientY);
    };

    const handleMouseUp = (e) => {
      if (Date.now() - this.lastTouchEndTime < 650) return;
      onEnd(e.clientX, e.clientY, false);
    };

    // 1. Escuta eventos direto no rendition do ePub.js
    if (this.rendition) {
      this.rendition.on("touchstart", handleTouchStart);
      this.rendition.on("touchend", handleTouchEnd);
      this.rendition.on("mousedown", handleMouseDown);
      this.rendition.on("mouseup", handleMouseUp);

      // 2. Escuta no documento de cada seção/iframe
      this.rendition.on("rendered", (section, view) => {
        const doc = view?.document || view?.iframe?.contentDocument;
        if (!doc) return;
        doc.addEventListener("touchstart", handleTouchStart, { passive: true });
        doc.addEventListener("touchend", handleTouchEnd);
        doc.addEventListener("mousedown", handleMouseDown);
        doc.addEventListener("mouseup", handleMouseUp);
      });
    }

    // 3. Escuta no container do visualizador caso o toque seja na borda/margem
    const viewerEl = document.getElementById("viewer");
    if (viewerEl) {
      viewerEl.addEventListener("touchstart", handleTouchStart, { passive: true });
      viewerEl.addEventListener("touchend", handleTouchEnd);
      viewerEl.addEventListener("mousedown", handleMouseDown);
      viewerEl.addEventListener("mouseup", handleMouseUp);
    }
  }

  handleGestureEnd(deltaX, deltaY, deltaTime, tapX, tapY, screenWidth, screenHeight) {
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Gesto de Swipe horizontal (arrastar na tela para passar de página)
    if (absX > 35 && absX > absY * 1.2 && deltaTime < 700) {
      if (deltaX < 0) {
        this.nextPage();
      } else {
        this.prevPage();
      }
    }
    // Toque simples (tap) na tela
    else if (absX < 35 && absY < 35 && deltaTime < 800) {
      const width = screenWidth || window.innerWidth;
      if (tapX < width * 0.20) {
        // Toque na borda esquerda: volta página
        this.prevPage();
      } else if (tapX > width * 0.80) {
        // Toque na borda direita: avança página
        this.nextPage();
      } else {
        // Toque no meio da tela: exibe ou oculta as barras
        this.toggleControls();
      }
    }
  }

  async nextPage() {
    if (!this.rendition || this.isAnimating) return;
    this.isAnimating = true;

    const viewer = document.getElementById("viewer");
    if (viewer) {
      viewer.classList.remove("page-anim-next-enter", "page-anim-prev-enter", "page-anim-prev-exit");
      viewer.classList.add("page-anim-next-exit");
      await new Promise((r) => setTimeout(r, 160));
    }

    try {
      await this.rendition.next();
    } catch (e) {
      console.warn("Erro ao avançar página:", e);
    }

    if (viewer) {
      viewer.classList.remove("page-anim-next-exit");
      viewer.classList.add("page-anim-next-enter");
      setTimeout(() => {
        viewer.classList.remove("page-anim-next-enter");
        this.isAnimating = false;
      }, 240);
    } else {
      this.isAnimating = false;
    }
  }

  async prevPage() {
    if (!this.rendition || this.isAnimating) return;
    this.isAnimating = true;

    const viewer = document.getElementById("viewer");
    if (viewer) {
      viewer.classList.remove("page-anim-next-enter", "page-anim-prev-enter", "page-anim-next-exit");
      viewer.classList.add("page-anim-prev-exit");
      await new Promise((r) => setTimeout(r, 160));
    }

    try {
      await this.rendition.prev();
    } catch (e) {
      console.warn("Erro ao voltar página:", e);
    }

    if (viewer) {
      viewer.classList.remove("page-anim-prev-exit");
      viewer.classList.add("page-anim-prev-enter");
      setTimeout(() => {
        viewer.classList.remove("page-anim-prev-enter");
        this.isAnimating = false;
      }, 240);
    } else {
      this.isAnimating = false;
    }
  }

  goToLocation(target) {
    if (this.rendition) this.rendition.display(target);
  }

  seekToPercentage(percent) {
    if (this.book?.locations && this.book.locations.total > 0 && this.rendition) {
      const clamped = Math.max(0, Math.min(100, percent));
      const cfi = this.book.locations.cfiFromPercentage(clamped / 100);
      if (cfi) {
        this.rendition.display(cfi);
      }
    }
  }

  updateProgressUi(percent) {
    const clamped = Math.max(0, Math.min(100, percent || 0));
    const label = document.getElementById("readerProgressLabel");
    const slider = document.getElementById("readerProgressSlider");
    if (label) label.textContent = `${clamped}%`;
    if (slider) slider.value = clamped;
  }

  toggleControls() {
    const now = Date.now();
    if (this.lastToggleTime && now - this.lastToggleTime < 350) {
      return; // Previne duplo disparo acidental por eventos concomitantes
    }
    this.lastToggleTime = now;

    this.isControlsVisible = !this.isControlsVisible;
    console.log("[LightReader] toggleControls chamado. Novo estado:", this.isControlsVisible);

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
      document.getElementById("readerModalBackdrop")?.classList.add("hidden");
    }
  }

  findChapter(items, href) {
    const cleanHref = (href || "").split("#")[0];
    for (const item of items) {
      const cleanItemHref = (item.href || "").split("#")[0];
      if (
        (cleanItemHref && cleanHref.endsWith(cleanItemHref)) ||
        (cleanHref && cleanItemHref.endsWith(cleanHref))
      ) {
        return item;
      }
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
          document.getElementById("readerModalBackdrop")?.classList.add("hidden");
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
    this.isAnimating = false;
    window.removeEventListener("resize", this.onWindowResize);
    clearTimeout(this.resizeTimeout);
    document.getElementById("readerModalBackdrop")?.classList.add("hidden");

    const viewer = document.getElementById("viewer");
    if (viewer) {
      viewer.classList.remove(
        "page-anim-next-enter",
        "page-anim-next-exit",
        "page-anim-prev-enter",
        "page-anim-prev-exit"
      );
    }
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
