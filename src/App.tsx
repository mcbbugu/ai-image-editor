import { useEffect, useRef, useState } from 'react'
import { recognizeRegion, editImage } from './api'
import './App.css'

interface Rect { x: number; y: number; w: number; h: number }

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
    const cropBase64 = cropDataUrl.split(',')[1]

    setSelRect(r)
    setSelCrop(cropDataUrl)
    setTimeout(() => inputRef.current?.focus(), 50)

    setRecognizing(true)
    recognizeRegion(cropBase64)
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
      const maskCanvas = document.createElement('canvas')
      maskCanvas.width = img.naturalWidth
      maskCanvas.height = img.naturalHeight
      const mCtx = maskCanvas.getContext('2d')!
      mCtx.fillStyle = 'black'
      mCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height)
      mCtx.fillStyle = 'white'
      mCtx.fillRect(selRect.x, selRect.y, selRect.w, selRect.h)

      const imageBase64 = originalImage.split(',')[1]
      const maskBase64 = maskCanvas.toDataURL('image/png').split(',')[1]
      const url = await editImage(imageBase64, maskBase64, prompt)
      setResultUrl(url)
      setStage('result')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
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
      <h1>AI 图像编辑</h1>

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
            <button onClick={() => { setStage('upload'); setResultUrl(''); setPrompt(''); setOriginalImage('') }} className="btn-secondary">
              换张图
            </button>
            <button onClick={() => { setStage('select'); setResultUrl(''); setPrompt('') }} className="btn-secondary">
              再次编辑
            </button>
            <button className="btn-primary" onClick={async () => {
              const blob = await fetch(resultUrl).then(r => r.blob())
              const a = document.createElement('a')
              a.href = URL.createObjectURL(blob)
              a.download = 'result.png'
              a.click()
            }}>下载结果</button>
          </div>
        </div>
      )}
    </div>
  )
}
