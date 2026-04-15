import { useRef, useImperativeHandle, forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface SignaturePadRef {
  clear: () => void
  isEmpty: () => boolean
  toBlob: () => Promise<Blob>
}

interface SignaturePadProps {
  className?: string
}

export const SignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(
  function SignaturePad({ className }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const drawing = useRef(false)
    const hasStrokes = useRef(false)

    function getCtx() {
      const canvas = canvasRef.current!
      const ctx = canvas.getContext('2d')!
      ctx.strokeStyle = '#111827'
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      return { ctx, canvas }
    }

    function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
      const rect = canvasRef.current!.getBoundingClientRect()
      return {
        x: (e.clientX - rect.left) * (canvasRef.current!.width / rect.width),
        y: (e.clientY - rect.top) * (canvasRef.current!.height / rect.height),
      }
    }

    function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
      e.preventDefault()
      drawing.current = true
      hasStrokes.current = true
      canvasRef.current!.setPointerCapture(e.pointerId)
      const { ctx } = getCtx()
      const pos = getPos(e)
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
    }

    function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!drawing.current) return
      e.preventDefault()
      const { ctx } = getCtx()
      const pos = getPos(e)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
    }

    function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
      e.preventDefault()
      drawing.current = false
    }

    useImperativeHandle(ref, () => ({
      clear() {
        const { ctx, canvas } = getCtx()
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        hasStrokes.current = false
      },
      isEmpty() {
        return !hasStrokes.current
      },
      toBlob() {
        return new Promise<Blob>((resolve, reject) => {
          canvasRef.current!.toBlob(
            blob => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))),
            'image/png'
          )
        })
      },
    }))

    return (
      <canvas
        ref={canvasRef}
        width={600}
        height={200}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={cn(
          'w-full touch-none border rounded-md bg-white cursor-crosshair',
          className
        )}
        style={{ height: '160px' }}
      />
    )
  }
)
