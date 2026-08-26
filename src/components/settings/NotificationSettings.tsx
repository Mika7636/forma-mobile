// The Notifications section of Settings.
//
// Owns the toggles and time pickers; persistence is the parent's job (it merges
// into the debounced profile write). Actual (re)scheduling is deliberately NOT
// done here — `useNotificationSync` in RootNavigator watches
// profile.notificationPreferences and reconciles the OS schedule whenever it
// changes, so there is exactly one place that talks to the scheduler and no way
// for a toggle to leave a stale notification behind.
import { useState } from 'react'
import { Alert, Linking, Pressable, Switch, Text, View } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { haptics } from '../../utils/haptics'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { COLORS } from '../../constants/theme'
import {
  getPermissionState,
  requestPermissions,
  sendTestNotification,
} from '../../services/notificationService'
import type { NotificationPreferences } from '../../types/notifications'

interface NotificationSettingsProps {
  value: NotificationPreferences
  onChange: (next: NotificationPreferences) => void
  onToast: (message: string) => void
}

/** 18, 0 → "6:00 PM", using the device's locale conventions. */
function formatTime(hour: number, minute: number): string {
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function timeAsDate(hour: number, minute: number): Date {
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return d
}

export default function NotificationSettings({
  value,
  onChange,
  onToast,
}: NotificationSettingsProps) {
  const [picker, setPicker] = useState<'daily' | 'weekly' | null>(null)
  const [testing, setTesting] = useState(false)

  /** Master switch. Turning it on may need the OS permission first. */
  const handleMaster = async (next: boolean) => {
    haptics.light()
    if (!next) {
      onChange({ ...value, enabled: false })
      onToast('Notifications turned off')
      return
    }

    const granted = await requestPermissions()
    if (!granted) {
      // Android only shows its dialog once; after that the only route is the
      // system settings page, so say so rather than silently failing.
      Alert.alert(
        'Notifications are blocked',
        'FORMA needs notification permission from your device settings before it can remind you.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => void Linking.openSettings() },
        ],
      )
      return
    }
    onChange({ ...value, enabled: true })
    onToast('Notifications on')
  }

  const toggle = (patch: Partial<NotificationPreferences>) => {
    haptics.selection()
    onChange({ ...value, ...patch })
  }

  const handleTest = async () => {
    if (testing) return
    setTesting(true)
    haptics.medium()
    try {
      const permission = await getPermissionState()
      if (permission !== 'granted') {
        const granted = await requestPermissions()
        if (!granted) {
          Alert.alert(
            'Notifications are blocked',
            'Enable notifications for FORMA in your device settings to see the test.',
            [
              { text: 'Not now', style: 'cancel' },
              { text: 'Open Settings', onPress: () => void Linking.openSettings() },
            ],
          )
          return
        }
      }
      await sendTestNotification()
      haptics.success()
      onToast('Test sent — pull down the notification shade')
    } catch {
      haptics.error()
      onToast('Could not send the test notification')
    } finally {
      setTesting(false)
    }
  }

  const onPickTime = (event: { type: string }, date?: Date) => {
    const which = picker
    setPicker(null)
    if (event.type === 'dismissed' || !date || !which) return
    haptics.selection()
    if (which === 'daily') {
      onChange({
        ...value,
        dailyReminder: {
          ...value.dailyReminder,
          hour: date.getHours(),
          minute: date.getMinutes(),
        },
      })
    } else {
      onChange({ ...value, weeklySummary: { ...value.weeklySummary, hour: date.getHours() } })
    }
  }

  return (
    <View>
      {/* Master */}
      <Row
        title="Enable Notifications"
        subtitle="Reminders, conflict alerts, streaks and weekly reviews"
        value={value.enabled}
        onValueChange={(v) => void handleMaster(v)}
        emphasis
      />

      {value.enabled ? (
        <Animated.View entering={FadeInDown.duration(180)}>
          <Divider />

          <Row
            title="Daily Training Reminder"
            subtitle="A nudge at your chosen time, skipped in spirit if you've already trained"
            value={value.dailyReminder.enabled}
            onValueChange={(v) =>
              toggle({ dailyReminder: { ...value.dailyReminder, enabled: v } })
            }
          />
          {value.dailyReminder.enabled ? (
            <TimeRow
              label="Remind me at"
              time={formatTime(value.dailyReminder.hour, value.dailyReminder.minute)}
              onPress={() => {
                haptics.light()
                setPicker('daily')
              }}
            />
          ) : null}

          <Divider />

          <Row
            title="Conflict Alerts"
            subtitle="Warn me immediately when a session risks injury"
            value={value.conflictAlerts}
            onValueChange={(v) => toggle({ conflictAlerts: v })}
          />

          <Divider />

          <Row
            title="Weekly Summary"
            subtitle="Sunday evening recap of the week you trained"
            value={value.weeklySummary.enabled}
            onValueChange={(v) =>
              toggle({ weeklySummary: { ...value.weeklySummary, enabled: v } })
            }
          />
          {value.weeklySummary.enabled ? (
            <TimeRow
              label="Sundays at"
              time={formatTime(value.weeklySummary.hour, 0)}
              onPress={() => {
                haptics.light()
                setPicker('weekly')
              }}
            />
          ) : null}

          <Divider />

          <Row
            title="Streak Celebrations"
            subtitle="Cheer me on at 3, 5, 7, 14 and 30 days"
            value={value.streakCelebrations}
            onValueChange={(v) => toggle({ streakCelebrations: v })}
          />

          <Divider />

          <Row
            title="Streak Reminders"
            subtitle="Nudge me at 8 PM only if a 3+ day streak is about to break"
            value={value.streakReminders}
            onValueChange={(v) => toggle({ streakReminders: v })}
          />
        </Animated.View>
      ) : null}

      {/* Test — instant proof the whole pipeline works. */}
      <Pressable
        onPress={() => void handleTest()}
        disabled={testing}
        accessibilityRole="button"
        accessibilityLabel="Send a test notification"
        style={{
          marginTop: 18,
          height: 50,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1.5,
          borderColor: COLORS.teal,
          backgroundColor: COLORS.tealSoft,
          opacity: testing ? 0.6 : 1,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.tealDark }}>
          🔔 Send Test Notification
        </Text>
      </Pressable>
      <Text
        style={{
          marginTop: 8,
          fontSize: 12,
          lineHeight: 17,
          color: COLORS.subtle,
          textAlign: 'center',
        }}
      >
        Fires straight away so you can check notifications reach this device.
      </Text>

      {picker ? (
        <DateTimePicker
          value={
            picker === 'daily'
              ? timeAsDate(value.dailyReminder.hour, value.dailyReminder.minute)
              : timeAsDate(value.weeklySummary.hour, 0)
          }
          mode="time"
          onChange={onPickTime}
        />
      ) : null}
    </View>
  )
}

/* ------------------------------------------------------------------ */

function Row({
  title,
  subtitle,
  value,
  onValueChange,
  emphasis,
}: {
  title: string
  subtitle: string
  value: boolean
  onValueChange: (v: boolean) => void
  emphasis?: boolean
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
        <Text
          style={{
            fontSize: emphasis ? 16 : 15,
            fontWeight: emphasis ? '800' : '700',
            color: COLORS.ink,
          }}
        >
          {title}
        </Text>
        <Text style={{ marginTop: 2, fontSize: 13, lineHeight: 17, color: COLORS.muted }}>
          {subtitle}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: COLORS.border, true: COLORS.teal }}
        thumbColor={COLORS.ink}
        ios_backgroundColor={COLORS.border}
      />
    </View>
  )
}

function TimeRow({
  label,
  time,
  onPress,
}: {
  label: string
  time: string
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${time}. Change time.`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: COLORS.fieldBg,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 4,
      }}
    >
      <Text style={{ fontSize: 14, color: COLORS.body }}>{label}</Text>
      <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.teal }}>{time}</Text>
    </Pressable>
  )
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 2 }} />
}
