import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Download, Image as ImageIcon, Mic2, Pause, Play, RotateCcw, Scissors, SlidersHorizontal, Upload, Volume2 } from 'lucide-react'

type Tab = 'edit' | 'filter' | 'voice' | 'background'
type VoicePreset = 'Raw Clean' | 'Studio' | 'Clear Vocal' | 'Warm Vocal' | 'Unplugged' | 'Soft Reverb' | 'Studio Reverb' | 'Hall Reverb' | 'Echo'
type FilterPreset = 'None' | 'Vivid' | 'Warm' | 'Cool' | 'Mono'

const voicePresets: VoicePreset[] = ['Raw Clean', 'Studio', 'Clear Vocal', 'Warm Vocal', 'Unplugged', 'Soft Reverb', 'Studio Reverb', 'Hall Reverb', 'Echo']
const filterPresets: FilterPreset[] = ['None', 'Vivid', 'Warm', 'Cool', 'Mono']
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

  const [videoUrl, setVideoUrl] = useState('')
  const [fileName, setFileName] = useState('')
  const [tab, setTab] = useState<Tab>('edit')
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [saturation, setSaturation] = useState(100)
  const [filterPreset, setFilterPreset] = useState<FilterPreset>('None')
  const [voicePreset, setVoicePreset] = useState<VoicePreset>('Raw Clean')
  const [gain, setGain] = useState(100)
  const [bass, setBass] = useState(0)
  const [treble, setTreble] = useState(1)
  const [compression, setCompression] = useState(25)
  const [reverb, setReverb] = useState(0)
  const [echo, setEcho] = useState(0)
  const [bgColor, setBgColor] = useState('#111111')
  const [bgImage, setBgImage] = useState('')

  useEffect(() => () => { void audioContextRef.current?.close() }, [])

  useEffect(() => {
    const video = videoRef.current
    if (video) video.playbackRate = speed
  }, [speed, videoUrl])

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
    setVideoUrl(URL.createObjectURL(file)); setFileName(file.name); setDuration(0); setTrimStart(0); setTrimEnd(0); setCurrentTime(0); setPlaying(false)
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
      source.connect(bassNode).connect(trebleNode).connect(compressor)
      compressor.connect(dryGain).connect(outputGain)
      compressor.connect(convolver).connect(reverbGain).connect(outputGain)
      compressor.connect(delay).connect(echoGain).connect(outputGain)
      delay.connect(echoFeedback).connect(delay)
      outputGain.connect(context.destination)
      audioContextRef.current = context; bassNodeRef.current = bassNode; trebleNodeRef.current = trebleNode; compressorRef.current = compressor
      outputGainRef.current = outputGain; reverbGainRef.current = reverbGain; echoGainRef.current = echoGain; echoFeedbackRef.current = echoFeedback
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
    if (!video) return
    await ensureAudio()
    if (video.paused) {
      if (video.currentTime < trimStart || video.currentTime >= trimEnd) video.currentTime = trimStart
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
    if (trimEnd > trimStart && video.currentTime >= trimEnd) { video.pause(); video.currentTime = trimStart }
    setCurrentTime(video.currentTime)
  }

  const presetFilter = useMemo(() => {
    if (filterPreset === 'Vivid') return 'sepia(.08)'
    if (filterPreset === 'Warm') return 'sepia(.22) hue-rotate(-8deg)'
    if (filterPreset === 'Cool') return 'sepia(.08) hue-rotate(165deg)'
    if (filterPreset === 'Mono') return 'grayscale(1)'
    return ''
  }, [filterPreset])
  const filterStyle = `${presetFilter} brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`

  return <main className="app">
    <header className="topbar"><div><strong>AKB Studio</strong><span>Offline Video + Voice Studio</span></div><button className="export" disabled title="Reliable local export is the next milestone"><Download size={18}/><span>Export</span></button></header>
    <section className="workspace">
      <div className="previewPanel">
        {!videoUrl ? <label className="emptyState"><Upload size={40}/><b>Import a video</b><span>Your media stays on this device</span><input type="file" accept="video/*" onChange={importVideo}/></label> : <>
          <div className="stage" style={{ backgroundColor: bgColor, backgroundImage: bgImage ? `url(${bgImage})` : undefined }}>
            <video ref={videoRef} src={videoUrl} playsInline style={{ filter: filterStyle, transform: `rotate(${rotation}deg)` }} onLoadedMetadata={event => { const length = event.currentTarget.duration; setDuration(length); setTrimEnd(length) }} onTimeUpdate={updateTime} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}/>
          </div>
          <div className="transport"><button onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={20}/> : <Play size={20}/>}</button><input className="scrubber" aria-label="Video position" type="range" min={0} max={duration || 1} step="0.01" value={currentTime} onChange={event => seek(Number(event.target.value))}/><span className="timecode">{formatTime(currentTime)} / {formatTime(duration)}</span></div>
          <div className="fileRow"><span className="filename">{fileName}</span><label>Replace<input type="file" accept="video/*" onChange={importVideo}/></label></div>
        </>}
      </div>
      <aside className="panel">
        <nav className="tabs"><button className={tab === 'edit' ? 'active' : ''} onClick={() => setTab('edit')}><Scissors/>Edit</button><button className={tab === 'filter' ? 'active' : ''} onClick={() => setTab('filter')}><SlidersHorizontal/>Adjust</button><button className={tab === 'voice' ? 'active' : ''} onClick={() => setTab('voice')}><Mic2/>Voice</button><button className={tab === 'background' ? 'active' : ''} onClick={() => setTab('background')}><ImageIcon/>BG</button></nav>
        <div className="controls">
          {tab === 'edit' && <><section className="card"><h2>Trim preview</h2><p>Move the playhead, then set the start or end. Playback stays inside the selected section.</p></section><div className="trimReadout"><span>Start <b>{formatTime(trimStart)}</b></span><span>End <b>{formatTime(trimEnd)}</b></span></div><div className="buttonRow"><button className="secondary" disabled={!videoUrl} onClick={() => setTrimStart(Math.min(currentTime, Math.max(0, trimEnd - 0.1)))}>Set start</button><button className="secondary" disabled={!videoUrl} onClick={() => setTrimEnd(Math.min(duration, Math.max(currentTime, trimStart + 0.1)))}>Set end</button></div><Slider label="Speed" value={speed} setValue={setSpeed} min={0.5} max={2} step={0.05} suffix="×"/><label className="field">Rotate <button className="iconButton" onClick={() => setRotation(value => (value + 90) % 360)}><RotateCcw size={18}/>{rotation}°</button></label></>}
          {tab === 'filter' && <><div className="presetGrid compact">{filterPresets.map(preset => <button key={preset} className={filterPreset === preset ? 'selected' : ''} onClick={() => setFilterPreset(preset)}>{preset}</button>)}</div><Slider label="Brightness" value={brightness} setValue={setBrightness} min={50} max={150}/><Slider label="Contrast" value={contrast} setValue={setContrast} min={50} max={150}/><Slider label="Saturation" value={saturation} setValue={setSaturation} min={0} max={180}/><button className="secondary" onClick={() => { setBrightness(100); setContrast(100); setSaturation(100); setFilterPreset('None') }}>Reset adjustments</button></>}
          {tab === 'voice' && <><section className="card"><h2><Volume2 size={17}/>Live voice preview</h2><p>Natural singing presets use EQ, compression and real local reverb. Nothing is uploaded.</p></section><div className="presetGrid">{voicePresets.map(preset => <button key={preset} className={voicePreset === preset ? 'selected' : ''} onClick={() => void chooseVoicePreset(preset)}>{preset}</button>)}</div><Slider label="Loudness" value={gain} setValue={setGain} min={50} max={150} suffix="%"/><Slider label="Bass" value={bass} setValue={setBass} min={-10} max={10} suffix=" dB"/><Slider label="Treble" value={treble} setValue={setTreble} min={-10} max={10} suffix=" dB"/><Slider label="Compression" value={compression} setValue={setCompression} min={0} max={100} suffix="%"/><Slider label="Reverb" value={reverb} setValue={setReverb} min={0} max={70} suffix="%"/><Slider label="Echo" value={echo} setValue={setEcho} min={0} max={65} suffix="%"/></>}
          {tab === 'background' && <><section className="card"><h2>Background canvas</h2><p>Color and image canvas are ready. Person cutout comes later with local segmentation.</p></section><label className="field">Canvas color<input type="color" value={bgColor} onChange={event => setBgColor(event.target.value)}/></label><label className="secondary uploadBg">Choose image<input type="file" accept="image/*" onChange={importBackground}/></label>{bgImage && <button className="secondary" onClick={() => { URL.revokeObjectURL(bgImage); setBgImage('') }}>Remove image</button>}</>}
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

function Slider({ label, value, setValue, min, max, step = 1, suffix = '' }: { label: string; value: number; setValue: (value: number) => void; min: number; max: number; step?: number; suffix?: string }) {
  return <label className="slider"><span>{label}<b>{Number.isInteger(value) ? value : value.toFixed(2)}{suffix}</b></span><input type="range" min={min} max={max} step={step} value={value} onChange={event => setValue(Number(event.target.value))}/></label>
}
