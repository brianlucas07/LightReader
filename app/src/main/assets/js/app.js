document.addEventListener("DOMContentLoaded", () => {
  const themeToggle = document.getElementById("themeToggle");
  const epubInput = document.getElementById("epubInput");
  const fileInfo = document.getElementById("fileInfo");

  // Alternância de tema Dark/Light
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (prefersDark) {
    document.documentElement.setAttribute("data-theme", "dark");
  }

  themeToggle?.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", nextTheme);
  });

  // Listener para seleção de arquivo EPUB
  epubInput?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) {
      fileInfo.textContent = `Arquivo carregado: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      console.log("EPUB selecionado:", file.name, file.size);
    }
  });

  console.log("LightReader Web Launcher inicializado com sucesso.");
});
