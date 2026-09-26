/**
 * Deific Digital — AI Receptionist embeddable widget.
 *
 * Add this ONE line before </body> on every page of your static website:
 *
 *   <script src="https://YOUR-BACKEND-URL/widget.js" defer></script>
 *
 * Replace YOUR-BACKEND-URL with wherever you deploy this ai-receptionist
 * Node app (Render, Railway, etc). The widget figures out its own backend
 * origin automatically from the src of this very script tag, so you don't
 * need to configure anything else.
 *
 * If for some reason you serve this file from a different place than the
 * backend itself (e.g. a CDN), you can force the API origin explicitly:
 *
 *   <script src="https://cdn.example.com/widget.js"
 *           data-api-base="https://YOUR-BACKEND-URL" defer></script>
 */
(function () {
  const thisScript = document.currentScript;
  const apiBase =
    (thisScript && thisScript.dataset && thisScript.dataset.apiBase) ||
    (thisScript && new URL(thisScript.src, window.location.href).origin) ||
    "";

  // ---- Host element + Shadow DOM (isolates our CSS from the site's CSS) ----
  const host = document.createElement("div");
  host.id = "deific-ai-receptionist-widget";
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      :root {
        --primary: #0d6e6e;
        --primary-dark: #095454;
        --bg: #ffffff;
        --bubble-ai: #e8f3f3;
        --bubble-user: #0d6e6e;
      }

      #launcher {
        position: fixed;
        bottom: 22px;
        right: 22px;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        border: none;
        background: var(--primary);
        color: white;
        font-size: 26px;
        cursor: pointer;
        box-shadow: 0 6px 18px rgba(13,110,110,0.4);
        z-index: 999999;
        transition: transform 0.15s ease, background 0.15s ease;
      }
      #launcher:hover { background: var(--primary-dark); transform: scale(1.05); }

      #panel {
        position: fixed;
        bottom: 94px;
        right: 22px;
        width: 350px;
        max-width: calc(100vw - 32px);
        height: 480px;
        max-height: calc(100vh - 140px);
        background: var(--bg);
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.25);
        display: none;
        flex-direction: column;
        overflow: hidden;
        z-index: 999999;
      }
      #panel.open { display: flex; }

      #panelHeader {
        background: var(--primary);
        color: white;
        padding: 14px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
      }
      #panelHeader h1 { font-size: 0.95rem; margin: 0; }
      #panelHeader p { font-size: 0.72rem; margin: 2px 0 0; opacity: 0.85; }
      #closeBtn { background: none; border: none; color: white; font-size: 20px; cursor: pointer; line-height: 1; }

      #chat {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 14px;
        overflow-y: auto;
      }
      .bubble { max-width: 82%; padding: 9px 12px; border-radius: 14px; font-size: 0.88rem; line-height: 1.35; }
      .bubble.ai { background: var(--bubble-ai); color: #063b3b; align-self: flex-start; border-bottom-left-radius: 4px; }
      .bubble.user { background: var(--bubble-user); color: white; align-self: flex-end; border-bottom-right-radius: 4px; }
      .bubble.system { align-self: center; background: #fff3cd; color: #7a5b00; font-size: 0.78rem; }

      #controls {
        flex-shrink: 0;
        border-top: 1px solid #eee;
        padding: 10px 12px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      #textInput {
        flex: 1;
        border: 1px solid #ddd;
        border-radius: 20px;
        padding: 8px 14px;
        font-size: 0.88rem;
        outline: none;
      }
      #textInput:focus { border-color: var(--primary); }
      #sendBtn, #micBtn {
        border: none;
        background: var(--primary);
        color: white;
        border-radius: 50%;
        width: 38px;
        height: 38px;
        font-size: 16px;
        cursor: pointer;
        flex-shrink: 0;
      }
      #micBtn.listening { background: #d1453b; animation: pulse 1.2s infinite; }
      @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(209,69,59,0.5); }
        70% { box-shadow: 0 0 0 10px rgba(209,69,59,0); }
        100% { box-shadow: 0 0 0 0 rgba(209,69,59,0); }
      }
      #status { font-size: 0.72rem; color: #777; text-align: center; padding: 4px 0 0; }
    </style>

    <button id="launcher" title="Chat with our AI receptionist">💬</button>

    <div id="panel">
      <div id="panelHeader">
        <div>
          <h1>Deific Digital</h1>
          <p>AI Receptionist — ask us anything</p>
        </div>
        <button id="closeBtn">✕</button>
      </div>
      <div id="chat"></div>
      <div id="controls">
        <button id="micBtn" title="Speak">🎤</button>
        <input id="textInput" type="text" placeholder="Type a message..." />
        <button id="sendBtn" title="Send">➤</button>
      </div>
      <div id="status"></div>
    </div>
  `;

  const launcher = root.getElementById("launcher");
  const panel = root.getElementById("panel");
  const closeBtn = root.getElementById("closeBtn");
  const chatEl = root.getElementById("chat");
  const micBtn = root.getElementById("micBtn");
  const textInput = root.getElementById("textInput");
  const sendBtn = root.getElementById("sendBtn");
  const statusEl = root.getElementById("status");

  let sessionId = crypto.randomUUID();
  let started = false;
  let listening = false;
  let recognition = null;
  let cachedVoices = [];

  function addBubble(role, text) {
    const div = document.createElement("div");
    div.className = "bubble " + role;
    div.textContent = text;
    chatEl.appendChild(div);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function loadVoices() {
    return new Promise((resolve) => {
      let voices = window.speechSynthesis.getVoices();
      if (voices.length) return resolve(voices);
      window.speechSynthesis.onvoiceschanged = () =>
        resolve(window.speechSynthesis.getVoices());
    });
  }
  loadVoices().then((v) => (cachedVoices = v));

  function detectSpeechLang(text) {
    return /[\u0900-\u097F]/.test(text) ? "hi-IN" : "en-IN";
  }

  function pickFemaleVoice(voices, targetLang) {
    const femaleHints = [
      "neerja",
      "swara",
      "heera",
      "kalpana",
      "lekha",
      "veena",
      "priya",
      "female",
      "google हिन्दी",
      "zira",
      "samantha",
      "moira",
      "tessa",
    ];
    const exactLang = voices.filter(
      (v) => v.lang.toLowerCase() === targetLang.toLowerCase(),
    );
    const indianLang = voices.filter((v) => /^(hi-in|en-in)$/i.test(v.lang));
    for (const pool of [exactLang, indianLang, voices]) {
      if (!pool.length) continue;
      const match = pool.find((v) =>
        femaleHints.some((h) => v.name.toLowerCase().includes(h)),
      );
      if (match) return match;
    }
    const fallbackPool = indianLang.length ? indianLang : voices;
    return (
      fallbackPool.find((v) => !/male/i.test(v.name)) ||
      fallbackPool[0] ||
      voices[0] ||
      null
    );
  }

  function speak(text) {
    return new Promise(async (resolve) => {
      if (!cachedVoices.length) cachedVoices = await loadVoices();
      const targetLang = detectSpeechLang(text);
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.0;
      utter.pitch = 1.05;
      utter.lang = targetLang;
      const voice = pickFemaleVoice(cachedVoices, targetLang);
      if (voice) {
        utter.voice = voice;
        utter.lang = voice.lang;
      }
      utter.onend = resolve;
      utter.onerror = resolve;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    });
  }

  async function startConversation() {
    statusEl.textContent = "Connecting...";
    try {
      const res = await fetch(apiBase + "/web/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      addBubble("ai", data.reply);
      statusEl.textContent = "";
      started = true;
      speak(data.reply);
    } catch (err) {
      addBubble(
        "system",
        "Could not reach the assistant. Please try again shortly.",
      );
      console.error("[ai-widget]", err);
    }
  }

  async function sendMessage(text) {
    if (!text.trim()) return;
    if (!started) await startConversation();
    addBubble("user", text);
    statusEl.textContent = "Thinking...";
    try {
      const res = await fetch(apiBase + "/web/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
      });
      const data = await res.json();
      if (data.error) {
        addBubble("system", "Something went wrong. Please try again.");
        statusEl.textContent = "";
        return;
      }
      addBubble("ai", data.reply);
      if (data.leadCaptured)
        addBubble("system", "✅ Thanks! We've noted your details.");
      statusEl.textContent = "";
      speak(data.reply);
    } catch (err) {
      addBubble("system", "Could not reach the assistant.");
      console.error("[ai-widget]", err);
      statusEl.textContent = "";
    }
  }

  function setupRecognition() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      micBtn.style.display = "none";
      return null;
    }
    const rec = new SpeechRecognition();
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => {
      listening = true;
      micBtn.classList.add("listening");
      statusEl.textContent = "Listening...";
    };
    rec.onresult = (event) => sendMessage(event.results[0][0].transcript);
    rec.onerror = (event) => {
      statusEl.textContent = "Mic error (" + event.error + ")";
    };
    rec.onend = () => {
      listening = false;
      micBtn.classList.remove("listening");
    };
    return rec;
  }
  recognition = setupRecognition();

  launcher.addEventListener("click", async () => {
    const isOpen = panel.classList.toggle("open");
    if (isOpen && !started) await startConversation();
  });
  closeBtn.addEventListener("click", () => panel.classList.remove("open"));

  sendBtn.addEventListener("click", () => {
    const text = textInput.value;
    textInput.value = "";
    sendMessage(text);
  });
  textInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const text = textInput.value;
      textInput.value = "";
      sendMessage(text);
    }
  });
  micBtn.addEventListener("click", () => {
    if (!recognition) return;
    if (listening) {
      recognition.stop();
      return;
    }
    window.speechSynthesis.cancel();
    recognition.start();
  });
})();
