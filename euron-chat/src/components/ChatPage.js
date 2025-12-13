// src/pages/ChatPage.js
import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import "./ChatPage.css";
import { apiFetch } from "../utils/api";

const DEBOUNCE_MS = 300;

const mapConversationItem = (ci) => ({
  id: ci.conversation_id,
  name: ci.display_name || ci.title || `Conversation ${ci.conversation_id}`,
  is_group: ci.is_group,
  title: ci.title,
  lastMessage: ci.last_message,
  lastMessageAt: ci.last_message_at,
  messages: [],
});

const mapMessageOutToUI = (msg, currentUserId) => ({
  id: msg.id,
  fromMe: Number(msg.sender_id) === Number(currentUserId),
  text: msg.content,
  time: msg.created_at
    ? new Date(msg.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "",
});

export default function ChatPage() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  const messagesEndRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const wsRef = useRef(null);

  const navigate = useNavigate();
  const currentUserId = Number(localStorage.getItem("user_id"));

  // --------------------------------------------------
  // Scroll to bottom
  // --------------------------------------------------
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeId, conversations]);

  // --------------------------------------------------
  // Load messages
  // --------------------------------------------------
  const loadMessagesForConversation = useCallback(
    async (conversationId) => {
      if (!conversationId) return;
      try {
        const res = await apiFetch(
          `/conversations/${conversationId}/messages`
        );
        if (res.status === 401) return navigate("/login");
        if (!res.ok) throw new Error();

        const msgs = await res.json();
        const mapped = msgs.map((m) =>
          mapMessageOutToUI(m, currentUserId)
        );

        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId
              ? { ...c, messages: mapped }
              : c
          )
        );
      } catch {
        setError("Unable to load messages.");
      }
    },
    [currentUserId, navigate]
  );

  // --------------------------------------------------
  // Initial load
  // --------------------------------------------------
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const me = await apiFetch("/me");
        if (me.status === 401) return navigate("/login");

        const convRes = await apiFetch("/conversations");
        if (!convRes.ok) throw new Error();

        const data = await convRes.json();
        if (!mounted) return;

        const mapped = data.map(mapConversationItem);
        setConversations(mapped);

        if (mapped.length) {
          setActiveId(mapped[0].id);
          loadMessagesForConversation(mapped[0].id);
        }
      } catch {
        setError("Failed to load conversations.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    init();
    return () => (mounted = false);
  }, [navigate, loadMessagesForConversation]);

  // --------------------------------------------------
  // SEARCH (debounced)
  // --------------------------------------------------
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }

    setSearchLoading(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch(
          `/users?search=${encodeURIComponent(searchQuery)}`
        );
        if (!res.ok) throw new Error();
        const users = await res.json();
        setSearchResults(users);
        setShowSearchDropdown(true);
      } catch {
        setSearchResults([]);
        setShowSearchDropdown(false);
      } finally {
        setSearchLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(searchTimeoutRef.current);
  }, [searchQuery]);

  // --------------------------------------------------
  // Start new conversation
  // --------------------------------------------------
  const startConversationWithUser = async (user) => {
    const existing = conversations.find(
      (c) => !c.is_group && c.name === (user.name || user.email)
    );
    if (existing) {
      setActiveId(existing.id);
      loadMessagesForConversation(existing.id);
      return;
    }

    try {
      const res = await apiFetch("/conversations/start", {
        method: "POST",
        body: JSON.stringify({ other_user_id: user.id }),
      });
      if (!res.ok) throw new Error();

      const conv = mapConversationItem(await res.json());
      setConversations((prev) => [conv, ...prev]);
      setActiveId(conv.id);
    } catch {
      setError("Could not start conversation.");
    } finally {
      setSearchQuery("");
      setSearchResults([]);
      setShowSearchDropdown(false);
    }
  };

  // --------------------------------------------------
  // WebSocket (FIXED + STABLE)
  // --------------------------------------------------
  useEffect(() => {
    if (!activeId) return;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const token = localStorage.getItem("access_token");
    if (!token) return;

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const base =
      process.env.REACT_APP_WS_URL ||
      `${proto}://${window.location.hostname}:8000`;

    const ws = new WebSocket(
      `${base}/ws/${activeId}?token=${encodeURIComponent(token)}`
    );
    wsRef.current = ws;

    ws.onmessage = (e) => {
      const payload = JSON.parse(e.data);
      if (payload.type !== "message_created") return;

      const m = payload.message;

      // 🔑 Ignore own message (already optimistic)
      if (Number(m.sender_id) === currentUserId) return;

      const newMsg = {
        id: m.id,
        fromMe: false,
        text: m.content,
        time: new Date(m.created_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId
            ? {
                ...c,
                messages: [...(c.messages || []), newMsg],
                lastMessage: newMsg.text,
              }
            : c
        )
      );
    };

    return () => ws.close();
  }, [activeId, currentUserId]);

  // --------------------------------------------------
  // Send message
  // --------------------------------------------------
  const handleSend = async () => {
    if (!messageText.trim() || !activeId) return;

    const tempId = `tmp-${Date.now()}`;
    const optimistic = {
      id: tempId,
      fromMe: true,
      text: messageText.trim(),
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeId
          ? {
              ...c,
              messages: [...(c.messages || []), optimistic],
              lastMessage: optimistic.text,
            }
          : c
      )
    );

    setMessageText("");

    try {
      const res = await apiFetch(
        `/conversations/${activeId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({ content: optimistic.text }),
        }
      );
      if (!res.ok) throw new Error();

      const saved = await res.json();
      const savedUI = mapMessageOutToUI(saved, currentUserId);

      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === tempId ? savedUI : m
                ),
              }
            : c
        )
      );
    } catch {
      setError("Message could not be sent.");
    }
  };

  // --------------------------------------------------
  // Render
  // --------------------------------------------------
  if (loading) return <div className="loading-block">Loading…</div>;
  if (error) return <div className="loading-block error-block">{error}</div>;

  const activeConversation = conversations.find(
    (c) => c.id === activeId
  );

  return (
    <div className="chat-page">
      <aside className="chat-sidebar">
        <div className="sidebar-search">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search or start new chat"
          />
          {searchLoading && <div>Searching…</div>}
          {showSearchDropdown && (
            <ul className="search-results">
              {searchResults.map((u) => (
                <li key={u.id} onClick={() => startConversationWithUser(u)}>
                  {u.name || u.email}
                </li>
              ))}
            </ul>
          )}
        </div>

        <ul className="conversation-list">
          {conversations.map((c) => (
            <li
              key={c.id}
              className={c.id === activeId ? "active" : ""}
              onClick={() => {
                setActiveId(c.id);
                if (!c.messages.length)
                  loadMessagesForConversation(c.id);
              }}
            >
              {c.name}
            </li>
          ))}
        </ul>
      </aside>

      <main className="chat-main">
        {activeConversation ? (
          <>
            <header className="chat-header">
              <div className="header-avatar">
                {(activeConversation.name || "U")[0].toUpperCase()}
              </div>
              <div className="header-info">
                <div className="header-name">{activeConversation.name}</div>
                <div className="header-status">online</div>
              </div>
            </header>

            <section className="chat-messages">
              {activeConversation.messages.length ? (
                activeConversation.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`message-row ${m.fromMe ? "from-me" : "from-them"}`}
                  >
                    <div className="message-bubble">
                      <div className="message-text">{m.text}</div>
                      <div className="message-time">{m.time}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-messages">
                  No messages yet — say hello 👋
                </div>
              )}
              <div ref={messagesEndRef} />
            </section>

            <footer className="chat-composer">
              <textarea
                className="composer-input"
                placeholder="Type a message…"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <button className="composer-send" onClick={handleSend}>
                Send
              </button>
            </footer>

          </>
        ) : (
          <div className="empty-state">
            Select a conversation to start chatting
          </div>
        )}
      </main>
    </div>
  );
}
