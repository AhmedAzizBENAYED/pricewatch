import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '../../store/auth'
import { timeAgo } from '../../utils/pw'
import {
  IcoSparkles, IcoSparkle, IcoSend, IcoArrow,
  IcoCopy, IcoPlus, IcoSearch, IcoFolder, IcoTrash,
} from '../../components/icons'
import PlanLocked from '../../components/ui/PlanLocked'
import {
  getConversations, createConversation, getMessages,
  uploadDocument, getDocuments, deleteDocument,
} from '../../api/tenant'

// ── Markdown renderer ─────────────────────────────────────────────────────────

function MarkdownMessage({ content }) {
  if (!content) return <span style={{ color: 'var(--pw-slate-400)', fontStyle: 'italic' }}>…</span>

  // Split into blocks on blank lines
  const blocks = content.split(/\n{2,}/)

  return (
    <div style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--pw-slate-800)' }}>
      {blocks.map((block, bi) => {
        // Numbered list
        if (/^\d+\.\s/.test(block)) {
          const items = block.split(/\n(?=\d+\.\s)/)
          return (
            <ol key={bi} style={{ margin: '6px 0', paddingLeft: 20 }}>
              {items.map((item, ii) => (
                <li key={ii} style={{ marginBottom: 4 }}
                  dangerouslySetInnerHTML={{ __html: inlineFormat(item.replace(/^\d+\.\s/, '')) }}
                />
              ))}
            </ol>
          )
        }
        // Bullet list
        if (/^[-*]\s/.test(block)) {
          const items = block.split(/\n(?=[-*]\s)/)
          return (
            <ul key={bi} style={{ margin: '6px 0', paddingLeft: 18, listStyle: 'none' }}>
              {items.map((item, ii) => (
                <li key={ii} style={{ marginBottom: 4, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--pw-indigo)', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>·</span>
                  <span dangerouslySetInnerHTML={{ __html: inlineFormat(item.replace(/^[-*]\s/, '')) }} />
                </li>
              ))}
            </ul>
          )
        }
        // Code block
        if (block.startsWith('```')) {
          const code = block.replace(/^```[^\n]*\n?/, '').replace(/```$/, '').trim()
          return (
            <pre key={bi} style={{
              background: 'var(--pw-slate-50)', border: '1px solid var(--pw-border)',
              borderRadius: 8, padding: '10px 14px', fontSize: 12.5,
              fontFamily: 'JetBrains Mono, monospace', overflowX: 'auto',
              margin: '8px 0', color: 'var(--pw-slate-700)',
            }}>
              <code>{code}</code>
            </pre>
          )
        }
        // Heading (## or ###)
        if (/^#{2,3}\s/.test(block)) {
          const text = block.replace(/^#{2,3}\s/, '')
          return (
            <div key={bi} style={{ fontWeight: 700, fontSize: 14.5, marginTop: 10, marginBottom: 4, color: 'var(--pw-slate-900)' }}
              dangerouslySetInnerHTML={{ __html: inlineFormat(text) }}
            />
          )
        }
        // Horizontal rule
        if (/^---+$/.test(block.trim())) {
          return <hr key={bi} style={{ border: 'none', borderTop: '1px solid var(--pw-border)', margin: '10px 0' }} />
        }
        // Paragraph (may contain inline \n)
        return (
          <p key={bi} style={{ margin: '4px 0' }}
            dangerouslySetInnerHTML={{ __html: inlineFormat(block.replace(/\n/g, '<br/>')) }}
          />
        )
      })}
    </div>
  )
}

function inlineFormat(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:var(--pw-slate-100);padding:1px 5px;border-radius:4px;font-size:12.5px;font-family:JetBrains Mono,monospace">$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" style="color:var(--pw-indigo);text-decoration:underline" target="_blank" rel="noopener">$1</a>')
}

// ── Tool name → French label mapping ─────────────────────────────────────────

const TOOL_LABELS = {
  get_market_overview:      'Aperçu marché',
  get_recent_events:        'Événements récents',
  get_positioning_summary:  'Positionnement',
  search_products:          'Recherche produits',
  get_competitor_activity:  'Activité concurrents',
  get_stock_ruptures:       'Ruptures stock',
  search_documents:         'Documents',
}

function sourceLabel(src) {
  return TOOL_LABELS[src] ?? src
}

// ── Static data ───────────────────────────────────────────────────────────────

const SUGGESTION_CARDS = [
  {
    icon: <IcoSparkle />, accent: 'var(--pw-indigo)',
    title: 'Quels concurrents sont les plus agressifs cette semaine ?',
    sub:   'Q&A · Analyse compétitive ponctuelle',
  },
  {
    icon: <IcoSearch />, accent: 'var(--pw-teal)',
    title: 'Sur quels produits suis-je le plus cher ?',
    sub:   'Q&A · Identification des écarts',
  },
  {
    icon: <IcoFolder />, accent: 'var(--pw-amber)',
    title: 'Résume les événements des 7 derniers jours',
    sub:   'Rapport · Synthèse hebdomadaire',
  },
  {
    icon: <IcoArrow />, accent: '#8B5CF6',
    title: 'Quelles opportunités puis-je saisir suite aux ruptures concurrentes ?',
    sub:   'Pricing · Suggestions actionnables',
  },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function TypingIndicator({ statusText, toolName }) {
  const label = statusText
    ?? (toolName ? `${sourceLabel(toolName)}…` : null)
    ?? "L'assistant analyse vos données"
  return (
    <div style={{ display: 'flex', gap: 10, alignSelf: 'flex-start' }}>
      <div style={{
        width: 32, height: 32, borderRadius: 10, flexShrink: 0,
        background: 'linear-gradient(135deg, #6366F1, #0D9488)',
        display: 'grid', placeItems: 'center', color: '#fff',
      }}>
        <IcoSparkles />
      </div>
      <div className="pw-card" style={{ padding: '12px 16px', display: 'flex', gap: 4, alignItems: 'center', borderRadius: '4px 18px 18px 18px' }}>
        <span style={{ fontSize: 12.5, color: 'var(--pw-slate-500)', marginRight: 6 }}>{label}</span>
        <span className="pw-dot" style={{ animationDelay: '0s' }} />
        <span className="pw-dot" style={{ animationDelay: '.15s' }} />
        <span className="pw-dot" style={{ animationDelay: '.3s' }} />
      </div>
    </div>
  )
}

function ChatComposer({ input, setInput, onSend, isTyping }) {
  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }
  return (
    <div style={{ padding: 16, borderTop: '1px solid var(--pw-border)', background: '#fff', flexShrink: 0 }}>
      <div style={{
        border: '1.5px solid var(--pw-indigo-100)',
        borderRadius: 14, padding: 12,
        boxShadow: '0 0 0 4px rgba(99,102,241,.06)',
      }}>
        <textarea
          placeholder="Posez votre question, demandez un rapport, ou suggérez un ajustement pricing..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%', border: 0, outline: 0, resize: 'none',
            fontFamily: 'inherit', fontSize: 13.5,
            minHeight: 50, maxHeight: 120,
            color: 'var(--pw-slate-900)', display: 'block',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 11.5, color: 'var(--pw-slate-400)', fontFamily: 'JetBrains Mono', marginLeft: 'auto', marginRight: 12 }}>
            {input.length} / 2 000
          </span>
          <button
            className="pw-btn pw-btn-primary"
            onClick={onSend}
            disabled={!input.trim() || isTyping}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <IcoSend /> Envoyer
          </button>
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--pw-slate-400)', marginTop: 8, textAlign: 'center' }}>
        PW-Insight · Les réponses sont sourcées à partir de vos données surveillées
      </div>
    </div>
  )
}

function DocumentSidebar({ onUploadDone }) {
  const [docs, setDocs]         = useState([])
  const [uploading, setUploading] = useState(false)
  const [error, setError]       = useState(null)
  const fileRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const data = await getDocuments()
      setDocs(data)
    } catch {}
  }, [])

  useEffect(() => { load() }, [load])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      await uploadDocument(file)
      await load()
      onUploadDone?.()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Erreur lors de l\'import')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleDelete(id) {
    try {
      await deleteDocument(id)
      setDocs(prev => prev.filter(d => d.id !== id))
    } catch {}
  }

  return (
    <div style={{ borderTop: '1px solid var(--pw-border)', padding: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--pw-slate-500)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
        Documents RAG
      </div>
      <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" onChange={handleFile} style={{ display: 'none' }} />
      <button
        className="pw-btn pw-btn-sm"
        style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? 'Import en cours…' : '+ Ajouter un document'}
      </button>
      {error && <div style={{ fontSize: 11.5, color: 'var(--pw-red)', marginBottom: 6 }}>{error}</div>}
      {docs.map(d => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.filename}</div>
            <div style={{ fontSize: 10.5, color: 'var(--pw-slate-400)' }}>{d.chunk_count} segments</div>
          </div>
          <button
            className="pw-btn pw-btn-sm pw-btn-ghost"
            style={{ padding: '2px 4px', flexShrink: 0 }}
            onClick={() => handleDelete(d.id)}
          >
            <IcoTrash size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Assistant() {
  const user = useAuthStore(s => s.user)
  const plan = user?.plan_abonnement || 'BASIC'

  const [conversations, setConversations] = useState([])
  const [activeConvId,  setActiveConvId]  = useState(null)
  const [messages,      setMessages]      = useState({})  // { convId: [...] }
  const [input,         setInput]         = useState('')
  const [isTyping,      setIsTyping]      = useState(false)
  const [activeToolName, setActiveToolName] = useState(null)
  const [statusText,    setStatusText]    = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [streamError,   setStreamError]   = useState(null)

  const messagesEndRef = useRef(null)

  const activeMessages = messages[activeConvId] ?? []
  const activeConv = conversations.find(c => c.id === activeConvId) ?? null

  // Remove pw-main padding/scroll to enable full-height layout
  useEffect(() => {
    if (plan !== 'PREMIUM') return
    const main = document.querySelector('.pw-main')
    if (!main) return
    const prevOverflow = main.style.overflow
    const prevPadding  = main.style.padding
    main.style.overflow = 'hidden'
    main.style.padding  = '0'
    return () => {
      main.style.overflow = prevOverflow
      main.style.padding  = prevPadding
    }
  }, [plan])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeMessages.length, isTyping])

  // Load conversations on mount
  useEffect(() => {
    if (plan !== 'PREMIUM') return
    getConversations()
      .then(data => setConversations(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [plan])

  if (plan !== 'PREMIUM') {
    return <PlanLocked requiredPlan="PREMIUM" featureName="Assistant IA" />
  }

  const firstName = user?.nom?.split(' ')[0] || 'vous'

  async function loadMessages(convId) {
    if (messages[convId]) return
    try {
      const data = await getMessages(convId)
      const normalized = data.map(m => ({
        id:        m.id,
        role:      m.role,
        content:   m.content,
        sources:   m.sources || [],
        timestamp: m.date_creation,
      }))
      setMessages(prev => ({ ...prev, [convId]: normalized }))
    } catch {}
  }

  async function selectConversation(conv) {
    setActiveConvId(conv.id)
    await loadMessages(conv.id)
  }

  async function handleNewConv() {
    const conv = await createConversation()
    setConversations(prev => [conv, ...prev])
    setMessages(prev => ({ ...prev, [conv.id]: [] }))
    setActiveConvId(conv.id)
  }

  function appendMessage(convId, msg) {
    setMessages(prev => ({
      ...prev,
      [convId]: [...(prev[convId] ?? []), msg],
    }))
  }

  function updateLastAssistantMessage(convId, content) {
    setMessages(prev => {
      const msgs = prev[convId] ?? []
      if (!msgs.length) return prev
      const last = msgs[msgs.length - 1]
      if (last.role !== 'assistant') return prev
      return {
        ...prev,
        [convId]: [...msgs.slice(0, -1), { ...last, content }],
      }
    })
  }

  function updateLastAssistantSources(convId, sources) {
    setMessages(prev => {
      const msgs = prev[convId] ?? []
      if (!msgs.length) return prev
      const last = msgs[msgs.length - 1]
      if (last.role !== 'assistant') return prev
      return {
        ...prev,
        [convId]: [...msgs.slice(0, -1), { ...last, sources }],
      }
    })
  }

  async function sendMessage(text) {
    const msgText = (text ?? input).trim()
    if (!msgText || isTyping) return
    setInput('')
    setStreamError(null)

    let convId = activeConvId
    if (!convId) {
      const conv = await createConversation()
      setConversations(prev => [conv, ...prev])
      setMessages(prev => ({ ...prev, [conv.id]: [] }))
      setActiveConvId(conv.id)
      convId = conv.id
    }

    // Update conversation title if first message
    setConversations(prev => prev.map(c =>
      c.id === convId && (c.titre === 'Nouvelle conversation' || !c.titre)
        ? { ...c, titre: msgText.slice(0, 60) }
        : c
    ))

    appendMessage(convId, {
      id:        `user-${Date.now()}`,
      role:      'user',
      content:   msgText,
      timestamp: new Date().toISOString(),
    })

    setIsTyping(true)
    setActiveToolName(null)
    setStatusText(null)

    const token = localStorage.getItem('pfe_token')
    let assistantMsgId = `asst-${Date.now()}`
    let accumulated = ''

    try {
      const response = await fetch(
        `/api/v1/assistant/conversations/${convId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ content: msgText }),
        }
      )

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      // Add empty assistant message placeholder
      appendMessage(convId, {
        id:        assistantMsgId,
        role:      'assistant',
        content:   '',
        timestamp: new Date().toISOString(),
      })

      const reader  = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() // keep incomplete last line

        let currentEvent = null
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            const raw = line.slice(6).trim()
            if (!raw) continue
            try {
              const data = JSON.parse(raw)
              if (currentEvent === 'message' && data.content) {
                accumulated += data.content
                updateLastAssistantMessage(convId, accumulated)
              } else if (currentEvent === 'tool_use') {
                setActiveToolName(data.tool || 'recherche')
                setStatusText(null)
              } else if (currentEvent === 'status') {
                setStatusText(data.status || null)
              } else if (currentEvent === 'sources') {
                updateLastAssistantSources(convId, data.sources || [])
              } else if (currentEvent === 'title' && data.title) {
                setConversations(prev => prev.map(c =>
                  c.id === convId ? { ...c, titre: data.title } : c
                ))
              } else if (currentEvent === 'done') {
                setIsTyping(false)
                setActiveToolName(null)
                setStatusText(null)
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      setStreamError('Erreur de connexion à l\'assistant. Réessayez.')
      // Remove the empty assistant placeholder if no content
      if (!accumulated) {
        setMessages(prev => {
          const msgs = prev[convId] ?? []
          const last = msgs[msgs.length - 1]
          if (last?.id === assistantMsgId && !last.content) {
            return { ...prev, [convId]: msgs.slice(0, -1) }
          }
          return prev
        })
      }
    } finally {
      setIsTyping(false)
      setActiveToolName(null)
      setStatusText(null)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
      <style>{`
        .pw-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--pw-indigo); animation: pw-blink 1s infinite ease-in-out; display: inline-block; }
        @keyframes pw-blink { 0%, 80%, 100% { opacity: .3; transform: scale(.8); } 40% { opacity: 1; transform: scale(1.1); } }
      `}</style>

      {/* ── LEFT SIDEBAR ───────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--pw-slate-50)', borderRight: '1px solid var(--pw-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--pw-border)' }}>
          <button
            className="pw-btn pw-btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={handleNewConv}
          >
            <IcoPlus /> Nouvelle conversation
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--pw-slate-400)', fontSize: 13 }}>
              Chargement…
            </div>
          ) : conversations.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--pw-slate-400)', fontSize: 13 }}>
              <div style={{ marginBottom: 4 }}>Aucune conversation</div>
              <div style={{ fontSize: 12 }}>Cliquez sur Nouvelle conversation</div>
            </div>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                onClick={() => selectConversation(conv)}
                style={{
                  padding: '12px 16px', cursor: 'pointer',
                  borderBottom: '1px solid var(--pw-border)',
                  borderLeft: `3px solid ${activeConvId === conv.id ? 'var(--pw-indigo)' : 'transparent'}`,
                  background: activeConvId === conv.id ? 'var(--pw-indigo-50)' : '#fff',
                }}
              >
                <div style={{
                  fontSize: 13, lineHeight: 1.35,
                  fontWeight: activeConvId === conv.id ? 600 : 500,
                  display: '-webkit-box', WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {conv.titre || 'Nouvelle conversation'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--pw-slate-400)', marginTop: 4 }}>
                  {timeAgo(conv.date_derniere_activite || conv.date_debut)}
                </div>
              </div>
            ))
          )}
        </div>

        <DocumentSidebar />
      </div>

      {/* ── RIGHT CHAT AREA ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--pw-bg)', overflow: 'hidden' }}>

        {!activeConvId ? (
          // ── Welcome state ───────────────────────────────────────────────
          <>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
              <div style={{
                width: 64, height: 64, borderRadius: 18,
                background: 'linear-gradient(135deg, #6366F1, #0D9488)',
                display: 'grid', placeItems: 'center', color: '#fff',
                boxShadow: '0 14px 32px rgba(99,102,241,.3)',
              }}>
                <IcoSparkles />
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em', marginTop: 20, textAlign: 'center' }}>
                Bonjour {firstName}, que souhaitez-vous analyser ?
              </div>
              <div style={{ fontSize: 14, color: 'var(--pw-slate-500)', marginTop: 8, textAlign: 'center', maxWidth: 540, lineHeight: 1.5 }}>
                L'assistant PriceWatch interroge votre périmètre de surveillance en temps réel.
                Toutes les réponses sont sourcées et limitées à vos données.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 32, width: '100%', maxWidth: 560 }}>
                {SUGGESTION_CARDS.map(card => (
                  <div
                    key={card.title}
                    className="pw-card"
                    style={{ padding: 14, cursor: 'pointer', textAlign: 'left' }}
                    onClick={() => sendMessage(card.title)}
                  >
                    <div style={{
                      width: 30, height: 30, borderRadius: 8,
                      background: `${card.accent}15`, color: card.accent,
                      display: 'grid', placeItems: 'center', marginBottom: 8,
                    }}>
                      {card.icon}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--pw-slate-700)', lineHeight: 1.4 }}>
                      {card.title}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--pw-slate-400)', marginTop: 4 }}>
                      {card.sub}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{
                marginTop: 32, padding: '12px 20px',
                background: 'var(--pw-amber-50)', borderRadius: 999,
                border: '1px solid var(--pw-amber-100)',
                fontSize: 12, color: '#92400E',
                display: 'inline-flex', gap: 8, alignItems: 'center',
              }}>
                <IcoSparkle />
                <span>Astuce — vous pouvez aussi uploader un document PDF dans la sidebar pour l'analyser</span>
              </div>
            </div>
            <ChatComposer input={input} setInput={setInput} onSend={() => sendMessage()} isTyping={isTyping} />
          </>
        ) : (
          // ── Active conversation ─────────────────────────────────────────
          <>
            {/* Header */}
            <div style={{ padding: '12px 22px', borderBottom: '1px solid var(--pw-border)', display: 'flex', alignItems: 'center', gap: 12, background: '#fff', flexShrink: 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeConv?.titre || 'Nouvelle conversation'}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--pw-slate-500)', marginTop: 2 }}>
                  {activeMessages.length} message{activeMessages.length !== 1 ? 's' : ''} · {timeAgo(activeConv?.date_derniere_activite || activeConv?.date_debut)} · Modèle PW-Insight
                </div>
              </div>
            </div>

            {/* Messages area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {activeMessages.map(msg =>
                msg.role === 'user' ? (
                  <div key={msg.id} style={{ alignSelf: 'flex-end', maxWidth: '70%' }}>
                    <div style={{
                      background: 'var(--pw-indigo)', color: '#fff',
                      borderRadius: '18px 18px 4px 18px',
                      padding: '12px 16px', fontSize: 14, lineHeight: 1.5,
                      boxShadow: '0 1px 2px rgba(67,56,202,.2)',
                    }}>
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div key={msg.id} style={{ alignSelf: 'flex-start', maxWidth: '80%', display: 'flex', gap: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                      background: 'linear-gradient(135deg, #6366F1, #0D9488)',
                      display: 'grid', placeItems: 'center', color: '#fff',
                      boxShadow: '0 4px 12px rgba(99,102,241,.25)',
                    }}>
                      <IcoSparkles />
                    </div>
                    <div>
                      <div className="pw-card" style={{ padding: '14px 18px', borderRadius: '4px 18px 18px 18px' }}>
                        <MarkdownMessage content={msg.content} />
                        {(msg.sources || []).length > 0 && (
                          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                            {msg.sources.map(s => (
                              <span key={s} className="pw-pill slate" style={{ fontSize: 10 }}>{sourceLabel(s)}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 6, marginLeft: 4 }}>
                        <button className="pw-btn pw-btn-sm pw-btn-ghost" style={{ padding: '3px 6px' }}><IcoCopy size={12} /></button>
                      </div>
                    </div>
                  </div>
                )
              )}

              {streamError && (
                <div style={{
                  alignSelf: 'flex-start', maxWidth: '80%',
                  background: 'var(--pw-red-50)', border: '1px solid var(--pw-red-200)',
                  borderRadius: 12, padding: '10px 14px',
                  fontSize: 13, color: 'var(--pw-red-700)',
                }}>
                  {streamError}
                </div>
              )}

              {isTyping && <TypingIndicator statusText={statusText} toolName={activeToolName} />}
              <div ref={messagesEndRef} />
            </div>

            <ChatComposer input={input} setInput={setInput} onSend={() => sendMessage()} isTyping={isTyping} />
          </>
        )}
      </div>
    </div>
  )
}
