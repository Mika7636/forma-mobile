// Tests for the recommendation engine.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  allocateShares,
  computeRecoveryStatus,
  computeWeeklyPlan,
  recoveryWindowDays,
  shapeSession,
  suggestConflictResolution,
  RECOMMENDER_MIN_TRAINING_DAYS,
  SPORT_SHARE_CAP,
  type Placement,
  type RecommenderInput,
  type RecommenderProfile,
  type SportScore,
  type SuggestedSession,
} from './recommender'
import { overlapWeight } from './sportInteractions'
import { ACWR_CEILING, ACWR_FLOOR, DEFAULT_SPORT_INTERACTIONS } from '../constants/training'
import type { Session, SportType } from '../types/session'

const NOW = new Date('2026-09-02T10:00:00')

let nextId = 0

function session(
  sport: SportType,
  daysAgo: number,
  opts: { rpe?: number; minutes?: number } = {},
): Session {
  const rpe = opts.rpe ?? 6
  const minutes = opts.minutes ?? 60
  const d = new Date(NOW)
  d.setDate(d.getDate() - daysAgo)
  d.setHours(12, 0, 0, 0)
  return {
    id: `s${nextId++}`,
    userId: 'u1',
    sport,
    date: d.toISOString(),
    durationMinutes: minutes,
    rpe,
    loadScore: minutes * rpe,
    createdAt: d.toISOString(),
  }
}

const profile = (sports: SportType[]): RecommenderProfile => ({
  sports,
  sportInteractions: { ...DEFAULT_SPORT_INTERACTIONS },
})

function history(
  sports: SportType[],
  days: number,
  opts: { startDaysAgo?: number; rpe?: number; minutes?: number } = {},
): Session[] {
  const start = opts.startDaysAgo ?? 1
  const out: Session[] = []
  for (let i = 0; i < days; i++) {
    out.push(session(sports[i % sports.length], start + i, opts))
  }
  return out
}

function input(over: Partial<RecommenderInput> & Pick<RecommenderInput, 'sessions'>): RecommenderInput {
  return {
    profile: profile(['running', 'cycling', 'swimming']),
    metrics: { ctl: 50, atl: 50 },
    now: NOW,
    ...over,
  }
}

function dayOf(iso: string): number {
  const d = new Date(`${iso}T12:00:00`)
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000)
}

describe('load budget', () => {
  test('a fatigued athlete is aimed at the floor', () => {
    const plan = computeWeeklyPlan(
      input({ sessions: history(['running', 'cycling'], 20), metrics: { ctl: 40, atl: 70 } }),
    )

    assert.equal(plan.status, 'ok')
    if (plan.status !== 'ok') return

    assert.equal(plan.budget.stance, 'fatigued')
    assert.equal(plan.budget.maintenanceLoad, 280)
    assert.equal(plan.budget.floor, Math.round(280 * ACWR_FLOOR))
    assert.equal(plan.budget.target, plan.budget.floor)
    assert.ok(
      plan.budget.target < plan.budget.maintenanceLoad,
      'a fatigued week must come in under maintenance',
    )
    assert.match(plan.budget.reason, /-30/)
    assert.match(plan.budget.reason, new RegExp(String(plan.budget.floor)))
  })

  test('a detraining athlete is aimed above maintenance', () => {
    const sessions = [
      ...history(['running', 'cycling'], 16, { startDaysAgo: 15 }),
      session('running', 3, { rpe: 3, minutes: 20 }),
      session('running', 10, { rpe: 3, minutes: 20 }),
    ]
    const plan = computeWeeklyPlan(input({ sessions, metrics: { ctl: 50, atl: 10 } }))

    assert.equal(plan.status, 'ok')
    if (plan.status !== 'ok') return

    assert.equal(plan.budget.stance, 'detraining')
    assert.ok(
      plan.budget.target > plan.budget.maintenanceLoad,
      `detraining target ${plan.budget.target} must exceed maintenance ${plan.budget.maintenanceLoad}`,
    )
    assert.ok(plan.budget.target <= plan.budget.ceiling, 'and must stay inside the ceiling')
    assert.match(plan.budget.reason, /under your \d+ AU floor/)
  })

  test('an athlete training normally is aimed at maintenance', () => {
    const sessions = history(['running', 'cycling', 'swimming'], 21, { rpe: 7, minutes: 60 })
    const plan = computeWeeklyPlan(input({ sessions, metrics: { ctl: 50, atl: 48 } }))

    assert.equal(plan.status, 'ok')
    if (plan.status !== 'ok') return
    assert.equal(plan.budget.stance, 'maintain')
    assert.equal(plan.budget.target, plan.budget.maintenanceLoad)
  })

  test('bounds are the shared acute:chronic range, not a local copy', () => {
    const plan = computeWeeklyPlan(input({ sessions: history(['running', 'cycling'], 20) }))
    assert.equal(plan.status, 'ok')
    if (plan.status !== 'ok') return
    assert.equal(plan.budget.floor, Math.round(plan.budget.maintenanceLoad * ACWR_FLOOR))
    assert.equal(plan.budget.ceiling, Math.round(plan.budget.maintenanceLoad * ACWR_CEILING))
  })
})

describe('allocation', () => {
  test('allocated load lands within 5% of the target', () => {
    const mixes: SportType[][] = [
      ['running', 'cycling', 'swimming'],
      ['combat', 'running', 'gym'],
      ['football', 'strength'],
      ['running', 'cycling', 'swimming', 'gym', 'combat'],
    ]

    for (const sports of mixes) {
      for (const ctl of [20, 35, 50, 65, 80, 110]) {
        const plan = computeWeeklyPlan({
          sessions: history(sports, 20, { rpe: 6, minutes: 60 }),
          profile: profile(sports),
          metrics: { ctl, atl: ctl },
          now: NOW,
        })

        assert.equal(plan.status, 'ok')
        if (plan.status !== 'ok') continue
        assert.ok(plan.sessions.length > 0, `no sessions for ${sports.join('+')} @ CTL ${ctl}`)

        const drift = Math.abs(plan.allocatedLoad - plan.budget.target) / plan.budget.target

        if (plan.budgetFit === 'below_minimum') {
          assert.equal(plan.sessions.length, 1, 'an over-budget plan is a single session')
          assert.ok(plan.allocatedLoad > plan.budget.target, 'below_minimum must overshoot')
          continue
        }
        if (plan.budgetFit === 'above_capacity') {
          assert.ok(plan.allocatedLoad < plan.budget.target, 'above_capacity must undershoot')
          continue
        }

        assert.ok(
          drift <= 0.05,
          `${sports.join('+')} @ CTL ${ctl}: allocated ${plan.allocatedLoad} vs target ` +
            `${plan.budget.target} — ${(drift * 100).toFixed(1)}% off`,
        )
      }
    }
  })

  test('suggests 3 or 4 sessions when the budget can carry them', () => {
    const plan = computeWeeklyPlan(
      input({ sessions: history(['running', 'cycling', 'swimming'], 20), metrics: { ctl: 60, atl: 60 } }),
    )
    assert.equal(plan.status, 'ok')
    if (plan.status !== 'ok') return

    assert.ok(plan.sessions.length >= 3 && plan.sessions.length <= 4, `got ${plan.sessions.length}`)
    assert.equal(plan.budgetFit, 'on_target')
    for (const s of plan.sessions) {
      assert.ok(s.dayOffset >= 1 && s.dayOffset <= 7, `day offset ${s.dayOffset} out of horizon`)
    }
  })

  test('a small budget is split into fewer, still-realistic sessions', () => {
    const plan = computeWeeklyPlan(
      input({ sessions: history(['running', 'swimming'], 20), metrics: { ctl: 20, atl: 20 } }),
    )
    assert.equal(plan.status, 'ok')
    if (plan.status !== 'ok') return

    assert.ok(plan.sessions.length < 3, `expected a short plan, got ${plan.sessions.length}`)
    assert.ok(plan.sessions.length >= 1, 'but not an empty one')
    for (const s of plan.sessions) {
      assert.ok(s.durationMinutes >= 20, `${s.durationMinutes} min is not a real session`)
    }
    assert.equal(plan.budgetFit, 'on_target')
    const drift = Math.abs(plan.allocatedLoad - plan.budget.target) / plan.budget.target
    assert.ok(drift <= 0.05, `small-budget plan drifted ${(drift * 100).toFixed(1)}%`)
  })

  test('a budget the athlete cannot carry in their own sports is declared, not fudged', () => {
    const plan = computeWeeklyPlan(
      input({
        sessions: history(['swimming'], 20),
        profile: profile(['swimming']),
        metrics: { ctl: 160, atl: 160 },
      }),
    )
    assert.equal(plan.status, 'ok')
    if (plan.status !== 'ok') return
    assert.equal(plan.budgetFit, 'above_capacity')
    assert.ok(plan.allocatedLoad < plan.budget.target)
    assert.ok(plan.sessions.length >= 1, 'it still suggests what it can')
  })

  test('every session multiplies back to its own load', () => {
    const plan = computeWeeklyPlan(input({ sessions: history(['running', 'combat', 'gym'], 20) }))
    assert.equal(plan.status, 'ok')
    if (plan.status !== 'ok') return

    for (const s of plan.sessions) {
      assert.equal(s.durationMinutes * s.rpe, s.load, `${s.sport} sRPE does not reconcile`)
      assert.ok(s.rpe >= 1 && s.rpe <= 10, `RPE ${s.rpe} out of range`)
      assert.ok(s.durationMinutes >= 20, `${s.durationMinutes} min is not a real session`)
    }
  })

  test('conflicting sports never land on adjacent days', () => {
    const mixes: SportType[][] = [
      ['combat', 'running', 'football'],
      ['gym', 'strength', 'running'],
      ['combat', 'running', 'gym', 'strength'],
    ]

    for (const sports of mixes) {
      for (const ctl of [30, 55, 90]) {
        const plan = computeWeeklyPlan({
          sessions: history(sports, 20, { rpe: 6 }),
          profile: profile(sports),
          metrics: { ctl, atl: ctl },
          now: NOW,
        })
        assert.equal(plan.status, 'ok')
        if (plan.status !== 'ok') continue

        for (let i = 0; i < plan.sessions.length; i++) {
          for (let j = i + 1; j < plan.sessions.length; j++) {
            const a: SuggestedSession = plan.sessions[i]
            const b: SuggestedSession = plan.sessions[j]
            const level = DEFAULT_SPORT_INTERACTIONS[[a.sport, b.sport].sort().join('_')] ?? 0
            const gap = Math.abs(dayOf(a.date) - dayOf(b.date))

            assert.ok(gap > 0, `${a.sport} and ${b.sport} were placed on the same day`)
            if (level >= 2) {
              assert.ok(
                gap >= 2,
                `${sports.join('+')} @ CTL ${ctl}: ${a.sport} (${a.date}) and ${b.sport} ` +
                  `(${b.date}) are level-${level} but only ${gap} day(s) apart`,
              )
            }
          }
        }
      }
    }
  })

  test('a hard recent session pushes its overlapping sport later in the week', () => {
    const sessions = [
      ...history(['running', 'cycling'], 18, { startDaysAgo: 3 }),
      session('combat', 1, { rpe: 9, minutes: 60 }),
    ]
    const plan = computeWeeklyPlan({
      sessions,
      profile: profile(['running', 'combat', 'cycling']),
      metrics: { ctl: 50, atl: 50 },
      now: NOW,
    })
    assert.equal(plan.status, 'ok')
    if (plan.status !== 'ok') return

    const run = plan.sessions.find((s) => s.sport === 'running')
    if (run) {
      const window = recoveryWindowDays(overlapWeight('running', 'combat', DEFAULT_SPORT_INTERACTIONS), 9)
      assert.ok(
        run.dayOffset >= window - 1,
        `running suggested at +${run.dayOffset} but combat needs ${window} days from yesterday`,
      )
    }
  })

  test('every reason interpolates a figure the plan actually returned', () => {
    const plan = computeWeeklyPlan(input({ sessions: history(['running', 'cycling', 'swimming'], 20) }))
    assert.equal(plan.status, 'ok')
    if (plan.status !== 'ok') return

    for (const s of plan.sessions) {
      assert.ok(s.reason.length > 0, 'a suggestion with no reason is not explainable')
      assert.match(s.reason, /\d/, `reason carries no figure: "${s.reason}"`)
      assert.ok(s.reason.endsWith('.'), `reason is not a sentence: "${s.reason}"`)
      assert.ok(
        ['recovery', 'balance', 'freshness'].includes(s.drivenBy),
        `unknown driver ${s.drivenBy}`,
      )
    }
  })

  test('reasons never claim a level-0 overlap or mis-pluralise a day', () => {
    const mixes: SportType[][] = [
      ['running', 'cycling', 'swimming'],
      ['swimming'],
      ['combat', 'running'],
      ['gym', 'strength', 'cycling'],
    ]
    for (const sports of mixes) {
      for (const ctl of [30, 55, 90]) {
        const plan = computeWeeklyPlan({
          sessions: history(sports, 20),
          profile: profile(sports),
          metrics: { ctl, atl: ctl },
          now: NOW,
        })
        if (plan.status !== 'ok') continue
        for (const s of plan.sessions) {
          assert.ok(!s.reason.includes('level-0'), `level-0 overlap claimed: "${s.reason}"`)
          assert.ok(!/1 days/.test(s.reason), `mis-pluralised: "${s.reason}"`)
          assert.ok(!/0 days/.test(s.reason), `zero-day spacing claimed: "${s.reason}"`)
        }
      }
    }
  })

  test('"lowest" is only claimed by the sport that actually holds the minimum', () => {
    const sports: SportType[] = ['running', 'cycling', 'swimming', 'gym']
    for (const ctl of [35, 55, 85]) {
      const plan = computeWeeklyPlan({
        sessions: history(sports, 20),
        profile: profile(sports),
        metrics: { ctl, atl: ctl },
        now: NOW,
      })
      if (plan.status !== 'ok') continue
      const minDebt = Math.min(...plan.scores.map((sc) => sc.recoveryDebt))
      for (const s of plan.sessions) {
        if (!s.reason.startsWith('Lowest conflicting fatigue')) continue
        const score: SportScore = plan.scores.find((sc) => sc.sport === s.sport)!
        assert.ok(
          score.recoveryDebt <= minDebt,
          `${s.sport} claims the lowest debt at ${score.recoveryDebt} but the minimum is ${minDebt}`,
        )
      }
    }
  })

  test('an untrained sport is ranked up by balance and freshness', () => {
    const sessions = history(['running', 'cycling'], 20)
    const plan = computeWeeklyPlan({
      sessions,
      profile: profile(['running', 'cycling', 'swimming']),
      metrics: { ctl: 50, atl: 50 },
      now: NOW,
    })
    assert.equal(plan.status, 'ok')
    if (plan.status !== 'ok') return

    const swim = plan.scores.find((s) => s.sport === 'swimming')!
    assert.equal(swim.balanceDeficit, 1, 'a never-trained sport is maximally under-trained')
    assert.equal(swim.freshness, 1, 'and maximally fresh')
    assert.equal(swim.daysSinceLastTrained, null)
    assert.equal(plan.scores[0].sport, 'swimming', 'so it should rank first')
  })
})

describe('allocation shape', () => {
  const place = (sports: SportType[]): Placement[] =>
    sports.map((sport, i) => ({ sport, dayIndex: i, spacedFrom: null }))

  test('the allocator never gives one sport more than its share', () => {
    const weights: Record<string, number> = { combat: 0.9, running: 0.3, gym: 0.3 }
    const placements = place(['combat', 'running', 'gym'])
    const shares = allocateShares(placements, (p) => weights[p.sport] ?? 0.01)

    const total = shares.reduce((a, b) => a + b, 0)
    assert.ok(Math.abs(total - 1) < 1e-9, `shares must spend the week, summed to ${total}`)
    assert.ok(
      shares[0] <= SPORT_SHARE_CAP + 1e-9,
      `combat took ${(shares[0] * 100).toFixed(1)}% despite the cap`,
    )
    assert.ok(shares[1] > 0.25 && shares[2] > 0.25, 'the excess is redistributed, not dropped')
  })

  test('two placements of one sport are capped together, not separately', () => {
    const weights: Record<string, number> = { gym: 0.9, running: 0.2 }
    const placements = place(['gym', 'gym', 'running'])
    const shares = allocateShares(placements, (p) => weights[p.sport] ?? 0.01)

    const gym = shares[0] + shares[1]
    assert.ok(gym <= 0.5 + 1e-9, `gym took ${(gym * 100).toFixed(1)}% across two sessions`)
    assert.ok(Math.abs(shares.reduce((a, b) => a + b, 0) - 1) < 1e-9)
  })

  test('the cap lifts only as far as an even split when sports are few', () => {
    for (const [sports, expected] of [
      [['running'], 1],
      [['running', 'gym'], 0.5],
      [['running', 'gym', 'combat'], SPORT_SHARE_CAP],
      [['running', 'gym', 'combat', 'swimming'], SPORT_SHARE_CAP],
    ] as [SportType[], number][]) {
      const shares = allocateShares(place(sports), () => 1)
      const worst = Math.max(...shares)
      assert.ok(
        worst <= expected + 1e-9,
        `${sports.length} sports: worst share ${(worst * 100).toFixed(1)}% exceeds ${(expected * 100).toFixed(0)}%`,
      )
      assert.ok(Math.abs(shares.reduce((a, b) => a + b, 0) - 1) < 1e-9)
    }
  })

  test('no sport runs away with the finished plan either', () => {
    const mixes: SportType[][] = [
      ['running', 'cycling', 'swimming'],
      ['combat', 'running', 'gym'],
      ['football', 'strength'],
      ['running', 'cycling', 'swimming', 'gym', 'combat'],
    ]

    for (const sports of mixes) {
      for (const ctl of [35, 50, 65, 80, 110]) {
        const plan = computeWeeklyPlan({
          sessions: history(sports, 20, { rpe: 6, minutes: 60 }),
          profile: profile(sports),
          metrics: { ctl, atl: ctl },
          now: NOW,
        })
        if (plan.status !== 'ok' || plan.budgetFit !== 'on_target') continue

        const bySport = new Map<string, number>()
        for (const s of plan.sessions) bySport.set(s.sport, (bySport.get(s.sport) ?? 0) + s.load)
        if (bySport.size < 2) continue

        const limit = Math.max(SPORT_SHARE_CAP, 1 / bySport.size)
        for (const [sport, load] of bySport) {
          const share: number = load / plan.budget.target
          assert.ok(
            share <= limit + 0.12,
            `${sports.join('+')} @ CTL ${ctl}: ${sport} took ${(share * 100).toFixed(0)}%, ` +
              `well past the ${(limit * 100).toFixed(0)}% cap`,
          )
        }
      }
    }
  })

  test('shapeSession honours an RPE ceiling, and ignores it when absent', () => {
    for (const sport of ['running', 'combat', 'gym', 'cycling'] as const) {
      const free = shapeSession(sport, 600)
      const capped = shapeSession(sport, 600, 6)
      assert.ok(capped.rpe <= 6, `${sport} ignored the ceiling at RPE ${capped.rpe}`)
      assert.ok(capped.durationMinutes > 0, `${sport} produced no session under the ceiling`)
      assert.equal(capped.durationMinutes * capped.rpe, capped.load)
      assert.ok(free.rpe >= capped.rpe, `${sport}: the ceiling should never raise intensity`)
    }
    assert.ok(shapeSession('combat', 700).rpe > 6)
  })

  test('a fatigued week lowers intensity, not only volume', () => {
    const plan = computeWeeklyPlan(
      input({
        sessions: history(['running', 'combat', 'gym'], 20, { rpe: 7, minutes: 60 }),
        profile: profile(['running', 'combat', 'gym']),
        metrics: { ctl: 60, atl: 90 },
      }),
    )

    assert.equal(plan.status, 'ok')
    if (plan.status !== 'ok') return
    assert.equal(plan.budget.stance, 'fatigued')
    assert.ok(plan.sessions.length > 0, 'a fatigued week is still a week')

    for (const s of plan.sessions) {
      assert.ok(
        s.rpe <= 6,
        `${s.sport} suggested at RPE ${s.rpe} while the hero says the athlete is overreaching`,
      )
      assert.equal(s.durationMinutes * s.rpe, s.load)
      assert.ok(s.durationMinutes >= 20, `${s.durationMinutes} min is not a real session`)
    }
  })

  test('the ceiling does not leak into a healthy week', () => {
    const plan = computeWeeklyPlan(
      input({
        sessions: history(['running', 'combat', 'gym'], 20, { rpe: 6, minutes: 60 }),
        profile: profile(['running', 'combat', 'gym']),
        metrics: { ctl: 110, atl: 105 },
      }),
    )
    assert.equal(plan.status, 'ok')
    if (plan.status !== 'ok') return
    assert.notEqual(plan.budget.stance, 'fatigued')
    assert.ok(
      plan.sessions.some((s) => s.rpe > 6),
      'a non-fatigued week should still be allowed a hard session',
    )
  })
})

describe('recovery windows', () => {
  test('the window is derived from the matrix and intensity, not flat', () => {
    const m = DEFAULT_SPORT_INTERACTIONS
    const w = (a: SportType, b: SportType) => overlapWeight(a, b, m)

    assert.equal(recoveryWindowDays(w('swimming', 'running'), 10), 0)

    assert.equal(recoveryWindowDays(w('running', 'cycling'), 7), 2)

    assert.equal(recoveryWindowDays(w('running', 'cycling'), 4), 0)

    const hard = recoveryWindowDays(w('running', 'combat'), 9)
    assert.ok(hard >= 4 && hard <= 5, `expected a long but capped window, got ${hard}`)

    let previous = -1
    for (const rpe of [3, 5, 6, 7, 8, 9, 10]) {
      const days = recoveryWindowDays(w('running', 'combat'), rpe)
      assert.ok(days >= previous, `window shrank from RPE ${rpe - 1} to ${rpe}`)
      previous = days
    }
  })

  test('a sport with nothing outstanding reads ready', () => {
    const sessions = history(['running', 'cycling'], 20, { startDaysAgo: 10, rpe: 5 })
    const statuses = computeRecoveryStatus(
      input({ sessions, profile: profile(['running', 'cycling']) }),
    )
    for (const s of statuses) {
      assert.equal(s.status, 'ready', `${s.sport} should be clear: ${s.reason}`)
    }
  })

  test('a hard session blocks the overlapping sport and names itself', () => {
    const blocker = session('combat', 1, { rpe: 9, minutes: 60 })
    const sessions = [...history(['cycling'], 18, { startDaysAgo: 4, rpe: 4 }), blocker]

    const statuses = computeRecoveryStatus({
      sessions,
      profile: profile(['running', 'combat', 'cycling']),
      metrics: { ctl: 50, atl: 50 },
      now: NOW,
    })

    const running = statuses.find((s) => s.sport === 'running')!
    assert.equal(running.status, 'recovering')
    if (running.status !== 'recovering') return

    assert.equal(running.blockedBy.sessionId, blocker.id, 'must name the session holding it back')
    assert.equal(running.blockedBy.sport, 'combat')
    assert.equal(running.blockedBy.interactionLevel, 3)
    assert.ok(running.daysRemaining > 0)
    assert.ok(dayOf(running.readyOn) > dayOf(new Date(NOW).toISOString().slice(0, 10)))
    assert.match(running.reason, /level-3/)
    assert.match(running.reason, /RPE 9/)
    assert.match(running.reason, new RegExp(`${running.blockedBy.windowDays} days`))

    const combat = statuses.find((s) => s.sport === 'combat')!
    assert.equal(combat.status, 'recovering', 'a hard session must block its own sport too')

    const cycling = statuses.find((s) => s.sport === 'cycling')!
    if (cycling.status === 'recovering' && running.status === 'recovering') {
      assert.ok(
        cycling.daysRemaining <= running.daysRemaining,
        'a weaker overlap must not need longer than a stronger one',
      )
    }
  })
})

describe('conflict resolution', () => {
  const flagged = {
    sport: 'running' as SportType,
    date: new Date(NOW).toISOString().slice(0, 10),
    intensity: 7,
    durationMinutes: 60,
  }

  test('offers a reschedule that actually clears, and a substitute', () => {
    const sessions = [
      ...history(['cycling'], 18, { startDaysAgo: 4, rpe: 4 }),
      session('combat', 1, { rpe: 9, minutes: 60 }),
    ]
    const resolutions = suggestConflictResolution(flagged, {
      sessions,
      profile: profile(['running', 'combat', 'cycling', 'swimming']),
      metrics: { ctl: 50, atl: 50 },
      now: NOW,
    })

    assert.ok(resolutions.length > 0, 'a flagged session must get at least one way out')
    assert.ok(resolutions.length <= 2, 'at most two alternatives')

    const reschedule = resolutions.find((r) => r.kind === 'reschedule')
    assert.ok(reschedule, 'expected a reschedule option')
    if (reschedule?.kind === 'reschedule') {
      assert.ok(reschedule.daysMoved >= 1)
      assert.ok(dayOf(reschedule.date) > dayOf(flagged.date), 'must move forward')
      const recheck = computeRecoveryStatus({
        sessions,
        profile: profile(['running']),
        metrics: { ctl: 50, atl: 50 },
        now: new Date(`${reschedule.date}T10:00:00`),
      })
      assert.equal(recheck[0].status, 'ready', 'the suggested day must actually clear the clash')
      assert.match(reschedule.reason, /level-3/)
    }

    const substitute = resolutions.find((r) => r.kind === 'substitute')
    assert.ok(substitute, 'expected a substitute option')
    if (substitute?.kind === 'substitute') {
      assert.equal(substitute.date, flagged.date, 'a substitute keeps the day')
      assert.equal(substitute.replaces, 'running')
      assert.notEqual(substitute.sport, 'running')
      assert.equal(substitute.durationMinutes * substitute.rpe, substitute.load)
      const replaced = overlapWeight('running', 'combat', DEFAULT_SPORT_INTERACTIONS)
      assert.ok(
        substitute.overlap < replaced,
        `substitute overlap ${substitute.overlap} is not below running's ${replaced}`,
      )
      const planned = flagged.durationMinutes * flagged.intensity
      assert.ok(
        Math.abs(substitute.load - planned) / planned <= 0.25,
        `substitute load ${substitute.load} strays too far from ${planned}`,
      )
    }
  })

  test('a session with nothing conflicting gets no substitute invented', () => {
    const sessions = history(['cycling'], 20, { startDaysAgo: 8, rpe: 4 })
    const resolutions = suggestConflictResolution(flagged, {
      sessions,
      profile: profile(['running', 'cycling']),
      metrics: { ctl: 50, atl: 50 },
      now: NOW,
    })
    assert.ok(
      !resolutions.some((r) => r.kind === 'substitute'),
      'nothing is blocking, so there is nothing to substitute away from',
    )
  })
})

describe('insufficient-data guard', () => {
  const thin = history(['running', 'cycling'], RECOMMENDER_MIN_TRAINING_DAYS - 1)

  test('computeWeeklyPlan refuses below the training-day bar', () => {
    const plan = computeWeeklyPlan(input({ sessions: thin }))
    assert.equal(plan.status, 'insufficient_data')
    if (plan.status !== 'insufficient_data') return
    assert.equal(plan.trainingDays, RECOMMENDER_MIN_TRAINING_DAYS - 1)
    assert.equal(plan.required, RECOMMENDER_MIN_TRAINING_DAYS)
    assert.match(plan.reason, /13 of 14 training days/)
  })

  test('computeRecoveryStatus refuses, once per sport', () => {
    const sports: SportType[] = ['running', 'cycling', 'swimming']
    const statuses = computeRecoveryStatus(input({ sessions: thin, profile: profile(sports) }))
    assert.equal(statuses.length, sports.length)
    for (const s of statuses) {
      assert.equal(s.status, 'insufficient_data')
      if (s.status !== 'insufficient_data') continue
      assert.equal(s.required, RECOMMENDER_MIN_TRAINING_DAYS)
    }
  })

  test('suggestConflictResolution refuses', () => {
    const resolutions = suggestConflictResolution(
      { sport: 'running', date: '2026-09-02', intensity: 7 },
      input({ sessions: thin }),
    )
    assert.equal(resolutions.length, 1)
    assert.equal(resolutions[0].kind, 'insufficient_data')
  })

  test('the bar is distinct training days, not session count', () => {
    const crammed: Session[] = []
    for (let i = 0; i < 30; i++) crammed.push(session('running', i % 5))
    const plan = computeWeeklyPlan(input({ sessions: crammed }))
    assert.equal(plan.status, 'insufficient_data')
    if (plan.status !== 'insufficient_data') return
    assert.equal(plan.trainingDays, 5)
  })

  test('exactly at the bar, the engine answers', () => {
    const plan = computeWeeklyPlan(input({ sessions: history(['running', 'cycling'], RECOMMENDER_MIN_TRAINING_DAYS) }))
    assert.equal(plan.status, 'ok')
  })

  test('zero fitness is refused rather than budgeted at zero', () => {
    const plan = computeWeeklyPlan(input({ sessions: history(['running'], 20), metrics: { ctl: 0, atl: 0 } }))
    assert.equal(plan.status, 'insufficient_data')
  })
})

describe('purity', () => {
  test('the same input returns the same plan', () => {
    const sessions = history(['running', 'cycling', 'combat'], 20)
    const a = computeWeeklyPlan(input({ sessions }))
    const b = computeWeeklyPlan(input({ sessions }))
    assert.deepEqual(a, b)
  })

  test('the input array is not mutated', () => {
    const sessions = history(['running', 'cycling'], 20)
    const before = JSON.stringify(sessions)
    computeWeeklyPlan(input({ sessions }))
    computeRecoveryStatus(input({ sessions }))
    suggestConflictResolution({ sport: 'running', date: '2026-09-02', intensity: 7 }, input({ sessions }))
    assert.equal(JSON.stringify(sessions), before)
  })

  test('session shaping stays inside realistic bounds', () => {
    for (const sport of ['running', 'cycling', 'swimming', 'combat', 'gym', 'strength', 'football'] as SportType[]) {
      for (const load of [100, 250, 400, 600, 900, 1500]) {
        const shaped = shapeSession(sport, load)
        assert.equal(shaped.durationMinutes * shaped.rpe, shaped.load)
        assert.ok(shaped.rpe >= 1 && shaped.rpe <= 10, `${sport}: RPE ${shaped.rpe}`)
        assert.ok(shaped.durationMinutes >= 20, `${sport}: ${shaped.durationMinutes} min`)
        assert.equal(shaped.durationMinutes % 5, 0, 'durations land on a five-minute grid')
      }
    }
  })
})
