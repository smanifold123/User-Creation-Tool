function toggleTheme() {
    const body = document.body;
    body.classList.toggle("dark-mode");
}

document.addEventListener("DOMContentLoaded", () => {
    const btn = document.createElement("button");
    btn.textContent = "Toggle Theme";
    btn.style.position = "fixed";
    btn.style.bottom = "20px";
    btn.style.right = "20px";
    btn.onclick = toggleTheme;
    document.body.appendChild(btn);
});
