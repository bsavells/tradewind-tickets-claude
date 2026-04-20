import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle2 } from 'lucide-react'
import { GradientBar, Wordmark } from '@/components/Branding'

const schema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine(d => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
type Form = z.infer<typeof schema>

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [done, setDone] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) })

  // Accept both password-reset flows and invitation flows:
  //   - Password reset:  Supabase fires PASSWORD_RECOVERY
  //   - Invitation:      Supabase fires SIGNED_IN (inviteUserByEmail signs the
  //                      user in when they click the link)
  // Also check the current session on mount in case the auth state change
  // already fired before our subscription was set up.
  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled && session) setReady(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || (session && event === 'INITIAL_SESSION')) {
        setReady(true)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  async function onSubmit(data: Form) {
    setServerError(null)
    const { error } = await supabase.auth.updateUser({ password: data.password })
    if (error) {
      setServerError(error.message)
    } else {
      setDone(true)
      setTimeout(async () => {
        await supabase.auth.signOut()
        navigate('/login')
      }, 2500)
    }
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
                  Set new password
                </h1>
                <p className="text-sm text-muted-foreground">
                  {done
                    ? 'Password updated — redirecting to sign in…'
                    : !ready
                    ? 'Verifying your link…'
                    : 'Choose a new password for your account.'}
                </p>
              </div>

              {done && (
                <div className="flex flex-col items-center gap-2 py-4 text-green-600">
                  <CheckCircle2 className="h-10 w-10" />
                  <p className="text-sm font-medium">Password updated successfully!</p>
                </div>
              )}

              {!ready && !done && (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-[var(--color-tw-blue)] border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {ready && !done && (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="tw-label">New Password</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="new-password"
                      {...register('password')}
                    />
                    {errors.password && (
                      <p className="text-xs text-destructive">{errors.password.message}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="confirmPassword" className="tw-label">Confirm Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      {...register('confirmPassword')}
                    />
                    {errors.confirmPassword && (
                      <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
                    )}
                  </div>

                  {serverError && (
                    <p className="text-sm text-destructive">{serverError}</p>
                  )}

                  <Button type="submit" className="w-full font-semibold tracking-wide" disabled={isSubmitting}>
                    {isSubmitting ? 'Updating…' : 'Set Password'}
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
