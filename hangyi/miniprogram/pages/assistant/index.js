const { callBackend } = require("../../utils/api");
const { readCache, writeCache } = require("../../utils/cache");
const { applyUiSettings } = require("../../utils/ui");

const CACHE_KEY = "assistant_messages";
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const MAX_LOCAL_MESSAGES = 20;

const newLocalId = () => `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

Page({
  data: {
    themeClass: "theme-light",
    messages: [],
    question: "",
    sending: false,
    enabled: false,
    configured: false,
    reachable: false,
    ready: false,
    assistantMode: "",
    fallbackMode: false,
    statusText: "正在检查助手服务",
    remainingQuota: null,
    scrollTarget: "",
  },

  onLoad() {
    applyUiSettings(this);
    const cached = readCache(CACHE_KEY, CACHE_TTL);
    if (cached && Array.isArray(cached.messages)) {
      this.setData({ messages: cached.messages.slice(-MAX_LOCAL_MESSAGES) }, () => this.scrollToBottom());
    }
    this.loadStatus();
  },

  async loadStatus() {
    try {
      const status = await callBackend("getAssistantStatus", {}, { silent: true });
      const enabled = status.enabled === true;
      const configured = status.configured === true;
      const reachable = status.reachable === true;
      const assistantMode = status.mode || "";
      const fallbackMode = assistantMode === "LOCAL_KNOWLEDGE";
      let statusText = "智能助手尚未启用";
      if (fallbackMode) {
        statusText = status.message || "当前使用内置业务知识";
      } else if (enabled && !configured) {
        statusText = "智能助手配置不完整";
      } else if (enabled && !reachable) {
        statusText = status.message || "智能助手服务暂不可用";
      } else if (enabled && status.engineEnabled === false) {
        statusText = "助手基建已连接，问答引擎尚未启用";
      } else if (enabled && status.engineEnabled == null) {
        statusText = "助手基建已连接，问答引擎状态未知";
      } else if (enabled && status.engineEnabled === true) {
        statusText = "智能助手已就绪";
      }
      const ready = status.ready === true
        || (enabled && configured && reachable && status.engineEnabled === true);
      this.setData({
        enabled,
        configured,
        reachable,
        ready,
        assistantMode,
        fallbackMode,
        statusText,
      });
      if (ready) await this.loadHistory();
    } catch (error) {
      this.setData({
        enabled: false,
        reachable: false,
        ready: false,
        statusText: error.message || "无法检查助手服务",
      });
    }
  },

  async loadHistory() {
    try {
      const history = await callBackend("listAssistantHistory", { limit: 20 }, { silent: true });
      if (!Array.isArray(history) || history.length === 0) return;
      const messages = [];
      history.slice().reverse().forEach((item) => {
        if (item.question) {
          messages.push({
            id: `${item.requestId || item.messageId}-user`,
            requestId: item.requestId || "",
            sessionId: item.sessionId || "",
            role: "user",
            content: item.question,
            createdAt: item.createdAt || Date.now(),
          });
        }
        messages.push({
          id: item.messageId || item.requestId || newLocalId(),
          requestId: item.requestId || "",
          sessionId: item.sessionId || "",
          role: "assistant",
          content: item.answer || "",
          sources: Array.isArray(item.sources) ? item.sources : [],
          degraded: item.degraded === true,
          feedback: ["UP", "DOWN"].includes(String(item.feedback || "").toUpperCase())
            ? String(item.feedback).toUpperCase()
            : "",
          createdAt: item.createdAt || Date.now(),
        });
      });
      const visibleMessages = messages.slice(-MAX_LOCAL_MESSAGES);
      this.setData({ messages: visibleMessages }, () => this.scrollToBottom());
      writeCache(CACHE_KEY, { messages: visibleMessages });
    } catch (error) {
      // 服务端历史失败不阻断本地缓存和本次问答。
    }
  },

  onQuestionInput(event) {
    this.setData({ question: event.detail.value || "" });
  },

  onSuggestionTap(event) {
    const question = event.currentTarget.dataset.question || "";
    if (!question || !this.data.ready) return;
    this.setData({ question }, () => this.onSend());
  },

  async onSend() {
    const question = (this.data.question || "").trim();
    if (!question || this.data.sending) return;
    if (!this.data.ready) {
      wx.showToast({ title: this.data.statusText, icon: "none" });
      return;
    }
    if (question.length > 500) {
      wx.showToast({ title: "问题不能超过 500 字", icon: "none" });
      return;
    }

    const userMessage = {
      id: newLocalId(),
      role: "user",
      content: question,
      createdAt: Date.now(),
    };
    this.appendMessage(userMessage);
    this.setData({ question: "", sending: true });

    try {
      const session = this.data.messages.slice().reverse().find((item) => item.sessionId);
      const requestId = `wx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      const result = await callBackend("askAssistant", {
        question,
        mode: "KNOWLEDGE_ONLY",
        sessionId: session ? session.sessionId : "",
        requestId,
      }, { silent: true });
      this.appendMessage({
        id: result.messageId || result.requestId || newLocalId(),
        requestId: result.requestId || "",
        sessionId: result.sessionId || "",
        role: "assistant",
        content: result.answer || "助手暂未返回内容",
        sources: Array.isArray(result.sources) ? result.sources : [],
        degraded: result.degraded === true,
        createdAt: Date.now(),
      });
      if (Number.isInteger(result.remainingQuota)) {
        this.setData({ remainingQuota: result.remainingQuota });
      }
    } catch (error) {
      this.appendMessage({
        id: newLocalId(),
        role: "assistant",
        content: `请求失败：${error.message || "智能助手暂不可用"}`,
        isError: true,
        createdAt: Date.now(),
      });
    } finally {
      this.setData({ sending: false });
    }
  },

  appendMessage(message) {
    const messages = [...this.data.messages, message].slice(-MAX_LOCAL_MESSAGES);
    this.setData({ messages }, () => this.scrollToBottom());
    writeCache(CACHE_KEY, { messages });
  },

  scrollToBottom() {
    const last = this.data.messages[this.data.messages.length - 1];
    if (last) this.setData({ scrollTarget: `message-${last.id}` });
  },

  onClear() {
    this.setData({ messages: [], scrollTarget: "" });
    writeCache(CACHE_KEY, { messages: [] });
  },

  onCopyMessage(event) {
    const content = event.currentTarget.dataset.content || "";
    if (!content) return;
    wx.setClipboardData({ data: content });
  },

  async onFeedback(event) {
    const messageId = event.currentTarget.dataset.id || "";
    const rating = event.currentTarget.dataset.rating || "";
    if (!messageId) return;
    try {
      await callBackend("submitAssistantFeedback", { messageId, rating }, { silent: true });
      const messages = this.data.messages.map((item) => (
        item.id === messageId ? { ...item, feedback: rating } : item
      ));
      this.setData({ messages });
      writeCache(CACHE_KEY, { messages });
      wx.showToast({ title: "感谢反馈", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error.message || "反馈失败", icon: "none" });
    }
  },
});
