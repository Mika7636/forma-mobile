import type { FormTone } from '../theme/tokens'

export interface FormStatus {
  status: string
  /** Which of the hero's six fills this state uses. See `Palette.hero`. */
  color: FormTone
  message: string
}

export function calculateForm(ctl: number, atl: number): number {
  return ctl - atl
}

/**
 * The athlete's current state, named from Form as a *fraction of* CTL.
 *
 * This used to be a ladder of absolute cut-offs — -20, -10, 0, +5, +15 — taken
 * from TrainingPeaks' Training Stress Balance bands. Those numbers are
 * calibrated for TSS, where an hour at threshold scores ~100 and a
 * well-trained athlete's CTL sits around 50-100. FORMA does not measure load in
 * TSS: it measures session RPE, minutes x RPE(1-10), so a single hard
 * 90-minute session scores ~720 and a consistently training athlete's CTL runs
 * well past 150. Against a number that size, a Form of +15 is noise, so
 * essentially every established athlete cleared the top cut-off and read
 * "Peaked / Optimal for competition" permanently — including, on the demo
 * account, directly beneath an unresolved High Injury Risk conflict warning.
 *
 * The fix is to judge Form relative to the fitness it is measured against, so
 * the bands scale with the athlete rather than assuming a unit system the app
 * does not use. The ratios below are the old absolute thresholds re-expressed
 * against a CTL of 80 — the mid-point of the TSS-era CTL range they were
 * written for — so an athlete at that scale reads exactly as before:
 *
 *   -20 / 80 = -0.25     -10 / 80 = -0.125
 *    +5 / 80 =  0.0625     +15 / 80 =  0.1875
 *
 * `calculateForm` is unchanged and the number on the card is still CTL - ATL;
 * only the label and colour derive from the ratio.
 */
export function getFormStatus(form: number, ctl: number): FormStatus {
  // A brand-new account has no fitness to measure Form against. Calling that
  // "Building" keeps an empty history off both the injury warning and the
  // competition banner, and avoids dividing by zero.
  if (ctl <= 0) {
    return { status: 'Building', color: 'yellow', message: 'Normal training stress.' }
  }

  const ratio = form / ctl

  if (ratio < -0.25) {
    return { status: 'Overreaching', color: 'red', message: 'High injury risk. Rest required.' }
  }
  if (ratio < -0.125) {
    return { status: 'Heavy load', color: 'orange', message: 'Hard training block. Monitor closely.' }
  }
  if (ratio < 0) {
    return { status: 'Building', color: 'yellow', message: 'Normal training stress.' }
  }
  if (ratio <= 0.06) {
    return { status: 'Balanced', color: 'lightgreen', message: 'Sustainable. Maintaining fitness.' }
  }
  if (ratio <= 0.19) {
    return { status: 'Fresh', color: 'green', message: 'Good form. Ready to perform.' }
  }
  return { status: 'Peaked', color: 'brightgreen', message: 'Optimal for competition.' }
}
