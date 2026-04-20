import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GradientBar, Wordmark } from '@/components/Branding'

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})
type LoginForm = z.infer<typeof loginSchema>

export function LoginPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<React.ReactNode | null>(null)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(data: LoginForm) {
    setLoading(true)
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })
    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('active')
        .eq('id', user.id)
        .single()
      if (profile && !profile.active) {
        await supabase.auth.signOut()
        setError(
          <>
            Your account has been deactivated. Please contact{' '}
            <a href="mailto:it@tradewindcontrols.com" className="underline decoration-[var(--color-tw-blue)]">
              it@tradewindcontrols.com
            </a>
            {' '}if you believe this is a mistake.
          </>
        )
        setLoading(false)
        return
      }
    }

    navigate('/')
  }

  return (
    <div className="min-h-screen tw-grid-bg tw-atmospheric relative overflow-hidden">
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm space-y-8">
          {/* Brand lockup */}
          <div className="flex flex-col items-center gap-3">
            <Wordmark size="lg" orientation="vertical" showTagline />
          </div>

          {/* Card */}
          <div className="relative bg-card rounded-xl shadow-[0_4px_24px_-8px_rgba(10,30,61,0.15)] overflow-hidden">
            <GradientBar />
            <div className="p-7">
              <div className="mb-6">
                <h1 className="text-xl font-bold text-[var(--color-tw-navy)] mb-1">
                  Sign in
                </h1>
                <p className="text-sm text-muted-foreground">
                  Access your work tickets.
                </p>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="tw-label">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    {...register('email')}
                  />
                  {errors.email && (
                    <p className="text-xs text-destructive">{errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="tw-label">Password</Label>
                    <Link
                      to="/forgot-password"
                      className="text-xs text-[var(--color-tw-blue)] hover:underline underline-offset-2"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    {...register('password')}
                  />
                  {errors.password && (
                    <p className="text-xs text-destructive">{errors.password.message}</p>
                  )}
                </div>

                {error && (
                  <p className="text-sm text-destructive text-center">{error}</p>
                )}

                <Button
                  type="submit"
                  className="w-full font-semibold tracking-wide"
                  disabled={loading}
                >
                  {loading ? 'Signing in…' : 'Sign in'}
                </Button>
              </form>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center space-y-1">
            <p className="tw-label text-[10px]">Tradewind Controls</p>
            <p className="text-[11px] text-muted-foreground">
              Automation, Measurement, &amp; SCADA
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
