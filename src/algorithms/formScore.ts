// Form Score (CTL minus ATL) and its named status bands.

import type { FormTone } from '../theme/tokens'

export interface FormStatus {
  status: string
  color: FormTone
  message: string
}

export function calculateForm(ctl: number, atl: number): number {
  return ctl - atl
}

export function getFormStatus(form: number, ctl: number): FormStatus {
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
