import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { Upload, Scissors, SlidersHorizontal, Mic2, Image as ImageIcon, Download, Play, Pause } from 'lucide-react'

type Tab = 'edit' | 'filter' | 'voice' | 'background'
type VoicePreset = 'Raw Clean' | 'Studio' | 'Unplugged' | 'Warm' | 'Clear Vocal' | 'Echo' | 'Reverb'

const presets: VoicePreset[] = ['Raw Clean', 'Studio', 'Unplugged', 'Warm', 'Clear Vocal', 'Echo', 'Reverb']

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const lowRef = useRef<BiquadFilterNode | null>(null)
  const highRef = useRef<BiquadFilterNode | null>(null)
  const compRef = useRef<DynamicsCompressorNode | null>(null)
  const delayRef = useRef<DelayNode | null>(null)
  const delayGainRef = useRef<GainNode | null>(null)
  const wetRef = useRef<GainNode | null>(null)

  const [videoUrl, setVideoUrl] = useState('')
  const [fileName, setFileName] = useState('')
  const [tab, setTab] = useState<Tab>('edit')
  const [playing, setPlaying] = useState(false)
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [saturation, setSaturation] = useState(100)
  const [voice, setVoice] = useState<VoicePreset>('Raw Clean')
  const [bgColor, setBgColor] = useState('#111111')
  const [bgImage, setBgImage] = useState('')

  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    if (bgImage) URL.revokeObjectURL(bgImage)
  }, [videoUrl, bgImage])

  const importVideo = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    setVideoUrl(URL.createObjectURL(file))
    setFileName(file.name)
    setPlaying(false)
  }

  const importBackground = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (bgImage) URL.revokeObjectURL(bgImage)
    setBgImage(URL.createObjectURL(file))
  }

  const ensureAudio = async () => {
    const video = videoRef.current
    if (!video) return
    if (!audioContextRef.current) {
      const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      audioContextRef.current = ctx
      const source = ctx.createMediaElementSource(video)
      const low = ctx.createBiquadFilter()
      low.type = 'lowshelf'
      low.frequency.value = 180
      const high = ctx.createBiquadFilter()
      high.type = 'highshelf'
      high.frequency.value = 3500
      const comp = ctx.createDynamicsCompressor()
      const delay = ctx.createDelay(1)
      const delayGain = ctx.createGain()
      const wet = ctx.createGain()
      const dry = ctx.createGain()

      source.connect(low).connect(high).connect(comp)
      comp.connect(dry).connect(ctx.destination)
      comp.connect(delay).connect(delayGain).connect(wet).connect(ctx.destination)
      delayGain.connect(delay)

      sourceRef.current = source
      lowRef.current = low
      highRef.current = high
      compRef.current = comp
      delayRef.current = delay
      delayGainRef.current = delayGain
      wetRef.current = wet
    }
    if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume()
    applyVoicePreset(voice)
  }

  const applyVoicePreset = (preset: VoicePreset) => {
    setVoice(preset)
    const low = lowRef.current
    const high = highRef.current
    const comp = compRef.current
    const delay = delayRef.current
    const feedback = delayGainRef.current
    const wet = wetRef.current
    if (!low || !high || !comp || !delay || !feedback || !wet) return

    low.gain.value = 0
    high.gain.value = 0
    comp.threshold.value = -18
    comp.ratio.value = 3
    comp.attack.value = 0.01
    comp.release.value = 0.2
    delay.delayTime.value = 0.08
    feedback.gain.value = 0
    wet.gain.value = 0

    if (preset === 'Studio') { low.gain.value = 2; high.gain.value = 3; comp.threshold.value = -22; comp.ratio.value = 4 }
    if (preset === 'Unplugged') { low.gain.value = 1.5; high.gain.value = 1.5; comp.threshold.value = -20; comp.ratio.value = 2.5; delay.delayTime.value = 0.055; feedback.gain.value = 0.12; wet.gain.value = 0.12 }
    if (preset === 'Warm') { low.gain.value = 4; high.gain.value = -1; comp.threshold.value = -20 }
    if (preset === 'Clear Vocal') { low.gain.value = -1; high.gain.value = 5; comp.threshold.value = -24; comp.ratio.value = 4.5 }
    if (preset === 'Echo') { delay.delayTime.value = 0.24; feedback.gain.value = 0.35; wet.gain.value = 0.45 }
    if (preset === 'Reverb') { delay.delayTime.value = 0.06; feedback.gain.value = 0.42; wet.gain.value = 0.32 }
  }

  const togglePlay = async () => {
    const video = videoRef.current
    if (!video) return
    await ensureAudio()
    if (video.paused) await video.play()
    else video.pause()
  }

  const filterStyle = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`

  return (
    <main className="app">
      <header className="topbar">
        <div><strong>AKB Studio</strong><span>Local Video + Voice Studio</span></div>
        <button className="export" disabled title="Edited export is the next build milestone"><Download size={18}/> Export</button>
      </header>

      <section className="workspace">
        <div className="previewPanel">
          {!videoUrl ? (
            <label className="emptyState">
              <Upload size={40}/><b>Import a video</b><span>Your media stays on this device.</span>
              <input type="file" accept="video/*" onChange={importVideo}/>
            </label>
          ) : (
            <>
              <div className="stage" style={{ backgroundColor: bgColor, backgroundImage: bgImage ? `url(${bgImage})` : undefined }}>
                <video ref={videoRef} src={videoUrl} playsInline style={{ filter: filterStyle }} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
              </div>
              <div className="transport">
                <button onClick={togglePlay}>{playing ? <Pause size={20}/> : <Play size={20}/>}</button>
                <span className="filename">{fileName}</span>
              </div>
            </>
          )}
        </div>

        <aside className="panel">
          <nav className="tabs">
            <button className={tab==='edit'?'active':''} onClick={() => setTab('edit')}><Scissors/>Edit</button>
            <button className={tab==='filter'?'active':''} onClick={() => setTab('filter')}><SlidersHorizontal/>Adjust</button>
            <button className={tab==='voice'?'active':''} onClick={() => setTab('voice')}><Mic2/>Voice</button>
            <button className={tab==='background'?'active':''} onClick={() => setTab('background')}><ImageIcon/>BG</button>
          </nav>

          <div className="controls">
            {tab === 'edit' && <div className="card"><h2>Quick Edit</h2><p>V1 foundation is ready for local preview. Trim, split and rendered export are the next implementation step.</p></div>}
            {tab === 'filter' && <>
              <Slider label="Brightness" value={brightness} setValue={setBrightness}/>
              <Slider label="Contrast" value={contrast} setValue={setContrast}/>
              <Slider label="Saturation" value={saturation} setValue={setSaturation}/>
              <button className="secondary" onClick={() => {setBrightness(100);setContrast(100);setSaturation(100)}}>Reset</button>
            </>}
            {tab === 'voice' && <div className="presetGrid">{presets.map(p => <button key={p} className={voice===p?'selected':''} onClick={async () => {await ensureAudio(); applyVoicePreset(p)}}>{p}</button>)}</div>}
            {tab === 'background' && <>
              <div className="card"><h2>Background</h2><p>Color and image canvas are working now. Person cutout replacement will be added with local segmentation so it can remain subscription-free.</p></div>
              <label className="field">Canvas color<input type="color" value={bgColor} onChange={e=>setBgColor(e.target.value)}/></label>
              <label className="secondary uploadBg">Choose image<input type="file" accept="image/*" onChange={importBackground}/></label>
              {bgImage && <button className="secondary" onClick={() => {URL.revokeObjectURL(bgImage);setBgImage('')}}>Remove image</button>}
            </>}
          </div>
        </aside>
      </section>
    </main>
  )
}

function Slider({label, value, setValue}:{label:string,value:number,setValue:(v:number)=>void}) {
  return <label className="slider"><span>{label}<b>{value}</b></span><input type="range" min="50" max="150" value={value} onChange={e=>setValue(Number(e.target.value))}/></label>
}
