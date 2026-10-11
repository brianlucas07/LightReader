/**
 * library.js - Gerenciador da estante de livros (importação, exibição e remoção)
 */

class BookLibrary {
  constructor() {
    this.booksContainer = document.getElementById("booksGrid");
    this.emptyState = document.getElementById("emptyLibraryState");
    this.importInput = document.getElementById("epubFileInput");
    this.loadingOverlay = document.getElementById("loadingOverlay");
    this.loadingText = document.getElementById("loadingText");
  }

  init() {
    this.importInput?.addEventListener("change", (e) => this.handleFileSelect(e));
    this.loadBooks();
  }

  showLoading(text = "Carregando...") {
    if (this.loadingOverlay) {
      if (this.loadingText) this.loadingText.textContent = text;
      this.loadingOverlay.classList.remove("hidden");
    }
  }

  hideLoading() {
    if (this.loadingOverlay) {
      this.loadingOverlay.classList.add("hidden");
    }
  }

  async handleFileSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".epub")) {
      alert("Por favor, selecione um arquivo válido no formato .epub");
      event.target.value = "";
      return;
    }

    try {
      this.showLoading("Importando e processando livro...");
      const arrayBuffer = await file.arrayBuffer();

      // Extrai metadados e capa via ePub.js
      const tempBook = ePub(arrayBuffer);
      await tempBook.ready;

      const metadata = await tempBook.loaded.metadata;
      let coverDataUrl = null;

      try {
        const coverUrl = await tempBook.coverUrl();
        if (coverUrl) {
          const res = await fetch(coverUrl);
          const blob = await res.blob();
          coverDataUrl = await this.blobToDataUrl(blob);
        }
      } catch (covErr) {
        console.warn("Não foi possível carregar a capa do EPUB:", covErr);
      }

      tempBook.destroy();

      const newBook = {
        title: metadata.title?.trim() || file.name.replace(/\.epub$/i, ""),
        author: metadata.creator?.trim() || "Autor desconhecido",
        coverDataUrl: coverDataUrl,
        fileBuffer: arrayBuffer,
        fileSize: file.size,
        progressPercent: 0,
        currentCfi: null,
      };

      await window.bookDB.saveBook(newBook);
      await this.loadBooks();
    } catch (err) {
      console.error("Erro ao importar livro:", err);
      alert("Falha ao abrir ou processar o arquivo EPUB.");
    } finally {
      this.hideLoading();
      event.target.value = "";
    }
  }

  blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async loadBooks() {
    const books = await window.bookDB.getAllBooks();

    if (!books || books.length === 0) {
      if (this.booksContainer) this.booksContainer.innerHTML = "";
      this.emptyState?.classList.remove("hidden");
      return;
    }

    this.emptyState?.classList.add("hidden");
    if (!this.booksContainer) return;
    this.booksContainer.innerHTML = "";

    books.forEach((book) => {
      const card = this.createBookCard(book);
      this.booksContainer.appendChild(card);
    });
  }

  createBookCard(book) {
    const card = document.createElement("article");
    card.className = "book-card";

    // Capa do livro
    const coverWrapper = document.createElement("div");
    coverWrapper.className = "book-cover-wrapper";

    if (book.coverDataUrl) {
      const img = document.createElement("img");
      img.src = book.coverDataUrl;
      img.alt = book.title;
      img.className = "book-cover-img";
      coverWrapper.appendChild(img);
    } else {
      // Capa placeholder tipográfica elegante
      const placeholder = document.createElement("div");
      placeholder.className = "book-cover-placeholder";
      placeholder.innerHTML = `
        <span class="cover-icon">📖</span>
        <span class="cover-title-preview">${this.escapeHtml(book.title)}</span>
      `;
      coverWrapper.appendChild(placeholder);
    }

    // Progresso
    const progressPct = Math.round(book.progressPercent || 0);
    const progressBar = document.createElement("div");
    progressBar.className = "book-progress-bar";
    progressBar.innerHTML = `<div class="progress-fill" style="width: ${progressPct}%"></div>`;
    coverWrapper.appendChild(progressBar);

    // Detalhes do livro
    const details = document.createElement("div");
    details.className = "book-details";
    details.innerHTML = `
      <h3 class="book-title" title="${this.escapeHtml(book.title)}">${this.escapeHtml(book.title)}</h3>
      <p class="book-author" title="${this.escapeHtml(book.author)}">${this.escapeHtml(book.author)}</p>
      <div class="book-meta">
        <span class="book-pct">${progressPct}% lido</span>
        <button class="btn-delete" title="Excluir da estante" aria-label="Excluir livro">🗑️</button>
      </div>
    `;

    // Clique para abrir
    coverWrapper.onclick = () => window.app.openBookInReader(book.id);
    details.querySelector(".book-title").onclick = () => window.app.openBookInReader(book.id);

    // Clique para excluir
    const deleteBtn = details.querySelector(".btn-delete");
    deleteBtn.onclick = async (e) => {
      e.stopPropagation();
      if (confirm(`Deseja remover "${book.title}" da sua estante?`)) {
        await window.bookDB.deleteBook(book.id);
        await this.loadBooks();
      }
    };

    card.appendChild(coverWrapper);
    card.appendChild(details);
    return card;
  }

  escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

window.bookLibrary = new BookLibrary();
