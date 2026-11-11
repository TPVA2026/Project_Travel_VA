import { useEffect, useRef, useState } from 'react'
import { INTRO_AIRPLANE, INTRO_CLOUD, INTRO_TOTAL_MS } from './introAssets.js'

function preload(src) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      if (typeof img.decode === 'function') {
        img.decode().then(resolve, resolve)
      } else {
        resolve()
      }
    }
    img.onerror = resolve
    img.src = src
  })
}

export default function FlightIntro({ onDone }) {
  const [isFlying, setIsFlying] = useState(false)
  const doneRef = useRef(false)
  const onDoneRef = useRef(onDone)

  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (reduce) {
      doneRef.current = true
      onDoneRef.current?.()
      return undefined
    }

    let cancelled = false
    let started = false
    let timer = null

    const start = () => {
      if (cancelled || started) return
      started = true
      setIsFlying(true)
      document.body.classList.add('intro-flying')
      timer = window.setTimeout(() => {
        if (doneRef.current) return
        doneRef.current = true
        document.body.classList.remove('intro-flying')
        onDoneRef.current?.()
      }, INTRO_TOTAL_MS)
    }

    const fallback = window.setTimeout(start, 1600)
    Promise.all([preload(INTRO_AIRPLANE), preload(INTRO_CLOUD)]).then(start)

    return () => {
      cancelled = true
      window.clearTimeout(fallback)
      if (timer) window.clearTimeout(timer)
      document.body.classList.remove('intro-flying')
    }
  }, [])

  return (
    <div className={`flight-intro${isFlying ? ' is-flying' : ''}`} aria-hidden="true">
      <div className="flight-intro-sky" />
      <div className="flight-intro-cloud">
        <img src={INTRO_CLOUD} alt="" draggable="false" />
      </div>
      <div className="flight-intro-plane">
        <img src={INTRO_AIRPLANE} alt="" draggable="false" />
      </div>
    </div>
  )
}
