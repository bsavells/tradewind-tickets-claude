import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Mail } from 'lucide-react'
import { GradientBar, Wordmark } from '@/components/Branding'

const schema = z.object({
  email: z.string().email('Enter a valid email'),
})
type Form = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: Form) {
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) setError(error.message)
    else setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen tw-grid-bg tw-atmospheric relative overflow-hidden">
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex flex-col items-center gap-3">
            <Wordmark size="lg" orientation="vertical" />
          </div>

          <div className="relative bg-card rounded-xl shadow-[0_4px_24px_-8px_rgba(10,30,61,0.15)] overflow-hidden">
            <GradientBar />
            <div className="p-7">
              <div className="mb-6">
                <h1 className="text-xl font-bold text-[var(--color-tw-navy)] mb-1">
                  Reset password
                </h1>
                <p className="text-sm text-muted-foreground">
                  {sent
                    ? 'Check your email for a reset link.'
                    : "Enter your email and we'll send you a reset link."}
                </p>
              </div>

              {sent ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="h-14 w-14 rounded-full bg-[var(--color-tw-blue)]/10 flex items-center justify-center">
                    <Mail className="h-6 w-6 text-[var(--color-tw-blue)]" />
                  </div>
                  <p className="text-sm text-center text-muted-foreground">
                    If an account exists for that email, a reset link has been sent.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="tw-label">Email</Label>
                    <Input id="email" type="email" {...register('email')} />
                    {errors.email && (
                      <p className="text-xs text-destructive">{errors.email.message}</p>
                    )}
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" className="w-full font-semibold tracking-wide" disabled={loading}>
                    {loading ? 'Sending…' : 'Send reset link'}
                  </Button>
                </form>
              )}
            </div>
          </div>

          <Link
            to="/login"
            className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-[var(--color-tw-navy)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
