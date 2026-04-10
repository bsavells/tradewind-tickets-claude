import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Wind, CheckCircle2 } from 'lucide-react'

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

  useEffect(() => {
    // Supabase JS processes the #access_token hash and fires PASSWORD_RECOVERY
    // when the link comes from a password reset email.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
    return () => subscription.unsubscribe()
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
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex items-center gap-2">
            <Wind className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold tracking-tight">Tradewind</span>
          </div>
          <p className="text-muted-foreground text-sm">Work Ticket System</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Set new password</CardTitle>
            <CardDescription>
              {done
                ? 'Password updated — redirecting to sign in…'
                : !ready
                ? 'Verifying your reset link…'
                : 'Choose a new password for your account.'}
            </CardDescription>
          </CardHeader>

          {done && (
            <CardContent>
              <div className="flex flex-col items-center gap-2 py-4 text-green-600">
                <CheckCircle2 className="h-8 w-8" />
                <p className="text-sm font-medium">Password updated successfully!</p>
              </div>
            </CardContent>
          )}

          {ready && !done && (
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password">New Password</Label>
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
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
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

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? 'Updating…' : 'Set Password'}
                </Button>
              </form>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  )
}
