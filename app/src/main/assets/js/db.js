/**
 * db.js - Camada de persistência local via IndexedDB para o LightReader
 */

const DB_NAME = "LightReaderDB";
const DB_VERSION = 1;
const STORE_NAME = "books";

class BookDatabase {
  constructor() {
    this.dbPromise = this.init();
  }

  init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("lastReadAt", "lastReadAt", { unique: false });
          store.createIndex("addedAt", "addedAt", { unique: false });
          store.createIndex("title", "title", { unique: false });
        }
      };

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        console.error("Erro ao abrir IndexedDB:", event.target.error);
        reject(event.target.error);
      };
    });
  }

  async getStore(mode = "readonly") {
    const db = await this.dbPromise;
    const tx = db.transaction(STORE_NAME, mode);
    return tx.objectStore(STORE_NAME);
  }

  async saveBook(book) {
    const store = await this.getStore("readwrite");
    return new Promise((resolve, reject) => {
      const record = {
        id: book.id || crypto.randomUUID(),
        title: book.title || "Sem Título",
        author: book.author || "Autor Desconhecido",
        coverDataUrl: book.coverDataUrl || null,
        fileBuffer: book.fileBuffer, // ArrayBuffer do .epub
        currentCfi: book.currentCfi || null,
        progressPercent: book.progressPercent || 0,
        fileSize: book.fileSize || (book.fileBuffer ? book.fileBuffer.byteLength : 0),
        addedAt: book.addedAt || Date.now(),
        lastReadAt: book.lastReadAt || Date.now(),
      };

      const request = store.put(record);
      request.onsuccess = () => resolve(record);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async getAllBooks() {
    const store = await this.getStore("readonly");
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const books = (request.result || []).map((book) => {
          const cachedCfi = localStorage.getItem(`last_cfi_${book.id}`);
          if (cachedCfi) book.currentCfi = cachedCfi;
          // Omite fileBuffer na listagem da estante para economizar memória RAM
          const { fileBuffer, ...metadata } = book;
          return metadata;
        }).sort(
          (a, b) => (b.lastReadAt || b.addedAt || 0) - (a.lastReadAt || a.addedAt || 0)
        );
        resolve(books);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async getBook(id) {
    const store = await this.getStore("readonly");
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => {
        const book = request.result;
        if (book) {
          const cachedCfi = localStorage.getItem(`last_cfi_${book.id}`);
          if (cachedCfi) {
            book.currentCfi = cachedCfi;
          }
        }
        resolve(book);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async updateProgress(id, { currentCfi, progressPercent }) {
    if (currentCfi) {
      localStorage.setItem(`last_cfi_${id}`, currentCfi);
    }
    const store = await this.getStore("readwrite");
    return new Promise((resolve, reject) => {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const book = getReq.result;
        if (!book) return resolve(null);

        if (currentCfi !== undefined) book.currentCfi = currentCfi;
        if (progressPercent !== undefined) book.progressPercent = progressPercent;
        book.lastReadAt = Date.now();

        const putReq = store.put(book);
        putReq.onsuccess = () => resolve(book);
        putReq.onerror = (e) => reject(e.target.error);
      };
      getReq.onerror = (e) => reject(e.target.error);
    });
  }

  async deleteBook(id) {
    localStorage.removeItem(`last_cfi_${id}`);
    if (localStorage.getItem("last_active_book_id") === id) {
      localStorage.removeItem("last_active_book_id");
    }
    const store = await this.getStore("readwrite");
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  }
}

window.bookDB = new BookDatabase();
