import { useState } from 'react'
import { Bell, CheckCircle, Mail, Zap, Clock, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  useNotificationPrefs,
  useUpsertNotificationPref,
  useUpdateDigestHour,
  useSendTestEmail,
  type EmailFrequency,
} from '@/hooks/useNotifications'
import { useAuth } from '@/contexts/AuthContext'

// ── Pref definitions per role ────────────────────────────────────────────────
const ADMIN_PREFS = [
  {
    key: 'on_submit',
    label: 'New ticket submitted',
    description: 'When a technician submits a ticket for review, or requests a return on a finalized ticket.',
  },
]

const TECH_PREFS = [
  {
    key: 'on_return',
    label: 'Ticket returned',
    description: 'When an admin returns one of your tickets for revision.',
  },
  {
    key: 'on_finalize',
    label: 'Ticket finalized',
    description: 'When an admin finalizes one of your tickets.',
  },
]

// ── Digest hour options (display in CT) ──────────────────────────────────────
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const label = i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`
  return { value: i, label }
})

// ── Email frequency selector ─────────────────────────────────────────────────
const FREQ_OPTIONS: { value: EmailFrequency; label: string; icon: React.ElementType; description: string }[] = [
  { value: 'off',       label: 'Off',           icon: Bell,         description: 'No email' },
  { value: 'immediate', label: 'Immediate',      icon: Zap,          description: 'Email right away' },
  { value: 'digest',    label: 'Daily Digest',   icon: Clock,        description: 'Batched once a day' },
]

function FreqSelector({
  value,
  onChange,
  saving,
}: {
  value: EmailFrequency
  onChange: (v: EmailFrequency) => void
  saving: boolean
}) {
  return (
    <div className="flex gap-1.5">
      {FREQ_OPTIONS.map(opt => {
        const Icon = opt.icon
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            disabled={saving}
            onClick={() => onChange(opt.value)}
            title={opt.description}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground border-primary'
                : 'text-muted-foreground border-border hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Icon className="h-3 w-3" />
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export function NotificationPrefsPage() {
  const { profile, isAdmin } = useAuth()
  const prefs = useNotificationPrefs(profile?.id)
  const upsert = useUpsertNotificationPref()
  const updateDigestHour = useUpdateDigestHour()
  const sendTest = useSendTestEmail()

  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const prefDefs = isAdmin ? ADMIN_PREFS : TECH_PREFS
  const prefMap = prefs.data ?? {}

  const digestHour: number = (profile as unknown as { digest_hour?: number })?.digest_hour ?? 17

  const anyDigest = prefDefs.some(def => {
    const p = prefMap[def.key]
    return p ? p.email_frequency === 'digest' : false
  })

  async function handleFreqChange(key: string, freq: EmailFrequency) {
    if (!profile) return
    setSavingKey(key)
    const current = prefMap[key]
    await upsert.mutateAsync({
      user_id: profile.id,
      key,
      email_frequency: freq,
      in_app_enabled: current?.in_app_enabled ?? true,
    })
    setSavingKey(null)
  }

  async function handleInAppChange(key: string, enabled: boolean) {
    if (!profile) return
    setSavingKey(key)
    const current = prefMap[key]
    await upsert.mutateAsync({
      user_id: profile.id,
      key,
      email_frequency: current?.email_frequency ?? 'immediate',
      in_app_enabled: enabled,
    })
    setSavingKey(null)
  }

  async function handleDigestHourChange(hour: number) {
    await updateDigestHour.mutateAsync(hour)
  }

  async function handleSendTest() {
    setTestStatus('sending')
    try {
      await sendTest.mutateAsync()
      setTestStatus('sent')
      setTimeout(() => setTestStatus('idle'), 4000)
    } catch {
      setTestStatus('error')
      setTimeout(() => setTestStatus('idle'), 4000)
    }
  }

  if (prefs.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Notification Preferences</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Control which notifications you receive and how they're delivered.
        </p>
      </div>

      {/* Pref rows */}
      <div className="space-y-3">
        {prefDefs.map(def => {
          const p = prefMap[def.key]
          const emailFreq: EmailFrequency = p?.email_frequency ?? 'immediate'
          const inApp: boolean = p?.in_app_enabled ?? true
          const saving = savingKey === def.key

          return (
            <div key={def.key} className="rounded-lg border bg-card p-4 space-y-4">
              <div>
                <p className="font-medium text-sm">{def.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{def.description}</p>
              </div>

              <div className="grid gap-3">
                {/* In-app toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                    <Label className="text-sm cursor-pointer">In-app notifications</Label>
                  </div>
                  <Switch
                    checked={inApp}
                    disabled={saving}
                    onCheckedChange={v => handleInAppChange(def.key, v)}
                  />
                </div>

                {/* Email frequency */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 pt-1">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    <Label className="text-sm">Email</Label>
                  </div>
                  <FreqSelector
                    value={emailFreq}
                    onChange={v => handleFreqChange(def.key, v)}
                    saving={saving}
                  />
                </div>
              </div>

              {saving && (
                <p className="text-xs text-muted-foreground">Saving…</p>
              )}
            </div>
          )
        })}
      </div>

      {/* Daily digest settings — shown when at least one pref is set to digest */}
      {anyDigest && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div>
            <p className="font-medium text-sm">Daily Digest Settings</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your digest email will be sent once a day at the time below. All times are Central Time.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select
              value={String(digestHour)}
              onValueChange={v => handleDigestHourChange(Number(v))}
              disabled={updateDigestHour.isPending}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOUR_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">Central Time</span>
            {updateDigestHour.isPending && (
              <span className="text-xs text-muted-foreground">Saving…</span>
            )}
          </div>
        </div>
      )}

      {/* Test email */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div>
          <p className="font-medium text-sm">Test email delivery</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Send a test email to <span className="font-medium">{profile?.email}</span> to confirm delivery is working.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={handleSendTest}
          disabled={testStatus === 'sending'}
        >
          {testStatus === 'sending' ? (
            <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : testStatus === 'sent' ? (
            <CheckCircle className="h-3.5 w-3.5 text-green-600" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          {testStatus === 'sending' ? 'Sending…' : testStatus === 'sent' ? 'Sent!' : testStatus === 'error' ? 'Failed — try again' : 'Send test email'}
        </Button>
        {testStatus === 'error' && (
          <p className="text-xs text-destructive">
            Email delivery failed. Check that SendGrid is configured correctly on the server.
          </p>
        )}
      </div>
    </div>
  )
}
