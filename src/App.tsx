import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react'
import { Download, Image as ImageIcon, Magnet, Mic2, Pause, Play, Redo2, RotateCcw, Scissors, SlidersHorizontal, Trash2, Undo2, Upload, Volume2 } from 'lucide-react'

type Tab = 'edit' | 'filter' | 'voice' | 'background'
type VoicePreset = 'Raw Clean' | 'Studio' | 'Clear Vocal' | 'Warm Vocal' | 'Unplugged' | 'Soft Reverb' | 'Studio Reverb' | 'Hall Reverb' | 'Echo'
type FilterPreset = 'None' | 'Vivid' | 'Warm' | 'Cool' | 'Mono' | 'Mystery Blur'
type AspectRatio = 'Original' | '9:16' | '16:9' | '1:1' | 'Custom'
type Segment = { id: number; start: number; end: number }
type Crop = { x: number; y: number; width: number; height: number }
type EditSnapshot = { segments: Segment[]; crop: Crop }

const voicePresets: VoicePreset[] = ['Raw Clean', 'Studio', 'Clear Vocal', 'Warm Vocal', 'Unplugged', 'Soft Reverb', 'Studio Reverb', 'Hall Reverb', 'Echo']
const filterPresets: FilterPreset[] = ['None', 'Vivid', 'Warm', 'Cool', 'Mono', 'Mystery Blur']
const voiceSettings: Record<VoicePreset, { gain: number; bass: number; treble: number; compression: number; reverb: number; echo: number }> = {
  'Raw Clean': { gain: 100, bass: 0, treble: 1, compression: 25, reverb: 0, echo: 0 },
  Studio: { gain: 108, bass: 2, treble: 3, compression: 58, reverb: 12, echo: 0 },
  'Clear Vocal': { gain: 106, bass: -1, treble: 5, compression: 62, reverb: 7, echo: 0 },
  'Warm Vocal': { gain: 105, bass: 4, treble: -1, compression: 42, reverb: 10, echo: 0 },
  Unplugged: { gain: 103, bass: 2, treble: 2, compression: 34, reverb: 16, echo: 0 },
  'Soft Reverb': { gain: 100, bass: 1, treble: 2, compression: 35, reverb: 24, echo: 0 },
  'Studio Reverb': { gain: 103, bass: 2, treble: 3, compression: 48, reverb: 36, echo: 0 },
  'Hall Reverb': { gain: 100, bass: 1, treble: 1, compression: 32, reverb: 58, echo: 0 },
  Echo: { gain: 100, bass: 0, treble: 1, compression: 30, reverb: 8, echo: 42 }
}

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return '0:00'
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const bassNodeRef = useRef<BiquadFilterNode | null>(null)
  const trebleNodeRef = useRef<BiquadFilterNode | null>(null)
  const compressorRef = useRef<DynamicsCompressorNode | null>(null)
  const outputGainRef = useRef<GainNode | null>(null)
  const reverbGainRef = useRef<GainNode | null>(null)
  const echoGainRef = useRef<GainNode | null>(null)
  const echoFeedbackRef = useRef<GainNode | null>(null)
  const exportAudioRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const backgroundImageRef = useRef<HTMLImageElement | null>(null)
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const cropDragRef = useRef<{ mode: 'move' | 'se' | 'sw' | 'ne' | 'nw'; startX: number; startY: number; crop: Crop } | null>(null)

  const [videoUrl, setVideoUrl] = useState('')
  const [fileName, setFileName] = useState('')
  const [tab, setTab] = useState<Tab>('edit')
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [segments, setSegments] = useState<Segment[]>([])
  const [selectedSegment, setSelectedSegment] = useState(0)
  const [magnet, setMagnet] = useState(true)
  const [crop, setCrop] = useState<Crop>({ x: 0, y: 0, width: 1, height: 1 })
  const [undoStack, setUndoStack] = useState<EditSnapshot[]>([])
  const [redoStack, setRedoStack] = useState<EditSnapshot[]>([])
  const [aspect, setAspect] = useState<AspectRatio>('Original')
  const [customWidth, setCustomWidth] = useState(1080)
  const [customHeight, setCustomHeight] = useState(1080)
  const [speed, setSpeed] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [saturation, setSaturation] = useState(100)
  const [filterPreset, setFilterPreset] = useState<FilterPreset>('None')
  const [blurStrength, setBlurStrength] = useState(10)
  const [voicePreset, setVoicePreset] = useState<VoicePreset>('Raw Clean')
  const [gain, setGain] = useState(100)
  const [bass, setBass] = useState(0)
  const [treble, setTreble] = useState(1)
  const [compression, setCompression] = useState(25)
  const [reverb, setReverb] = useState(0)
  const [echo, setEcho] = useState(0)
  const [bgColor, setBgColor] = useState('#111111')
  const [bgImage, setBgImage] = useState('')
  const [chromaEnabled, setChromaEnabled] = useState(false)
  const [chromaColor, setChromaColor] = useState('#00b140')
  const [chromaThreshold, setChromaThreshold] = useState(55)
  const [protectSkin, setProtectSkin] = useState(true)
  const [pickingColor, setPickingColor] = useState(false)
  const [exportQuality, setExportQuality] = useState<720 | 1080>(720)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportMessage, setExportMessage] = useState('')

  const getTargetRatio = (value: AspectRatio = aspect) => {
    const video = videoRef.current
    const sourceRatio = (video?.videoWidth || 16) / (video?.videoHeight || 9)
    if (value === '9:16') return 9 / 16
    if (value === '16:9') return 16 / 9
    if (value === '1:1') return 1
    if (value === 'Custom') return Math.max(1, customWidth) / Math.max(1, customHeight)
    return sourceRatio
  }

  const changeAspect = (value: AspectRatio) => {
    const video = videoRef.current
    setAspect(value)
    if (!video?.videoWidth) return
    rememberEdit()
    const sourceRatio = video.videoWidth / video.videoHeight
    const targetRatio = getTargetRatio(value)
    const width = sourceRatio > targetRatio ? targetRatio / sourceRatio : 1
    const height = sourceRatio > targetRatio ? 1 : sourceRatio / targetRatio
    setCrop({ x: (1 - width) / 2, y: (1 - height) / 2, width, height })
  }

  useEffect(() => () => { void audioContextRef.current?.close() }, [])

  useEffect(() => {
    const video = videoRef.current
    if (video) video.playbackRate = speed
  }, [speed, videoUrl])

  useEffect(() => {
    if (!bgImage) { backgroundImageRef.current = null; return }
    const image = new Image(); image.src = bgImage; image.onload = () => { backgroundImageRef.current = image }
  }, [bgImage])

  useEffect(() => {
    const now = audioContextRef.current?.currentTime ?? 0
    bassNodeRef.current?.gain.setTargetAtTime(bass, now, 0.02)
    trebleNodeRef.current?.gain.setTargetAtTime(treble, now, 0.02)
    outputGainRef.current?.gain.setTargetAtTime(gain / 100, now, 0.02)
    reverbGainRef.current?.gain.setTargetAtTime(reverb / 100, now, 0.02)
    echoGainRef.current?.gain.setTargetAtTime(echo / 100, now, 0.02)
    echoFeedbackRef.current?.gain.setTargetAtTime(Math.min(echo / 125, 0.68), now, 0.02)
    const compressor = compressorRef.current
    if (compressor) {
      compressor.threshold.setTargetAtTime(-12 - compression * 0.2, now, 0.02)
      compressor.ratio.setTargetAtTime(1 + compression * 0.055, now, 0.02)
    }
  }, [gain, bass, treble, compression, reverb, echo])

  const importVideo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    setVideoUrl(URL.createObjectURL(file)); setFileName(file.name); setDuration(0); setTrimStart(0); setTrimEnd(0); setSegments([]); setSelectedSegment(0); setCrop({ x: 0, y: 0, width: 1, height: 1 }); setUndoStack([]); setRedoStack([]); setCurrentTime(0); setPlaying(false); setExportMessage('')
  }

  const importBackground = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (bgImage) URL.revokeObjectURL(bgImage)
    setBgImage(URL.createObjectURL(file))
  }

  const ensureAudio = async () => {
    const video = videoRef.current
    if (!video) return
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextClass) return
      const context = new AudioContextClass()
      const source = context.createMediaElementSource(video)
      const bassNode = context.createBiquadFilter(); bassNode.type = 'lowshelf'; bassNode.frequency.value = 180
      const trebleNode = context.createBiquadFilter(); trebleNode.type = 'highshelf'; trebleNode.frequency.value = 3500
      const compressor = context.createDynamicsCompressor(); compressor.attack.value = 0.012; compressor.release.value = 0.22; compressor.knee.value = 16
      const dryGain = context.createGain()
      const convolver = context.createConvolver(); convolver.buffer = createImpulse(context, 2.2, 2.8)
      const reverbGain = context.createGain()
      const delay = context.createDelay(1); delay.delayTime.value = 0.24
      const echoGain = context.createGain()
      const echoFeedback = context.createGain()
      const outputGain = context.createGain()
      const exportAudio = context.createMediaStreamDestination()
      source.connect(bassNode).connect(trebleNode).connect(compressor)
      compressor.connect(dryGain).connect(outputGain)
      compressor.connect(convolver).connect(reverbGain).connect(outputGain)
      compressor.connect(delay).connect(echoGain).connect(outputGain)
      delay.connect(echoFeedback).connect(delay)
      outputGain.connect(context.destination)
      outputGain.connect(exportAudio)
      audioContextRef.current = context; bassNodeRef.current = bassNode; trebleNodeRef.current = trebleNode; compressorRef.current = compressor
      outputGainRef.current = outputGain; reverbGainRef.current = reverbGain; echoGainRef.current = echoGain; echoFeedbackRef.current = echoFeedback
      exportAudioRef.current = exportAudio
      dryGain.gain.value = 1; reverbGain.gain.value = reverb / 100; echoGain.gain.value = echo / 100; echoFeedback.gain.value = Math.min(echo / 125, 0.68)
    }
    if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume()
  }

  const chooseVoicePreset = async (preset: VoicePreset) => {
    await ensureAudio(); setVoicePreset(preset)
    const value = voiceSettings[preset]
    setGain(value.gain); setBass(value.bass); setTreble(value.treble); setCompression(value.compression); setReverb(value.reverb); setEcho(value.echo)
  }

  const togglePlay = async () => {
    const video = videoRef.current
    if (!video || exporting) return
    await ensureAudio()
    if (video.paused) {
      const segment = segments[selectedSegment]
      const start = segment?.start ?? trimStart
      const end = segment?.end ?? trimEnd
      if (video.currentTime < start || video.currentTime >= end) video.currentTime = start
      await video.play()
    } else video.pause()
  }

  const seek = (value: number) => {
    if (videoRef.current) videoRef.current.currentTime = value
    setCurrentTime(value)
  }

  const updateTime = () => {
    const video = videoRef.current
    if (!video) return
    const active = segments[selectedSegment]
    const start = active?.start ?? trimStart
    const end = active?.end ?? trimEnd
    if (end > start && video.currentTime >= end && !exporting) {
      const next = segments[selectedSegment + 1]
      if (next) { setSelectedSegment(selectedSegment + 1); setTrimStart(next.start); setTrimEnd(next.end); video.currentTime = next.start }
      else { video.pause(); const first = segments[0]; video.currentTime = first?.start ?? start; if (first) { setSelectedSegment(0); setTrimStart(first.start); setTrimEnd(first.end) } }
    }
    setCurrentTime(video.currentTime)
  }

  const presetFilter = useMemo(() => {
    if (filterPreset === 'Vivid') return 'sepia(.08)'
    if (filterPreset === 'Warm') return 'sepia(.22) hue-rotate(-8deg)'
    if (filterPreset === 'Cool') return 'sepia(.08) hue-rotate(165deg)'
    if (filterPreset === 'Mono') return 'grayscale(1)'
    if (filterPreset === 'Mystery Blur') return `blur(${blurStrength}px)`
    return ''
  }, [filterPreset, blurStrength])
  const filterStyle = `${presetFilter} brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`

  const updateSelectedSegment = (start: number, end: number) => {
    rememberEdit()
    setTrimStart(start); setTrimEnd(end)
    setSegments(items => items.map((item, index) => index === selectedSegment ? { ...item, start, end } : item))
  }

  const selectSegment = (index: number) => {
    const segment = segments[index]
    if (!segment) return
    setSelectedSegment(index); setTrimStart(segment.start); setTrimEnd(segment.end); seek(segment.start)
  }

  const splitAtPlayhead = () => {
    const segment = segments[selectedSegment]
    if (!segment || currentTime <= segment.start + 0.1 || currentTime >= segment.end - 0.1) return
    rememberEdit()
    const nextId = Math.max(0, ...segments.map(item => item.id)) + 1
    const next = [...segments]
    next.splice(selectedSegment, 1, { id: segment.id, start: segment.start, end: currentTime }, { id: nextId, start: currentTime, end: segment.end })
    setSegments(next); setTrimEnd(currentTime)
  }

  const deleteSelected = () => {
    if (segments.length <= 1) return
    rememberEdit()
    const next = segments.filter((_, index) => index !== selectedSegment)
    const index = Math.min(selectedSegment, next.length - 1)
    setSegments(next); selectSegmentFrom(next, index)
  }

  const selectSegmentFrom = (items: Segment[], index: number) => {
    const segment = items[index]
    if (!segment) return
    setSelectedSegment(index); setTrimStart(segment.start); setTrimEnd(segment.end); seek(segment.start)
  }

  const rememberEdit = () => {
    setUndoStack(items => [...items.slice(-29), { segments: segments.map(item => ({ ...item })), crop: { ...crop } }])
    setRedoStack([])
  }

  const restoreSnapshot = (snapshot: EditSnapshot) => {
    setSegments(snapshot.segments.map(item => ({ ...item }))); setCrop({ ...snapshot.crop })
    const index = Math.min(selectedSegment, snapshot.segments.length - 1); selectSegmentFrom(snapshot.segments, Math.max(0, index))
  }

  const undo = () => {
    const snapshot = undoStack[undoStack.length - 1]; if (!snapshot) return
    setRedoStack(items => [...items, { segments: segments.map(item => ({ ...item })), crop: { ...crop } }]); setUndoStack(items => items.slice(0, -1)); restoreSnapshot(snapshot)
  }

  const redo = () => {
    const snapshot = redoStack[redoStack.length - 1]; if (!snapshot) return
    setUndoStack(items => [...items, { segments: segments.map(item => ({ ...item })), crop: { ...crop } }]); setRedoStack(items => items.slice(0, -1)); restoreSnapshot(snapshot)
  }

  const startCropDrag = (event: ReactPointerEvent, mode: 'move' | 'se' | 'sw' | 'ne' | 'nw') => {
    rememberEdit(); cropDragRef.current = { mode, startX: event.clientX, startY: event.clientY, crop: { ...crop } }; event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveCrop = (event: ReactPointerEvent) => {
    const drag = cropDragRef.current; const stage = event.currentTarget.getBoundingClientRect(); if (!drag) return
    const dx = (event.clientX - drag.startX) / stage.width; const dy = (event.clientY - drag.startY) / stage.height
    if (drag.mode === 'move') {
      setCrop({ ...drag.crop, x: Math.max(0, Math.min(1 - drag.crop.width, drag.crop.x + dx)), y: Math.max(0, Math.min(1 - drag.crop.height, drag.crop.y + dy)) })
      return
    }
    const video = videoRef.current; if (!video?.videoWidth) return
    const normalizedRatio = getTargetRatio() / (video.videoWidth / video.videoHeight)
    const right = drag.crop.x + drag.crop.width; const bottom = drag.crop.y + drag.crop.height
    const west = drag.mode.includes('w'); const north = drag.mode.includes('n')
    const widthFromX = west ? drag.crop.width - dx : drag.crop.width + dx
    const heightFromY = north ? drag.crop.height - dy : drag.crop.height + dy
    let width = (widthFromX + heightFromY * normalizedRatio) / 2
    const anchorX = west ? right : drag.crop.x; const anchorY = north ? bottom : drag.crop.y
    const maxWidthX = west ? anchorX : 1 - anchorX
    const maxHeight = north ? anchorY : 1 - anchorY
    width = Math.max(.15, Math.min(maxWidthX, maxHeight * normalizedRatio, width))
    const height = width / normalizedRatio
    setCrop({ x: west ? anchorX - width : anchorX, y: north ? anchorY - height : anchorY, width, height })
  }

  const getExportSize = () => {
    const video = videoRef.current
    const sourceRatio = (video?.videoWidth || 16) / (video?.videoHeight || 9)
    const ratio = aspect === '9:16' ? 9 / 16 : aspect === '16:9' ? 16 / 9 : aspect === '1:1' ? 1 : aspect === 'Custom' ? customWidth / customHeight : sourceRatio
    if (ratio >= 1) return { width: exportQuality, height: Math.round(exportQuality / ratio / 2) * 2 }
    return { width: Math.round(exportQuality * ratio / 2) * 2, height: exportQuality }
  }

  const drawExportFrame = (canvas: HTMLCanvasElement) => {
    const video = videoRef.current
    const context = canvas.getContext('2d')
    if (!video || !context) return
    context.save(); context.filter = 'none'; context.fillStyle = bgColor; context.fillRect(0, 0, canvas.width, canvas.height)
    const background = backgroundImageRef.current
    if (background) drawCover(context, background, canvas.width, canvas.height)
    const sourceCanvas = sourceCanvasRef.current ?? document.createElement('canvas'); sourceCanvasRef.current = sourceCanvas
    if (sourceCanvas.width !== canvas.width || sourceCanvas.height !== canvas.height) { sourceCanvas.width = canvas.width; sourceCanvas.height = canvas.height }
    const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true })
    if (!sourceContext) return
    sourceContext.clearRect(0, 0, canvas.width, canvas.height); sourceContext.filter = filterStyle
    const sx = crop.x * video.videoWidth; const sy = crop.y * video.videoHeight
    const sw = crop.width * video.videoWidth; const sh = crop.height * video.videoHeight
    const blurPadding = filterPreset === 'Mystery Blur' ? blurStrength * 2 : 0
    sourceContext.save(); sourceContext.translate(canvas.width / 2, canvas.height / 2); sourceContext.rotate(rotation * Math.PI / 180)
    sourceContext.drawImage(video, sx, sy, sw, sh, -canvas.width / 2 - blurPadding, -canvas.height / 2 - blurPadding, canvas.width + blurPadding * 2, canvas.height + blurPadding * 2); sourceContext.restore()
    if (chromaEnabled) applyChromaKey(sourceContext, canvas.width, canvas.height, chromaColor, chromaThreshold, protectSkin)
    context.drawImage(sourceCanvas, 0, 0); context.restore()
  }

  useEffect(() => {
    if (!videoUrl) return
    let frameId = 0
    const render = () => {
      const canvas = previewCanvasRef.current; const video = videoRef.current
      if (!exporting && canvas && video?.videoWidth) {
        const size = tab === 'edit' ? { width: video.videoWidth, height: video.videoHeight } : getExportSize(); const scale = Math.min(1, 560 / Math.max(size.width, size.height))
        const width = Math.max(2, Math.round(size.width * scale / 2) * 2); const height = Math.max(2, Math.round(size.height * scale / 2) * 2)
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
        if (tab === 'edit') {
          const context = canvas.getContext('2d')
          if (context) { const padding = filterPreset === 'Mystery Blur' ? blurStrength * 2 : 0; context.clearRect(0, 0, width, height); context.filter = filterStyle; context.drawImage(video, -padding, -padding, width + padding * 2, height + padding * 2) }
        } else drawExportFrame(canvas)
      }
      frameId = requestAnimationFrame(render)
    }
    render(); return () => cancelAnimationFrame(frameId)
  }, [videoUrl, tab, aspect, customWidth, customHeight, crop, rotation, filterStyle, filterPreset, blurStrength, bgColor, bgImage, chromaEnabled, chromaColor, chromaThreshold, protectSkin, exporting])

  const pickBackgroundColor = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!pickingColor) return
    const video = videoRef.current; const canvas = event.currentTarget; if (!video) return
    const bounds = canvas.getBoundingClientRect(); const nx = (event.clientX - bounds.left) / bounds.width; const ny = (event.clientY - bounds.top) / bounds.height
    const color = sampleVideoColor(video, crop.x + nx * crop.width, crop.y + ny * crop.height)
    setChromaColor(color); setChromaEnabled(true); setPickingColor(false)
  }

  const autoDetectBackground = () => {
    const video = videoRef.current; if (!video) return
    const points = [[.04, .04], [.96, .04], [.04, .96], [.96, .96]]
    const colors = points.map(([x, y]) => hexToRgb(sampleVideoColor(video, x, y)))
    const average = colors.reduce((sum, color) => sum.map((value, index) => value + color[index]), [0, 0, 0]).map(value => Math.round(value / colors.length))
    setChromaColor(rgbToHex(average)); setChromaEnabled(true)
  }

  const exportVideo = async () => {
    const video = videoRef.current
    if (!video || !segments.length || exporting || !window.MediaRecorder) return
    await ensureAudio()
    const wakeLock = await (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen').catch(() => null)
    const size = getExportSize(); const canvas = document.createElement('canvas'); canvas.width = size.width; canvas.height = size.height
    const canvasStream = canvas.captureStream(30)
    const audioTrack = exportAudioRef.current?.stream.getAudioTracks()[0]
    if (audioTrack) canvasStream.addTrack(audioTrack)
    const mp4Type = 'video/mp4;codecs=avc1.42E01E,mp4a.40.2'
    const mimeType = MediaRecorder.isTypeSupported(mp4Type) ? mp4Type : MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm'
    const recorder = new MediaRecorder(canvasStream, { mimeType, videoBitsPerSecond: exportQuality === 1080 ? 8_000_000 : 5_000_000 })
    const chunks: Blob[] = []; recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
    setExporting(true); setExportProgress(0); recorder.start(1000)
    const total = segments.reduce((sum, segment) => sum + segment.end - segment.start, 0); let completed = 0
    for (const segment of segments) {
      video.currentTime = segment.start; await waitForSeek(video); await video.play()
      await new Promise<void>(resolve => { const frame = () => { drawExportFrame(canvas); const elapsed = Math.min(video.currentTime, segment.end) - segment.start; setExportProgress(Math.round((completed + elapsed) / total * 100)); if (video.currentTime >= segment.end || video.ended) { video.pause(); resolve() } else { if (video.paused) void video.play(); requestAnimationFrame(frame) } }; frame() })
      completed += segment.end - segment.start
    }
    recorder.stop(); await new Promise<void>(resolve => { recorder.onstop = () => resolve() })
    const extension = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'
    const exportName = `${fileName.replace(/\.[^.]+$/, '')}-AKB-Studio.${extension}`
    const blob = new Blob(chunks, { type: mimeType }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = exportName; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000)
    await wakeLock?.release().catch(() => undefined)
    setExporting(false); setExportProgress(100); setExportMessage(`${exportName} saved in Downloads`); seek(segments[0].start)
  }

  return <main className="app">
    <header className="topbar"><div><strong>AKB Studio</strong><span>Offline Video + Voice Studio</span></div><div className="exportTools"><select value={exportQuality} onChange={event => setExportQuality(Number(event.target.value) as 720 | 1080)}><option value="720">720p</option><option value="1080">1080p</option></select><button className="export" disabled={!videoUrl || exporting} onClick={() => void exportVideo()}><Download size={18}/><span>{exporting ? `Exporting ${exportProgress}%` : 'Export'}</span></button></div></header>
    <section className="workspace">
      <div className="previewPanel">
        {!videoUrl ? <label className="emptyState"><Upload size={40}/><b>Import a video</b><span>Your media stays on this device</span><input type="file" accept="video/*" onChange={importVideo}/></label> : <>
          <div className="stage">
            <video className="sourceVideo" ref={videoRef} src={videoUrl} playsInline onLoadedMetadata={event => { const length = event.currentTarget.duration; setDuration(length); setTrimEnd(length); setSegments([{ id: 1, start: 0, end: length }]) }} onTimeUpdate={updateTime} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}/>
            <div className="canvasWrap" onPointerMove={moveCrop} onPointerUp={() => { cropDragRef.current = null }} onPointerCancel={() => { cropDragRef.current = null }}><canvas className={pickingColor ? 'previewCanvas picking' : 'previewCanvas'} ref={previewCanvasRef} onPointerDown={pickBackgroundColor}/>{tab === 'edit' && <div className="cropFrame" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }} onPointerDown={event => startCropDrag(event, 'move')}><i className="gridV one"/><i className="gridV two"/><i className="gridH one"/><i className="gridH two"/>{(['nw', 'ne', 'sw', 'se'] as const).map(handle => <button key={handle} className={`cropHandle ${handle}`} aria-label={`Resize crop ${handle}`} onPointerDown={event => { event.stopPropagation(); startCropDrag(event, handle) }}/>)}</div>}</div>
          </div>
          <div className="transport"><button disabled={exporting} onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={20}/> : <Play size={20}/>}</button><input className="scrubber" disabled={exporting} aria-label="Video position" type="range" min={0} max={duration || 1} step="0.01" value={currentTime} onChange={event => seek(Number(event.target.value))}/><span className="timecode">{formatTime(currentTime)} / {formatTime(duration)}</span></div>
          <div className="fileRow"><span className="filename">{fileName}</span><label>Replace<input type="file" accept="video/*" onChange={importVideo}/></label></div>
          {(exporting || exportMessage) && <div className={exporting ? 'exportStatus working' : 'exportStatus done'}><div><span>{exporting ? 'Exporting video' : 'Export complete'}</span><b>{exporting ? `${exportProgress}%` : exportMessage}</b></div><progress max="100" value={exportProgress}/>{!exporting && exportMessage.endsWith('.webm saved in Downloads') && <small>WEBM may appear in Downloads instead of Android Gallery.</small>}</div>}
        </>}
      </div>
      <aside className="panel">
        <nav className="tabs"><button className={tab === 'edit' ? 'active' : ''} onClick={() => setTab('edit')}><Scissors/>Edit</button><button className={tab === 'filter' ? 'active' : ''} onClick={() => setTab('filter')}><SlidersHorizontal/>Adjust</button><button className={tab === 'voice' ? 'active' : ''} onClick={() => setTab('voice')}><Mic2/>Voice</button><button className={tab === 'background' ? 'active' : ''} onClick={() => setTab('background')}><ImageIcon/>BG</button></nav>
        <div className="controls">
          <div className="historyActions"><button className="secondary" disabled={!undoStack.length} onClick={undo}><Undo2 size={16}/>Undo</button><button className="secondary" disabled={!redoStack.length} onClick={redo}><Redo2 size={16}/>Redo</button></div>
          {tab === 'edit' && <><section className="card"><h2>Timeline</h2><p>Move the playhead and split. Select any middle clip and delete it. Magnet joins the remaining clips during export.</p></section><div className="timeline">{segments.map((segment, index) => <button key={segment.id} className={selectedSegment === index ? 'selected' : ''} style={{ flex: Math.max(.2, segment.end - segment.start) }} onClick={() => selectSegment(index)}><span>Clip {index + 1}</span><small>{formatTime(segment.end - segment.start)}</small></button>)}</div><div className="timelineActions"><button className="secondary" disabled={!videoUrl} onClick={splitAtPlayhead}><Scissors size={16}/>Split</button><button className="secondary danger" disabled={segments.length <= 1} onClick={deleteSelected}><Trash2 size={16}/>Delete</button><button className={magnet ? 'secondary activeTool' : 'secondary'} onClick={() => setMagnet(value => !value)}><Magnet size={16}/>Magnet</button></div><div className="trimReadout"><span>Start <b>{formatTime(trimStart)}</b></span><span>End <b>{formatTime(trimEnd)}</b></span></div><div className="buttonRow"><button className="secondary" disabled={!videoUrl} onClick={() => updateSelectedSegment(Math.min(currentTime, Math.max(0, trimEnd - 0.1)), trimEnd)}>Set start</button><button className="secondary" disabled={!videoUrl} onClick={() => updateSelectedSegment(trimStart, Math.min(duration, Math.max(currentTime, trimStart + 0.1)))}>Set end</button></div><label className="field">Canvas<select value={aspect} onChange={event => changeAspect(event.target.value as AspectRatio)}><option>Original</option><option>9:16</option><option>16:9</option><option>1:1</option><option>Custom</option></select></label>{aspect === 'Custom' && <div className="customSize"><input type="number" min="240" max="3840" value={customWidth} onChange={event => setCustomWidth(Number(event.target.value))}/><span>×</span><input type="number" min="240" max="3840" value={customHeight} onChange={event => setCustomHeight(Number(event.target.value))}/></div>}<Slider label="Speed" value={speed} setValue={setSpeed} min={0.5} max={2} step={0.05} suffix="×"/><label className="field">Rotate <button className="iconButton" onClick={() => setRotation(value => (value + 90) % 360)}><RotateCcw size={18}/>{rotation}°</button></label></>}
          {tab === 'filter' && <><section className="card"><h2>Visual adjustments</h2><p>Mystery Blur keeps you visibly singing while softening facial detail, so attention stays on the voice.</p></section><div className="presetGrid compact">{filterPresets.map(preset => <button key={preset} className={filterPreset === preset ? 'selected' : ''} onClick={() => setFilterPreset(preset)}>{preset}</button>)}</div>{filterPreset === 'Mystery Blur' && <Slider label="Mystery blur" value={blurStrength} setValue={setBlurStrength} min={3} max={22} suffix=" px"/>}<Slider label="Brightness" value={brightness} setValue={setBrightness} min={50} max={150}/><Slider label="Contrast" value={contrast} setValue={setContrast} min={50} max={150}/><Slider label="Saturation" value={saturation} setValue={setSaturation} min={0} max={180}/><button className="secondary" onClick={() => { setBrightness(100); setContrast(100); setSaturation(100); setBlurStrength(10); setFilterPreset('None') }}>Reset adjustments</button></>}
          {tab === 'voice' && <><section className="card"><h2><Volume2 size={17}/>Live voice preview</h2><p>Natural singing presets use EQ, compression and real local reverb. Nothing is uploaded.</p></section><div className="presetGrid">{voicePresets.map(preset => <button key={preset} className={voicePreset === preset ? 'selected' : ''} onClick={() => void chooseVoicePreset(preset)}>{preset}</button>)}</div><Slider label="Loudness" value={gain} setValue={setGain} min={50} max={150} suffix="%"/><Slider label="Bass" value={bass} setValue={setBass} min={-10} max={10} suffix=" dB"/><Slider label="Treble" value={treble} setValue={setTreble} min={-10} max={10} suffix=" dB"/><Slider label="Compression" value={compression} setValue={setCompression} min={0} max={100} suffix="%"/><Slider label="Reverb" value={reverb} setValue={setReverb} min={0} max={70} suffix="%"/><Slider label="Echo" value={echo} setValue={setEcho} min={0} max={65} suffix="%"/></>}
          {tab === 'background' && <><section className="card"><h2>Background replacement</h2><p>Changes appear instantly in the preview. Auto Detect samples the corners; Pick Color lets you tap the background.</p></section><div className="buttonRow"><button className="secondary" disabled={!videoUrl} onClick={autoDetectBackground}>Auto Detect</button><button className={pickingColor ? 'secondary activeTool' : 'secondary'} disabled={!videoUrl} onClick={() => setPickingColor(value => !value)}>Pick Color</button></div><label className="toggleRow"><input type="checkbox" checked={chromaEnabled} onChange={event => setChromaEnabled(event.target.checked)}/><span>Enable chroma key</span></label>{chromaEnabled && <><label className="toggleRow"><input type="checkbox" checked={protectSkin} onChange={event => setProtectSkin(event.target.checked)}/><span>Protect face and skin</span></label><label className="field">Remove color<input type="color" value={chromaColor} onChange={event => setChromaColor(event.target.value)}/></label><Slider label="Color tolerance" value={chromaThreshold} setValue={setChromaThreshold} min={10} max={140}/></>}<label className="field">New background color<input type="color" value={bgColor} onChange={event => setBgColor(event.target.value)}/></label><label className="secondary uploadBg">Choose background image<input type="file" accept="image/*" onChange={importBackground}/></label>{bgImage && <button className="secondary" onClick={() => { URL.revokeObjectURL(bgImage); setBgImage('') }}>Remove image</button>}</>}
        </div>
      </aside>
    </section>
  </main>
}

function createImpulse(context: AudioContext, seconds: number, decay: number) {
  const length = Math.floor(context.sampleRate * seconds)
  const impulse = context.createBuffer(2, length, context.sampleRate)
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel)
    for (let index = 0; index < length; index += 1) data[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / length, decay)
  }
  return impulse
}

function waitForSeek(video: HTMLVideoElement) {
  if (video.readyState >= 2) return Promise.resolve()
  return new Promise<void>(resolve => video.addEventListener('seeked', () => resolve(), { once: true }))
}

function drawCover(context: CanvasRenderingContext2D, image: CanvasImageSource & { width: number; height: number }, width: number, height: number) {
  const scale = Math.max(width / image.width, height / image.height)
  const drawWidth = image.width * scale; const drawHeight = image.height * scale
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
}

function applyChromaKey(context: CanvasRenderingContext2D, width: number, height: number, color: string, threshold: number, protectSkin: boolean) {
  const target = [Number.parseInt(color.slice(1, 3), 16), Number.parseInt(color.slice(3, 5), 16), Number.parseInt(color.slice(5, 7), 16)]
  const frame = context.getImageData(0, 0, width, height)
  for (let index = 0; index < frame.data.length; index += 4) {
    const red = frame.data[index]; const green = frame.data[index + 1]; const blue = frame.data[index + 2]
    if (protectSkin && isLikelySkin(red, green, blue)) continue
    const distance = Math.hypot(red - target[0], green - target[1], blue - target[2])
    if (distance < threshold) frame.data[index + 3] = Math.round(255 * distance / threshold)
  }
  context.putImageData(frame, 0, 0)
}

function isLikelySkin(red: number, green: number, blue: number) {
  const cb = 128 - .169 * red - .331 * green + .5 * blue
  const cr = 128 + .5 * red - .419 * green - .081 * blue
  return cb >= 76 && cb <= 132 && cr >= 132 && cr <= 178 && red > 45
}

function sampleVideoColor(video: HTMLVideoElement, x: number, y: number) {
  const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1
  const context = canvas.getContext('2d'); if (!context) return '#00b140'
  context.drawImage(video, Math.max(0, Math.min(video.videoWidth - 1, x * video.videoWidth)), Math.max(0, Math.min(video.videoHeight - 1, y * video.videoHeight)), 1, 1, 0, 0, 1, 1)
  return rgbToHex(Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3)))
}

function hexToRgb(color: string) {
  return [Number.parseInt(color.slice(1, 3), 16), Number.parseInt(color.slice(3, 5), 16), Number.parseInt(color.slice(5, 7), 16)]
}

function rgbToHex(color: number[]) {
  return `#${color.map(value => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0')).join('')}`
}

function Slider({ label, value, setValue, min, max, step = 1, suffix = '' }: { label: string; value: number; setValue: (value: number) => void; min: number; max: number; step?: number; suffix?: string }) {
  return <label className="slider"><span>{label}<b>{Number.isInteger(value) ? value : value.toFixed(2)}{suffix}</b></span><input type="range" min={min} max={max} step={step} value={value} onChange={event => setValue(Number(event.target.value))}/></label>
}
