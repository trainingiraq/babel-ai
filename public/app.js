const messagesEl = document.querySelector("#messages");
const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const sendButton = document.querySelector("#send-button");
const statusText = document.querySelector("#status-text");
const modelBadge = document.querySelector("#model-badge");
const copyLastButton = document.querySelector("#copy-last");
const clearButton = document.querySelector("#clear-chat");
const modeButtons = Array.from(document.querySelectorAll(".mode-button"));
const accessCodeGroup = document.querySelector("#access-code-group");
const accessCodeInput = document.querySelector("#access-code");
const saveAccessCodeButton = document.querySelector("#save-access-code");
const chatListEl = document.querySelector("#chat-list");
const newChatButton = document.querySelector("#new-chat");

const legacyStorageKey = "public-chat-mvp-history";
const chatsStorageKey = "babel-ai-chats-v1";
const activeChatStorageKey = "babel-ai-active-chat-id";
const accessCodeStorageKey = "public-chat-access-code";
const maxStoredMessages = 80;

const welcomeMessage = {
  role: "assistant",
  content:
    "مرحبًا. أنا بابل AI، مساعدك الذكي. اسألني عن فكرة، رسالة، خطة، تعلم موضوع، أو تنظيم مهمة يومية.",
};

let mode = "balanced";
let isSending = false;
let accessCode = localStorage.getItem(accessCodeStorageKey) || "";
let chats = loadChats();
let activeChatId = selectInitialChatId();
let messages = getActiveChat().messages;

if (accessCodeInput) {
  accessCodeInput.value = accessCode;
}

function newId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cloneWelcomeMessage() {
  return { ...welcomeMessage };
}

function createChat(title = "محادثة جديدة", seedMessages) {
  const now = Date.now();
  return {
    id: newId(),
    title,
    messages: Array.isArray(seedMessages) && seedMessages.length ? seedMessages : [cloneWelcomeMessage()],
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeChat(chat) {
  if (!chat || typeof chat !== "object") return null;
  if (!Array.isArray(chat.messages) || chat.messages.length === 0) return null;

  return {
    id: String(chat.id || newId()),
    title: String(chat.title || "محادثة جديدة").slice(0, 80),
    messages: chat.messages
      .filter((message) => message && (message.role === "user" || message.role === "assistant"))
      .map((message) => ({
        role: message.role,
        content: String(message.content || ""),
      }))
      .slice(-maxStoredMessages),
    createdAt: Number(chat.createdAt || Date.now()),
    updatedAt: Number(chat.updatedAt || Date.now()),
  };
}

function loadLegacyChat() {
  try {
    const legacy = JSON.parse(localStorage.getItem(legacyStorageKey) || "null");
    if (Array.isArray(legacy) && legacy.length > 0) {
      const firstUserMessage = legacy.find((message) => message && message.role === "user");
      return createChat(firstUserMessage ? deriveTitle(firstUserMessage.content) : "محادثتي الأولى", legacy);
    }
  } catch {
    localStorage.removeItem(legacyStorageKey);
  }
  return null;
}

function loadChats() {
  try {
    const saved = JSON.parse(localStorage.getItem(chatsStorageKey) || "null");
    if (Array.isArray(saved)) {
      const normalized = saved.map(normalizeChat).filter(Boolean);
      if (normalized.length > 0) return normalized;
    }
  } catch {
    localStorage.removeItem(chatsStorageKey);
  }

  const legacyChat = loadLegacyChat();
  return [legacyChat || createChat()];
}

function selectInitialChatId() {
  const savedId = localStorage.getItem(activeChatStorageKey);
  if (savedId && chats.some((chat) => chat.id === savedId)) {
    return savedId;
  }
  return sortChats(chats)[0].id;
}

function getActiveChat() {
  let chat = chats.find((item) => item.id === activeChatId);
  if (!chat) {
    chat = chats[0] || createChat();
    chats = [chat];
    activeChatId = chat.id;
  }
  return chat;
}

function sortChats(items) {
  return [...items].sort((a, b) => b.updatedAt - a.updatedAt);
}

function persistChats() {
  localStorage.setItem(activeChatStorageKey, activeChatId);
  localStorage.setItem(
    chatsStorageKey,
    JSON.stringify(
      sortChats(chats).map((chat) => ({
        ...chat,
        messages: chat.messages.slice(-maxStoredMessages),
      }))
    )
  );
}

function deriveTitle(text) {
  const clean = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "محادثة جديدة";
  return clean.length > 34 ? `${clean.slice(0, 34)}...` : clean;
}

function maybeNameActiveChat() {
  const chat = getActiveChat();
  const firstUserMessage = chat.messages.find((message) => message.role === "user");
  if (firstUserMessage && (!chat.title || chat.title === "محادثة جديدة")) {
    chat.title = deriveTitle(firstUserMessage.content);
  }
}

function saveActiveChat() {
  const chat = getActiveChat();
  chat.messages = messages
    .filter((message) => message && (message.role === "user" || message.role === "assistant"))
    .map((message) => ({
      role: message.role,
      content: String(message.content || ""),
      pending: Boolean(message.pending),
    }))
    .slice(-maxStoredMessages);
  chat.updatedAt = Date.now();
  maybeNameActiveChat();
  persistChats();
  renderChatList();
}

function setStatus(text) {
  statusText.textContent = text;
}

function renderChatList() {
  chatListEl.innerHTML = "";

  for (const chat of sortChats(chats)) {
    const item = document.createElement("div");
    item.className = `chat-list-item${chat.id === activeChatId ? " active" : ""}`;

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "chat-open-button";
    openButton.dataset.chatId = chat.id;
    openButton.textContent = chat.title || "محادثة جديدة";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "chat-delete-button";
    deleteButton.dataset.deleteChatId = chat.id;
    deleteButton.setAttribute("aria-label", `حذف ${chat.title || "المحادثة"}`);
    deleteButton.textContent = "×";

    item.append(openButton, deleteButton);
    chatListEl.appendChild(item);
  }
}

function renderMessages() {
  messagesEl.innerHTML = "";

  for (const message of messages) {
    const bubble = document.createElement("article");
    bubble.className = `message ${message.role}${message.pending ? " pending" : ""}`;
    bubble.dir = "auto";
    bubble.textContent = message.content;
    messagesEl.appendChild(bubble);
  }

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function switchChat(chatId) {
  const chat = chats.find((item) => item.id === chatId);
  if (!chat || isSending) return;

  activeChatId = chat.id;
  messages = chat.messages;
  persistChats();
  renderChatList();
  renderMessages();
  setStatus("تم فتح المحادثة.");
  input.focus();
}

function startNewChat() {
  if (isSending) return;

  const chat = createChat();
  chats.unshift(chat);
  activeChatId = chat.id;
  messages = chat.messages;
  persistChats();
  renderChatList();
  renderMessages();
  setStatus("بدأت محادثة جديدة.");
  input.focus();
}

function deleteChat(chatId) {
  if (isSending) return;

  const deletingActive = chatId === activeChatId;
  chats = chats.filter((chat) => chat.id !== chatId);

  if (chats.length === 0) {
    chats = [createChat()];
  }

  if (deletingActive) {
    activeChatId = sortChats(chats)[0].id;
    messages = getActiveChat().messages;
  }

  persistChats();
  renderChatList();
  renderMessages();
  setStatus("تم حذف المحادثة.");
  input.focus();
}

function addMessage(role, content) {
  messages.push({ role, content });
  saveActiveChat();
  renderMessages();
}

function setSending(nextValue) {
  isSending = nextValue;
  sendButton.disabled = nextValue;
  input.disabled = nextValue;
  sendButton.textContent = nextValue ? "ينتظر" : "إرسال";
}

function localizeError(message) {
  if (!message) {
    return "تعذر تنفيذ الطلب. حاول مرة أخرى.";
  }

  if (message.includes("Access code is required")) {
    return "أدخل كود الوصول ثم اضغط حفظ قبل إرسال السؤال.";
  }

  if (message.includes("Usage, rate, or billing limit")) {
    return "حساب OpenAI API لا يملك رصيدًا متاحًا الآن أو وصل إلى حد الاستخدام. أضف رصيدًا من صفحة Billing ثم جرّب مرة أخرى.";
  }

  if (message.includes("invalid or unauthorized")) {
    return "مفتاح OpenAI غير صحيح أو غير مصرح له. أنشئ مفتاحًا جديدًا واحفظه.";
  }

  return message;
}

function getApiMessages() {
  return messages
    .filter((message) => !message.pending && (message.role === "user" || message.role === "assistant"))
    .slice(-12);
}

async function sendMessage(text) {
  setSending(true);
  setStatus("يرسل الطلب إلى بابل AI...");

  const pending = { role: "assistant", content: "أفكر في الرد...", pending: true };
  messages.push(pending);
  renderMessages();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        accessCode,
        mode,
        messages: getApiMessages(),
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem(accessCodeStorageKey);
        accessCode = "";
        if (accessCodeInput) {
          accessCodeInput.value = "";
          accessCodeInput.focus();
        }
      }
      throw new Error(data.error || "حدث خطأ غير متوقع.");
    }

    pending.pending = false;
    pending.content = data.reply || "لم يصل رد نصي. جرّب مرة أخرى.";
    if (data.model) {
      modelBadge.textContent = `النموذج: ${data.model}`;
    }

    setStatus("تم استلام الرد.");
  } catch (error) {
    pending.pending = false;
    pending.content = localizeError(error.message || "تعذر الاتصال بالخادم.");
    setStatus("يوجد خطأ يحتاج مراجعة.");
  } finally {
    saveActiveChat();
    renderMessages();
    setSending(false);
    input.focus();
  }
}

function autoResizeInput() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
}

async function loadServerState() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    if (data.model) {
      modelBadge.textContent = `النموذج: ${data.model}`;
    }
    if (!data.accessCodeRequired && accessCodeGroup) {
      accessCode = "";
      localStorage.removeItem(accessCodeStorageKey);
      accessCodeGroup.hidden = true;
    }
  } catch {
    setStatus("جاهز للمحادثة. تعذر فحص حالة الخادم الآن.");
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  if (isSending) {
    return;
  }

  const text = input.value.trim();
  if (!text) {
    input.focus();
    return;
  }

  input.value = "";
  autoResizeInput();
  addMessage("user", text);
  sendMessage(text);
});

input.addEventListener("input", autoResizeInput);

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    mode = button.dataset.mode;
    modeButtons.forEach((item) => item.classList.toggle("active", item === button));
    setStatus(`نمط الإجابة الحالي: ${button.textContent}.`);
  });
});

if (saveAccessCodeButton) {
  saveAccessCodeButton.addEventListener("click", () => {
    accessCode = accessCodeInput.value.trim();
    if (accessCode) {
      localStorage.setItem(accessCodeStorageKey, accessCode);
      setStatus("تم حفظ كود الوصول في هذا المتصفح.");
    } else {
      localStorage.removeItem(accessCodeStorageKey);
      setStatus("تم حذف كود الوصول من هذا المتصفح.");
    }
    input.focus();
  });
}

if (accessCodeInput) {
  accessCodeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveAccessCodeButton.click();
    }
  });
}

newChatButton.addEventListener("click", startNewChat);

chatListEl.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-chat-id]");
  if (deleteButton) {
    deleteChat(deleteButton.dataset.deleteChatId);
    return;
  }

  const openButton = event.target.closest("[data-chat-id]");
  if (openButton) {
    switchChat(openButton.dataset.chatId);
  }
});

copyLastButton.addEventListener("click", async () => {
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant" && !message.pending);
  if (!lastAssistant) {
    setStatus("لا يوجد رد لنسخه بعد.");
    return;
  }

  try {
    await navigator.clipboard.writeText(lastAssistant.content);
    setStatus("تم نسخ آخر رد.");
  } catch {
    setStatus("لم يسمح المتصفح بالنسخ التلقائي.");
  }
});

clearButton.addEventListener("click", () => {
  messages = [
    {
      role: "assistant",
      content: "تم مسح المحادثة الحالية. بابل AI جاهز لسؤال جديد.",
    },
  ];

  const chat = getActiveChat();
  chat.title = "محادثة جديدة";
  saveActiveChat();
  renderMessages();
  setStatus("تم مسح المحادثة الحالية.");
  input.focus();
});

renderChatList();
renderMessages();
autoResizeInput();
loadServerState();
