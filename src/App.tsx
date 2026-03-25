import { useEffect, useRef, useState } from 'react'
import { recognizeRegion, editImage } from './api'
import './App.css'

interface Rect { x: number; y: number; w: number; h: number }

interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  text?: string
  imageUrl?: string
  base64?: string
  status?: 'pending' | 'ok' | 'error'
}

function downscaleDataUrl(dataUrl: string, maxDim: number): Promise<{ dataUrl: string; w: number; h: number; s: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const nw = img.naturalWidth
      const nh = img.naturalHeight
      const s = Math.min(1, maxDim / Math.max(nw, nh))
      const w = Math.round(nw * s)
      const h = Math.round(nh * s)
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      c.getContext('2d')!.drawImage(img, 0, 0, w, h)
      resolve({ dataUrl: c.toDataURL('image/jpeg', 0.88), w, h, s })
    }
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = dataUrl
  })
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  const [originalImage, setOriginalImage] = useState('')
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [selCrop, setSelCrop] = useState('')
  const [selRect, setSelRect] = useState<Rect | null>(null)
  const [regionDesc, setRegionDesc] = useState('')
  const [recognizing, setRecognizing] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState('')

  const isDrawing = useRef(false)
  const drawingRect = useRef<Rect | null>(null)
  const startPt = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (!originalImage) return
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      const canvas = canvasRef.current!
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const wrap = canvas.parentElement!
      const maxW = wrap.clientWidth
      const maxH = window.innerHeight * 0.62
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1)
      canvas.style.width = img.naturalWidth * scale + 'px'
      canvas.style.height = img.naturalHeight * scale + 'px'
      redraw(null)
    }
    img.src = originalImage
  }, [originalImage])

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const [previewSrc, setPreviewSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!previewSrc) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewSrc(null)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [previewSrc])

  const pending = messages.some(m => m.role === 'assistant' && m.status === 'pending')
  const hasImage = !!originalImage
  const canSend = hasImage && !pending

  function redraw(r: Rect | null) {
    const canvas = canvasRef.current
    if (!canvas || !imgRef.current) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(imgRef.current!, 0, 0)
    if (r && r.w > 0 && r.h > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.clearRect(r.x, r.y, r.w, r.h)
      ctx.drawImage(imgRef.current!, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h)
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 3])
      ctx.strokeRect(r.x, r.y, r.w, r.h)
      ctx.setLineDash([])
    }
  }

  function toCanvasPoint(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const p = toCanvasPoint(e)
    isDrawing.current = true
    startPt.current = p
    drawingRect.current = { x: p.x, y: p.y, w: 0, h: 0 }
    setSelCrop('')
    setSelRect(null)
    setRegionDesc('')
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawing.current) return
    const p = toCanvasPoint(e)
    const { x, y } = startPt.current
    const r = {
      x: Math.min(p.x, x), y: Math.min(p.y, y),
      w: Math.abs(p.x - x), h: Math.abs(p.y - y),
    }
    drawingRect.current = r
    redraw(r)
  }

  function onMouseUp() {
    isDrawing.current = false
    const r = drawingRect.current
    if (!r || r.w < 5 || r.h < 5) return

    const img = imgRef.current!
    const cropCanvas = document.createElement('canvas')
    cropCanvas.width = r.w
    cropCanvas.height = r.h
    cropCanvas.getContext('2d')!.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h)
    const cropDataUrl = cropCanvas.toDataURL('image/png')

    setSelRect(r)
    setSelCrop(cropDataUrl)
    setTimeout(() => inputRef.current?.focus(), 50)

    setRecognizing(true)
    downscaleDataUrl(cropDataUrl, 1024)
      .then(({ dataUrl }) => recognizeRegion(dataUrl))
      .then(desc => setRegionDesc(desc))
      .catch(() => {})
      .finally(() => setRecognizing(false))
  }

  function clearSelection() {
    setSelCrop('')
    setSelRect(null)
    setRegionDesc('')
    drawingRect.current = null
    redraw(null)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      setOriginalImage(ev.target!.result as string)
      setSelCrop('')
      setSelRect(null)
      setRegionDesc('')
      setPrompt('')
      setMessages([])
      drawingRect.current = null
    }
    reader.readAsDataURL(file)
  }

  function resetWorkbench() {
    setOriginalImage('')
    setMessages([])
    setPrompt('')
    setSelCrop('')
    setSelRect(null)
    setRegionDesc('')
    setError('')
    drawingRect.current = null
    imgRef.current = null
  }

  function loadImageAsBase64(url: string): Promise<string> {
    const proxyUrl = `/api/img-proxy?url=${encodeURIComponent(url)}`
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        c.getContext('2d')!.drawImage(img, 0, 0)
        resolve(c.toDataURL('image/png'))
      }
      img.onerror = () => reject(new Error('图片加载失败'))
      img.src = proxyUrl
    })
  }

  async function handleEdit() {
    if (!originalImage) { setError('请先上传图片'); return }
    if (!prompt.trim()) { setError('请输入编辑指令'); return }
    setError('')
    const userText = prompt.trim()
    const assistantId = crypto.randomUUID()
    setPrompt('')
    setMessages(m => [...m,
      { id: crypto.randomUUID(), role: 'user', text: userText },
      { id: assistantId, role: 'assistant', status: 'pending' },
    ])
    try {
      const img = imgRef.current!
      const nw = img.naturalWidth
      const nh = img.naturalHeight
      let imageBase64: string | undefined
      let imageUrl: string | undefined
      let maskBase64: string
      let baseMime = 'image/png'

      if (originalImage.startsWith('data:')) {
        const { dataUrl, w, h, s } = await downscaleDataUrl(originalImage, 2048)
        imageBase64 = dataUrl.split(',')[1]
        baseMime = 'image/jpeg'
        imageUrl = undefined
        const maskCanvas = document.createElement('canvas')
        maskCanvas.width = w
        maskCanvas.height = h
        const mCtx = maskCanvas.getContext('2d')!
        if (selRect) {
          mCtx.fillStyle = 'black'
          mCtx.fillRect(0, 0, w, h)
          mCtx.fillStyle = 'white'
          mCtx.fillRect(selRect.x * s, selRect.y * s, selRect.w * s, selRect.h * s)
        } else {
          mCtx.fillStyle = 'white'
          mCtx.fillRect(0, 0, w, h)
        }
        maskBase64 = maskCanvas.toDataURL('image/png').split(',')[1]
      } else {
        imageUrl = originalImage
        imageBase64 = undefined
        const maskCanvas = document.createElement('canvas')
        maskCanvas.width = nw
        maskCanvas.height = nh
        const mCtx = maskCanvas.getContext('2d')!
        if (selRect) {
          mCtx.fillStyle = 'black'
          mCtx.fillRect(0, 0, nw, nh)
          mCtx.fillStyle = 'white'
          mCtx.fillRect(selRect.x, selRect.y, selRect.w, selRect.h)
        } else {
          mCtx.fillStyle = 'white'
          mCtx.fillRect(0, 0, nw, nh)
        }
        maskBase64 = maskCanvas.toDataURL('image/png').split(',')[1]
      }

      const url = await editImage(imageBase64, imageUrl, maskBase64, userText, baseMime)
      let base64: string | undefined
      try { base64 = await loadImageAsBase64(url) } catch { /* ok */ }
      setMessages(m => m.map(msg =>
        msg.id === assistantId
          ? { ...msg, status: 'ok' as const, imageUrl: url, base64 }
          : msg
      ))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setMessages(m => m.map(x =>
        x.id === assistantId ? { ...x, status: 'error' as const, text: msg } : x
      ))
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!canSend) return
      handleEdit()
    }
  }

  function downloadMsg(m: ChatMsg, index: number) {
    const href = m.base64 || m.imageUrl
    if (!href) return
    const a = document.createElement('a')
    a.href = href
    a.download = `edit-${index + 1}.png`
    a.click()
  }

  function applyResultAsCanvas(m: ChatMsg) {
    const href = m.base64 || m.imageUrl
    if (!href) return
    setOriginalImage(href)
    clearSelection()
  }

  return (
    <div className="app">
      <h1>AI 图像编辑</h1>
      <div className="workspace">
        <div className="left-panel">
          <p className="hint">
            {hasImage
              ? '可不框选：无选区 = 整图编辑。也可拖拽框选，只改局部。'
              : '先上传图片；右侧可直接打字（整图），或框选后改局部。'}
          </p>
          <div className="canvas-wrap">
            {hasImage ? (
              <canvas
                ref={canvasRef}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
              />
            ) : (
              <label className="upload-placeholder">
                <span className="upload-placeholder-title">上传图片</span>
                <span className="upload-placeholder-sub">点击选择文件，开始编辑</span>
                <input type="file" accept="image/*" onChange={handleFileChange} />
              </label>
            )}
          </div>
          {hasImage && (
            <button type="button" onClick={resetWorkbench} className="btn-secondary">
              换张图
            </button>
          )}
        </div>

        <div className="right-panel">
            <div className="chat-header">对话与结果</div>
            <div className="chat-messages" ref={chatScrollRef}>
              {messages.length === 0 && (
                <p className="chat-empty">
                  {hasImage
                    ? '直接输入指令 = 按整图理解；框选后发送 = 只改选中区域。结果可点图放大、下载。'
                    : '请先上传左侧图片，上传后即可在下方输入（整图编辑）。可选：框选后改为局部编辑。'}
                </p>
              )}
              {messages.map((m, i) => (
                <div key={m.id} className={`chat-bubble ${m.role}`}>
                  {m.role === 'user' && <p className="bubble-text">{m.text}</p>}
                  {m.role === 'assistant' && m.status === 'pending' && (
                    <div className="bubble-loading"><span className="mini-spin" /> 生成中…</div>
                  )}
                  {m.role === 'assistant' && m.status === 'error' && (
                    <p className="bubble-error">{m.text}</p>
                  )}
                  {m.role === 'assistant' && m.status === 'ok' && m.imageUrl && (
                    <>
                      <button
                        type="button"
                        className="bubble-img-btn"
                        onClick={() => setPreviewSrc(m.base64 || m.imageUrl!)}
                        title="点击放大"
                      >
                        <img src={m.imageUrl} alt="结果" className="bubble-img" />
                      </button>
                      <div className="bubble-actions">
                        <button type="button" className="btn-tiny" onClick={() => downloadMsg(m, i)}>下载</button>
                        <button type="button" className="btn-tiny primary" onClick={() => applyResultAsCanvas(m)}>用此图继续编辑</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="chat-input-area">
              <div className="input-bar">
                {selCrop && (
                  <div className="chip">
                    <img src={selCrop} alt="选区" className="chip-img" />
                    {recognizing
                      ? <span className="chip-label">识别中...</span>
                      : regionDesc && <span className="chip-label">{regionDesc}</span>}
                    <button type="button" className="chip-close" onClick={clearSelection}>✕</button>
                  </div>
                )}
                <input
                  ref={inputRef}
                  className="prompt-input"
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    !hasImage
                      ? '请先上传图片'
                      : selCrop
                        ? '局部编辑：输入指令，Enter 发送'
                        : '整图编辑：输入指令，Enter 发送（可选左侧框选改局部）'
                  }
                  disabled={!canSend}
                />
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleEdit}
                  disabled={!canSend}
                >
                  发送
                </button>
              </div>
              {error && <p className="error-inline">{error}</p>}
            </div>
          </div>
      </div>

      {previewSrc && (
        <div
          className="img-lightbox"
          role="presentation"
          onClick={() => setPreviewSrc(null)}
        >
          <button type="button" className="lightbox-close" onClick={() => setPreviewSrc(null)} aria-label="关闭">
            ✕
          </button>
          <img
            src={previewSrc}
            alt="预览"
            className="lightbox-img"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
