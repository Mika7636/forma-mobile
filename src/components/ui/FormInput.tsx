import { forwardRef, useState } from 'react'
import {
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native'
import { COLORS } from '../../constants/theme'

interface FormInputProps extends TextInputProps {
  label: string
  /** When true, renders as a password field with a show/hide eye toggle. */
  password?: boolean
}

/**
 * Labelled text field with a subtle focus ring and, for passwords, an eye
 * toggle. Forwards its ref so screens can chain focus between inputs.
 */
const FormInput = forwardRef<TextInput, FormInputProps>(function FormInput(
  { label, password = false, style, ...props },
  ref,
) {
  const [focused, setFocused] = useState(false)
  const [hidden, setHidden] = useState(true)

  return (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: '600',
          color: COLORS.body,
          marginBottom: 6,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: COLORS.fieldBg,
          borderRadius: 12,
          borderWidth: 1.5,
          borderColor: focused ? COLORS.teal : COLORS.border,
          paddingHorizontal: 14,
        }}
      >
        <TextInput
          ref={ref}
          placeholderTextColor={COLORS.subtle}
          secureTextEntry={password && hidden}
          onFocus={(e) => {
            setFocused(true)
            props.onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            props.onBlur?.(e)
          }}
          style={[
            {
              flex: 1,
              height: 52,
              fontSize: 16,
              color: COLORS.ink,
            },
            style,
          ]}
          {...props}
        />
        {password ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={10}
            style={{ paddingLeft: 8, paddingVertical: 8 }}
          >
            <Text style={{ fontSize: 18 }}>{hidden ? '👁️' : '🙈'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
})

export default FormInput
