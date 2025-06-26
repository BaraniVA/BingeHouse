import React, { useState } from 'react';
import {
  TextInput,
  View,
  Text,
  StyleSheet,
  TextInputProps,
  StyleProp,
  ViewStyle,
  Pressable,
} from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  helper?: string;
  containerStyle?: StyleProp<ViewStyle>;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  isPassword?: boolean;
}

export function Input({
  label,
  error,
  helper,
  containerStyle,
  leftIcon,
  rightIcon,
  isPassword = false,
  ...rest
}: InputProps) {
  const [secureTextEntry, setSecureTextEntry] = useState(isPassword);

  const toggleSecureEntry = () => {
    setSecureTextEntry(!secureTextEntry);
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      
      <View style={[styles.inputContainer, error ? styles.errorInput : {}]}>
        {leftIcon && <View style={styles.iconContainer}>{leftIcon}</View>}
        
        <TextInput
          style={[
            styles.input,
            leftIcon ? styles.inputWithLeftIcon : {},
            rightIcon || isPassword ? styles.inputWithRightIcon : {},
          ]}
          placeholderTextColor="#64748b"
          secureTextEntry={secureTextEntry}
          {...rest}
        />
        
        {isPassword ? (
          <Pressable
            onPress={toggleSecureEntry}
            style={styles.iconContainer}
          >
            {secureTextEntry ? (
              <Eye size={20} color="#64748b" />
            ) : (
              <EyeOff size={20} color="#64748b" />
            )}
          </Pressable>
        ) : (
          rightIcon && <View style={styles.iconContainer}>{rightIcon}</View>
        )}
      </View>
      
      {(error || helper) && (
        <Text style={[styles.helper, error ? styles.error : {}]}>
          {error || helper}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '500',
    color: '#0f172a',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  errorInput: {
    borderColor: '#ef4444',
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#0f172a',
  },
  inputWithLeftIcon: {
    paddingLeft: 8,
  },
  inputWithRightIcon: {
    paddingRight: 8,
  },
  iconContainer: {
    paddingHorizontal: 12,
  },
  helper: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748b',
  },
  error: {
    color: '#ef4444',
  },
});