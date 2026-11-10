import { useEffect, useRef } from 'react'

const PALETTE = [
  '#f6d9a8',
  '#f5b942',
  '#e8a33d',
  '#a45b28',
  '#7fc8a9',
  '#1f7a4d',
  '#ffffff',
]

const GRAVITY = 0.05
const DRAG = 0.986

function randomBetween(min, max) {
  return min + Math.random() * (max - min)
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)]
}

function withAlpha(hex, alpha) {
  const clean = hex.replace('#', '')
  const value = parseInt(
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean,
    16
  )
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export default function Fireworks({ active, onDone, duration = 5200 }) {
  const canvasRef = useRef(null)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    if (!active) return undefined

    const canvas = canvasRef.current
    if (!canvas) return undefined

    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduceMotion) {
      const timer = window.setTimeout(() => onDoneRef.current?.(), 500)
      return () => window.clearTimeout(timer)
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      onDoneRef.current?.()
      return undefined
    }

    let width = 0
    let height = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    window.addEventListener('resize', resize)

    const rockets = []
    const particles = []
    const startedAt = performance.now()
    const launchUntil = duration * 0.52
    const launchGap = 230

    let lastLaunch = startedAt - launchGap
    let lastFrame = startedAt
    let raf = 0
    let finished = false
    let sideToggle = false

    const spawnParticles = (x, y, color) => {
      const count = Math.round(randomBetween(42, 62))
      const base = Math.random() * Math.PI * 2
      for (let i = 0; i < count; i += 1) {
        const angle = base + (i / count) * Math.PI * 2 + randomBetween(-0.14, 0.14)
        const speed = randomBetween(1.4, 6.4)
        const life = randomBetween(48, 92)
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life,
          maxLife: life,
          size: randomBetween(1, 2.4),
          color: Math.random() < 0.28 ? '#ffffff' : color,
        })
      }
      const sparkCount = Math.round(randomBetween(6, 10))
      for (let i = 0; i < sparkCount; i += 1) {
        const angle = Math.random() * Math.PI * 2
        const speed = randomBetween(0.4, 1.6)
        const life = randomBetween(28, 52)
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life,
          maxLife: life,
          size: randomBetween(1.6, 3),
          color: '#f6d9a8',
        })
      }
    }

    const launch = () => {
      sideToggle = !sideToggle
      const fromLeft = sideToggle
      const startX = fromLeft
        ? width * randomBetween(0.015, 0.08)
        : width * randomBetween(0.92, 0.985)
      const startY = height + 10
      const targetX = fromLeft
        ? width * randomBetween(0.24, 0.58)
        : width * randomBetween(0.42, 0.76)
      const targetY = height * randomBetween(0.14, 0.42)
      const travelFrames = randomBetween(40, 66)

      rockets.push({
        x: startX,
        y: startY,
        vx: (targetX - startX) / travelFrames,
        vy: (targetY - startY) / travelFrames,
        age: 0,
        travelFrames,
        color: pick(PALETTE),
      })
    }

    const draw = (now) => {
      const delta = Math.min(now - lastFrame, 48)
      lastFrame = now
      const dt = delta / 16.6667

      ctx.clearRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'lighter'

      if (now - startedAt < launchUntil && now - lastLaunch >= launchGap) {
        launch()
        lastLaunch = now
      }

      for (let i = rockets.length - 1; i >= 0; i -= 1) {
        const rocket = rockets[i]
        rocket.x += rocket.vx * dt
        rocket.y += rocket.vy * dt
        rocket.age += dt

        ctx.strokeStyle = withAlpha(rocket.color, 0.9)
        ctx.lineWidth = 2.2
        ctx.beginPath()
        ctx.moveTo(rocket.x - rocket.vx * 3.2, rocket.y - rocket.vy * 3.2)
        ctx.lineTo(rocket.x, rocket.y)
        ctx.stroke()

        if (rocket.age >= rocket.travelFrames) {
          spawnParticles(rocket.x, rocket.y, rocket.color)
          rockets.splice(i, 1)
        }
      }

      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i]
        p.vx *= DRAG
        p.vy = p.vy * DRAG + GRAVITY * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.life -= dt

        if (p.life <= 0 || p.y > height + 60) {
          particles.splice(i, 1)
          continue
        }

        const alpha = Math.max(0, Math.min(1, p.life / p.maxLife))
        ctx.strokeStyle = withAlpha(p.color, alpha)
        ctx.lineWidth = p.size
        ctx.beginPath()
        ctx.moveTo(p.x - p.vx * 2.6, p.y - p.vy * 2.6)
        ctx.lineTo(p.x, p.y)
        ctx.stroke()

        if (p.size > 1.9 && alpha > 0.45) {
          ctx.fillStyle = withAlpha(p.color, alpha * 0.85)
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size * 0.7, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      ctx.globalCompositeOperation = 'source-over'

      const elapsed = now - startedAt
      const settled = elapsed > launchUntil + 600 && rockets.length === 0 && particles.length === 0

      if (settled || elapsed >= duration) {
        finished = true
        onDoneRef.current?.()
        return
      }

      raf = window.requestAnimationFrame(draw)
    }

    raf = window.requestAnimationFrame(draw)

    return () => {
      window.removeEventListener('resize', resize)
      window.cancelAnimationFrame(raf)
      if (!finished) {
        ctx.clearRect(0, 0, width, height)
      }
    }
  }, [active, duration])

  if (!active) return null

  return (
    <canvas
      ref={canvasRef}
      className="fireworks-canvas"
      aria-hidden="true"
      role="presentation"
    />
  )
}
