// Planner first-load placeholder month grid.

import { View } from 'react-native'
import { Skeleton } from '../ui/Skeleton'
import { SPACING } from '../../theme/tokens'
import { WEEKDAY_INITIALS } from '../../utils/dates'

const ROWS = 6
const CIRCLE = 34

export default function PlannerSkeleton() {
  return (
    <View>
      <View style={{ flexDirection: 'row', marginBottom: SPACING.sm }}>
        {WEEKDAY_INITIALS.map((_, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <Skeleton width={10} height={12} />
          </View>
        ))}
      </View>

      {Array.from({ length: ROWS }).map((_, row) => (
        <View key={row} style={{ flexDirection: 'row' }}>
          {WEEKDAY_INITIALS.map((_, col) => (
            <View
              key={col}
              style={{ flex: 1, alignItems: 'center', paddingTop: 6, paddingBottom: 4 }}
            >
              <Skeleton width={CIRCLE} height={CIRCLE} radius={CIRCLE / 2} />
              <View style={{ height: 6, marginTop: 4 }} />
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}
