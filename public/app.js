const messagesEl = document.querySelector("#messages");
const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const sendButton = document.querySelector("#send-button");
const statusText = document.querySelector("#status-text");
const modelBadge = document.querySelector("#model-badge");
const copyLastButton = document.querySelector("#copy-last");
const clearButton = document.querySelector("#clear-chat");
const modeButtons = Array.from(document.querySelectorAll(".mode-button"));
const accessCodeInput = document.querySelector("#access-code");
const saveAccessCodeButton = document.querySelector("#save-access-code");

const storageKey = "public-chat-mvp-history";
const accessCodeStorageKey = "public-chat-access-code";
let mode = "balanced";
let isSending = false;
let accessCode = localStorage.getItem(accessCodeStorageKey) || "";
let messages = loadMessages();

if (accessCodeInput) {
  accessCodeInput.value = accessCode;
}

function loadMessages() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (Array.isArray(saved) && saved.length > 0) {
      return saved;
    }
  } catch {
    localStorage.removeItem(storageKey);
  }

  return [
    {
      role: "assistant",
      content:
        "مرحبا. أنا بابل AI، مساعدك الذكي. اسألني عن فكرة، رسالة، خطة، تعلم موضوع، أو تنظيم مهمة يومية.",
    },
  ];
}

function saveMessages() {
  localStorage.setItem(storageKey, JSON.stringify(messages.slice(-30)));
}

function setStatus(text) {
  statusText.textContent = text;
}

function renderMessages() {
  messagesEl.innerHTML = "";

  for (const message of messages) {
    const bubble = document.createElement("article");
    bubble.className = `message ${message.role}`;
    bubble.dir = "auto";
    bubble.textContent = message.content;
    messagesEl.appendChild(bubble);
  }

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addMessage(role, content) {
  messages.push({ role, content });
  saveMessages();
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
    return "حساب OpenAI API لا يملك رصيدا متاحا الآن أو وصل إلى حد الاستخدام. أضف رصيدا من صفحة Billing ثم جرّب مرة أخرى.";
  }

  if (message.includes("invalid or unauthorized")) {
    return "مفتاح OpenAI غير صحيح أو غير مصرح له. أنشئ مفتاحا جديدا واحفظه.";
  }

  return message;
}

function getApiMessages() {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-12);
}

async function sendMessage(text) {
  setSending(true);
  setStatus("يرسل الطلب إلى الخادم المحلي...");

  const pending = { role: "assistant", content: "أفكر في الرد..." };
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
        messages: getApiMessages().filter((message) => message !== pending),
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

    pending.content = data.reply || "لم يصل رد نصي. جرّب مرة أخرى.";
    if (data.model) {
      modelBadge.textContent = `النموذج: ${data.model}`;
    }

    setStatus("تم استلام الرد.");
  } catch (error) {
    pending.content = localizeError(error.message || "تعذر الاتصال بالخادم المحلي.");
    setStatus("يوجد خطأ يحتاج مراجعة.");
  } finally {
    saveMessages();
    renderMessages();
    setSending(false);
    input.focus();
  }
}

function autoResizeInput() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
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

accessCodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    saveAccessCodeButton.click();
  }
});

copyLastButton.addEventListener("click", async () => {
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
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
      content: "تم مسح المحادثة. بابل AI جاهز لسؤال جديد.",
    },
  ];
  saveMessages();
  renderMessages();
  setStatus("تم مسح المحادثة محليا.");
  input.focus();
});

renderMessages();
autoResizeInput();
