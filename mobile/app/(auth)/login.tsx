import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth-context';
import { useBrandTheme } from '@/lib/branding';
import { biometrics } from '@/lib/auth';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const { colors, logo, clinic } = useBrandTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);

  useEffect(() => {
    async function checkBiometric() {
      const available = await biometrics.isAvailable();
      const enabled = await biometrics.isEnabled();
      setShowBiometricPrompt(available && enabled);
    }
    checkBiometric();
  }, []);

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setError(null);
    setIsSubmitting(true);

    const result = await signIn(email.trim(), password.trim());
    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error ?? 'Login failed. Please try again.');
    }
  }

  async function handleBiometricLogin() {
    const success = await biometrics.authenticate('Log in to ' + clinic.name);
    if (!success) {
      Alert.alert('Authentication Failed', 'Please use your email and password.');
    }
    // AuthProvider handles session restoration on biometric success
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <View className="flex-1 justify-center px-6">
          {/* Logo */}
          <View className="items-center mb-10">
            {logo.full ? (
              <Image
                source={{ uri: logo.full }}
                style={{ width: 200, height: 60 }}
                contentFit="contain"
              />
            ) : (
              <Text className="text-3xl font-bold" style={{ color: colors.primary }}>
                {clinic.name}
              </Text>
            )}
          </View>

          {/* Welcome Text */}
          <Text className="text-2xl font-bold text-gray-900 text-center mb-2">
            Welcome back
          </Text>
          <Text className="text-base text-gray-500 text-center mb-8">
            Sign in to your patient portal
          </Text>

          {/* Error Message */}
          {error && (
            <View className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
              <Text className="text-red-700 text-sm text-center">{error}</Text>
            </View>
          )}

          {/* Email Input */}
          <View className="mb-4">
            <Text className="text-sm font-medium text-gray-700 mb-1.5">Email</Text>
            <TextInput
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-base text-gray-900"
              placeholder="you@example.com"
              placeholderTextColor="#9CA3AF"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              editable={!isSubmitting}
            />
          </View>

          {/* Password Input */}
          <View className="mb-6">
            <Text className="text-sm font-medium text-gray-700 mb-1.5">Password</Text>
            <TextInput
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-base text-gray-900"
              placeholder="Enter your password"
              placeholderTextColor="#9CA3AF"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
              editable={!isSubmitting}
              onSubmitEditing={handleLogin}
            />
          </View>

          {/* Sign In Button */}
          <TouchableOpacity
            onPress={handleLogin}
            disabled={isSubmitting}
            className="rounded-xl py-4 items-center mb-4"
            style={{ backgroundColor: colors.primary, opacity: isSubmitting ? 0.7 : 1 }}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.primaryText} />
            ) : (
              <Text className="text-base font-semibold" style={{ color: colors.primaryText }}>
                Sign In
              </Text>
            )}
          </TouchableOpacity>

          {/* Biometric Login */}
          {showBiometricPrompt && (
            <TouchableOpacity
              onPress={handleBiometricLogin}
              className="rounded-xl py-4 items-center border border-gray-200"
            >
              <Text className="text-base font-medium" style={{ color: colors.primary }}>
                Use Face ID
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Footer */}
        <View className="px-6 pb-4">
          <Text className="text-xs text-gray-400 text-center">
            By signing in, you agree to our Terms of Service and Privacy Policy.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
