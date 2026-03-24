import { useEffect, useRef, useState } from 'react'
import { recognizeRegion, editImage } from './api'
import './App.css'

interface Rect { x: number; y: number; w: number; h: number }

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

  const [stage, setStage] = useState<'upload' | 'select' | 'result'>('upload')
  const [originalImage, setOriginalImage] = useState('')
  const [selCrop, setSelCrop] = useState('')
  const [selRect, setSelRect] = useState<Rect | null>(null)
  const [regionDesc, setRegionDesc] = useState('')
  const [recognizing, setRecognizing] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [resultUrl, setResultUrl] = useState('')
  const [resultBase64, setResultBase64] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isDrawing = useRef(false)
  const drawingRect = useRef<Rect | null>(null)
  const startPt = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (stage !== 'select' || !originalImage) return
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      const canvas = canvasRef.current!
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const maxW = canvas.parentElement!.clientWidth
      const maxH = window.innerHeight * 0.55
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1)
      canvas.style.width = img.naturalWidth * scale + 'px'
      canvas.style.height = img.naturalHeight * scale + 'px'
      redraw(null)
    }
    img.src = originalImage
  }, [stage, originalImage])

  function redraw(r: Rect | null) {
    const canvas = canvasRef.current!
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
      setStage('select')
    }
    reader.readAsDataURL(file)
  }

  async function handleEdit() {
    if (!selRect) { setError('请先框选一个区域'); return }
    if (!prompt.trim()) { setError('请输入编辑指令'); return }
    setError('')
    setLoading(true)
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
        mCtx.fillStyle = 'black'
        mCtx.fillRect(0, 0, w, h)
        mCtx.fillStyle = 'white'
        mCtx.fillRect(selRect.x * s, selRect.y * s, selRect.w * s, selRect.h * s)
        maskBase64 = maskCanvas.toDataURL('image/png').split(',')[1]
      } else {
        imageUrl = originalImage
        imageBase64 = undefined
        const maskCanvas = document.createElement('canvas')
        maskCanvas.width = nw
        maskCanvas.height = nh
        const mCtx = maskCanvas.getContext('2d')!
        mCtx.fillStyle = 'black'
        mCtx.fillRect(0, 0, nw, nh)
        mCtx.fillStyle = 'white'
        mCtx.fillRect(selRect.x, selRect.y, selRect.w, selRect.h)
        maskBase64 = maskCanvas.toDataURL('image/png').split(',')[1]
      }

      const url = await editImage(imageBase64, imageUrl, maskBase64, prompt, baseMime)
      setResultUrl(url)
      loadImageAsBase64(url).then(setResultBase64).catch(() => {})
      setStage('result')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
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

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEdit() }
  }

  return (
    <div className="app">
      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <p>AI 处理中，请稍候...</p>
        </div>
      )}
      <h1>AI 图像编辑222</h1>

      {stage === 'upload' && (
        <label className="upload-label">
          <span>点击上传图片</span>
          <input type="file" accept="image/*" onChange={handleFileChange} />
        </label>
      )}

      {stage === 'select' && (
        <div className="select-zone">
          <p className="hint">拖拽鼠标框选要编辑的区域</p>
          <div className="canvas-wrap">
            <canvas
              ref={canvasRef}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
            />
          </div>

          <div className="input-bar">
            {selCrop && (
              <div className="chip">
                <img src={selCrop} alt="选区" className="chip-img" />
                {recognizing
                  ? <span className="chip-label">识别中...</span>
                  : regionDesc && <span className="chip-label">{regionDesc}</span>
                }
                <button className="chip-close" onClick={clearSelection}>✕</button>
              </div>
            )}
            <input
              ref={inputRef}
              className="prompt-input"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={selCrop ? '描述修改后的样子，如"一个红色的苹果"，按 Enter 提交' : '先框选一个区域'}
              disabled={!selCrop || loading}
            />
            <button
              className="btn-primary"
              onClick={handleEdit}
              disabled={!selCrop || loading}
            >
              {loading ? '处理中...' : '提交'}
            </button>
          </div>

          <button onClick={() => setStage('upload')} className="btn-secondary">重新上传</button>
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {stage === 'result' && (
        <div className="result-zone">
          <div className="compare-row">
            <div><p>原图</p><img src={originalImage} alt="原图" className="result-img" /></div>
            <div><p>编辑结果</p><img src={resultUrl} alt="结果" className="result-img" /></div>
          </div>
          <div className="actions">
            <button onClick={() => {
              setOriginalImage(resultBase64 || resultUrl)
              setResultUrl(''); setResultBase64(''); setPrompt('')
              setSelCrop(''); setSelRect(null); setRegionDesc('')
              setStage('select')
            }} className="btn-primary">继续编辑结果</button>
            <button onClick={() => { setStage('select'); setResultUrl(''); setResultBase64(''); setPrompt('') }} className="btn-secondary">
              编辑原图
            </button>
            <button onClick={() => { setStage('upload'); setResultUrl(''); setResultBase64(''); setPrompt(''); setOriginalImage('') }} className="btn-secondary">
              换张图
            </button>
            <button className="btn-secondary" onClick={() => {
              const a = document.createElement('a')
              a.href = resultBase64 || resultUrl
              a.download = 'result.png'
              a.click()
            }}>下载结果</button>
          </div>
        </div>
      )}
    </div>
  )
}
