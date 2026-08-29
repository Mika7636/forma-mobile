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

export function getFormStatus(form: number): FormStatus {
  if (form < -20) {
    return { status: 'Overreaching', color: 'red', message: 'High injury risk. Rest required.' }
  }
  if (form < -10) {
    return { status: 'Heavy load', color: 'orange', message: 'Hard training block. Monitor closely.' }
  }
  if (form < 0) {
    return { status: 'Building', color: 'yellow', message: 'Normal training stress.' }
  }
  if (form <= 5) {
    return { status: 'Balanced', color: 'lightgreen', message: 'Sustainable. Maintaining fitness.' }
  }
  if (form <= 15) {
    return { status: 'Fresh', color: 'green', message: 'Good form. Ready to perform.' }
  }
  return { status: 'Peaked', color: 'brightgreen', message: 'Optimal for competition.' }
}
