import React from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  PressableProps,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends PressableProps {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  style,
  textStyle,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        styles[size],
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
      disabled={disabled || isLoading}
      {...rest}
    >
      {isLoading ? (
        <ActivityIndicator
          color={variant === 'primary' ? '#ffffff' : '#3b82f6'}
          size="small"
        />
      ) : (
        <>
          {leftIcon && <>{leftIcon}</>}
          <Text
            style={[
              styles.text,
              styles[`${variant}Text`],
              styles[`${size}Text`],
              textStyle,
            ]}
          >
            {title}
          </Text>
          {rightIcon && <>{rightIcon}</>}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    gap: 8,
  },
  text: {
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.5,
  },
  
  // Variants
  primary: {
    backgroundColor: '#3b82f6',
  },
  primaryText: {
    color: '#ffffff',
  },
  secondary: {
    backgroundColor: '#e0e7ff',
  },
  secondaryText: {
    color: '#3b82f6',
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  outlineText: {
    color: '#3b82f6',
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  ghostText: {
    color: '#3b82f6',
  },
  
  // Sizes
  sm: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  smText: {
    fontSize: 14,
  },
  md: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  mdText: {
    fontSize: 16,
  },
  lg: {
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  lgText: {
    fontSize: 18,
  },
});