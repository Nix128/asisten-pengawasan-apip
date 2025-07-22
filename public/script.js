const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");
const chatBtn = document.getElementById("chat-btn");
const chatInput = document.getElementById("chat-input");
const historyDiv = document.getElementById("history");
const user = "Kak Nixon";

uploadBtn.addEventListener("click", async () => {
  if (!fileInput.files.length) return alert("Pilih file dulu!");
  const form = new FormData();
  form.append("file", fileInput.files[0]);
  form.append("user", user);
  const res = await fetch("/.netlify/functions/upload", {
    method: "POST",
    body: form
  });
  const j = await res.json();
  alert(j.message);
});

chatBtn.addEventListener("click", async () => {
  if (!chatInput.value) return;
  await postMessage(chatInput.value);
  chatInput.value = "";
  loadHistory();
});

async function postMessage(message) {
  const res = await fetch("/.netlify/functions/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user, message })
  });
  const { reply } = await res.json();
  displayMessage("bot", reply);
}

async function loadHistory() {
  const res = await fetch("/.netlify/functions/history");
  const logs = await res.json();
  historyDiv.innerHTML = "";
  logs.forEach(log => {
    displayMessage("user", log.message);
    displayMessage("bot", log.reply);
  });
}

function displayMessage(type, text) {
  const div = document.createElement("div");
  div.className = `message ${type}`;
  div.textContent = (type === "user" ? "👤 " : "🤖 ") + text;
  historyDiv.appendChild(div);
}

loadHistory();