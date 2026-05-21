'use client'

import { useRef, useCallback } from 'react'

interface Props {
  children: React.ReactNode
  className?: string
  intensity?: number
}

export function Tilt3D({ children, className = '', intensity = 10 }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const raf = useRef<number>(0)

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width - 0.5
      const y = (e.clientY - r.top) / r.height - 0.5
      el.style.transform = `perspective(900px) rotateY(${x * intensity}deg) rotateX(${-y * intensity}deg) translateZ(8px)`
      el.style.setProperty('--gx', `${(x + 0.5) * 100}%`)
      el.style.setProperty('--gy', `${(y + 0.5) * 100}%`)
    })
  }, [intensity])

  const onLeave = useCallback(() => {
    cancelAnimationFrame(raf.current)
    const el = ref.current
    if (!el) return
    el.style.transform = 'perspective(900px) rotateY(0deg) rotateX(0deg) translateZ(0px)'
    el.style.setProperty('--gx', '50%')
    el.style.setProperty('--gy', '50%')
  }, [])

  return (
    <div
      ref={ref}
      className={`tilt-3d ${className}`}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ '--gx': '50%', '--gy': '50%' } as React.CSSProperties}
    >
      {children}
      <div className="tilt-gloss" aria-hidden="true" />
    </div>
  )
}
